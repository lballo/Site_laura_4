#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════
  Notion → Site Publisher — Laura Ballo Coaching
  VERSION : téléchargement images SANS redimensionnement
            (conversion WebP uniquement)
═══════════════════════════════════════════════════════════
"""
 
import os
import sys
import json
import re
import html as html_module
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from io import BytesIO
import unicodedata
 
import requests
from PIL import Image
 
# ─────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────
NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
DATABASE_ID = os.environ.get("NOTION_DATABASE_ID", "300075e127d2809eaac2e85bba8280ef")
TAGS_REF_DATABASE_ID = os.environ.get("NOTION_TAGS_REF_DATABASE_ID", "82e832b39f8b43a0adc0eff93135a961")
 
ARTICLES_JSON_PATH = os.environ.get("ARTICLES_JSON_PATH", "blog/articles.json")
TEMPLATE_PATH = os.environ.get("TEMPLATE_PATH", "_templates/article.html")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "blog/articles")
IMAGES_DIR = "assets/img/blog"
 
SITE_URL = "https://lauraballo.com"
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
 
WEBP_QUALITY = 85
 
# ─────────────────────────────────────────────────────────
# MAPPING TAGS → SLUGS
# ─────────────────────────────────────────────────────────
TAG_SLUG_MAP_FALLBACK = {
    "Leadership": "leadership",
    "Management": "management",
    "Stratégie": "strategie",
    "Prise de parole en public": "prise-de-parole",
    "Storytelling": "storytelling",
    "Média training": "media-training",
    "Communication": "communication",
    "Gestion des conflits": "gestion-des-conflits",
    "Gestion du changement": "gestion-du-changement",
    "Gestion des émotions": "gestion-des-emotions",
    "Hypersensibilité": "hypersensibilite",
    "Compréhension de soi": "comprehension-de-soi",
    "Affirmation de soi": "affirmation-de-soi",
    "Culture": "culture",
    "IA & automation": "ia-automation",
    "Intelligence émotionnelle": "intelligence-emotionnelle",
    "Développement personnel": "developpement-personnel",
}
 
TAG_SLUG_MAP = dict(TAG_SLUG_MAP_FALLBACK)
 
MOIS_FR = {
    1: "janvier", 2: "février", 3: "mars", 4: "avril",
    5: "mai", 6: "juin", 7: "juillet", 8: "août",
    9: "septembre", 10: "octobre", 11: "novembre", 12: "décembre",
}
 
 
# ═════════════════════════════════════════════════════════
# NOTION API CLIENT
# ═════════════════════════════════════════════════════════
class NotionClient:
    def __init__(self, api_key):
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }
 
    def query_database(self, database_id, filter_obj=None):
        url = f"{NOTION_API}/databases/{database_id}/query"
        payload = {}
        if filter_obj:
            payload["filter"] = filter_obj
        results = []
        has_more = True
        start_cursor = None
        while has_more:
            if start_cursor:
                payload["start_cursor"] = start_cursor
            resp = requests.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            results.extend(data.get("results", []))
            has_more = data.get("has_more", False)
            start_cursor = data.get("next_cursor")
        return results
 
    def get_page_blocks(self, page_id):
        url = f"{NOTION_API}/blocks/{page_id}/children"
        blocks = []
        has_more = True
        start_cursor = None
        while has_more:
            params = {"page_size": 100}
            if start_cursor:
                params["start_cursor"] = start_cursor
            resp = requests.get(url, headers=self.headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            blocks.extend(data.get("results", []))
            has_more = data.get("has_more", False)
            start_cursor = data.get("next_cursor")
        return blocks
 
    def update_page(self, page_id, properties):
        url = f"{NOTION_API}/pages/{page_id}"
        resp = requests.patch(
            url, headers=self.headers, json={"properties": properties}
        )
        resp.raise_for_status()
        return resp.json()
 
 
# ═════════════════════════════════════════════════════════
# GESTION DES IMAGES
# ═════════════════════════════════════════════════════════
def download_and_compress(url, filename):
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        img = Image.open(BytesIO(resp.content))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        output_dir = Path(IMAGES_DIR)
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{filename}.webp"
        img.save(output_path, "WEBP", quality=WEBP_QUALITY)
        print(f"   🖼️  Image : {img.width}x{img.height}px → {output_path.stat().st_size // 1024}KB")
        return f"/{IMAGES_DIR}/{filename}.webp"
    except Exception as e:
        print(f"   ⚠️  Échec téléchargement image : {e}")
        return url
 
 
def get_main_image(page, slug):
    props = page.get("properties", {})
    files = props.get("Image", {}).get("files", [])
    if files:
        file_obj = files[0]
        if file_obj.get("type") == "file":
            url = file_obj["file"]["url"]
        else:
            url = file_obj["external"]["url"]
        return download_and_compress(url, f"{slug}-main")
    image_url = props.get("Image URL", {}).get("url", "") or ""
    if image_url:
        return download_and_compress(image_url, f"{slug}-main")
    return ""
 
 
# ═════════════════════════════════════════════════════════
# NOTION BLOCKS → HTML
# ═════════════════════════════════════════════════════════
def rich_text_to_html(rich_text_array):
    if not rich_text_array:
        return ""
    parts = []
    for rt in rich_text_array:
        text = rt.get("plain_text", "")
        text = html_module.escape(text)
        text = text.replace("\n", "<br>\n")
        ann = rt.get("annotations", {})
        href = rt.get("href")
        if ann.get("code"):
            text = f"<code>{text}</code>"
        if ann.get("bold"):
            text = f"<strong>{text}</strong>"
        if ann.get("italic"):
            text = f"<em>{text}</em>"
        if ann.get("strikethrough"):
            text = f"<s>{text}</s>"
        if ann.get("underline"):
            text = f"<u>{text}</u>"
        if href:
            text = f'<a href="{html_module.escape(href)}">{text}</a>'
        parts.append(text)
    return "".join(parts)
 
 
def rich_text_to_plain(rich_text_array):
    if not rich_text_array:
        return ""
    return "".join(rt.get("plain_text", "") for rt in rich_text_array)
 
 
def blocks_to_html(blocks, client=None, slug="article", img_counter=None):
    if img_counter is None:
        img_counter = [0]
    html_parts = []
    i = 0
    first_p = True
 
    def get_children_html(block):
        if not block.get("has_children") or not client:
            return ""
        children = client.get_page_blocks(block["id"])
        if not children:
            return ""
        return "\n" + blocks_to_html(children, client, slug, img_counter)
 
    while i < len(blocks):
        block = blocks[i]
        btype = block.get("type", "")
 
        if btype == "paragraph":
            text = rich_text_to_html(block["paragraph"]["rich_text"])
            if text.strip():
                if first_p:
                    html_parts.append(f'    <p class="lead">{text}</p>')
                    first_p = False
                else:
                    html_parts.append(f"    <p>{text}</p>")
            children_html = get_children_html(block)
            if children_html:
                html_parts.append(children_html)
 
        elif btype in ("heading_1", "heading_2"):
            text = rich_text_to_html(block[btype]["rich_text"])
            html_parts.append(f"    <h2>{text}</h2>")
            first_p = False
 
        elif btype == "heading_3":
            text = rich_text_to_html(block["heading_3"]["rich_text"])
            html_parts.append(f"    <h3>{text}</h3>")
            first_p = False
 
        elif btype == "bulleted_list_item":
            items = []
            while i < len(blocks) and blocks[i].get("type") == "bulleted_list_item":
                b = blocks[i]
                text = rich_text_to_html(b["bulleted_list_item"]["rich_text"])
                children_html = get_children_html(b)
                items.append(f"      <li>{text}{children_html}</li>")
                i += 1
            html_parts.append("    <ul>\n" + "\n".join(items) + "\n    </ul>")
            first_p = False
            continue
 
        elif btype == "numbered_list_item":
            items = []
            while i < len(blocks) and blocks[i].get("type") == "numbered_list_item":
                b = blocks[i]
                text = rich_text_to_html(b["numbered_list_item"]["rich_text"])
                children_html = get_children_html(b)
                items.append(f"      <li>{text}{children_html}</li>")
                i += 1
            html_parts.append("    <ol>\n" + "\n".join(items) + "\n    </ol>")
            first_p = False
            continue
 
        elif btype == "quote":
            text = rich_text_to_html(block["quote"]["rich_text"])
            html_parts.append(f'    <div class="pullquote">\n      <p>{text}</p>\n    </div>')
            first_p = False
 
        elif btype == "callout":
            text = rich_text_to_html(block["callout"]["rich_text"])
            html_parts.append(f'    <div class="insight-box">\n      <p>{text}</p>\n    </div>')
            first_p = False
 
        elif btype == "divider":
            html_parts.append(
                '    <div class="transition-section">\n'
                '      <div class="transition-mark">* * *</div>\n'
                "    </div>"
            )
 
        elif btype == "image":
            img_data = block["image"]
            if img_data.get("type") == "file":
                url = img_data["file"]["url"]
            elif img_data.get("type") == "external":
                url = img_data["external"]["url"]
            else:
                url = ""
            raw_caption = rich_text_to_plain(img_data.get("caption", []))
            if raw_caption.lower().startswith("alt:"):
                rest = raw_caption[4:].strip()
                if "|" in rest:
                    alt_text, caption_text = rest.split("|", 1)
                    alt_text = alt_text.strip()
                    caption_text = caption_text.strip()
                else:
                    alt_text = rest
                    caption_text = ""
            elif "|" in raw_caption:
                alt_text, caption_text = raw_caption.split("|", 1)
                alt_text = alt_text.strip()
                caption_text = caption_text.strip()
            else:
                alt_text = raw_caption or "illustration"
                caption_text = raw_caption
            if url:
                img_counter[0] += 1
                filename = f"{slug}-{img_counter[0]}"
                url = download_and_compress(url, filename)
            cap_html = (
                f'\n      <p class="image-caption">{html_module.escape(caption_text)}</p>'
                if caption_text else ""
            )
            html_parts.append(
                f'    <div class="full-image">\n'
                f'      <img src="{url}" alt="{html_module.escape(alt_text)}" loading="lazy">'
                f"{cap_html}\n    </div>"
            )
            first_p = False
 
        elif btype == "toggle":
            summary = rich_text_to_html(block["toggle"]["rich_text"])
            html_parts.append(f"    <details>\n      <summary>{summary}</summary>\n    </details>")
            first_p = False
 
        i += 1
 
    return "\n\n".join(html_parts)
 
 
# ═════════════════════════════════════════════════════════
# UTILITAIRES
# ═════════════════════════════════════════════════════════
def slugify(text):
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")
 
 
def tag_to_slug(tag_name):
    return TAG_SLUG_MAP.get(tag_name, slugify(tag_name))
 
 
def load_tags_reference(client):
    global TAG_SLUG_MAP
    try:
        pages = client.query_database(TAGS_REF_DATABASE_ID)
        mapping = {}
        for page in pages:
            tag_label = extract_property(page, "Tag", "title")
            tag_slug = extract_property(page, "Slug", "rich_text")
            if tag_label and tag_slug:
                mapping[tag_label] = tag_slug
        if not mapping:
            print("   ⚠️  Référentiel Tags vide — fallback sur mapping statique")
            return
        TAG_SLUG_MAP = mapping
        print(f"   ✅ Référentiel Tags chargé : {len(mapping)} tags")
    except Exception as e:
        print(f"   ⚠️  Erreur lecture référentiel Tags : {e}")
        print(f"   → Fallback sur mapping statique ({len(TAG_SLUG_MAP_FALLBACK)} tags)")
 
 
def format_date_fr(iso_date):
    try:
        dt = datetime.fromisoformat(iso_date)
        return f"{dt.day} {MOIS_FR[dt.month]} {dt.year}"
    except (ValueError, KeyError):
        return iso_date
 
 
def estimate_reading_time(html_content):
    text = re.sub(r"<[^>]+>", "", html_content)
    words = len(text.split())
    return max(1, math.ceil(words / 200))
 
 
def extract_property(page, prop_name, prop_type="rich_text"):
    props = page.get("properties", {})
    prop = props.get(prop_name, {})
    if prop_type in ("rich_text", "text"):
        rt = prop.get("rich_text", [])
        return "".join(r.get("plain_text", "") for r in rt)
    elif prop_type == "title":
        rt = prop.get("title", [])
        return "".join(r.get("plain_text", "") for r in rt)
    elif prop_type == "select":
        sel = prop.get("select")
        return sel.get("name", "") if sel else ""
    elif prop_type == "multi_select":
        items = prop.get("multi_select", [])
        return [item.get("name", "") for item in items]
    elif prop_type == "url":
        return prop.get("url", "") or ""
    elif prop_type == "checkbox":
        return prop.get("checkbox", False)
    return ""
 
 
# ═════════════════════════════════════════════════════════
# GÉNÉRATION HTML + JSON
# ═════════════════════════════════════════════════════════
def generate_html(template, data):
    output = template
    replacements = {
        "{{TITLE_SEO}}": data["title_seo"],
        "{{META_DESCRIPTION}}": html_module.escape(data["meta_description"]),
        "{{OG_TITLE}}": html_module.escape(data["title"]),
        "{{OG_DESCRIPTION}}": html_module.escape(data["meta_description"]),
        "{{OG_IMAGE}}": data["image"],
        "{{CANONICAL_URL}}": data["canonical_url"],
        "{{PUBLISHED_DATE}}": data["date"],
        "{{CATEGORY}}": data["category"],
        "{{TITLE}}": html_module.escape(data["title"]),
        "{{EXCERPT}}": html_module.escape(data["meta_description"]),
        "{{DATE_FORMATTED}}": data["date_formatted"],
        "{{READING_TIME}}": data["reading_time"],
        "{{CONTENT}}": data["content_html"],
        "{{IMAGE_URL}}": data["image"],
        "{{SLUG}}": data["slug"],
        "{{SEARCH_KEYWORDS_JS}}": json.dumps(data["tags_slugs"], ensure_ascii=False),
        "{{SCHEMA_JSON}}": json.dumps(data["schema_org"], ensure_ascii=False, indent=4),
    }
    for placeholder, value in replacements.items():
        output = output.replace(placeholder, str(value))
    return output
 
 
def build_schema_org(data):
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": data["title"],
        "description": data["meta_description"],
        "author": {"@type": "Person", "name": "Laura Ballo", "url": SITE_URL},
        "datePublished": data["date"],
        "publisher": {
            "@type": "Organization",
            "name": "Laura Ballo Coaching",
            "logo": {
                "@type": "ImageObject",
                "url": f"{SITE_URL}/assets/img/Laura-Ballo-white-low-res.png",
            },
        },
        "mainEntityOfPage": {"@type": "WebPage", "@id": data["canonical_url"]},
        "image": data["image"],
    }
 
 
def load_articles_json(path):
    filepath = Path(path)
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f).get("articles", [])
    return []
 
 
def save_articles_json(path, articles):
    articles.sort(key=lambda a: a.get("date", ""), reverse=True)
    used_slugs = set()
    for article in articles:
        used_slugs.update(article.get("tags", []))
    collections = [
        {"slug": slug, "label": label}
        for label, slug in TAG_SLUG_MAP.items()
        if slug in used_slugs
    ]
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"collections": collections, "articles": articles}, f, ensure_ascii=False, indent=2)
 
 
def upsert_article(articles_list, new_entry):
    for i, existing in enumerate(articles_list):
        if existing.get("slug") == new_entry["slug"]:
            articles_list[i] = new_entry
            return articles_list
    articles_list.append(new_entry)
    return articles_list
 
 
def build_json_entry(data):
    keywords = []
    if data.get("expression_cle"):
        keywords.extend(data["expression_cle"].lower().split())
    title_words = re.findall(r"\w+", data["title"].lower())
    stopwords = {
        "le", "la", "les", "de", "du", "des", "un", "une", "et", "en",
        "à", "au", "aux", "pour", "par", "sur", "dans", "qui", "que",
        "est", "son", "ses", "ce", "cette", "ces", "mon", "ma", "mes",
        "nous", "vous", "il", "elle", "on", "se", "sa", "ne", "pas",
        "ou", "ni", "si", "y", "dont",
    }
    keywords.extend([w for w in title_words if w not in stopwords and len(w) > 2])
    keywords = list(dict.fromkeys(keywords))
    return {
        "id": data["slug"],
        "title": data["title"],
        "slug": data["slug"],
        "url": f"/{data['slug']}",
        "date": data["date"],
        "readingTime": data["reading_time"],
        "excerpt": data["meta_description"],
        "tags": data["tags_slugs"],
        "situations": data["situations"],
        "searchKeywords": keywords,
        "category": data["category"],
        "image": data["image"],
        "featured": False,
    }
 
 
# ═════════════════════════════════════════════════════════
# GIT
# ═════════════════════════════════════════════════════════
def git_commit_and_push(files, message):
    try:
        subprocess.run(["git", "config", "user.name", "Notion Publisher Bot"], check=True)
        subprocess.run(["git", "config", "user.email", "bot@lauraballo.com"], check=True)
        for f in files:
            subprocess.run(["git", "add", f], check=True)
        subprocess.run(["git", "add", IMAGES_DIR], check=True)
        result = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
        if not result.stdout.strip():
            print("  ℹ️  Aucun changement à committer.")
            return False
        subprocess.run(["git", "commit", "-m", message], check=True)
        subprocess.run(["git", "push"], check=True)
        print(f"  ✅ Push réussi : {message}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ❌ Erreur git : {e}")
        return False
 
 
# ═════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════
def main():
    if not NOTION_API_KEY:
        print("❌ Variable NOTION_API_KEY manquante.")
        sys.exit(1)
 
    print("═" * 55)
    print("  Notion → Site Publisher (sans redimensionnement)")
    print("═" * 55)
 
    client = NotionClient(NOTION_API_KEY)
 
    print("\n🏷️  Chargement du référentiel Tags...")
    load_tags_reference(client)
 
    template_path = Path(TEMPLATE_PATH)
    if not template_path.exists():
        print(f"❌ Template introuvable : {TEMPLATE_PATH}")
        sys.exit(1)
    template = template_path.read_text(encoding="utf-8")
    print(f"✅ Template : {TEMPLATE_PATH}")
 
    articles_list = load_articles_json(ARTICLES_JSON_PATH)
    print(f"✅ {ARTICLES_JSON_PATH} : {len(articles_list)} articles existants")
 
    print("\n🔍 Recherche des articles à publier...")
    pages = client.query_database(
        DATABASE_ID,
        filter_obj={"property": "Action à effectuer", "select": {"equals": "Article à publier"}},
    )
    print(f"   → {len(pages)} article(s) trouvé(s)\n")
 
    print("🗑️  Recherche des articles à supprimer...")
    pages_to_delete = client.query_database(
        DATABASE_ID,
        filter_obj={"property": "Action à effectuer", "select": {"equals": "Supprimer article"}},
    )
    print(f"   → {len(pages_to_delete)} article(s) à supprimer\n")
 
    if not pages and not pages_to_delete:
        print("ℹ️  Rien à faire. Fin.")
        return
 
    modified_files = []
    deleted_files = []
    published_page_ids = []
    deleted_page_ids = []
 
    # ── SUPPRESSION ──
    for page in pages_to_delete:
        page_id = page["id"]
        title = extract_property(page, "Titre de l'article", "title")
        slug = extract_property(page, "Slug", "rich_text") or slugify(title)
 
        print(f"🗑️  {title}")
        html_file = Path(OUTPUT_DIR) / f"{slug}.html"
        if html_file.exists():
            html_file.unlink()
            deleted_files.append(str(html_file))
            print(f"   ✅ Fichier supprimé : {html_file}")
        else:
            print(f"   ⚠️  Fichier introuvable : {html_file}")
 
        before_count = len(articles_list)
        articles_list = [a for a in articles_list if a.get("slug") != slug]
        if len(articles_list) < before_count:
            print(f"   ✅ Retiré de articles.json")
 
        deleted_page_ids.append((page_id, title))
 
    # ── PUBLICATION ──
    for page in pages:
        page_id = page["id"]
        title = extract_property(page, "Titre de l'article", "title")
        title_seo = extract_property(page, "Titre SEO", "rich_text") or f"{title} | Laura Ballo"
        meta_desc = extract_property(page, "Méta description", "rich_text") or ""
        expression_cle = extract_property(page, "Expression clé principale", "rich_text") or ""
        slug = extract_property(page, "Slug", "rich_text") or slugify(title)
        image_alt = extract_property(page, "Alt", "rich_text") or ""
        tags = extract_property(page, "Tags", "multi_select")
        situations = extract_property(page, "Situation", "multi_select")
 
        print(f"📝 {title}")
        print(f"   slug → {slug}")
 
        image_url = get_main_image(page, slug)
 
        blocks = client.get_page_blocks(page_id)
        img_counter = [0]
        content_html = blocks_to_html(blocks, client, slug, img_counter)
 
        if not content_html.strip():
            print(f"   ⚠️  Contenu vide — ignoré")
            continue
 
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        reading_time = f"{estimate_reading_time(content_html)} min"
        category = tags[0] if tags else "Leadership"
        tags_slugs = [tag_to_slug(t) for t in tags]
        situations_lower = [s.lower() for s in situations]
 
        article_data = {
            "title": title,
            "title_seo": title_seo,
            "meta_description": meta_desc,
            "expression_cle": expression_cle,
            "slug": slug,
            "date": today,
            "date_formatted": format_date_fr(today),
            "reading_time": reading_time,
            "category": category,
            "tags": tags,
            "tags_slugs": tags_slugs,
            "situations": situations_lower,
            "image": image_url,
            "image_alt": image_alt,
            "canonical_url": f"{SITE_URL}/{slug}",
            "content_html": content_html,
        }
        article_data["schema_org"] = build_schema_org(article_data)
 
        output_path = Path(OUTPUT_DIR)
        output_path.mkdir(parents=True, exist_ok=True)
        output_file = output_path / f"{slug}.html"
        html_output = generate_html(template, article_data)
        output_file.write_text(html_output, encoding="utf-8")
        modified_files.append(str(output_file))
        print(f"   ✅ HTML généré")
 
        json_entry = build_json_entry(article_data)
        articles_list = upsert_article(articles_list, json_entry)
        print(f"   ✅ JSON mis à jour")
 
        published_page_ids.append((page_id, title))
 
    save_articles_json(ARTICLES_JSON_PATH, articles_list)
    modified_files.append(ARTICLES_JSON_PATH)
    print(f"\n💾 {ARTICLES_JSON_PATH} ({len(articles_list)} articles)")
 
    parts = []
    if published_page_ids:
        parts.append(f"📝 Publié : {', '.join(t for _, t in published_page_ids)}")
    if deleted_page_ids:
        parts.append(f"🗑️ Supprimé : {', '.join(t for _, t in deleted_page_ids)}")
    commit_msg = " | ".join(parts)
    if len(commit_msg) > 100:
        commit_msg = f"📝 {len(published_page_ids)} publié(s), 🗑️ {len(deleted_page_ids)} supprimé(s)"
 
    print(f"\n🚀 Commit & push...")
    for f in deleted_files:
        try:
            subprocess.run(["git", "rm", "-f", f], check=True, capture_output=True)
        except subprocess.CalledProcessError:
            pass
    pushed = git_commit_and_push(modified_files, commit_msg)
 
    if pushed:
        print(f"\n🔄 Mise à jour Notion...")
        for page_id, title in published_page_ids:
            try:
                client.update_page(page_id, {"Action à effectuer": {"select": {"name": "Publié"}}})
                print(f"   ✅ {title} → 'Publié'")
            except Exception as e:
                print(f"   ⚠️  {title}: {e}")
 
        for page_id, title in deleted_page_ids:
            try:
                client.update_page(page_id, {"Action à effectuer": {"select": {"name": "Article supprimé du site"}}})
                print(f"   🗑️ {title} → 'Article supprimé du site'")
            except Exception as e:
                print(f"   ⚠️  {title}: {e}")
 
    print("\n" + "═" * 55)
    print(f"  ✅ Terminé — {len(published_page_ids)} publié(s), {len(deleted_page_ids)} supprimé(s)")
    print("═" * 55)
 
 
if __name__ == "__main__":
    main()
 

