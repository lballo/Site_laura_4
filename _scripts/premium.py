"""
═══════════════════════════════════════════════════════════
  Gabarit « Premium » des fiches formation (Présence exécutive)
═══════════════════════════════════════════════════════════
  Fonctions pures : elles reçoivent le texte des propriétés Notion
  et renvoient les fragments HTML attendus par
  _templates/formation-premium.html. Aucune dépendance à l'API Notion,
  pour pouvoir tester le rendu hors ligne.

  Conventions de saisie dans « Contenu de formation » (les mêmes que
  pour les autres fiches : ligne nue = bandeau, « • » = puce) :

    Trois déclinaisons
    • Titre : description (pied de carte facultatif entre parenthèses)
    Socle commun — 5 modules, dans toutes les configurations
    • Titre : description
    Modules complémentaires — choisis lors du cadrage
    • Titre (: description facultative)
    Trois configurations
    • Nom : durée, composition (étiquette ; « référence » met la carte en avant)

  Les autres bandeaux (Avant le programme, Après le programme…) sont
  affichés dans l'onglet « Objectifs ».
═══════════════════════════════════════════════════════════
"""

import html
import re
from urllib.parse import quote

PUCES = "•●*"
TIRETS = "—–"

NOMBRES = {
    1: "une", 2: "deux", 3: "trois", 4: "quatre", 5: "cinq",
    6: "six", 7: "sept", 8: "huit", 9: "neuf", 10: "dix",
}

EMAIL_DEFAUT = "contact@lauraballo.com"
TEL_DEFAUT = "+33643037926"

# Icônes des cartes « déclinaisons », attribuées dans l'ordre (puis en boucle)
ICONES_DECLINAISONS = [
    # progression : futurs dirigeants
    '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    # groupe : équipe de direction
    '<circle cx="12" cy="8" r="3"/><circle cx="5.5" cy="10.5" r="2.2"/><circle cx="18.5" cy="10.5" r="2.2"/>'
    '<path d="M7.5 20c.8-3 2.4-4.6 4.5-4.6s3.7 1.6 4.5 4.6"/><path d="M2 19c.5-2.1 1.6-3.3 3.3-3.3"/>'
    '<path d="M22 19c-.5-2.1-1.6-3.3-3.3-3.3"/>',
    # cycle : transformation
    '<path d="M20 12a8 8 0 0 1-14.3 4.9"/><path d="M4 12a8 8 0 0 1 14.3-4.9"/>'
    '<path d="M18.5 3.5v3.6h-3.6"/><path d="M5.5 20.5v-3.6h3.6"/>',
]
ICONE_HORLOGE = (
    '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3D3128" '
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex: none"><circle cx="12" cy="12" r="9"/>'
    '<path d="M12 7v5l3 2"/></svg>'
)


def esc(t):
    return html.escape(t or "", quote=True)


def lignes_de(texte):
    return [l.strip() for l in re.split(r"[\n\r]+", texte or "") if l.strip()]


def sans_puce(ligne):
    ligne = ligne.lstrip(PUCES + TIRETS + "-").strip()
    return re.sub(r"^\d+[.)]\s*", "", ligne)


def majuscule(t):
    t = (t or "").strip()
    return t[:1].upper() + t[1:] if t else t


def avec_point(t):
    t = (t or "").strip()
    return t if not t or t[-1] in ".!?…" else t + "."


def sans_point(t):
    return (t or "").strip().rstrip(".")


def nombre_lettres(n, majuscule_initiale=False):
    mot = NOMBRES.get(n, str(n))
    return majuscule(mot) if majuscule_initiale else mot


def pluriel(n, mot):
    return mot if n == 1 else mot + "s"


# ─────────────────────────────────────────────────────────
# « Contenu de formation » → sections
# ─────────────────────────────────────────────────────────
def sections_contenu(texte):
    """[(bandeau, [lignes de puce sans la puce])]. Les sous-titres « — »
    sont gardés comme des puces : le gabarit premium ne les distingue pas."""
    sections, courante = [], None
    for ligne in lignes_de(texte):
        if ligne[0] in PUCES or ligne[0] in TIRETS or ligne.startswith("- "):
            if courante is None:
                courante = ("Programme", [])
                sections.append(courante)
            courante[1].append(sans_puce(ligne))
        else:
            courante = (ligne, [])
            sections.append(courante)
    return sections


