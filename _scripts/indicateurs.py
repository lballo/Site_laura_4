#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════
  Indicateurs de résultats (Qualiopi, indicateur 2)
═══════════════════════════════════════════════════════════
  Lecture de la base Notion « 📈 Indicateurs publiés (Ind. 2) »,
  alimentée le 1er de chaque mois par le workflow n8n
  « Indicateurs de résultats — calcul mensuel », et rendu HTML :

    - encart « Résultats de cette formation » sur chaque fiche
      (utilisé par publish_formations.py) ;
    - page publique /resultats/ (utilisée par publish_resultats.py).

  Règle d'affichage : on ne publie un chiffre que si la case
  « Chiffre publiable » est cochée dans Notion (seuil de réponses
  décidé côté n8n). Sinon, on affiche le « Texte affiché », qui
  indique le nombre de réponses collectées à ce jour. La méthode de
  calcul est reprise mot pour mot de Notion : c'est elle qui fait foi.
═══════════════════════════════════════════════════════════
"""

import html as html_module
import os
from datetime import datetime

INDICATEURS_DB = (os.environ.get("NOTION_INDICATEURS_DB_ID") or "").strip() or (
    "88a2c2bf0fbf47c5a286060f39faf861"
)

# Ordre d'affichage et libellés publics. Les clés sont les options du
# select « Indicateur » dans Notion : une option absente d'ici est quand
# même affichée, après les autres, avec son nom Notion.
ORDRE = [
    ("Stagiaires formés", "Stagiaires formés", "sur les 12 derniers mois"),
    ("Satisfaction", "Satisfaction à chaud", "note moyenne sur 5"),
    ("Taux de réponse satisfaction", "Taux de réponse", "au questionnaire de satisfaction"),
    ("Objectifs atteints", "Objectifs atteints", "à l'évaluation de fin de formation"),
    ("Objectifs partiellement atteints", "Objectifs partiellement atteints", "à l'évaluation de fin de formation"),
    ("Taux d'abandon", "Taux d'abandon", "interruptions en cours de formation"),
    ("Mise en pratique à J+90", "Mise en pratique à J+90", "trois mois après la formation"),
]
LIBELLES = {cle: (lib, sous) for cle, lib, sous in ORDRE}
RANG = {cle: i for i, (cle, _, _) in enumerate(ORDRE)}


def esc(t):
    return html_module.escape(t or "", quote=True)


def _prop(page, name, kind):
    p = page.get("properties", {}).get(name, {})
    if kind == "text":
        return "".join(r.get("plain_text", "") for r in p.get("rich_text", []))
    if kind == "title":
        return "".join(r.get("plain_text", "") for r in p.get("title", []))
    if kind == "select":
        s = p.get("select")
        return s.get("name", "") if s else ""
    if kind == "number":
        return p.get("number")
    if kind == "checkbox":
        return bool(p.get("checkbox"))
    if kind == "date":
        d = p.get("date")
        return d.get("start", "") if d else ""
    if kind == "relation":
        return [x.get("id", "").replace("-", "") for x in p.get("relation", [])]
    return ""


def date_fr(iso):
    """2026-10-01 → 1er octobre 2026."""
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso[:10])
    except ValueError:
        return iso
    mois = [
        "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
        "août", "septembre", "octobre", "novembre", "décembre",
    ]
    jour = "1er" if d.day == 1 else str(d.day)
    return f"{jour} {mois[d.month - 1]} {d.year}"


def charger(client):
    """Lignes « Actuel » de la base, sous forme de dicts simples."""
    pages = client.query_database(
        INDICATEURS_DB,
        {"property": "Statut", "select": {"equals": "Actuel"}},
    )
    lignes = []
    for p in pages:
        lignes.append(
            {
                "indicateur": _prop(p, "Indicateur", "select"),
                "perimetre": _prop(p, "Périmètre", "select"),
                "formation": (_prop(p, "📚 Formation", "relation") or [None])[0],
                "valeur": _prop(p, "Valeur", "number"),
                "unite": _prop(p, "Unité", "select"),
                "numerateur": _prop(p, "Numérateur", "number"),
                "denominateur": _prop(p, "Dénominateur", "number"),
                "texte": _prop(p, "Texte affiché", "text").strip(),
                "publiable": _prop(p, "Chiffre publiable", "checkbox"),
                "methode": _prop(p, "Méthode de calcul", "text").strip(),
                "du": _prop(p, "Période du", "date"),
                "au": _prop(p, "Période au", "date"),
                "calcul": _prop(p, "Date de calcul", "date"),
            }
        )
    lignes.sort(key=lambda l: RANG.get(l["indicateur"], 99))
    return lignes


def globaux(lignes):
    return [l for l in lignes if l["perimetre"] == "Toutes formations"]


def par_formation(lignes, formation_id):
    fid = (formation_id or "").replace("-", "")
    return [l for l in lignes if l["perimetre"] == "Par formation" and l["formation"] == fid]


def date_calcul(lignes):
    dates = [l["calcul"] for l in lignes if l["calcul"]]
    return max(dates) if dates else ""


def valeur_affichee(l):
    """Le chiffre tel qu'il s'affiche en gros, ou None si non publiable."""
    if not l["publiable"] or l["valeur"] is None:
        return None
    v = l["valeur"]
    if l["unite"] == "/5":
        return f"{v:.1f}".replace(".", ",") + "<small>/5</small>"
    if l["unite"] == "%":
        return f"{int(round(v))}<small>%</small>"
    return f"{int(v)}"


def libelle(l):
    lib, sous = LIBELLES.get(l["indicateur"], (l["indicateur"], ""))
    return lib, sous


def effectif(l):
    """« 7 réponses » / « 12 stagiaires » : l'effectif derrière le chiffre."""
    n = l["denominateur"]
    if n is None:
        return ""
    n = int(n)
    if l["indicateur"] == "Stagiaires formés":
        return ""
    if l["indicateur"] in ("Taux de réponse satisfaction", "Taux d'abandon"):
        return f"{n} stagiaire{'s' if n > 1 else ''}"
    if l["indicateur"] == "Satisfaction":
        return f"{n} avis"
    if l["indicateur"].startswith("Objectifs"):
        return f"{n} évaluation{'s' if n > 1 else ''}"
    return f"{n} réponse{'s' if n > 1 else ''}"


