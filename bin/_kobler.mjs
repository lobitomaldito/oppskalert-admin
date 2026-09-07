// bin/_kobler.mjs
//
// Ren flyt, ingen sideeffekter av seg selv: alt som roerer git, vercel,
// nettleser, stdin og klokke kommer inn via io (bygget i bin/_skall.mjs
// for den ekte kommandoen). Det gjoer at hele koblingsloepet kan testes
// uten aa endre et eneste ekte Vercel-prosjekt.
import { lagPin, lesRepo, settEnv } from './_skall.mjs';

const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

// io = { kjor, spor, skriv, aapne, naa, lesToken, rot, malByggetid }
export async function kobler(io) {
  const { kjor, spor, skriv, aapne, lesToken, malByggetid } = io;

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
  if (typeof byggetidMs === 'number') {
    settOgHusk('ADMIN_REBUILD_MS', String(byggetidMs), false);
  } else {
    skriv('ADMIN_REBUILD_MS ble ikke satt. Kjoer `oppskalert-admin tid <ms>` naar du har en maalt verdi.');
  }

  skriv('');
  skriv(`PIN-en er ${pin}. Noter den og send den videre til kunden, den vises ikke igjen her.`);

  return { pin, repo, satt, byggetidMs };
}
