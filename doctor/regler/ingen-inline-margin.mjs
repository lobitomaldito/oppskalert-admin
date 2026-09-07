// doctor/regler/ingen-inline-margin.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'ingen-inline-margin',
  alvor: 'feil',
  sjekk: (p) => perLinje(p, (s) => s.endsWith('.html'), (linje) =>
    /data-list-item/.test(linje) && /style="[^"]*margin/i.test(linje)
      ? 'Inline margin paa et listeelement gir ujevne mellomrom naar klienten legger til eller flytter et kort. Bruk en flex-wrapper med gap i CSS.'
      : null)
};
