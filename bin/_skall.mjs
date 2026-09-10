// bin/_skall.mjs
//
// Det eneste i denne kommandoen som roerer omverdenen: git, vercel, stdin.
// _kobler.mjs tar disse inn som injiserte funksjoner, saa flyten kan testes
// uten aa starte en eneste prosess.
import { randomInt } from 'node:crypto';
import { createInterface } from 'node:readline';

// Seks siffer fra node:crypto, aldri Math.random. randomInt(0, 1000000) er
// oevre grense eksklusiv, saa hoeyeste verdi er 999999.
export function lagPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Leser "eier/repo" fra git sin origin-remote. Taaler baade
// https://github.com/eier/repo.git og git@github.com:eier/repo.git, med
// eller uten .git-endelse. Finnes ingen remote (git kaster), gis null: det
// er kalleren sin jobb aa forklare hva det betyr.
export function lesRepo(kjor) {
  let raatekst;
  try {
    raatekst = kjor('git', ['remote', 'get-url', 'origin'], {});
  } catch {
    return null;
  }
  const url = String(raatekst || '').trim();
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

// ANSI CSI-sekvenser: ESC [ parametre sluttbokstav. Dekker bade
// bracketed-paste-markoerene ESC[200~/ESC[201~ og andre sekvenser som kan
// folge med en innliming (piltaster, fargekoder). Terminalen kan sende
// disse selv om dette programmet aldri ba om dem: bracketed paste er en
// modus paa selve terminalen (DECSET 2004), og skallet (f.eks. zsh sin zle)
// slaar den ofte paa som standard, uavhengig av hva node gjoer. Uten denne
// vaskingen blir markoerene en del av det limte "tokenet" og overlever
// .trim(), fordi ESC ikke regnes som whitespace.
const ANSI_CSI = /\x1b\[[0-9;]*[A-Za-z~]/g;

// Fjerner ANSI-sekvenser og C0-kontrolltegn fra en verdi lest fra
// terminalen. Brukt som siste vask i lesToken, i tillegg til vaskingen som
// skjer tegn for tegn i lesLinjeSkjult, saa ogsaa ikke-TTY-veien (pipe/fil)
// er dekket.
const C0_KONTROLLTEGN = /[\x00-\x1f\x7f]/g;

export function saneringToken(tekst) {
  return String(tekst ?? '')
    .replace(ANSI_CSI, '')
    .replace(C0_KONTROLLTEGN, '');
}

// Leser en linje fra ekte stdin uten aa ekko tegnene, saa tokenet ikke blir
// staaende synlig i terminalen.
//
// Kanter:
// - Ctrl+C midtveis: rydder opp raw mode og forkaster med en tydelig feil,
//   i stedet for aa la terminalen henge i en rar tilstand.
// - stdin er ikke en TTY (kommandoen kjoert i et skript, eller stdin er en
//   pipe/fil): setRawMode finnes ikke der, og et forsoek paa aa kalle det
//   kaster. En pipe har uansett ingen skjerm aa ekko til, saa vi leser
//   linja raatt med readline (terminal: false slaar av ekko naar det ikke
//   er en terminal likevel).
// - Bracketed-paste-markoerer (og andre ANSI-sekvenser) i en innlimt verdi:
//   vaskes bort per chunk foer tegn-loekka pakker dem inn i tokenet. Skjer
//   en sekvens midt over to chunker, fanger format- og GitHub-sjekken i
//   _kobler.mjs det som en gang, i stedet for at et korrupt token blir
//   lagret.
//
// `strommer` er injiserbar (default: den ekte process), saa denne
// sikkerhetskritiske funksjonen kan testes med en falsk stdin i stedet for
// aa roere terminalen tester kjoerer i.
export function lesLinjeSkjult(strommer = process) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = strommer;

    if (!stdin.isTTY) {
      const rl = createInterface({ input: stdin, terminal: false });
      let fikkLinje = false;
      rl.on('line', (linje) => {
        fikkLinje = true;
        rl.close();
        resolve(linje);
      });
      rl.on('close', () => {
        if (!fikkLinje) resolve('');
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let bokstaver = '';

    const rydd = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', paaData);
    };

    // I raw mode leverer stdin en innliming som EN chunk med flere tegn,
    // ikke ett tegn av gangen. En chunk kan derfor baade starte midt i
    // bufferet og baere linjeskiftet et stykke ut i seg selv, siden et
    // token limt inn fra en fil eller et editorvindu har linjeskiftet med
    // paa slutten. Vi maa derfor loepe tegn for tegn INNI hver chunk og
    // stoppe ved forste treff, i stedet for aa sammenligne hele chunken mot
    // ett enkelt tegn (det matcher aldri, og lot prompten henge for evig
    // paa en limt verdi).
    function paaData(del) {
      // Vask bort hele ANSI-sekvenser (bracketed-paste-markoerene inkludert)
      // foer tegn-loekka. \r, \n, backspace og Ctrl+C skal fortsatt virke,
      // saa de vaskes ikke bort her: de haandteres eksplisitt under.
      const renset = String(del).replace(ANSI_CSI, '');
      for (const tegn of renset) {
        if (tegn === '\u0003') {
          rydd();
          stdout.write('\n');
          reject(new Error('Avbrutt med Ctrl+C. Ingenting er satt.'));
          return;
        }
        if (tegn === '\r' || tegn === '\n') {
          rydd();
          stdout.write('\n');
          resolve(bokstaver);
          return;
        }
        if (tegn === '\u007f' || tegn === '\b') {
          bokstaver = bokstaver.slice(0, -1);
          continue;
        }
        // Et loest kontrolltegn (f.eks. en ESC som ikke var del av en hel
        // ANSI-sekvens i denne chunken, fordi terminalen delte den over to
        // chunker) skal ikke havne i tokenet. Skjer det, fanger format- og
        // GitHub-sjekken i _kobler.mjs resten.
        if (tegn.codePointAt(0) < 0x20) continue;
        bokstaver += tegn;
      }
    }

    stdin.on('data', paaData);
  });
}

// lesLinjeSkjult er injiserbar for testbarhet, defaulter til den ekte
// stdin-leseren over. saneringToken() er en siste vask her, i tillegg til
// den i lesLinjeSkjult, saa ogsaa ikke-TTY-veien (pipe/fil) er dekket.
export async function lesToken(lesLinje = lesLinjeSkjult) {
  const linje = await lesLinje();
  return saneringToken(linje).trim();
}

// Godtar bare de to kjente GitHub-token-formatene: klassisk (ghp_) og
// fine-grained (github_pat_), etterfulgt av bare bokstaver, tall og
// understrek. Fanger opp limefeil (feil verdi, halve tokenet, whitespace
// som overlevde vaskingen) foer noe i det hele tatt sendes til GitHub.
const TOKEN_FORMAT = /^(ghp_|github_pat_)[A-Za-z0-9_]+$/;

export function tokenHarGyldigFormat(token) {
  return TOKEN_FORMAT.test(String(token ?? ''));
}

// Sjekker at tokenet faktisk virker mot GitHub og har tilgang til repoet,
// foer det lagres i Vercel. `hent` er injisert fetch (samme som resten av
// io-objektet), saa dette kan testes uten aa roere det ekte GitHub-API-et.
//
// GitHub svarer 404, ikke 403, naar et token ikke har tilgang til et repo
// (for aa ikke lekke at private repoer finnes), saa den mappingen er
// bevisst. `permissions.push` er tilgjengelig paa svaret for klassiske
// tokens naar de har tilstrekkelig tilgang; fine-grained tokens har den
// ofte ikke paa dette endepunktet.
//
// ponytail: kan ikke skrive-sjekke et fine-grained token uten en muterende
// GitHub-kall. Stoler paa 200 + fravaer av permissions.push:false. Upgrade
// path om det blir et problem: en dry-run mot et endepunkt som krever
// contents:write.
export async function sjekkToken(hent, repo, token) {
  let svar;
  try {
    svar = await hent(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'oppskalert-admin-kobler'
      }
    });
  } catch (e) {
    return { ok: false, feil: `Naadde ikke GitHub for aa sjekke tokenet: ${e.message}.` };
  }

  if (svar.status === 401) {
    return { ok: false, feil: 'GitHub avviste tokenet (401 Bad credentials). Feil verdi limt inn.' };
  }
  if (svar.status === 404) {
    return {
      ok: false,
      feil: `Tokenet har ikke tilgang til ${repo} (404). Sjekk at "Repository access" i tokenet omfatter dette repoet.`
    };
  }
  if (!svar.ok) {
    return { ok: false, feil: `GitHub svarte med status ${svar.status} da tokenet ble sjekket.` };
  }

  const data = await svar.json();
  if (data && data.permissions && data.permissions.push === false) {
    return {
      ok: false,
      feil: `Tokenet mangler skriverettighet paa ${repo}. Lag et nytt token med "Contents: Read and write".`
    };
  }

  return { ok: true };
}

// vercel env add leser verdien fra stdin naar --value mangler. --value
// ville lagt verdien i ps-utskriften og i shell-historikken, og skal
// derfor aldri brukes her.
export function settEnv(kjor, navn, verdi, sensitiv) {
  const args = ['env', 'add', navn, 'production', '--force', '--yes'];
  if (sensitiv) args.push('--sensitive');
  if (!sensitiv) return kjor('vercel', args, { input: verdi });

  try {
    return kjor('vercel', args, { input: verdi });
  } catch (e) {
    // Verdien ligger ikke i argv, saa den havner bare i feilmeldingen hvis
    // vercel selv ekker den i stderr. Ingen kjent sti gjor det i dag, men
    // det er den siste lekkasjeveien, saa den vaskes bort foer feilen gaar
    // videre og eventuelt havner i en logg.
    if (verdi && typeof e.message === 'string') {
      e.message = e.message.split(verdi).join('***');
    }
    throw e;
  }
}
