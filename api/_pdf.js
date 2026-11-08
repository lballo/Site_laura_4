// Petit générateur de PDF sans dépendance, pour les contrats de coaching.
// Polices standard Helvetica et Helvetica-Bold (encodage WinAnsi), images JPEG, rectangles.
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

/** Une page : on y écrit du texte, des images et des rectangles. Coordonnées en points, origine en bas à gauche. */
export class Page {
  constructor(doc) { this.doc = doc; this.ops = []; }
  text(str, x, y, { font = "F1", size = 10, color = [0.1, 0.1, 0.1] } = {}) {
    this.ops.push(`BT ${color.map(n).join(" ")} rg /${font} ${n(size)} Tf ${n(x)} ${n(y)} Td ${hex(encode(str))} Tj ET`);
  }
  line(x1, y1, x2, y2, { width = 0.5, color = [0.75, 0.72, 0.7] } = {}) {
    this.ops.push(`${color.map(n).join(" ")} RG ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
  }
  image(name, x, y, w, h) {
    this.doc.usedImages.add(name);
    this.ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /${name} Do Q`);
  }
  /** Rectangles pleins dans un repère « image » (y vers le bas), mis à l'échelle dans une boîte. */
  rects(list, srcW, srcH, x, y, w, h, color = [0.1, 0.1, 0.1]) {
    const s = Math.min(w / srcW, h / srcH);
    const ox = x, oy = y;
    const body = list.map(([rx, ry, rw, rh]) => `${n(ox + rx * s)} ${n(oy + (srcH - ry - rh) * s)} ${n(rw * s)} ${n(rh * s)} re`).join(" ");
    this.ops.push(`q ${color.map(n).join(" ")} rg ${body} f Q`);
  }
}

export class PdfDoc {
  constructor({ width = 595.28, height = 841.89 } = {}) {
    this.width = width; this.height = height;
    this.pages = []; this.images = new Map(); this.usedImages = new Set();
  }
  addPage() { const p = new Page(this); this.pages.push(p); return p; }
  addJpeg(name, buf) { this.images.set(name, { buf, ...jpegSize(buf) }); }
  render({ title = "", author = "" } = {}) {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const imgIds = {};
    for (const [name, im] of this.images) {
      imgIds[name] = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /${im.comps === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.buf.length} >>`, data: im.buf });
    }
    const xobj = Object.keys(imgIds).length ? `/XObject << ${Object.entries(imgIds).map(([k, v]) => `/${k} ${v} 0 R`).join(" ")} >>` : "";
    const kids = [];
    for (const p of this.pages) {
      const data = zlib.deflateSync(Buffer.from(p.ops.join("\n"), "latin1"));
      const content = add({ dict: `<< /Length ${data.length} /Filter /FlateDecode >>`, data });
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${xobj} >> /Contents ${content} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${hex(encode(title))} /Author ${hex(encode(author))} /Producer (lauraballo.com) >>`);

    const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
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
    return Buffer.concat(chunks);
  }
}
