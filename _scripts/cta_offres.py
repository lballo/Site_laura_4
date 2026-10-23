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
  Pour choisir l'offre d'un article précis, quelle que soit sa
  catégorie : ajouter son slug dans ARTICLE_VERS_OFFRE.
  Une offre peut proposer plusieurs liens (clé « liens »).
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
    "gestion-changement": {
        "label": "Formation et accompagnement",
        "titre": "Envie d'aller plus loin ?",
        "texte": "Questionner les habitudes, rassurer, embarquer les équipes : je transmets "
                 "cette démarche en formation, et j'accompagne en individuel les dirigeants "
                 "et les CODIR qui portent une transformation.",
        "liens": [
            {"url": "/formations/conduire-changement-ere-ia",
             "lien": "La formation gestion du changement"},
            {"url": "/accompagnements/leader-changement-ia",
             "lien": "L'accompagnement leader de transformation"},
        ],
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

# Slug d'article → offre. Prioritaire sur la catégorie.
ARTICLE_VERS_OFFRE = {
    "singularite-questionner-les-codes-leadership": "gestion-changement",
}

ICONE_FLECHE = (
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
)


def offre_pour_categorie(categorie, slug=None):
    cle = ARTICLE_VERS_OFFRE.get(slug or "") or CATEGORIE_VERS_OFFRE.get(categorie or "", "appel-offert")
    return OFFRES[cle]


def _lien_html(url, libelle):
    externe = url.startswith("http")
    cible = ' target="_blank" rel="noopener"' if externe else ""
    return (
        f'      <a href="{url}" class="cta-accompagnement-link"{cible}>\n'
        f"        {libelle}\n"
        f"        {ICONE_FLECHE}\n"
        "      </a>\n"
    )


def offre_cta_html(categorie, slug=None):
    """Bloc HTML de l'encart de fin d'article (offre de l'article, sinon de sa catégorie)."""
    o = offre_pour_categorie(categorie, slug)
    liens = o.get("liens") or [{"url": o["url"], "lien": o["lien"]}]
    liens_html = "".join(_lien_html(l["url"], l["lien"]) for l in liens)
    if len(liens) > 1:
        liens_html = '      <div class="cta-accompagnement-links">\n' + liens_html + "      </div>\n"
    return (
        "  <!-- Recommandation accompagnement (offre choisie selon l'article ou sa catégorie : _scripts/cta_offres.py) -->\n"
        '  <section class="cta-accompagnement">\n'
        '    <div class="cta-accompagnement-inner">\n'
        f'      <span class="cta-accompagnement-label">{o["label"]}</span>\n'
        f'      <h3 class="cta-accompagnement-title">{o["titre"]}</h3>\n'
        f'      <p class="cta-accompagnement-text">{o["texte"]}</p>\n'
        + liens_html +
        "    </div>\n"
        "  </section>\n"
    )
