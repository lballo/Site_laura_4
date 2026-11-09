// Brouillon du mail d'inscription (devis, contrat, paiement), préparé depuis le modèle Notion
// « Mail · Inscription administrative (devis, contrat, paiement) » et déposé dans l'inscription, champ « Mail d'inscription ».
// Laura (ou Amandine) le relit, le modifie si besoin, puis coche « ✉ Envoyer le mail d'inscription » : n8n l'envoie.
// Première ligne du brouillon : « Objet : … » (modifiable comme le reste).

export const MODELE_MAIL = "40d075e127d2817b8f41fc59110fd61c";

const txt = (rt) => (rt || []).map((t) => t.plain_text || "").join("");

/** Le texte du modèle : paragraphes séparés d'une ligne vide, puces regroupées ; les encadrés (notes internes) sont ignorés. */
function texteDuModele(blocs) {
  const parties = [];
  let puces = [];
  const fermer = () => { if (puces.length) { parties.push(puces.join("\n")); puces = []; } };
  for (const b of blocs) {
    if (b.type === "bulleted_list_item" || b.type === "numbered_list_item") { puces.push("- " + txt(b[b.type].rich_text)); continue; }
    fermer();
    if (["paragraph", "heading_1", "heading_2", "heading_3", "quote"].includes(b.type)) {
      const t = txt(b[b.type].rich_text);
      if (t.trim()) parties.push(t);
    }
  }
  fermer();
  return parties.join("\n\n");
}

/**
 * @param {object} v { prenom, programme, lienContrat, lienPaiement }
 * @param {object} modele la page du modèle (propriété « Objet du mail »)
 * @param {Array} blocs les blocs du modèle
 */
export function brouillon(v, modele, blocs) {
  let corps = texteDuModele(blocs);
  let objet = txt(modele.properties["Objet du mail"]?.rich_text) || "Votre inscription";
  if (!v.lienPaiement) {
    // Financement entreprise ou OPCO : pas de lien de paiement, la liste se termine sur le contrat
    corps = corps.split("\n").filter((l) => !l.includes("{{lien_paiement}}")).join("\n");
    corps = corps.replace(/(\n- [^\n]*?)\s*;\s*(\n\n|$)/, "$1.$2");
    objet = objet.replace(/,? (et )?paiement/, "").replace(/devis, contrat/, "devis et contrat");
  }
  const vars = { prenom: v.prenom, programme: v.programme, lien_contrat: v.lienContrat, lien_paiement: v.lienPaiement || "" };
  const remplir = (s) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  return `Objet : ${remplir(objet)}\n\n${remplir(corps)}`;
}

/** Le texte en morceaux pour une propriété Notion (2 000 caractères maximum par morceau). */
export const enRichText = (s) => (s.match(/[\s\S]{1,1900}/g) || [""]).map((c) => ({ type: "text", text: { content: c } }));
