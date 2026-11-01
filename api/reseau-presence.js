/**
 * ============================================
 * API Réseau Présence — inscription par paliers (Stripe)
 * Fichier : api/reseau-presence.js
 * ============================================
 *
 * Tarif normal : 90 €/mois, 14 jours d'essai gratuit.
 * Places fondatrices, par paliers de 10 :
 *   places  1-10 → 30 €/mois pendant 6 mois, puis 90 €
 *   places 11-20 → 40 €/mois pendant 6 mois, puis 90 €
 *   places 21-30 → 50 €/mois pendant 6 mois, puis 90 €
 *   places 31-40 → 60 €/mois pendant 6 mois, puis 90 €
 *   places 41-50 → 70 €/mois pendant 6 mois, puis 90 €
 *   places 51-60 → 80 €/mois pendant 6 mois, puis 90 €
 *   ensuite      → 90 €/mois
 *
 * Chaque palier est un coupon Stripe « 6 mois », limité à 10 utilisations.
 * Stripe compte lui-même les places et repasse l'abonnement à 90 €
 * au 7e mois, sans action du membre.
 * Le prix et les coupons sont créés automatiquement au premier appel
 * (en mode test comme en mode réel, selon la clé utilisée).
 *
 * Variables d'environnement Vercel :
 *   STRIPE_SECRET_KEY       (sk_test_… ou sk_live_…)
 *   STRIPE_PUBLISHABLE_KEY  (pk_test_… ou pk_live_…)
 *
 * Routes :
 *   GET  /api/reseau-presence                 → palier en cours + places restantes
 *   GET  /api/reseau-presence?session_id=…    → statut d'une inscription (page de retour)
 *   POST /api/reseau-presence                 → crée le paiement intégré (client secret)
 *        corps JSON facultatif : { "returnUrl": "https://…page de vente…" }
 *
 * Intégration sur une page de vente : voir assets/js/reseau-presence-embed.js
 */

const FULL_PRICE = 90;          // €/mois
const TRIAL_DAYS = 14;
const PLACES_PER_TIER = 10;
const DISCOUNT_MONTHS = 6;
const TIER_PRICES = [30, 40, 50, 60, 70, 80];

const PRICE_LOOKUP_KEY = 'reseau_presence_mensuel_90';
const PRODUCT_NAME = 'Réseau Présence';
const PAGE_PATH = '/reseau-presence';

const TIERS = TIER_PRICES.map((price, i) => ({
  id: `reseau-presence-palier-${price}`,
  price,
  amountOff: (FULL_PRICE - price) * 100,
  firstPlace: i * PLACES_PER_TIER + 1,
  lastPlace: (i + 1) * PLACES_PER_TIER,
}));

// ─────────────────────────────────────────
// Appels Stripe (API REST, sans dépendance)
// ─────────────────────────────────────────
function encode(obj, prefix = '', out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') encode(value, name, out);
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return out.join('&');
}

