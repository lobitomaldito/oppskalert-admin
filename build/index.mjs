// Byggesteget: templates/*.html + content/<side>.json -> dist/*.html
// Besoekende faar ren statisk HTML. Ingen kall paa lesestien, ingen blink.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { lagOppslag } from './mirror.mjs';
import { bakeTekst, bakeBilder, bakeLister, settStilProp } from './bake.mjs';
import { lesSamlinger, synlige, slugErGyldig } from './samling.mjs';

const EDITOR = fileURLToPath(new URL('../editor/', import.meta.url));

// Disse tre klassene bakes inn i den statiske HTML-en av bake.mjs, men er ellers
// bare definert i editor/edit.css, som bare en verifisert admin faar lastet.
// Uten dem ser klienten et kort som skjult hos seg selv mens alle besokende ser
// det. Inline i head er den ene formen som ikke kan glemmes.
//
// [data-list-detail] hoerer til samme klasse feil. Detaljblokken er den lange
// teksten bak et kort, og skal bare vises i overlegget som detail-modal.js
// aapner. La den regelen ligge i detail-modal.js, holdt den bare saa lenge
// scriptet faktisk kjoerte: en 404, en blokkert script-tag eller en relativ
// sti fra en undermappe-mal ga hver besoekende hele detaljteksten til hvert
// kort dumpet rett inn i lista. Inline i head virker foer forste maling, saa
// den rekker heller ikke aa blinke mens den deferrede scripten laster.
// body.adm-editing slaar den paa igjen for admin, som skal se og redigere
// detaljteksten i sidefloten.
const PUBLIKUMSSTIL = '<style>.is-hidden-item{display:none}.txt-lg{font-size:1.25em}.txt-sm{font-size:0.85em}' +
  '[data-list-detail]{display:none}body.adm-editing [data-list-detail]{display:block}</style>';

// Skriver ett innleggs felt inn i innleggsmalen. Samme to attributt-navn
// som resten av motoren (data-edit/data-edit-image), bare med -innlegg for aa
// gjoere det tydelig at kilden er en samling og ikke sidas egen JSON.
function bakInnlegg(dom, post) {
  for (const el of dom.querySelectorAll('[data-innlegg]')) {
    const felt = el.getAttribute('data-innlegg');
    if (post[felt] != null) el.set_content(post[felt]);
  }
  for (const el of dom.querySelectorAll('[data-innlegg-image]')) {
    const felt = el.getAttribute('data-innlegg-image');
    const url = post[felt];
    if (url == null) continue;
    if (el.tagName === 'IMG') el.setAttribute('src', url);
    else settStilProp(el, 'background-image', `url('${url}')`);
  }
}

// Fyller listeseksjonen [data-samling="navn"] paa foreldresiden med de synlige
// innleggene i den samlingen, nyeste dato foerst. Seksjonen laases med samme
// attributt som resten av motoren bruker for skrivebeskyttede speil
// (data-content-src, sjekket av editor/edit.js sin inMirror()): kilden er
// samlingen, og et innlegg redigeres der, ikke i lista paa foreldresiden.
function bakSamlinger(dom, samlinger) {
  let treff = 0;

  for (const beholder of dom.querySelectorAll('[data-samling]')) {
    const navn = beholder.getAttribute('data-samling');
    beholder.setAttribute('data-content-src', `samling:${navn}`);

    const liste = samlinger[navn];
    if (!Array.isArray(liste) || liste.length === 0) continue;

    const maler = beholder.querySelectorAll('[data-list-item]');
    if (maler.length === 0) continue;

    const malStreng = maler[0].toString();
    maler.forEach((el) => el.remove());

    let poster = synlige(liste).slice().sort((a, b) => {
      const da = String(a.dato || '');
      const db = String(b.dato || '');
      if (da === db) return 0;
      return da > db ? -1 : 1;
    });

    const antall = beholder.getAttribute('data-samling-antall');
    if (antall) poster = poster.slice(0, Number(antall));

    poster.forEach((post) => {
      const rotNode = parse(malStreng);
      const element = rotNode.querySelector('[data-list-item]');
      if (!element) return;

      for (const felt of element.querySelectorAll('[data-list-field]')) {
        const k = felt.getAttribute('data-list-field');
        if (post[k] != null) felt.set_content(post[k]);
      }

      for (const felt of element.querySelectorAll('[data-list-image-field]')) {
        const k = felt.getAttribute('data-list-image-field');
        if (post[k] == null) continue;
        if (felt.tagName === 'IMG') {
          felt.setAttribute('src', post[k]);
          if (post.tittel) felt.setAttribute('alt', post.tittel);
        } else {
          settStilProp(felt, 'background-image', `url('${post[k]}')`);
        }
      }

      for (const lenke of element.querySelectorAll('[data-samling-lenke]')) {
        lenke.setAttribute('href', `/${navn}/${post.slug}/`);
      }

      beholder.appendChild(element);
      treff++;
    });
  }

  return treff;
}

