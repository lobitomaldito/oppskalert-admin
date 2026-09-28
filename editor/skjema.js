/* ============================================================
   Innganger til redigeringssiden for samlinger (/admin/samling).
   Lenkes fra malene med <script src="/admin/skjema.js" defer></script>,
   baade paa siden med lista og i innleggsmalen.

   For en innlogget admin (PIN i sessionStorage):
   - en stor knapp foran hver [data-samling]-liste, med teksten fra
     data-samling-ny, f.eks. «+ Legg ut nytt møbel til salgs». Den gaar rett
     til et tomt skjema (slug=ny), ikke til lista.
   - paa en innleggsside (body[data-samling-innlegg], satt av bygget) en fast
     knapp nede til hoeyre, med teksten fra data-samling-rediger paa <body>

   En besoekende uten PIN faar ingenting: ingen knapp, ingen stil, ingen spor.
   Knappene er vanlige lenker. Selve skrivingen skjer paa redigeringssiden,
   som sjekker PIN-en mot serveren foer noe vises.
   ============================================================ */
(function () {
  'use strict';

  var pin = '';
  try { pin = sessionStorage.getItem('admin_pin') || ''; } catch (e) {}
  if (!pin) return;

  var CSS =
    '.adm-ny{display:flex;align-items:center;justify-content:center;width:100%;min-height:68px;margin:0 0 28px;padding:0 24px;' +
    'border-radius:14px;background:var(--adm-aksent,#3d6be0);color:#fff;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.14);' +
    'font:600 20px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:0;text-transform:none}' +
    '.adm-ny:hover{filter:brightness(1.08)}' +
    '.adm-rediger{position:fixed;right:20px;bottom:20px;z-index:100000;display:inline-flex;align-items:center;min-height:56px;padding:0 26px;' +
    'border-radius:999px;background:var(--adm-aksent,#3d6be0);color:#fff;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.25);' +
    'font:600 17px/1 system-ui,-apple-system,sans-serif}' +
    '.adm-ny:focus-visible,.adm-rediger:focus-visible{outline:3px solid #fff;outline-offset:-6px}';

  var cssLagt = false;
  function leggCss() {
    if (cssLagt) return;
    cssLagt = true;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function lenke(href, tekst, klasse) {
    var a = document.createElement('a');
    a.className = klasse;
    a.href = href;
    a.textContent = tekst;
    return a;
  }

  function adresse(navn, slug) {
    return '/admin/samling?navn=' + encodeURIComponent(navn) + (slug ? '&slug=' + encodeURIComponent(slug) : '');
  }

  // Idempotent: Angre i edit.js bygger <main> paa nytt og sender adm:restored.
  function start() {
    [].slice.call(document.querySelectorAll('[data-samling]')).forEach(function (liste) {
      var forrige = liste.previousElementSibling;
      if (forrige && forrige.className === 'adm-ny') return;
      leggCss();
      var navn = liste.getAttribute('data-samling');
      liste.parentNode.insertBefore(
        lenke(adresse(navn, 'ny'), '+ ' + (liste.getAttribute('data-samling-ny') || 'Legg ut nytt innlegg'), 'adm-ny'), liste);
    });

    var side = document.body.getAttribute('data-samling-innlegg');
    if (side && !document.querySelector('.adm-rediger')) {
      leggCss();
      var deler = side.split('/');
      document.body.appendChild(
        lenke(adresse(deler[0], deler[1]), document.body.getAttribute('data-samling-rediger') || 'Rediger', 'adm-rediger'));
    }
  }

  start();
  document.addEventListener('adm:restored', start);
})();
