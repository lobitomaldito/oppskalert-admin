// doctor/regler/sidehode.mjs
// Punkt 4, 5 og 6 fra "20 things to tell Claude to fix on your vibecoded
// website": favicon, sidetittel og meta-beskrivelse. Hver mal her har sin
// egen fulle <head>, ikke en delt partial, saa alle tre skal staa i hver
// eneste fil.
import { parse } from 'node-html-parser';
import { malFiler } from '../_hjelpere.mjs';

function sideFiler(p) {
  // Samme filter som malFiler (hopper over redirect-stubber og
  // underscore-maler), men 404-siden tas med her: den skal ogsaa ha tittel,
  // beskrivelse og favicon, selv om editoren ikke har noen inngang til den.
  return [...malFiler(p), ...p.filer.filter((f) => f.sti === 'templates/404.html')];
}

export default {
  navn: 'sidehode',
  alvor: 'feil',
  sjekk: (p) => {
    const funn = [];
    for (const fil of sideFiler(p)) {
      const dok = parse(fil.tekst);

      const tittel = (dok.querySelector('title')?.text || '').trim();
      if (!tittel) {
        funn.push({ fil: fil.sti, linje: 0, melding: 'Mangler <title>. Fanen i nettleseren og Google-treffet blir tomt.' });
      }

      const beskrivelse = dok.querySelector('meta[name="description"]');
      const innhold = (beskrivelse?.getAttribute('content') || '').trim();
      if (!innhold) {
        funn.push({ fil: fil.sti, linje: 0, melding: 'Mangler meta description med innhold.' });
      }

      const favicon = dok.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
      const ikonHref = (favicon?.getAttribute('href') || '').trim();
      if (!ikonHref) {
        funn.push({ fil: fil.sti, linje: 0, melding: 'Mangler favicon (<link rel="icon">).' });
      }
    }
    return funn;
  }
};
