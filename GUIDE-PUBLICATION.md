# 📝 Guide de publication Notion → Site

## Fonctionnement

```
Tu écris un article dans Notion
        ↓
Tu mets le statut "Publier article"
        ↓
GitHub → Actions → "Run workflow" (1 clic)
        ↓
Le script automatiquement :
  ✅ Génère blog/articles/slug.html
  ✅ Met à jour blog/articles.json (URL propre /slug)
  ✅ Régénère sitemap.xml (URLs propres)
  ✅ Commit + push sur GitHub
  ✅ Vercel redéploie automatiquement
  ✅ Statut Notion → "A indexer google search console"
        ↓
lauraballo.com/slug est en ligne !
```

---

## Setup (une seule fois)

### 1. Ajouter les fichiers au repo

Copie les fichiers du ZIP dans ton repo `Site_laura_4` :

```
Site_laura_4/
├── .github/workflows/
│   └── notion-publish.yml      ← 🆕
├── _scripts/
│   ├── publish.py               ← 🆕
│   └── requirements.txt         ← 🆕
├── _templates/
│   └── article.html             ← 🆕
├── vercel.json                  ← 🆕
│
├── blog/                        ← EXISTANT
│   ├── index.html
│   ├── articles.json            ← Sera écrasé par le script
│   └── articles/
│       └── *.html               ← Seront écrasés / créés par le script
├── accompagnements/             ← EXISTANT
├── assets/                      ← EXISTANT
├── formations/                  ← EXISTANT
├── ...
```

### 2. Ajouter les secrets GitHub

Dans ton repo → **Settings → Secrets and variables → Actions → New repository secret** :

| Secret | Valeur |
|--------|--------|
| `NOTION_API_KEY` | Ta clé d'intégration Notion (`secret_xxx...`) |
| `NOTION_DATABASE_ID` | `300075e127d2809eaac2e85bba8280ef` |

### 3. Partager la base Notion avec l'intégration

Notion → ta base → **`•••`** → **Connexions** → Ajoute ton intégration.

### 4. Le vercel.json

Le fichier `vercel.json` fait la magie des URLs propres :

- `lauraballo.com/art-du-positionnement` → sert `blog/articles/art-du-positionnement.html`
- `lauraballo.com/blog/articles/art-du-positionnement.html` → redirige 301 vers `/art-du-positionnement`

⚠️ Si tu avais déjà un `vercel.json`, fusionne les blocs `rewrites`, `redirects` et `headers`.

---

## Republier les articles existants

Puisque tout repart de Notion :

1. Copie le **contenu** de chaque article existant dans le **corps** de sa page Notion
2. Vérifie que les propriétés sont remplies (URL, Titre SEO, Méta description, Tags, etc.)
3. Mets le statut → **"Publier article"** pour chaque article à republier
4. Lance le workflow GitHub — tous les articles seront régénérés

Le script écrasera les anciens fichiers HTML et reconstruira `articles.json` avec les URLs propres.

---

## Utilisation quotidienne

### Écrire un article dans Notion

1. **Crée une page** dans la base
2. **Remplis les propriétés** :
   - `Titre de l'article` — H1 de la page
   - `URL` — `https://lauraballo.com/ton-slug`
   - `Titre SEO` — Pour Google (`<title>`)
   - `Méta description` — ~155 caractères
   - `Tags` — Catégories
   - `Situation` — Situations associées
   - `Image` — URL de l'image (hébergée dans `/assets/img/blog/`)
   - `Expression clé principale` — Mot-clé SEO

3. **Écris dans le corps** avec les titres natifs Notion

4. Statut → **"Publier article"**

### Lancer la publication

GitHub → **Actions** → **"📝 Publier articles Notion"** → **Run workflow**

---

## Correspondance Notion → HTML

| Dans Notion | HTML généré |
|-------------|-------------|
| Heading 1 / 2 (dans le corps) | `<h2>` |
| Heading 3 | `<h3>` |
| 1er paragraphe | `<p class="lead">` |
| Paragraphes suivants | `<p>` |
| **Gras** | `<strong>` |
| *Italique* | `<em>` |
| [Lien](url) | `<a href>` |
| 💡 Callout | `<div class="insight-box">` |
| > Citation | `<div class="pullquote">` |
| --- Séparateur | `* * *` |
| • Liste à puces | `<ul><li>` |
| 1. Liste numérotée | `<ol><li>` |
| Image | `<div class="full-image">` |

---

## Structure des URLs

```
Fichier :    blog/articles/art-du-positionnement.html
URL pub :    lauraballo.com/art-du-positionnement
Canonical :  https://lauraballo.com/art-du-positionnement
JSON url :   /art-du-positionnement
```

---

## Dépannage

**Le workflow échoue ?**
→ Settings → Secrets → vérifier NOTION_API_KEY et NOTION_DATABASE_ID
→ Vérifier que l'intégration Notion a accès à la base

**L'article n'apparaît pas ?**
→ Statut = "Publier article" ?
→ Corps de la page non vide ?
→ URL renseignée ?

**404 sur lauraballo.com/slug ?**
→ Vérifier que `vercel.json` est à la racine du repo
→ Vérifier que `blog/articles/slug.html` existe
→ Redéployer depuis Vercel dashboard

**Images expirent ?**
→ Les images Notion sont temporaires (~1h).
   Héberge dans `/assets/img/blog/` et utilise cette URL.

**Ajouter une nouvelle page statique au sitemap ?**
→ Édite la liste `STATIC_PAGES` dans `_scripts/publish.py`
   (les articles de blog sont ajoutés automatiquement).
