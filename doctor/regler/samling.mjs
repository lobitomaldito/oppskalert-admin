// doctor/regler/samling.mjs
// To regler for den valgfrie samlings-funksjonen (blogg/aktuelt/siste-nytt,
// se build/samling.mjs). Begge er stille naar prosjektet ikke har
// content/samlinger/ i det hele tatt, saa reglene er usynlige helt til
// funksjonen faktisk tas i bruk. Se
// .superpowers/sdd/2026-09-08-oppskalert-admin-samlinger/task-6-brief.md.
const SAMLING_JSON = /^content\/samlinger\/[^/]+\.json$/;
const INNLEGG_MAL = 'templates/_innlegg.html';

function samlingFiler(p) {
  return p.filer.filter((f) => SAMLING_JSON.test(f.sti));
}

// Samler alle innlegg fra samtlige content/samlinger/*.json-filer, utkast
// inkludert: dette er en strukturkontroll av skjema-mal-samsvar, ikke en
// publiseringskontroll, saa _kladd skal ikke filtreres bort her. Oedelagt
// JSON hopper stille over, samme prinsipp som build/samling.mjs sin
// lesSamlinger() og lastInnhold() i build/index.mjs: en kontrollregel skal
// aldri krasje paa daarlig innhold.
function alleInnlegg(p) {
  const innlegg = [];
  for (const fil of samlingFiler(p)) {
    try {
      const parsed = JSON.parse(fil.tekst);
      if (Array.isArray(parsed)) innlegg.push(...parsed.filter((i) => i && typeof i === 'object'));
    } catch { /* build.mjs varsler om odelagt JSON ved selve bygget, ikke her */ }
  }
  return innlegg;
}

export default {
  navn: 'samling-mal',
  alvor: 'feil',
  sjekk: (p) => {
    const samlinger = samlingFiler(p);
    if (samlinger.length === 0) return [];
    if (p.filer.some((f) => f.sti === INNLEGG_MAL)) return [];
    return [{
      fil: samlinger[0].sti,
      linje: 0,
      melding: `Prosjektet har en samling (${samlinger[0].sti}) men mangler ${INNLEGG_MAL}. Uten den malen bygges det aldri en side per innlegg.`
    }];
  }
};

// Fanger data-innlegg="felt" og data-innlegg-image="felt" i raatekst, med
// linjenummer. Attributtet staar alltid med dobbeltfnutt i denne kodebasen
// (se editor/skjema.js og build/index.mjs sin bakInnlegg()), saa en enkel
// regex holder, en full HTML-parse for to attributt-navn er unoedvendig
// vekt. (?:-image)? er valgfri, saa begge attributt-navnene fanges av samme
// moenster.
const FELT_ATTRIBUTT = /data-innlegg(?:-image)?="([^"]+)"/g;

function felterIMal(tekst) {
  const treff = [];
  let m;
  FELT_ATTRIBUTT.lastIndex = 0;
  while ((m = FELT_ATTRIBUTT.exec(tekst))) {
    treff.push({ felt: m[1], linje: tekst.slice(0, m.index).split('\n').length });
  }
  return treff;
}

export const samlingFelt = {
  navn: 'samling-felt',
  alvor: 'varsel',
  sjekk: (p) => {
    const mal = p.filer.find((f) => f.sti === INNLEGG_MAL);
    if (!mal) return [];

    const innlegg = alleInnlegg(p);
    if (innlegg.length === 0) return [];

    const nokler = new Set();
    for (const post of innlegg) for (const k of Object.keys(post)) nokler.add(k);

    const funn = [];
    for (const { felt, linje } of felterIMal(mal.tekst)) {
      if (nokler.has(felt)) continue;
      funn.push({
        fil: mal.sti,
        linje,
        melding: `data-innlegg="${felt}" viser et felt ingen innlegg i samlingen har. Sjekk stavemaaten, eller fjern markoren hvis feltet ikke lenger brukes.`
      });
    }
    return funn;
  }
};
