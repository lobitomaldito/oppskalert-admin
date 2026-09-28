// Publisering: innhold og eventuelle nye bilder i ETT commit.
// Vercel bygger, og besoekende faar ren statisk HTML.
import { checkPin } from './_rateLimit.mjs';
import { commitFiler, lesFil } from './_git.mjs';
import { trygStI, trygSidenavn, MAKS_PAYLOAD } from './_stier.mjs';
import { behandle } from './_samling.mjs';
import { slugErGyldig } from '../build/samling.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metoden er ikke tillatt' });

  const { page, pin, edits, bilder = [], samling } = req.body || {};

  const sjekk = checkPin(req, pin, process.env.ADMIN_PIN);
  if (!sjekk.ok) return res.status(sjekk.status).json({ ok: false, error: sjekk.error });

  // En samlingsforespoersel fra redigeringssiden (editor/samling.js) har
  // ingen side og ingen edits. Alt annet maa ha begge, som foer.
  const harSamling = samling !== undefined && samling !== null;
  if (!harSamling && (!page || !edits)) return res.status(400).json({ ok: false, error: 'Mangler page eller edits' });

  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!repo || !token) return res.status(500).json({ ok: false, error: 'Mangler GITHUB_REPO eller GITHUB_TOKEN på serveren.' });

  if (!Array.isArray(bilder)) {
    return res.status(400).json({ ok: false, error: 'Feltet bilder maa vaere en liste.' });
  }
  for (const b of bilder) {
    if (!b || typeof b !== 'object' || typeof b.sti !== 'string' || typeof b.data !== 'string') {
      return res.status(400).json({ ok: false, error: 'Hvert bilde maa ha sti og data som tekst.' });
    }
  }

  // samling er valgfri: eksisterende publisering (edits/bilder alene) skal
  // fungere akkurat som foer den fantes. Er den med, valideres navn og slug
  // med samme strenghet som resten av stiene i denne fila, foer noe rores.
  let samlingSti = null;
  if (harSamling) {
    if (typeof samling !== 'object' || Array.isArray(samling)) {
      return res.status(400).json({ ok: false, error: 'Ugyldig samling.' });
    }
    // trygSidenavn STRIPPER ulovlige tegn i stedet for aa avvise dem, riktig
    // for en sidenavn-parameter som uansett brukes til aa SKRIVE en fil. Her
    // maa navnet derimot stemme NOEYAKTIG med filnavnet build/doctor allerede
    // leser fra content/samlinger/. Strippet et mellomrom eller en & stille,
    // skrev vi til en annen fil enn den malen viser, og klienten fikk
    // "Publisert" mens innlegget aldri dukket opp noe sted.
    if (!slugErGyldig(samling.navn)) return res.status(400).json({ ok: false, error: 'Ugyldig navn på samlingen.' });
    const samlingNavn = samling.navn;

    // Innholdet valideres ferdig i behandle(), men det som kan avvises uten
    // GitHub, avvises her, foer noe er lest.
    const handling = samling.handling || 'ny';
    if (!['ny', 'oppdater', 'slett', 'les'].includes(handling)) {
      return res.status(400).json({ ok: false, error: 'Ukjent handling.' });
    }
    const innlegg = samling.innlegg;
    if ((handling === 'ny' || handling === 'oppdater') &&
        (!innlegg || typeof innlegg !== 'object' || Array.isArray(innlegg) || !slugErGyldig(innlegg.slug))) {
      return res.status(400).json({ ok: false, error: 'Ugyldig slug på innlegget.' });
    }
    if (handling === 'slett' && !slugErGyldig(samling.slug)) {
      return res.status(400).json({ ok: false, error: 'Ugyldig slug på innlegget.' });
    }
    samlingSti = `content/samlinger/${samlingNavn}.json`;
  }

  // Redigeringssiden henter innleggene herfra, med utkastene, saa de aldri
  // trenger aa ligge aapent i dist/.
  if (harSamling && samling.handling === 'les') {
    try {
      const naa = await lesFil({ repo, branch, token, sti: samlingSti });
      if (naa !== null && !Array.isArray(naa)) {
        return res.status(500).json({ ok: false, error: 'Samlingsfila paa GitHub er ikke en liste. Rett den manuelt paa GitHub foerst.' });
      }
      return res.status(200).json({ ok: true, innlegg: naa || [] });
    } catch (e) {
      return res.status(502).json({ ok: false, error: `Fikk ikke hentet innleggene fra GitHub. Proev igjen om litt. Teknisk: ${String(e.message || e).slice(0, 120)}` });
    }
  }

  // Base64 er 4 tegn per 3 byte, saa lengden paa strengen maa regnes om til
  // dekodede byte foer den maales mot taket. Talt paa tegn ble det reelle taket
  // en tredjedel lavere enn det satte, og teksten talte ikke med i det hele tatt.
  const byte = (s) => Math.floor(String(s).length * 3 / 4);
  const stor = bilder.reduce((sum, b) => sum + byte(b.data), 0)
    + Buffer.byteLength(JSON.stringify(edits || {}))
    + (samlingSti ? Buffer.byteLength(JSON.stringify(samling.innlegg || {})) : 0);
  if (stor > MAKS_PAYLOAD) {
    return res.status(413).json({
      ok: false,
      error: 'For mye på én gang. Publiser tekstendringene først, så bildene i en runde til.'
    });
  }

  const filer = [];
  for (const b of bilder) {
    const sti = trygStI(b.sti);
    if (!sti) {
      return res.status(400).json({
        ok: false,
        error: `Bildet kan ikke lagres: ${String(b.sti).split('/').pop().slice(0, 40)}. Tillatte format er jpg, png, webp og gif.`
      });
    }
    filer.push({ sti, innhold: String(b.data).split(',').pop(), base64: true });
  }

  // Sidens egen JSON skrives bare naar det faktisk er sideendringer. Et
  // innlegg alene skal ikke lage en tom content/<navn>.json for en side som
  // ikke finnes.
  const skrivSide = !!page && !!edits && (!harSamling || Object.keys(edits).length > 0);
  let innholdSti = null;
  if (skrivSide) {
    const sidenavn = trygSidenavn(page);
    if (!sidenavn) return res.status(400).json({ ok: false, error: 'Ugyldig sidenavn.' });
    innholdSti = `content/${sidenavn}.json`;
  }

  try {
    // Lesingen ligger INNE i try. Kaster den (403, 500, oedelagt fil), skal
    // publiseringen avbrytes, ikke fortsette med et tomt utgangspunkt som
    // ville slettet alt klienten ikke rorte i denne runden. De to filene er
    // uavhengige GitHub-kall, saa de leses parallelt: sekvensielt kostet hver
    // samlings-publisering en dobbel tur-retur til GitHub.
    const [naaRaw, naaSamling] = await Promise.all([
      innholdSti ? lesFil({ repo, branch, token, sti: innholdSti }) : Promise.resolve(null),
      samlingSti ? lesFil({ repo, branch, token, sti: samlingSti }) : Promise.resolve(null)
    ]);
    if (innholdSti) filer.push({ sti: innholdSti, innhold: JSON.stringify({ ...(naaRaw || {}), ...edits }, null, 2) });
    let resultat = null;

    if (samlingSti) {
      // lesFil() gir null naar fila ikke finnes enda (riktig: foerste innlegg
      // i en ny samling), men kaster aldri paa gyldig-JSON-som-ikke-er-en-liste
      // (f.eks. en "{}" noen har lagt inn for haand paa GitHub). Den formen
      // maa avvises her, ikke stilltiende behandles som tom: flett() sin egen
      // Array.isArray-sjekk er ment for "finnes ikke enda", ikke for "finnes,
      // men er oedelagt", og de to skal ikke gi samme utfall.
      if (naaSamling !== null && !Array.isArray(naaSamling)) {
        return res.status(500).json({
          ok: false,
          error: 'Samlingsfila paa GitHub er ikke en liste. Publiseringen ble avbrutt for aa ikke slette de andre innleggene. Rett fila manuelt paa GitHub foerst.'
        });
      }
      resultat = behandle(naaSamling, samling);
      if (resultat.feil) return res.status(resultat.feil.status).json({ ok: false, error: resultat.feil.melding });
      filer.push({ sti: samlingSti, innhold: JSON.stringify(resultat.liste, null, 2) });
    }

    const HANDLING = { ny: 'nytt innlegg', oppdater: 'endret', slett: 'slettet' };
    const { sha } = await commitFiler({
      repo, branch, token,
      melding: resultat
        ? `${samling.navn}: ${HANDLING[samling.handling || 'ny']} ${resultat.slug}${bilder.length ? ` og ${bilder.length} bilde(r)` : ''} (admin)`
        : `Innhold: ${page}${bilder.length ? ` og ${bilder.length} bilde(r)` : ''} (admin)`,
      filer
    });
    return res.status(200).json({
      ok: true,
      sha,
      slug: resultat ? resultat.slug : undefined,
      // Tid fra push til endringen er ute. Standardverdien er et anslag.
      // Kjør `oppskalert-admin tid` paa prosjektet og sett den maalte verdien
      // i ADMIN_REBUILD_MS. En nedtelling som gaar ut foer siden er klar leser
      // som en feil, og klienten trykker Publiser en gang til.
      rebuildMs: Number(process.env.ADMIN_REBUILD_MS) || 50000,
      note: 'Committet. Vercel bygger og deployer.'
    });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: `Publiseringen naadde ikke fram til GitHub. Lukk ikke fanen: endringene dine ligger fortsatt paa siden, proev Publiser igjen om litt. Teknisk: ${String(e.message || e).slice(0, 120)}`
    });
  }
}
