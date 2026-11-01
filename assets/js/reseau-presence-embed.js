/**
 * ============================================
 * Réseau Présence — formulaire d'inscription à intégrer (embed)
 * Fichier : assets/js/reseau-presence-embed.js
 * ============================================
 *
 * À coller dans la page de vente :
 *
 *   <div id="rp-bareme"></div>      ← optionnel : le barème des places fondatrices
 *   <div id="rp-checkout"></div>    ← le formulaire de paiement Stripe
 *   <script src="https://lauraballo.com/assets/js/reseau-presence-embed.js" async></script>
 *
 * Le script affiche le palier en cours, ouvre le paiement Stripe intégré,
 * puis le message de bienvenue quand le visiteur revient après son inscription.
 */
(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[src*="reseau-presence-embed"]');
  var API = new URL('/api/reseau-presence', script ? script.src : window.location.href).href;

  // Charte Réseau Présence : Figtree (texte), Newsreader (titres), Abhaya Libre (sous-titres)
  // Couleurs : F3ECE8, E8DDD6, AFA098, 6C6059 ; touches AA564C, A83932
  var CSS = '' +
    '.rpe{font-family:Figtree,system-ui,-apple-system,"Segoe UI",sans-serif;color:#6C6059;line-height:1.55;box-sizing:border-box}' +
    '.rpe *{box-sizing:border-box}' +
    '.rpe-card{padding:0}' +
    '.rpe-title{font-family:"Abhaya Libre",Georgia,serif;font-size:1.35rem;font-weight:500;color:#6C6059;margin:0 0 .2rem}' +
    '.rpe-sub{font-size:.88rem;color:#6C6059;margin:0 0 1.1rem}' +
    '.rpe-tiers{list-style:none;padding:0;margin:0;display:grid;gap:.45rem}' +
    '.rpe-tier{display:flex;justify-content:space-between;align-items:center;gap:.75rem;padding:.7rem 1rem;border-radius:12px;border:1px solid #E8DDD6;background:#F3ECE8}' +
    '.rpe-places{font-size:.88rem;color:#6C6059}' +
    '.rpe-tag{display:block;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;font-weight:600;margin-top:.15rem}' +
    '.rpe-price{font-family:Newsreader,Georgia,serif;font-size:1.3rem;color:#6C6059;white-space:nowrap}' +
    '.rpe-price small{font-family:Figtree,system-ui,sans-serif;font-size:.78rem;color:#6C6059}' +
    '.rpe-full{opacity:.5}.rpe-full .rpe-price{text-decoration:line-through}' +
    '.rpe-current{background:#A83932;border-color:#A83932}' +
    '.rpe-current .rpe-places,.rpe-current .rpe-price,.rpe-current .rpe-price small{color:#fff}' +
    '.rpe-std{background:#fff;border-style:dashed}' +
    '.rpe-badge{display:block;width:max-content;max-width:100%;margin:0 auto 1rem;padding:.5rem 1.1rem;border-radius:999px;background:#F3ECE8;color:#A83932;font-weight:600;font-size:.9rem;text-align:center}' +
    '.rpe-frame{background:#fff;border:1px solid #E8DDD6;border-radius:16px;padding:1rem;min-height:420px}' +
    '.rpe-msg{text-align:center;padding:2.5rem 1.25rem;color:#6C6059}' +
    '.rpe-msg strong{color:#6C6059;font-weight:600}' +
    '.rpe-msg a{color:#A83932}' +
    '.rpe-thanks h3{font-family:Newsreader,Georgia,serif;font-size:1.8rem;font-weight:400;letter-spacing:-.02em;color:#6C6059;margin:0 0 .75rem}' +
    '.rpe-skel{height:46px;border-radius:12px;background:linear-gradient(90deg,#E8DDD6 0%,#F3ECE8 50%,#E8DDD6 100%);background-size:200% 100%;animation:rpe-sh 1.4s infinite}' +
    '@keyframes rpe-sh{to{background-position:-200% 0}}' +
    '@media (prefers-reduced-motion:reduce){.rpe-skel{animation:none}}';

  function addStyles() {
    if (document.getElementById('rpe-styles')) return;
    var s = document.createElement('style');
    s.id = 'rpe-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function loadStripe() {
    if (window.Stripe) return Promise.resolve(window.Stripe);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.onload = function () { resolve(window.Stripe); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function euros(n) { return n + ' €'; }

  function renderBareme(el, data) {
    var cur = data.current;
    var rows = data.tiers.map(function (t) {
      var full = t.remaining === 0;
      var isCur = cur && t.price === cur.price;
      var tag = full ? 'Complet' : isCur ? 'En cours · ' + t.remaining + ' place' + (t.remaining > 1 ? 's' : '') + ' restante' + (t.remaining > 1 ? 's' : '') : '';
      return '<li class="rpe-tier' + (full ? ' rpe-full' : '') + (isCur ? ' rpe-current' : '') + '">' +
        '<span class="rpe-places">Places ' + t.firstPlace + ' à ' + t.lastPlace + (tag ? '<span class="rpe-tag">' + tag + '</span>' : '') + '</span>' +
        '<span class="rpe-price">' + euros(t.price) + ' <small>/ mois</small></span></li>';
    }).join('');
    rows += '<li class="rpe-tier rpe-std' + (cur ? '' : ' rpe-current') + '"><span class="rpe-places">Tarif normal</span>' +
      '<span class="rpe-price">' + euros(data.fullPrice) + ' <small>/ mois</small></span></li>';
    el.innerHTML = '<div class="rpe rpe-card"><p class="rpe-title">Les places fondatrices</p>' +
      '<p class="rpe-sub">Le tarif indiqué s’applique pendant ' + data.discountMonths + ' mois, puis ' + euros(data.fullPrice) + ' par mois.</p>' +
      '<ul class="rpe-tiers">' + rows + '</ul></div>';
  }

  function errorBox(msg) {
    return '<div class="rpe-msg"><strong>Le formulaire ne s’est pas chargé.</strong><br>' + msg +
      '<br>Si le problème persiste, écrivez à <a href="mailto:contact@lauraballo.com">contact@lauraballo.com</a>.</div>';
  }

  function cleanReturnUrl() {
    var u = new URL(window.location.href);
    u.searchParams.delete('session_id');
    u.hash = '';
    return u.href;
  }

  function init() {
    addStyles();
    var bareme = document.getElementById('rp-bareme');
    var checkout = document.getElementById('rp-checkout');
    if (!checkout) return;

    // Retour après inscription
    var sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (sessionId && /^cs_/.test(sessionId)) {
      checkout.innerHTML = '<div class="rpe rpe-frame"><div class="rpe-msg">Vérification de votre inscription…</div></div>';
      fetch(API + '?session_id=' + encodeURIComponent(sessionId))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var ok = d.status === 'complete';
          checkout.innerHTML = '<div class="rpe rpe-frame"><div class="rpe-msg rpe-thanks">' +
            (ok
              ? '<h3>Bienvenue dans Présence</h3><p>Votre inscription est confirmée' + (d.email ? ' pour <strong>' + d.email.replace(/[<>&"]/g, '') + '</strong>' : '') +
                '. Votre essai de 14 jours commence aujourd’hui. Vous allez recevoir par e-mail votre accès à l’espace membre et la date de la prochaine réunion d’accueil.</p>'
              : '<h3>Inscription non finalisée</h3><p>Votre paiement n’a pas abouti. <a href="' + cleanReturnUrl() + '">Recommencer l’inscription</a></p>') +
            '</div></div>';
          checkout.scrollIntoView({ behavior: 'smooth', block: 'center' });
        })
        .catch(function () {});
      return;
    }

    if (bareme) bareme.innerHTML = '<div class="rpe rpe-card"><ul class="rpe-tiers">' + new Array(7).join('<li class="rpe-skel"></li>') + '</ul></div>';
    checkout.innerHTML = '<div class="rpe"><span class="rpe-badge" hidden></span><div class="rpe-frame" id="rpe-mount"><div class="rpe-msg">Chargement du formulaire…</div></div></div>';

    Promise.all([fetch(API).then(function (r) { return r.json(); }), loadStripe()])
      .then(function (res) {
        var data = res[0];
        if (data.error) throw new Error(data.error);
        if (bareme) renderBareme(bareme, data);
        var badge = checkout.querySelector('.rpe-badge');
        badge.hidden = false;
        badge.textContent = data.current
          ? 'Votre tarif : ' + euros(data.current.price) + ' par mois pendant ' + data.discountMonths + ' mois, puis ' + euros(data.fullPrice)
          : 'Tarif : ' + euros(data.fullPrice) + ' par mois';

        return window.Stripe(data.publishableKey).initEmbeddedCheckout({
          fetchClientSecret: function () {
            return fetch(API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ returnUrl: cleanReturnUrl() })
            })
              .then(function (r) { return r.json(); })
              .then(function (d) { if (d.error) throw new Error(d.error); return d.clientSecret; });
          }
        });
      })
      .then(function (embedded) {
        var mount = document.getElementById('rpe-mount');
        mount.innerHTML = '';
        embedded.mount(mount);
      })
      .catch(function (err) {
        var mount = document.getElementById('rpe-mount');
        if (mount) mount.innerHTML = errorBox(err && err.message ? err.message : 'Réessayez dans quelques minutes.');
        if (bareme) bareme.innerHTML = '';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
