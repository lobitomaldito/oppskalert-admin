// doctor/_html.mjs
// Delt HTML-hjelper for kontroll-reglene som leser bladnoder (tekst) og
// bilder i en mal. Egen fil av samme grunn som _hjelpere.mjs: reglene
// importerer denne, og index.mjs importerer reglene, saa la den ligge i
// index.mjs blir importen sirkulaer.
import { parse, NodeType } from 'node-html-parser';

// Attributter som gjor et element (eller et barn av det) redigerbart.
const DEKKET_ATTRIBUTTER = ['data-edit', 'data-list-field', 'data-list-item', 'data-editable-list', 'data-content-src'];
const IGNORER_ATTRIBUTT = 'data-edit-ignore';
const BILDE_DEKKET_ATTRIBUTTER = ['data-edit-image', 'data-list-image-field', 'data-editable-list'];
const BAKGRUNNSBILDE = /background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i;

// Topp- og bunntekst er delt rammeverk, ikke sideinnhold. Et treff her skal
// fortsatt meldes (feltet blir aldri erklaert fast av seg selv), men skal
// ikke stoppe en levering. Gjelder uansett om malen har <main> eller ikke:
// har den <main>, ligger header/footer/nav som regel utenfor rota uansett,
// men et <nav> inni <main> skal ogsaa dempes.
const RAMME_TAGGER = new Set(['header', 'footer', 'nav']);

// Linjenummer beregnes fra elementets tegn-offset i kildeteksten (range fra
// node-html-parser), ikke ved aa soeke opp elementets outerHTML i teksten.
// Samme markup finnes ofte flere ganger i samme fil (to like kort, en
// gjentatt seksjon), og et tekstsoek ville alltid truffet forste forekomst
// uansett hvilket element det faktisk gjaldt. Tegn-offset fra parseren er
// entydig per element uansett hvor mange like naboer det har.
function linjeOppslag(html) {
  const linjeStarter = [0];
  for (let i = 0; i < html.length; i++) {
    if (html[i] === '\n') linjeStarter.push(i + 1);
  }
  return (offset) => {
    let lav = 0;
    let hoy = linjeStarter.length - 1;
    while (lav < hoy) {
      const midt = Math.ceil((lav + hoy) / 2);
      if (linjeStarter[midt] <= offset) lav = midt;
      else hoy = midt - 1;
    }
    return lav + 1;
  };
}

function harAttributt(el, attributter) {
  let node = el;
  while (node) {
    if (typeof node.hasAttribute === 'function' && attributter.some((a) => node.hasAttribute(a))) return true;
    node = node.parentNode;
  }
  return false;
}

function erIRamme(el) {
  let node = el;
  while (node) {
    if (typeof node.tagName === 'string' && RAMME_TAGGER.has(node.tagName.toLowerCase())) return true;
    node = node.parentNode;
  }
  return false;
}

function finnRot(html) {
  const dokument = parse(html);
  return dokument.querySelector('main') || dokument;
}

// Terskelen finnes for aa hoppe over tomme noder og rene dekortegn (punkt,
// pil, strek, loddrett strek og lignende), ikke for aa luke ut korte ord.
// Norske overskrifter som "Om" og "Vi" er ekte innhold paa to tegn og skal
// telle. Derfor: minst to tegn OG minst en bokstav eller et siffer. \p{L}
// daekker ogsaa aeoeaa.
const HAR_BOKSTAV_ELLER_SIFFER = /[\p{L}\p{N}]/u;
function erInnhold(tekst) {
  return tekst.length >= 2 && HAR_BOKSTAV_ELLER_SIFFER.test(tekst);
}

