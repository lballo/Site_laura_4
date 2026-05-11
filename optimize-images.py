#!/usr/bin/env python3
"""
optimize-images.py — Optimisation images lauraballo.com
========================================================
Convertit JPG/PNG → WebP et compresse les images existantes.
Met à jour les références HTML/CSS automatiquement.

Usage :
  python3 optimize-images.py

À lancer depuis la RACINE du repo GitHub local.
"""

import os
import re
import shutil
from pathlib import Path
from PIL import Image

# ── CONFIG ─────────────────────────────────────────────────────────────────
IMG_DIR       = Path("assets/img")        # dossier images
HTML_DIRS     = [Path(".")]               # cherche les HTML récursivement
WEBP_QUALITY  = 82                        # 0-100 — bon compromis qualité/poids
JPEG_QUALITY  = 82                        # pour les JPG gardés en fallback
MAX_WIDTH     = 1920                      # resize si plus large (px)
EXTENSIONS    = {".jpg", ".jpeg", ".png"} # formats à traiter
SKIP_ALREADY  = True                      # saute si .webp existe déjà
BACKUP        = True                      # crée assets/img/_backup/ avant tout
# ───────────────────────────────────────────────────────────────────────────


def backup_images():
    backup_dir = IMG_DIR / "_backup"
    if backup_dir.exists():
        print(f"  ⚠  Backup déjà présent dans {backup_dir}, skip.")
        return
    shutil.copytree(IMG_DIR, backup_dir, ignore=shutil.ignore_patterns("_backup"))
    print(f"  ✓  Backup créé → {backup_dir}")


def convert_to_webp(src: Path) -> Path | None:
    """Convertit une image en WebP. Retourne le chemin WebP ou None si ignoré."""
    dst = src.with_suffix(".webp")
    if SKIP_ALREADY and dst.exists():
        return dst

    try:
        with Image.open(src) as img:
            # Conversion RGBA si nécessaire
            if img.mode in ("RGBA", "LA"):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[-1])
                img = bg
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # Resize si trop large
            if img.width > MAX_WIDTH:
                ratio = MAX_WIDTH / img.width
                new_h = int(img.height * ratio)
                img = img.resize((MAX_WIDTH, new_h), Image.LANCZOS)

            img.save(dst, "WEBP", quality=WEBP_QUALITY, method=6)

        old_kb = src.stat().st_size / 1024
        new_kb = dst.stat().st_size / 1024
        gain   = (1 - new_kb / old_kb) * 100
        print(f"  {src.name:45s} {old_kb:6.0f}KB → {new_kb:6.0f}KB  (-{gain:.0f}%)")
        return dst

    except Exception as e:
        print(f"  ✗  ERREUR {src.name}: {e}")
        return None


def update_html_references(old_name: str, new_name: str):
    """Remplace les références dans tous les HTML/CSS du repo."""
    patterns = [
        (r'src=["\']([^"\']*' + re.escape(old_name) + r')["\']',
         lambda m: m.group(0).replace(old_name, new_name)),
        (r"url\(['\"]?([^'\"()]*" + re.escape(old_name) + r")['\"]?\)",
         lambda m: m.group(0).replace(old_name, new_name)),
    ]

    changed_files = []
    for html_dir in HTML_DIRS:
        for ext in ("*.html", "*.css", "*.js"):
            for filepath in html_dir.rglob(ext):
                if "_backup" in str(filepath):
                    continue
                try:
                    content = filepath.read_text(encoding="utf-8")
                    new_content = content
                    for pat, repl in patterns:
                        new_content = re.sub(pat, repl, new_content)
                    if new_content != content:
                        filepath.write_text(new_content, encoding="utf-8")
                        changed_files.append(filepath)
                except Exception:
                    pass
    return changed_files


def main():
    print("\n╔══════════════════════════════════════════════════╗")
    print("║  optimize-images.py — lauraballo.com             ║")
    print("╚══════════════════════════════════════════════════╝\n")

    if not IMG_DIR.exists():
        print(f"✗  Dossier {IMG_DIR} introuvable. Lance ce script depuis la racine du repo.")
        return

    if BACKUP:
        print("── Backup ──────────────────────────────────────────")
        backup_images()

    print("\n── Conversion WebP ─────────────────────────────────")
    images = [
        p for p in IMG_DIR.rglob("*")
        if p.suffix.lower() in EXTENSIONS and "_backup" not in str(p)
    ]
    print(f"  {len(images)} images trouvées dans {IMG_DIR}/\n")

    converted = 0
    skipped   = 0
    refs_updated = set()

    for src in sorted(images):
        dst = convert_to_webp(src)
        if dst is None:
            skipped += 1
            continue
        if dst == src.with_suffix(".webp"):
            converted += 1
            # Mise à jour des références HTML/CSS
            changed = update_html_references(src.name, dst.name)
            refs_updated.update(changed)

    print(f"\n  ✓  {converted} images converties, {skipped} ignorées.")

    if refs_updated:
        print(f"\n── Références HTML/CSS mises à jour ────────────────")
        for f in sorted(refs_updated):
            print(f"  {f}")

    print("\n── Résumé ──────────────────────────────────────────")
    print("  Les fichiers .webp sont créés à côté des originaux.")
    print("  Les HTML/CSS pointent maintenant vers les .webp.")
    print("  Les originaux JPG/PNG sont conservés dans _backup/")
    print("  ⚠  Vérifie visuellement quelques pages avant de push.")
    print("  ⚠  Supprime _backup/ après validation.\n")


if __name__ == "__main__":
    main()
