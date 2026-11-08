// Sceau électronique des contrats : signature PAdES (CMS détaché, ETSI.CAdES.detached) et horodatage RFC 3161.
// La clé privée et le certificat sont dans la variable d'environnement CONTRAT_SCEAU (blocs PEM collés à la suite),
// ajoutée par Laura dans Vercel. Sans cette variable, le contrat est signé sans sceau.
import crypto from "node:crypto";

// ---------- DER minimal ----------
const longueur = (n) => {
  if (n < 0x80) return Buffer.from([n]);
  const octets = [];
  while (n > 0) { octets.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | octets.length, ...octets]);
};
const tlv = (tag, ...contenu) => { const c = Buffer.concat(contenu); return Buffer.concat([Buffer.from([tag]), longueur(c.length), c]); };
const seq = (...c) => tlv(0x30, ...c);
const set = (...c) => tlv(0x31, ...c);
const octets = (b) => tlv(0x04, b);
const nul = () => Buffer.from([0x05, 0x00]);
const bool = (v) => Buffer.from([0x01, 0x01, v ? 0xff : 0x00]);
const entier = (b) => { // b : Buffer non signé
  let i = 0; while (i < b.length - 1 && b[i] === 0) i++;
  let v = b.subarray(i);
  if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
  return tlv(0x02, v);
};
const petitEntier = (n) => entier(Buffer.from([n]));
const oid = (s) => {
  const p = s.split(".").map(Number), out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) {
    const b = [v & 0x7f]; let x = v >> 7;
    while (x > 0) { b.unshift((x & 0x7f) | 0x80); x >>= 7; }
    out.push(...b);
  }
  return tlv(0x06, Buffer.from(out));
};
const explicite = (n, ...c) => tlv(0xa0 + n, ...c);

/** Lit un élément DER : { tag, debut (début du contenu), fin, total (fin de l'élément) }. */
function lire(buf, o = 0) {
  const tag = buf[o];
  let l = buf[o + 1], d = o + 2;
  if (l & 0x80) { const k = l & 0x7f; l = 0; for (let i = 0; i < k; i++) l = l * 256 + buf[d + i]; d += k; }
  return { tag, debut: d, fin: d + l, total: d + l, brut: buf.subarray(o, d + l) };
}
/** Les éléments enfants d'un élément construit. */
function enfants(buf, el) {
  const out = [];
  let o = el.debut;
  while (o < el.fin) { const e = lire(buf, o); out.push(e); o = e.total; }
  return out;
}

const OID = {
  data: "1.2.840.113549.1.7.1", signedData: "1.2.840.113549.1.7.2", sha256: "2.16.840.1.101.3.4.2.1",
  rsa: "1.2.840.113549.1.1.1", sha256Rsa: "1.2.840.113549.1.1.11", ecdsaSha256: "1.2.840.10045.4.3.2",
  contentType: "1.2.840.113549.1.9.3", messageDigest: "1.2.840.113549.1.9.4",
  signingCertV2: "1.2.840.113549.1.9.16.2.47", timeStampToken: "1.2.840.113549.1.9.16.2.14",
};
const algo = (o, avecNull = true) => (avecNull ? seq(oid(o), nul()) : seq(oid(o)));
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();

// ---------- Clé et certificat ----------
let cache;
export function identite() {
  if (cache !== undefined) return cache;
  const brut = String(process.env.CONTRAT_SCEAU || "").replace(/\\n/g, "\n").trim();
  cache = null;
  if (!brut) return cache;
  const cle = /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.exec(brut);
  const cert = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(brut);
  if (!cle || !cert) { console.error("CONTRAT_SCEAU : clé privée ou certificat introuvable"); return cache; }
  const der = Buffer.from(cert[1].replace(/\s+/g, ""), "base64");
  const x509 = new crypto.X509Certificate(der);
  const privee = crypto.createPrivateKey(cle[0]);
  if (!x509.checkPrivateKey(privee)) { console.error("CONTRAT_SCEAU : la clé ne correspond pas au certificat"); return cache; }
  // Émetteur et numéro de série, tels quels dans le certificat
  const racine = lire(der), [tbs] = enfants(der, racine), champs = enfants(der, tbs);
  const k = champs[0].tag === 0xa0 ? 1 : 0;
  const cn = /CN=([^\n,]+)/.exec(x509.subject);
  cache = { der, privee, serie: champs[k].brut, emetteur: champs[k + 2].brut, nom: cn ? cn[1].trim() : "Laura Ballo Coaching", empreinte: sha256(der).toString("hex"), expire: x509.validTo };
  return cache;
}

// ---------- Horodatage RFC 3161 ----------
const TSA = ["http://timestamp.digicert.com", "https://freetsa.org/tsr"];

/** Demande un jeton d'horodatage pour ces octets (la valeur de la signature). Renvoie { jeton, service } ou null. */
export async function horodater(donnees, { delai = 4000, services = TSA } = {}) {
  const requete = seq(petitEntier(1), seq(algo(OID.sha256), octets(sha256(donnees))), entier(crypto.randomBytes(8)), bool(true));
  for (const url of services) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/timestamp-query" }, body: requete, signal: AbortSignal.timeout(delai) });
      if (!r.ok) continue;
      const rep = Buffer.from(await r.arrayBuffer());
      const jeton = jetonDepuisReponse(rep);
      if (jeton) return { jeton, service: new URL(url).hostname };
    } catch (e) { console.error("horodatage", url, e.message); }
  }
  return null;
}

/** Extrait le jeton (ContentInfo) d'une réponse TimeStampResp, si le statut est accordé. */
export function jetonDepuisReponse(rep) {
  const racine = lire(rep), [statut, jeton] = enfants(rep, racine);
  if (!statut || !jeton) return null;
  const [code] = enfants(rep, statut);
  const valeur = rep[code.debut + (code.fin - code.debut) - 1];
  return valeur === 0 || valeur === 1 ? Buffer.from(jeton.brut) : null;
}

// ---------- Signature CMS ----------
/**
 * Signe les octets couverts par le ByteRange. Renvoie { der, horodatage } (horodatage : service ou "").
 * `tsa` peut être remplacé pour les tests.
 */
export async function signerCms(donnees, { id = identite(), tsa = horodater } = {}) {
  if (!id) throw new Error("Sceau non configuré");
  const ec = id.privee.asymmetricKeyType === "ec";
  const attr = (o, valeur) => seq(oid(o), set(valeur));
  const attributs = [
    attr(OID.contentType, oid(OID.data)),
    attr(OID.messageDigest, octets(sha256(donnees))),
    attr(OID.signingCertV2, seq(seq(seq(octets(sha256(id.der)))))),
  ].sort(Buffer.compare);
  const signes = set(...attributs);
  const valeur = crypto.sign("sha256", signes, id.privee);
  const ts = tsa ? await tsa(valeur) : null;
  const signerInfo = seq(
    petitEntier(1),
    seq(id.emetteur, id.serie),
    algo(OID.sha256),
    Buffer.concat([Buffer.from([0xa0]), signes.subarray(1)]), // [0] IMPLICIT
    ec ? algo(OID.ecdsaSha256, false) : algo(OID.rsa),
    octets(valeur),
    ...(ts ? [tlv(0xa1, seq(oid(OID.timeStampToken), set(ts.jeton)))] : []),
  );
  const signedData = seq(
    petitEntier(1),
    set(algo(OID.sha256)),
    seq(oid(OID.data)),
    tlv(0xa0, id.der),
    set(signerInfo),
  );
  return { der: seq(oid(OID.signedData), explicite(0, signedData)), horodatage: ts ? ts.service : "" };
}
