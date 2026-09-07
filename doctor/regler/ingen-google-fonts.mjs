// doctor/regler/ingen-google-fonts.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'ingen-google-fonts',
  alvor: 'feil',
  sjekk: (p) => perLinje(p, (s) => /\.(html|css)$/.test(s), (linje) =>
    /fonts\.(googleapis|gstatic)\.com/.test(linje)
      ? 'Google Fonts logger besoekendes IP hos en tredjepart, som motsier personvernsiden. Selvhost fonten fra ~/.claude/assets/fonts/.'
      : null)
};
