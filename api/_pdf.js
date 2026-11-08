// Petit générateur de PDF sans dépendance, pour les contrats de coaching.
// Polices standard Helvetica et Helvetica-Bold (encodage WinAnsi), images JPEG et PNG, traits et cadres.
// Une page garde la liste de ce qu'on y dessine (ops) : la même liste sert au PDF et à l'aperçu à l'écran.
import zlib from "node:zlib";

// Largeurs des caractères 32 à 255 (1/1000 du corps), encodage WinAnsi
const WIDTHS = {
  F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
};

// Caractères Unicode hors Latin-1 présents dans WinAnsi
const WIN = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };

export function encode(str) {
  const out = [];
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    if (cp === 0x202f || cp === 0x2009 || cp === 0x2007 || cp === 0x00a0) out.push(0x20);
    else if (cp >= 0x20 && cp < 0x7f) out.push(cp);
    else if (cp >= 0xa0 && cp <= 0xff) out.push(cp);
    else if (WIN[cp]) out.push(WIN[cp]);
    else if (cp === 0x2010 || cp === 0x2011) out.push(0x2d);
    else out.push(0x3f);
  }
  return out;
}

export function widthOf(str, font, size) {
  const w = WIDTHS[font];
  let t = 0;
  for (const b of encode(str)) t += b >= 32 ? w[b - 32] : 0;
  return (t * size) / 1000;
}

const hex = (bytes) => "<" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("") + ">";
const n = (x) => (Math.round(x * 100) / 100).toString();
const r2 = (x) => Math.round(x * 100) / 100;
const col = (c) => c.map(n).join(" ");

/** Chaîne PDF littérale, en WinAnsi. */
export const chainePdf = (s) => "(" + Buffer.from(encode(s)).toString("latin1").replace(/[\\()]/g, (m) => "\\" + m) + ")";

// ---------- Images ----------

/** Dimensions d'un JPEG (marqueur SOFn). */
export function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), comps: buf[i + 9] };
    }
    i += 2 + len;
  }
  throw new Error("Image JPEG illisible");
}

/** Décode un PNG en pixels RVB + alpha (8 bits). Gère les PNG courants, sans entrelacement. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG illisible");
  let o = 8, ihdr, plte, trns;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString("latin1", o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], ctype: data[9], interlace: data[12] };
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  const { w, h, depth, ctype, interlace } = ihdr;
  if (interlace) throw new Error("PNG entrelacé non pris en charge");
  const canaux = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const bitsPx = canaux * depth, bpp = Math.max(1, bitsPx >> 3), ligne = Math.ceil((w * bitsPx) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(ligne * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (ligne + 1)], src = y * (ligne + 1) + 1, dst = y * ligne;
    for (let x = 0; x < ligne; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - ligne + x] : 0, c = x >= bpp && y ? px[dst - ligne + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  const rgb = Buffer.alloc(w * h * 3), alpha = Buffer.alloc(w * h, 255);
  const echantillon = (y, i) => { // i-ème échantillon de la ligne y, ramené sur 8 bits
    if (depth === 8) return px[y * ligne + i];
    if (depth === 16) return px[y * ligne + i * 2];
    const bit = i * depth, octet = px[y * ligne + (bit >> 3)], v = (octet >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return ctype === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    let r, g, b, a = 255;
    if (ctype === 0) { r = g = b = echantillon(y, x); }
    else if (ctype === 4) { r = g = b = echantillon(y, x * 2); a = echantillon(y, x * 2 + 1); }
    else if (ctype === 2) { r = echantillon(y, x * 3); g = echantillon(y, x * 3 + 1); b = echantillon(y, x * 3 + 2); }
    else if (ctype === 6) { r = echantillon(y, x * 4); g = echantillon(y, x * 4 + 1); b = echantillon(y, x * 4 + 2); a = echantillon(y, x * 4 + 3); }
    else { const k = echantillon(y, x); r = plte[k * 3]; g = plte[k * 3 + 1]; b = plte[k * 3 + 2]; if (trns && k < trns.length) a = trns[k]; }
    rgb[p * 3] = r; rgb[p * 3 + 1] = g; rgb[p * 3 + 2] = b; alpha[p] = a;
  }
  return { width: w, height: h, rgb, alpha };
}

/** Rend transparent le fond blanc d'une image opaque (encre sur papier blanc), en gardant la couleur de l'encre. */
export function blancTransparent({ width, height, rgb, alpha }) {
  if (alpha.some((a) => a < 255)) return { width, height, rgb, alpha };
  const out = Buffer.from(rgb), al = Buffer.alloc(width * height);
  for (let p = 0; p < width * height; p++) {
    const r = rgb[p * 3], g = rgb[p * 3 + 1], b = rgb[p * 3 + 2];
    const a = 255 - Math.min(r, g, b);
    al[p] = a < 12 ? 0 : a;
    if (a > 0) for (let k = 0; k < 3; k++) out[p * 3 + k] = Math.max(0, Math.min(255, Math.round(255 - ((255 - rgb[p * 3 + k]) * 255) / a)));
  }
  return { width, height, rgb: out, alpha: al };
}

