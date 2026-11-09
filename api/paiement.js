// Paiement d'un accompagnement par carte (Stripe), avec le même lien personnel que le contrat.
//
// GET  /api/paiement?t=JETON                      → montant, échéancier et état du paiement
// POST /api/paiement { t }                         → ouvre le paiement Stripe (Checkout) et renvoie son adresse
// GET  /api/paiement?t=JETON&session_id=cs_…       → retour de Stripe : enregistre le paiement dans Notion
// GET  /api/paiement?synchroniser=1                → appelé par n8n toutes les 15 min : met Notion à jour
//                                                    (nouveaux paiements, prélèvements suivants, incidents)
//
// Montant et nombre de versements : « Tarif appliqué » (tarif négocié sinon tarif de l'offre) et « Paiement en »
// de l'inscription, calculés par _echeancier.js comme dans le contrat.
// En 2 ou 3 fois : abonnement Stripe à durée limitée. La carte est enregistrée au 1er versement, Stripe prélève
// la suite tout seul, et l'abonnement s'arrête de lui-même après le dernier versement (date de fin posée ici).
// Seulement pour un financement personnel : entreprise et OPCO règlent sur devis.
import { contexte, notion, inscriptionParJeton, choix, nombre, texte, INSCRIPTIONS, SITE } from "./contrat.js";
import { decaler, eurosCentimes } from "./_echeancier.js";

// ---------- Stripe (API REST, sans dépendance) ----------
function encode(obj, prefix = "", out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") encode(value, name, out);
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return out.join("&");
}
async function stripe(method, path, params) {
  const url = `https://api.stripe.com/v1${path}`;
  const body = params ? encode(params) : undefined;
  const r = await fetch(method === "GET" && body ? `${url}?${body}` : url, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : body,
  });
  const data = await r.json();
  if (!r.ok) { const err = new Error(data?.error?.message || "Erreur Stripe"); err.status = r.status; throw err; }
  return data;
}

const jetonValide = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{30,64}$/.test(t);
const UN_JOUR = 86400;

/** Les dates prévues des versements, à partir d'aujourd'hui (ou du 1er paiement). */
function datesPrevues(e, depart = new Date()) {
  return e.montants.map((m, i) => ({ montant: eurosCentimes(m), date: decaler(depart, e.intervalle, i).toISOString().slice(0, 10) }));
}

/** Met Notion à jour pour un paiement Stripe : nombre de versements reçus et statut. */
async function enregistrer(insId, { ref, nb, payes, incident }) {
  const statut = payes >= nb ? "Payé" : incident ? "Incident" : payes > 0 ? "En cours" : "En attente";
  await notion(`pages/${insId}`, "PATCH", { properties: {
    "Statut paiement": { select: { name: statut } },
    "Versements reçus": { number: payes },
    "Paiement reçu": { checkbox: payes >= nb },
    "⚙ Paiement Stripe": { rich_text: [{ type: "text", text: { content: `${ref} · ${nb} fois` } }] },
  } });
  return statut;
}

/** Abonnement (2 ou 3 fois) : pose la date de fin après le dernier versement, compte les versements payés. */
async function suivreAbonnement(subId, nb) {
  const sub = await stripe("GET", `/subscriptions/${subId}`);
  const rec = sub.items?.data?.[0]?.price?.recurring;
  if (!sub.cancel_at && !["canceled", "incomplete_expired"].includes(sub.status) && rec) {
    // Dernier versement à l'échéance n° (nb - 1) ; l'abonnement s'arrête le lendemain, sans prorata
    const dernier = decaler(sub.billing_cycle_anchor * 1000, { interval: rec.interval, interval_count: rec.interval_count }, nb - 1);
    await stripe("POST", `/subscriptions/${subId}`, { cancel_at: Math.floor(dernier.getTime() / 1000) + UN_JOUR, proration_behavior: "none" });
  }
  const factures = await stripe("GET", "/invoices", { subscription: subId, limit: 10 });
  const payes = factures.data.filter((f) => f.status === "paid" && f.amount_paid > 0).length;
  const incident = ["past_due", "unpaid"].includes(sub.status) || factures.data.some((f) => f.status === "open" && f.attempt_count > 0);
  return { payes: Math.min(payes, nb), incident };
}

/** Une session Checkout terminée : enregistre le paiement dans Notion. */
async function suivreSession(session) {
  const insId = session.metadata?.inscription, nb = Number(session.metadata?.nb) || 1;
  if (!insId || session.status !== "complete") return null;
  if (session.mode === "payment") {
    return enregistrer(insId, { ref: session.payment_intent || session.id, nb: 1, payes: session.payment_status === "paid" ? 1 : 0, incident: false });
  }
  const suivi = await suivreAbonnement(session.subscription, nb);
  return enregistrer(insId, { ref: session.subscription, nb, ...suivi });
}

