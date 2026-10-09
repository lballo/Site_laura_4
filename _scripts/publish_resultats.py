#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════
  Notion → Page publique « Nos résultats » (Qualiopi, ind. 2)
═══════════════════════════════════════════════════════════
  Génère /resultats/index.html depuis la base « 📈 Indicateurs publiés »,
  alimentée chaque mois par n8n. La page affiche :

    - les indicateurs toutes formations confondues ;
    - un tableau par formation (liens vers les fiches publiées) ;
    - le dispositif de mesure et la méthode de calcul de chaque
      indicateur, reprise mot pour mot de Notion.

  Tourne après publish_formations.py dans la GitHub Action. Comme lui,
  il committe et pousse lui-même ce qu'il a produit.

  Usage :
    python _scripts/publish_resultats.py
═══════════════════════════════════════════════════════════
"""

import subprocess
from datetime import datetime, timezone
from pathlib import Path

import requests

import indicateurs
from indicateurs import date_fr, effectif, esc, libelle, valeur_affichee
from publish_formations import (
    FORMATIONS_DB,
    NOTION_API_KEY,
    PUBLIE,
    STATUT_PROP,
    NotionClient,
    charger_organisme,
    env,
    prop,
)

TEMPLATE_PATH = env("RESULTATS_TEMPLATE_PATH", "_templates/resultats.html")
OUTPUT_PATH = env("RESULTATS_OUTPUT_PATH", "resultats/index.html")


# ═════════════════════════════════════════════════════════
# RENDU
# ═════════════════════════════════════════════════════════
def carte(l):
    lib, sous = libelle(l)
    v = valeur_affichee(l)
    if v is not None:
        valeur = f'<div class="valeur">{v}</div>'
        det = effectif(l)
        detail = f'<div class="detail">{esc(det)}</div>' if det else ""
    else:
        valeur = '<div class="valeur attente">—</div>'
        detail = f'<div class="detail">{esc(l["texte"] or "Pas encore de données sur la période.")}</div>'
    return (
        '                    <div class="carte">\n'
        f'                        <div class="libelle">{esc(lib)}</div>\n'
        f'                        <div class="sous">{esc(sous)}</div>\n'
        f"                        {valeur}\n"
        f"                        {detail}\n"
        "                    </div>"
    )


def cartes_html(globaux):
    if not globaux:
        return (
            '                <div class="vide">Premiers résultats en cours de collecte : '
            "les indicateurs seront publiés dès la première session terminée.</div>"
        )
    return '                <div class="grille">\n' + "\n".join(carte(l) for l in globaux) + "\n                </div>"


def cellule(l):
    v = valeur_affichee(l)
    if v is None:
        det = effectif(l) or "en attente"
        return f'<td class="attente">—<span class="n">{esc(det)} à ce jour</span></td>'
    det = effectif(l)
    return f'<td class="num">{v}' + (f'<span class="n">{esc(det)}</span>' if det else "") + "</td>"


def table_formations_html(lignes, formations):
    """Une ligne par formation ayant des indicateurs, une colonne par indicateur."""
    par_fid = {}
    for l in lignes:
        if l["perimetre"] == "Par formation" and l["formation"]:
            par_fid.setdefault(l["formation"], []).append(l)
    if not par_fid:
        return (
            '                <div class="vide">Aucune formation n\'a encore de session terminée '
            "sur la période : les résultats par formation apparaîtront ici.</div>"
        )
    colonnes = [cle for cle, _, _ in indicateurs.ORDRE if any(l["indicateur"] == cle for ls in par_fid.values() for l in ls)]
    entetes = "".join(f"<th>{esc(indicateurs.LIBELLES[c][0])}</th>" for c in colonnes)
    lignes_html = []
    for fid, ls in par_fid.items():
        f = formations.get(fid, {})
        nom = esc(f.get("nom") or "Formation")
        if f.get("slug"):
            nom = f'<a href="/formations/{esc(f["slug"])}.html">{nom}</a>'
        cells = []
        for c in colonnes:
            l = next((x for x in ls if x["indicateur"] == c), None)
            cells.append(cellule(l) if l else '<td class="attente">—</td>')
        lignes_html.append(f"                            <tr><td>{nom}</td>{''.join(cells)}</tr>")
    lignes_html.sort()
    return (
        '                <div class="table-wrap">\n'
        "                    <table>\n"
        f"                        <thead><tr><th>Formation</th>{entetes}</tr></thead>\n"
        "                        <tbody>\n" + "\n".join(lignes_html) + "\n"
        "                        </tbody>\n"
        "                    </table>\n"
        "                </div>"
    )


def methodes_html(globaux):
    items = []
    for l in globaux:
        if not l["methode"]:
            continue
        lib, _ = libelle(l)
        items.append(
            '                    <div class="methode-item">\n'
            f"                        <h3>{esc(lib)}</h3>\n"
            f'                        <p>{esc(l["methode"])}</p>\n'
            "                    </div>"
        )
    return "\n".join(items) or '                    <div class="vide">Méthodes de calcul en cours de publication.</div>'


def charger_formations(client):
    pages = client.query_database(FORMATIONS_DB)
    out = {}
    for p in pages:
        out[p["id"].replace("-", "")] = {
            "nom": prop(p, "Nom de la formation", "title"),
            "slug": prop(p, "slug") if prop(p, STATUT_PROP, "select") == PUBLIE else "",
        }
    return out


# ═════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════
def main():
    if not NOTION_API_KEY:
        raise SystemExit("\n❌ NOTION_API_KEY est vide.")
    if not Path(TEMPLATE_PATH).exists():
        raise SystemExit(f"\n❌ gabarit introuvable : {TEMPLATE_PATH}")

    client = NotionClient(NOTION_API_KEY)
    print("→ Lecture des indicateurs de résultats")
    lignes = indicateurs.charger(client)
    globaux = indicateurs.globaux(lignes)
    print(f"  {len(lignes)} ligne(s) actuelle(s), dont {len(globaux)} toutes formations")

    print("→ Lecture des formations et de 🏛️ Mon organisme")
    formations = charger_formations(client)
    org = charger_organisme(client)

    du = next((l["du"] for l in globaux if l["du"]), "")
    au = next((l["au"] for l in globaux if l["au"]), "")
    date_maj = indicateurs.date_calcul(lignes) or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    template = Path(TEMPLATE_PATH).read_text(encoding="utf-8")
    html = template
    for cle, val in {
        "DATE_MAJ": date_fr(date_maj),
        "PERIODE_DU": date_fr(du) or "—",
        "PERIODE_AU": date_fr(au) or "—",
        "CARTES_HTML": cartes_html(globaux),
        "TABLE_FORMATIONS_HTML": table_formations_html(lignes, formations),
        "METHODES_HTML": methodes_html(globaux),
        "ORGANISME_EMAIL": esc(org["email"]),
        "ORGANISME_NDA": esc(org["nda"]),
        "ORGANISME_NDA_PREFET": esc(org["nda_prefet"]),
    }.items():
        html = html.replace("{{" + cle + "}}", val)

    cible = Path(OUTPUT_PATH)
    cible.parent.mkdir(parents=True, exist_ok=True)
    ancien = cible.read_text(encoding="utf-8") if cible.exists() else ""
    if ancien == html:
        print("  Page inchangée")
        return
    cible.write_text(html, encoding="utf-8")
    print(f"  ✓ {cible}")

    try:
        subprocess.run(["git", "config", "user.name", "Notion Publisher Bot"], check=True)
        subprocess.run(["git", "config", "user.email", "bot@lauraballo.com"], check=True)
        subprocess.run(["git", "add", str(cible)], check=True)
        if subprocess.run(["git", "status", "--porcelain", str(cible)], capture_output=True, text=True).stdout.strip():
            subprocess.run(["git", "commit", "-m", f"📈 Page résultats mise à jour — {date_fr(date_maj)}"], check=True)
            subprocess.run(["git", "push"], check=True)
            print("  ✓ poussé")
    except subprocess.CalledProcessError as e:
        print(f"  ❌ Erreur git : {e}")


if __name__ == "__main__":
    main()
