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
