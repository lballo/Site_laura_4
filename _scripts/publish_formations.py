#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════
  Notion → Pages formation — Laura Ballo Coaching
═══════════════════════════════════════════════════════════
  Génère /formations/<slug>.html depuis la base « 📚 Formations
  (Catalogue) », en fonction de la propriété « Statut publication ».

    À publier / À modifier → la page est (re)générée, statut → Publié
    À supprimer            → la page est retirée, statut → Non publié
    Publié / Non publié    → aucune action

  Les avis proviennent de « 😊 Satisfaction », en remontant la chaîne
  Satisfaction → Participant → Sessions → Formation.

    Note affichée   : moyenne des « Note publique /5 » de TOUS les avis
                      de la formation, consentement ou non.
    Verbatims       : uniquement ceux dont « Accepte témoignage » est coché.

  Le sitemap n'est pas modifié ici : generate_sitemap.py scanne les
  fichiers .html et doit être lancé juste après.

  Usage (GitHub Action) :
    python _scripts/publish_formations.py
    python _scripts/generate_sitemap.py
═══════════════════════════════════════════════════════════
"""

import os
import re
import json
import html as html_module
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import requests

# ─────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────
NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
FORMATIONS_DB = os.environ.get(
    "NOTION_FORMATIONS_DB_ID", "2fd075e127d2817c9efdf1339b79a765"
)
SATISFACTION_DB = os.environ.get(
    "NOTION_SATISFACTION_DB_ID", "2fd075e127d28173b179cfb3a4c0fc95"
)

TEMPLATE_PATH = os.environ.get("FORMATION_TEMPLATE_PATH", "_templates/formation.html")
INDEX_TEMPLATE_PATH = os.environ.get(
    "FORMATIONS_INDEX_TEMPLATE_PATH", "_templates/formations-index.html"
)
OUTPUT_DIR = os.environ.get("FORMATIONS_OUTPUT_DIR", "formations")
IMAGES_DIR = "assets/img/formations"

SITE_URL = "https://lauraballo.com"
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

STATUT_PROP = "Statut publication"
A_PUBLIER, A_MODIFIER, A_SUPPRIMER = "À publier", "À modifier", "À supprimer"
PUBLIE, NON_PUBLIE = "Publié", "Non publié"

# Sections attendues dans le corps de la fiche Notion (heading_2)
SEC_OBJECTIFS = "objectifs"
SEC_APPROCHE = "approche"
SEC_PROGRAMME = "programme"
SEC_PEDAGOGIE = "pédagogiques"
SEC_EVALUATION = "évaluation"


# ═════════════════════════════════════════════════════════
# CLIENT NOTION
# ═════════════════════════════════════════════════════════
class NotionClient:
    def __init__(self, api_key):
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }
        self._page_cache = {}

    def _diagnostic(self, resp, quoi, identifiant):
        """Transforme une erreur HTTP Notion en message actionnable."""
        if resp.status_code == 401:
            raise SystemExit(
                "\n❌ Notion refuse la clé d'API (401).\n"
                "   → Vérifie le secret NOTION_API_KEY dans "
                "Settings > Secrets and variables > Actions."
            )
        if resp.status_code == 404:
            raise SystemExit(
                f"\n❌ Notion ne trouve pas {quoi} ({identifiant}).\n"
                "   Dans 9 cas sur 10 la base existe mais n'est pas partagée "
                "avec l'intégration.\n"
                "   → Ouvre la base dans Notion, menu ··· en haut à droite, "
                "Connexions, et ajoute ton intégration.\n"
                "   Les bases nécessaires : 📚 Formations, 😊 Satisfaction, "
                "👥 Participants et 📅 Sessions."
            )
        resp.raise_for_status()

    def query_database(self, database_id, filter_obj=None):
        url = f"{NOTION_API}/databases/{database_id}/query"
        payload, results = {}, []
        has_more, cursor = True, None
        if filter_obj:
            payload["filter"] = filter_obj
        while has_more:
            if cursor:
                payload["start_cursor"] = cursor
            r = requests.post(url, headers=self.headers, json=payload)
            if not r.ok:
                self._diagnostic(r, "la base de données", database_id)
            d = r.json()
            results.extend(d.get("results", []))
            has_more, cursor = d.get("has_more", False), d.get("next_cursor")
        return results

    def get_page(self, page_id):
        """Fetch d'une page, avec cache — on remonte beaucoup de relations."""
        if page_id in self._page_cache:
            return self._page_cache[page_id]
        r = requests.get(f"{NOTION_API}/pages/{page_id}", headers=self.headers)
        if not r.ok:
            self._diagnostic(r, "la page", page_id)
        page = r.json()
        self._page_cache[page_id] = page
        return page

    def get_blocks(self, block_id):
        url = f"{NOTION_API}/blocks/{block_id}/children"
        blocks, has_more, cursor = [], True, None
        while has_more:
            params = {"page_size": 100}
            if cursor:
                params["start_cursor"] = cursor
            r = requests.get(url, headers=self.headers, params=params)
            r.raise_for_status()
            d = r.json()
            blocks.extend(d.get("results", []))
            has_more, cursor = d.get("has_more", False), d.get("next_cursor")
        return blocks

    def update_page(self, page_id, properties):
        r = requests.patch(
            f"{NOTION_API}/pages/{page_id}",
            headers=self.headers,
            json={"properties": properties},
        )
        r.raise_for_status()
        return r.json()


