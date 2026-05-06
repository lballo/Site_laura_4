/* ============================================
   NAV.JS — SOURCE DE VÉRITÉ UNIQUE
   Fichier : assets/js/nav.js

   ✏️  POUR MODIFIER LE NAV : éditez uniquement
       NAV_ITEMS et NAV_CTA ci-dessous.
       Desktop ET mobile se mettent à jour automatiquement.
   ============================================ */

const NAV_ITEMS = [
  { label: "Accueil", href: "/" },
  {
    label: "Accompagnements",
    dropdown: [
      { label: "Présence oratoire signature", href: "/accompagnements/mentorat.html" },
      { label: "SOS Prise de parole",         href: "/accompagnements/preparation-flash.html" }
    ]
  },
  {
    label: "Quiz",
    dropdown: [
      { label: "Hypersensibilité", href: "/quizz/hypersensibilite.html" }
    ]
  },
  { label: "Conférences", href: "/conferences-inspirantes" },
  { label: "Blog",        href: "/blog/index.html" },
  {
    label: "À propos",
    dropdown: [
      { label: "Méthodologie", href: "/#process" },
      { label: "Témoignages",  href: "/#temoignages" },
      { label: "FAQ",          href: "/#faq" },
      { label: "Qui suis-je",  href: "/#a-propos" }
    ]
  }
];

const NAV_CTA = { label: "Réserver un appel", href: "/#contact" };

/* --- Génération automatique (ne pas modifier) --- */

function buildDesktopNav() {
  const container = document.getElementById("navLinks");
  if (!container) return;

  let html = "";
  NAV_ITEMS.forEach(item => {
    if (item.dropdown) {
      html += `
        <div class="nav-dropdown">
          <a href="#">${item.label}</a>
          <div class="nav-dropdown-menu">
            ${item.dropdown.map(sub => `<a href="${sub.href}">${sub.label}</a>`).join("")}
          </div>
        </div>`;
    } else {
      html += `<a href="${item.href}">${item.label}</a>`;
    }
  });

  html += `<a href="${NAV_CTA.href}" class="btn btn-secondary">${NAV_CTA.label} <span class="btn-arrow">→</span></a>`;
  container.innerHTML = html;
}

function buildMobileNav() {
  const container = document.getElementById("navMobile");
  if (!container) return;

  let html = "";
  NAV_ITEMS.forEach(item => {
    if (item.dropdown) {
      html += `
        <details class="nav-mobile-dropdown">
          <summary>${item.label}</summary>
          <div class="nav-mobile-dropdown__items">
            ${item.dropdown.map(sub => `<a href="${sub.href}" onclick="closeMobileMenu()">${sub.label}</a>`).join("")}
          </div>
        </details>`;
    } else {
      html += `<a href="${item.href}" onclick="closeMobileMenu()">${item.label}</a>`;
    }
  });

  html += `<a href="${NAV_CTA.href}" class="btn btn-primary" onclick="closeMobileMenu()">${NAV_CTA.label} →</a>`;
  container.innerHTML = html;
}

/* Appelé par includes.js après l'injection du header */
function initNav() {
  buildDesktopNav();
  buildMobileNav();
}
