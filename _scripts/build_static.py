#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════
  Build statique (SEO) — Laura Ballo Coaching
═══════════════════════════════════════════════════════════
  Rend le site lisible par Google sans JavaScript :

  1. Menu, pied de page et bannière cookies écrits en dur dans
     chaque page (à la place des placeholders que includes.js
     remplissait au chargement). includes.js garde le relais :
     si un placeholder est encore présent, il le remplit.
  2. Liste des articles de /blog écrite en HTML depuis
     blog/articles.json (blog.js la remplace ensuite à l'identique
     pour la recherche et les filtres).
  3. Liens internes nettoyés : plus de « .html » et anciennes
     adresses remplacées par les nouvelles (LINK_REWRITES).

  Le script est idempotent : on peut le relancer autant de fois
  qu'on veut, il met à jour les blocs entre marqueurs.

  Usage (GitHub Action « Build statique ») ou en local :
    python _scripts/build_static.py
═══════════════════════════════════════════════════════════
"""

import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(".")
COMPONENTS_DIR = ROOT / "assets" / "components"
ARTICLES_JSON = ROOT / "blog" / "articles.json"
BLOG_INDEX = ROOT / "blog" / "index.html"

# Placeholder id → fichier composant
COMPONENTS = {
    "header-placeholder": "header.html",
    "header-formation-placeholder": "header-formation.html",
    "footer-placeholder": "footer.html",
    "cookies-placeholder": "cookies.html",
}

# Anciennes adresses internes → nouvelles (liens réécrits dans les pages)
LINK_REWRITES = {
    "/accompagnements/presence-signature": "/coaching-de-dirigeants",
}

# Dossiers jamais modifiés
SKIP_PARTS = {"_archives", "_templates", "_scripts", "node_modules", ".git", ".github"}

MONTHS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


# ─────────────────────────────────────────────────────────
# OUTILS
# ─────────────────────────────────────────────────────────
def esc(text):
    return html.escape(str(text or ""), quote=True)


def format_date_fr(iso):
    try:
        d = date.fromisoformat(str(iso)[:10])
    except ValueError:
        return esc(iso)
    return f"{d.day} {MONTHS_FR[d.month - 1]} {d.year}"


def replace_block(content, name, inner, fallback_pattern=None):
    """Remplace le contenu entre <!-- static:name --> et <!-- /static:name -->.
    Au premier passage, insère les marqueurs à la place de fallback_pattern."""
    start, end = f"<!-- static:{name} -->", f"<!-- /static:{name} -->"
    block = f"{start}\n{inner}\n{end}"
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if pattern.search(content):
        return pattern.sub(lambda m: block, content, count=1)
    if fallback_pattern:
        new, n = re.subn(fallback_pattern, lambda m: m.group(1) + block, content, count=1, flags=re.S)
        if n:
            return new
    print(f"   ⚠️  Bloc « {name} » introuvable")
    return content


# ─────────────────────────────────────────────────────────
# 1. COMPOSANTS (menu, pied de page, cookies)
# ─────────────────────────────────────────────────────────
def load_components():
    comps = {}
    for pid, filename in COMPONENTS.items():
        path = COMPONENTS_DIR / filename
        if path.exists():
            comps[pid] = path.read_text(encoding="utf-8").strip()
    return comps


def inject_components(content, comps):
    for pid, comp_html in comps.items():
        name = pid.replace("-placeholder", "")
        start, end = f"<!-- include:{name} -->", f"<!-- /include:{name} -->"
        block = f"{start}\n{comp_html}\n{end}"
        marked = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
        if marked.search(content):
            content = marked.sub(lambda m: block, content)
        else:
            placeholder = re.compile(r'<div id="' + re.escape(pid) + r'">\s*</div>')
            content = placeholder.sub(lambda m: block, content)
    return content


# ─────────────────────────────────────────────────────────
# 3. LIENS INTERNES
# ─────────────────────────────────────────────────────────
HREF_RE = re.compile(r'href="(/[^"#?]*)([#?][^"]*)?"')


def clean_href(match):
    path, suffix = match.group(1), match.group(2) or ""
    if path.endswith("/index.html"):
        path = path[: -len("index.html")].rstrip("/") or "/"
    elif path.endswith(".html") and not path.startswith("/assets/"):
        path = path[: -len(".html")]
    path = LINK_REWRITES.get(path, path)
    return f'href="{path}{suffix}"'


def clean_links(content):
    return HREF_RE.sub(clean_href, content)


# ─────────────────────────────────────────────────────────
# 2. LISTE DES ARTICLES (/blog)
# ─────────────────────────────────────────────────────────
def build_blog_index(content):
    if not ARTICLES_JSON.exists():
        return content
    articles = json.loads(ARTICLES_JSON.read_text(encoding="utf-8")).get("articles", [])
    if not articles:
        return content

    featured = next((a for a in articles if a.get("featured")), articles[0])
    recent = sorted(articles, key=lambda a: a.get("date", ""), reverse=True)[:3]

    hero = f"""    <img src="{esc(featured['image'])}" alt="{esc(featured['title'])}" class="featured-hero-image" loading="eager">
    <div class="featured-hero-content">
      <span class="featured-hero-tag">À la une · {esc(featured.get('category'))}</span>
      <h2 class="featured-hero-title">{esc(featured['title'])}</h2>
      <p class="featured-hero-excerpt">{esc(featured.get('excerpt'))}</p>
      <p class="featured-hero-meta">{format_date_fr(featured.get('date'))} · {esc(featured.get('readingTime'))}</p>
      <span class="featured-hero-link">Lire l'article</span>
    </div>"""

    recent_html = "\n".join(
        f"""    <a href="{esc(a['url'])}" class="featured-card">
      <img src="{esc(a['image'])}" alt="{esc(a['title'])}" class="featured-image" loading="lazy">
      <span class="featured-tag">{esc(a.get('category'))}</span>
      <h3 class="featured-title">{esc(a['title'])}</h3>
      <p class="featured-excerpt">{esc(a.get('excerpt'))}</p>
      <p class="featured-meta">{format_date_fr(a.get('date'))} · {esc(a.get('readingTime'))}</p>
    </a>"""
        for a in recent
    )

    list_html = "\n".join(
        f"""    <a href="{esc(a['url'])}" class="article-item">
      <div class="article-image-container">
        <img src="{esc(a['image'])}" alt="{esc(a['title'])}" class="article-image" loading="lazy">
      </div>
      <div class="article-content">
        <span class="article-date">{format_date_fr(a.get('date'))}</span>
        <h3 class="article-title">{esc(a['title'])}</h3>
        <p class="article-excerpt">{esc(a.get('excerpt'))}</p>
        <span class="article-read-more">Lire l'article</span>
      </div>
    </a>"""
        for a in articles
    )

    content = re.sub(
        r'<a href="[^"]*" class="featured-hero-card">',
        f'<a href="{esc(featured["url"])}" class="featured-hero-card">',
        content, count=1,
    )
    content = replace_block(content, "featured", hero,
                            r'(<a href="[^"]*" class="featured-hero-card">\s*)<!-- Rempli dynamiquement par JS -->')
    content = replace_block(content, "recent", recent_html,
                            r'(<div class="featured-grid">\s*)<!-- Rempli dynamiquement par JS -->')
    content = replace_block(content, "articles", list_html,
                            r'(<div class="articles-list">\s*)<!-- Rempli dynamiquement par JS -->')
    return content


# ─────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────
def iter_pages():
    for path in sorted(ROOT.rglob("*.html")):
        if any(part in SKIP_PARTS for part in path.parts):
            continue
        if path.parts[0] == "assets":
            continue
        yield path


def main():
    print("═" * 55)
    print("  Build statique (menu, pied de page, liste du blog)")
    print("═" * 55)
    comps = load_components()
    changed = 0
    for path in iter_pages():
        original = path.read_text(encoding="utf-8")
        content = inject_components(original, comps)
        if path == BLOG_INDEX:
            content = build_blog_index(content)
        content = clean_links(content)
        if content != original:
            path.write_text(content, encoding="utf-8")
            changed += 1
            print(f"   ✏️  {path.as_posix()}")
    print(f"\n✅ {changed} page(s) mise(s) à jour")


if __name__ == "__main__":
    main()
