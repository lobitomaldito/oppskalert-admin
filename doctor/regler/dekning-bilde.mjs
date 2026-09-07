// doctor/regler/dekning-bilde.mjs
// Melder <img> og bakgrunnsbilder som mangler redigeringsmarkor.
import { bilder } from '../_html.mjs';
import { malFiler } from '../_hjelpere.mjs';

// ramme: undefined betyr "uansett", true/false filtrerer paa om treffet
// ligger i header/footer/nav.
function finnFunn(p, ramme) {
  const funn = [];
  for (const fil of malFiler(p)) {
    for (const bilde of bilder(fil.tekst)) {
      if (bilde.ignorert || bilde.dekket) continue;
      if (ramme !== undefined && bilde.ramme !== ramme) continue;
      const kilde = bilde.kilde || '(uten src)';
      funn.push({
        fil: fil.sti,
        linje: bilde.linje,
        melding: `Bildet ${kilde} mangler redigeringsmarkor. Legg til data-edit-image, eller data-edit-ignore hvis det ikke skal vaere redigerbart.`
      });
    }
  }
  return funn;
}

export default {
  navn: 'dekning-bilde',
  alvor: 'feil',
  // Kun utenfor topp- og bunntekst og navigasjon, se dekningRammeBilde under.
  sjekk: (p) => finnFunn(p, false)
};

// Samme sjekk, men for bilder inne i <header>, <footer> eller <nav>. Typisk
// merkevarelogoen som gaar igjen paa hver mal. Nedgradert til varsel av
// samme grunn som dekningRammeTekst: verdt aa vite, skal ikke stoppe en
// leveranse.
export const dekningRammeBilde = {
  navn: 'dekning-bilde-ramme',
  alvor: 'varsel',
  sjekk: (p) => finnFunn(p, true)
};
