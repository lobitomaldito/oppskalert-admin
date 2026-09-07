// doctor/regler/malt-byggetid.mjs
// Nedtellingen etter Publiser er et loefte til klienten. Gaar den ut foer siden
// er klar, leser det som en feil og klienten trykker Publiser en gang til.
export default {
  navn: 'malt-byggetid',
  alvor: 'varsel',
  // Merkefila heter admin-tid.json og ikke .admin-tid fordi lesProsjekt hopper
  // over navn som starter med punktum. En maalt verdi som skal vaere
  // etterprovbar hoerer uansett hjemme som en synlig fil.
  sjekk: (p) => p.filer.some((f) => f.sti === 'admin-tid.json')
    ? []
    : [{ fil: 'admin-tid.json', linje: 0, melding: 'Byggetiden er aldri maalt paa dette prosjektet. Kjoer `oppskalert-admin tid <ms>` og sett ADMIN_REBUILD_MS i Vercel.' }]
};
