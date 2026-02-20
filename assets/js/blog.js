// ========================================
// BLOG LAURA BALLO - JavaScript
// Recherche + Filtres + Recommandations
// ========================================

let allArticles = [];

// Charger les articles au démarrage
document.addEventListener('DOMContentLoaded', () => {
  loadArticles();
  setupEventListeners();
});

// Charger articles.json
async function loadArticles() {
  try {
    const response = await fetch('/blog/articles.json');
    const data = await response.json();
    allArticles = data.articles;
    
    renderArticles(allArticles);
    renderFeatured();
    renderRecent();
  } catch (error) {
    console.error('Erreur chargement articles:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Recherche
  const searchInput = document.querySelector('.search-minimal input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, 300));
  }
  
  // Collections
  const collectionBtns = document.querySelectorAll('.collection-btn');
  collectionBtns.forEach(btn => {
    btn.addEventListener('click', () => handleCollectionClick(btn));
  });
  
  // Situations
  const situationItems = document.querySelectorAll('.situation-item');
  situationItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      handleSituationClick(item);
    });
  });
  
}

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Recherche
function handleSearch(e) {
  const query = e.target.value.trim().toLowerCase();
  
  if (query === '') {
    renderArticles(allArticles);
    return;
  }
  
  const results = searchArticles(query);
  renderArticles(results);
  scrollToArticles();
}

// Algorithme de scoring
function searchArticles(query) {
  const normalize = (str) => str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  const queryNorm = normalize(query);
  const queryWords = queryNorm.split(/\s+/).filter(w => w.length > 2);
  
  return allArticles
    .map(article => {
      let score = 0;
      
      // Titre (×3)
      if (normalize(article.title).includes(queryNorm)) score += 30;
      queryWords.forEach(word => {
        if (normalize(article.title).includes(word)) score += 3;
      });
      
      // Excerpt (×2)
      if (normalize(article.excerpt).includes(queryNorm)) score += 20;
      queryWords.forEach(word => {
        if (normalize(article.excerpt).includes(word)) score += 2;
      });
      
      // Tags (×2)
      article.tags.forEach(tag => {
        if (normalize(tag).includes(queryNorm)) score += 20;
        queryWords.forEach(word => {
          if (normalize(tag).includes(word)) score += 2;
        });
      });
      
      // Keywords (×1)
      article.searchKeywords.forEach(keyword => {
        if (normalize(keyword).includes(queryNorm)) score += 10;
        if (queryNorm.includes(normalize(keyword))) score += 10;
        queryWords.forEach(word => {
          if (normalize(keyword).includes(word)) score += 1;
        });
      });
      
      return { article, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.article);
}

// Collection filter
function handleCollectionClick(btn) {
  // Toggle active
  document.querySelectorAll('.collection-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  const tag = btn.dataset.tag;
  
  if (!tag || tag === 'all') {
    renderArticles(allArticles);
    return;
  }
  
  const filtered = allArticles.filter(article => 
    article.tags.includes(tag)
  );
  
  renderArticles(filtered);
  scrollToArticles();
}

// Situation filter
function handleSituationClick(item) {
  const situation = item.dataset.situation;
  
  const filtered = allArticles.filter(article => 
    article.situations && article.situations.includes(situation)
  );
  
  renderArticles(filtered);
  scrollToArticles();
}

// Scroll vers articles
function scrollToArticles() {
  const section = document.querySelector('.articles-section');
  if (section) {
    setTimeout(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

// Render featured article
function renderFeatured() {
  const container = document.querySelector('.featured-hero-card');
  if (!container) return;
  
  const featured = allArticles.find(a => a.featured) || allArticles[0];
  if (!featured) return;
  
  container.href = featured.url;
  container.innerHTML = `
    <img src="${featured.image}" alt="${featured.title}" class="featured-hero-image" loading="eager">
    <div class="featured-hero-content">
      <span class="featured-hero-tag">À la une · ${featured.category}</span>
      <h2 class="featured-hero-title">${featured.title}</h2>
      <p class="featured-hero-excerpt">${featured.excerpt}</p>
      <p class="featured-hero-meta">${formatDate(featured.date)} · ${featured.readingTime}</p>
      <span class="featured-hero-link">Lire l'article</span>
    </div>
  `;
}

// Render recent (3)
function renderRecent() {
  const container = document.querySelector('.featured-grid');
  if (!container) return;
  
  const recent = [...allArticles]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);
  
  container.innerHTML = recent.map(article => `
    <a href="${article.url}" class="featured-card">
      <img src="${article.image}" alt="${article.title}" class="featured-image" loading="lazy">
      <span class="featured-tag">${article.category}</span>
      <h3 class="featured-title">${article.title}</h3>
      <p class="featured-excerpt">${article.excerpt}</p>
      <p class="featured-meta">${formatDate(article.date)} · ${article.readingTime}</p>
    </a>
  `).join('');
}

// Render all articles
function renderArticles(articles) {
  const container = document.querySelector('.articles-list');
  if (!container) return;
  
  if (articles.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--gray-brown);font-size:18px;">Aucun article trouvé.</p>';
    return;
  }
  
  container.innerHTML = articles.map(article => `
    <a href="${article.url}" class="article-item">
      <div class="article-image-container">
        <img src="${article.image}" alt="${article.title}" class="article-image" loading="lazy">
      </div>
      <div class="article-content">
        <span class="article-date">${formatDate(article.date)}</span>
        <h3 class="article-title">${article.title}</h3>
        <p class="article-excerpt">${article.excerpt}</p>
        <span class="article-read-more">Lire l'article</span>
      </div>
    </a>
  `).join('');
}

// Format date
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('fr-FR', options);
}

// ========================================
// ARTICLES RECOMMANDÉS (pour pages articles)
// ========================================

async function loadRelatedArticles(currentSlug, currentTags) {
  try {
    const response = await fetch('/blog/articles.json');
    const data = await response.json();
    const allArticles = data.articles;
    
    // Filtrer les articles avec tags similaires
    const related = allArticles
      .filter(article => article.slug !== currentSlug)
      .map(article => {
        const commonTags = article.tags.filter(tag => currentTags.includes(tag));
        return { article, score: commonTags.length };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.article);
    
    renderRelatedArticles(related);
  } catch (error) {
    console.error('Erreur chargement articles recommandés:', error);
  }
}

function renderRelatedArticles(articles) {
  const container = document.querySelector('.articles-grid');
  if (!container) return;
  
  if (articles.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);">Aucun article similaire trouvé.</p>';
    return;
  }
  
  container.innerHTML = articles.map(article => `
    <a href="${article.url}" class="article-card">
      <img src="${article.image}" alt="${article.title}" class="article-card-image" loading="lazy">
      <div class="article-card-tags">
        ${article.tags.slice(0, 2).map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
      <h4 class="article-card-title">${article.title}</h4>
      <p class="article-card-excerpt">${article.excerpt}</p>
      <p class="article-card-meta">${article.readingTime}</p>
    </a>
  `).join('');
}

// Scroll nav effect
window.addEventListener('scroll', function() {
  const nav = document.querySelector('.nav');
  if (nav) {
    if (window.scrollY > 100) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }
});