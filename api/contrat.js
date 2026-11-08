// Contrat de coaching : généré depuis Notion, signé en ligne par un lien personnel, rendu en PDF.
//
// POST /api/contrat { action: "preparer", inscriptionId }
//   Appelé par n8n quand « Programme validé le » est daté dans l'inscription.
//   Crée le jeton personnel et écrit « Lien contrat » dans l'inscription. Ne renvoie jamais le jeton.
// GET  /api/contrat?t=JETON          → le contrat à lire (JSON)
// GET  /api/contrat?t=JETON&pdf=1    → le contrat signé (PDF)
// POST /api/contrat { action: "signer", t, empreinte, mention, signature, paraphe, adresse?, signataire? }
//
// Le texte vient de la fiche « Contrat · Contrat de coaching » (base Modèles documents et mails) :
// les {{variables}} sont remplies depuis l'inscription, l'offre, la fiche CRM et l'entreprise ;
// les lignes [[SI particulier]] / [[SI entreprise]] … [[FIN]] ne gardent que le cas du client ; les encadrés sont des notes internes.
// La signature de Laura est le fichier SVG du champ « Fichier » de cette fiche (hors du dépôt public).
import crypto from "node:crypto";
import { PdfDoc, widthOf } from "./_pdf.js";

const NOTION_VERSION = "2022-06-28";
const MODELE = "40d075e127d28129b397fe147f0f2ce0";
const INSCRIPTIONS = "0528c1446e5e4a0c8a3db053e6645c23";
const SITE = "https://lauraballo.com";
const ENTREPRISE = ["Financement entreprise", "OPCO"];

// ---------- Notion ----------
async function notion(chemin, methode = "GET", corps) {
  const r = await fetch(`https://api.notion.com/v1/${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${process.env.NOTION_API_KEY}`, "Content-Type": "application/json", "Notion-Version": NOTION_VERSION },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`Notion ${r.status} ${json.code || ""} ${json.message || ""}`.trim());
    err.status = r.status;
    throw err;
  }
  return json;
}

const txt = (rt) => (rt || []).map((t) => t.plain_text || "").join("");
const prop = (p, nom) => (p && p.properties ? p.properties[nom] : undefined);
const texte = (p, nom) => { const v = prop(p, nom); if (!v) return ""; return txt(v.title || v.rich_text).trim(); };
const nombre = (p, nom) => { const v = prop(p, nom); if (!v) return null; if (v.type === "number") return v.number; if (v.type === "formula") return v.formula && typeof v.formula.number === "number" ? v.formula.number : null; return null; };
const choix = (p, nom) => { const v = prop(p, nom); return v && v.select ? v.select.name : ""; };
const liens = (p, nom) => { const v = prop(p, nom); return v && v.relation ? v.relation.map((r) => r.id) : []; };

async function inscriptionParJeton(jeton) {
  const r = await notion(`databases/${INSCRIPTIONS}/query`, "POST", { page_size: 2, filter: { property: "⚙ Contrat jeton", rich_text: { equals: jeton } } });
  return r.results.length === 1 ? r.results[0] : null;
}

async function blocs(id) {
  const out = [];
  let curseur;
  do {
    const r = await notion(`blocks/${id}/children?page_size=100${curseur ? `&start_cursor=${curseur}` : ""}`);
    out.push(...r.results);
    curseur = r.has_more ? r.next_cursor : null;
  } while (curseur);
  return out;
}

// ---------- Contenu du contrat ----------
const euros = (x) => {
  const arrondi = Math.round(x * 100) / 100;
  return arrondi.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(arrondi) ? 0 : 2, maximumFractionDigits: 2 }).replace(/[  ]/g, " ");
};

