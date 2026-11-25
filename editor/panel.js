/* ============================================================
   Kontrollpanelet: /admin/panel
   Kopiert til dist/admin/ av bygget, lastet av editor/panel.html.

   Fanene kommer fra dist/admin/panel.json (build/panel.mjs):
   - Omtaler: nye omtaler fra /api/tilbakemelding. «Publiser» legger omtalen
     foerst i listene merket data-panel-omtaler, med logo, i ETT commit
     (/api/save med sider), og merker den publisert.
   - Én fane per data-panel-verdi: listene i fanen redigeres som skjema
     (legg til, endre, flytt, fjern) og tekstfeltene som enkle felt.

   Innholdet leses fra GitHub (/api/save med les), aldri fra dist/, saa panelet
   ser det kunden lagret sist, ogsaa foer Vercel har bygget.
   ES5 med vilje, samme som edit.js.
   ============================================================ */
(function () {
  'use strict';

  var app = document.getElementById('panel-app');
  var loggut = document.getElementById('loggut');
  var pin = lesPin();
  var panel = null;      // panel.json
  var innhold = {};      // side -> content/<side>.json
  var omtaler = null;    // nye omtaler, eller null foer de er hentet
  var forhand = {};      // opplastet sti -> data-url, saa nye bilder vises foer bygget
  var aktiv = '';

  // ---------- Hjelpere

  function lesPin() { try { return sessionStorage.getItem('admin_pin') || ''; } catch (e) { return ''; } }
  function settPin(p) { try { if (p) sessionStorage.setItem('admin_pin', p); else sessionStorage.removeItem('admin_pin'); } catch (e) {} }

  function send(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false, error: 'Uventet svar fra serveren (' + r.status + ').' }; })
          .then(function (j) { j.status = r.status; return j; });
      }, function () { return { ok: false, error: 'Fikk ikke kontakt. Sjekk nettet og prøv igjen.' }; });
  }

  function el(tag, attr, barn) {
    var e = document.createElement(tag);
    for (var k in attr || {}) {
      if (k === 'tekst') e.textContent = attr[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attr[k]);
      else if (attr[k] === true) e.setAttribute(k, '');
      else if (attr[k] != null && attr[k] !== false) e.setAttribute(k, attr[k]);
    }
    (barn || []).forEach(function (b) { if (b) e.appendChild(typeof b === 'string' ? document.createTextNode(b) : b); });
    return e;
  }

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
  function tilTekst(html) {
    return String(html == null ? '' : html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, function (m, e) { return ENT[e]; }).trim();
  }
  function tilHtml(tekst, lang) { var e = esc(String(tekst || '').trim()); return lang ? e.replace(/\r?\n/g, '<br>') : e.replace(/\s*\r?\n\s*/g, ' '); }
  function kopi(o) { return JSON.parse(JSON.stringify(o)); }
  var ISO = /^\d{4}-\d{2}-\d{2}$/;
  function visDato(v) { return ISO.test(v) ? v.slice(8, 10) + '.' + v.slice(5, 7) + '.' + v.slice(0, 4) : v; }
  function sidenavn(s) { return s === 'index' ? 'Forsiden' : '/' + s; }
  function slug(t) {
    var s = String(t || '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return (s || 'bilde').slice(0, 40);
  }
  function kortnavn(navn) {
    var d = String(navn || '').trim().split(/\s+/);
    return d.length > 1 ? d[0] + ' ' + d[d.length - 1].charAt(0) + '.' : d[0] || '';
  }

  function liste(side, navn, standard) {
    var i = innhold[side] || {};
    return Array.isArray(i[navn]) ? kopi(i[navn]) : kopi(standard || []);
  }
  function bildeSrc(v) { return forhand[v] || v; }
  function melding(tekst, type) { return el('p', { class: 'melding' + (type ? ' melding--' + type : ''), role: type === 'feil' ? 'alert' : 'status', tekst: tekst }); }
  function ferdigTekst(res) { return '✓ Lagret. Endringen er ute på siden om ca. ' + Math.max(1, Math.round((res.rebuildMs || 50000) / 60000)) + ' minutt.'; }

  // Last opp et bilde: logo eller foto, gir { sti (i innholdet), bilde (til /api/save) }.
  function lastOpp(fil, type, navn, ferdig) {
    var fn = type === 'logo' ? window.oaBilde.logo : window.oaBilde.foto;
    fn(fil, function (data, feil, ext) {
      if (!data) return ferdig(null, feil);
      var fil2 = slug(navn) + '-' + Date.now().toString(36) + '.' + ext;
      var sti = '/assets/uploads/' + fil2;
      forhand[sti] = data;
      ferdig({ sti: sti, bilde: { sti: 'static/assets/uploads/' + fil2, data: data } });
    });
  }

  // ---------- Innlogging

  function visLogin(feil) {
    loggut.hidden = true;
    var inn = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', id: 'pin' });
    var knapp = el('button', { class: 'stor', type: 'submit', tekst: 'Logg inn' });
    var m = melding(feil || '', feil ? 'feil' : '');
    var skjema = el('form', { onsubmit: function (e) {
      e.preventDefault();
      knapp.disabled = true;
      send('/api/verify-pin', { pin: inn.value }).then(function (res) {
        knapp.disabled = false;
        if (!res.ok) { m.className = 'melding melding--feil'; m.textContent = res.error || 'Feil PIN.'; return; }
        pin = inn.value; settPin(pin); start();
      });
    } }, [el('label', { class: 'felt', for: 'pin' }, [el('span', { tekst: 'PIN-kode' }), inn]), knapp, m]);
    app.replaceChildren(el('h1', { tekst: 'Kontrollpanel' }), skjema);
    inn.focus();
  }

  loggut.addEventListener('click', function () { settPin(''); pin = ''; visLogin(); });

  // ---------- Oppstart

  function start() {
    if (!pin) return visLogin();
    app.replaceChildren(melding('Henter innholdet …'));
    fetch('/admin/panel.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
      if (!p) { app.replaceChildren(el('h1', { tekst: 'Kontrollpanel' }), melding('Denne siden har ikke noe kontrollpanel ennå.', 'feil')); return; }
      panel = p;
      var sider = {};
      panel.omtaler.forEach(function (l) { sider[l.side] = 1; });
      panel.faner.forEach(function (f) { f.lister.concat(f.tekster).forEach(function (l) { sider[l.side] = 1; }); });
      return Promise.all(Object.keys(sider).map(function (s) {
        return send('/api/save', { pin: pin, les: s }).then(function (res) {
          if (res.status === 401 || res.status === 429) throw res;
          if (!res.ok) throw res;
          innhold[s] = res.innhold || {};
        });
      })).then(function () {
        loggut.hidden = false;
        aktiv = decodeURIComponent(location.hash.slice(1)) || (panel.omtaler.length ? 'Omtaler' : panel.faner[0].navn);
        tegn();
        if (panel.omtaler.length) hentOmtaler();
      });
    }).catch(function (res) {
      if (res && (res.status === 401 || res.status === 429)) { settPin(''); pin = ''; return visLogin(res.error); }
      app.replaceChildren(el('h1', { tekst: 'Kontrollpanel' }), melding((res && res.error) || 'Noe gikk galt. Last siden på nytt.', 'feil'));
    });
  }

  function hentOmtaler() {
    send('/api/tilbakemelding', { pin: pin, handling: 'liste' }).then(function (res) {
      omtaler = res.ok ? res.omtaler : [];
      if (!res.ok) omtaler.feil = res.feil || 'Fikk ikke hentet omtalene.';
      tegn();
    });
  }

  // ---------- Tegning

  function tegn() {
    var navn = [];
    if (panel.omtaler.length) navn.push('Omtaler');
    panel.faner.forEach(function (f) { navn.push(f.navn); });
    if (navn.indexOf(aktiv) < 0) aktiv = navn[0];

    var faner = el('div', { class: 'faner', role: 'tablist' }, navn.map(function (n) {
      var antall = n === 'Omtaler' && omtaler && omtaler.length ? el('span', { class: 'teller', tekst: String(omtaler.length) }) : null;
      return el('button', { type: 'button', role: 'tab', 'aria-selected': String(n === aktiv), onclick: function () { aktiv = n; history.replaceState(null, '', '#' + encodeURIComponent(n)); tegn(); } }, [n, antall]);
    }));
    var innholdEl = aktiv === 'Omtaler' ? tegnOmtaler() : tegnFane(panel.faner.filter(function (f) { return f.navn === aktiv; })[0]);
    app.replaceChildren(el('h1', { tekst: 'Kontrollpanel' }), faner, innholdEl);
  }

  // ---------- Omtaler

  function tegnOmtaler() {
    var boks = el('div');
    if (omtaler === null) { boks.appendChild(melding('Henter nye omtaler …')); return boks; }
    if (omtaler.feil) { boks.appendChild(melding(omtaler.feil, 'feil')); return boks; }
    boks.appendChild(el('p', { class: 'ingress', tekst: 'Omtaler kundene har skrevet på siden. De vises ikke før du trykker Publiser.' }));
    if (!omtaler.length) { boks.appendChild(melding('Ingen nye omtaler nå.')); return boks; }
    var ul = el('ul', { class: 'liste' });
    omtaler.forEach(function (o) { ul.appendChild(el('li', {}, [tegnOmtale(o)])); });
    boks.appendChild(ul);
    return boks;
  }

  function tegnOmtale(o) {
    var dato = new Date(o.opprettet).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
    var meta = [o.navn + (o.rolle ? ', ' + o.rolle : ''), o.firma, o.arrangement, o.oppdrag, dato].filter(Boolean).join(' · ');
    var kort = el('div', { class: 'omtale' }, [el('blockquote', { tekst: o.tekst }), el('p', { class: 'meta', tekst: meta })]);
    var knapper = el('div', { class: 'knapper' }, [
      el('button', { type: 'button', class: 'knapp', tekst: 'Publiser', onclick: function () { knapper.hidden = true; kort.appendChild(publiserSkjema(o, function () { knapper.hidden = false; })); } }),
      el('button', { type: 'button', class: 'knapp knapp--fare', tekst: 'Avvis', onclick: function () {
        if (!confirm('Avvise omtalen fra ' + o.navn + '? Den vises ikke på siden.')) return;
        merk(o, 'avvist', kort);
      } })
    ]);
    kort.appendChild(knapper);
    return kort;
  }

  function merk(o, status, kort, etter) {
    return send('/api/tilbakemelding', { pin: pin, handling: 'merk', id: o.id, status: status }).then(function (res) {
      if (!res.ok) { kort.appendChild(melding(res.feil || 'Fikk ikke lagret.', 'feil')); return; }
      omtaler = omtaler.filter(function (x) { return x.id !== o.id; });
      tegn();
      if (etter) app.appendChild(melding(etter, 'ok'));
    });
  }

  function publiserSkjema(o, avbryt) {
    var logo = null;
    var prove = el('div', { class: 'logoprove' }, [el('span', { class: 'meta', tekst: 'Ingen logo' })]);
    var lm = melding('');
    var fil = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', onchange: function () {
      if (!fil.files[0]) return;
      lm.textContent = 'Gjør logoen klar …';
      lastOpp(fil.files[0], 'logo', o.firma, function (r, feil) {
        if (!r) { lm.className = 'melding melding--feil'; lm.textContent = feil; return; }
        logo = r; lm.className = 'melding'; lm.textContent = 'Kanten er kuttet og hvit bakgrunn fjernet.';
        prove.replaceChildren(el('img', { src: r.bilde.data, alt: '' }));
      });
    } });
    var fra = el('input', { type: 'text', value: [kortnavn(o.navn), o.firma, o.arrangement].filter(Boolean).join(', ') });
    var tekst = el('textarea', { rows: '6' }); tekst.value = o.tekst;
    var valg = panel.omtaler.map(function (l) {
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !l.oppdrag || (o.oppdrag && l.oppdrag.toLowerCase() === String(o.oppdrag).toLowerCase());
      return { l: l, cb: cb, label: el('label', { class: 'avkryss' }, [cb, l.etikett || sidenavn(l.side)]) };
    });
    var m = melding('');
    var knapp = el('button', { type: 'button', class: 'stor', tekst: 'Publiser på siden', onclick: function () {
      var maal = valg.filter(function (v) { return v.cb.checked; }).map(function (v) { return v.l; });
      if (!maal.length) { m.className = 'melding melding--feil'; m.textContent = 'Kryss av for minst ett sted omtalen skal vises.'; return; }
      var t = tekst.value.trim();
      var verdi = {
        tekst: tilHtml(/^«/.test(t) ? t : '«' + t + '»', true), fra: tilHtml(fra.value), navn: tilHtml(o.navn), firma: tilHtml(o.firma),
        rolle: tilHtml(o.rolle), arrangement: tilHtml(o.arrangement), oppdrag: tilHtml(o.oppdrag), tittel: tilHtml(o.firma),
        logo: logo ? logo.sti : '', bilde: logo ? logo.sti : '', stjerner: ''
      };
      var sider = {};
      maal.forEach(function (l) {
        var post = {};
        l.felt.forEach(function (f) { post[f.navn] = verdi[f.navn] != null ? verdi[f.navn] : ''; });
        sider[l.side] = sider[l.side] || {};
        sider[l.side][l.liste] = [post].concat(sider[l.side][l.liste] || liste(l.side, l.liste, l.standard));
      });
      knapp.disabled = true; m.className = 'melding'; m.textContent = 'Publiserer …';
      send('/api/save', { pin: pin, sider: sider, bilder: logo ? [logo.bilde] : [] }).then(function (res) {
        knapp.disabled = false;
        if (!res.ok) { m.className = 'melding melding--feil'; m.textContent = res.error || 'Publiseringen feilet.'; return; }
        Object.keys(sider).forEach(function (s) { innhold[s] = innhold[s] || {}; for (var k in sider[s]) innhold[s][k] = sider[s][k]; });
        merk(o, 'publisert', m.parentNode, ferdigTekst(res));
      });
    } });
    return el('div', { class: 'skjema' }, [
      el('label', { class: 'felt' }, [el('span', { tekst: 'Firmalogo' }), el('small', { tekst: 'Png, jpg eller svg. Tom kant og hvit bakgrunn fjernes av seg selv.' }), prove, fil, lm]),
      el('label', { class: 'felt' }, [el('span', { tekst: 'Avsender på siden' }), fra]),
      el('label', { class: 'felt' }, [el('span', { tekst: 'Omtalen' }), el('small', { tekst: 'Du kan rette skrivefeil, men ikke endre hva kunden mener.' }), tekst]),
      el('fieldset', { class: 'felt' }, [el('span', { tekst: 'Vis omtalen her' })].concat(valg.map(function (v) { return v.label; }))),
      el('div', { class: 'handlinger' }, [knapp, el('button', { type: 'button', class: 'knapp', tekst: 'Avbryt', onclick: function (e) { e.target.closest('.skjema').remove(); avbryt(); } })]),
      m
    ]);
  }

  // ---------- Faner med lister og tekstfelt

  function tegnFane(f) {
    var boks = el('div');
    f.lister.forEach(function (l) { boks.appendChild(tegnListe(l)); });
    if (f.tekster.length) boks.appendChild(tegnTekster(f.tekster));
    return boks;
  }

  function sammendrag(l, post) {
    var deler = [];
    l.felt.forEach(function (f) {
      if (f.type === 'bilde' || f.type === 'logo' || f.type === 'lenke' || !post[f.navn]) return;
      deler.push(f.type === 'dato' ? visDato(post[f.navn]) : tilTekst(post[f.navn]));
    });
    var t = deler.join(' · ');
    return t.length > 120 ? t.slice(0, 117) + '…' : t || '(tomt)';
  }

  function tegnListe(l) {
    var poster = liste(l.side, l.liste, l.standard);
    var bilder = [];
    var endret = false;
    var bildefelt = l.felt.filter(function (f) { return f.type === 'bilde' || f.type === 'logo'; })[0];
    var datofelt = l.felt.filter(function (f) { return f.type === 'dato'; })[0];
    // Show som har vaert, vises ikke paa siden, og skal ikke forvirre her heller.
    // De forsvinner fra innholdet neste gang lista lagres.
    if (datofelt) {
      var d = new Date(), idag = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      poster = poster.filter(function (p) { return !ISO.test(p[datofelt.navn]) || p[datofelt.navn] >= idag; });
    }
    var boks = el('section');
    var m = melding('');

    function tegnPaa() {
      var ul = el('ul', { class: 'liste' });
      poster.forEach(function (post, i) {
        var knapper = el('div', { class: 'knapper' }, [
          el('button', { type: 'button', class: 'knapp', tekst: 'Endre', onclick: function () { rad.replaceWith(skjema(post, function (ny) { poster[i] = ny; bytt(); })); } }),
          i > 0 ? el('button', { type: 'button', class: 'knapp', 'aria-label': 'Flytt opp', tekst: '↑', onclick: function () { poster.splice(i - 1, 0, poster.splice(i, 1)[0]); bytt(); } }) : null,
          i < poster.length - 1 ? el('button', { type: 'button', class: 'knapp', 'aria-label': 'Flytt ned', tekst: '↓', onclick: function () { poster.splice(i + 1, 0, poster.splice(i, 1)[0]); bytt(); } }) : null,
          el('button', { type: 'button', class: 'knapp knapp--fare', tekst: 'Fjern', onclick: function () { if (confirm('Fjerne «' + sammendrag(l, post) + '»?')) { poster.splice(i, 1); bytt(); } } })
        ]);
        var rad = el('li', { class: 'rad' + (bildefelt ? '' : ' rad--uten-bilde') }, [
          bildefelt ? (post[bildefelt.navn] ? el('img', { src: bildeSrc(post[bildefelt.navn]), alt: '' }) : el('span', { class: 'tom' })) : null,
          el('div', {}, [el('p', { tekst: sammendrag(l, post) }), knapper])
        ]);
        ul.appendChild(rad);
      });
      var leggTil = el('button', { type: 'button', class: 'stor', tekst: 'Legg til', onclick: function () { leggTil.replaceWith(skjema({}, function (ny) { poster.unshift(ny); bytt(); })); } });
      var lagre = el('div', { class: 'lagre' }, [el('button', { type: 'button', class: 'stor', tekst: 'Lagre endringene', disabled: !endret, onclick: lagreListe })]);
      // replaceChildren skriver null som teksten «null», saa tomme deler filtreres bort.
      boks.replaceChildren.apply(boks, [
        el('h2', { tekst: l.etikett || (aktiv + (l.side !== 'index' ? ' på ' + sidenavn(l.side) : '')) }),
        datofelt ? el('p', { class: 'ingress', tekst: 'Show som har vært, forsvinner fra siden av seg selv.' }) : null,
        leggTil, ul, endret ? lagre : null, m
      ].filter(Boolean));
    }
    function bytt() { endret = true; m.textContent = ''; tegnPaa(); }

    function lagreListe(e) {
      var knapp = e.target;
      if (datofelt) {
        poster.sort(function (a, b) {
          var x = ISO.test(a[datofelt.navn]) ? a[datofelt.navn] : '9999', y = ISO.test(b[datofelt.navn]) ? b[datofelt.navn] : '9999';
          return x < y ? -1 : x > y ? 1 : 0;
        });
      }
      var edits = {}; edits[l.liste] = poster;
      knapp.disabled = true; knapp.textContent = 'Lagrer …';
      send('/api/save', { pin: pin, page: l.side, edits: edits, bilder: bilder }).then(function (res) {
        if (!res.ok) { knapp.disabled = false; knapp.textContent = 'Lagre endringene'; m.className = 'melding melding--feil'; m.textContent = res.error || 'Lagringen feilet.'; return; }
        innhold[l.side] = innhold[l.side] || {}; innhold[l.side][l.liste] = kopi(poster);
        bilder = []; endret = false; tegnPaa();
        m.className = 'melding melding--ok'; m.textContent = ferdigTekst(res);
      });
    }

    function skjema(post, ferdig) {
      var inn = {};
      var feltEl = l.felt.map(function (f) {
        var v = post[f.navn] || '';
        if (f.type === 'bilde' || f.type === 'logo') {
          var prove = el('div', { class: 'logoprove' }, [v ? el('img', { src: bildeSrc(v), alt: '' }) : el('span', { class: 'meta', tekst: 'Ingen bilde' })]);
          var fm = melding('');
          var fil = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' + (f.type === 'logo' ? ',image/svg+xml' : ''), onchange: function () {
            if (!fil.files[0]) return;
            fm.textContent = f.type === 'logo' ? 'Gjør logoen klar …' : 'Gjør bildet klart …';
            lastOpp(fil.files[0], f.type, (inn.tittel && inn.tittel.value) || f.navn, function (r, feil) {
              if (!r) { fm.className = 'melding melding--feil'; fm.textContent = feil; return; }
              inn[f.navn] = { value: r.sti, bilde: r.bilde };
              fm.className = 'melding'; fm.textContent = f.type === 'logo' ? 'Kanten er kuttet og hvit bakgrunn fjernet.' : 'Bildet er klart.';
              prove.replaceChildren(el('img', { src: r.bilde.data, alt: '' }));
            });
          } });
          inn[f.navn] = { value: v };
          return el('div', { class: 'felt' }, [el('span', { tekst: f.etikett }), f.type === 'logo' ? el('small', { tekst: 'Tom kant og hvit bakgrunn fjernes av seg selv, så alle logoene blir like store.' }) : null, prove, fil, fm]);
        }
        var input;
        if (f.type === 'dato') input = el('input', { type: 'date', value: ISO.test(v) ? v : '' });
        else if (f.type === 'lenke') input = el('input', { type: 'url', value: v, placeholder: 'https://' });
        else if (f.type === 'lang') { input = el('textarea', { rows: '5' }); input.value = tilTekst(v); }
        else input = el('input', { type: 'text', value: tilTekst(v) });
        inn[f.navn] = input;
        return el('label', { class: 'felt' }, [el('span', { tekst: f.etikett }), f.type === 'dato' && v && !ISO.test(v) ? el('small', { tekst: 'Står som «' + v + '» i dag. Velg datoen på nytt.' }) : null, input]);
      });
      var fm2 = melding('');
      var boks2 = el('li', { class: 'skjema' }, feltEl.concat([
        el('div', { class: 'handlinger' }, [
          el('button', { type: 'button', class: 'stor', tekst: 'Ferdig', onclick: function () {
            if (datofelt && !inn[datofelt.navn].value) { fm2.className = 'melding melding--feil'; fm2.textContent = 'Velg en dato.'; return; }
            var ny = kopi(post);
            l.felt.forEach(function (f) {
              var i = inn[f.navn];
              if (f.type === 'bilde' || f.type === 'logo') { ny[f.navn] = i.value; if (i.bilde) bilder.push(i.bilde); }
              else if (f.type === 'dato' || f.type === 'lenke') ny[f.navn] = i.value.trim();
              else ny[f.navn] = tilHtml(i.value, f.type === 'lang');
            });
            ferdig(ny);
          } }),
          el('button', { type: 'button', class: 'knapp', tekst: 'Avbryt', onclick: tegnPaa })
        ]), fm2
      ]));
      return boks2;
    }

    tegnPaa();
    return boks;
  }

  function tegnTekster(tekster) {
    var inn = tekster.map(function (t) {
      var v = (innhold[t.side] || {})[t.nokkel];
      return { t: t, input: el('input', { type: 'text', value: tilTekst(v != null ? v : t.standard) }) };
    });
    var m = melding('');
    var knapp = el('button', { type: 'button', class: 'stor', tekst: 'Lagre', onclick: function () {
      var sider = {};
      inn.forEach(function (x) { sider[x.t.side] = sider[x.t.side] || {}; sider[x.t.side][x.t.nokkel] = tilHtml(x.input.value); });
      knapp.disabled = true; m.className = 'melding'; m.textContent = 'Lagrer …';
      send('/api/save', { pin: pin, sider: sider }).then(function (res) {
        knapp.disabled = false;
        if (!res.ok) { m.className = 'melding melding--feil'; m.textContent = res.error || 'Lagringen feilet.'; return; }
        Object.keys(sider).forEach(function (s) { innhold[s] = innhold[s] || {}; for (var k in sider[s]) innhold[s][k] = sider[s][k]; });
        m.className = 'melding melding--ok'; m.textContent = ferdigTekst(res);
      });
    } });
    return el('section', {}, inn.map(function (x) { return el('label', { class: 'felt' }, [el('span', { tekst: x.t.etikett }), x.input]); }).concat([knapp, m]));
  }

  start();
})();
