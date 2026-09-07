// doctor/regler/tankestrek.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'tankestrek',
  alvor: 'varsel',
  sjekk: (p) => perLinje(p, (s) => /\.(html|json|md)$/.test(s), (linje) =>
    linje.includes('—')
      ? 'Tankestrek funnet. Bruk komma, kolon eller punktum.'
      : null)
};
