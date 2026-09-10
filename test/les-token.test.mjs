// test/les-token.test.mjs
//
// lesToken/lesLinjeSkjult er den sikkerhetskritiske funksjonen i hele
// `kobler`-flyten: den som leser tokenet fra stdin uten aa ekko det. Ingen
// tidligere test roerte den, den ble bare lest og resonnert om for haand.
// Disse testene bruker en falsk stdin/stdout, saa hele lese-loekka kjoeres
// ekte, uten aa roere terminalen testen selv kjoerer i.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { lesToken, lesLinjeSkjult } from '../bin/_skall.mjs';

// Minimal falsk TTY-stdin: samme metoder koden faktisk kaller
// (setRawMode/resume/pause/setEncoding/on/removeListener), men uten en
// ekte terminal bak. rawModeKall lar oss se at raw mode baade settes og
// ryddes opp.
function lagFalskTtyStdin() {
  const em = new EventEmitter();
  em.isTTY = true;
  em.rawModeKall = [];
  em.setRawMode = (v) => em.rawModeKall.push(v);
  em.resume = () => {};
  em.pause = () => {};
  em.setEncoding = () => {};
  return em;
}

function lagFalskStdout() {
  const skrevet = [];
  return { skrevet, write: (s) => skrevet.push(s) };
}

function skriv(stdin, tegn) {
  for (const t of tegn) stdin.emit('data', t);
}

test('tegnene ekkoes aldri til skjermen', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  skriv(stdin, 'github_pat_HEMMELIG');
  stdin.emit('data', '\r');
  const linje = await p;
  assert.equal(linje, 'github_pat_HEMMELIG');
  assert.equal(stdout.skrevet.some((s) => s.includes('github_pat_HEMMELIG')), false);
  // Eneste som skal ha naadd skjermen er linjeskiftet naar Enter trykkes.
  assert.deepEqual(stdout.skrevet, ['\n']);
});

test('Enter avslutter og returnerer det som er skrevet', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  skriv(stdin, 'abc');
  stdin.emit('data', '\n');
  assert.equal(await p, 'abc');
});

test('Backspace sletter forrige tegn', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  skriv(stdin, 'ab');
  stdin.emit('data', '\u007f'); // Backspace/DEL
  skriv(stdin, 'c');
  stdin.emit('data', '\r');
  assert.equal(await p, 'ac');
});

test('Backspace paa tom buffer sletter ingenting og krasjer ikke', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  stdin.emit('data', '\u007f');
  skriv(stdin, 'x');
  stdin.emit('data', '\r');
  assert.equal(await p, 'x');
});

test('Ctrl+C forkaster og rydder raw mode, i stedet for aa henge', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  skriv(stdin, 'noe');
  stdin.emit('data', '\u0003');
  await assert.rejects(() => p, /Ctrl\+C/);
  // Raw mode ble baade satt (true) og ryddet opp (false) etterpaa.
  assert.deepEqual(stdin.rawModeKall, [true, false]);
  // Data-lytteren er fjernet, saa et EventEmitter-lekkasje ikke holder
  // prosessen i live eller reagerer paa flere tegn etterpaa.
  assert.equal(stdin.listenerCount('data'), 0);
});

// Granskerens funn: raw mode leverer en innliming som EN chunk, ikke ett
// tegn av gangen. skriv()-hjelperen over emitter ett tegn per 'data', saa
// den simulerer tasting og fanget ikke dette. Disse testene emitter hele
// den limte teksten (inkludert linjeskiftet) i EN 'data'-hendelse, slik en
// ekte paste fra terminalen ville gjort.
test('en innlimt verdi med \\n i samme chunk avsluttes med en gang, ikke henger', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  stdin.emit('data', 'github_pat_HEMMELIG\n');
  assert.equal(await p, 'github_pat_HEMMELIG');
  // Raw mode ble baade satt og ryddet opp, ellers henger terminalen igjen.
  assert.deepEqual(stdin.rawModeKall, [true, false]);
  assert.equal(stdin.listenerCount('data'), 0);
});