def _cle(titre):
    t = titre.lower()
    for a, b in (("é", "e"), ("è", "e"), ("ê", "e")):
        t = t.replace(a, b)
    if "declinaison" in t:
        return "declinaisons"
    if "socle" in t:
        return "socle"
    if "complementaire" in t:
        return "complementaires"
    if "configuration" in t:
        return "configurations"
    return "autre"


def classer(sections):
    out = {"declinaisons": [], "socle": [], "complementaires": [], "configurations": [], "autres": []}
    for titre, lignes in sections:
        cle = _cle(titre)
        if cle == "autre":
            out["autres"].append((titre, lignes))
        else:
            out[cle].extend(lignes)
    return out


PARENTHESE_FIN = re.compile(r"\s*\(([^()]*)\)\s*\.?\s*$")


def titre_et_texte(ligne):
    """« Titre : description (note) » → (titre, description, note)."""
    note = ""
    m = PARENTHESE_FIN.search(ligne)
    if m:
        note = m.group(1).strip()
        ligne = ligne[: m.start()]
    parts = re.split(r"\s*:\s+", ligne, maxsplit=1)
    titre = parts[0].strip()
    texte = parts[1].strip() if len(parts) > 1 else ""
    return titre, texte, note


def mois_de(duree):
    """« 3 mois » → (3, 3) ; « 9 à 12 mois » → (9, 12) ; sinon None."""
    nombres = [int(n) for n in re.findall(r"\d+", duree or "")]
    if not nombres or "mois" not in (duree or "").lower():
        return None
    return min(nombres), max(nombres)


def configurations(lignes):
    out = []
    for ligne in lignes:
        nom, reste, etiquette = titre_et_texte(ligne)
        duree, _, composition = reste.partition(",")
        out.append({
            "nom": nom,
            "duree": duree.strip(),
            "composition": composition.strip(),
            "etiquette": etiquette,
            "mois": mois_de(duree),
            "reference": "référence" in etiquette.lower() or "reference" in etiquette.lower(),
        })
    return out


def plage_mois(configs):
    bornes = [c["mois"] for c in configs if c["mois"]]
    if not bornes:
        return ""
    lo, hi = min(b[0] for b in bornes), max(b[1] for b in bornes)
    return f"{lo} mois" if lo == hi else f"{lo} à {hi} mois"


def configuration_reference(configs):
    for c in configs:
        if c["reference"]:
            return c
    return None


# ─────────────────────────────────────────────────────────
# Rendu HTML
# ─────────────────────────────────────────────────────────
I = " " * 16


MARRON = "#3D3128"
ACCENT = "#A83932"


def html_declinaisons(lignes):
    """Cartes blanches à filet rouge au survol (maquette Claude Design du 23/10/2026)."""
    cartes = []
    for n, ligne in enumerate(lignes):
        titre, texte, pied = titre_et_texte(ligne)
        icone = ICONES_DECLINAISONS[n % len(ICONES_DECLINAISONS)]
        pied_html = ""
        if pied:
            pied_html = (
                '<div style="margin-top: auto; padding-top: 24px">\n'
                '<p style="margin: 0; padding-top: 16px; border-top: 1px solid #E8DDD6; display: flex; align-items: center; '
                'gap: 10px; font-size: 14px; font-weight: 500; line-height: 1.5; color: #2C2C2C">'
                f"{ICONE_HORLOGE}{esc(majuscule(pied))}</p>\n"
                "</div>\n"
            )
        cartes.append(
            '<article class="pe-card pe-lift" style="position: relative; display: flex; flex-direction: column; '
            'padding: 36px 32px; background: #FFFFFF; border: 1px solid #E8DDD6">\n'
            '<span class="pe-bar" aria-hidden="true"></span>\n'
            '<span class="pe-ico" style="display: flex; align-items: center; justify-content: center; width: 60px; '
            f'height: 60px; border-radius: 50%; background: #F3ECE8; color: {MARRON}"><svg aria-hidden="true" width="28" '
            'height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
            f'stroke-linejoin="round">{icone}</svg></span>\n'
            "<h3 style=\"margin: 22px 0 0; font-family: 'Playfair Display', Georgia, serif; font-weight: 400; "
            f'font-size: 26px; line-height: 1.22; color: #2C2C2C">{esc(titre)}</h3>\n'
            + (f'<p style="margin: 10px 0 0; font-size: 15.5px; line-height: 1.6; color: #6C6059">'
               f"{esc(avec_point(majuscule(texte)))}</p>\n" if texte else "")
            + pied_html
            + "</article>"
        )
    return "\n\n".join(cartes)