async function stripe(method, path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  const url = `https://api.stripe.com/v1${path}`;
  const body = params ? encode(params) : undefined;
  const response = await fetch(method === 'GET' && body ? `${url}?${body}` : url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : body,
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error?.message || 'Erreur Stripe');
    err.status = response.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

// ─────────────────────────────────────────
// Prix et coupons (créés s'ils n'existent pas)
// ─────────────────────────────────────────
async function getOrCreatePrice() {
  const found = await stripe('GET', '/prices', { lookup_keys: [PRICE_LOOKUP_KEY], active: true });
  if (found.data.length) return found.data[0].id;

  const product = await stripe('POST', '/products', {
    name: PRODUCT_NAME,
    description: 'Abonnement mensuel au Réseau Présence — Laura Ballo',
  });
  try {
    const price = await stripe('POST', '/prices', {
      product: product.id,
      currency: 'eur',
      unit_amount: FULL_PRICE * 100,
      recurring: { interval: 'month' },
      lookup_key: PRICE_LOOKUP_KEY,
      nickname: `${FULL_PRICE} €/mois`,
    });
    return price.id;
  } catch (err) {
    // Prix créé entre-temps par un autre appel : on reprend celui-là
    const again = await stripe('GET', '/prices', { lookup_keys: [PRICE_LOOKUP_KEY], active: true });
    if (again.data.length) {
      await stripe('POST', `/products/${product.id}`, { active: false }).catch(() => {});
      return again.data[0].id;
    }
    throw err;
  }
}

async function getOrCreateCoupon(tier) {
  try {
    return await stripe('GET', `/coupons/${tier.id}`);
  } catch (err) {
    if (err.status !== 404) throw err;
    try {
      return await stripe('POST', '/coupons', {
        id: tier.id,
        name: `Places ${tier.firstPlace}-${tier.lastPlace} : ${tier.price} €/mois pendant ${DISCOUNT_MONTHS} mois`,
        amount_off: tier.amountOff,
        currency: 'eur',
        duration: 'repeating',
        duration_in_months: DISCOUNT_MONTHS,
        max_redemptions: PLACES_PER_TIER,
      });
    } catch (createErr) {
      // Deux visiteurs au même instant : le coupon vient d'être créé par l'autre appel
      if (createErr.code === 'resource_already_exists') return stripe('GET', `/coupons/${tier.id}`);
      throw createErr;
    }
  }
}

// Premier palier encore ouvert, ou null si toutes les places fondatrices sont prises
async function currentTier() {
  const coupons = await Promise.all(TIERS.map(getOrCreateCoupon));
  const tiers = TIERS.map((tier, i) => {
    const coupon = coupons[i];
    const taken = coupon.times_redeemed || 0;
    return { ...tier, remaining: coupon.valid ? Math.max(0, PLACES_PER_TIER - taken) : 0 };
  });
  return { open: tiers.find(t => t.remaining > 0) || null, tiers };
}

function publicTier(t) {
  return { price: t.price, firstPlace: t.firstPlace, lastPlace: t.lastPlace, remaining: t.remaining };
}

function siteOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

// Adresse de retour après paiement : la page de vente qui intègre le formulaire,
// sinon la page d'inscription du site.
function returnUrl(req) {
  let base = `${siteOrigin(req)}${PAGE_PATH}`;
  const asked = req.body && typeof req.body === 'object' ? req.body.returnUrl : null;
  if (typeof asked === 'string' && asked.length < 1000) {
    try {
      const u = new URL(asked);
      if (u.protocol === 'https:' || u.hostname === 'localhost') {
        u.searchParams.delete('session_id');
        u.hash = '';
        base = u.href;
      }
    } catch (_) { /* adresse invalide : on garde la page du site */ }
  }
  return `${base}${base.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;
}

// ─────────────────────────────────────────
// Handler
// ─────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Le formulaire peut être intégré sur une page de vente hébergée ailleurs
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: 'Configuration Stripe manquante' });
  }

  try {
    // Page de retour après paiement
    if (req.method === 'GET' && req.query.session_id) {
      const id = String(req.query.session_id);
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'Session invalide' });
      const session = await stripe('GET', `/checkout/sessions/${id}`);
      return res.status(200).json({
        status: session.status,
        email: session.customer_details?.email || null,
      });
    }

    // Palier en cours
    if (req.method === 'GET') {
      const { open, tiers } = await currentTier();
      return res.status(200).json({
        fullPrice: FULL_PRICE,
        trialDays: TRIAL_DAYS,
        discountMonths: DISCOUNT_MONTHS,
        current: open ? publicTier(open) : null,
        tiers: tiers.map(publicTier),
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      });
    }

    // Création du paiement intégré
    if (req.method === 'POST') {
      const [priceId, { open }] = await Promise.all([getOrCreatePrice(), currentTier()]);

      const params = {
        ui_mode: 'embedded',
        mode: 'subscription',
        locale: 'fr',
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: TRIAL_DAYS,
          metadata: { offre: 'reseau-presence', palier: open ? String(open.price) : String(FULL_PRICE) },
        },
        billing_address_collection: 'auto',
        payment_method_collection: 'always',
        return_url: returnUrl(req),
        metadata: { offre: 'reseau-presence' },
      };
      if (open) params.discounts = [{ coupon: open.id }];

      const session = await stripe('POST', '/checkout/sessions', params);
      return res.status(200).json({
        clientSecret: session.client_secret,
        current: open ? publicTier(open) : null,
      });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) {
    console.error('reseau-presence:', err.message);
    return res.status(500).json({ error: "L'inscription est momentanément indisponible. Réessayez dans quelques minutes." });
  }
}