export function build(config = {}) {
  const rot = config.rot || process.cwd();
  const sti = (s, standard) => {
    const v = s || standard;
    return isAbsolute(v) ? v : join(rot, v);
  };

  const TPL = sti(config.templates, 'templates');
  const INNHOLD = sti(config.content, 'content');
  // static/ er ikke konfigurerbar: api/_stier.mjs laaser opplastingsstien til
  // static/assets/uploads/, og de to maa peke samme sted. Var den konfigurerbar,
  // kunne et prosjekt bygge groent og likevel gi 404 paa hvert opplastet bilde.
  const STATISK = join(rot, 'static');
  const DIST = sti(config.dist, 'dist');

  // OEdelagt JSON skal aldri stoppe et bygg. En kundeside som ikke lar seg
  // deploye fordi en fil har en komma-feil, er verre enn en side som viser
  // standardteksten sin til noen retter opp.
  function lastInnhold(side) {
    const f = join(INNHOLD, `${side}.json`);
    if (!existsSync(f)) return {};
    try { return JSON.parse(readFileSync(f, 'utf8')); }
    catch { console.warn(`  ! ${side}.json lar seg ikke lese som JSON, bruker malens standardtekst`); return {}; }
  }

  // rmSync er den ene destruktive operasjonen i pakken. Vakten maa fange baade
  // dist som forelder til en kildemappe OG dist lik en av dem: dist: 'templates'
  // slettet malene og meldte "Bygde 0 sider" som en suksess.
  if (DIST === rot || [TPL, INNHOLD, STATISK].some((k) => k === DIST || k.startsWith(DIST + sep))) {
    throw new Error(`dist-mappa (${DIST}) inneholder kildefilene og kan ikke slettes. Velg en egen mappe.`);
  }

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  if (existsSync(STATISK)) cpSync(STATISK, DIST, { recursive: true });
  cpSync(EDITOR, join(DIST, 'admin'), { recursive: true });

  const samlinger = lesSamlinger(rot, (f) => readFileSync(f, 'utf8'), existsSync, (m) => readdirSync(m));

  // post.slug havner rett i en filsti (join(DIST, navn, post.slug)) og i en
  // href lenger ned. Et innlegg uten slug, eller med en slug som ikke matcher
  // det trygge moensteret lagSlug produserer (f.eks. "../../evil"), hopper vi
  // over her, foer noe annet bruker samlingen. Ett odelagt innlegg skal aldri
  // stoppe resten av bygget, samme prinsipp som lastInnhold() og lesSamlinger().
  for (const [navn, liste] of Object.entries(samlinger)) {
    samlinger[navn] = liste.filter((post) => {
      if (slugErGyldig(post.slug)) return true;
      console.warn(`  ! "${navn}": et innlegg har en manglende eller ugyldig slug (${JSON.stringify(post.slug)}), hoppes over`);
      return false;
    });
  }

  let sider = 0, treff = 0, innlegg = 0;

  for (const fil of readdirSync(TPL)) {
    if (!fil.endsWith('.html')) continue;
    // Maler som starter med _ hoerer til en samling (f.eks. _innlegg.html) og
    // bygges aldri som en egen side. Se lenger ned for hvordan de faktisk brukes.
    if (fil.startsWith('_')) continue;
    const side = fil.replace(/\.html$/, '');
    const dom = parse(readFileSync(join(TPL, fil), 'utf8'), { comment: true });
    const slaOpp = lagOppslag(lastInnhold(side), lastInnhold);

    treff += bakeTekst(dom, slaOpp);
    treff += bakeBilder(dom, slaOpp);
    treff += bakeLister(dom, slaOpp);
    treff += bakSamlinger(dom, samlinger);

    const head = dom.querySelector('head');
    if (head) head.insertAdjacentHTML('beforeend', PUBLIKUMSSTIL);

    let html = dom.toString();
    if (!/^\s*<!doctype/i.test(html)) html = `<!DOCTYPE html>\n${html}`;
    writeFileSync(join(DIST, fil), html);
    sider++;
  }

  // En side per innlegg, fra templates/_innlegg.html. Mangler samlingsmappa
  // helt, er samlinger {} og loekka under gjoer ingenting. Mangler bare malen
  // (en samling finnes, men ingen _innlegg.html), skal bygget IKKE kaste: det
  // er doctor sin jobb aa si fra om det.
  const malInnleggSti = join(TPL, '_innlegg.html');
  if (existsSync(malInnleggSti)) {
    const malRaw = readFileSync(malInnleggSti, 'utf8');
    for (const [navn, liste] of Object.entries(samlinger)) {
      for (const post of synlige(liste)) {
        const dom = parse(malRaw, { comment: true });
        bakInnlegg(dom, post);

        const head = dom.querySelector('head');
        if (head) head.insertAdjacentHTML('beforeend', PUBLIKUMSSTIL);

        let html = dom.toString();
        if (!/^\s*<!doctype/i.test(html)) html = `<!DOCTYPE html>\n${html}`;

        const utMappe = join(DIST, navn, post.slug);
        mkdirSync(utMappe, { recursive: true });
        writeFileSync(join(utMappe, 'index.html'), html);
        innlegg++;
      }
    }
  }

  console.log(`✓ Bygde ${sider} sider (${innlegg} innlegg) med ${treff} innholdstreff -> dist/`);
  return { sider, treff, innlegg };
}