// En byggeplassholder som "{{FORFATTER_BIO}}" eller "«{{ORIGINALTITTEL}}»" er
// ikke innhold, det er noe byggescriptet skal erstatte foer siden noensinne
// vises. Krever at HELE den trimmede teksten er plassholderen, eventuelt med
// et anforselstegn paa hver side. "Stein-Eriks forhandlingsraad #{{NR}}" er
// ikke det, der er placeholderen bare en del av en ekte tekst, og treffet
// skal fortsatt telle.
const REN_PLASSHOLDER = /^[«"']?\{\{[A-Z0-9_]+\}\}[»"']?$/;
function erPlassholder(tekst) {
  return REN_PLASSHOLDER.test(tekst);
}

// Markup som bare former teksten inni et avsnitt, aldri en egen blokk. Et
// element som utelukkende har slike barn baerer fortsatt ett sammenhengende
// stykke brodtekst, og skal telles som en bladnode. Uten dette hoppet
// kontrollen over ethvert avsnitt med en lenke eller et fett ord i seg,
// altsaa de fleste avsnittene paa en markedsside. Kalibreringen maalte bare
// falske positive og saa derfor ikke hullet: det var en falsk negativ.
const INLINE_TAGGER = new Set([
  'strong', 'b', 'em', 'i', 'a', 'span', 'br', 'small',
  'sup', 'sub', 'u', 's', 'mark', 'abbr', 'code', 'time', 'wbr'
]);

function erInline(el) {
  return typeof el.tagName === 'string' && INLINE_TAGGER.has(el.tagName.toLowerCase());
}

// Bladnode: ingen element-barn i det hele tatt, eller bare inline-barn. Et
// blokk-barn (p, div, ul, h1-h6, section, figure og alt annet utenfor
// settet over) gjor elementet til en beholder, som foer.
function erBladnode(el) {
  for (const n of el.childNodes) {
    if (n.nodeType !== NodeType.ELEMENT_NODE) continue;
    if (!INLINE_TAGGER.has(n.tagName.toLowerCase())) return false;
  }
  return true;
}

export function bladnoder(html) {
  const rot = finnRot(html);
  const linje = linjeOppslag(html);
  const funn = [];
  for (const el of rot.querySelectorAll('*')) {
    if (!erBladnode(el)) continue;
    // Uten denne vakten gir <p>Ring <a>1</a> i dag</p> to funn, ett paa p og
    // ett paa a, for begge er bladnoder etter regelen over. Den ytterste
    // bladnoden baerer hele teksten, saa inline-barnet melder ikke selv.
    // Unntaket er et inline-element som ligger rett under rota: der finnes
    // ingen ytre bladnode som kan melde det i stedet.
    const forelder = el.parentNode;
    if (erInline(el) && forelder && forelder !== rot && erBladnode(forelder)) continue;
    const tekst = (el.text || '').trim();
    if (!erInnhold(tekst)) continue;
    if (erPlassholder(tekst)) continue;
    funn.push({
      tagg: el.tagName.toLowerCase(),
      tekst,
      linje: linje(el.range[0]),
      dekket: harAttributt(el, DEKKET_ATTRIBUTTER),
      ignorert: harAttributt(el, [IGNORER_ATTRIBUTT]),
      ramme: erIRamme(el)
    });
  }
  return funn;
}

export function bilder(html) {
  const rot = finnRot(html);
  const linje = linjeOppslag(html);
  const funn = [];
  for (const el of rot.querySelectorAll('*')) {
    let kilde = null;
    if (el.tagName.toLowerCase() === 'img') {
      kilde = el.getAttribute('src') || '';
    } else {
      const style = el.getAttribute('style') || '';
      const treff = style.match(BAKGRUNNSBILDE);
      if (treff) kilde = treff[1];
    }
    if (kilde === null) continue;
    funn.push({
      kilde,
      linje: linje(el.range[0]),
      dekket: harAttributt(el, BILDE_DEKKET_ATTRIBUTTER),
      ignorert: harAttributt(el, [IGNORER_ATTRIBUTT]),
      ramme: erIRamme(el)
    });
  }
  return funn;
}
