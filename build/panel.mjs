// Kontrollpanelet (/admin/panel). To jobber i bygget:
//
// lesPanel()   leser data-panel-merkene i en mal FØR innholdet bakes inn, og
//              gir det panelet trenger: fanene, listene med feltene sine og
//              malens standardinnhold, tekstfeltene og listene en godkjent
//              omtale kan legges i. index.mjs samler det til dist/admin/panel.json.
// bakDatoer()  gjør datofelt (data-panel-type="dato") om fra 2026-12-16 til
//              16.12, merker kortet med data-dato og tar ut show som er passert.
//              DATOSKRIPT skjuler dem som passerer mellom to bygg.
//
// Merkene:
//   data-panel="Show"            på en data-editable-list: egen fane for lista.
//                                På et data-edit-element: tekstfelt i fanen.
//   data-panel-etikett="2026"    overskrift for lista eller feltet i panelet.
//   data-panel-type="dato|lenke|logo|lang"  på et felt i kortet.
//   data-panel-rekke="1"         rekkefølgen på fanen (laveste tall vinner).
//   data-panel-omtaler           på en omtaleliste: en godkjent omtale kan
//                                legges her. Verdien (f.eks. «Konferansier»)
//                                krysses av når omtalen gjelder det oppdraget.
//   data-list-href="felt"        lenke i kortet (bake.mjs setter href).

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[_-]+/g, ' ');
const iSpeil = (el) => !!el.closest('[data-content-src]');

function felterI(kort) {
  const felt = [];
  const sett = new Set();
  const legg = (navn, type, el) => {
    if (!navn || sett.has(navn)) return;
    sett.add(navn);
    felt.push({ navn, type: el.getAttribute('data-panel-type') || type, etikett: el.getAttribute('data-panel-etikett') || stor(navn) });
  };
  for (const el of kort.querySelectorAll('[data-list-field],[data-list-image-field],[data-list-href]')) {
    legg(el.getAttribute('data-list-field'), 'tekst', el);
    legg(el.getAttribute('data-list-image-field'), 'bilde', el);
    legg(el.getAttribute('data-list-href'), 'lenke', el);
  }
  // Bildet trenger et navn for skjermlesere. bake.mjs setter alt fra «tittel».
  if (felt.some((f) => f.type === 'bilde' || f.type === 'logo') && !sett.has('tittel')) {
    felt.push({ navn: 'tittel', type: 'tekst', etikett: 'Navn (leses opp for blinde)' });
  }
  return felt;
}

function verdierI(kort) {
  const post = {};
  for (const el of kort.querySelectorAll('[data-list-field]')) post[el.getAttribute('data-list-field')] = el.innerHTML.trim();
  for (const el of kort.querySelectorAll('[data-list-image-field]')) {
    post[el.getAttribute('data-list-image-field')] = el.getAttribute('src') || '';
    if (el.getAttribute('alt') && post.tittel == null) post.tittel = el.getAttribute('alt');
  }
  for (const el of kort.querySelectorAll('[data-list-href]')) post[el.getAttribute('data-list-href')] = el.getAttribute('href') || '';
  return post;
}

export function lesPanel(dom, side) {
  const funn = { lister: [], tekster: [], omtaler: [] };
  for (const liste of dom.querySelectorAll('[data-editable-list]')) {
    if (iSpeil(liste)) continue;
    const kort = liste.querySelectorAll('[data-list-item]');
    if (!kort.length) continue;
    // standard er malens egne kort. Mangler lista i content/<side>.json, er det
    // dem siden viser, og panelet maa bygge videre paa dem, aldri paa en tom liste.
    const grunn = { side, liste: liste.getAttribute('data-editable-list'), etikett: liste.getAttribute('data-panel-etikett') || '', felt: felterI(kort[0]), standard: kort.map(verdierI) };
    if (liste.hasAttribute('data-panel')) {
      funn.lister.push({ fane: liste.getAttribute('data-panel'), rekke: Number(liste.getAttribute('data-panel-rekke')) || 99, ...grunn });
    }
    if (liste.hasAttribute('data-panel-omtaler')) {
      funn.omtaler.push({ ...grunn, oppdrag: liste.getAttribute('data-panel-omtaler') || '' });
    }
  }
  for (const el of dom.querySelectorAll('[data-edit][data-panel]')) {
    if (iSpeil(el)) continue;
    funn.tekster.push({ fane: el.getAttribute('data-panel'), rekke: Number(el.getAttribute('data-panel-rekke')) || 99, side, nokkel: el.getAttribute('data-edit'), etikett: el.getAttribute('data-panel-etikett') || stor(el.getAttribute('data-edit')), standard: el.innerHTML.trim() });
  }
  return funn;
}

// Samler funnene fra alle malene til fanene panelet viser, i den rekkefølgen
// de først dukker opp.
export function lagPanel(alle) {
  const faner = [];
  const fane = (navn, rekke) => {
    let f = faner.find((x) => x.navn === navn);
    if (!f) { f = { navn, rekke, lister: [], tekster: [] }; faner.push(f); }
    f.rekke = Math.min(f.rekke, rekke);
    return f;
  };
  const omtaler = [];
  for (const funn of alle) {
    for (const l of funn.lister) { const { fane: n, rekke, ...rest } = l; fane(n, rekke).lister.push(rest); }
    for (const t of funn.tekster) { const { fane: n, rekke, ...rest } = t; fane(n, rekke).tekster.push(rest); }
    omtaler.push(...funn.omtaler);
  }
  // data-panel-rekke styrer rekkefoelgen; uten den kommer fanene som de dukker opp.
  faner.sort((a, b) => a.rekke - b.rekke);
  return { faner: faner.map(({ rekke, ...f }) => f), omtaler };
}

export function iDag(d = new Date()) {
  // Norsk dato, også når bygget kjører i UTC: et show 16.12 skal stå hele dagen.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);
}

export function bakDatoer(dom, idag = iDag()) {
  let merket = 0;
  for (const el of dom.querySelectorAll('[data-list-item] [data-panel-type="dato"]')) {
    const v = el.text.trim();
    if (!ISO.test(v)) continue;
    const kort = el.closest('[data-list-item]');
    if (v < idag) { kort.remove(); continue; }
    kort.setAttribute('data-dato', v);
    el.set_content(`${v.slice(8, 10)}.${v.slice(5, 7)}`);
    merket++;
  }
  return merket;
}

// Skjuler kort med en dato som har passert siden siste bygg. Kjører for alle
// besøkende, så det er bevisst lite og uten avhengigheter.
export const DATOSKRIPT = '<script>(function(){var d=new Date(),t=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);document.querySelectorAll("[data-dato]").forEach(function(e){if(e.getAttribute("data-dato")<t)e.remove()})})()</script>';
