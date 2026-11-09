// Contrat de coaching : généré depuis Notion, lu page par page, paraphé et signé en ligne par un lien personnel.
//
// POST /api/contrat { action: "preparer", inscriptionId }
//   Appelé par n8n quand « Programme validé le » est daté dans l'inscription.
//   Crée le jeton personnel et écrit « Lien contrat » dans l'inscription. Ne renvoie jamais le jeton.
// GET  /api/contrat?t=JETON                         → l'état du contrat (à signer, signé)
// POST /api/contrat { action: "apercu", t, adresse | signataire } → les pages A4 telles qu'elles seront signées (JSON)
// POST /api/contrat { action: "lecture", t, adresse | signataire } → l'exemplaire de lecture non signé (PDF)
// POST /api/contrat { action: "signer", t, empreinte, adresse | signataire, paraphe, paraphes, mention, signature, accepte }
// GET  /api/contrat?t=JETON&pdf=1                   → le contrat signé (PDF)
// GET  /api/contrat?verifier=SHA256                 → ce PDF est-il un original signé ?
//
// Le texte vient de la fiche « Contrat · Contrat de coaching » (base Modèles documents et mails) :
// les {{variables}} sont remplies depuis l'inscription, l'offre, la fiche CRM et l'entreprise ;
// les lignes [[SI particulier]] / [[SI entreprise]] … [[FIN]] ne gardent que le cas du client ; les encadrés sont des notes internes.
// La signature de Laura est le fichier PNG du champ « Fichier » de cette fiche (hors du dépôt public).
// Une seule mise en page sert à l'aperçu, à l'exemplaire de lecture et au PDF signé : le client signe exactement ce qu'il a lu.
// Le PDF signé est scellé (PAdES + horodatage) quand la variable CONTRAT_SCEAU est configurée, voir _sceau.js.
import crypto from "node:crypto";
import { PdfDoc, widthOf, decodePng, blancTransparent, octetsSignes, poserSignature } from "./_pdf.js";
import { identite, signerCms } from "./_sceau.js";
import { echeancier, phraseModalites, eurosCentimes, FINANCEMENT_EN_LIGNE } from "./_echeancier.js";
import { brouillon, enRichText, MODELE_MAIL } from "./_mail-inscription.js";

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

