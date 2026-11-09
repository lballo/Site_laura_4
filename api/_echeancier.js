// L'échéancier d'un accompagnement : une seule source pour le contrat (article V) et la page de paiement Stripe.
//
// Règles de Laura (nov. 2026) :
// - 1 fois : réglé avant le démarrage.
// - 2 fois : 1er versement avant le démarrage, 2e prélevé automatiquement à la moitié de la durée de l'offre
//   (« Durée (mois) » de l'offre, 3 mois si vide → un mois et demi, soit 45 jours).
// - 3 fois : 1er versement avant le démarrage, puis prélèvement automatique chaque mois.
// - En plusieurs fois, jamais de nouveau lien : la carte est enregistrée au 1er versement et Stripe prélève la suite.
// - Paiement en ligne seulement pour un financement personnel : entreprise, OPCO et autres financeurs passent par le devis.

export const FINANCEMENT_EN_LIGNE = ["", "Financement personnel"];

const enLettres = (n) => ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze"][n] || String(n);

/** « un mois et demi », « deux mois », « 45 jours »… */
function delaiEnMots(mois) {
  const entier = Math.floor(mois), demi = Math.abs(mois - entier - 0.5) < 1e-9;
  if (Number.isInteger(mois)) return `${enLettres(mois)} mois`;
  if (demi) return `${enLettres(entier)} mois et demi`;
  return `${Math.round(mois * 30)} jours`;
}

/**
 * @param {number} tarif  en euros (Tarif appliqué)
 * @param {number} nb     1, 2 ou 3 (Paiement en)
 * @param {number|null} dureeMois  Durée (mois) de l'offre
 * @returns {{ nb, centimes, premier, suivant, intervalle, delai, montants }}
 *   premier / suivant : montants en centimes (le premier absorbe l'arrondi) ;
 *   intervalle : { interval: "day"|"month", interval_count } entre deux prélèvements (null en 1 fois) ;
 *   delai : le même délai en mots, pour le contrat.
 */
export function echeancier(tarif, nb, dureeMois) {
  nb = [1, 2, 3].includes(nb) ? nb : 1;
  const centimes = Math.round((Number(tarif) || 0) * 100);
  const suivant = Math.floor(centimes / nb), premier = centimes - suivant * (nb - 1);
  let intervalle = null, delai = "";
  if (nb === 2) {
    const moitie = (dureeMois > 0 ? dureeMois : 3) / 2;
    intervalle = Number.isInteger(moitie) ? { interval: "month", interval_count: moitie } : { interval: "day", interval_count: Math.round(moitie * 30) };
    delai = delaiEnMots(moitie);
  } else if (nb === 3) {
    intervalle = { interval: "month", interval_count: 1 };
    delai = "un mois";
  }
  return { nb, centimes, premier, suivant, intervalle, delai, montants: Array.from({ length: nb }, (_, i) => (i === 0 ? premier : suivant)) };
}

/** Ajoute un intervalle à une date (UTC), autant de fois que demandé. */
export function decaler(date, intervalle, fois = 1) {
  const d = new Date(date);
  if (!intervalle) return d;
  if (intervalle.interval === "month") d.setUTCMonth(d.getUTCMonth() + intervalle.interval_count * fois);
  else d.setUTCDate(d.getUTCDate() + intervalle.interval_count * fois);
  return d;
}

const euros = (centimes) => {
  const x = Math.round(centimes) / 100;
  return x.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 }).replace(/[  ]/g, " ");
};
export { euros as eurosCentimes };

/** La phrase de l'article V du contrat. `enLigne` : le client paie lui-même par carte (prélèvements automatiques). */
export function phraseModalites(e, enLigne) {
  if (e.nb === 1) return "Ce montant est réglé en une seule fois avant le démarrage de la prestation.";
  const egal = e.premier === e.suivant;
  if (!enLigne) {
    if (e.nb === 2) return `Ce montant est réglé en deux versements${egal ? ` de ${euros(e.suivant)} euros` : ""} : le premier avant le démarrage de la prestation, le second ${e.delai} plus tard.`;
    return `Ce montant est réglé en trois versements mensuels${egal ? ` de ${euros(e.suivant)} euros` : ""}, le premier avant le démarrage de la prestation.`;
  }
  const montants = egal ? ` de ${euros(e.suivant)} euros` : ` (${euros(e.premier)} euros, puis ${e.nb === 2 ? "" : "deux fois "}${euros(e.suivant)} euros)`;
  if (e.nb === 2) return `Ce montant est réglé par carte bancaire en deux versements${montants} : le premier avant le démarrage de la prestation, le second prélevé automatiquement sur la même carte ${e.delai} plus tard.`;
  return `Ce montant est réglé par carte bancaire en trois versements mensuels${montants} : le premier avant le démarrage de la prestation, les deux suivants prélevés automatiquement sur la même carte, un mois puis deux mois plus tard.`;
}
