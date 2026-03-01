#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════
  Sitemap Generator — Laura Ballo Coaching
═══════════════════════════════════════════════════════════
  Scanne tous les fichiers .html du projet,
  intègre les articles depuis blog/articles.json,
  recrée sitemap.xml à zéro, puis commit sur GitHub.

  Usage (GitHub Action) : chaîné après publish.py
  Usage (local) :
    python _scripts/generate_sitemap.py
═══════════════════════════════════════════════════════════
"""

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# ─────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────
SITE_URL = "https://lauraballo.com"
SITEMAP_PATH = "sitemap.xml"
ARTICLES_JSON_PATH = "blog/articles.json"

# Dossiers et fichiers exclus du scan
EXCLUDED_PATHS = {
    "blog/articles",       # gérés via articles.json
    "_templates",          # templates internes
    "satisfaction",        # page technique interne
    "node_modules",
    ".git",
}

EXCLUDED_FILES = {
    "template-formation.html",   # fichier template, pas une vraie page
    "template-accompagnement.html",
}

# Priorités et fréquences par dossier (ordre : du plus spécifique au plus général)
PRIORITIES = [
    ("index.html",      "weekly",  "1.0"),   # racine
    ("blog",            "weekly",  "0.8"),
    ("formations",      "monthly", "0.8"),
    ("accompagnements", "monthly", "0.8"),
    ("quizz",           "monthly", "0.7"),
    ("legal",           "yearly",  "0.2"),
]
DEFAULT_PRIORITY = ("monthly", "0.6")


# ─────────────────────────────────────────────────────────
# SCAN DES PAGES STATIQUES
# ─────────────────────────────────────────────────────────
def discover_static_pages():
    pages = []
    root = Path(".")

    for html_file in sorted(root.rglob("*.html")):
        path_str = str(html_file).replace("\\", "/").lstrip("./")

        # Exclure dossiers/fichiers blacklistés
        if any(excl in path_str for excl in EXCLUDED_PATHS):
            continue
        if any(part.startswith((".", "_")) for part in html_file.parts):
            continue
        if html_file.name in EXCLUDED_FILES:
            continue

        # Construire l'URL propre
        loc = "/" + path_str
        if loc.endswith("/index.html"):
            loc = loc[: -len("index.html")]   # /blog/index.html → /blog/
        elif loc == "/index.html":
            loc = "/"

        # Déterminer changefreq et priority
        changefreq, priority = DEFAULT_PRIORITY
        for pattern, cf, prio in PRIORITIES:
            if pattern in path_str:
                changefreq, priority = cf, prio
                break

        pages.append({"loc": loc, "changefreq": changefreq, "priority": priority})

    return pages


# ─────────────────────────────────────────────────────────
# LECTURE ARTICLES.JSON
# ─────────────────────────────────────────────────────────
def load_articles():
    filepath = Path(ARTICLES_JSON_PATH)
    if not filepath.exists():
        print(f"   ⚠️  {ARTICLES_JSON_PATH} introuvable — aucun article ajouté")
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f).get("articles", [])


# ─────────────────────────────────────────────────────────
# GÉNÉRATION DU SITEMAP
# ─────────────────────────────────────────────────────────
def generate_sitemap(static_pages, articles):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]

    # Pages statiques
    lines.append("")
    lines.append("  <!-- Pages statiques -->")
    for page in static_pages:
        lines += [
            "  <url>",
            f"    <loc>{SITE_URL}{page['loc']}</loc>",
            f"    <lastmod>{today}</lastmod>",
            f"    <changefreq>{page['changefreq']}</changefreq>",
            f"    <priority>{page['priority']}</priority>",
            "  </url>",
        ]

    # Articles de blog
    lines.append("")
    lines.append("  <!-- Articles de blog -->")
    for article in sorted(articles, key=lambda a: a.get("date", ""), reverse=True):
        slug = article.get("slug", "")
        date = article.get("date", today)
        if not slug:
            continue
        lines += [
            "  <url>",
            f"    <loc>{SITE_URL}/{slug}</loc>",
            f"    <lastmod>{date}</lastmod>",
            "    <changefreq>monthly</changefreq>",
            "    <priority>0.7</priority>",
            "  </url>",
        ]

    lines += ["", "</urlset>"]
    Path(SITEMAP_PATH).write_text("\n".join(lines) + "\n", encoding="utf-8")


# ─────────────────────────────────────────────────────────
# GIT
# ─────────────────────────────────────────────────────────
def git_commit_and_push():
    try:
        subprocess.run(["git", "config", "user.name", "Sitemap Bot"], check=True)
        subprocess.run(["git", "config", "user.email", "bot@lauraballo.com"], check=True)
        subprocess.run(["git", "add", SITEMAP_PATH], check=True)
        result = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
        if not result.stdout.strip():
            print("  ℹ️  Sitemap inchangé — aucun commit nécessaire.")
            return
        subprocess.run(["git", "commit", "-m", "🗺️ Sitemap mis à jour"], check=True)
        subprocess.run(["git", "push"], check=True)
        print("  ✅ Push réussi")
    except subprocess.CalledProcessError as e:
        print(f"  ❌ Erreur git : {e}")


# ─────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────
def main():
    print("═" * 55)
    print("  Sitemap Generator")
    print("═" * 55)

    static_pages = discover_static_pages()
    print(f"📄 {len(static_pages)} pages statiques trouvées")

    articles = load_articles()
    print(f"📝 {len(articles)} articles chargés depuis {ARTICLES_JSON_PATH}")

    generate_sitemap(static_pages, articles)
    total = len(static_pages) + len(articles)
    print(f"🗺️  {SITEMAP_PATH} régénéré — {total} URLs au total")

    print("\n🚀 Commit & push...")
    git_commit_and_push()

    print("═" * 55)
    print("  ✅ Terminé")
    print("═" * 55)


if __name__ == "__main__":
    main()
