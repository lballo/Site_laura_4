# Blog Laura Ballo - Documentation

## 📦 Installation & Déploiement

### Option 1 : Tester en local avec Python
```bash
# Ouvrir un terminal dans le dossier du projet
python3 -m http.server 8000

# Ouvrir http://localhost:8000 dans votre navigateur
```

### Option 2 : Tester en local avec Node.js
```bash
npx serve
# Puis ouvrir l'URL affichée
```

### Option 3 : Tester avec VS Code Live Server
1. Installer l'extension "Live Server"
2. Clic droit sur index.html → "Open with Live Server"

---

## 🚀 Déployer sur Vercel (recommandé)

### Méthode 1 : Drag & Drop (30 secondes)
1. Aller sur [vercel.com](https://vercel.com)
2. Créer un compte gratuit
3. Glisser-déposer le dossier du projet
4. Cliquer sur "Deploy"
5. ✅ Votre site est en ligne !

### Méthode 2 : Via GitHub
1. Pusher le projet sur GitHub
2. Connecter Vercel à votre repo
3. Déploiement automatique à chaque commit

**Domaine personnalisé** : Settings → Domains → Ajouter votre domaine

---

## 📝 Ajouter un nouvel article

### Étape 1 : Créer le fichier HTML
1. Dupliquer un article existant (ex: `stranger-things-lecture-psychologique.html`)
2. Renommer le fichier (ex: `mon-nouvel-article.html`)
3. Modifier le contenu :
   - `<title>` et meta tags
   - Titre H1 dans le hero
   - Contenu de l'article
   - Script en bas : `loadRelatedArticles('mon-slug', ['tag1', 'tag2'])`

### Étape 2 : Ajouter l'entrée dans articles.json
```json
{
  "id": "mon-id",
  "title": "Mon titre",
  "slug": "mon-nouvel-article",
  "url": "/blog/articles/mon-nouvel-article.html",
  "date": "2026-02-01",
  "readingTime": "5 min",
  "excerpt": "Description courte...",
  "tags": ["leadership", "psychologie"],
  "situations": ["dire-non"],
  "searchKeywords": ["mot1", "mot2", "mot3"],
  "category": "Leadership",
  "image": "/assets/img/mon-image.jpg",
  "featured": false
}
```

### Étape 3 : Ajouter l'image
Placer l'image dans `/assets/img/` (format JPG, 1200×800px, <200KB)

✅ **C'est tout !** Le blog s'actualise automatiquement.

---

## 🎨 Personnalisation

### Modifier les couleurs
Éditer `/assets/css/styles.css`, section `:root` :
```css
:root {
  --black: #1A1A1A;
  --gold: #C4A574;
  --terracotta: #9E4A3A;
  /* etc. */
}
```

### Ajouter une situation
Dans `/blog/index.html`, section `.situations-list` :
```html
<div class="situation-item" data-situation="ma-situation">
  Ma nouvelle situation
</div>
```

### Ajouter une collection
Dans `/blog/index.html`, section `.collections-grid` :
```html
<button class="collection-btn" data-tag="mon-tag">
  Ma collection
</button>
```

---

## 🔍 Comment fonctionne la recherche ?

### Algorithme de scoring
Quand un utilisateur tape une requête, le système calcule un score pour chaque article :
- **Titre** : ×3 points
- **Excerpt** : ×2 points
- **Tags** : ×2 points
- **Keywords** : ×1 point

Les articles sont triés par score décroissant.

### Module "Décris ton problème"
Utilise le même algorithme mais :
- Analyse le texte complet de l'utilisateur
- Retourne les 3 meilleurs matches
- 100% côté client (pas d'API, pas de backend)

---

## 🐛 Troubleshooting

### Les articles ne s'affichent pas
1. Vérifier que `articles.json` est valide (utiliser [jsonlint.com](https://jsonlint.com))
2. Ouvrir la console navigateur (F12) pour voir les erreurs
3. Vérifier que les chemins des images sont corrects

### Les images ne s'affichent pas
1. Vérifier que les images sont dans `/assets/img/`
2. Vérifier l'extension (`.jpg` vs `.jpeg` vs `.png`)
3. Vérifier les chemins dans `articles.json`

### La recherche ne fonctionne pas
1. Vérifier que `/assets/js/blog.js` est bien chargé
2. Ouvrir la console pour voir les erreurs JavaScript
3. Tester avec un serveur local (pas en ouvrant directement le fichier HTML)

### Le scroll automatique ne marche pas
Normal si vous testez en ouvrant directement `index.html` dans le navigateur.
Utilisez un serveur local (Python, Node, ou Live Server).

---

## 📊 SEO & Optimisation

### Checklist SEO par article
- ✅ Title tag unique (<60 caractères)
- ✅ Meta description (150-160 caractères)
- ✅ 1 seul H1 par page
- ✅ Structure H2/H3 logique
- ✅ Alt text sur toutes les images
- ✅ Images optimisées (<200KB)
- ✅ Open Graph tags complets

### Optimiser les images
Utiliser [TinyPNG](https://tinypng.com) ou [Squoosh](https://squoosh.app) pour compresser.

Format recommandé :
- Articles : 1200×800px (ratio 3:2)
- Avatar : 500×500px
- Logo : PNG transparent

---

## 🔐 Sécurité & Performance (optionnel)

### Headers de sécurité (Vercel)
Créer un fichier `vercel.json` à la racine :
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

### Analytics (optionnel)
Ajouter avant `</head>` dans chaque page :
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

---

## 📁 Structure des fichiers
```
/
├── index.html                     # Page d'accueil
├── blog/
│   ├── index.html                 # Listing du blog
│   ├── articles.json              # Base de données
│   └── articles/
│       ├── stranger-things-lecture-psychologique.html
│       ├── art-du-positionnement.html
│       └── pouvoir-de-la-douceur.html
├── assets/
│   ├── css/
│   │   └── styles.css             # CSS factorisé
│   ├── js/
│   │   └── blog.js                # JavaScript
│   └── img/                       # Images
│       ├── logo-laura-ballo.png
│       ├── laura-avatar.jpg
│       ├── stranger-things.jpg
│       ├── positionnement.jpg
│       └── douceur.jpg
├── robots.txt                     # SEO
├── sitemap.xml                    # SEO
└── README.md                      # Cette doc
```

---

## 🎯 Best Practices

### Maintenance
- Garder `articles.json` propre et valide
- Utiliser des slugs cohérents (kebab-case)
- Optimiser les images avant upload
- Tester en local avant de déployer

### Contenu
- 1 seul H1 par page (le titre principal)
- Utiliser H2 et H3 pour structurer
- Meta description = synthèse de l'article (150-160 caractères)
- Keywords = mots que les utilisateurs pourraient chercher

### Performance
- Lazy loading sur toutes les images sauf la première
- Images compressées (<200KB)
- CSS minifié en production (optionnel)

---

## 📞 Support

Questions ? Problèmes ?
- Vérifier d'abord la section Troubleshooting
- Consulter la console navigateur (F12)
- Vérifier que `articles.json` est valide

---

Bon lancement ! 🚀
```

---

## ✅ RÉCAPITULATIF FINAL

Vous avez maintenant **TOUT LE CODE** pour votre blog ! 🎉

### 📦 Ce que vous avez :

1. **✅ /blog/articles.json** - Base de données (3 articles)
2. **✅ /assets/css/styles.css** - CSS factorisé complet (1137 lignes)
3. **✅ /assets/js/blog.js** - JavaScript complet (345 lignes)
4. **✅ /blog/index.html** - Page listing dynamique
5. **✅ /index.html** - Page d'accueil du site
6. **✅ /blog/articles/stranger-things-lecture-psychologique.html** - Article 1
7. **✅ /blog/articles/art-du-positionnement.html** - Article 2
8. **✅ /blog/articles/pouvoir-de-la-douceur.html** - Article 3
9. **✅ /robots.txt** - SEO
10. **✅ /sitemap.xml** - SEO
11. **✅ README.md** - Documentation complète

---

### 🎯 Fonctionnalités opérationnelles :

✅ Recherche intelligente avec scoring (titre ×3, excerpt ×2, tags ×2, keywords ×1)  
✅ Filtres par collections (Leadership, Psychologie, Culture, Communication)  
✅ Filtres par situations ("Je n'ose pas dire non", etc.)  
✅ Module "Décris ton problème" → 3 recommandations  
✅ Articles recommandés en bas de chaque article (par tags)  
✅ 100% responsive (mobile/tablet/desktop)  
✅ Navigation entre toutes les pages  
✅ SEO optimisé (meta tags, Open Graph, sitemap.xml)  
✅ Style original conservé (Crimson Pro + Lato + beige/gold/terracotta)  

---

### 📥 Prochaines étapes :

1. **Créer les dossiers** :
```
/blog/articles/
/assets/css/
/assets/js/
/assets/img/