def html_socle(lignes):
    items = []
    for n, ligne in enumerate(lignes, start=1):
        titre, texte, _ = titre_et_texte(ligne)
        items.append(
            '<div class="pe-lift-dark" style="display: flex; gap: 18px; padding: 20px 22px; background: #1F1A16">\n'
            f"<span style=\"font-family: 'Playfair Display', Georgia, serif; font-size: 18px; color: #FFFFFF\">{n}</span>\n"
            "<div><p style=\"margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 19px; "
            f'line-height: 1.3; color: #FFFFFF">{esc(titre)}</p>'
            + (f'<p style="margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: #FFFFFF">'
               f"{esc(sans_point(majuscule(texte)))}</p>" if texte else "")
            + "</div>\n</div>"
        )
    return "\n".join(items)


ICONE_MOINS = (
    '<span class="pe-acc-ico-open" aria-hidden="true" style="flex: none; display: flex; align-items: center; '
    f'justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: {ACCENT}; color: #FFFFFF">'
    '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7h8" fill="none" stroke="currentColor" '
    'stroke-width="1.6" stroke-linecap="round"></path></svg></span>'
)
ICONE_PLUS = (
    '<span class="pe-acc-ico-closed" aria-hidden="true" style="flex: none; display: flex; align-items: center; '
    f'justify-content: center; width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid {ACCENT}; color: {ACCENT}">'
    '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7h8M7 3v8" fill="none" stroke="currentColor" '
    'stroke-width="1.6" stroke-linecap="round"></path></svg></span>'
)


def html_complementaires(lignes):
    """Accordéon : titre du module, description dépliable (le premier est ouvert)."""
    items = []
    for n, ligne in enumerate(lignes):
        titre, texte, _ = titre_et_texte(ligne)
        ouvert = "true" if n == 0 and texte else "false"
        if texte:
            bouton = (
                f'<button type="button" data-acc-btn="m" aria-controls="pe-m-{n}" aria-expanded="{ouvert}" '
                'style="width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; '
                "padding: 20px 2px; min-height: 56px; background: none; border: 0; cursor: pointer; text-align: left; "
                "font-family: 'Playfair Display', Georgia, serif; font-size: 19px; line-height: 1.3; color: #2C2C2C\">"
                f"<span>{esc(titre)}</span>{ICONE_MOINS}{ICONE_PLUS}</button>\n"
                f'<div class="pe-acc-panel" id="pe-m-{n}"><p style="margin: 0 0 22px; padding-right: 48px; '
                f'font-size: 15px; line-height: 1.65; color: #6C6059">{esc(avec_point(majuscule(texte)))}</p></div>\n'
            )
        else:
            bouton = (
                "<p style=\"margin: 0; padding: 20px 2px; font-family: 'Playfair Display', Georgia, serif; "
                f'font-size: 19px; line-height: 1.3; color: #2C2C2C">{esc(titre)}</p>\n'
            )
        items.append('<div style="border-bottom: 1px solid #D9CBBC">\n' + bouton + "</div>")
    return "\n".join(items)