# ═════════════════════════════════════════════════════════
# LECTURE DES PROPRIÉTÉS
# ═════════════════════════════════════════════════════════
def prop(page, name, kind="rich_text"):
    p = page.get("properties", {}).get(name, {})
    if kind in ("rich_text", "text"):
        return "".join(r.get("plain_text", "") for r in p.get("rich_text", []))
    if kind == "title":
        return "".join(r.get("plain_text", "") for r in p.get("title", []))
    if kind == "select":
        s = p.get("select")
        return s.get("name", "") if s else ""
    if kind == "multi_select":
        return [x.get("name", "") for x in p.get("multi_select", [])]
    if kind == "number":
        return p.get("number")
    if kind == "checkbox":
        return p.get("checkbox", False)
    if kind == "date":
        d = p.get("date")
        return d.get("start", "") if d else ""
    if kind == "relation":
        return [x.get("id") for x in p.get("relation", [])]
    if kind == "formula":
        f = p.get("formula", {})
        return f.get("number") if f.get("type") == "number" else f.get("string")
    return ""


def esc(text):
    return html_module.escape(text or "", quote=True)


# ═════════════════════════════════════════════════════════
# BLOCS NOTION → HTML
# ═════════════════════════════════════════════════════════
def rich_to_html(rich):
    out = []
    for r in rich or []:
        t = esc(r.get("plain_text", ""))
        a = r.get("annotations", {})
        if a.get("code"):
            t = f"<code>{t}</code>"
        if a.get("bold"):
            t = f"<strong>{t}</strong>"
        if a.get("italic"):
            t = f"<em>{t}</em>"
        link = (r.get("text") or {}).get("link")
        if link and link.get("url"):
            t = f'<a href="{esc(link["url"])}">{t}</a>'
        out.append(t)
    return "".join(out)


def rich_to_text(rich):
    return "".join(r.get("plain_text", "") for r in rich or [])


def split_sections(blocks):
    """Découpe le corps de la fiche en sections, clé = titre du heading_2 en minuscules."""
    sections, current = {}, None
    for b in blocks:
        if b.get("type") == "heading_2":
            title = rich_to_text(b["heading_2"]["rich_text"]).lower()
            current = title
            sections[current] = []
        elif current is not None:
            sections[current].append(b)
    return sections


def find_section(sections, keyword):
    for title, blocks in sections.items():
        if keyword in title:
            return blocks
    return []


def bullets_of(blocks):
    """Liste des items à puces d'un ensemble de blocs, en HTML inline."""
    items = []
    for b in blocks:
        if b.get("type") == "bulleted_list_item":
            items.append(rich_to_html(b["bulleted_list_item"]["rich_text"]))
    return items


def paragraphs_of(blocks):
    out = []
    for b in blocks:
        if b.get("type") == "paragraph":
            txt = rich_to_html(b["paragraph"]["rich_text"]).strip()
            if txt:
                out.append(txt)
    return out


# ─── Rendu des sections ──────────────────────────────────
def render_objectifs(blocks):
    items = bullets_of(blocks)
    return "\n".join(
        f'                        <li><span class="check">✓</span><span>{i}</span></li>'
        for i in items
    )


def render_presentation(blocks):
    paras = paragraphs_of(blocks)
    if not paras:
        return ""
    return "\n".join(f"                        <p>{p}</p>" for p in paras)


