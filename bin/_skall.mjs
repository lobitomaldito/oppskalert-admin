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

// Leser en linje fra ekte stdin uten aa ekko tegnene, saa tokenet ikke blir
// staaende synlig i terminalen.
//
// To kanter:
// - Ctrl+C midtveis: rydder opp raw mode og forkaster med en tydelig feil,
//   i stedet for aa la terminalen henge i en rar tilstand.
// - stdin er ikke en TTY (kommandoen kjoert i et skript, eller stdin er en
//   pipe/fil): setRawMode finnes ikke der, og et forsoek paa aa kalle det
//   kaster. En pipe har uansett ingen skjerm aa ekko til, saa vi leser
//   linja raatt med readline (terminal: false slaar av ekko naar det ikke
//   er en terminal likevel).
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
      for (const tegn of String(del)) {
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
        bokstaver += tegn;
      }
    }

    stdin.on('data', paaData);
  });
}

// lesLinjeSkjult er injiserbar for testbarhet, defaulter til den ekte
// stdin-leseren over.
export async function lesToken(lesLinje = lesLinjeSkjult) {
  const linje = await lesLinje();
  return String(linje ?? '').trim();
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