// ---------- Pages ----------

/** Une page : la liste de ce qu'on y dessine. Coordonnées en points, origine en bas à gauche. */
export class Page {
  constructor(width, height) { this.width = width; this.height = height; this.ops = []; }
  text(s, x, y, { font = "F1", size = 10, color = [0.1, 0.1, 0.1], angle = 0 } = {}) {
    const op = { t: "T", s, x: r2(x), y: r2(y), f: font, z: size, c: color };
    if (angle) op.a = angle;
    this.ops.push(op);
  }
  line(x1, y1, x2, y2, { width = 0.5, color = [0.75, 0.72, 0.7] } = {}) {
    this.ops.push({ t: "L", x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), w: width, c: color });
  }
  rect(x, y, w, h, { stroke = null, fill = null, width = 0.6, dash = false } = {}) {
    this.ops.push({ t: "R", x: r2(x), y: r2(y), w: r2(w), h: r2(h), s: stroke, fl: fill, lw: width, d: dash });
  }
  /** Image centrée dans la boîte, proportions gardées. */
  image(name, x, y, w, h) { this.ops.push({ t: "I", n: name, x: r2(x), y: r2(y), w: r2(w), h: r2(h) }); }
}

/** Place une image de w×h pixels dans une boîte, centrée, sans la déformer. */
export function ajuster(im, op) {
  const s = Math.min(op.w / im.width, op.h / im.height);
  const w = im.width * s, h = im.height * s;
  return { x: op.x + (op.w - w) / 2, y: op.y + (op.h - h) / 2, w, h };
}