test('en innlimt verdi med \\r i samme chunk avsluttes med en gang', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  stdin.emit('data', 'github_pat_B\r');
  assert.equal(await p, 'github_pat_B');
  assert.deepEqual(stdin.rawModeKall, [true, false]);
});

test('en chunk med flere tegn foer linjeskiftet forkaster resten av chunken etter treff', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  // Alt etter \r i samme chunk skal ignoreres, ikke limes inn i neste linje.
  stdin.emit('data', 'github_pat_A\rsoppel-etter-linjeskiftet');
  assert.equal(await p, 'github_pat_A');
});

test('ikke-TTY stdin (pipe) faller tilbake til vanlig lesing', async () => {
  const stdin = new Readable({ read() {} });
  stdin.isTTY = false;
  const p = lesLinjeSkjult({ stdin });
  stdin.push('mitt-limte-token\n');
  stdin.push(null);
  assert.equal(await p, 'mitt-limte-token');
});

test('ikke-TTY stdin uten et linjeskift gir en tom streng i stedet for aa henge', async () => {
  const stdin = new Readable({ read() {} });
  stdin.isTTY = false;
  const p = lesLinjeSkjult({ stdin });
  stdin.push(null); // lukket uten noen gang aa ha sendt en linje
  assert.equal(await p, '');
});

// lesToken selv: trimmer og bruker lesLinjeSkjult som default-leser. Disse
// kjoerer den ekte default-koblingen (lesToken -> lesLinjeSkjult) mot en
// falsk stdin, i stedet for aa mocke lesLinje bort og bare teste trim().
test('lesToken trimmer whitespace rundt det som ble lest', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesToken(() => lesLinjeSkjult({ stdin, stdout }));
  skriv(stdin, '  github_pat_x  ');
  stdin.emit('data', '\r');
  assert.equal(await p, 'github_pat_x');
});

test('lesToken over en falsk TTY-stdin ekkoer aldri tokenet', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesToken(() => lesLinjeSkjult({ stdin, stdout }));
  skriv(stdin, 'github_pat_HEMMELIG');
  stdin.emit('data', '\r');
  await p;
  assert.equal(stdout.skrevet.some((s) => s.includes('github_pat_HEMMELIG')), false);
});

test('lesToken gir tom streng, ikke krasj, naar Enter trykkes med en gang', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesToken(() => lesLinjeSkjult({ stdin, stdout }));
  stdin.emit('data', '\r');
  assert.equal(await p, '');
});

// Granskerens hypotese for 401-hendelsen 11.09.2026: terminalen hadde
// bracketed paste-modus paa (fra skallet, ikke fra dette programmet), og
// markoerene rundt en limt verdi havnet i tokenet fordi ESC ikke er
// whitespace og overlevde .trim(). Disse to testene emitterer den ekte
// byte-sekvensen en terminal sender rundt en innliming.
test('bracketed-paste-markoerer rundt en innlimt verdi havner aldri i tokenet', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesLinjeSkjult({ stdin, stdout });
  // En ekte terminal sender ESC[200~<limt tekst>ESC[201~ som en (eller
  // flere) 'data'-hendelser naar bracketed paste er paa.
  stdin.emit('data', '\x1b[200~github_pat_HEMMELIG\x1b[201~');
  stdin.emit('data', '\r');
  assert.equal(await p, 'github_pat_HEMMELIG');
});

test('lesToken over en bracketed paste gir et rent token som bestaar formatsjekken', async () => {
  const stdin = lagFalskTtyStdin();
  const stdout = lagFalskStdout();
  const p = lesToken(() => lesLinjeSkjult({ stdin, stdout }));
  stdin.emit('data', '\x1b[200~github_pat_HEMMELIG\x1b[201~\r');
  assert.equal(await p, 'github_pat_HEMMELIG');
});