def render_programme(blocks):
    """
    heading_3 → une phase (Avant / Jour 1 / Jour 2 / Après)
    paragraphe en gras à l'intérieur → un sous-module (demi-journée)
    puces → les items
    """
    phases, current = [], None
    for b in blocks:
        t = b.get("type")
        if t == "heading_3":
            current = {
                "titre": rich_to_html(b["heading_3"]["rich_text"]),
                "blocs": [],
            }
            phases.append(current)
        elif current is not None:
            current["blocs"].append(b)

    out = []
    for n, phase in enumerate(phases, start=1):
        out.append('                <div class="programme-phase">')
        out.append('                    <div class="phase-header">')
        out.append(f'                        <span class="phase-number">{n:02d}</span>')
        out.append(
            f'                        <span class="phase-title">{phase["titre"]}</span>'
        )
        out.append("                    </div>")
        out.append('                    <div class="phase-content">')

        buffer, module = [], None

        def flush():
            if not buffer:
                return
            if module:
                out.append('                        <div class="module-block">')
                out.append('                            <div class="module-header">')
                out.append('                                <span class="module-number">—</span>')
                out.append(
                    f'                                <span class="module-title">{module}</span>'
                )
                out.append("                            </div>")
                out.append('                            <ul class="module-items">')
                for i in buffer:
                    out.append(f"                                <li>{i}</li>")
                out.append("                            </ul>")
                out.append("                        </div>")
            else:
                out.append('                        <ul class="phase-items">')
                for i in buffer:
                    out.append(
                        '                            <li><div class="phase-item-text">'
                        f'<span class="chevron">›</span><span>{i}</span></div></li>'
                    )
                out.append("                        </ul>")
            buffer.clear()

        for b in phase["blocs"]:
            t = b.get("type")
            if t == "paragraph":
                txt = rich_to_html(b["paragraph"]["rich_text"]).strip()
                if not txt:
                    continue
                flush()
                module = re.sub(r"</?strong>", "", txt)
            elif t == "bulleted_list_item":
                buffer.append(rich_to_html(b["bulleted_list_item"]["rich_text"]))
        flush()

        out.append("                    </div>")
        out.append("                </div>")
    return "\n".join(out)


def render_pedagogie(blocks):
    return " ".join(paragraphs_of(blocks))


EVAL_KEYS = [
    ("EVAL_AVANT", ("avant", "positionnement")),
    ("EVAL_PENDANT", ("pendant", "en cours")),
    ("EVAL_FIN", ("fin de formation", "en fin")),
    ("EVAL_APRES", ("après", "froid", "satisfaction")),
]


def render_evaluation(blocks):
    """
    Attend 4 puces préfixées (Avant / Pendant / En fin de formation / Après).
    Repli : si les préfixes ne sont pas trouvés, tout est regroupé dans EVAL_PENDANT.
    """
    items = bullets_of(blocks) or paragraphs_of(blocks)
    result = {k: "" for k, _ in EVAL_KEYS}
    matched = False
    for item in items:
        plain = re.sub(r"<[^>]+>", "", item).lower()
        for key, needles in EVAL_KEYS:
            if any(plain.startswith(n) or plain[:40].find(n) >= 0 for n in needles):
                if not result[key]:
                    result[key] = re.sub(r"^[^:]{0,45}:\s*", "", item).strip()
                    matched = True
                    break
    if not matched:
        result["EVAL_PENDANT"] = " ".join(items)
    return result


def render_liste_simple(texte, wrapper):
    """Transforme un champ texte multi-lignes (ou à puces ●) en <li>."""
    lignes = [
        l.strip().lstrip("●-•").strip()
        for l in re.split(r"[\n\r]+", texte or "")
        if l.strip()
    ]
    return "\n".join(wrapper(esc(l)) for l in lignes)


