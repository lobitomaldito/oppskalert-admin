import { slugErGyldig, unikSlug } from '../build/samling.mjs';

// Samlinger lagres kumulativt: to publiseringer i samme byggevindu skal ikke
// overskrive hverandre, slik hovedinnholdet gjor med {...naa, ...edits}.
// flett() tar tabellen slik den ligger paa GitHub naa, og ett enkelt innlegg
// (nytt eller redigert), og returnerer den oppdaterte tabellen.
export function flett(naavaerende, innlegg) {
  const liste = Array.isArray(naavaerende) ? naavaerende : [];
  const idx = liste.findIndex((i) => i && i.slug === innlegg.slug);

  // Ukjent slug: nyeste innlegg foerst.
  if (idx === -1) return [innlegg, ...liste];

  // Kjent slug: byttes ut paa samme plass. Alle andre innlegg i tabellen
  // roeres ikke og beholder alle sine felt uendret.
  const oppdatert = liste.slice();
  oppdatert[idx] = innlegg;
  return oppdatert;
}

const feil = (status, melding) => ({ feil: { status, melding } });

// Hva en samlingsforespoersel gjoer med tabellen som ligger lagret naa.
// Delt av api/save.js og dev-serveren i bin/, saa de aldri gaar i utakt.
//   ny        nytt innlegg; en slug som finnes fra foer faar -2, -3 (aldri overskriving)
//   oppdater  bytter ut innlegget med samme slug, som maa finnes
//   slett     fjerner innlegget med samling.slug
//   les       gir tabellen tilbake uten aa skrive noe
// Svarer { liste, skriv, slug } eller { feil: { status, melding } }.
export function behandle(naavaerende, samling) {
  const liste = Array.isArray(naavaerende) ? naavaerende : [];
  const handling = samling.handling || 'ny';
  const finnes = (slug) => liste.some((i) => i && i.slug === slug);

  if (handling === 'les') return { liste, skriv: false };

  if (handling === 'slett') {
    if (!slugErGyldig(samling.slug)) return feil(400, 'Ugyldig slug på innlegget.');
    if (!finnes(samling.slug)) return feil(404, 'Fant ikke innlegget. Det kan allerede være slettet.');
    return { liste: liste.filter((i) => !i || i.slug !== samling.slug), skriv: true, slug: samling.slug };
  }

  const innlegg = samling.innlegg;
  if (!innlegg || typeof innlegg !== 'object' || Array.isArray(innlegg) || !slugErGyldig(innlegg.slug)) {
    return feil(400, 'Ugyldig slug på innlegget.');
  }

  if (handling === 'oppdater') {
    if (!finnes(innlegg.slug)) return feil(404, 'Fant ikke innlegget. Det kan være slettet i en annen fane.');
    return { liste: flett(liste, innlegg), skriv: true, slug: innlegg.slug };
  }

  if (handling === 'ny') {
    // Skjemaet lager slugen fra tittelen uten aa vite hvilke som er i bruk.
    // unikSlug deconflikterer FOER flett() faar se den, saa en kollisjon blir
    // et nytt innlegg med -2, aldri en stille overskriving av et annet.
    const slug = unikSlug(innlegg.slug, liste.map((i) => i && i.slug).filter(Boolean));
    return { liste: flett(liste, { ...innlegg, slug }), skriv: true, slug };
  }

  return feil(400, 'Ukjent handling.');
}
