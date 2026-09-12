// doctor/regler/sidestruktur.mjs
// Punkt 8 og 17 fra "20 things to tell Claude to fix on your vibecoded
// website": en egen 404-side, og en header/nav som faktisk lenker hjem (i
// praksis: logoen er klikkbar).
import { parse } from 'node-html-parser';
import { malFiler } from '../_hjelpere.mjs';

const HJEM_HREF = new Set(['/', './', 'index.html', './index.html']);

export default {
  navn: 'sidestruktur',
  alvor: 'feil',
  sjekk: (p) => {
    const funn = [];

    const har404 = p.filer.some((f) => f.sti === 'templates/404.html');
    if (!har404) {
      funn.push({
        fil: 'templates/', linje: 0,
        melding: 'Ingen templates/404.html. Besoekende som skriver feil URL faar vertens standard-404 i stedet for en side som leder videre.'
      });
    }

    for (const fil of malFiler(p)) {
      const dok = parse(fil.tekst);
      const ramme = dok.querySelector('header') || dok.querySelector('nav');
      if (!ramme) continue; // ingen header/nav i det hele tatt er en annen regels bord
      const harHjemlenke = ramme.querySelectorAll('a[href]')
        .some((a) => HJEM_HREF.has((a.getAttribute('href') || '').trim()));
      if (!harHjemlenke) {
        funn.push({
          fil: fil.sti, linje: 0,
          melding: 'Ingen lenke til forsiden i header/nav. Logoen er trolig ikke klikkbar.'
        });
      }
    }
    return funn;
  }
};
