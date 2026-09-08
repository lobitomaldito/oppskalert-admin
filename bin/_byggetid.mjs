// bin/_byggetid.mjs
//
// Maaler den faktiske byggetiden paa et konkret prosjekt, i stedet for aa la
// ADMIN_REBUILD_MS staa paa den gamle, hardkodede 50 000. Et Nuxt-prosjekt
// med 286 ruter maalte 200 sekunder: en nedtelling som gaar ut foer siden er
// klar leser som en feil, og klienten trykker Publiser en gang til.
//
// Metoden: skriv en merkefil med en verdi bare denne kjoeringen kjenner,
// commit og push den, og poll det faste vercel.app-domenet til verdien
// dukker opp der. Alt som roerer git, nettverk og klokke kommer inn via io,
// saa hele loepet kan testes uten aa vente paa et ekte bygg:
//
//   io.kjor(cmd, args, opt)   kjoerer git (samme funksjon som i _kobler.mjs)
//   io.naa()                 klokke i millisekunder
//   io.hent(url)              => Promise<{ ok, text() }>, fetch-lignende
//   io.vent(ms)               => Promise<void>, pause mellom forsoek (valgfri,
//                              defaulter til en ekte setTimeout-pause)
//   io.skriv(linje)           skriver forklaringer til skjermen
//   io.rot                    prosjektmappa
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const TIDSAVBRUDD_MS = 10 * 60 * 1000; // 10 minutter, kravet i Task 3
const FORSTE_VENT_MS = 5000; // start paa 5 sekunder mellom forsoek, skal ikke hamre
const STORSTE_VENT_MS = 30_000; // tak paa ventetiden, ellers polles det sjeldnere og sjeldnere mot slutten

const MERKE_RELATIV = join('static', '.byggemerke');

// Leser prosjektets faste vercel.app-domene fra .vercel/project.json, skrevet
// av `vercel link`. Det domenet peker alltid paa siste production-deploy,
// ogsaa naar prosjektet i tillegg har et eget kundedomene, saa det er trygt
// aa polle det uten aa vente paa DNS eller SSL paa et nytt kundedomene.
export function finnDomene(rot) {
  const sti = join(rot, '.vercel', 'project.json');
  if (!existsSync(sti)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(sti, 'utf8'));
  } catch {
    return null;
  }
  const navn = data && data.projectName;
  return navn ? `${navn}.vercel.app` : null;
}

const ektVent = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function malByggetid(io) {
  const { kjor, naa, hent, rot, skriv } = io;
  const vent = io.vent || ektVent;

  const domene = finnDomene(rot);
  if (!domene) {
    skriv(
      'Fant ikke prosjektets domene: ingen .vercel/project.json med et ' +
      'prosjektnavn. Er prosjektet lenket med `vercel link`? ' +
      'ADMIN_REBUILD_MS er ikke satt, det er tryggere enn aa gjette.'
    );
    return null;
  }

  // 18 hex-tegn fra 9 tilfeldige byte, pluss linjeskift: 19 byte paa disk,
  // saa liten at den ikke er verdt aa rydde bort etterpaa.
  const verdi = randomBytes(9).toString('hex');
  const merkeFull = join(rot, MERKE_RELATIV);
  mkdirSync(join(merkeFull, '..'), { recursive: true });
  writeFileSync(merkeFull, `${verdi}\n`);

  kjor('git', ['add', MERKE_RELATIV], {});
  kjor('git', ['commit', '-m', 'Mal byggetid\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>'], {});
  kjor('git', ['push'], {});

  const url = `https://${domene}/.byggemerke`;
  const start = naa();
  let ventetid = FORSTE_VENT_MS;

  for (;;) {
    let treff = false;
    try {
      const svar = await hent(url);
      if (svar && svar.ok !== false) {
        const tekst = typeof svar.text === 'function' ? await svar.text() : String(svar);
        treff = tekst.trim() === verdi;
      }
    } catch {
      // Nettverksfeil underveis er ikke fatalt her, siden en side som enda
      // ikke er bygget ferdig ogsaa kan svare med feil eller tidsavbrudd.
      // Vi proever igjen til tidsavbruddet paa 10 minutter naas.
    }

    if (treff) return naa() - start;

    if (naa() - start >= TIDSAVBRUDD_MS) {
      skriv(
        `Ga opp aa maale byggetiden etter 10 minutter. ${domene} viste ` +
        'enda ikke den nye verdien. ADMIN_REBUILD_MS er ikke satt. ' +
        'Kjoer `oppskalert-admin tid <ms>` naar du har en maalt verdi for haand.'
      );
      return null;
    }

    await vent(ventetid);
    ventetid = Math.min(ventetid * 2, STORSTE_VENT_MS);
  }
}