# ═════════════════════════════════════════════════════════
# AVIS : Satisfaction → Participant → Sessions → Formation
# ═════════════════════════════════════════════════════════
def collect_avis(client):
    """Retourne {formation_page_id: [avis, ...]}."""
    par_formation = {}
    entrees = client.query_database(SATISFACTION_DB)
    print(f"  {len(entrees)} entrée(s) de satisfaction")

    for e in entrees:
        note = prop(e, "Note publique /5", "formula")
        if note is None:
            continue  # questionnaire incomplet : ni note, ni verbatim

        participants = prop(e, "Participant", "relation")
        if not participants:
            continue

        # Remonter jusqu'aux formations
        formations = []
        prenom, initiale = "", ""
        for pid in participants:
            try:
                participant = client.get_page(pid)
            except requests.HTTPError:
                continue
            if not prenom:
                prenom = prop(participant, "Prénom") or ""
                nom_complet = prop(participant, "Nom complet", "title") or ""
                reste = nom_complet.replace(prenom, "").strip()
                initiale = f"{reste[0].upper()}." if reste else ""
            for sid in prop(participant, "📅 Sessions", "relation"):
                try:
                    session = client.get_page(sid)
                except requests.HTTPError:
                    continue
                formations.extend(prop(session, "Formation", "relation"))

        if not formations:
            continue

        auteur = " ".join(x for x in (prenom, initiale) if x).strip() or "Participant"
        avis = {
            "note": round(float(note), 1),
            "auteur": auteur,
            "fonction": prop(e, "Fonction"),
            "verbatim": prop(e, "Avis formation").strip(),
            "date": prop(e, "Date soumission", "date"),
            "publiable": prop(e, "Accepte témoignage", "checkbox"),
        }
        for fid in set(formations):
            par_formation.setdefault(fid.replace("-", ""), []).append(avis)

    return par_formation


def etoiles_html(note):
    """Étoiles pleines / demies / vides pour une note sur 5."""
    demi = round(note * 2) / 2
    out = []
    for i in range(1, 6):
        if demi >= i:
            out.append('<span class="star">★</span>')
        elif demi >= i - 0.5:
            out.append('<span class="star half">★</span>')
        else:
            out.append('<span class="star empty">☆</span>')
    return "".join(out)


def bloc_avis(avis_list):
    """Calcule tout ce que le template attend pour la section avis."""
    if not avis_list:
        return None

    notes = [a["note"] for a in avis_list]
    moyenne = round(sum(notes) / len(notes), 1)

    # Répartition par étoile, sur la note arrondie à l'entier
    compte = {n: 0 for n in range(1, 6)}
    for n in notes:
        compte[max(1, min(5, int(round(n))))] += 1
    total = len(notes)
    distribution = []
    for n in range(5, 0, -1):
        pct = round(compte[n] / total * 100)
        distribution.append(
            '                        <div class="avis-bar-row">\n'
            f'                            <span class="avis-bar-stars">{n} ★</span>\n'
            '                            <div class="avis-bar">'
            f'<div class="avis-bar-fill" style="width:{pct}%"></div></div>\n'
            f'                            <span class="avis-bar-percent">{pct}%</span>\n'
            "                        </div>"
        )

    # Verbatims consentis uniquement, du plus récent au plus ancien
    publiables = [a for a in avis_list if a["publiable"] and a["verbatim"]]
    publiables.sort(key=lambda a: a["date"] or "", reverse=True)

    items = []
    for a in publiables:
        try:
            d = datetime.fromisoformat(a["date"]).strftime("%d/%m/%Y")
        except (ValueError, TypeError):
            d = ""
        auteur = esc(a["auteur"])
        if a["fonction"]:
            auteur += f' <span class="avis-fonction">— {esc(a["fonction"])}</span>'
        items.append(
            '                <div class="avis-item">\n'
            '                    <div class="avis-item-header">\n'
            f'                        <span class="avis-author">{auteur}</span>\n'
            f'                        <span class="avis-date">{d}</span>\n'
            '                        <div class="avis-rating">\n'
            f'                            <div class="stars">{etoiles_html(a["note"])}</div>\n'
            f'                            <span class="avis-rating-score">{a["note"]}/5</span>\n'
            "                        </div>\n"
            "                    </div>\n"
            f'                    <p class="avis-comment">{esc(a["verbatim"])}</p>\n'
            "                </div>"
        )

    return {
        "moyenne": moyenne,
        "total": total,
        "stars": etoiles_html(moyenne),
        "distribution": "\n".join(distribution),
        "liste": "\n".join(items),
        "nb_publiables": len(publiables),
    }


