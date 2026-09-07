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

function finnRot(html) {
  const dokument = parse(html);
  return dokument.querySelector('main') || dokument;
}

export function bladnoder(html) {
  const rot = finnRot(html);
  const linje = linjeOppslag(html);
  const funn = [];
  for (const el of rot.querySelectorAll('*')) {
    const barnElementer = el.childNodes.filter((n) => n.nodeType === NodeType.ELEMENT_NODE);
    if (barnElementer.length > 0) continue;
    const tekst = (el.text || '').trim();
    if (tekst.length < 3) continue;
    funn.push({
      tagg: el.tagName.toLowerCase(),
      tekst,
      linje: linje(el.range[0]),
      dekket: harAttributt(el, DEKKET_ATTRIBUTTER),
      ignorert: harAttributt(el, [IGNORER_ATTRIBUTT])
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
      ignorert: harAttributt(el, [IGNORER_ATTRIBUTT])
    });
  }
  return funn;
}
