// ==UserScript==
// @name         Drawspell VF
// @namespace    drawspell-vf
// @version      1.0.0
// @description  Charge la version française (VF) des cartes quand tu importes un deck sur drawspell.space. Données et images : Scryfall.
// @match        https://drawspell.space/*
// @run-at       document-start
// @grant        none
// @sandbox      JavaScript
// @inject-into  page
// ==/UserScript==

/*
 * Drawspell VF
 * drawspell résout chaque ligne du deck avec l'API Scryfall, qui renvoie toujours la carte anglaise.
 * Ce script intercepte ces réponses (POST /cards/collection et GET /cards/named) et remplace chaque
 * carte par son impression dans la langue choisie : même édition et même numéro si elle existe,
 * sinon la meilleure autre impression traduite. Les autres appels (cache par id, jetons) ne sont pas touchés.
 * Le code n'utilise pas de commentaires de ligne pour pouvoir servir tel quel de favori (bookmarklet).
 */
(function () {
  'use strict';

  /* Langue des cartes : fr, de, it, es, pt, ja, ko, ru, zhs, zht */
  var LANG = 'fr';

  var W = window;
  if (W.__drawspellVF) {
    W.__drawspellVF.say('déjà actif (' + W.__drawspellVF.lang + ').');
    return;
  }
  if (!/(^|\.)drawspell\.space$/.test(location.hostname)) {
    alert('Drawspell VF : ouvre d\'abord drawspell.space, puis utilise à nouveau ce favori.');
    return;
  }

  var API = 'https://api.scryfall.com';
  var EXTRA_LAYOUTS = { token: 1, double_faced_token: 1, emblem: 1, art_series: 1, planar: 1, scheme: 1, vanguard: 1 };
  var MAX_QUERY = 900;
  var realFetch = W.fetch;
  var nextSlot = 0;
  var known = {};
  var pending = {};
  var box = null;
  var hideTimer = 0;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function oracleOf(card) {
    return card.oracle_id || (card.card_faces && card.card_faces[0] && card.card_faces[0].oracle_id) || '';
  }

  function keyOf(card) {
    return card.set + '/' + card.collector_number;
  }

  function hasRealImage(card) {
    return card.image_status === 'highres_scan' || card.image_status === 'lowres';
  }

  function usable(card) {
    return !!card && card.object === 'card' && card.lang === LANG && !card.digital &&
      !EXTRA_LAYOUTS[card.layout] && hasRealImage(card);
  }

  function wanted(card) {
    return !!card && card.object === 'card' && card.lang !== LANG && !EXTRA_LAYOUTS[card.layout];
  }

  function say(message) {
    try {
      if (!document.documentElement) return;
      if (!box) {
        box = document.createElement('div');
        box.setAttribute('role', 'status');
        box.setAttribute('style', [
          'position:fixed', 'z-index:2147483647', 'left:12px', 'bottom:12px',
          'max-width:min(380px,calc(100vw - 24px))', 'padding:10px 14px', 'border-radius:10px',
          'background:#1f2a52', 'color:#fff', 'font:600 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
          'box-shadow:0 8px 28px rgba(0,0,0,.35)', 'pointer-events:none', 'transition:opacity .4s'
        ].join(';'));
      }
      if (!box.isConnected) (document.body || document.documentElement).appendChild(box);
      box.textContent = 'Drawspell VF · ' + message;
      box.style.opacity = '1';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { box.style.opacity = '0'; }, 7000);
    } catch (e) { /* l'affichage est facultatif */ }
  }

  /* Scryfall : 2 requêtes par seconde maximum sur /cards/search. Un 429 arrive sans en-tête CORS,
     donc fetch échoue avec une TypeError : on attend alors 60 s avant de réessayer. */
  async function getJson(url) {
    for (var attempt = 0; attempt < 3; attempt++) {
      var now = Date.now();
      var at = Math.max(now, nextSlot);
      nextSlot = at + 550;
      if (at > now) await sleep(at - now);
      var res;
      try {
        res = await realFetch.call(W, url, { headers: { Accept: 'application/json' } });
      } catch (e) {
        say('Scryfall demande une pause, nouvel essai dans 60 s…');
        await sleep(60000);
        continue;
      }
      if (res.status === 429) {
        say('Scryfall demande une pause, nouvel essai dans 60 s…');
        await sleep(60000);
        continue;
      }
      if (!res.ok) return null;
      return res.json();
    }
    return null;
  }

  async function search(query, params) {
    var url = API + '/cards/search?unique=prints' + (params || '') + '&q=' + encodeURIComponent(query);
    var out = [];
    while (url) {
      var page = await getJson(url);
      if (!page || !Array.isArray(page.data)) break;
      out = out.concat(page.data);
      url = page.has_more ? page.next_page : null;
    }
    return out;
  }

  function buildQueries(terms, prefix, suffix) {
    var queries = [];
    var group = [];
    var length = prefix.length + suffix.length;
    terms.forEach(function (term) {
      if (group.length && length + term.length + 4 > MAX_QUERY) {
        queries.push(prefix + group.join(' or ') + suffix);
        group = [];
        length = prefix.length + suffix.length;
      }
      group.push(term);
      length += term.length + 4;
    });
    if (group.length) queries.push(prefix + group.join(' or ') + suffix);
    return queries;
  }

  /* Ordre de préférence quand la même édition n'existe pas dans la langue voulue :
     même illustration, scan haute définition, déjà sortie, puis la plus récente. */
  function pickBest(candidates, reference) {
    var day = today();
    var illustration = reference && reference.illustration_id;
    function score(card) {
      return [
        illustration && card.illustration_id === illustration ? 0 : 1,
        card.image_status === 'highres_scan' ? 0 : 1,
        card.released_at && card.released_at > day ? 1 : 0
      ];
    }
    return candidates.filter(usable).sort(function (a, b) {
      var sa = score(a);
      var sb = score(b);
      for (var i = 0; i < sa.length; i++) {
        if (sa[i] !== sb[i]) return sa[i] - sb[i];
      }
      return a.released_at < b.released_at ? 1 : a.released_at > b.released_at ? -1 : 0;
    })[0] || null;
  }

  async function localizeAll(cards) {
    var todo = [];
    var seen = {};
    cards.forEach(function (card) {
      var key = keyOf(card);
      if (!(key in known) && !seen[key]) {
        seen[key] = 1;
        todo.push(card);
      }
    });
    if (!todo.length) return;

    var exact = {};
    var printQueries = buildQueries(todo.map(function (card) {
      return 'set:' + card.set + ' cn:"' + card.collector_number + '"';
    }), 'lang:' + LANG + ' (', ')');
    for (var i = 0; i < printQueries.length; i++) {
      (await search(printQueries[i], '&include_extras=true&include_variations=true')).forEach(function (card) {
        exact[keyOf(card)] = card;
      });
    }

    var misses = [];
    todo.forEach(function (card) {
      var match = exact[keyOf(card)];
      if (usable(match)) known[keyOf(card)] = match;
      else misses.push(card);
    });
    if (!misses.length) return;

    var oracles = [];
    misses.forEach(function (card) {
      var oracle = oracleOf(card);
      if (oracle && oracles.indexOf(oracle) < 0) oracles.push(oracle);
    });
    var others = [];
    var oracleQueries = buildQueries(oracles.map(function (oracle) {
      return 'oracleid:' + oracle;
    }), 'lang:' + LANG + ' -is:digital (', ')');
    for (var j = 0; j < oracleQueries.length; j++) {
      others = others.concat(await search(oracleQueries[j], '&order=released&dir=desc'));
    }
    misses.forEach(function (card) {
      var oracle = oracleOf(card);
      known[keyOf(card)] = pickBest(others.filter(function (other) { return oracleOf(other) === oracle; }), card);
    });
  }

  /* Les objets VF de Scryfall n'ont pas de all_parts : on garde ceux de la carte anglaise
     pour que le menu « cartes liées » de drawspell propose toujours les jetons. */
  function withParts(localized, english) {
    if (localized && english && english.all_parts && !localized.all_parts) {
      return Object.assign({}, localized, { all_parts: english.all_parts });
    }
    return localized;
  }

  function jsonResponse(res, body) {
    return new Response(JSON.stringify(body), {
      status: res.status,
      statusText: res.statusText,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function sameText(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  async function onCollection(res, init) {
    if (!res.ok) return res;
    try {
      var identifiers = [];
      try {
        identifiers = JSON.parse((init && typeof init.body === 'string' && init.body) || '{}').identifiers || [];
      } catch (e) { identifiers = []; }
      /* Le cache de drawspell interroge /cards/collection par id : ces réponses doivent rester intactes. */
      if (!identifiers.length || identifiers.some(function (id) { return !id.name && !id.collector_number; })) return res;

      var body = await res.clone().json();
      if (!body || !Array.isArray(body.data)) return res;
      var targets = body.data.filter(wanted);
      if (!targets.length) return res;

      say('recherche des cartes en VF…');
      await localizeAll(targets);

      var translated = 0;
      var original = 0;
      var data = [];
      body.data.forEach(function (card) {
        if (!wanted(card)) { data.push(card); return; }
        var localized = withParts(known[keyOf(card)], card);
        if (!localized) { original++; data.push(card); return; }
        translated++;
        if (localized.set === card.set && localized.collector_number === card.collector_number) {
          data.push(localized);
          return;
        }
        /* Impression traduite d'une autre édition : drawspell compare l'édition et le numéro demandés.
           On retire la carte de la réponse ; drawspell la redemande par son nom (/cards/named),
           et onNamed renvoie alors cette impression. */
        var requestedByPrint = identifiers.some(function (id) {
          return id.set && id.collector_number && sameText(id.set, card.set) && sameText(id.collector_number, card.collector_number);
        });
        if (requestedByPrint) pending[oracleOf(card)] = localized;
        else data.push(localized);
      });
      body.data = data;
      say(translated + ' carte(s) en VF' + (original ? ', ' + original + ' sans version traduite (restent en VO)' : '') + '.');
      return jsonResponse(res, body);
    } catch (e) {
      console.warn('[Drawspell VF]', e);
      return res;
    }
  }

  async function onNamed(res) {
    if (!res.ok) return res;
    try {
      var card = await res.clone().json();
      if (!wanted(card)) return res;
      var localized = pending[oracleOf(card)];
      if (!localized) {
        await localizeAll([card]);
        localized = known[keyOf(card)];
      }
      if (!localized) return res;
      return jsonResponse(res, withParts(localized, card));
    } catch (e) {
      console.warn('[Drawspell VF]', e);
      return res;
    }
  }

  W.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var request = realFetch.call(W, input, init);
    if (url.indexOf(API + '/cards/collection') === 0) {
      return request.then(function (res) { return onCollection(res, init); });
    }
    if (url.indexOf(API + '/cards/named') === 0) {
      return request.then(onNamed);
    }
    return request;
  };

  W.__drawspellVF = { lang: LANG, say: say };

  function announce() {
    say('actif (' + LANG + '). Importe ton deck avec « Load Deck ».');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce);
  else announce();
})();
