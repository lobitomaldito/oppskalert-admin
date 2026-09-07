// doctor/regler/dekning-bilde.mjs
// Melder <img> og bakgrunnsbilder som mangler redigeringsmarkor.
import { bilder } from '../_html.mjs';

function malFiler(p) {
  return p.filer.filter((f) => f.sti.startsWith('templates/') && f.sti.endsWith('.html'));
}

export default {
  navn: 'dekning-bilde',
  alvor: 'feil',
  sjekk: (p) => {
    const funn = [];
    for (const fil of malFiler(p)) {
      for (const bilde of bilder(fil.tekst)) {
        if (bilde.ignorert || bilde.dekket) continue;
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
};
