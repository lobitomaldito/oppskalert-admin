// doctor/regler/ikke-x-men-y.mjs
// Moensteret fra CLAUDE.md. Varsel og ikke feil med vilje: en ekte motstilling
// ser likedan ut for et regulaert uttrykk. «Klipp 2 kommer paa en onsdag, ikke
// en loerdag» er informasjon og skal staa. Hvert treff skal leses.
import { perLinje } from '../_hjelpere.mjs';

const MOENSTER = /er ikke [^.,]{2,40}[.,] ?(det|den|dette) er|ikke bare [^.,]{2,40},? ?men|handler ikke om|, ikke (en|et|å) [a-zæøå]+/i;

export default {
  navn: 'ikke-x-men-y',
  alvor: 'varsel',
  sjekk: (p) => perLinje(p, (s) => /\.(html|json|md)$/.test(s), (linje) =>
    MOENSTER.test(linje)
      ? 'Mulig «ikke X, men Y». Les setningen: baerer negasjonen informasjon, skal den staa. Gjoer den ikke det, si Y og la X ligge.'
      : null)
};
