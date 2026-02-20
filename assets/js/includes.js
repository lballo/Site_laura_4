/**
 * ============================================
 * INCLUDES.JS - Chargeur de composants partagés
 * Fichier : assets/js/includes.js
 * ============================================
 * 
 * Charge automatiquement : header, footer, bannière cookies
 * 
 * UTILISATION dans chaque page :
 * <div id="header-placeholder"></div>
 * <div id="footer-placeholder"></div>
 * <div id="cookies-placeholder"></div>
 * <script src="/assets/js/includes.js"></script>
 */

(function() {
  'use strict';

  // ===== CONFIGURATION =====
  const COMPONENTS = {
    header: {
      placeholder: 'header-placeholder',
      file: '/assets/components/header.html'
    },
    headerFormation: {
      placeholder: 'header-formation-placeholder',
      file: '/assets/components/header-formation.html'
    },
    footer: {
      placeholder: 'footer-placeholder',
      file: '/assets/components/footer.html'
    },
    cookies: {
      placeholder: 'cookies-placeholder',
      file: '/assets/components/cookies.html'
    }
  };

  // ===== CHARGEUR DE COMPOSANTS =====
  
  async function loadComponent(name, config) {
    const placeholder = document.getElementById(config.placeholder);
    if (!placeholder) {
      console.warn(`[Includes] Placeholder #${config.placeholder} non trouvé`);
      return false;
    }

    try {
      const response = await fetch(config.file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      placeholder.outerHTML = html;
      console.log(`✓ Composant "${name}" chargé`);
      return true;
    } catch (error) {
      console.error(`✗ Erreur chargement "${name}":`, error);
      return false;
    }
  }

  async function loadAllComponents() {
    const promises = Object.entries(COMPONENTS).map(
      ([name, config]) => loadComponent(name, config)
    );
    await Promise.all(promises);
    
    // Initialise après chargement
    initNavigation();
    initCookieConsent();
    initSmoothScroll();
    initAnimations();
  }

  // ===== NAVIGATION =====
  
  function initNavigation() {
    window.addEventListener('scroll', function() {
      const nav = document.getElementById('nav');
      const progress = document.getElementById('navProgress');
      
      if (!nav || !progress) return;
      
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrollPercent = (scrollTop / scrollHeight) * 100;

      progress.style.width = scrollPercent + '%';

      if (scrollTop > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    });
    
    // Déclenche une fois au chargement
    window.dispatchEvent(new Event('scroll'));
  }

  // Fonctions globales pour le menu mobile
  window.toggleMobileMenu = function() {
    const burger = document.getElementById('navBurger');
    const mobileMenu = document.getElementById('navMobile');
    if (!burger || !mobileMenu) return;
    
    burger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
  };

  window.closeMobileMenu = function() {
    const burger = document.getElementById('navBurger');
    const mobileMenu = document.getElementById('navMobile');
    if (!burger || !mobileMenu) return;
    
    burger.classList.remove('active');
    mobileMenu.classList.remove('active');
    document.body.style.overflow = '';
  };

  // ===== SMOOTH SCROLL =====
  
  function initSmoothScroll() {
    document.addEventListener('click', function(e) {
      const anchor = e.target.closest('a[href^="#"], a[href^="/#"]');
      if (!anchor) return;
      
      const href = anchor.getAttribute('href');
      const hash = href.includes('#') ? '#' + href.split('#')[1] : null;
      
      if (!hash || hash === '#') return;
      
      // Si on est sur une autre page que l'accueil et le lien est /#section
      if (href.startsWith('/#') && window.location.pathname !== '/' && window.location.pathname !== '/index.html' && window.location.pathname !== '/index2.html') {
        return; // Laisse le navigateur gérer la redirection
      }
      
      const target = document.querySelector(hash);
      if (target) {
        e.preventDefault();
        const offset = 100;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
        closeMobileMenu();
      }
    });
  }

  // ===== ANIMATIONS =====
  
  function initAnimations() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -80px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, observerOptions);

    document.querySelectorAll('.fade-in').forEach(el => {
      observer.observe(el);
    });
  }

  // ===== GESTIONNAIRE DE CONSENTEMENT COOKIES =====
  
  function initCookieConsent() {
    const STORAGE_KEY = 'cookie_consent';
    const CONSENT_DURATION_DAYS = 365;

    const elements = {
      overlay: document.getElementById('ccOverlay'),
      banner: document.getElementById('ccBanner'),
      settingsPanel: document.getElementById('ccSettingsPanel'),
      acceptBtn: document.getElementById('ccAcceptAll'),
      rejectBtn: document.getElementById('ccRejectAll'),
      settingsBtn: document.getElementById('ccShowSettings'),
      saveBtn: document.getElementById('ccSaveSettings'),
      reopenLink: document.getElementById('ccReopenLink'),
      analyticsToggle: document.getElementById('ccAnalytics'),
      marketingToggle: document.getElementById('ccMarketing')
    };

    if (!elements.banner) {
      console.warn('[Cookies] Bannière non trouvée');
      return;
    }

    function getStoredConsent() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.expires && new Date(parsed.expires) > new Date()) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('Erreur lecture consentement:', e);
      }
      return null;
    }

    function saveConsent(preferences) {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + CONSENT_DURATION_DAYS);
      
      const consentData = {
        necessary: true,
        analytics: preferences.analytics || false,
        marketing: preferences.marketing || false,
        timestamp: new Date().toISOString(),
        expires: expirationDate.toISOString()
      };
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(consentData));
      } catch (e) {
        console.warn('Erreur sauvegarde consentement:', e);
      }
      
      return consentData;
    }

    function showBanner() {
      elements.overlay.classList.add('cc-visible');
      elements.banner.classList.add('cc-visible');
      elements.reopenLink.classList.remove('cc-visible');
      setTimeout(() => elements.acceptBtn.focus(), 100);
    }

    function hideBanner() {
      elements.overlay.classList.remove('cc-visible');
      elements.banner.classList.remove('cc-visible');
      elements.settingsPanel.classList.remove('cc-visible');
      elements.reopenLink.classList.add('cc-visible');
    }

    function toggleSettings() {
      elements.settingsPanel.classList.toggle('cc-visible');
    }

    function applyConsent(consent) {
      // ===== ACTIVEZ VOS SCRIPTS ICI =====
      
      if (consent.analytics) {
        // Google Analytics, Plausible, etc.
        // Exemple :
        // if (typeof gtag === 'function') {
        //   gtag('consent', 'update', { analytics_storage: 'granted' });
        // }
        console.log('✓ Cookies analytiques activés');
      }
      
      if (consent.marketing) {
        // Facebook Pixel, LinkedIn Insight, etc.
        console.log('✓ Cookies marketing activés');
      }
      
      window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: consent }));
    }

    function handleAcceptAll() {
      const consent = saveConsent({ analytics: true, marketing: true });
      applyConsent(consent);
      hideBanner();
    }

    function handleRejectAll() {
      const consent = saveConsent({ analytics: false, marketing: false });
      applyConsent(consent);
      hideBanner();
    }

    function handleSaveSettings() {
      const consent = saveConsent({
        analytics: elements.analyticsToggle.checked,
        marketing: elements.marketingToggle.checked
      });
      applyConsent(consent);
      hideBanner();
    }

    function handleReopenBanner() {
      const stored = getStoredConsent();
      if (stored) {
        elements.analyticsToggle.checked = stored.analytics;
        elements.marketingToggle.checked = stored.marketing;
      }
      showBanner();
    }

    // Initialisation
    const existingConsent = getStoredConsent();
    
    if (existingConsent) {
      applyConsent(existingConsent);
      elements.reopenLink.classList.add('cc-visible');
      elements.analyticsToggle.checked = existingConsent.analytics;
      elements.marketingToggle.checked = existingConsent.marketing;
    } else {
      showBanner();
    }

    // Événements
    elements.acceptBtn.addEventListener('click', handleAcceptAll);
    elements.rejectBtn.addEventListener('click', handleRejectAll);
    elements.settingsBtn.addEventListener('click', toggleSettings);
    elements.saveBtn.addEventListener('click', handleSaveSettings);
    elements.reopenLink.addEventListener('click', handleReopenBanner);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && elements.settingsPanel.classList.contains('cc-visible')) {
        toggleSettings();
      }
    });

    // API publique
    window.CookieConsent = {
      hasConsent: function(type) {
        const consent = getStoredConsent();
        return consent ? consent[type] === true : false;
      },
      getPreferences: function() {
        return getStoredConsent();
      },
      showBanner: handleReopenBanner,
      reset: function() {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
      }
    };
  }

  // ===== FONCTIONS GLOBALES POUR LES PAGES =====
  
  // FAQ toggle (si présent)
  window.toggleFAQ = function(button) {
    const faqItem = button.parentElement;
    const isActive = faqItem.classList.contains('active');
    
    document.querySelectorAll('.faq-item').forEach(item => {
      item.classList.remove('active');
    });
    
    if (!isActive) {
      faqItem.classList.add('active');
    }
  };

  // Modal (si présent)
  window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = 'auto';
    }
  };

  // Fermer modal au clic extérieur
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
      closeModal(e.target.id);
    }
  });

  // Fermer modal avec ESC
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach(modal => {
        closeModal(modal.id);
      });
    }
  });

  // ===== LANCEMENT =====
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAllComponents);
  } else {
    loadAllComponents();
  }

})();
