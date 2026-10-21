"""
═══════════════════════════════════════════════════════════
  Encart « Envie d'aller plus loin ? » en fin d'article
═══════════════════════════════════════════════════════════
  L'offre proposée dépend de la catégorie de l'article,
  c'est-à-dire du premier tag Notion (comme dans publish.py).
  Utilisé par publish.py via le marqueur {{OFFRE_CTA}} du gabarit
  _templates/article.html.

  Pour changer une offre ou un texte : modifier OFFRES.
  Pour rattacher une catégorie à une autre offre : modifier
  CATEGORIE_VERS_OFFRE. Une catégorie absente renvoie vers
  l'appel offert.
═══════════════════════════════════════════════════════════
"""

CALENDLY_URL = "https://calendly.com/laura-ballo1993/echangecoaching"

OFFRES = {
    "presence-oratoire": {
        "label": "Accompagnement",
        "titre": "Envie d'aller plus loin ?",
        "texte": "Une conférence, une interview ou une prise de parole à fort enjeu en vue ? "
                 "Je vous accompagne en individuel pour incarner votre présence à l'oral.",
        "url": "/accompagnements/presence-oratoire-signature",
        "lien": "Découvrir Présence oratoire signature",
    },
    "coaching-dirigeants": {
        "label": "Accompagnement",
        "titre": "Envie d'aller plus loin ?",
        "texte": "J'accompagne les dirigeants à prendre leur place, incarner leur rôle et "
                 "inspirer leurs équipes, dans un coaching individuel sur six mois.",
        "url": "/accompagnements/presence-signature",
        "lien": "Découvrir le coaching dirigeants",
    },
    "leader-ia": {
        "label": "Accompagnement",
        "titre": "Envie d'aller plus loin ?",
        "texte": "Vous portez l'arrivée de l'IA dans votre organisation ? Je vous aide à "
                 "embarquer vos équipes : carte des acteurs, feuille de route, charte IA.",
        "url": "/accompagnements/leader-changement-ia",
        "lien": "Découvrir l'accompagnement",
    },
    "appel-offert": {
        "label": "Échange offert",
        "titre": "Envie d'en parler ?",
        "texte": "Je vous propose un premier échange de 30 minutes, offert, pour faire le "
                 "point sur votre situation et voir comment avancer.",
        "url": CALENDLY_URL,
        "lien": "Réserver un appel offert",
    },
}

# Catégorie (premier tag Notion) → offre. Toute autre catégorie → appel offert.
CATEGORIE_VERS_OFFRE = {
    "Prise de parole en public": "presence-oratoire",
    "Storytelling": "presence-oratoire",
    "Média training": "presence-oratoire",
    "Communication": "presence-oratoire",
    "Leadership": "coaching-dirigeants",
    "Management": "coaching-dirigeants",
    "IA & automation": "leader-ia",
    "Gestion du changement": "leader-ia",
}

ICONE_FLECHE = (
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
)


def offre_pour_categorie(categorie):
    return OFFRES[CATEGORIE_VERS_OFFRE.get(categorie or "", "appel-offert")]


def offre_cta_html(categorie):
    """Bloc HTML de l'encart de fin d'article pour cette catégorie."""
    o = offre_pour_categorie(categorie)
    externe = o["url"].startswith("http")
    cible = ' target="_blank" rel="noopener"' if externe else ""
    return (
        "  <!-- Recommandation accompagnement (offre choisie selon la catégorie : _scripts/cta_offres.py) -->\n"
        '  <section class="cta-accompagnement">\n'
        '    <div class="cta-accompagnement-inner">\n'
        f'      <span class="cta-accompagnement-label">{o["label"]}</span>\n'
        f'      <h3 class="cta-accompagnement-title">{o["titre"]}</h3>\n'
        f'      <p class="cta-accompagnement-text">{o["texte"]}</p>\n'
        f'      <a href="{o["url"]}" class="cta-accompagnement-link"{cible}>\n'
        f'        {o["lien"]}\n'
        f"        {ICONE_FLECHE}\n"
        "      </a>\n"
        "    </div>\n"
        "  </section>\n"
    )