/** Toutes les 15 min : nouveaux paiements des 3 derniers jours, puis prélèvements des paiements en plusieurs fois. */
async function synchroniser() {
  const bilan = { sessions: 0, abonnements: 0, erreurs: [] };
  const depuis = Math.floor(Date.now() / 1000) - 3 * UN_JOUR;
  const sessions = await stripe("GET", "/checkout/sessions", { status: "complete", limit: 100, created: { gte: depuis } });
  for (const s of sessions.data.filter((x) => x.metadata?.source === "coaching")) {
    try { await suivreSession(s); bilan.sessions++; } catch (e) { bilan.erreurs.push(`${s.id} : ${e.message}`); }
  }
  const enCours = await notion(`databases/${INSCRIPTIONS}/query`, "POST", { page_size: 100, filter: { or: [
    { property: "Statut paiement", select: { equals: "En cours" } },
    { property: "Statut paiement", select: { equals: "Incident" } },
  ] } });
  for (const ins of enCours.results) {
    const m = /^(sub_\w+) · (\d) fois/.exec(texte(ins, "⚙ Paiement Stripe"));
    if (!m) continue;
    try { await enregistrer(ins.id, { ref: m[1], nb: Number(m[2]), ...(await suivreAbonnement(m[1], Number(m[2]))) }); bilan.abonnements++; }
    catch (e) { bilan.erreurs.push(`${ins.id} : ${e.message}`); }
  }
  return bilan;
}

/** Ce que la page de paiement affiche. */
function etat(ins, ctx) {
  const e = ctx.echeancier, statut = choix(ins, "Statut paiement");
  const base = { client: ctx.clientNom, programme: ctx.vars.programme, total: eurosCentimes(e.centimes), nb: e.nb, echeances: datesPrevues(e), versementsRecus: nombre(ins, "Versements reçus") || 0 };
  if (!ctx.enLigne) return { ...base, etat: "tiers" };
  if (statut === "Payé") return { ...base, etat: "paye" };
  if (statut === "En cours") return { ...base, etat: "en_cours" };
  if (statut === "Incident") return { ...base, etat: "incident" };
  return { ...base, etat: "a_payer" };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.NOTION_API_KEY || !process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "Configuration manquante" });
  try {
    if (req.method === "GET" && req.query.synchroniser) return res.status(200).json(await synchroniser());

    const t = req.method === "POST" ? (req.body || {}).t : req.query.t;
    if (!jetonValide(t)) return res.status(404).json({ error: "Lien invalide" });
    let ins = await inscriptionParJeton(t);
    if (!ins || choix(ins, "Statut") === "Abandonné") return res.status(404).json({ error: "Lien invalide" });

    if (req.method === "GET" && req.query.session_id) {
      // Retour de Stripe : la session doit appartenir à cette inscription
      const session = await stripe("GET", `/checkout/sessions/${encodeURIComponent(String(req.query.session_id))}`);
      if ((session.metadata?.inscription || "").replace(/-/g, "") !== ins.id.replace(/-/g, "")) return res.status(404).json({ error: "Paiement introuvable" });
      await suivreSession(session);
      ins = await notion(`pages/${ins.id}`);
    }

    const ctx = await contexte(ins);
    if (!ctx.echeancier.centimes) return res.status(409).json({ error: "Le montant n'est pas encore fixé : Laura finalise votre inscription." });

    if (req.method === "GET") return res.status(200).json(etat(ins, ctx));
    if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

    // ── Ouvrir le paiement ──
    const ce = etat(ins, ctx);
    if (ce.etat === "tiers") return res.status(409).json({ error: "Votre accompagnement est réglé par votre financeur, sur devis : pas de paiement en ligne." });
    if (ce.etat !== "a_payer") return res.status(409).json({ error: "Ce paiement est déjà enregistré.", etat: ce.etat });
    const e = ctx.echeancier, nom = `Accompagnement « ${ctx.vars.programme} »`;
    const meta = { source: "coaching", inscription: ins.id, nb: e.nb };
    const commun = {
      locale: "fr",
      customer_email: ctx.email || undefined,
      client_reference_id: ins.id.replace(/-/g, ""),
      metadata: meta,
      success_url: `${SITE}/paiement?t=${t}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/paiement?t=${t}`,
    };
    let params;
    if (e.nb === 1) {
      params = { ...commun, mode: "payment", line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: e.premier, product_data: { name: nom } } }], payment_intent_data: { description: nom, metadata: meta } };
    } else {
      const lignes = [{ quantity: 1, price_data: { currency: "eur", unit_amount: e.suivant, recurring: e.intervalle, product_data: { name: `${nom} · ${e.nb} versements` } } }];
      // Le 1er versement absorbe l'arrondi (ex. 2 000 € en 3 fois : 666,68 € puis 666,66 €)
      if (e.premier > e.suivant) lignes.push({ quantity: 1, price_data: { currency: "eur", unit_amount: e.premier - e.suivant, product_data: { name: "Arrondi du premier versement" } } });
      params = { ...commun, mode: "subscription", line_items: lignes, subscription_data: { description: `${nom} · ${e.nb} versements`, metadata: meta } };
    }
    const session = await stripe("POST", "/checkout/sessions", params);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("paiement", err);
    return res.status(500).json({ error: "Le paiement n'a pas pu être préparé. Réessayez dans un instant ou écrivez à contact@lauraballo.com." });
  }
}

export { synchroniser, suivreSession, suivreAbonnement };