# ═════════════════════════════════════════════════════════
# SCHEMA.ORG
# ═════════════════════════════════════════════════════════
def build_schema(d, avis):
    schema = {
        "@context": "https://schema.org",
        "@type": "Course",
        "name": d["TITLE"],
        "description": d["META_DESCRIPTION"],
        "url": f"{SITE_URL}/formations/{d['SLUG']}",
        "courseCode": d["CODE_FORMATION"],
        "provider": {
            "@type": "Organization",
            "name": "Laura Ballo Coaching",
            "url": SITE_URL,
        },
        "offers": {
            "@type": "Offer",
            "price": str(d["_tarif_inter"] or ""),
            "priceCurrency": "EUR",
            "category": "Inter-entreprise",
        },
        "hasCourseInstance": {
            "@type": "CourseInstance",
            "courseMode": d["MODALITES"],
            "courseWorkload": f"PT{int(d['_heures'] or 0)}H",
        },
    }
    if avis:
        schema["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": str(avis["moyenne"]),
            "reviewCount": str(avis["total"]),
            "bestRating": "5",
            "worstRating": "1",
        }
    return json.dumps(schema, ensure_ascii=False, indent=2)


# ═════════════════════════════════════════════════════════
# RENDU
# ═════════════════════════════════════════════════════════
BLOC_AVIS_HERO = re.compile(
    r"<!-- BLOC-AVIS-DEBUT.*?BLOC-AVIS-FIN -->", re.S
)
BLOC_AVIS_SECTION = re.compile(
    r"<!-- BLOC-AVIS-SECTION-DEBUT -->.*?<!-- BLOC-AVIS-SECTION-FIN -->", re.S
)


def render(template, data, avis):
    out = template
    if not avis or avis["nb_publiables"] == 0:
        # Pas d'avis publiable : on retire le bloc note du hero et la section avis
        out = BLOC_AVIS_HERO.sub("", out)
        out = BLOC_AVIS_SECTION.sub("", out)
    for key, value in data.items():
        if key.startswith("_"):
            continue
        out = out.replace("{{" + key + "}}", str(value if value is not None else ""))
    restants = re.findall(r"\{\{[A-Z_]+\}\}", out)
    if restants:
        print(f"    ⚠️  slots non remplis : {', '.join(sorted(set(restants)))}")
        for r in set(restants):
            out = out.replace(r, "")
    return out


def build_data(client, page, avis):
    slug = prop(page, "slug") or "formation"
    heures = prop(page, "Durée (heures)", "number")
    jours = prop(page, "Durée (jours)", "number")
    if jours and jours > 1:
        duree = f"{int(jours)} jours ({int(heures or 0)} heures)"
    else:
        duree = f"{int(jours or 1)} jour ({int(heures or 0)} heures)"

    sections = split_sections(client.get_blocks(page["id"]))
    evaluation = render_evaluation(find_section(sections, SEC_EVALUATION))

    presentation = render_presentation(find_section(sections, SEC_APPROCHE))
    if not presentation:
        presentation = f'                        <p>{esc(prop(page, "Méta-description"))}</p>'

    niveau = prop(page, "niveau", "select")
    niveau_label = {"1": "Niveau 1 — Fondamentaux", "2": "Niveau 2 — Perfectionnement"}.get(
        niveau, "Tous niveaux"
    )

    data = {
        "TITLE": esc(prop(page, "Nom de la formation", "title")),
        "TITLE_SEO": esc(prop(page, "Titre SEO") or prop(page, "Nom de la formation", "title")),
        "META_DESCRIPTION": esc(prop(page, "Méta-description")),
        "SLUG": slug,
        "ACCROCHE": esc(prop(page, "Accroche")),
        "BADGE": "Formation certifiée Qualiopi",
        "MODALITES": esc(prop(page, "Modalités", "select")),
        "NIVEAU_LABEL": niveau_label,
        "DUREE": duree,
        "TARIF_INTER": f"{int(prop(page, 'Tarif HT inter', 'number') or 0):,}".replace(",", " "),
        "TARIF_INTRA": f"{int(prop(page, 'Tarif HT intra', 'number') or 0):,}".replace(",", " "),
        "PARTICIPANTS_MAX": int(prop(page, "Nbre participants max", "number") or 0),
        "CODE_FORMATION": esc(prop(page, "Code formation")),
        "IMAGE_URL": image_url(page),
        "DELAIS_ACCES": esc(prop(page, "Délais d'accès")),
        "PERIMETRE_INTRA_HTML": render_liste_simple(
            prop(page, "Périmètre forfait intra"), lambda l: f"<p>{l}</p>"
        ),
        "PRESENTATION": presentation,
        "PUBLIC_CIBLE_HTML": render_liste_simple(
            prop(page, "Public cible"),
            lambda l: f'<li><span class="bullet">●</span> {l}</li>',
        ),
        "PREREQUIS": esc(prop(page, "Prérequis")),
        "OBJECTIFS_HTML": render_objectifs(find_section(sections, SEC_OBJECTIFS)),
        "PROGRAMME_HTML": render_programme(find_section(sections, SEC_PROGRAMME)),
        "PEDAGOGIE": render_pedagogie(find_section(sections, SEC_PEDAGOGIE)),
        "POINTS_FORTS_HTML": render_liste_simple(
            prop(page, "Points forts"),
            lambda l: f'<li><span class="chevron">›</span><span>{l}</span></li>',
        ),
        "NOTE_MOYENNE": avis["moyenne"] if avis else "",
        "NB_AVIS": avis["total"] if avis else 0,
        "STARS_HTML": avis["stars"] if avis else "",
        "AVIS_DISTRIBUTION_HTML": avis["distribution"] if avis else "",
        "AVIS_LIST_HTML": avis["liste"] if avis else "",
        "_tarif_inter": prop(page, "Tarif HT inter", "number"),
        "_heures": heures,
    }
    data.update(evaluation)
    data["SCHEMA_JSON"] = build_schema(data, avis)
    return data


