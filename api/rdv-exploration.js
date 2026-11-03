/**
 * ============================================
 * API Rendez-vous d'exploration — Calendly → CRM People (Notion)
 * Fichier : api/rdv-exploration.js
 * ============================================
 *
 * Le rendez-vous « echangecoaching » de Calendly redirige l'invité vers
 * /remerciements-rendez-vous avec les détails de la réservation dans l'adresse
 * (option Calendly « Pass event details to your redirected page »).
 * La page appelle cette API, qui enregistre le prospect dans CRM People :
 *   - nouvelle adresse e-mail → nouvelle fiche, Statut client « RDV d'exploration réservé »
 *   - adresse déjà connue     → la fiche existante est mise à jour, sans doublon
 *     (le statut n'est changé que si la personne n'est pas déjà en cours de parcours)
 * Dans les deux cas : « Prochaine relance » = date du rendez-vous,
 * et une note datée est ajoutée dans la page de la fiche.
 *
 * Variable d'environnement Vercel : NOTION_API_KEY (la même que /api/satisfaction)
 *
 * Route : POST /api/rdv-exploration
 *   corps JSON : invitee_uuid, invitee_email (obligatoires), invitee_first_name,
 *   invitee_last_name, invitee_full_name, event_type_name, event_start_time,
 *   event_end_time, utm_*, answer_1 … answer_5
 */

const CRM_DATABASE_ID = '127075e127d28112b16dde7180b01a42';
const NOTION_VERSION = '2022-06-28';
const STATUT_RDV = "RDV d'exploration réservé";

// Statuts qu'une nouvelle réservation peut remplacer. Les autres
// (Négociation, Inscription en cours, Client actif, Suivi post-accompagnement)
// sont laissés tels quels : la personne est déjà dans le parcours.
const STATUTS_REMPLACABLES = ['', 'Prospect', 'Perdu', 'abandon', 'RDV closing réservé', 'Ancien client', STATUT_RDV];

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

const clean = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const text = (content) => [{ type: 'text', text: { content: content.slice(0, 1900) } }];

async function notion(path, method, apiKey, body) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Notion ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function formatDateFr(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lauraballo.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_API_KEY) return res.status(500).json({ error: 'Clé API manquante' });

  const b = req.body || {};
  const email = clean(b.invitee_email, 200);
  const uuid = clean(b.invitee_uuid, 80);
  const start = clean(b.event_start_time, 40);

  // Garde-fous : on n'accepte que des réservations Calendly complètes
  if (!EMAIL_RE.test(email) || !/^[A-Za-z0-9-]{8,80}$/.test(uuid)) {
    return res.status(400).json({ error: 'Réservation incomplète' });
  }
  const startDate = start && !isNaN(new Date(start)) ? start : null;

  const fullName = clean(b.invitee_full_name, 120);
  const prenom = clean(b.invitee_first_name, 60) || (fullName ? fullName.split(' ')[0] : '');
  const nom = clean(b.invitee_last_name, 60) || (fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : '');
  const nomAffiche = fullName || [prenom, nom].filter(Boolean).join(' ') || email;

  // Note ajoutée dans la fiche
  const lignes = [
    `Rendez-vous d'exploration réservé sur Calendly${startDate ? ` pour le ${formatDateFr(startDate)}` : ''}.`,
  ];
  const typeRdv = clean(b.event_type_name, 120);
  if (typeRdv) lignes.push(`Type de rendez-vous : ${typeRdv}`);
  for (let i = 1; i <= 5; i++) {
    const r = clean(b[`answer_${i}`], 1000);
    if (r) lignes.push(`Réponse ${i} : ${r}`);
  }
  const utm = ['utm_source', 'utm_medium', 'utm_campaign'].map((k) => clean(b[k], 80)).filter(Boolean);
  if (utm.length) lignes.push(`Provenance : ${utm.join(' / ')}`);
  lignes.push(`Réf. Calendly : ${uuid}`);

  const noteBlocks = [
    {
      object: 'block',
      type: 'callout',
      callout: { rich_text: text(lignes.join('\n')), icon: { type: 'emoji', emoji: '📅' }, color: 'blue_background' },
    },
  ];

  try {
    // 1. La personne est-elle déjà dans le CRM ?
    const found = await notion(`databases/${CRM_DATABASE_ID}/query`, 'POST', NOTION_API_KEY, {
      filter: { property: 'Email', email: { equals: email } },
      page_size: 1,
    });
    const existante = found.results && found.results[0];

    if (existante) {
      const props = existante.properties || {};
      const statutActuel = (props['Statut client'] && props['Statut client'].select && props['Statut client'].select.name) || '';
      const relanceActuelle = props['Prochaine relance'] && props['Prochaine relance'].date && props['Prochaine relance'].date.start;

      // Même réservation déjà enregistrée : rien à faire
      if (startDate && relanceActuelle && new Date(relanceActuelle).getTime() === new Date(startDate).getTime()) {
        return res.status(200).json({ success: true, deja: true });
      }

      const maj = {};
      if (startDate) maj['Prochaine relance'] = { date: { start: startDate } };
      if (STATUTS_REMPLACABLES.includes(statutActuel)) maj['Statut client'] = { select: { name: STATUT_RDV } };
      if (Object.keys(maj).length) {
        await notion(`pages/${existante.id}`, 'PATCH', NOTION_API_KEY, { properties: maj });
      }
      await notion(`blocks/${existante.id}/children`, 'PATCH', NOTION_API_KEY, { children: noteBlocks });
      return res.status(200).json({ success: true, maj: true });
    }

    // 2. Nouvelle fiche
    const properties = {
      Person: { title: text(nomAffiche) },
      Email: { email },
      'Statut client': { select: { name: STATUT_RDV } },
    };
    if (prenom) properties['Prénom'] = { rich_text: text(prenom) };
    if (nom) properties['Nom famille'] = { rich_text: text(nom) };
    if (startDate) properties['Prochaine relance'] = { date: { start: startDate } };

    await notion('pages', 'POST', NOTION_API_KEY, {
      parent: { database_id: CRM_DATABASE_ID },
      properties,
      children: noteBlocks,
    });
    return res.status(200).json({ success: true, cree: true });
  } catch (err) {
    console.error('rdv-exploration:', err.status, err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
