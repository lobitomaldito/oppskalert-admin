// doctor/regler/dekning-tekst.mjs
// Melder bladnoder som mangler redigeringsmarkor. Terskelen mellom feil og
// varsel er malt paa fire instrumenterte kundesider (22 maler): p, h1, h2,
// h3 og blockquote var redigerbare i 56-100 % av tilfellene og gir feil.
// li og h4 laa paa 13-15 %, stort sett navigasjon og bunntekst, og gir
// varsel istedenfor. Ikke endre denne fordelingen uten aa maale paa nytt.
import { bladnoder } from '../_html.mjs';

const FEIL_TAGGER = ['p', 'h1', 'h2', 'h3', 'blockquote'];
const VARSEL_TAGGER = ['li', 'h4'];

function malFiler(p) {
  return p.filer.filter((f) => f.sti.startsWith('templates/') && f.sti.endsWith('.html'));
}

function finnFunn(p, tagger) {
  const funn = [];
  for (const fil of malFiler(p)) {
    for (const node of bladnoder(fil.tekst)) {
      if (node.ignorert || node.dekket) continue;
      if (!tagger.includes(node.tagg)) continue;
      funn.push({
        fil: fil.sti,
        linje: node.linje,
        melding: `<${node.tagg}> mangler redigeringsmarkor. Legg til data-edit paa elementet, eller data-edit-ignore hvis det ikke skal vaere redigerbart.`
      });
    }
  }
  return funn;
}

export default {
  navn: 'dekning-tekst',
  alvor: 'feil',
  sjekk: (p) => finnFunn(p, FEIL_TAGGER)
};

export const dekningListe = {
  navn: 'dekning-liste',
  alvor: 'varsel',
  sjekk: (p) => finnFunn(p, VARSEL_TAGGER)
};