# ═════════════════════════════════════════════════════════
# CATALOGUE (formations/index.html)
# ═════════════════════════════════════════════════════════
IMAGE_PAR_DEFAUT = "/assets/img/header-bg.webp"


def image_url(page):
    """Le nom du fichier est stocké dans Notion ; l'image vit dans le dépôt."""
    nom = prop(page, "Image (fichier)").strip()
    if not nom:
        return IMAGE_PAR_DEFAUT
    chemin = Path(IMAGES_DIR) / nom
    if not chemin.exists():
        print(f"    ⚠️  image absente du dépôt : {chemin}")
        return IMAGE_PAR_DEFAUT
    return f"/{IMAGES_DIR}/{nom}"


ICONE_HORLOGE = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
)
ICONE_GROUPE = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>'
    '<circle cx="9" cy="7" r="4"/></svg>'
)
ICONE_BOUCLIER = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
)
ICONE_FLECHE = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
)


def slugify(texte):
    t = (texte or "").lower()
    for a, b in (("à", "a"), ("â", "a"), ("é", "e"), ("è", "e"), ("ê", "e"),
                 ("î", "i"), ("ï", "i"), ("ô", "o"), ("û", "u"), ("ù", "u"),
                 ("ç", "c"), ("&", "et")):
        t = t.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def mots_cles(page):
    """Mots-clés de recherche : la propriété dédiée, sinon repli sur les Tags."""
    saisis = prop(page, "Mots-clés (recherche)").strip()
    if saisis:
        return ",".join(
            slugify(m) for m in re.split(r"[,\n;]+", saisis) if m.strip()
        )
    return ",".join(slugify(t) for t in tags_of(page))


def tags_of(page):
    t = prop(page, "Tags", "multi_select")
    return t if isinstance(t, list) else []


def render_carte(page):
    slug = prop(page, "slug")
    nom = prop(page, "Nom de la formation", "title")
    tags = tags_of(page)
    jours = int(prop(page, "Durée (jours)", "number") or 1)
    maxi = int(prop(page, "Nbre participants max", "number") or 0)
    tarif = f"{int(prop(page, 'Tarif HT inter', 'number') or 0):,}".replace(",", " ")

    categorie = prop(page, "Catégorie", "select") or "communication"
    data_tags = mots_cles(page)
    puces = "".join(f'<span class="card-tag">{esc(t)}</span>' for t in tags[1:3])
    tag_principal = esc(tags[0]) if tags else "Formation"
    pluriel = "s" if jours > 1 else ""

    return (
        '                <article class="formation-card"\n'
        f'                         data-category="{categorie}"\n'
        f'                         data-tags="{data_tags}">\n'
        '                    <div class="formation-card-image">\n'
        f'                        <img src="{image_url(page)}" alt="Formation {esc(nom)}" loading="lazy">\n'
        f'                        <div class="card-badge">{ICONE_BOUCLIER}Qualiopi</div>\n'
        "                    </div>\n"
        '                    <div class="formation-card-content">\n'
        '                        <div class="card-tags">\n'
        f'                            <span class="card-tag category">{tag_principal}</span>\n'
        f"                            {puces}\n"
        "                        </div>\n"
        f"                        <h3>{esc(nom)}</h3>\n"
        f'                        <p>{esc(prop(page, "Méta-description"))}</p>\n'
        '                        <div class="card-meta">\n'
        f'                            <div class="card-meta-item">{ICONE_HORLOGE}{jours} jour{pluriel}</div>\n'
        f'                            <div class="card-meta-item">{ICONE_GROUPE}{maxi} pers. max</div>\n'
        "                        </div>\n"
        f'                        <div class="card-price"><span class="amount">{tarif}€</span>'
        '<span class="suffix">HT / pers.</span></div>\n'
        f'                        <a href="/{OUTPUT_DIR}/{slug}.html" class="card-cta">\n'
        f"                            Voir le programme{ICONE_FLECHE}\n"
        "                        </a>\n"
        "                    </div>\n"
        "                </article>"
    )


