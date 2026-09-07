// doctor/regler/gjentatt-gruppe.mjs
// Melder naar tre eller flere soesken deler tagg og klasseattributt uten aa
// vaere en data-editable-list. To like soesken er et vanlig layoutgrep (to
// kolonner), tre er et moenster som helst boer vaere en liste kunden selv
// kan legge til og fjerne rader i.
import { parse, NodeType } from 'node-html-parser';

const TERSKEL = 3;

function malFiler(p) {
  return p.filer.filter((f) => f.sti.startsWith('templates/') && f.sti.endsWith('.html'));
}

function harForelderMedAttributt(el, attributt) {
  let node = el;
  while (node) {
    if (typeof node.hasAttribute === 'function' && node.hasAttribute(attributt)) return true;
    node = node.parentNode;
  }
  return false;
}

function linjeFor(html, offset) {
  let linje = 1;
  for (let i = 0; i < offset; i++) {
    if (html[i] === '\n') linje++;
  }
  return linje;
}

function nokkelFor(el) {
  const klasse = (el.getAttribute('class') || '').trim();
  return `${el.tagName.toLowerCase()}|${klasse}`;
}

function grupperBarn(el) {
  const grupper = new Map();
  for (const barn of el.childNodes) {
    if (barn.nodeType !== NodeType.ELEMENT_NODE) continue;
    const nokkel = nokkelFor(barn);
    if (!grupper.has(nokkel)) grupper.set(nokkel, []);
    grupper.get(nokkel).push(barn);
  }
  return grupper;
}

export default {
  navn: 'gjentatt-gruppe',
  alvor: 'varsel',
  sjekk: (p) => {
    const funn = [];
    for (const fil of malFiler(p)) {
      const dokument = parse(fil.tekst);
      const rot = dokument.querySelector('main') || dokument;
      const elementer = [rot, ...rot.querySelectorAll('*')];

      for (const el of elementer) {
        for (const [nokkel, medlemmer] of grupperBarn(el)) {
          if (medlemmer.length < TERSKEL) continue;
          const iListe = medlemmer.some((m) => harForelderMedAttributt(m, 'data-editable-list'));
          const ignorert = medlemmer.some((m) => harForelderMedAttributt(m, 'data-edit-ignore'));
          if (iListe || ignorert) continue;

          const [tagg, klasse] = nokkel.split('|');
          const beskrivelse = klasse ? `<${tagg} class="${klasse}">` : `<${tagg}>`;
          funn.push({
            fil: fil.sti,
            linje: linjeFor(fil.tekst, medlemmer[0].range[0]),
            melding: `${medlemmer.length} like ${beskrivelse}-elementer paa rad. Vurder aa gjore dem om til en data-editable-list-liste istedenfor separate markorer paa hvert.`
          });
        }
      }
    }
    return funn;
  }
};