/** Article V : nombre de versements, montants et délais, calculés comme sur la page de paiement. */
function modalites(nb, tarif, dureeMois = null, enLigne = false) {
  const e = echeancier(tarif, nb, dureeMois);
  return { phrase: phraseModalites(e, enLigne), versement: eurosCentimes(e.suivant), echeancier: e };
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
  const enLigne = FINANCEMENT_EN_LIGNE.includes(choix(ins, "Financeur"));
  const m = modalites(nb, tarif, nombre(offre, "Durée (mois)"), enLigne);
  const siretIns = nombre(ins, "SIRET");
  const adresseEnt = texte(ins, "Adresse entreprise") || [texte(entreprise, "Adresse"), [texte(entreprise, "Code postal"), texte(entreprise, "Ville")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const vars = {
    programme: texte(offre, "Titre") || texte(offre, "Nav"),
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
  if (!offreId || !offre) manque.push("l'offre (champ Programme, et accès de l'intégration Notion du site à « Offres Accompagnements »)");
  if (!tarif) manque.push("le tarif");
  if (!vars.seances) manque.push("le nombre de séances");
  if (!vars.objectif) manque.push("l'objectif");
  if (estEntreprise && !vars.entreprise_denomination) manque.push("l'entreprise");
  const fichiers = (prop(modele, "Fichier") && prop(modele, "Fichier").files) || [];
  const png = fichiers.find((f) => /\.png$/i.test(f.name || ""));
  return { vars, estEntreprise, enLigne, echeancier: m.echeancier, clientNom, prenom: prenom || clientNom.split(" ")[0], email: (prop(client, "Email") && prop(client, "Email").email) || "", manque, signatureCoach: png ? (png.file ? png.file.url : png.external.url) : "" };
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
      // Espaces insécables de la typographie française (guillemets, deux-points, point-virgule)
      const r2 = runs.map((r) => ({ ...r, text: remplir(r.text).replace(/« /g, "«\u00a0").replace(/ (»|:|;|\?|!)/g, "\u00a0$1") })).filter((r) => r.text);
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



// ---------- Mise en page A4 ----------
const A4 = { l: 595.28, h: 841.89 };
const G = 64, D = A4.l - 64, LARGEUR = D - G, HAUT = A4.h - 66, BAS = 118;
const GRIS = [0.45, 0.42, 0.4];
const CORPS = 11.5, INTERLIGNE = 16;

/** Coupe des morceaux de texte (gras ou non) en lignes de largeur max. */
function couper(runs, size, max) {
  const mots = [];
  for (const r of runs) for (const [i, w] of r.text.split(" ").entries()) {
    if (i > 0) mots.push({ space: true, font: r.bold ? "F2" : "F1" });
    if (w) mots.push({ text: w, font: r.bold ? "F2" : "F1" });
  }
  const lignes = [];
  let ligne = [], largeur = 0;
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
  return lignes;
}

/** Un rédacteur de pages : écrit des paragraphes et passe à la page suivante quand il faut. */
function redacteur(doc) {
  const st = { pages: [], page: null, y: 0 };
  st.nouvelle = () => { st.page = doc.addPage(); st.pages.push(st.page); st.y = HAUT; };
  st.ecrire = (runs, { size = CORPS, lead = INTERLIGNE, retrait = 0, puce = "", color } = {}) => {
    for (const [i, l] of couper(runs, size, LARGEUR - retrait).entries()) {
      if (st.y - lead < BAS) st.nouvelle();
      st.y -= lead;
      if (i === 0 && puce) st.page.text(puce, G, st.y, { size, color });
      let x = G + retrait;
      for (const m of l) {
        if (m.space) { x += widthOf(" ", m.font, size); continue; }
        st.page.text(m.text, x, st.y, { font: m.font, size, color });
        x += widthOf(m.text, m.font, size);
      }
    }
  };
  st.nouvelle();
  return st;
}

/**
 * Les pages du contrat, sans les traces du client (paraphes, mention, signature).
 * Renvoie aussi l'emplacement de ces traces : un paraphe en bas de chaque page, la signature sur la dernière.
 */
function mettreEnPage(items, ctx, doc = new PdfDoc()) {
  const st = redacteur(doc);
  for (const it of items) {
    if (it.kind === "h1") { st.y -= 4; st.ecrire(it.runs.map((r) => ({ ...r, bold: true })), { size: 16, lead: 21 }); st.y -= 10; }
    else if (it.kind === "h2") { if (st.y - 48 < BAS) st.nouvelle(); st.y -= 12; st.ecrire(it.runs.map((r) => ({ ...r, bold: true })), { size: 12, lead: 17 }); st.y -= 2; }
    else if (it.kind === "li") { st.y -= 4; st.ecrire(it.runs, { retrait: 20, puce: `${it.num})` }); }
    else if (it.kind === "bullet") { st.y -= 4; st.ecrire(it.runs, { retrait: 20, puce: "•" }); }
    else { st.y -= it.indent ? 1 : 5; st.ecrire(it.runs, { retrait: it.indent ? 20 : 0 }); }
  }

  // Bloc des signatures
  if (st.y - 230 < BAS) st.nouvelle();
  st.y -= 30;
  const y = st.y, p = st.page, colonne = (LARGEUR - 24) / 2, xc = G + colonne + 24;
  p.text("LE CLIENT", G, y, { font: "F2", size: 11 });
  p.text(ctx.estEntreprise ? ctx.vars.entreprise_denomination : ctx.clientNom, G, y - 17, { size: 10.5 });
  p.text("LE COACH", xc, y, { font: "F2", size: 11 });
  p.text("Laura BALLO", xc, y - 17, { size: 10.5 });
  p.text("« Lu et approuvé »", xc, y - 33, { size: 10.5, color: GRIS });
  const boite = { x: G, y: y - 160, w: colonne, h: 112 };
  p.rect(boite.x, boite.y, boite.w, boite.h, { stroke: [0.8, 0.77, 0.75], dash: true });
  p.text("Signature du client", G + 6, boite.y + boite.h - 12, { size: 8, color: GRIS });
  p.image("Coach", xc, y - 160, Math.min(colonne, 190), 112);
  const zones = { signature: { page: st.pages.length, ...boite }, mention: { page: st.pages.length, x: G, y: y - 33 }, identite: { page: st.pages.length, x: G, y: boite.y - 15, w: colonne }, paraphes: [] };

  // Pied de page : client, numéro, case du paraphe
  const total = st.pages.length;
  st.pages.forEach((pg, i) => {
    pg.line(G, 104, D, 104);
    pg.text(`Contrat de coaching · ${ctx.clientNom}`, G, 90, { size: 8.5, color: GRIS });
    pg.text(`Page ${i + 1} / ${total}`, G, 76, { size: 8.5, color: GRIS });
    pg.text("Paraphe du client", D - 120, 90, { size: 8, color: GRIS });
    pg.rect(D - 120, 36, 120, 46, { stroke: [0.8, 0.77, 0.75], dash: true });
    zones.paraphes.push({ page: i + 1, x: D - 120, y: 36, w: 120, h: 46 });
  });
  return { doc, pages: st.pages, zones };
}

const empreinteDe = (pages) => crypto.createHash("sha256").update(JSON.stringify(pages.map((p) => p.ops))).digest("hex");

/** La page « Certificat de signature » ajoutée à la fin du PDF signé. */
function pageCertificat(doc, lignes, nbPages) {
  const st = redacteur(doc);
  st.ecrire([{ text: "Certificat de signature électronique", bold: true }], { size: 16, lead: 21 });
  st.y -= 4;
  st.ecrire([{ text: `Annexe au contrat de ${nbPages} pages qui précède.`, bold: false }], { size: 10, lead: 14, color: GRIS });
  st.y -= 6;
  for (const [k, v] of lignes) {
    st.y -= 7;
    st.ecrire([{ text: k, bold: true }], { size: 10, lead: 14 });
    st.ecrire([{ text: v, bold: false }], { size: 10, lead: 14 });
  }
  for (const pg of st.pages) {
    pg.line(G, 104, D, 104);
    pg.text("Certificat de signature · annexe au contrat", G, 90, { size: 8.5, color: GRIS });
  }
}

/** La signature de Laura (PNG de la fiche modèle) : l'original pour l'écran, les pixels pour le PDF. */
async function signatureCoach(ctx) {
  if (!ctx.signatureCoach) return null;
  const r = await fetch(ctx.signatureCoach);
  if (!r.ok) return null;
  const png = Buffer.from(await r.arrayBuffer());
  try { return { png, pixels: blancTransparent(decodePng(png)) }; } catch (e) { console.error("signature coach", e.message); return null; }
}

/** L'exemplaire de lecture : la mise en page finale, marquée « non signé ». */
function pdfLecture(items, ctx, coach) {
  const { doc, pages } = mettreEnPage(items, ctx);
  if (coach) doc.addPixels("Coach", coach.pixels);
  const quand = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });
  // Filigrane en diagonale, centré, sous le texte
  const fil = "EXEMPLAIRE DE LECTURE · NON SIGNÉ", taille = 30, angle = 50, rad = (angle * Math.PI) / 180, lw = widthOf(fil, "F2", taille);
  const fx = A4.l / 2 - (lw / 2) * Math.cos(rad) + (taille / 3) * Math.sin(rad), fy = A4.h / 2 - (lw / 2) * Math.sin(rad) - (taille / 3) * Math.cos(rad);
  for (const p of pages) {
    p.ops.unshift({ t: "T", s: fil, x: Math.round(fx), y: Math.round(fy), f: "F2", z: taille, c: [0.92, 0.89, 0.87], a: angle });
    p.text(`Exemplaire de lecture, non signé · préparé le ${quand}`, G, A4.h - 36, { size: 8.5, color: [0.6, 0.35, 0.3] });
  }
  return doc.render({ title: `Contrat de coaching · ${ctx.clientNom} (exemplaire de lecture)`, author: "Laura Ballo", subject: "Exemplaire de lecture non signé" });
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
const aujourdhui = (d = new Date()) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });

async function inscriptionOuvert(t) {
  if (!jetonValide(t)) return null;
  const ins = await inscriptionParJeton(t);
  return ins && choix(ins, "Statut") !== "Abandonné" ? ins : null;
}

/** Saisi au moment de signer : nom et prénom, et l'adresse (particulier) ou la fonction (entreprise). Imprimés sous la signature. */
function identiteSignataire(ctx, body) {
  const net = (v, max) => String(v || "").trim().replace(/\s+/g, " ").slice(0, max);
  const nom = net(body.nom, 120), adresse = net(body.adresse, 300), fonction = net(body.fonction, 120);
  if (nom.length < 3 || !/\s/.test(nom)) return { erreur: "Écrivez votre prénom et votre nom." };
  if (!ctx.estEntreprise && adresse.length < 8) return { erreur: "Indiquez votre adresse postale." };
  if (ctx.estEntreprise && fonction.length < 2) return { erreur: "Indiquez votre fonction dans l'entreprise." };
  return { nom, adresse: ctx.estEntreprise ? "" : adresse, fonction: ctx.estEntreprise ? fonction : "" };
}

/** Le texte du contrat à la date du jour. */
const texteDuJour = (ctx, date = new Date()) => rendre(ctx, { date_signature: aujourdhui(date) });

function jpegDepuisDataUrl(d) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(d || "");
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  return buf.length > 1000 && buf.length < 1.5e6 && buf[0] === 0xff && buf[1] === 0xd8 ? buf : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.NOTION_API_KEY) return res.status(500).json({ error: "Configuration manquante" });
  try {
    if (req.method === "GET" && req.query.check) {
      // Vérifie que la clé Notion du site accède aux bases du contrat, et que le sceau est configuré
      const bases = { Inscriptions: `databases/${INSCRIPTIONS}`, "Offres Accompagnements": "databases/313075e127d2805097a0e81b0e4efc86", "CRM People": "databases/127075e127d28112b16dde7180b01a42", Entreprises: "databases/2fd075e127d2819f9fabd4820a69f7f8", "Modèle de contrat": `pages/${MODELE}` };
      const out = {};
      for (const [nom, chemin] of Object.entries(bases)) out[nom] = await notion(chemin).then(() => "ok", (e) => e.message);
      const id = identite();
      out.Sceau = id ? `ok · ${id.nom} · expire le ${id.expire}` : process.env.CONTRAT_SCEAU ? "variable CONTRAT_SCEAU illisible" : "non configuré (variable CONTRAT_SCEAU absente)";
      return res.status(200).json(out);
    }

    if (req.method === "GET" && req.query.verifier) {
      // Le PDF déposé sur la page de vérification est-il un original signé ? (empreinte calculée dans le navigateur)
      const h = String(req.query.verifier).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(h)) return res.status(400).json({ error: "Empreinte invalide" });
      const r = await notion(`databases/${INSCRIPTIONS}/query`, "POST", { page_size: 2, filter: { property: "⚙ Contrat empreinte", rich_text: { contains: `pdf ${h}` } } });
      const ins = r.results[0];
      if (!ins) return res.status(200).json({ trouve: false });
      const ctx = await contexte(ins).catch(() => null);
      return res.status(200).json({ trouve: true, client: ctx ? ctx.clientNom : "", programme: ctx ? ctx.vars.programme : "", signeLe: (prop(ins, "Contrat signé le") || {}).date?.start || null });
    }

    if (req.method === "GET") {
      const ins = await inscriptionOuvert(req.query.t);
      if (!ins) return res.status(404).json({ error: "Lien invalide" });

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
      return res.status(200).json({ etat: "a_signer", client: ctx.clientNom, programme: ctx.vars.programme, entreprise: ctx.estEntreprise ? ctx.vars.entreprise_denomination || "votre entreprise" : "" });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
    const body = req.body || {};

    if (body.action === "preparer" || body.action === "brouillon") {
      const id = String(body.inscriptionId || "").replace(/-/g, "");
      if (!/^[0-9a-f]{32}$/i.test(id)) return res.status(400).json({ error: "Inscription invalide" });
      const ins = await notion(`pages/${id}`);
      if ((ins.parent && String(ins.parent.database_id || "").replace(/-/g, "")) !== INSCRIPTIONS) return res.status(400).json({ error: "Inscription invalide" });
      if (!(prop(ins, "Programme validé le") || {}).date) return res.status(409).json({ error: "Programme pas encore validé" });
      let jeton = texte(ins, "⚙ Contrat jeton");
      const enLigne = FINANCEMENT_EN_LIGNE.includes(choix(ins, "Financeur"));
      if (!jeton && body.action === "preparer") {
        jeton = crypto.randomBytes(24).toString("base64url");
        await notion(`pages/${id}`, "PATCH", { properties: {
          "⚙ Contrat jeton": { rich_text: [{ type: "text", text: { content: jeton } }] },
          "Lien contrat": { url: `${SITE}/contrat?t=${jeton}` },
          // Paiement par carte seulement quand le client finance lui-même (même jeton que le contrat)
          ...(enLigne ? { "Lien paiement": { url: `${SITE}/paiement?t=${jeton}` }, "Statut paiement": { select: { name: "En attente" } } } : {}),
        } });
      }
      if (!jeton) return res.status(409).json({ error: "Contrat pas encore préparé" });
      // Brouillon du mail d'inscription, sans écraser une version déjà relue
      let mail = texte(ins, "Mail d'inscription");
      if (!mail) {
        const [ctx, modele, blocsMail] = await Promise.all([contexte(ins), notion(`pages/${MODELE_MAIL}`), blocs(MODELE_MAIL)]);
        mail = brouillon({ prenom: ctx.prenom, programme: ctx.vars.programme, lienContrat: `${SITE}/contrat?t=${jeton}`, lienPaiement: enLigne ? `${SITE}/paiement?t=${jeton}` : "" }, modele, blocsMail);
        await notion(`pages/${id}`, "PATCH", { properties: { "Mail d'inscription": { rich_text: enRichText(mail) } } });
      }
      return res.status(200).json({ ok: true });
    }

    if (!["apercu", "lecture", "signer"].includes(body.action)) return res.status(400).json({ error: "Action inconnue" });
    const ins = await inscriptionOuvert(body.t);
    if (!ins) return res.status(404).json({ error: "Lien invalide" });
    if (signe(ins)) return res.status(409).json({ error: "Ce contrat est déjà signé.", signe: true });
    const ctx = await contexte(ins);
    if (ctx.manque.length) return res.status(409).json({ error: "Le contrat n'est pas encore prêt : Laura le finalise. Réessayez un peu plus tard." });
    const [items, coach] = await Promise.all([texteDuJour(ctx), signatureCoach(ctx)]);

    if (body.action === "apercu") {
      const { pages, zones } = mettreEnPage(items, ctx);
      return res.status(200).json({
        largeur: A4.l, hauteur: A4.h, pages: pages.map((p) => p.ops), zones, empreinte: empreinteDe(pages),
        images: coach ? { Coach: `data:image/png;base64,${coach.png.toString("base64")}` } : {},
      });
    }

    if (body.action === "lecture") {
      const pdf = pdfLecture(items, ctx, coach);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Contrat de coaching - exemplaire de lecture.pdf"`);
      return res.status(200).send(pdf);
    }

    // ── Signature ──
    const mention = String(body.mention || "").trim().replace(/\s+/g, " ");
    if (mention.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") !== "lu et approuve") return res.status(400).json({ error: "Écrivez la mention « Lu et approuvé »." });
    if (body.accepte !== true) return res.status(400).json({ error: "Cochez la case d'acceptation du contrat." });
    const infos = identiteSignataire(ctx, body);
    if (infos.erreur) return res.status(400).json({ error: infos.erreur });
    const signature = jpegDepuisDataUrl(body.signature), paraphe = jpegDepuisDataUrl(body.paraphe);
    if (!paraphe) return res.status(400).json({ error: "Dessinez votre paraphe." });
    if (!signature) return res.status(400).json({ error: "Dessinez votre signature." });

    // Ce qui est signé doit être exactement ce qui a été lu (même texte, même mise en page, même date)
    const maintenant = new Date();
    const { pages: lues } = mettreEnPage(items, ctx);
    const emp = empreinteDe(lues);
    if (emp !== body.empreinte) return res.status(409).json({ error: "Le contrat a été mis à jour depuis votre lecture. La page va se recharger avec la dernière version.", recharger: true });
    const paraphes = Array.isArray(body.paraphes) ? body.paraphes.map(Number) : [];
    if (lues.some((_, i) => !paraphes.includes(i + 1))) return res.status(400).json({ error: "Paraphez chaque page du contrat." });

    const id = identite();
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || String(req.headers["x-real-ip"] || "");
    const meta = { title: `Contrat de coaching · ${ctx.clientNom}`, author: "Laura Ballo", subject: `Contrat signé le ${aujourdhui(maintenant)}` };

    /** Le PDF signé : pages lues + traces du client + certificat. `sceau` : null, "horodate" ou "sans_horodatage". */
    const assembler = (sceau) => {
      const doc = new PdfDoc();
      const { pages, zones } = mettreEnPage(items, ctx, doc);
      doc.addJpeg("Par", paraphe);
      doc.addJpeg("Sig", signature);
      if (coach) doc.addPixels("Coach", coach.pixels);
      for (const z of zones.paraphes) pages[z.page - 1].image("Par", z.x + 4, z.y + 3, z.w - 8, z.h - 6);
      const zs = zones.signature;
      pages[zs.page - 1].image("Sig", zs.x + 6, zs.y + 4, zs.w - 12, zs.h - 20);
      pages[zones.mention.page - 1].text(`« ${mention} »`, zones.mention.x, zones.mention.y, { size: 10.5, color: GRIS });
      // Sous la signature : le nom saisi, puis l'adresse ou la fonction
      const zi = zones.identite, pi = pages[zi.page - 1];
      let yi = zi.y;
      for (const [k, v] of [["Signé par", infos.nom], ctx.estEntreprise ? ["Fonction", infos.fonction] : ["Adresse", infos.adresse]]) {
        for (const [n, l] of couper([{ text: `${k} : `, bold: true }, { text: v }], 9.5, zi.w).entries()) {
          let x = zi.x;
          for (const m of l) { if (m.space) { x += widthOf(" ", m.font, 9.5); continue; } pi.text(m.text, x, yi, { font: m.font, size: 9.5 }); x += widthOf(m.text, m.font, 9.5); }
          yi -= 13;
          if (n === 1) break;
        }
      }
      const texteSceau = sceau && `ce PDF est scellé par « ${id.nom} » (certificat émis par Laura Ballo, empreinte SHA-256 ${id.empreinte})${sceau === "horodate" ? " et horodaté par un service indépendant" : ""}. Toute modification du fichier rompt le sceau : le panneau Signatures d'Adobe Acrobat Reader l'indique.`;
      pageCertificat(doc, [
        ["Document", `Contrat de coaching · ${ctx.vars.programme}, ${pages.length} pages`],
        ["Signataire", ctx.estEntreprise ? `${infos.nom}, ${infos.fonction}, pour le compte de ${ctx.vars.entreprise_denomination}, au bénéfice de ${ctx.clientNom}` : `${infos.nom}, ${infos.adresse}`],
        ["Adresse e-mail du client", ctx.email || "non renseignée"],
        ["Date et heure de signature", `${maintenant.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "medium" })} (heure de Paris) · ${maintenant.toISOString().replace("T", " ").slice(0, 19)} UTC`],
        ["Adresse IP", ip || "inconnue"],
        ["Navigateur", String(req.headers["user-agent"] || "inconnu").slice(0, 200)],
        ["Accès", "lien personnel et individuel envoyé au client par Laura Ballo"],
        ["Lecture", `contrat affiché page par page avant la signature ; exemplaire de lecture en PDF ${body.lecture ? "ouvert ou téléchargé par le client" : "proposé au client"}`],
        ["Paraphes", `apposés par le client sur chacune des ${pages.length} pages, une à une`],
        ["Mention saisie", `« ${mention} »`],
        ["Signature du coach", "Laura BALLO, signature enregistrée apposée à l'émission du contrat"],
        ["Empreinte SHA-256 du contrat lu et signé", emp],
        ...(texteSceau ? [["Sceau électronique", texteSceau]] : []),
        ["Vérification", "déposez ce PDF sur lauraballo.com/contrat/verifier : le site confirme qu'il est identique à l'original enregistré."],
        ["Référence", `inscription ${ins.id}`],
      ], pages.length);
      if (!sceau) return doc.render(meta);
      const d = maintenant.toISOString().replace(/[-:T]/g, "").slice(0, 14);
      return doc.render({ ...meta, sceau: { taille: 24000, date: `D:${d}Z`, nom: id.nom, motif: "Contrat de coaching signé par le client", lieu: "lauraballo.com", contact: "contact@lauraballo.com" } });
    };

    let pdf, horodatage = "";
    if (id) {
      let emplacement = assembler("horodate");
      let cms = await signerCms(octetsSignes(emplacement), { id });
      if (!cms.horodatage) { // Service d'horodatage injoignable : le certificat ne doit pas l'annoncer
        emplacement = assembler("sans_horodatage");
        cms = await signerCms(octetsSignes(emplacement), { id, tsa: null });
      }
      pdf = poserSignature(emplacement, cms.der);
      horodatage = cms.horodatage;
    } else pdf = assembler(null);

    const empPdf = crypto.createHash("sha256").update(pdf).digest("hex");
    const nomFichier = `Contrat de coaching - ${ctx.clientNom}.pdf`.replace(/[\/\\]/g, "-");
    await deposerPdf(ins.id, pdf, nomFichier, {
      "Contrat signé": { checkbox: true },
      "Contrat signé le": { date: { start: maintenant.toISOString() } },
      "⚙ Contrat empreinte": { rich_text: [{ type: "text", text: { content: `pdf ${empPdf} · texte ${emp} · sceau ${id ? "oui" : "non"} · horodatage ${horodatage || "aucun"}` } }] },
    });
    const dejaPaye = ["En cours", "Payé"].includes(choix(ins, "Statut paiement"));
    return res.status(200).json({ ok: true, pdf: `/api/contrat?t=${body.t}&pdf=1`, paiement: ctx.enLigne && !dejaPaye ? `/paiement?t=${body.t}` : "" });
  } catch (e) {
    console.error("contrat", e);
    return res.status(500).json({ error: "Une erreur est survenue. Réessayez dans un instant ou écrivez à contact@lauraballo.com." });
  }
}

export { rendre, contexte, mettreEnPage, modalites, notion, inscriptionParJeton, choix, nombre, texte, prop, INSCRIPTIONS, SITE };