# ═════════════════════════════════════════════════════════
# RENDU : encart sur une fiche formation
# ═════════════════════════════════════════════════════════
def encart_formation_html(lignes_formation, date_maj):
    """Bloc « Résultats de cette formation ». Vide si aucune ligne."""
    if not lignes_formation:
        return ""
    cartes = []
    for l in lignes_formation:
        lib, _ = libelle(l)
        v = valeur_affichee(l)
        if v is not None:
            corps = f'<div class="resultat-valeur">{v}</div>'
            det = effectif(l)
            det_html = f'<div class="resultat-detail">{esc(det)}</div>' if det else ""
        else:
            corps = '<div class="resultat-valeur resultat-attente">—</div>'
            det_html = f'<div class="resultat-detail">{esc(l["texte"])}</div>'
        cartes.append(
            '                        <div class="resultat-carte">\n'
            f'                            <div class="resultat-libelle">{esc(lib)}</div>\n'
            f"                            {corps}\n"
            f"                            {det_html}\n"
            "                        </div>"
        )
    return (
        '            <!-- Résultats (indicateur 2) -->\n'
        '            <section class="section" id="resultats">\n'
        '                <h2 class="section-title">Résultats de cette formation</h2>\n'
        '                <div class="resultats-box">\n'
        '                    <div class="resultats-grille">\n'
        + "\n".join(cartes)
        + "\n                    </div>\n"
        f'                    <p class="resultats-note">Indicateurs calculés sur les 12 derniers mois, '
        f"mis à jour le {esc(date_fr(date_maj))}. "
        'Méthode de calcul et résultats de l\'ensemble des formations : '
        '<a href="/resultats/">nos résultats</a>.</p>\n'
        "                </div>\n"
        "            </section>\n"
    )


ENCART_CSS = """
        /* Résultats (indicateur 2) */
        .resultats-box {
            background: var(--light-beige);
            border-radius: 12px;
            padding: var(--space-lg);
            border: 1px solid var(--warm-beige);
        }
        .resultats-grille {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: var(--space-sm);
        }
        .resultat-carte {
            background: var(--white);
            border-radius: 10px;
            padding: var(--space-sm);
            border: 1px solid var(--warm-beige);
        }
        .resultat-libelle {
            font-size: 0.8rem;
            color: var(--warm-gray);
            margin-bottom: 6px;
            line-height: 1.3;
        }
        .resultat-valeur {
            font-family: var(--font-heading);
            font-size: 2rem;
            line-height: 1;
            color: var(--black);
        }
        .resultat-valeur small { font-size: 1rem; color: var(--warm-gray); margin-left: 2px; }
        .resultat-attente { color: var(--text-muted); }
        .resultat-detail {
            font-size: 0.78rem;
            color: var(--text-muted);
            margin-top: 6px;
            line-height: 1.4;
        }
        .resultats-note {
            font-size: 0.85rem;
            color: var(--warm-gray);
            margin-top: var(--space-md);
            line-height: 1.6;
        }
        .resultats-note a { color: var(--accent-dark); text-decoration: underline; text-underline-offset: 3px; }
"""
