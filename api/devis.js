// Demande de devis des fiches formation → Notion (template Qualiopi)
//
// 1. 🏢 Entreprises : retrouvée par son nom, sinon créée (statut Lead).
// 2. 👤 Contacts : retrouvé par son e-mail, sinon créé et rattaché à
//    l'entreprise ; contact principal si l'entreprise n'en avait pas.
// 3. 🤝 Opportunités commerciales : une opportunité « Identifié », reliée à
//    l'entreprise, au contact et aux formations demandées.
// Les fiches existantes ne sont jamais modifiées.
//
// GET /api/devis?check=1 vérifie seulement que la clé Notion accède aux bases.

const NOTION_VERSION = "2022-06-28";
const BASES = {
  opportunites: "60bac3f8f69d40f3bc311eeeb1bb4ff7",
  entreprises: "2fd075e127d2819f9fabd4820a69f7f8",
  contacts: "2fd075e127d2818595bed5d438136955",
  formations: "2fd075e127d2817c9efdf1339b79a765",
};
const SOURCE = "Site web / Inbound";

function notion(chemin, methode, corps) {
  return fetch(`https://api.notion.com/v1/${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: corps ? JSON.stringify(corps) : undefined,
  }).then(async (r) => {
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(`Notion ${r.status} ${json.code || ""} ${json.message || ""}`);
      err.status = r.status;
      throw err;
    }
    return json;
  });
}

const texte = (v, max = 200) => String(v ?? "").trim().slice(0, max);

// Notion limite chaque bloc de texte à 2000 caractères.
const richText = (s) => {
  const parts = [];
  for (let i = 0; i < s.length; i += 1900) parts.push({ text: { content: s.slice(i, i + 1900) } });
  return parts.length ? parts : [{ text: { content: "" } }];
};

const dateParis = (joursPlus = 0) =>
  new Date(Date.now() + joursPlus * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

async function premier(base, filtre) {
  const r = await notion(`databases/${base}/query`, "POST", { filter: filtre, page_size: 1 });
  return r.results?.[0] || null;
}

async function verifierAcces(res) {
  const etat = {};
  for (const [nom, id] of Object.entries(BASES)) {
    try {
      await notion(`databases/${id}`, "GET");
      etat[nom] = true;
    } catch (e) {
      etat[nom] = false;
    }
  }
  return res.status(200).json({ acces: etat });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://lauraballo.com");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!process.env.NOTION_API_KEY) return res.status(500).json({ error: "Clé API manquante" });
  if (req.method === "GET" && req.query?.check) return verifierAcces(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // Champ piège : un robot le remplit, un humain ne le voit pas.
  if (texte(b.site_web)) return res.status(200).json({ success: true });

  const d = {
    nom: texte(b.nom, 100),
    prenom: texte(b.prenom, 100),
    telephone: texte(b.telephone, 40),
    email: texte(b.email, 200).toLowerCase(),
    entreprise: texte(b.entreprise, 150),
    typeEntreprise: texte(b.type_entreprise, 50),
    fonction: texte(b.fonction, 100),
    nb: parseInt(b.nb_personnes, 10),
    message: texte(b.message, 3000),
    page: texte(b.page, 200),
    formations: (Array.isArray(b.formations) ? b.formations : [])
      .slice(0, 20)
      .map((f) => ({ nom: texte(f?.nom, 200), code: texte(f?.code, 30) }))
      .filter((f) => f.nom),
  };

  const manquants = ["nom", "prenom", "telephone", "email", "entreprise", "fonction"].filter((k) => !d[k]);
  if (manquants.length || !d.formations.length) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return res.status(400).json({ error: "E-mail invalide" });
  if (!Number.isFinite(d.nb) || d.nb < 1 || d.nb > 1000) d.nb = null;

  try {
    // 1. Entreprise
    let entreprise = await premier(BASES.entreprises, { property: "Nom", title: { equals: d.entreprise } });
    let entrepriseCreee = false;
    if (!entreprise) {
      entreprise = await notion("pages", "POST", {
        parent: { database_id: BASES.entreprises },
        properties: {
          Nom: { title: richText(d.entreprise) },
          Type: { select: { name: "Entreprise" } },
          Statut: { select: { name: "Lead" } },
          Source: { select: { name: SOURCE } },
          "Notes internes": {
            rich_text: richText(
              `Créée depuis une demande de devis du site le ${dateParis()}.` +
                (d.typeEntreprise ? ` Taille indiquée : ${d.typeEntreprise}.` : "")
            ),
          },
        },
      });
      entrepriseCreee = true;
    }
    const contactsExistants = entreprise.properties?.Contact?.relation || [];

    // 2. Contact
    let contact = await premier(BASES.contacts, { property: "Email", email: { equals: d.email } });
    if (!contact) {
      contact = await notion("pages", "POST", {
        parent: { database_id: BASES.contacts },
        properties: {
          Nom: { title: richText(d.nom) },
          Prénom: { rich_text: richText(d.prenom) },
          Email: { email: d.email },
          Téléphone: { phone_number: d.telephone },
          Fonction: { rich_text: richText(d.fonction) },
          Source: { select: { name: SOURCE } },
          "Statut du contact": { select: { name: "Non contacté" } },
          "Contact principal": { checkbox: entrepriseCreee || contactsExistants.length === 0 },
          Entreprise: { relation: [{ id: entreprise.id }] },
        },
      });
    }

    // 3. Formations demandées (par code Notion)
    const codes = [...new Set(d.formations.map((f) => f.code).filter(Boolean))];
    let formationsIds = [];
    if (codes.length) {
      const r = await notion(`databases/${BASES.formations}/query`, "POST", {
        filter: { or: codes.map((c) => ({ property: "Code formation", rich_text: { equals: c } })) },
        page_size: 20,
      });
      formationsIds = r.results.map((p) => ({ id: p.id }));
    }

    // 4. Opportunité
    const intitules = d.formations.map((f) => f.nom);
    const notes = [
      `Demande de devis envoyée depuis lauraballo.com${d.page} le ${dateParis()}.`,
      `Contact : ${d.prenom} ${d.nom} — ${d.fonction} — ${d.email} — ${d.telephone}`,
      d.typeEntreprise ? `Taille de l'entreprise : ${d.typeEntreprise}` : "",
      `Formation(s) : ${intitules.join(" ; ")}`,
      d.nb ? `Nombre de personnes : ${d.nb}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const proprietes = {
      "Nom de l opportunité": {
        title: richText(`${d.entreprise} — ${intitules.join(" + ")}`.slice(0, 200)),
      },
      Stade: { select: { name: "Identifié" } },
      Source: { select: { name: SOURCE } },
      Entreprise: { relation: [{ id: entreprise.id }] },
      Contact: { relation: [{ id: contact.id }] },
      "Prochaine action": { rich_text: richText("Rappeler : réponse promise sous 48 h sur le site") },
      "Date prochaine action": { date: { start: dateParis(2) } },
      Notes: { rich_text: richText(notes) },
    };
    if (formationsIds.length) proprietes["Formation envisagée"] = { relation: formationsIds };
    if (d.nb) proprietes["Nb participants estimé"] = { number: d.nb };
    // « Nous en dire plus sur votre besoin » : première trace de l'analyse du besoin (ind. 4)
    if (d.message) proprietes["Besoin de formation (site internet)"] = { rich_text: richText(d.message) };

    await notion("pages", "POST", { parent: { database_id: BASES.opportunites }, properties: proprietes });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("devis:", err.message);
    return res.status(502).json({ error: "Enregistrement impossible" });
  }
}