def render_chatbot_js(pages):
    """Régénère le tableau JS du chatbot pour qu'il ne diverge jamais du catalogue."""
    entrees = []
    for i, page in enumerate(pages, start=1):
        jours = int(prop(page, "Durée (jours)", "number") or 1)
        pluriel = "s" if jours > 1 else ""
        tags_js = ", ".join(
            f"'{m}'" for m in mots_cles(page).split(",") if m
        )
        nom = json.dumps(prop(page, "Nom de la formation", "title"), ensure_ascii=False)
        accroche = json.dumps(prop(page, "Accroche"), ensure_ascii=False)
        entrees.append(
            "            {\n"
            f"                id: 'F{i}', code: '{prop(page, 'Code formation')}',\n"
            f"                name: {nom},\n"
            f"                subtitle: {accroche},\n"
            f"                url: '/{OUTPUT_DIR}/{prop(page, 'slug')}.html',\n"
            f"                format: '{jours} jour{pluriel}',\n"
            f"                tags: [{tags_js}]\n"
            "            }"
        )
    return ",\n".join(entrees)


def build_index_schema(pages):
    items = []
    for i, page in enumerate(pages, start=1):
        items.append(
            {
                "@type": "Course",
                "position": i,
                "name": prop(page, "Nom de la formation", "title"),
                "description": prop(page, "Méta-description"),
                "url": f"{SITE_URL}/{OUTPUT_DIR}/{prop(page, 'slug')}",
                "provider": {
                    "@type": "Organization",
                    "name": "Laura Ballo Coaching",
                },
                "offers": {
                    "@type": "Offer",
                    "price": str(int(prop(page, "Tarif HT inter", "number") or 0)),
                    "priceCurrency": "EUR",
                },
            }
        )
    return json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "Catalogue de formations professionnelles Laura Ballo",
            "numberOfItems": len(items),
            "itemListElement": items,
        },
        ensure_ascii=False,
        indent=2,
    )


def regenerer_index(client):
    """Reconstruit formations/index.html avec TOUTES les formations en statut Publié."""
    publiees = client.query_database(
        FORMATIONS_DB,
        {"property": STATUT_PROP, "select": {"equals": PUBLIE}},
    )
    publiees = [p for p in publiees if prop(p, "slug")]
    publiees.sort(key=lambda p: prop(p, "Code formation"))

    template = Path(INDEX_TEMPLATE_PATH).read_text(encoding="utf-8")
    html = (
        template.replace("{{CARDS_HTML}}", "\n\n".join(render_carte(p) for p in publiees))
        .replace("{{NB_FORMATIONS}}", str(len(publiees)))
        .replace("{{CHATBOT_FORMATIONS_JS}}", render_chatbot_js(publiees))
        .replace("{{SCHEMA_JSON}}", build_index_schema(publiees))
    )
    cible = Path(OUTPUT_DIR) / "index.html"
    cible.write_text(html, encoding="utf-8")
    print(f"  ✓ {cible} — {len(publiees)} formation(s) au catalogue")
    return str(cible)


