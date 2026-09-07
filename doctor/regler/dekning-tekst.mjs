// doctor/regler/dekning-tekst.mjs
// Melder bladnoder som mangler redigeringsmarkor. Terskelen mellom feil og
// varsel er malt paa fire instrumenterte kundesider (22 maler): p, h1, h2,
// h3 og blockquote var redigerbare i 56-100 % av tilfellene og gir feil.
// li og h4 laa paa 13-15 %, stort sett navigasjon og bunntekst, og gir
// varsel istedenfor. Ikke endre denne fordelingen uten aa maale paa nytt.
import { bladnoder } from '../_html.mjs';
import { malFiler } from '../_hjelpere.mjs';

const FEIL_TAGGER = ['p', 'h1', 'h2', 'h3', 'blockquote'];
const VARSEL_TAGGER = ['li', 'h4'];

// ramme: undefined betyr "uansett", true/false filtrerer paa om treffet
// ligger i header/footer/nav.
function finnFunn(p, tagger, ramme) {
  const funn = [];
  for (const fil of malFiler(p)) {
    for (const node of bladnoder(fil.tekst)) {
      if (node.ignorert || node.dekket) continue;
      if (!tagger.includes(node.tagg)) continue;
      if (ramme !== undefined && node.ramme !== ramme) continue;
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
  // Kun utenfor topp- og bunntekst og navigasjon. Et treff der er fortsatt
  // ekte, men skal ikke stoppe en levering, se dekningRammeTekst under.
  sjekk: (p) => finnFunn(p, FEIL_TAGGER, false)
};

export const dekningListe = {
  navn: 'dekning-liste',
  alvor: 'varsel',
  sjekk: (p) => finnFunn(p, VARSEL_TAGGER)
};

// De samme taggene som dekning-tekst, men inne i <header>, <footer> eller
// <nav>. Nedgradert fra feil til varsel: en glemt markor i bunnteksten er
// verdt aa vite om (footer.tagline paa Alphaneg var et ekte funn under
// kalibreringen), men skal ikke stoppe en leveranse alene.
export const dekningRammeTekst = {
  navn: 'dekning-tekst-ramme',
  alvor: 'varsel',
  sjekk: (p) => finnFunn(p, FEIL_TAGGER, true)
};