def html_configurations(configs):
    max_mois = max([c["mois"][1] for c in configs if c["mois"]] or [12])
    items = []
    for c in configs:
        largeur = round(c["mois"][1] / max_mois * 100) if c["mois"] else 100
        if c["reference"]:
            cadre = ("border: 1px solid #E0D3BD; background: linear-gradient(155deg, rgba(224, 211, 189, 0.18) 0%, "
                     "rgba(224, 211, 189, 0.05) 60%, rgba(168, 57, 50, 0.14) 100%)")
            couleur_tag = "#E0D3BD"
        else:
            cadre = ("border: 1px solid rgba(250, 244, 239, 0.14); background: linear-gradient(155deg, #2E2621 0%, "
                     "#1F1A16 55%, #2A1B17 100%)")
            couleur_tag = "#E8DDD6"
        items.append(
            f'<div class="pe-lift-dark" style="padding: 30px 28px; {cadre}">\n'
            + (f'<p style="margin: 0; font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; '
               f'color: {couleur_tag}">{esc(majuscule(c["etiquette"]))}</p>\n' if c["etiquette"] else "")
            + "<p style=\"margin: 20px 0 0; font-family: 'Playfair Display', Georgia, serif; font-size: 44px; "
            f'line-height: 1; color: #FAF4EF">{esc(c["duree"])}</p>\n'
            '<div aria-hidden="true" style="margin-top: 20px; height: 3px; background: rgba(250, 244, 239, 0.1)">'
            f'<div style="width: {largeur}%; height: 3px; background: #E0D3BD"></div></div>\n'
            f'<p style="margin: 20px 0 0; font-size: 17px; font-weight: 600; color: #FAF4EF">{esc(c["nom"])}</p>\n'
            + (f'<p style="margin: 10px 0 0; font-size: 14.5px; line-height: 1.6; color: #E8DDD6">'
               f'{esc(avec_point(majuscule(c["composition"])))}</p>\n' if c["composition"] else "")
            + "</div>"
        )
    return "\n".join(items)


def html_autres_sections(autres):
    """Bandeaux non reconnus (Avant / Après le programme…) : titre + puces."""
    out = []
    for titre, lignes in autres:
        if not lignes:
            continue
        out.append(f"<h3>{esc(titre)}</h3>")
        out.append('<ul class="pe-dash">')
        for l in lignes:
            out.append(f"<li>{esc(avec_point(majuscule(l)))}</li>")
        out.append("</ul>")
    return "\n".join(out)


def html_liste(texte, separateur=None):
    """Lignes (ou éléments séparés par « • ») → <li>."""
    elements = []
    for ligne in lignes_de(texte):
        parts = re.split(r"\s*[•●]\s*", ligne) if separateur else [ligne]
        for p in parts:
            p = sans_puce(p).strip()
            if p:
                elements.append(p)
    return "\n".join(f"{I}                    <li>{esc(e)}</li>" for e in elements)


def html_objectifs(texte):
    """Lignes numérotées → objectifs ; lignes non numérotées → note sous la liste."""
    items, notes = [], []
    for ligne in lignes_de(texte):
        if re.match(r"^\d+\s*[.)\\]", ligne) or ligne[0] in PUCES:
            items.append(re.sub(r"^\d+\s*\\?[.)]\s*", "", ligne).lstrip(PUCES).strip())
        else:
            notes.append(ligne)
    items_html = "\n".join(f"{I}                    <li>{esc(i)}</li>" for i in items)
    notes_html = "\n".join(f'{I}                <p class="pe-note">{esc(n)}</p>' for n in notes)
    return items_html, notes_html


def perimetre(texte):
    """« Compris : … » / « Non compris : … » → (compris, non_compris)."""
    compris, non_compris = [], []
    for ligne in lignes_de(texte):
        m = re.match(r"^(non\s+compris|compris)\s*:\s*(.*)$", ligne, re.I)
        if m:
            cible = non_compris if m.group(1).lower().startswith("non") else compris
            cible.append(majuscule(m.group(2)))
        elif non_compris:
            non_compris.append(ligne)
        else:
            compris.append(ligne)
    return " ".join(compris), " ".join(non_compris)


def plage_participants(modalites, maxi):
    """Cherche « 6 à 12 participants » dans les modalités, sinon « Jusqu'à N participants »."""
    m = re.search(r"(\d+)\s*à\s*(\d+)\s*participants", modalites or "")
    if m:
        return f"{m.group(1)} à {m.group(2)} participants"
    return f"Jusqu'à {maxi} participants" if maxi else "Petit groupe"


def couper_titre(nom):
    """« Présence exécutive — Programme pour dirigeants » → (titre, sous-titre)."""
    parts = re.split(r"\s+[—–]\s+", nom or "", maxsplit=1)
    return parts[0].strip(), (parts[1].strip() if len(parts) > 1 else "")


