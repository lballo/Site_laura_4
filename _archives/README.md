# Archives

Pages conservées dans le dépôt mais **non publiées** sur lauraballo.com
(le dossier `_archives/` est exclu du déploiement par `.vercelignore`
et du plan du site par `_scripts/generate_sitemap.py`).

| Page | Ancienne adresse | Archivée le | Pourquoi |
|---|---|---|---|
| `communaute.html` — Réseau Présence Vibratoire | `/communaute` | 14/10/2026 | Projet de réseau mis en pause, gardé pour une relance éventuelle |

## Remettre une page en ligne

1. Déplacer le fichier à la racine du dépôt : `git mv _archives/communaute.html communaute.html`
2. Si besoin, la remettre dans le menu : décommenter la ligne « Communauté » dans `assets/components/header.html`
3. Régénérer le plan du site (`python3 _scripts/generate_sitemap.py`) puis pousser sur main.