function modalites(nb, tarif) {
  const v = euros(tarif / nb);
  if (nb === 2) return { phrase: `Ce montant est réglé en deux versements de ${v} euros : avant le démarrage de la prestation, puis à mi-parcours.`, versement: v };
  if (nb === 3) return { phrase: `Ce montant est réglé en trois versements mensuels de ${v} euros, le premier avant le démarrage de la prestation.`, versement: v };
  return { phrase: "Ce montant est réglé en une seule fois avant le démarrage de la prestation.", versement: euros(tarif) };
}

/** Tout ce que le contrat reprend de Notion, pour une inscription. */
async function contexte(ins) {
  const [clientId] = liens(ins, "Client");
  const [offreId] = liens(ins, "Programme");
  const [entrepriseId] = liens(ins, "Entreprise");
  const [client, offre, entreprise, modele] = await Promise.all([
    clientId ? notion(`pages/${clientId}`) : null,
    offreId ? notion(`pages/${offreId}`) : null,
    entrepriseId ? notion(`pages/${entrepriseId}`).catch(() => null) : null,
    notion(`pages/${MODELE}`),
  ]);
  const prenom = texte(client, "Prénom"), nom = texte(client, "Nom famille");
  const clientNom = [prenom, nom].filter(Boolean).join(" ") || texte(client, "Person") || texte(ins, "Titre");
  const estEntreprise = ENTREPRISE.includes(choix(ins, "Financeur"));
  const tarif = nombre(ins, "Tarif appliqué") || 0;
  const nb = parseInt(choix(ins, "Paiement en"), 10) || 1;
  const m = modalites(nb, tarif);
  const siretIns = nombre(ins, "SIRET");
  const adresseEnt = texte(ins, "Adresse entreprise") || [texte(entreprise, "Adresse"), [texte(entreprise, "Code postal"), texte(entreprise, "Ville")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const vars = {
    programme: texte(offre, "Titre") || texte(offre, "Nav") || texte(ins, "Titre"),
    objectif: texte(ins, "Objectif").replace(/[.\s]+$/, ""),
    client_nom: clientNom,
    entreprise_denomination: texte(ins, "Dénomination sociale") || texte(entreprise, "Nom"),
    entreprise_siret: siretIns ? String(siretIns) : texte(entreprise, "SIRET"),
    entreprise_siege: adresseEnt,
    seances: String(nombre(ins, "Séances prévues") || ""),
    tarif: euros(tarif),
    modalites_paiement: m.phrase,
    versement: m.versement,
  };
  const manque = [];
  if (!vars.programme) manque.push("l'offre (champ Programme)");
  if (!tarif) manque.push("le tarif");
  if (!vars.seances) manque.push("le nombre de séances");
  if (!vars.objectif) manque.push("l'objectif");
  if (estEntreprise && !vars.entreprise_denomination) manque.push("l'entreprise");
  const fichiers = (prop(modele, "Fichier") && prop(modele, "Fichier").files) || [];
  const svg = fichiers.find((f) => /\.svg$/i.test(f.name || ""));
  return { vars, estEntreprise, clientNom, email: (prop(client, "Email") && prop(client, "Email").email) || "", manque, signatureCoach: svg ? (svg.file ? svg.file.url : svg.external.url) : "" };
}

/** Les paragraphes du modèle, conditions appliquées, variables remplacées. */
async function rendre(ctx, extra = {}) {
  const vars = { ...ctx.vars, ...extra };
  const conditions = { particulier: !ctx.estEntreprise, entreprise: ctx.estEntreprise };
  const remplir = (s) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : "…")).replace(/\[\[[^\]]*\]\]/g, "").replace(/ {2,}/g, " ");
  const items = [];
  const pile = [];
  let numero = 0;
  for (const b of await blocs(MODELE)) {
    const type = b.type;
    if (!["paragraph", "heading_1", "heading_2", "heading_3", "numbered_list_item", "bulleted_list_item"].includes(type)) { numero = 0; continue; }
    if (type !== "numbered_list_item") numero = 0; else numero++;
    // Une ligne par retour à la ligne, en gardant le gras de chaque morceau
    const lignes = [[]];
    for (const t of b[type].rich_text || []) {
      const parts = (t.plain_text || "").split("\n");
      parts.forEach((p, i) => { if (i > 0) lignes.push([]); if (p) lignes[lignes.length - 1].push({ text: p, bold: !!(t.annotations && t.annotations.bold) }); });
    }
    lignes.forEach((runs, i) => {
      const brut = runs.map((r) => r.text).join("").trim();
      const si = /^\[\[SI\s+([\wéè-]+)\]\]$/i.exec(brut);
      if (si) { pile.push(conditions[si[1].toLowerCase()] === true); return; }
      if (/^\[\[FIN\]\]$/i.test(brut)) { pile.pop(); return; }
      if (pile.some((c) => !c)) return;
      const r2 = runs.map((r) => ({ ...r, text: remplir(r.text) })).filter((r) => r.text);
      if (!r2.length || !r2.map((r) => r.text).join("").trim()) return;
      const kind = type === "heading_1" ? "h1" : type.startsWith("heading") ? "h2" : type === "numbered_list_item" && i === 0 ? "li" : type === "bulleted_list_item" && i === 0 ? "bullet" : "p";
      const item = { kind, runs: r2 };
      if (kind === "li") item.num = numero;
      if (type.endsWith("list_item") && i > 0) item.indent = true;
      items.push(item);
    });
  }
  return items;
}

