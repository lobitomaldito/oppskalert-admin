// doctor/regler/strong-og-b.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'strong-og-b',
  alvor: 'feil',
  sjekk: (p) => perLinje(p, (s) => s.endsWith('.css'), (linje) => {
    if (!linje.includes('{')) return null;
    // Selektoren deles paa komma til grupper, og hver gruppe sjekkes for om den
    // ENDER paa strong eller b. En regex over hele linja traff siste bokstav i
    // klassenavn som .tab-b, og gikk glipp av at <b> aldri var styrt.
    const grupper = linje.split('{')[0].split(',').map((g) => g.trim()).filter(Boolean);
    const stylerStrong = grupper.some((g) => /(^|[\s>+~])strong$/.test(g));
    const stylerB = grupper.some((g) => /(^|[\s>+~])b$/.test(g));
    return stylerStrong && !stylerB
      ? 'CSS som styler strong maa ogsaa style b. Bold i editoren setter inn <b>, og det normaliseres til <strong> foerst ved publisering, saa nyfetet tekst ser feil ut inntil da.'
      : null;
  })
};
