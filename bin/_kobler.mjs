// bin/_kobler.mjs
//
// Ren flyt, ingen sideeffekter av seg selv: alt som roerer git, vercel,
// nettleser, stdin og klokke kommer inn via io (bygget i bin/_skall.mjs
// for den ekte kommandoen). Det gjoer at hele koblingsloepet kan testes
// uten aa endre et eneste ekte Vercel-prosjekt.
import { lagPin, lesRepo, settEnv } from './_skall.mjs';

const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

// io = { kjor, spor, skriv, aapne, naa, lesToken, rot, malByggetid, skrivAdminTid }
export async function kobler(io) {
  const { kjor, spor, skriv, aapne, lesToken, malByggetid, skrivAdminTid } = io;

  const repo = lesRepo(kjor);
  if (!repo) {
    throw new Error(
      'Fant ingen GitHub-remote paa dette prosjektet. Legg til en remote ' +
      '(git remote add origin <url>) foer du kobler siden til admin-panelet.'
    );
  }

  const pin = lagPin();

  skriv(`Dette kobler ${repo} til admin-panelet i Vercel:`);
  skriv('  - ADMIN_PIN settes til en ny, tilfeldig PIN.');
  skriv(`  - GITHUB_REPO settes til ${repo}.`);
  skriv('  - GITHUB_TOKEN settes til et token du lager om litt.');
  skriv('  - ADMIN_REBUILD_MS settes til en maalt byggetid.');
  skriv('  - For aa maale den: static/.byggemerke skrives, committes og pushes til origin.');
  skriv('  - Etterpaa: enda en tom commit og push, for aa trigge et nytt bygg der verdien gjelder.');
  skriv('  - Disse commitene blir staaende permanent i kundens git-historikk.');
  skriv('Ingenting endres foer du bekrefter.');

  const bekreftet = await spor('Vil du fortsette?');
  if (!bekreftet) {
    skriv('Avbrutt. Ingenting er endret.');
    return { pin, repo, satt: [], byggetidMs: null };
  }

  // Rekkefoelgen her er poenget: forklar rettighetene foer siden aapnes,
  // saa brukeren vet hva som skal fylles ut naar GitHub-skjemaet dukker opp.
  skriv('');
  skriv('Lag et fine-grained token paa GitHub, med disse to valgene:');
  skriv(`  - Repository access: kun ${repo}, ikke alle repoer.`);
  skriv('  - Permissions: Contents = Read and write.');
  skriv('Aapner GitHub-skjemaet for deg naa.');
  aapne(GITHUB_TOKEN_URL);

  skriv('Lim inn det ferdige tokenet her (det vises ikke mens du skriver):');
  const rått = await lesToken();
  const token = String(rått ?? '').trim();
  if (!token) {
    throw new Error(
      'Fikk et tomt token. Ingenting er satt i Vercel enda, saa det er trygt aa proeve igjen.'
    );
  }

  const satt = [];
  const settOgHusk = (navn, verdi, sensitiv) => {
    try {
      settEnv(kjor, navn, verdi, sensitiv);
      satt.push(navn);
    } catch (e) {
      const status = satt.length
        ? ` Allerede satt fra denne kjoeringen: ${satt.join(', ')}.`
        : ' Ingenting er satt fra denne kjoeringen enda.';
      throw new Error(`Kunne ikke sette ${navn} i Vercel: ${e.message}.${status}`);
    }
  };

  settOgHusk('ADMIN_PIN', pin, false);
  settOgHusk('GITHUB_REPO', repo, false);
  settOgHusk('GITHUB_TOKEN', token, true);

  skriv('');
  skriv('Maaler byggetiden. Dette tar noen minutter, la den staa.');
  let byggetidMs = null;
  try {
    byggetidMs = await malByggetid(io);
  } catch (e) {
    skriv(`Klarte ikke aa maale byggetiden: ${e.message}`);
  }

  let deployTrigget = false;
  if (typeof byggetidMs === 'number') {
    settOgHusk('ADMIN_REBUILD_MS', String(byggetidMs), false);

    // Samme fil og format som `oppskalert-admin tid <ms>` skriver for haand.
    // Uten den sier doctor at byggetiden aldri er maalt, rett etter at
    // kobler nettopp maalte den.
    try {
      skrivAdminTid(byggetidMs);
    } catch (e) {
      skriv(`Klarte ikke aa skrive admin-tid.json: ${e.message}`);
    }

    // Vercel fryser miljoevariabler inn i den enkelte deployen. ADMIN_REBUILD_MS
    // ble satt ETTER siste push (den som skjedde inne i malByggetid), saa den
    // gjelder foerst i deployen som kommer etter DENNE commiten. Uten dette
    // steget staar nedtellingen kunden ser paa fallbacken 50000 helt til noen
    // tilfeldigvis pusher noe annet, som er nettopp det ADMIN_REBUILD_MS
    // skulle fjerne behovet for.
    skriv('');
    skriv('Trigger et nytt bygg, saa ADMIN_REBUILD_MS faktisk gjelder i deployen som kjoerer.');
    try {
      kjor('git', ['commit', '--allow-empty', '-m', 'Aktiver maalt byggetid (ADMIN_REBUILD_MS)\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>'], {});
      kjor('git', ['push'], {});
      deployTrigget = true;
      skriv('Nytt bygg trigget. Siden bygges en gang til, og forst naar det bygget er ferdig gjelder den maalte byggetiden.');
    } catch (e) {
      skriv(
        `Klarte ikke aa trigge et nytt bygg (${e.message}). ADMIN_REBUILD_MS er satt i Vercel-prosjektet, ` +
        'men gjelder foerst fra neste deploy. Push noe, selv en tom endring, naar du kan.'
      );
    }
  } else {
    skriv('ADMIN_REBUILD_MS ble ikke satt. Kjoer `oppskalert-admin tid <ms>` naar du har en maalt verdi.');
  }

  skriv('');
  skriv(`PIN-en er ${pin}. Noter den og send den videre til kunden, den vises ikke igjen her.`);

  return { pin, repo, satt, byggetidMs, deployTrigget };
}