def telephone(numero):
    """(affichage, href) : « 0643037926 » → (« +33 6 43 03 79 26 », « +33643037926 »)."""
    chiffres = re.sub(r"[^\d+]", "", numero or "") or TEL_DEFAUT
    if chiffres.startswith("0") and len(chiffres) == 10:
        chiffres = "+33" + chiffres[1:]
    if chiffres.startswith("+33") and len(chiffres) == 12:
        n = chiffres[3:]
        return f"+33 {n[0]} {n[1:3]} {n[3:5]} {n[5:7]} {n[7:9]}", chiffres
    return numero or chiffres, chiffres


def mailto(email, sujet):
    return f"mailto:{email}?subject={quote(sujet)}"


def html_avis(avis, periode, criteres):
    """Onglet « Avis et résultats » au style premium."""
    if not avis:
        return (
            f'{I}        <div style="max-width: 640px">\n'
            f'{I}            <p class="pe-avis-lead">Les résultats seront publiés à l\'issue de la première promotion.</p>\n'
            f'{I}            <p style="margin-top: 14px">Vous trouverez ici la note moyenne et le nombre d\'avis issus des '
            "questionnaires de satisfaction à chaud, ainsi que le nombre de stagiaires formés. Un commentaire "
            "n'est publié qu'avec l'accord explicite du participant.</p>\n"
            f"{I}        </div>"
        )
    du, au = periode
    note = str(avis["moyenne"]).replace(".", ",")
    verbatims = avis.get("verbatims", [])
    liste = ""
    if verbatims:
        liste = f'{I}        <div class="pe-avis-list">\n' + "\n".join(
            f'{I}            <figure class="pe-avis-item"><blockquote>« {esc(v["verbatim"])} »</blockquote>'
            f'<p>{esc(v["signature"])}</p></figure>'
            for v in verbatims
        ) + f"\n{I}        </div>"
    else:
        liste = (
            f'{I}        <p class="pe-note" style="margin-top: 20px">Les participants n\'ont pas souhaité que leur '
            "commentaire soit publié ; seules leurs notes sont prises en compte.</p>"
        )
    return (
        f'{I}        <div class="pe-avis-score"><strong>{note}<span style="font-size: 22px">/5</span></strong>'
        f'<span class="stars" aria-hidden="true">{avis["stars"]}</span>'
        f'<span>{avis["total"]} avis à chaud</span></div>\n'
        f'{I}        <p style="margin-top: 14px; max-width: 640px">Note moyenne des questionnaires de satisfaction remplis '
        f"à chaud, en fin de séminaire, par les participants des sessions organisées par Laura Ballo Coaching entre le "
        f"{du} et le {au}. Chaque note est la moyenne de cinq critères sur 10 ({criteres}), ramenée sur 5. Toutes les "
        "notes sont comptées ; seuls les commentaires dont la publication a été autorisée par leur auteur sont affichés.</p>\n"
        f"{liste}"
    )


