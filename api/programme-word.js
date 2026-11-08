// Remplit le modèle Word d'un programme de coaching.
// Appelé par n8n (workflow « Coaching · Inscription et programme »), jamais par le navigateur.
//
// POST /api/programme-word
//   Corps JSON : { templateUrl: "https://…docx", variables: { prenom: "Claire", tarif: "4 500", … }, filename: "…docx" }
//   Le modèle doit être un fichier hébergé par Notion (lien de téléchargement temporaire donné par l'API Notion) :
//   le module ne lit aucune donnée par lui-même, il remplit seulement le fichier qu'on lui désigne.
//   Si la variable d'environnement PROGRAMME_WORD_TOKEN existe, l'en-tête x-programme-token doit la reprendre.
// Réponse : le fichier .docx rempli.
//
// Chaque {{variable}} connue est remplacée et perd son surlignage jaune ; une variable vide est retirée.
// Les {{variables}} inconnues et les passages surlignés restent tels quels, à ajuster à la main.
// Aucune dépendance : lecture et écriture du ZIP avec zlib.
import zlib from "node:zlib";

const MAX_TEMPLATE = 15 * 1024 * 1024;

// ---------- ZIP ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Fichier Word illisible (pas une archive ZIP)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Répertoire ZIP invalide");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`Compression ZIP non gérée (${method})`);
    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ---------- Remplissage ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function fillXml(xml, variables) {
  // 1. Recoller les {{variables}} que Word a coupées entre plusieurs morceaux de texte
  let out = xml.replace(/\{\{((?:<[^>]+>|[^<{}])*?)\}\}/g, (m, inner) => "{{" + inner.replace(/<[^>]+>/g, "") + "}}");

  // 2. Remplacer, morceau de texte par morceau de texte
  out = out.replace(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run) => {
    if (!run.includes("{{")) return run;
    let touched = false;
    let r = run.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, key) => {
      if (!Object.prototype.hasOwnProperty.call(variables, key)) return m;
      touched = true;
      return esc(variables[key] ?? "");
    });
    if (!touched) return r;
    if (!r.includes("{{")) r = r.replace(/<w:highlight [^>]*\/>/g, "");
    // un morceau devenu vide disparaît
    const text = (r.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("");
    return text === "" ? "" : r;
  });

  // 3. Nettoyer les séparateurs orphelins (« , » sans rien après) laissés par une variable vide
  const sep = /<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<w:t(?:\s[^>]*)?>, <\/w:t><\/w:r>/;
  let prev;
  do {
    prev = out;
    out = out.replace(new RegExp(sep.source + "(\\s*(?:" + sep.source + "|</w:p>))", "g"), "$1");
  } while (out !== prev);
  return out;
}

export function fillDocx(buf, variables) {
  const entries = readZip(buf);
  for (const e of entries) {
    if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(e.name)) {
      e.data = Buffer.from(fillXml(e.data.toString("utf8"), variables), "utf8");
    }
  }
  return writeZip(entries);
}

// ---------- Point d'entrée ----------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const token = process.env.PROGRAMME_WORD_TOKEN;
  if (token && req.headers["x-programme-token"] !== token) return res.status(401).json({ error: "Non autorisé" });

  const { templateUrl, variables = {}, filename = "Programme.docx" } = req.body || {};
  let host = "";
  try { host = new URL(templateUrl).hostname; } catch { /* lien invalide */ }
  const notionHost = /(^|\.)amazonaws\.com$/.test(host) && /notion|prod-files-secure/.test(templateUrl) || /(^|\.)notion\.(so|site|com)$/.test(host) || /(^|\.)notion-static\.com$/.test(host);
  if (!templateUrl || !/^https:\/\//.test(templateUrl) || !notionHost) return res.status(400).json({ error: "Le modèle doit être un fichier Word hébergé par Notion" });

  try {
    const r = await fetch(templateUrl);
    if (!r.ok) return res.status(502).json({ error: `Modèle introuvable (${r.status})` });
    const tpl = Buffer.from(await r.arrayBuffer());
    if (tpl.length > MAX_TEMPLATE) return res.status(413).json({ error: "Modèle trop lourd" });
    const clean = {};
    for (const [k, v] of Object.entries(variables)) if (/^[a-zA-Z_]+$/.test(k)) clean[k] = v == null ? "" : String(v);
    const out = fillDocx(tpl, clean);
    const safeName = String(filename).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "Programme.docx";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    return res.status(200).send(out);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 300) });
  }
}
