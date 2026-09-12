// doctor/regler/hardkodet-arstall.mjs
// Punkt 9 fra "20 things to tell Claude to fix on your vibecoded website": et
// hardkodet aarstall ved siden av et copyright-tegn er riktig i dag og feil
// om fire maaneder. Varsel, ikke feil: det knekker ingenting med det samme.
import { malFiler } from '../_hjelpere.mjs';

const HARDKODET_AR = /(©|&copy;)\s*(19|20)\d{2}\b/i;

export default {
  navn: 'hardkodet-arstall',
  alvor: 'varsel',
  sjekk: (p) => {
    const funn = [];
    for (const fil of malFiler(p)) {
      const m = fil.tekst.match(HARDKODET_AR);
      if (m) {
        funn.push({
          fil: fil.sti, linje: 0,
          melding: `Hardkodet aarstall ved © (${m[0]}). Sett det med JS (new Date().getFullYear()) eller et admin-felt, ellers er det feil naar aaret snur.`
        });
      }
    }
    return funn;
  }
};