function opsPdf(page, images) {
  const out = [];
  for (const o of page.ops) {
    if (o.t === "T") {
      if (o.a) {
        const a = (o.a * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        out.push(`BT ${col(o.c)} rg /${o.f} ${n(o.z)} Tf ${n(c)} ${n(s)} ${n(-s)} ${n(c)} ${n(o.x)} ${n(o.y)} Tm ${hex(encode(o.s))} Tj ET`);
      } else out.push(`BT ${col(o.c)} rg /${o.f} ${n(o.z)} Tf ${n(o.x)} ${n(o.y)} Td ${hex(encode(o.s))} Tj ET`);
    } else if (o.t === "L") out.push(`${col(o.c)} RG ${n(o.w)} w ${n(o.x1)} ${n(o.y1)} m ${n(o.x2)} ${n(o.y2)} l S`);
    else if (o.t === "R") {
      const parts = ["q"];
      if (o.fl) parts.push(`${col(o.fl)} rg`);
      if (o.s) parts.push(`${col(o.s)} RG ${n(o.lw)} w ${o.d ? "[3 2] 0 d" : ""}`);
      parts.push(`${n(o.x)} ${n(o.y)} ${n(o.w)} ${n(o.h)} re ${o.fl && o.s ? "B" : o.fl ? "f" : "S"} Q`);
      out.push(parts.join(" "));
    } else if (o.t === "I") {
      const im = images.get(o.n);
      if (!im) continue;
      const b = ajuster(im, o);
      out.push(`q ${n(b.w)} 0 0 ${n(b.h)} ${n(b.x)} ${n(b.y)} cm /${o.n} Do Q`);
    }
  }
  return out.join("\n");
}

export class PdfDoc {
  constructor({ width = 595.28, height = 841.89 } = {}) {
    this.width = width; this.height = height;
    this.pages = []; this.images = new Map();
  }
  addPage() { const p = new Page(this.width, this.height); this.pages.push(p); return p; }
  addJpeg(name, buf) { const s = jpegSize(buf); this.images.set(name, { kind: "jpeg", buf, width: s.width, height: s.height, comps: s.comps }); }
  /** Image décodée (rgb + alpha). */
  addPixels(name, { width, height, rgb, alpha }) {
    const opaque = !alpha || alpha.every((a) => a === 255);
    this.images.set(name, { kind: "pixels", width, height, rgb: zlib.deflateSync(rgb), alpha: opaque ? null : zlib.deflateSync(alpha) });
  }

  /**
   * Le PDF. Avec `sceau`, réserve un emplacement de signature numérique (PAdES) sur la dernière page :
   * renvoie alors { pdf, emplacement } pour que l'appelant y écrive la signature CMS.
   */
  render({ title = "", author = "", subject = "", sceau = null } = {}) {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const imgIds = {};
    for (const [name, im] of this.images) {
      if (im.kind === "jpeg") {
        imgIds[name] = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /${im.comps === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.buf.length} >>`, data: im.buf });
      } else {
        const smask = im.alpha ? add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.alpha.length} >>`, data: im.alpha }) : 0;
        imgIds[name] = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ${smask ? `/SMask ${smask} 0 R ` : ""}/Length ${im.rgb.length} >>`, data: im.rgb });
      }
    }
    const xobj = Object.keys(imgIds).length ? `/XObject << ${Object.entries(imgIds).map(([k, v]) => `/${k} ${v} 0 R`).join(" ")} >>` : "";

    // Emplacement du sceau : un champ de signature invisible sur la dernière page
    let sigField = 0, sigDict = 0;
    if (sceau) {
      sigDict = add(`<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /ByteRange [0 ********** ********** **********] /Contents <${"0".repeat(sceau.taille * 2)}> /M ${chainePdf(sceau.date)} /Name ${chainePdf(sceau.nom)} /Reason ${chainePdf(sceau.motif)} /Location ${chainePdf(sceau.lieu)} /ContactInfo ${chainePdf(sceau.contact || "")} >>`);
      sigField = add(null);
    }

    const kids = [];
    this.pages.forEach((p, i) => {
      const data = zlib.deflateSync(Buffer.from(opsPdf(p, this.images), "latin1"));
      const content = add({ dict: `<< /Length ${data.length} /Filter /FlateDecode >>`, data });
      const annots = sigField && i === this.pages.length - 1 ? ` /Annots [${sigField} 0 R]` : "";
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${xobj} >> /Contents ${content} 0 R${annots} >>`));
    });
    if (sigField) objs[sigField - 1] = `<< /Type /Annot /Subtype /Widget /FT /Sig /T ${chainePdf("Sceau Laura Ballo Coaching")} /V ${sigDict} 0 R /F 132 /Rect [0 0 0 0] /P ${kids[kids.length - 1]} 0 R >>`;
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R${sigField ? ` /AcroForm << /Fields [${sigField} 0 R] /SigFlags 3 >>` : ""} >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${hex(encode(title))} /Author ${hex(encode(author))} /Subject ${hex(encode(subject))} /Producer (lauraballo.com) >>`);

    const chunks = [Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    let offset = chunks[0].length;
    const offsets = [];
    objs.forEach((o, i) => {
      offsets.push(offset);
      let part;
      if (typeof o === "string") part = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1");
      else part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict}\nstream\n`, "latin1"), o.data, Buffer.from("\nendstream\nendobj\n", "latin1")]);
      chunks.push(part); offset += part.length;
    });
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, "latin1"));
    const pdf = Buffer.concat(chunks);
    if (!sceau) return pdf;

    // ByteRange : tout le fichier sauf la valeur hexadécimale de /Contents
    const debut = pdf.indexOf("/Contents <" + "0".repeat(32)) + "/Contents ".length;
    const fin = debut + sceau.taille * 2 + 2;
    const plage = [0, debut, fin, pdf.length - fin];
    const repere = pdf.indexOf("[0 ********** ********** **********]");
    const texte = `[${plage.join(" ")}]`.padEnd("[0 ********** ********** **********]".length, " ");
    pdf.write(texte, repere, "latin1");
    return { pdf, plage, debut, fin };
  }
}

/** Écrit la signature CMS (DER) dans l'emplacement réservé. */
export function poserSignature({ pdf, debut, fin }, der) {
  const h = der.toString("hex");
  if (h.length > fin - debut - 2) throw new Error("Signature trop longue pour l'emplacement réservé");
  pdf.write(h.padEnd(fin - debut - 2, "0"), debut + 1, "latin1");
  return pdf;
}

/** Les octets couverts par la signature. */
export const octetsSignes = ({ pdf, debut, fin }) => Buffer.concat([pdf.subarray(0, debut), pdf.subarray(fin)]);
