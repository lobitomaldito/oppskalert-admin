/* ============================================================
   Redigeringssiden for samlinger: /admin/samling?navn=<samling>[&slug=<innlegg>]
   Kopiert til dist/admin/ av bygget, lastet av editor/samling.html.

   Liste over innleggene, en stor knapp for nytt innlegg, og et skjema for aa
   skrive, rette, skjule og slette. Feltene kommer fra dist/admin/samlinger.json,
   som bygget lager av samlingens egen mal (build/innleggside.mjs), saa en
   nettbutikk faar pris og status og en blogg faar ingress og broedtekst uten
   at denne fila vet forskjell.

   Innleggene hentes fra /api/save med handling "les", aldri fra dist/: der
   ligger ikke utkastene, og der er de ikke oppdatert foer Vercel har bygget.
   Hvert trykk paa Publiser er ett kall, ett commit og ett bygg, bildene med.

   ES5 med vilje, samme som edit.js: klienten kan sitte paa en eldre iPad.
   ============================================================ */
(function () {
  'use strict';

  // -------------------------------------------------------
  //  RENE HJELPERE (testet i test/samling-side.test.mjs)
  // -------------------------------------------------------
  // ES5-tvillingen til lagSlug() i build/samling.mjs. Kollisjoner (-2, -3)
  // loeses av serveren, som ser alle slugene.
  function lagSlug(tittel) {
    var s = String(tittel || '').trim().toLowerCase();
    s = s.replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa');
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'innlegg';
  }

  // Feltene er HTML: bygget setter dem inn raatt. Det klienten skriver, er
  // tekst, og maa escapes paa vei inn. & foerst, ellers escapes escapingen.
  function escapeHtml(tekst) {
    return String(tekst == null ? '' : tekst)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Tom linje skiller avsnitt, enkelt linjeskift blir <br>.
  function tekstTilHtml(tekst) {
    var deler = escapeHtml(tekst).replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
    var ut = [];
    for (var i = 0; i < deler.length; i++) {
      var avsnitt = deler[i].trim();
      if (avsnitt) ut.push('<p>' + avsnitt.replace(/\n/g, '<br>') + '</p>');
    }
    return ut.join('');
  }

  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

  // Motsatt vei, naar et lagret innlegg skal inn i skjemaet igjen.
  function htmlTilTekst(html) {
    var s = String(html == null ? '' : html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, function (m, e) { return ENT[e]; });
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // rensHtml slipper bare gjennom formateringen tekstfeltet tilbyr: avsnitt,
  // mellomtittel (h2, h3), fet, kursiv, lister og lenker. Alt annet blir ren
  // tekst eller forsvinner: stiler og klasser fra Word, span, font, bilder,
  // skript. Brukes paa alt som skal inn i eller ut av et formatert felt, ogsaa
  // det som limes inn. Tekst som ligger loest, eller i en div (Chrome lager
  // div-linjer), pakkes i <p>. Tomme avsnitt fjernes.
  var BLOKK = { p: 'p', h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h3', h5: 'h3', h6: 'h3' };
  var LISTE = { ul: 'ul', ol: 'ol' };
  var INLINE = { strong: 'strong', b: 'strong', em: 'em', i: 'em', a: 'a' };
  var GRENSE = /^(div|blockquote|section|article|header|footer|figure|table|thead|tbody|tr|td|th|pre|hr)$/;
  var TRYGG_LENKE = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

  function rensHtml(html) {
    var s = String(html == null ? '' : html)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|head|title|xml|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '');
    var ut = '', blokk = null, blokkStart = 0, liste = null, dybde = 0, inline = [];
    var bit = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>|([^<]+)|</g, m;

    function lukkListe() {
      if (liste) ut += '</' + liste + '>';
      liste = null; dybde = 0;
    }
    function lukkBlokk() {
      if (!blokk) return;
      for (var i = inline.length - 1; i >= 0; i--) ut += '</' + inline[i] + '>';
      inline = [];
      ut += '</' + blokk + '>';
      var innhold = ut.slice(blokkStart).replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '');
      if (!innhold) ut = ut.slice(0, blokkStart);
      blokk = null;
    }
    function aapneBlokk(tag) {
      blokkStart = ut.length;
      ut += '<' + tag + '>';
      blokk = tag;
    }
    function sikreBlokk() {
      if (!blokk) aapneBlokk(liste ? 'li' : 'p');
    }

    while ((m = bit.exec(s))) {
      if (m[4] !== undefined || m[0] === '<') {
        var tekst = m[0] === '<' ? '&lt;' : m[4].replace(/>/g, '&gt;');
        if (!blokk && !/\S/.test(tekst.replace(/&nbsp;/g, ' '))) continue;
        sikreBlokk();
        ut += tekst;
        continue;
      }
      var slutt = m[1] === '/', navn = m[2].toLowerCase(), attr = m[3];

      if (navn === 'br') { if (blokk) ut += '<br>'; continue; }

      if (BLOKK[navn]) {
        if (blokk === 'li') continue; // Word legger <p> inne i <li>
        lukkBlokk();
        if (!slutt) { lukkListe(); aapneBlokk(BLOKK[navn]); }
        continue;
      }
      if (LISTE[navn]) {
        lukkBlokk();
        if (!slutt) {
          if (liste) dybde++;
          else { liste = LISTE[navn]; dybde = 1; ut += '<' + liste + '>'; }
        } else if (liste && --dybde <= 0) {
          lukkListe();
        }
        continue;
      }
      if (navn === 'li') {
        lukkBlokk();
        if (!slutt) {
          if (!liste) { liste = 'ul'; dybde = 1; ut += '<ul>'; }
          aapneBlokk('li');
        }
        continue;
      }
      if (INLINE[navn]) {
        var tag = INLINE[navn];
        if (slutt) {
          var pos = inline.lastIndexOf(tag);
          if (pos < 0) continue;
          for (var j = inline.length - 1; j >= pos; j--) ut += '</' + inline[j] + '>';
          inline.length = pos;
          continue;
        }
        var start = '<' + tag + '>';
        if (tag === 'a') {
          var h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attr);
          var href = h ? (h[1] || h[2] || h[3] || '').trim() : '';
          if (!TRYGG_LENKE.test(href)) continue;
          start = '<a href="' + href.replace(/"/g, '&quot;') + '"' +
            (/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '') + '>';
        }
        sikreBlokk();
        ut += start;
        inline.push(tag);
        continue;
      }
      if (GRENSE.test(navn) && blokk !== 'li') lukkBlokk();
      // alt annet (span, font, u, o:p, img ...) slippes, teksten inni beholdes
    }
    lukkBlokk();
    lukkListe();
    return ut.replace(/<(ul|ol)><\/\1>/g, '');
  }

  function iDag() {
    var d = new Date();
    function to(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + to(d.getMonth() + 1) + '-' + to(d.getDate());
  }

  // Nyeste foerst, samme rekkefoelge som lista paa nettsiden.
  function sorter(liste) {
    return liste.slice().sort(function (a, b) {
      var da = String(a.dato || ''), db = String(b.dato || '');
      return da === db ? 0 : (da > db ? -1 : 1);
    });
  }

  window.oppskalertSamling = {
    lagSlug: lagSlug, escapeHtml: escapeHtml, tekstTilHtml: tekstTilHtml,
    htmlTilTekst: htmlTilTekst, sorter: sorter, rensHtml: rensHtml
  };

  var app = document.getElementById('samling-app');
  if (!app) return;

  // -------------------------------------------------------
  //  TILSTAND
  // -------------------------------------------------------
  var param = new URLSearchParams(location.search);
  var navn = param.get('navn') || '';
  var foersteSlug = param.get('slug') || '';
  var spec = null;
  var innlegg = [];
  var pin = lesPin();
  // Nye bilder som ikke er publisert: adresse -> data-URL. Reiser med neste
  // Publiser, og bare de som fortsatt er i bruk i skjemaet.
  var ventende = {};
  // Serveren tar 3,0 MB dekodet. Hold igjen litt til teksten.
  var MAKS = 2.9 * 1024 * 1024;
  var MAKS_GALLERI = 8;
  var loggut = document.getElementById('loggut');

  function lesPin() { try { return sessionStorage.getItem('admin_pin') || ''; } catch (e) { return ''; } }
  function lagrePin(p) {
    try { if (p) sessionStorage.setItem('admin_pin', p); else sessionStorage.removeItem('admin_pin'); } catch (e) {}
  }

  // -------------------------------------------------------
  //  DOM
  // -------------------------------------------------------
  // All tekst fra innleggene settes med textContent. Det eneste unntaket er det
  // formaterte tekstfeltet, og det faar bare HTML som har gaatt gjennom rensHtml.
  function el(tag, egenskaper, barn) {
    var e = document.createElement(tag);
    var k;
    for (k in egenskaper || {}) {
      if (!Object.prototype.hasOwnProperty.call(egenskaper, k)) continue;
      if (k === 'tekst') e.textContent = egenskaper[k];
      else if (k === 'klasse') e.className = egenskaper[k];
      else if (k === 'paa') { for (var h in egenskaper.paa) e.addEventListener(h, egenskaper.paa[h]); }
      else if (k in e && k !== 'list') e[k] = egenskaper[k];
      else e.setAttribute(k, egenskaper[k]);
    }
    (barn || []).forEach(function (b) { if (b) e.appendChild(typeof b === 'string' ? document.createTextNode(b) : b); });
    return e;
  }

  function vis(barn) {
    app.innerHTML = '';
    barn.forEach(function (b) { if (b) app.appendChild(b); });
    window.scrollTo(0, 0);
  }

  var meldingEl = null;
  function melding(tekst, type) {
    if (!meldingEl) return;
    meldingEl.textContent = tekst || '';
    meldingEl.className = 'melding' + (type ? ' melding--' + type : '');
  }
  function nyMelding() { meldingEl = el('p', { klasse: 'melding', role: 'status' }); return meldingEl; }

  // -------------------------------------------------------
  //  SERVER
  // -------------------------------------------------------
  // Leser svaret som tekst foerst: svarer Vercel med en HTML-feilside, skal
  // klienten faa en setning, ikke en SyntaxError.
  function send(url, kropp) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kropp)
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) {}
        if (!j || typeof j !== 'object') j = { error: 'Serveren svarte ' + r.status + '. Prøv igjen om litt.' };
        return { ok: r.ok && j.ok, status: r.status, j: j };
      });
    }, function () {
      return { ok: false, status: 0, j: { error: 'Fikk ikke kontakt. Sjekk nettet og prøv igjen.' } };
    });
  }

  function finn(slug) {
    for (var i = 0; i < innlegg.length; i++) if (innlegg[i] && innlegg[i].slug === slug) return innlegg[i];
    return null;
  }
  function tittelAv(p) { return htmlTilTekst(p && p.tittel) || '(uten tittel)'; }
  function feltAvType(type) {
    for (var i = 0; i < spec.felt.length; i++) if (spec.felt[i].type === type) return spec.felt[i];
    return null;
  }

  // -------------------------------------------------------
  //  OPPSTART
  // -------------------------------------------------------
  function start() {
    fetch('/admin/samlinger.json').then(function (r) { return r.ok ? r.json() : {}; }).then(function (alle) {
      spec = alle && Object.prototype.hasOwnProperty.call(alle, navn) ? alle[navn] : null;
      if (!spec) return visFeil('Fant ikke noe å redigere her. Åpne redigeringen fra knappen på nettsiden.');
      document.title = 'Rediger: ' + spec.tittel;
      if (!pin) return visLogin();
      hent();
    }, function () { visFeil('Fikk ikke lastet redigeringen. Last inn siden på nytt.'); });
  }

  function hent() {
    vis([el('p', { tekst: 'Henter …' })]);
    send('/api/save', { pin: pin, samling: { navn: navn, handling: 'les' } }).then(function (res) {
      if (res.status === 401) return loggUt('PIN-koden ble ikke godtatt. Prøv igjen.');
      if (!res.ok) return visFeil(res.j.error || 'Fikk ikke hentet innholdet.');
      innlegg = res.j.innlegg || [];
      loggut.hidden = false;
      var slug = foersteSlug;
      foersteSlug = '';
      if (slug === 'ny') return visSkjema(null);
      if (slug && finn(slug)) return visSkjema(finn(slug));
      visListe();
    });
  }

  function loggUt(grunn) {
    pin = '';
    lagrePin('');
    loggut.hidden = true;
    visLogin(grunn);
  }
  loggut.addEventListener('click', function () { loggUt(); });

  function visFeil(tekst) {
    vis([el('h1', { tekst: 'Noe gikk galt' }), el('p', { tekst: tekst })]);
  }

  // -------------------------------------------------------
  //  LOGG INN
  // -------------------------------------------------------
  function visLogin(feil) {
    var inn = el('input', { type: 'password', inputMode: 'numeric', autocomplete: 'current-password', id: 'pin' });
    var knapp = el('button', { klasse: 'stor', type: 'submit', tekst: 'Logg inn' });
    var skjema = el('form', { paa: { submit: function (e) {
      e.preventDefault();
      var p = inn.value.trim();
      if (!p) { melding('Skriv inn PIN-koden.', 'feil'); return; }
      knapp.disabled = true;
      melding('Sjekker …');
      send('/api/verify-pin', { pin: p }).then(function (res) {
        knapp.disabled = false;
        if (!res.ok) { melding(res.j.error || 'Feil PIN.', 'feil'); return; }
        pin = p;
        lagrePin(p);
        hent();
      });
    } } }, [
      el('label', { klasse: 'felt', htmlFor: 'pin' }, [el('span', { tekst: 'PIN-kode' }), inn]),
      nyMelding(),
      knapp
    ]);
    vis([el('h1', { tekst: 'Logg inn for å redigere ' + spec.tittel.toLowerCase() }), skjema]);
    if (feil) melding(feil, 'feil');
    inn.focus();
  }

  // -------------------------------------------------------
  //  LISTE
  // -------------------------------------------------------
  function visListe(statusTekst) {
    var valgFelt = feltAvType('valg');
    var ny = el('button', { klasse: 'stor', type: 'button', tekst: '+ ' + spec.ny, paa: { click: function () { visSkjema(null); } } });
    var rader = sorter(innlegg).map(function (p) {
      var sammendrag = [];
      spec.felt.forEach(function (f) {
        if ((f.type === 'valg' || f.navn === 'pris') && p[f.navn]) sammendrag.push(htmlTilTekst(p[f.navn]));
      });
      var knapper = [el('button', { klasse: 'knapp', type: 'button', tekst: 'Rediger', paa: { click: function () { visSkjema(p); } } })];
      if (valgFelt && valgFelt.valg.length >= 2) {
        var naa = htmlTilTekst(p[valgFelt.navn]);
        var annen = naa === valgFelt.valg[0] ? valgFelt.valg[1] : valgFelt.valg[0];
        knapper.push(el('button', { klasse: 'knapp', type: 'button',
          tekst: 'Merk som ' + annen.charAt(0).toLowerCase() + annen.slice(1),
          paa: { click: function (e) { byttValg(p, valgFelt, annen, e.currentTarget); } } }));
      }
      if (!p._kladd) knapper.push(el('a', { klasse: 'knapp', href: '/' + navn + '/' + p.slug + '/', target: '_blank', tekst: 'Se på nettsiden' }));
      var bildeFelt = feltAvType('bilde');
      var url = bildeFelt && p[bildeFelt.navn];
      var miniatyr = url ? el('img', { src: url, alt: '' }) : el('div', { klasse: 'tom' });
      if (url && p[bildeFelt.navn + '@pos']) miniatyr.style.objectPosition = p[bildeFelt.navn + '@pos'];
      return el('li', { klasse: 'rad' }, [
        miniatyr,
        el('div', {}, [
          el('h2', {}, [tittelAv(p), p._kladd ? el('span', { klasse: 'merke', tekst: 'Skjult' }) : null]),
          sammendrag.length ? el('p', { tekst: sammendrag.join(' · ') }) : null,
          el('div', { klasse: 'knapper' }, knapper)
        ])
      ]);
    });
    vis([
      el('h1', { tekst: spec.tittel }),
      ny,
      nyMelding(),
      rader.length ? el('ul', { klasse: 'liste' }, rader)
        : el('p', { tekst: 'Ingenting her ennå. Trykk på knappen over for å legge ut det første.' })
    ]);
    if (statusTekst) melding(statusTekst, 'ok');
  }

  function byttValg(p, felt, verdi, knapp) {
    var kopi = JSON.parse(JSON.stringify(p));
    kopi[felt.navn] = escapeHtml(verdi);
    knapp.disabled = true;
    melding('Lagrer …');
    send('/api/save', { pin: pin, bilder: [], samling: { navn: navn, handling: 'oppdater', innlegg: kopi } }).then(function (res) {
      if (res.status === 401) return loggUt('PIN-koden ble ikke godtatt. Logg inn på nytt.');
      if (!res.ok) { knapp.disabled = false; melding('✗ ' + (res.j.error || 'Fikk ikke lagret.'), 'feil'); return; }
      erstatt(kopi);
      var sek = Math.round((res.j.rebuildMs || 50000) / 1000);
      visListe('✓ «' + tittelAv(kopi) + '» er nå merket ' + verdi.toLowerCase() + '. ' +
        (sek > 1 ? 'Nettsiden er oppdatert om ca. ' + sek + ' sekunder.' : 'Nettsiden er oppdatert.'));
    });
  }

  function erstatt(p) {
    for (var i = 0; i < innlegg.length; i++) if (innlegg[i] && innlegg[i].slug === p.slug) { innlegg[i] = p; return; }
    innlegg.unshift(p);
  }

  // -------------------------------------------------------
  //  BILDER
  // -------------------------------------------------------
  // Alt blir jpg, maks 1600 px paa den lengste siden. Varesiden viser et bilde
  // paa inntil ca. 700 px, saa 1600 dekker skarp skjerm, og sju-aatte bilder
  // faar plass i ett kall. avif og heic gjoeres om her; serveren tar dem ikke.
  function forbered(fil, ferdig) {
    var levert = false;
    function tegn(kilde, b, h) {
      if (levert) return;
      levert = true;
      var skala = Math.min(1, 1600 / Math.max(b, h));
      var c = document.createElement('canvas');
      c.width = Math.round(b * skala);
      c.height = Math.round(h * skala);
      var ctx = c.getContext('2d');
      // jpg kan ikke vaere gjennomsiktig. Uten hvit bunn blir gjennomsiktige
      // piksler i en png, webp eller avif svarte.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(kilde, 0, 0, c.width, c.height);
      if (kilde.close) kilde.close();
      try { ferdig(null, c.toDataURL('image/jpeg', 0.82)); } catch (e) { ferdig(e); }
    }
    function viaImg() {
      var url = URL.createObjectURL(fil);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); tegn(img, img.naturalWidth, img.naturalHeight); };
      img.onerror = function () { URL.revokeObjectURL(url); ferdig(new Error('uleselig')); };
      img.src = url;
    }
    if (window.createImageBitmap) {
      createImageBitmap(fil, { imageOrientation: 'from-image' }).then(function (bm) { tegn(bm, bm.width, bm.height); }, viaImg);
    } else viaImg();
  }

  function nyttBilde(fil, ferdig) {
    forbered(fil, function (feil, data) {
      if (feil) return ferdig(feil);
      var rent = String(fil.name || 'bilde').replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'bilde';
      var url = '/assets/uploads/' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + rent + '.jpg';
      ventende[url] = data;
      ferdig(null, url);
    });
  }

  function velger(flere, ved) {
    var inn = el('input', {
      type: 'file', hidden: true, multiple: !!flere,
      accept: '.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif,image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif'
    });
    inn.addEventListener('change', function () {
      var filer = [].slice.call(inn.files || []);
      inn.value = '';
      if (filer.length) ved(filer);
    });
    return inn;
  }

  function bildeSrc(url) { return ventende[url] || url; }

  // Utsnitt: hun trykker paa det som alltid skal synes (ansiktene), og punktet
  // lagres som <felt>@pos, f.eks. "50% 20%". Bygget setter det som
  // object-position, som legger nettopp det punktet i bildet paa samme sted i
  // rammen, saa det synes uansett form: kvadratisk kort, bredt toppbilde.
  // Forhaandsvisningene viser de to ytterpunktene.
  function lagUtsnitt(utkast, felt, kvadrat) {
    var nokkel = felt + '@pos';
    var hel = el('img', { alt: '', draggable: false });
    var prikk = el('span', { klasse: 'utsnitt__prikk', 'aria-hidden': 'true' });
    var flate = el('div', { klasse: 'utsnitt__hel', tabIndex: 0,
      'aria-label': 'Velg utsnitt. Piltastene flytter punktet.' }, [hel, prikk]);
    var bred = el('img', { alt: '', klasse: 'utsnitt__bred' });
    var midt = el('button', { klasse: 'knapp', type: 'button', tekst: 'Midtstill' });
    var boks = el('div', { klasse: 'utsnitt' }, [
      el('small', { tekst: 'Trykk på det som alltid skal synes, for eksempel ansiktene. Bildet beskjæres ulikt på forsiden og på egen side, men punktet du velger, er alltid med.' }),
      flate,
      el('small', { tekst: 'Slik blir det i bredt format:' }),
      bred,
      midt
    ]);

    function punkt() {
      var m = /^([\d.]+)% ([\d.]+)%$/.exec(utkast[nokkel] || '');
      return m ? [parseFloat(m[1]), parseFloat(m[2])] : [50, 50];
    }
    function tegn() {
      var url = utkast[felt];
      boks.hidden = !url;
      if (!url) return;
      hel.src = bred.src = bildeSrc(url);
      var p = punkt();
      prikk.style.left = p[0] + '%';
      prikk.style.top = p[1] + '%';
      bred.style.objectPosition = kvadrat.style.objectPosition = p[0] + '% ' + p[1] + '%';
    }
    function sett(x, y) {
      x = Math.max(0, Math.min(100, Math.round(x)));
      y = Math.max(0, Math.min(100, Math.round(y)));
      utkast[nokkel] = x + '% ' + y + '%';
      tegn();
    }
    function fraPeker(e) {
      var r = hel.getBoundingClientRect();
      if (r.width && r.height) sett((e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100);
    }

    var drar = false;
    flate.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      drar = true;
      try { flate.setPointerCapture(e.pointerId); } catch (x) {}
      fraPeker(e);
    });
    flate.addEventListener('pointermove', function (e) { if (drar) fraPeker(e); });
    flate.addEventListener('pointerup', function () { drar = false; });
    flate.addEventListener('pointercancel', function () { drar = false; });
    flate.addEventListener('keydown', function (e) {
      var p = punkt(), steg = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') sett(p[0] - steg, p[1]);
      else if (e.key === 'ArrowRight') sett(p[0] + steg, p[1]);
      else if (e.key === 'ArrowUp') sett(p[0], p[1] - steg);
      else if (e.key === 'ArrowDown') sett(p[0], p[1] + steg);
      else return;
      e.preventDefault();
    });
    midt.addEventListener('click', function () { delete utkast[nokkel]; tegn(); });

    tegn();
    return { el: boks, tegn: tegn };
  }

  // -------------------------------------------------------
  //  SKJEMA
  // -------------------------------------------------------
  // -------------------------------------------------------
  //  FORMATERT TEKSTFELT (felttypen lang)
  // -------------------------------------------------------
  // Et contenteditable-felt med en knapperad. Klienten ser formateringen mens
  // hun skriver, ingen koder. Alt som kommer inn (lagret innlegg, innliming fra
  // Word eller nettsider) og alt som gaar ut, gaar gjennom rensHtml, saa bare
  // avsnitt, h2, h3, fet, kursiv, lister og lenker kan havne paa siden.
  // execCommand er formelt utgaatt, men er det eneste som gir nettleserens egen
  // angre-historikk i et redigerbart felt, og virker i alle nettlesere i dag.
  var RIK_KNAPPER = [
    { tekst: 'Mellomtittel', kmd: 'h2', hint: 'Gjør avsnittet til en mellomtittel, trykk igjen for vanlig tekst' },
    { tekst: 'Fet', kmd: 'bold', stil: 'font-weight:700', hint: 'Fet (Cmd/Ctrl+B)' },
    { tekst: 'Kursiv', kmd: 'italic', stil: 'font-style:italic', hint: 'Kursiv (Cmd/Ctrl+I)' },
    { tekst: '• Punktliste', kmd: 'insertUnorderedList', hint: 'Punktliste' },
    { tekst: '1. Nummerert', kmd: 'insertOrderedList', hint: 'Nummerert liste' },
    { tekst: 'Lenke', kmd: 'lenke', hint: 'Lag lenke av den merkede teksten' }
  ];

  function lagRikTekst(id, html) {
    var flate = el('div', { klasse: 'rik__flate', id: id, contenteditable: 'true', role: 'textbox',
      'aria-multiline': 'true', 'aria-labelledby': id + '-etikett' });
    flate.innerHTML = rensHtml(html) || '<p><br></p>';

    function blokkNaa() { return String(document.queryCommandValue('formatBlock') || '').toLowerCase(); }

    function utfoer(kmd) {
      flate.focus();
      document.execCommand('defaultParagraphSeparator', false, 'p');
      if (kmd === 'h2') {
        document.execCommand('formatBlock', false, blokkNaa() === 'h2' ? 'p' : 'h2');
      } else if (kmd === 'lenke') {
        var url = window.prompt('Adressen lenken skal gå til (tomt felt fjerner lenken):', 'https://');
        if (url === null) return;
        url = url.trim();
        if (!url || url === 'https://') { document.execCommand('unlink'); return; }
        if (!TRYGG_LENKE.test(url)) url = (url.indexOf('@') > 0 ? 'mailto:' : 'https://') + url;
        var valg = window.getSelection();
        // ingen tekst merket: adressen selv blir lenketeksten
        if (valg && valg.isCollapsed) document.execCommand('insertHTML', false, '<a href="' + escapeHtml(url).replace(/"/g, '&quot;') + '">' + escapeHtml(url) + '</a>');
        else document.execCommand('createLink', false, url);
      } else if (kmd === 'insertUnorderedList' || kmd === 'insertOrderedList') {
        // Chrome legger lista inne i <p> og flytter markoeren til starten av
        // linja. Lista loeftes ut av avsnittet, og markoeren settes tilbake.
        var s = window.getSelection();
        var a = s.anchorNode, ao = s.anchorOffset, fn = s.focusNode, fo = s.focusOffset;
        document.execCommand(kmd);
        Array.prototype.forEach.call(flate.querySelectorAll('p > ul, p > ol'), function (liste) {
          var p = liste.parentNode;
          while (p.firstChild) p.parentNode.insertBefore(p.firstChild, p);
          p.parentNode.removeChild(p);
        });
        if (a && fn && flate.contains(a) && flate.contains(fn)) {
          try { s.setBaseAndExtent(a, ao, fn, fo); } catch (e) { /* noden endret lengde, la markoeren staa */ }
        }
      } else {
        document.execCommand(kmd);
      }
      oppdater();
    }

    var knapper = RIK_KNAPPER.map(function (k) {
      var b = el('button', { type: 'button', tekst: k.tekst, title: k.hint, 'aria-pressed': 'false' });
      if (k.stil) b.setAttribute('style', k.stil);
      // mousedown ville flyttet fokus ut av feltet og mistet markeringen
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { utfoer(k.kmd); });
      b._kmd = k.kmd;
      return b;
    });

    function oppdater() {
      var valg = window.getSelection();
      if (!valg || !valg.anchorNode || !flate.contains(valg.anchorNode)) return;
      knapper.forEach(function (b) {
        var paa = false;
        try {
          if (b._kmd === 'h2') paa = blokkNaa() === 'h2';
          else if (b._kmd !== 'lenke') paa = document.queryCommandState(b._kmd);
        } catch (e) { paa = false; }
        b.setAttribute('aria-pressed', paa ? 'true' : 'false');
      });
    }
    document.addEventListener('selectionchange', oppdater);

    flate.addEventListener('paste', function (e) {
      var d = e.clipboardData;
      if (!d) return;
      e.preventDefault();
      var h = d.getData('text/html');
      document.execCommand('insertHTML', false, h ? rensHtml(h) : tekstTilHtml(d.getData('text/plain')));
    });
    // Bilder skal inn via bildefeltet, ikke dras inn i teksten
    flate.addEventListener('drop', function (e) { e.preventDefault(); });
    flate.addEventListener('focus', function () { document.execCommand('defaultParagraphSeparator', false, 'p'); });

    return { flate: flate, el: el('div', { klasse: 'rik' }, [el('div', { klasse: 'rik__verktoy', role: 'toolbar', 'aria-label': 'Formatering' }, knapper), flate]) };
  }

  function visSkjema(eksisterende) {
    var utkast = eksisterende ? JSON.parse(JSON.stringify(eksisterende)) : { dato: iDag() };
    var lesere = [];   // funksjoner som skriver feltverdiene inn i utkast
    var foersteInn = null;

    var felt = spec.felt.map(function (f) {
      var id = 'f-' + f.navn;
      var hjelp = f.hjelp ? el('small', { tekst: f.hjelp }) : null;

      if (f.type === 'lang') {
        var rik = lagRikTekst(id, utkast[f.navn]);
        if (!foersteInn) foersteInn = rik.flate;
        if (!hjelp) hjelp = el('small', { tekst: 'Enter gir nytt avsnitt. Merk tekst og bruk knappene for mellomtittel, fet, kursiv, lister og lenker.' });
        lesere.push(function () { utkast[f.navn] = rensHtml(rik.flate.innerHTML); });
        return el('div', { klasse: 'felt' }, [el('span', { id: id + '-etikett', tekst: f.etikett }), hjelp, rik.el]);
      }

      if (f.type === 'linje' || f.type === 'kort') {
        var inn = f.type === 'linje'
          ? el('input', { type: 'text', id: id, value: htmlTilTekst(utkast[f.navn]) })
          : el('textarea', { id: id, rows: 3, value: htmlTilTekst(utkast[f.navn]) });
        if (!foersteInn) foersteInn = inn;
        lesere.push(function () {
          utkast[f.navn] = escapeHtml(inn.value.trim()).replace(/\r?\n/g, '<br>');
        });
        return el('label', { klasse: 'felt', htmlFor: id }, [el('span', { tekst: f.etikett }), hjelp, inn]);
      }

      if (f.type === 'valg') {
        var naa = htmlTilTekst(utkast[f.navn]) || f.valg[0];
        var radioer = f.valg.map(function (v) {
          return el('input', { type: 'radio', name: id, value: v, checked: v === naa });
        });
        lesere.push(function () {
          radioer.forEach(function (r) { if (r.checked) utkast[f.navn] = escapeHtml(r.value); });
        });
        return el('fieldset', { klasse: 'felt' }, [
          el('span', { tekst: f.etikett }), hjelp,
          el('div', { klasse: 'valg' }, radioer.map(function (r) { return el('label', {}, [r, r.value]); }))
        ]);
      }

      if (f.type === 'bilde') {
        var forh = el('img', { alt: '', hidden: !utkast[f.navn] });
        if (utkast[f.navn]) forh.src = bildeSrc(utkast[f.navn]);
        var knapp = el('button', { klasse: 'knapp', type: 'button', tekst: utkast[f.navn] ? 'Bytt bilde' : 'Velg bilde' });
        var utsnitt = lagUtsnitt(utkast, f.navn, forh);
        var fil = velger(false, function (filer) {
          melding('Gjør klar bildet …');
          nyttBilde(filer[0], function (feil, url) {
            if (feil) { melding('✗ Klarte ikke å lese bildet. Prøv et jpg- eller png-bilde.', 'feil'); return; }
            utkast[f.navn] = url;
            // Punktet hoerte til det gamle bildet.
            delete utkast[f.navn + '@pos'];
            forh.src = bildeSrc(url);
            forh.hidden = false;
            knapp.textContent = 'Bytt bilde';
            utsnitt.tegn();
            melding('✓ Bildet er klart. Det lastes opp når du trykker Publiser.', 'ok');
          });
        });
        knapp.addEventListener('click', function () { fil.click(); });
        return el('div', { klasse: 'felt' }, [el('span', { tekst: f.etikett }), hjelp, el('div', { klasse: 'bilde' }, [forh, knapp, fil]), utsnitt.el]);
      }

      if (f.type === 'galleri') {
        if (!Array.isArray(utkast[f.navn])) utkast[f.navn] = [];
        var rutenett = el('div', { klasse: 'galleri' });
        var leggTil = el('button', { klasse: 'knapp', type: 'button', tekst: '+ Legg til bilder' });
        var tegnGalleri = function () {
          rutenett.innerHTML = '';
          utkast[f.navn].forEach(function (url, i) {
            rutenett.appendChild(el('figure', {}, [
              el('img', { src: bildeSrc(url), alt: '' }),
              el('button', { type: 'button', tekst: 'Fjern', 'aria-label': 'Fjern bilde ' + (i + 1),
                paa: { click: function () { utkast[f.navn].splice(i, 1); tegnGalleri(); } } })
            ]));
          });
          leggTil.hidden = utkast[f.navn].length >= MAKS_GALLERI;
        };
        var filer = velger(true, function (valgte) {
          var plass = MAKS_GALLERI - utkast[f.navn].length;
          var ta = valgte.slice(0, plass);
          var igjen = ta.length;
          // Bildene gjoeres klare samtidig og blir ferdige i tilfeldig
          // rekkefoelge. De legges inn i den rekkefoelgen hun valgte dem.
          var klare = [];
          melding('Gjør klar ' + igjen + (igjen === 1 ? ' bilde' : ' bilder') + ' …');
          ta.forEach(function (fil, i) {
            nyttBilde(fil, function (feil, url) {
              if (!feil) klare[i] = url;
              igjen--;
              if (igjen === 0) {
                klare.forEach(function (u) { if (u) utkast[f.navn].push(u); });
                tegnGalleri();
                melding(valgte.length > plass ? 'Plass til ' + MAKS_GALLERI + ' bilder. De første er lagt til.'
                  : '✓ Bildene er klare. De lastes opp når du trykker Publiser.', valgte.length > plass ? 'feil' : 'ok');
              }
            });
          });
        });
        leggTil.addEventListener('click', function () { filer.click(); });
        tegnGalleri();
        return el('div', { klasse: 'felt' }, [el('span', { tekst: f.etikett }), hjelp || el('small', { tekst: 'Inntil ' + MAKS_GALLERI + ' bilder.' }), rutenett, leggTil, filer]);
      }
      return null;
    });

    var kladd = el('input', { type: 'checkbox', checked: !!utkast._kladd });
    var publiser = el('button', { klasse: 'stor', type: 'button', tekst: 'Publiser', paa: { click: function () {
      lesere.forEach(function (les) { les(); });
      utkast._kladd = kladd.checked;
      lagre(utkast, eksisterende, publiser);
    } } });
    var avbryt = el('button', { klasse: 'knapp', type: 'button', tekst: 'Avbryt', paa: { click: function () { visListe(); } } });

    vis([
      el('h1', { tekst: eksisterende ? 'Rediger: ' + tittelAv(eksisterende) : spec.ny }),
      el('div', {}, felt),
      el('label', { klasse: 'avkryss' }, [kladd, 'Skjul fra nettsiden foreløpig']),
      nyMelding(),
      el('div', { klasse: 'handlinger' }, [publiser, avbryt]),
      eksisterende ? el('div', { klasse: 'slett' }, [
        el('button', { klasse: 'knapp knapp--fare', type: 'button', tekst: 'Slett for godt',
          paa: { click: function (e) { slett(eksisterende, e.currentTarget); } } })
      ]) : null
    ]);
    if (foersteInn && !eksisterende) foersteInn.focus();
  }

  function lagre(utkast, eksisterende, knapp) {
    var tittel = htmlTilTekst(utkast.tittel);
    if (!tittel) { melding('✗ Skriv en tittel først.', 'feil'); return; }
    if (!eksisterende) utkast.slug = lagSlug(tittel);

    // Bare nye bilder som fortsatt er i bruk, reiser med.
    var brukt = [];
    spec.felt.forEach(function (f) {
      if (f.type === 'bilde' && utkast[f.navn]) brukt.push(utkast[f.navn]);
      if (f.type === 'galleri' && Array.isArray(utkast[f.navn])) brukt = brukt.concat(utkast[f.navn]);
    });
    var bilder = [];
    var storrelse = 0;
    brukt.forEach(function (url) {
      if (!ventende[url]) return;
      bilder.push({ sti: 'static' + url, data: ventende[url] });
      storrelse += Math.floor(ventende[url].length * 3 / 4);
    });
    if (storrelse > MAKS) {
      melding('✗ For mange nye bilder på én gang. Publiser med færre bilder, og legg til resten etterpå med Rediger.', 'feil');
      return;
    }

    knapp.disabled = true;
    melding(bilder.length ? 'Laster opp ' + bilder.length + (bilder.length === 1 ? ' bilde' : ' bilder') + ' og publiserer …' : 'Publiserer …');
    send('/api/save', {
      pin: pin, bilder: bilder,
      samling: { navn: navn, handling: eksisterende ? 'oppdater' : 'ny', innlegg: utkast }
    }).then(function (res) {
      if (res.status === 401) return loggUt('PIN-koden ble ikke godtatt. Logg inn på nytt. Det du skrev, er ikke lagret.');
      if (!res.ok) { knapp.disabled = false; melding('✗ ' + (res.j.error || 'Fikk ikke publisert.'), 'feil'); return; }
      bilder.forEach(function (b) { delete ventende[b.sti.slice('static'.length)]; });
      if (res.j.slug) utkast.slug = res.j.slug;
      erstatt(utkast);
      visFerdig(utkast, res.j.rebuildMs, eksisterende ? 'endret' : 'ny');
    });
  }

  function slett(p, knapp) {
    if (!window.confirm('Slette «' + tittelAv(p) + '» for godt? Det kan ikke angres.')) return;
    knapp.disabled = true;
    melding('Sletter …');
    send('/api/save', { pin: pin, samling: { navn: navn, handling: 'slett', slug: p.slug } }).then(function (res) {
      if (res.status === 401) return loggUt('PIN-koden ble ikke godtatt. Logg inn på nytt.');
      if (!res.ok) { knapp.disabled = false; melding('✗ ' + (res.j.error || 'Fikk ikke slettet.'), 'feil'); return; }
      innlegg = innlegg.filter(function (i) { return i && i.slug !== p.slug; });
      visFerdig(p, res.j.rebuildMs, 'slettet');
    });
  }

  // -------------------------------------------------------
  //  FERDIG
  // -------------------------------------------------------
  function visFerdig(p, ms, hva) {
    var sek = Math.round((ms || 50000) / 1000);
    var tekst = el('p', {});
    var oppdater = function () {
      tekst.textContent = sek > 0
        ? 'Nettsiden oppdateres. Det tar omtrent ' + sek + ' sekunder før endringen vises.'
        : 'Nettsiden er oppdatert.';
    };
    oppdater();
    var tikk = setInterval(function () { sek--; oppdater(); if (sek <= 0) clearInterval(tikk); }, 1000);
    var ferdig = function (etter) { return function () { clearInterval(tikk); etter(); }; };

    var knapper = [];
    if (hva !== 'slettet' && !p._kladd) {
      knapper.push(el('a', { klasse: 'stor', href: '/' + navn + '/' + p.slug + '/', tekst: 'Se på nettsiden' }));
    }
    if (hva === 'ny') knapper.push(el('button', { klasse: 'knapp', type: 'button', tekst: '+ ' + spec.ny, paa: { click: ferdig(function () { visSkjema(null); }) } }));
    knapper.push(el('button', { klasse: 'knapp', type: 'button', tekst: 'Tilbake til listen', paa: { click: ferdig(function () { visListe(); }) } }));

    var overskrift = hva === 'slettet' ? '✓ «' + tittelAv(p) + '» er slettet'
      : p._kladd ? '✓ Lagret, men skjult fra nettsiden'
      : '✓ Publisert';
    vis([el('div', { klasse: 'ferdig' }, [el('h1', { tekst: overskrift }), tekst, el('div', { klasse: 'knapper' }, knapper)])]);
  }

  start();
})();