# ═════════════════════════════════════════════════════════
# GIT
# ═════════════════════════════════════════════════════════
def git_commit(fichiers, message):
    if not fichiers:
        return
    try:
        subprocess.run(["git", "config", "user.name", "Notion Publisher Bot"], check=True)
        subprocess.run(["git", "config", "user.email", "bot@lauraballo.com"], check=True)
        subprocess.run(["git", "add", "-A", OUTPUT_DIR], check=True)
        Path(IMAGES_DIR).mkdir(parents=True, exist_ok=True)
        status = subprocess.run(
            ["git", "status", "--porcelain"], capture_output=True, text=True
        )
        if not status.stdout.strip():
            print("  Rien à committer")
            return
        subprocess.run(["git", "commit", "-m", message], check=True)
        subprocess.run(["git", "push"], check=True)
        print(f"  ✓ {len(fichiers)} fichier(s) poussé(s)")
    except subprocess.CalledProcessError as e:
        print(f"  ❌ Erreur git : {e}")


# ═════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════
def main():
    if not NOTION_API_KEY:
        raise SystemExit(
            "\n❌ NOTION_API_KEY est vide.\n"
            "   → Ajoute-le dans Settings > Secrets and variables > Actions."
        )

    for chemin, quoi in (
        (TEMPLATE_PATH, "le gabarit de fiche"),
        (INDEX_TEMPLATE_PATH, "le gabarit de catalogue"),
    ):
        if not Path(chemin).exists():
            raise SystemExit(f"\n❌ {quoi} est introuvable : {chemin}")

    print(f"  Base Formations   : {FORMATIONS_DB}")
    print(f"  Base Satisfaction : {SATISFACTION_DB}")

    client = NotionClient(NOTION_API_KEY)
    template = Path(TEMPLATE_PATH).read_text(encoding="utf-8")
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    print("→ Lecture des formations à traiter")
    a_traiter = client.query_database(
        FORMATIONS_DB,
        {
            "or": [
                {"property": STATUT_PROP, "select": {"equals": A_PUBLIER}},
                {"property": STATUT_PROP, "select": {"equals": A_MODIFIER}},
                {"property": STATUT_PROP, "select": {"equals": A_SUPPRIMER}},
            ]
        },
    )
    if not a_traiter:
        # Le catalogue est régénéré même sans changement de statut : il doit
        # toujours exister, y compris après un checkout propre.
        print("  Aucune formation en attente.")
        print("→ Régénération du catalogue")
        cible = regenerer_index(client)
        git_commit([cible], "📚 Catalogue formations régénéré")
        return

    print(f"  {len(a_traiter)} formation(s) en attente")
    print("→ Collecte des avis")
    avis_par_formation = collect_avis(client)

    touches, publiees, supprimees = [], 0, 0

    for page in a_traiter:
        nom = prop(page, "Nom de la formation", "title")
        slug = prop(page, "slug")
        statut = prop(page, STATUT_PROP, "select")
        cible = Path(OUTPUT_DIR) / f"{slug}.html"

        if not slug:
            print(f"  ⚠️  « {nom} » n'a pas de slug — ignorée")
            continue

        # ── Suppression ────────────────────────────────
        if statut == A_SUPPRIMER:
            if cible.exists():
                subprocess.run(["git", "rm", "-f", str(cible)], capture_output=True)
                if cible.exists():
                    cible.unlink()
                print(f"  🗑️  {cible} supprimée")
                touches.append(str(cible))
                supprimees += 1
            else:
                print(f"  · {cible} n'existait pas")
            client.update_page(page["id"], {STATUT_PROP: {"select": {"name": NON_PUBLIE}}})
            continue

        # ── Publication / modification ─────────────────
        print(f"  → {nom}")
        avis = bloc_avis(avis_par_formation.get(page["id"].replace("-", ""), []))
        if avis:
            print(
                f"    {avis['total']} avis, moyenne {avis['moyenne']}/5, "
                f"{avis['nb_publiables']} verbatim(s) publiable(s)"
            )
        else:
            print("    aucun avis — blocs avis retirés de la page")

        data = build_data(client, page, avis)
        cible.write_text(render(template, data, avis), encoding="utf-8")
        print(f"    ✓ {cible}")
        touches.append(str(cible))
        publiees += 1

        client.update_page(page["id"], {STATUT_PROP: {"select": {"name": PUBLIE}}})

    print("→ Régénération du catalogue")
    touches.append(regenerer_index(client))

    horodatage = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    git_commit(
        touches,
        f"📚 Formations : {publiees} publiée(s), {supprimees} supprimée(s) — {horodatage}",
    )
    print("\n✓ Terminé. Lancer generate_sitemap.py pour mettre à jour le sitemap.")


if __name__ == "__main__":
    main()
