/* ============================================================
   Nytt innlegg: skjemaet som legger ett innlegg i en samling.
   Selvhostet i editor/, kopiert til dist/admin/ av bygget som edit.js.
   Lenkes fra malen med <script src="/admin/skjema.js" defer></script>.

   Knappen «Nytt innlegg» legges i admin-baren BARE naar siden har minst en
   [data-samling]. Har den ingen, legges ingenting til: ingen skjult knapp,
   ingen stilark, ingen spor i DOM-en.

   Overlegget bygges paa <body>, utenfor redigeringsomraadet. Angre i edit.js
   bytter hele innerHTML i det omraadet, saa et overlegg som laa der inne ville
   forsvunnet midt i utfyllingen, med alt klienten hadde skrevet.

   Bildet krympes med motorens egen prepImage (delt av edit.js paa
   window.oppskalertAdmin), legges i en koe og reiser som base64 i det samme
   /api/save-kallet som selve innlegget. Ett kall, ett commit, ett bygg.

   Stilen ligger her og ikke i edit.css: skjemaet er valgfritt, og en side uten
   samlinger skal slippe aa laste regler den aldri bruker. Knappene laaner
   .adm__btn fra edit.css, som edit.js allerede har lastet naar baren staar.
   ============================================================ */
(function () {
  'use strict';

  var CSS =
    '.adm-skjema{position:fixed;inset:0;z-index:100001;display:flex;align-items:flex-start;justify-content:center;padding:4vh 1rem;overflow-y:auto;background:rgba(12,10,8,0.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-family:system-ui,-apple-system,sans-serif}' +
    '.adm-skjema__boks{width:100%;max-width:640px;margin:auto;padding:1.8rem 1.9rem 1.6rem;border-radius:16px;background:var(--adm-flate,#1c1b1a);color:var(--adm-tekst,#f5f4f2);box-shadow:0 30px 80px rgba(0,0,0,.6)}' +
    '.adm-skjema__tittel{margin:0 0 1.3rem;font-size:1.25rem;font-weight:700}' +
    '.adm-skjema__rad{display:block;margin-bottom:1rem}' +
    '.adm-skjema__merke{display:block;margin-bottom:.35rem;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}' +
    '.adm-skjema__inn{width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(255,255,255,.06);color:inherit;font:inherit}' +
    '.adm-skjema__inn:focus{outline:2px solid var(--adm-aksent,#3d6be0);outline-offset:1px}' +
    'textarea.adm-skjema__inn{min-height:5rem;resize:vertical}' +
    '.adm-skjema__hjelp{margin-top:.3rem;font-size:12px;opacity:.6}' +
    '.adm-skjema__av{display:flex;align-items:center;gap:.5rem;font-size:14px}' +
    '.adm-skjema__bilde{display:block;max-width:100%;margin-top:.6rem;border-radius:10px}' +
    // Maa staa etter regelen over: lik spesifisitet, saa den siste vinner.
    // Uten denne slaar display:block nettleserens [hidden]{display:none}, og
    // et avvist bilde blir staaende paa skjermen etter at koeen er toemt.
    '.adm-skjema__bilde[hidden]{display:none}' +
    '.adm-skjema__knapper{display:flex;align-items:center;gap:10px;margin-top:1.4rem}' +
    '.adm-skjema__melding{margin-left:auto;font-size:13px;line-height:1.4;text-align:right;opacity:.85}' +
    '@media(max-width:600px){.adm-skjema__boks{padding:1.3rem 1.1rem}}';

  // Serveren tar 3,0 MB dekodet og teller innlegget med i den summen. Samme
  // grep som edit.js: hold igjen 100 kB, saa et bilde avvises her med en
  // setning klienten forstaar i stedet for som en 413 hun ikke kan gjoere noe
  // med.
  var MAKS_BILDE = 3.0 * 1024 * 1024 - 100 * 1024;

  var overlegg = null;
  var ventendeBilder = [];
  var bildeSti = '';
  var slugRort = false;
  var sender = false;
  var cssLagt = false;

  function verktoy() { return window.oppskalertAdmin || null; }
  function pinen() { try { return sessionStorage.getItem('admin_pin') || ''; } catch (e) { return ''; } }
  function sidenokkel() { return document.body.getAttribute('data-page-key') || ''; }

  // ES5-tvillingen til lagSlug() i build/samling.mjs. Samme oppfoersel: smaa
  // bokstaver, aeoeaa skrevet ut, alt annet blir bindestrek, ingen bindestrek
  // foerst eller sist. Kollisjoner (-2, -3) haandteres ikke her: bygget og
  // serveren er sannheten om to innlegg skulle faa samme slug.
  function lagSlug(tittel) {
    var s = String(tittel || '').trim().toLowerCase();
    s = s.replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa');
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'innlegg';
  }
  function slugErGyldig(slug) { return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug); }

  // Feltene i et innlegg er HTML, ikke ren tekst: bakInnlegg() og bakSamlinger()
  // i build/index.mjs setter dem inn med set_content(), som er raa innsetting,
  // og planens eget eksempel har "<p>Full tekst.</p>" i brodtekst. Skjemaet her
  // leser derimot ren tekst ut av et <input>/<textarea>. Uten et steg imellom
  // ble et & eller et < klienten skrev til levende markup paa den ferdige siden.
  //
  // & maa escapes FOERST. Snus rekkefoelgen, escaper vi vaar egen escaping og
  // et < kommer ut som &amp;lt;.
  function escapeHtml(tekst) {
    return String(tekst == null ? '' : tekst)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Brodteksten i tillegg: HTML kollapser whitespace, saa tomme linjer i
  // <textarea> blir borte og hele innlegget havner i en eneste tekstblokk.
  // Tom linje skiller avsnitt, enkelt linjeskift inne i et avsnitt blir <br>.
  function tekstTilHtml(tekst) {
    var s = escapeHtml(tekst).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var deler = s.split(/\n[ \t]*\n+/);
    var ut = [];
    for (var i = 0; i < deler.length; i++) {
      var avsnitt = deler[i].trim();
      if (!avsnitt) continue;
      ut.push('<p>' + avsnitt.replace(/\n/g, '<br>') + '</p>');
    }
    return ut.join('');
  }

  function iDag() {
    var d = new Date();
    function to(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + to(d.getMonth() + 1) + '-' + to(d.getDate());
  }

  function leggCss() {
    if (cssLagt) return;
    cssLagt = true;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // -------------------------------------------------------
  //  OVERLEGGET
  // -------------------------------------------------------
  function felt(navn) { return overlegg.querySelector('[data-f="' + navn + '"]'); }
  function melding(tekst) { overlegg.querySelector('.adm-skjema__melding').textContent = tekst; }

  function lukk() {
    if (!overlegg) return;
    // Lytteren legges paa i apne(). Uten denne linja blir det en ny lytter per
    // aapning, som alle overlever overlegget de hoerte til.
    document.removeEventListener('keydown', paaEscape);
    overlegg.remove();
    overlegg = null;
    ventendeBilder = [];
    bildeSti = '';
    slugRort = false;
    sender = false;
  }

  function apne(navn) {
    if (overlegg) return;
    leggCss();
    overlegg = document.createElement('div');
    overlegg.className = 'adm-skjema';
    overlegg.setAttribute('role', 'dialog');
    overlegg.setAttribute('aria-modal', 'true');
    overlegg.innerHTML =
      '<div class="adm-skjema__boks">' +
        '<h2 class="adm-skjema__tittel">Nytt innlegg i ' + navn + '</h2>' +
        '<label class="adm-skjema__rad"><span class="adm-skjema__merke">Tittel</span>' +
          '<input type="text" class="adm-skjema__inn" data-f="tittel" placeholder="Overskriften paa innlegget"></label>' +
        '<label class="adm-skjema__rad"><span class="adm-skjema__merke">Nettadresse</span>' +
          '<input type="text" class="adm-skjema__inn" data-f="slug">' +
          '<span class="adm-skjema__hjelp">Lages av tittelen. Rett den om du vil ha en kortere adresse.</span></label>' +
        '<label class="adm-skjema__rad"><span class="adm-skjema__merke">Ingress</span>' +
          '<textarea class="adm-skjema__inn" data-f="ingress" placeholder="Kort inngang, en til to setninger"></textarea></label>' +
        '<label class="adm-skjema__rad"><span class="adm-skjema__merke">Brødtekst</span>' +
          '<textarea class="adm-skjema__inn" data-f="brodtekst" style="min-height:11rem"></textarea></label>' +
        '<label class="adm-skjema__rad"><span class="adm-skjema__merke">Dato</span>' +
          '<input type="date" class="adm-skjema__inn" data-f="dato"></label>' +
        '<label class="adm-skjema__rad"><span class="adm-skjema__merke">Bilde</span>' +
          '<input type="file" class="adm-skjema__inn" data-f="bilde" accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif">' +
          '<img class="adm-skjema__bilde" data-f="forhaandsvisning" alt="" hidden></label>' +
        '<label class="adm-skjema__rad adm-skjema__av">' +
          '<input type="checkbox" data-f="kladd"> Lagre som utkast (vises ikke på siden ennå)</label>' +
        '<div class="adm-skjema__knapper">' +
          '<button type="button" class="adm__btn adm__btn--primary" data-h="publiser">Publiser innlegget</button>' +
          '<button type="button" class="adm__btn adm__btn--ghost" data-h="avbryt">Avbryt</button>' +
          '<span class="adm-skjema__melding"></span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlegg);

    felt('dato').value = iDag();

    // Slugen foelger tittelen helt til klienten selv retter paa den. Etter det
    // eier hun feltet, og en videre retting av tittelen skal ikke overskrive
    // adressen hun nettopp skrev.
    felt('tittel').addEventListener('input', function () {
      if (slugRort) return;
      felt('slug').value = lagSlug(felt('tittel').value);
    });
    felt('slug').addEventListener('input', function () { slugRort = true; });
    felt('bilde').addEventListener('change', function () { taImot(felt('bilde').files && felt('bilde').files[0]); });

    overlegg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      var h = b.getAttribute('data-h');
      if (h === 'avbryt') lukk();
      else if (h === 'publiser') publiser(navn);
    });
    document.addEventListener('keydown', paaEscape);

    felt('tittel').focus();
  }

  function paaEscape(e) {
    if (e.key === 'Escape' && overlegg && !sender) lukk();
  }

  // -------------------------------------------------------
  //  BILDE
  // -------------------------------------------------------
  // Samme utsatte opplasting som resten av motoren: fila lastes ikke opp naar
  // den velges. Den krympes, base64-kodes og legges til side, og reiser med
  // publiseringen av innlegget.
  function taImot(fil) {
    if (!fil) return;
    var v = verktoy();
    if (!v || !v.prepImage) { melding('✗ Fikk ikke tak i bildeverktøyet. Last inn siden på nytt.'); return; }
    melding('Behandler bilde …');
    v.prepImage(fil, function (data, navn) {
      var trygt = String(navn).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.');
      var filnavn = Date.now() + '-' + trygt;
      if (!/\.(jpe?g|png|webp|gif)$/i.test(filnavn)) {
        melding('✗ Formatet støttes ikke. Bruk jpg, png, webp eller gif.');
        return;
      }
      if (Math.floor(String(data).length * 3 / 4) > MAKS_BILDE) {
        melding('✗ Bildet er for stort selv etter krymping. Velg et mindre bilde.');
        return;
      }
      ventendeBilder = [{ sti: 'static/assets/uploads/' + filnavn, data: data }];
      bildeSti = '/assets/uploads/' + filnavn;
      var vis = felt('forhaandsvisning');
      vis.setAttribute('src', data);
      vis.hidden = false;
      melding('✓ Bilde klart. Det følger med når du publiserer innlegget.');
    });
  }

  // -------------------------------------------------------
  //  PUBLISER
  // -------------------------------------------------------
  function publiser(navn) {
    if (sender) return;

    var tittel = felt('tittel').value.trim();
    if (!tittel) { melding('✗ Innlegget trenger en tittel.'); felt('tittel').focus(); return; }

    var slug = felt('slug').value.trim() || lagSlug(tittel);
    if (!slugErGyldig(slug)) {
      melding('✗ Nettadressen kan bare ha små bokstaver, tall og bindestrek.');
      felt('slug').focus();
      return;
    }

    // tittel og slug lages av den RAA teksten over (lagSlug og lengdesjekken),
    // og escapes foerst her, paa vei inn i det som lagres.
    var innlegg = {
      slug: slug,
      tittel: escapeHtml(tittel),
      ingress: escapeHtml(felt('ingress').value.trim()),
      brodtekst: tekstTilHtml(felt('brodtekst').value),
      bilde: bildeSti,
      dato: felt('dato').value || iDag(),
      _kladd: !!felt('kladd').checked
    };

    sender = true;
    melding('Publiserer …');
    overlegg.querySelector('[data-h="publiser"]').disabled = true;

    fetch('/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: sidenokkel(),
        pin: pinen(),
        edits: {},
        bilder: ventendeBilder,
        samling: { navn: navn, innlegg: innlegg }
      })
    })
      // Leser som tekst foerst, samme grep som publish() i edit.js. Svarer
      // Vercel med en HTML-side i stedet for JSON, skal klienten faa en setning
      // og ikke en raa SyntaxError.
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) {}
          if (!j || typeof j !== 'object') {
            j = { error: 'Serveren svarte ' + r.status + ' uten et svar vi kan lese. Teksten din står fortsatt i skjemaet, prøv igjen om litt.' };
          }
          return { ok: r.ok, status: r.status, j: j };
        });
      })
      .then(function (res) {
        if (res.ok && res.j.ok) {
          ventendeBilder = [];
          teller(Math.round((res.j.rebuildMs || 50000) / 1000));
          return;
        }
        sender = false;
        overlegg.querySelector('[data-h="publiser"]').disabled = false;
        // Et avvist bilde blir aldri godtatt senere heller, verken paa 400
        // (ulovlig format/sti) eller 413 (for stort sammen med resten av
        // innlegget). Toem koeen paa begge, ellers sender hver nye Publiser
        // den samme posten paa nytt og treffer den samme feilen i en loekke.
        if ((res.status === 400 || res.status === 413) && ventendeBilder.length) {
          ventendeBilder = [];
          bildeSti = '';
          felt('forhaandsvisning').hidden = true;
          felt('bilde').value = '';
          melding('✗ ' + (res.j.error || 'Bildet ble avvist.') + ' Bildet er fjernet, teksten din står igjen.');
          return;
        }
        melding('✗ ' + (res.j.error || 'Feil'));
      })
      .catch(function (err) {
        sender = false;
        overlegg.querySelector('[data-h="publiser"]').disabled = false;
        melding('✗ ' + err);
      });
  }

  // Vercel bygger om etter commit-et. Vis nedtellingen der klienten allerede
  // ser, og last inn siden naar bygget etter alt aa doemme er ferdig.
  function teller(sekunder) {
    var igjen = sekunder;
    var knapp = overlegg.querySelector('[data-h="avbryt"]');
    knapp.textContent = 'Sjekk nå';
    knapp.disabled = false;
    knapp.setAttribute('data-h', 'na');
    knapp.addEventListener('click', function () { location.reload(); });
    melding('✓ Innlegget er publisert. Siden bygges om, laster inn på nytt om ' + igjen + ' sek …');
    var tikk = setInterval(function () {
      igjen--;
      if (igjen <= 0) { clearInterval(tikk); location.reload(); return; }
      melding('✓ Innlegget er publisert. Siden bygges om, laster inn på nytt om ' + igjen + ' sek …');
    }, 1000);
  }

  // -------------------------------------------------------
  //  KNAPPEN I ADMIN-BAREN
  // -------------------------------------------------------
  // Kalles naar edit.js har verifisert PIN-en og bygget baren. Idempotent:
  // en ny runde legger ikke en knapp til.
  function start() {
    var v = verktoy();
    if (!v || !v.bar) return;
    if (v.bar.querySelector('[data-act="nytt-innlegg"]')) return;

    var beholder = document.querySelector('[data-samling]');
    var navn = beholder ? beholder.getAttribute('data-samling') : '';
    if (!navn) return; // ingen samling paa siden, ingen knapp

    var knapp = document.createElement('button');
    knapp.className = 'adm__btn';
    knapp.setAttribute('data-act', 'nytt-innlegg');
    knapp.textContent = '+ Nytt innlegg';
    knapp.addEventListener('click', function (e) { e.preventDefault(); apne(navn); });
    v.bar.insertBefore(knapp, v.bar.querySelector('.adm__status'));
  }

  if (verktoy()) start();
  document.addEventListener('adm:klar', start);
})();
