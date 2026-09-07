// doctor/regler/strong-og-b.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'strong-og-b',
  alvor: 'feil',
  sjekk: (p) => perLinje(p, (s) => s.endsWith('.css'), (linje) =>
    /\bstrong\b/.test(linje) && !/\bb\b\s*[,{]/.test(linje) && /\{/.test(linje)
      ? 'CSS som styler strong maa ogsaa style b. Bold i editoren setter inn <b>, og det normaliseres til <strong> foerst ved publisering, saa nyfetet tekst ser feil ut inntil da.'
      : null)
};
