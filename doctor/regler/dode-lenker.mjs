// doctor/regler/dode-lenker.mjs
// Punkt 2, 7 og 15 fra "20 things to tell Claude to fix on your vibecoded
// website": knuste lenker, dode footer-lenker og menypunkter til seksjoner
// som er fjernet. Alle tre er samme feil sett fra tre vinkler: en <a> som
// ikke peker noe sted.
import { parse } from 'node-html-parser';

const TOM_ELLER_HASH = new Set(['#', '']);

export default {
  navn: 'dode-lenker',
  alvor: 'feil',
  sjekk: (p) => {
    const funn = [];
    for (const fil of p.filer) {
      if (!fil.sti.startsWith('templates/') || !fil.sti.endsWith('.html')) continue;
      const dok = parse(fil.tekst);
      const ider = new Set(dok.querySelectorAll('[id]').map((el) => el.getAttribute('id')));
      for (const a of dok.querySelectorAll('a[href]')) {
        const href = (a.getAttribute('href') || '').trim();
        if (TOM_ELLER_HASH.has(href)) {
          funn.push({ fil: fil.sti, linje: 0, melding: `Lenke uten mål (href="${href}"). Peker ingen steder.` });
          continue;
        }
        // Kun samme-side-ankere sjekkes mot id-er i denne fila. Eksterne
        // lenker og lenker til andre maler krever nettverk eller kjennskap
        // til hele prosjektet, og hoerer ikke hjemme i en statisk regel.
        if (href.startsWith('#') && href.length > 1) {
          const mal = href.slice(1);
          if (!ider.has(mal)) {
            funn.push({ fil: fil.sti, linje: 0, melding: `Intern lenke til #${mal}, men ingen id="${mal}" finnes i fila.` });
          }
        }
      }
    }
    return funn;
  }
};