# ─────────────────────────────────────────────────────────
# Assemblage
# ─────────────────────────────────────────────────────────
def slots(champs, org, avis, periode, criteres, pdf_url):
    """Toutes les valeurs propres au gabarit premium.

    champs : textes bruts des propriétés Notion (voir publish_formations.champs_premium)
    org    : 🏛️ Mon organisme (dict de charger_organisme)
    avis   : dict de bloc_avis (+ « verbatims ») ou None
    """
    sections = classer(sections_contenu(champs["contenu"]))
    configs = configurations(sections["configurations"])
    reference = configuration_reference(configs)
    titre, sous_titre = couper_titre(champs["nom"])

    plage = plage_mois(configs)
    jours, heures = champs.get("jours"), champs.get("heures")
    seminaire = ""
    if jours:
        j = int(jours)
        seminaire = f"{j} jour{'s' if j > 1 else ''} de séminaire"
        if heures:
            seminaire += f" ({int(heures)} h)"
        if reference:
            seminaire += " en configuration de référence"
    duree_detail = " · ".join(x for x in (plage, seminaire) if x)

    modalite = (champs.get("modalites") or "").strip().lower()
    format_txt = "Intra-entreprise" + (f", {modalite}" if modalite else "")

    nb_decl = len(sections["declinaisons"])
    nb_conf = len(configs)
    objectifs_html, objectifs_note = html_objectifs(champs["objectifs"])
    compris, non_compris = perimetre(champs["perimetre"])

    email = (org.get("email") or "").strip() or EMAIL_DEFAUT
    tel_affiche, tel_href = telephone(org.get("telephone"))
    nom_court = titre or "la formation"

    if pdf_url:
        pdf_href, pdf_attrs = pdf_url, ' target="_blank" rel="noopener"'
        pdf_hero, pdf_aside = "Télécharger le programme", "Programme détaillé (PDF)"
    else:
        pdf_href = mailto(email, f"Programme détaillé – {nom_court}")
        pdf_attrs = ""
        pdf_hero, pdf_aside = "Recevoir le programme", "Recevoir le programme détaillé"

    niveau = {"1": "Niveau 1, fondamentaux", "2": "Niveau 2, perfectionnement"}.get(
        str(champs.get("niveau") or ""), "Tous niveaux"
    )

    return {
        "TITRE_PRINCIPAL": esc(titre),
        "SOUS_TITRE": esc(sous_titre),
        "ACCROCHE": esc(avec_point(champs["accroche"])),
        "DUREE_PLAGE": esc(plage or seminaire),
        "DUREE_DETAIL": esc(duree_detail),
        "GROUPE_PLAGE": esc(plage_participants(champs["modalites_peda"], champs.get("max"))),
        "FORMAT": esc(format_txt),
        "NIVEAU_COURT": niveau,
        "DECLINAISONS_EYEBROW": f"{nombre_lettres(nb_decl, True)} {pluriel(nb_decl, 'déclinaison')}",
        "DECLINAISONS_NOMBRE": nombre_lettres(nb_decl),
        "DECLINAISONS_HTML": html_declinaisons(sections["declinaisons"]),
        "SOCLE_NOMBRE": str(len(sections["socle"])),
        "SOCLE_HTML": html_socle(sections["socle"]),
        "COMPLEMENTAIRES_HTML": html_complementaires(sections["complementaires"]),
        "CONFIGURATIONS_TITRE": f"{nombre_lettres(nb_conf, True)} {pluriel(nb_conf, 'configuration')}",
        "CONFIGURATIONS_HTML": html_configurations(configs),
        "PROGRAMME_AUTRES_HTML": html_autres_sections(sections["autres"]),
        "OBJECTIF_PRO": esc(champs["objectif_pro"]),
        "OBJECTIFS_HTML": objectifs_html,
        "OBJECTIFS_NOTE_HTML": objectifs_note,
        "PUBLIC_HTML": html_liste(champs["public"]),
        "MODALITES_PEDA": esc(champs["modalites_peda"]),
        "METHODES": esc(champs["methodes"]),
        "EVALUATION_HTML": html_liste(champs["evaluation"], separateur="•"),
        "COMPRIS": esc(compris),
        "NON_COMPRIS": esc(non_compris),
        "AVIS_PREMIUM_HTML": html_avis(avis, periode, criteres),
        "PDF_HREF": esc(pdf_href),
        "PDF_ATTRS": pdf_attrs,
        "PDF_LIBELLE_HERO": pdf_hero,
        "PDF_LIBELLE_ASIDE": pdf_aside,
        "MAILTO_DEVIS": esc(mailto(email, f"Demande de devis – {nom_court}")),
        "MAILTO_CADRAGE": esc(mailto(email, f"Entretien de cadrage – {nom_court}")),
        "ORGANISME_EMAIL": esc(email),
        "ORGANISME_TEL": esc(tel_affiche),
        "ORGANISME_TEL_HREF": esc(tel_href),
    }


def resume_carte(contenu, jours):
    """Pour le catalogue : durée affichée sur la carte (« 3 à 12 mois »)."""
    plage = plage_mois(configurations(classer(sections_contenu(contenu))["configurations"]))
    if plage:
        return plage
    j = int(jours or 1)
    return f"{j} jour{'s' if j > 1 else ''}"