const empreinte = (items) => crypto.createHash("sha256").update(JSON.stringify(items)).digest("hex");

// ---------- PDF ----------
function svgRects(svg) {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const rects = [];
  const re = /M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+z/g;
  let m;
  while ((m = re.exec(svg))) rects.push([+m[1], +m[2], +m[3], +m[4]]);
  return { w: vb ? +vb[1] : 1, h: vb ? +vb[2] : 1, rects };
}

function jpegDepuisDataUrl(d) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(d || "");
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  return buf.length > 1000 && buf.length < 1.5e6 && buf[0] === 0xff && buf[1] === 0xd8 ? buf : null;
}

function fabriquerPdf({ items, ctx, signature, paraphe, mention, preuve, coach }) {
  const doc = new PdfDoc();
  doc.addJpeg("Sig", signature);
  doc.addJpeg("Par", paraphe);
  const W = doc.width, H = doc.height, G = 62, D = W - 62, LARGEUR = D - G, HAUT = H - 64, BAS = 96;
  const pages = [];
  let page, y;
  const nouvelle = () => { page = doc.addPage(); pages.push(page); y = HAUT; };
  nouvelle();

  const ecrire = (runs, { size = 10, lead = 14.2, gauche = G, retrait = 0, puce = "" } = {}) => {
    // Découpe en mots, chacun avec sa police
    const mots = [];
    for (const r of runs) for (const [i, w] of r.text.split(" ").entries()) {
      if (i > 0) mots.push({ space: true, font: r.bold ? "F2" : "F1" });
      if (w) mots.push({ text: w, font: r.bold ? "F2" : "F1" });
    }
    const lignes = [];
    let ligne = [], largeur = 0;
    const max = LARGEUR - (gauche - G) - retrait;
    for (const m of mots) {
      if (m.space) { if (ligne.length) { ligne.push(m); largeur += widthOf(" ", m.font, size); } continue; }
      const w = widthOf(m.text, m.font, size);
      if (largeur + w > max && ligne.length) {
        while (ligne.length && ligne[ligne.length - 1].space) ligne.pop();
        lignes.push(ligne); ligne = []; largeur = 0;
      }
      ligne.push(m); largeur += w;
    }
    if (ligne.length) lignes.push(ligne);
    lignes.forEach((l, i) => {
      if (y - lead < BAS) nouvelle();
      y -= lead;
      if (i === 0 && puce) page.text(puce, gauche, y, { font: "F1", size });
      let x = gauche + retrait;
      for (const m of l) {
        if (m.space) { x += widthOf(" ", m.font, size); continue; }
        page.text(m.text, x, y, { font: m.font, size });
        x += widthOf(m.text, m.font, size);
      }
    });
  };

  for (const it of items) {
    if (it.kind === "h1") { y -= 6; ecrire(it.runs.map((r) => ({ ...r, bold: true })), { size: 15, lead: 20 }); y -= 10; }
    else if (it.kind === "h2") { if (y - 40 < BAS) nouvelle(); y -= 10; ecrire(it.runs.map((r) => ({ ...r, bold: true })), { size: 11, lead: 15 }); y -= 2; }
    else if (it.kind === "li") { y -= 3; ecrire(it.runs, { gauche: G, retrait: 16, puce: `${it.num})` }); }
    else if (it.kind === "bullet") { y -= 3; ecrire(it.runs, { gauche: G, retrait: 16, puce: "•" }); }
    else { y -= it.indent ? 1 : 4; ecrire(it.runs, { gauche: G, retrait: it.indent ? 16 : 0 }); }
  }

  // Bloc des signatures
  if (y - 190 < BAS) nouvelle();
  y -= 30;
  const colonne = (x, titre, nom, mentionTxt) => {
    page.text(titre, x, y, { font: "F2", size: 10 });
    page.text(nom, x, y - 15, { size: 10 });
    page.text(`« ${mentionTxt} »`, x, y - 30, { size: 10, color: [0.3, 0.3, 0.3] });
  };
  colonne(G, "LE CLIENT", ctx.estEntreprise && preuve.signataire ? preuve.signataire : ctx.clientNom, mention);
  colonne(G + LARGEUR / 2 + 10, "LE COACH", "Laura BALLO", "Lu et approuvé");
  page.image("Sig", G, y - 140, 170, 95);
  if (coach) page.rects(coach.rects, coach.w, coach.h, G + LARGEUR / 2 + 10, y - 140, 150, 95);
  y -= 160;

  // Page de preuve
  nouvelle();
  y -= 4;
  ecrire([{ text: "Certificat de signature électronique", bold: true }], { size: 15, lead: 20 });
  y -= 12;
  const lignesPreuve = [
    ["Document", `Contrat de coaching · ${ctx.vars.programme}`],
    ["Signataire", preuve.signataire ? `${preuve.signataire}, pour le compte de ${ctx.vars.entreprise_denomination}, au bénéfice de ${ctx.clientNom}` : ctx.clientNom],
    ["Adresse e-mail du client", ctx.email || "non renseignée"],
    ["Date et heure de signature", `${preuve.dateLocale} (heure de Paris) · ${preuve.dateIso} UTC`],
    ["Adresse IP", preuve.ip || "inconnue"],
    ["Navigateur", preuve.ua || "inconnu"],
    ["Accès", "lien personnel et individuel envoyé au client par Laura Ballo"],
    ["Mention manuscrite saisie", `« ${mention} »`],
    ["Paraphe", `apposé par le client et reproduit sur chacune des ${pages.length - 1} pages du contrat`],
    ["Signature du coach", "Laura BALLO, signature enregistrée apposée à l'émission du contrat"],
    ["Empreinte SHA-256 du texte signé", preuve.empreinte],
    ["Référence", `inscription ${preuve.inscription}`],
  ];
  for (const [k, v] of lignesPreuve) {
    y -= 6;
    ecrire([{ text: k, bold: true }], { size: 9.5, lead: 13 });
    ecrire([{ text: v, bold: false }], { size: 9.5, lead: 13 });
  }

  // Pied de page : paraphe sur chaque page du contrat, numérotation
  const total = pages.length;
  pages.forEach((p, i) => {
    p.line(G, 78, D, 78);
    p.text(`Contrat de coaching · ${ctx.clientNom}`, G, 62, { size: 8, color: [0.45, 0.42, 0.4] });
    p.text(`Page ${i + 1} / ${total}`, G, 50, { size: 8, color: [0.45, 0.42, 0.4] });
    if (i < total - 1) {
      p.text("Paraphe du client", D - 120, 62, { size: 8, color: [0.45, 0.42, 0.4] });
      p.image("Par", D - 50, 36, 50, 34);
    }
  });
  return doc.render({ title: `Contrat de coaching · ${ctx.clientNom}`, author: "Laura Ballo" });
}

// ---------- Envoi du PDF dans Notion ----------
async function deposerPdf(pageId, pdf, nomFichier, champs) {
  const up = await notion("file_uploads", "POST", { filename: nomFichier, content_type: "application/pdf" });
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), nomFichier);
  const r = await fetch(`https://api.notion.com/v1/file_uploads/${up.id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NOTION_API_KEY}`, "Notion-Version": NOTION_VERSION },
    body: form,
  });
  if (!r.ok) throw new Error(`Envoi du PDF refusé par Notion (${r.status})`);
  await notion(`pages/${pageId}`, "PATCH", {
    properties: {
      "Contrat (PDF)": { files: [{ type: "file_upload", file_upload: { id: up.id }, name: nomFichier }] },
      ...champs,
    },
  });
}

// ---------- Point d'entrée ----------
const jetonValide = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{30,64}$/.test(t);
const signe = (ins) => { const v = prop(ins, "Contrat signé"); return !!(v && v.checkbox); };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.NOTION_API_KEY) return res.status(500).json({ error: "Configuration manquante" });
  try {
    if (req.method === "GET") {
      const t = req.query.t;
      if (!jetonValide(t)) return res.status(404).json({ error: "Lien invalide" });
      const ins = await inscriptionParJeton(t);
      if (!ins || choix(ins, "Statut") === "Abandonné") return res.status(404).json({ error: "Lien invalide" });

      if (req.query.pdf) {
        const f = ((prop(ins, "Contrat (PDF)") || {}).files || [])[0];
        if (!signe(ins) || !f) return res.status(404).json({ error: "Contrat pas encore signé" });
        const r = await fetch(f.file ? f.file.url : f.external.url);
        if (!r.ok) return res.status(502).json({ error: "PDF introuvable" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${(f.name || "Contrat.pdf").replace(/[^\w.\- ]+/g, "_")}"`);
        return res.status(200).send(Buffer.from(await r.arrayBuffer()));
      }

      const ctx = await contexte(ins);
      if (signe(ins)) return res.status(200).json({ etat: "signe", client: ctx.clientNom, programme: ctx.vars.programme, signeLe: (prop(ins, "Contrat signé le") || {}).date?.start || null });
      if (ctx.manque.length) return res.status(409).json({ error: "Le contrat n'est pas encore prêt : Laura le finalise. Réessayez un peu plus tard.", manque: ctx.manque });
      const items = await rendre(ctx, { client_adresse: "(à compléter ci-dessous)", representant: "(à compléter ci-dessous)", date_signature: "(à la signature)" });
      return res.status(200).json({ etat: "a_signer", client: ctx.clientNom, programme: ctx.vars.programme, entreprise: ctx.estEntreprise ? ctx.vars.entreprise_denomination : "", items, empreinte: empreinte(items) });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
    const body = req.body || {};

    if (body.action === "preparer") {
      const id = String(body.inscriptionId || "").replace(/-/g, "");
      if (!/^[0-9a-f]{32}$/i.test(id)) return res.status(400).json({ error: "Inscription invalide" });
      const ins = await notion(`pages/${id}`);
      if ((ins.parent && String(ins.parent.database_id || "").replace(/-/g, "")) !== INSCRIPTIONS) return res.status(400).json({ error: "Inscription invalide" });
      if (!(prop(ins, "Programme validé le") || {}).date) return res.status(409).json({ error: "Programme pas encore validé" });
      if (texte(ins, "⚙ Contrat jeton")) return res.status(200).json({ ok: true, deja: true });
      const jeton = crypto.randomBytes(24).toString("base64url");
      await notion(`pages/${id}`, "PATCH", { properties: {
        "⚙ Contrat jeton": { rich_text: [{ type: "text", text: { content: jeton } }] },
        "Lien contrat": { url: `${SITE}/contrat?t=${jeton}` },
      } });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "signer") {
      if (!jetonValide(body.t)) return res.status(404).json({ error: "Lien invalide" });
      const ins = await inscriptionParJeton(body.t);
      if (!ins || choix(ins, "Statut") === "Abandonné") return res.status(404).json({ error: "Lien invalide" });
      if (signe(ins)) return res.status(409).json({ error: "Ce contrat est déjà signé." });
      const ctx = await contexte(ins);
      if (ctx.manque.length) return res.status(409).json({ error: "Le contrat n'est pas encore prêt." });

      const mention = String(body.mention || "").trim().replace(/\s+/g, " ");
      if (mention.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") !== "lu et approuve") return res.status(400).json({ error: "Écrivez la mention « Lu et approuvé »." });
      const adresse = String(body.adresse || "").trim().slice(0, 300);
      const signataire = String(body.signataire || "").trim().slice(0, 200);
      if (!ctx.estEntreprise && adresse.length < 8) return res.status(400).json({ error: "Indiquez votre adresse postale." });
      if (ctx.estEntreprise && signataire.length < 3) return res.status(400).json({ error: "Indiquez le nom et la qualité du signataire." });
      if (body.accepte !== true) return res.status(400).json({ error: "Cochez la case d'acceptation du contrat." });
      const signature = jpegDepuisDataUrl(body.signature), paraphe = jpegDepuisDataUrl(body.paraphe);
      if (!signature || !paraphe) return res.status(400).json({ error: "Dessinez votre paraphe et votre signature." });

      // Le texte lu doit être celui qu'on signe
      const apercu = await rendre(ctx, { client_adresse: "(à compléter ci-dessous)", representant: "(à compléter ci-dessous)", date_signature: "(à la signature)" });
      if (empreinte(apercu) !== body.empreinte) return res.status(409).json({ error: "Le contrat a été mis à jour depuis votre lecture. Rechargez la page pour lire la dernière version." });

      const maintenant = new Date();
      const dateLongue = maintenant.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });
      const items = await rendre(ctx, { client_adresse: adresse, representant: signataire, date_signature: dateLongue });
      const emp = empreinte(items);
      let coach = null;
      if (ctx.signatureCoach) { const r = await fetch(ctx.signatureCoach); if (r.ok) coach = svgRects(await r.text()); }
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || String(req.headers["x-real-ip"] || "");
      const preuve = {
        signataire: ctx.estEntreprise ? signataire : "",
        dateLocale: maintenant.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "medium" }),
        dateIso: maintenant.toISOString().replace("T", " ").slice(0, 19),
        ip, ua: String(req.headers["user-agent"] || "").slice(0, 180), empreinte: emp, inscription: ins.id,
      };
      const pdf = fabriquerPdf({ items, ctx, signature, paraphe, mention, preuve, coach });
      const empPdf = crypto.createHash("sha256").update(pdf).digest("hex");
      const nomFichier = `Contrat de coaching - ${ctx.clientNom}.pdf`.replace(/[\/\\]/g, "-");
      await deposerPdf(ins.id, pdf, nomFichier, {
        "Contrat signé": { checkbox: true },
        "Contrat signé le": { date: { start: maintenant.toISOString() } },
        "⚙ Contrat empreinte": { rich_text: [{ type: "text", text: { content: `texte ${emp} · pdf ${empPdf}` } }] },
      });
      return res.status(200).json({ ok: true, pdf: `/api/contrat?t=${body.t}&pdf=1` });
    }

    return res.status(400).json({ error: "Action inconnue" });
  } catch (e) {
    console.error("contrat", e);
    return res.status(500).json({ error: "Une erreur est survenue. Réessayez dans un instant ou écrivez à contact@lauraballo.com." });
  }
}

export { rendre, contexte, fabriquerPdf, svgRects, modalites };
