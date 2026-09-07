# `oppskalert-admin kobler`: implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Én kommando som kobler en ferdig kundeside til admin-panelet, slik at de fire miljøvariablene settes riktig uten at noen limer inn i fire felter i et nettgrensesnitt.

**Architecture:** En ny underkommando i den eksisterende CLI-en. Den leser det den kan lese selv, ber om det ene den ikke kan lage, og setter alt i Vercel via `vercel`-CLI-en som allerede er innlogget. Ingen ny avhengighet, ingen ny tjeneste.

**Tech Stack:** Node 18+, ESM, `node:child_process` mot `vercel` og `git`, `node:crypto` for PIN. `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-06-oppskalert-admin-design.md`, seksjon 4.3 og 6.

## Hva som kan automatiseres, og hva som ikke kan

Undersøkt 2026-09-07: **GitHub har ikke noe endepunkt for å lage et fine-grained tilgangstoken.** `gh api /user/personal-access-tokens` svarer 404. Det er et bevisst valg fra GitHub, ikke en mangel å omgå.

De to veiene rundt er begge dårligere sikkerhet:

- **Gjenbruk av det personlige tokenet** (`gh auth token`) gir hver kundeside skrivetilgang til alt kontoen eier. Lekker én side, ryker alle.
- **En delt GitHub-app** kan lage tokens automatisk, men appens privatnøkkel må da ligge i hver kundes Vercel-prosjekt. Lekker én, kan angriperen lage tokens for samtlige.

Et fine-grained token per kundeside, laget for hånd, begrenser skaden ved lekkasje til én side. Det er riktig sikkerhetsvalg, og det er derfor det ene manuelle steget blir stående.

**Tre av fire settes automatisk. Det fjerde blir ett trykk og én liming.**

## Global Constraints

- ESM, `.mjs`. Ingen nye avhengigheter.
- **Tokenet skal aldri skrives til disk, aldri logges, aldri stå på en kommandolinje, og aldri havne i en feilmelding.** `vercel env add` leser fra stdin når `--value` mangler. `--value` ville lagt det i `ps` og i shell-historikken, og skal ikke brukes for tokenet.
- **Ingen tankestrek (—)** noe sted. `doctor` fanger det.
- All brukervendt tekst norsk.
- Kommandoen endrer et levende Vercel-prosjekt og pusher commits. **Den skal vise hva den vil gjøre og be om bekreftelse før den gjør noe.**
- Commit-meldinger avsluttes med `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Denne planen gir kontrakt og tester, ikke ferdig kode

Samme grep som dekningskontrollen. Motorplanen inneholdt ferdig implementasjon, og seks fikserunder gikk med til bugs jeg selv hadde skrevet inn. Testene under er fasit. Er en test feil, skal implementøren si fra i stedet for å tilpasse koden til den.

## Filstruktur

| Fil | Ansvar |
|---|---|
| `bin/_kobler.mjs` | selve flyten, som ren logikk med injiserte sideeffekter |
| `bin/_skall.mjs` | tynn innpakning rundt `git`, `vercel` og `open`, det eneste som rører omverdenen |
| `bin/oppskalert-admin.mjs` | ny underkommando `kobler` |

Skillet er poenget: `_kobler.mjs` tar imot et objekt med `kjor`, `spor`, `skriv` og `naa`, så hele flyten kan testes uten å røre nett, Vercel eller git.

---

### Task 1: `bin/_skall.mjs`, det som rører omverdenen

**Files:** Create `bin/_skall.mjs`, `test/skall.test.mjs`

**Produces:**
- `lagPin() => string`, seks siffer, fra `node:crypto`. Aldri `Math.random`.
- `lesRepo(kjor) => 'eier/repo' | null`, fra `git remote get-url origin`. Skal tåle både `https://github.com/eier/repo.git` og `git@github.com:eier/repo.git`.
- `lesToken(lesLinjeSkjult) => Promise<string>`, leser fra stdin uten å ekko tegnene.
- `settEnv(kjor, navn, verdi, sensitiv) => void`, kaller `vercel env add <navn> production --force --yes`, og sender `verdi` på **stdin**. Aldri `--value`.

- [ ] **Steg 1: skriv testene**

```js
// test/skall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagPin, lesRepo, settEnv } from '../bin/_skall.mjs';

test('pin er seks siffer', () => {
  for (let i = 0; i < 200; i++) assert.match(lagPin(), /^\d{6}$/);
});

test('pin er ikke alltid den samme', () => {
  const sett = new Set();
  for (let i = 0; i < 200; i++) sett.add(lagPin());
  assert.ok(sett.size > 150, `for lite spredning: ${sett.size} unike av 200`);
});

test('leser repo fra https-remote', () => {
  assert.equal(lesRepo(() => 'https://github.com/lobitomaldito/kundeside.git\n'), 'lobitomaldito/kundeside');
});

test('leser repo fra ssh-remote', () => {
  assert.equal(lesRepo(() => 'git@github.com:lobitomaldito/kundeside.git\n'), 'lobitomaldito/kundeside');
});

test('leser repo uten .git-endelse', () => {
  assert.equal(lesRepo(() => 'https://github.com/a/b\n'), 'a/b');
});

test('gir null naar det ikke finnes noen remote', () => {
  assert.equal(lesRepo(() => { throw new Error('no remote'); }), null);
});

test('settEnv sender verdien paa stdin og aldri som argument', () => {
  let sett;
  settEnv((cmd, args, opt) => { sett = { cmd, args, opt }; return ''; }, 'GITHUB_TOKEN', 'hemmelig', true);
  assert.equal(sett.cmd, 'vercel');
  assert.ok(sett.args.includes('env') && sett.args.includes('add') && sett.args.includes('GITHUB_TOKEN'));
  assert.ok(sett.args.includes('--force'));
  assert.equal(sett.args.some((a) => String(a).includes('hemmelig')), false, 'verdien laa paa kommandolinja');
  assert.equal(sett.opt.input, 'hemmelig');
});

test('sensitiv verdi merkes sensitiv', () => {
  let sett;
  settEnv((c, a) => { sett = a; return ''; }, 'GITHUB_TOKEN', 'x', true);
  assert.ok(sett.includes('--sensitive'));
});
```

- [ ] **Steg 2:** kjør, se dem feile. **Steg 3:** skriv fila. **Steg 4:** grønt. **Steg 5:** commit.

---

### Task 2: `bin/_kobler.mjs`, flyten

**Files:** Create `bin/_kobler.mjs`, `test/kobler.test.mjs`

**Consumes:** alt fra Task 1.

**Produces:** `kobler(io) => Promise<{ pin, repo, satt: string[], byggetidMs }>`

`io` er alle sideeffektene, injisert:

```
io = { kjor, spor, skriv, aapne, naa, lesToken, rot }
```

- `kjor(cmd, args, opt)` kjører et program
- `spor(sporsmal) => Promise<boolean>` er bekreftelsen
- `skriv(linje)` skriver til skjermen
- `aapne(url)` åpner nettleseren
- `naa()` gir tid i millisekunder
- `lesToken()` leser tokenet skjult
- `rot` er prosjektmappa

**Flyten, i rekkefølge:**

1. Les repo. Finnes ingen remote, avbryt med en norsk setning om at prosjektet må ha en GitHub-remote først.
2. Lag PIN.
3. **Vis hva som vil skje** og spør om bekreftelse. Nei betyr avbryt uten å ha gjort noe.
4. Skriv ut hvilke rettigheter tokenet trenger (repository: dette repoet, permission: Contents = Read and write), og åpne `https://github.com/settings/personal-access-tokens/new`.
5. Les tokenet skjult.
6. Sett `ADMIN_PIN`, `GITHUB_REPO`, `GITHUB_TOKEN` i Vercel. Tokenet som sensitivt.
7. Mål byggetiden (Task 3), og sett `ADMIN_REBUILD_MS`.
8. Skriv PIN-en tydelig, én gang, med beskjed om at den skal videre til kunden.

**Krav testene håndhever:**
- Ingenting settes før bekreftelsen er gitt.
- Tokenet forekommer aldri i noe som sendes til `skriv`.
- Et tomt token avbryter med en forklaring, i stedet for å sette en tom variabel.
- Feiler `vercel env add`, stopper flyten der og sier hvilken variabel som feilet. De som alt er satt, nevnes, så du vet hvor du er.

- [ ] **Steg 1: skriv testene**

```js
// test/kobler.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kobler } from '../bin/_kobler.mjs';

function lagIo(overstyr = {}) {
  const io = {
    skrevet: [], kjort: [], aapnet: [],
    kjor(cmd, args, opt) {
      io.kjort.push({ cmd, args, opt });
      if (cmd === 'git') return 'https://github.com/eier/kundeside.git\n';
      return '';
    },
    spor: async () => true,
    skriv: (l) => io.skrevet.push(String(l)),
    aapne: (u) => io.aapnet.push(u),
    naa: (() => { let t = 0; return () => (t += 1000); })(),
    lesToken: async () => 'github_pat_HEMMELIG',
    rot: '/tmp/x',
    malByggetid: async () => 48000,
    ...overstyr
  };
  return io;
}

test('setter de fire variablene', async () => {
  const io = lagIo();
  const res = await kobler(io);
  assert.deepEqual(res.satt.sort(), ['ADMIN_PIN', 'ADMIN_REBUILD_MS', 'GITHUB_REPO', 'GITHUB_TOKEN']);
  assert.equal(res.repo, 'eier/kundeside');
  assert.match(res.pin, /^\d{6}$/);
});

test('tokenet lekker aldri til skjermen', async () => {
  const io = lagIo();
  await kobler(io);
  assert.equal(io.skrevet.some((l) => l.includes('github_pat_HEMMELIG')), false);
});

test('tokenet ligger aldri paa en kommandolinje', async () => {
  const io = lagIo();
  await kobler(io);
  for (const k of io.kjort) {
    assert.equal((k.args || []).some((a) => String(a).includes('github_pat_HEMMELIG')), false);
  }
});

test('nei paa bekreftelsen setter ingenting', async () => {
  const io = lagIo({ spor: async () => false });
  const res = await kobler(io);
  assert.deepEqual(res.satt, []);
  assert.equal(io.kjort.some((k) => k.cmd === 'vercel'), false);
});

test('uten remote avbrytes det med en forklaring', async () => {
  const io = lagIo({ kjor: () => { throw new Error('no remote'); } });
  await assert.rejects(() => kobler(io), /remote/i);
});

test('tomt token avbryter i stedet for aa sette tomt', async () => {
  const io = lagIo({ lesToken: async () => '   ' });
  await assert.rejects(() => kobler(io), /token/i);
  assert.equal(io.kjort.some((k) => k.args?.includes('GITHUB_TOKEN')), false);
});

test('pin-en skrives ut til slutt', async () => {
  const io = lagIo();
  const res = await kobler(io);
  assert.ok(io.skrevet.some((l) => l.includes(res.pin)));
});

test('github-siden aapnes med rettighetene forklart foerst', async () => {
  const io = lagIo();
  await kobler(io);
  assert.equal(io.aapnet.length, 1);
  assert.match(io.aapnet[0], /github\.com\/settings\/personal-access-tokens/);
  assert.ok(io.skrevet.some((l) => /Contents/i.test(l)));
});

test('en feilende env add stopper flyten og sier hvilken', async () => {
  const io = lagIo({
    kjor(cmd, args) {
      if (cmd === 'git') return 'https://github.com/e/k.git\n';
      if (args?.includes('GITHUB_REPO')) throw new Error('Vercel avviste');
      return '';
    }
  });
  await assert.rejects(() => kobler(io), /GITHUB_REPO/);
});
```

- [ ] **Steg 2:** kjør, se dem feile. **Steg 3:** skriv fila. **Steg 4:** grønt. **Steg 5:** commit.

---

### Task 3: måling av byggetiden

**Files:** Create `bin/_byggetid.mjs`, `test/byggetid.test.mjs`

I dag er `ADMIN_REBUILD_MS` hardkodet til 50 000. Er siden tregere, går nedtellingen ut før siden er klar, og kunden trykker Publiser en gang til fordi det ser ut som noe feilet.

**Produces:** `malByggetid(io) => Promise<number>`

**Metode:**
1. Skriv en tidsstempelfil `static/.byggemerke` med en verdi bare denne kjøringen kjenner.
2. Commit og push.
3. Poll `https://<domene>/.byggemerke` til den svarer med den nye verdien.
4. Returner millisekunder fra push til treff.

Fila blir liggende, på 20 byte. Det gjør at målingen kan gjentas senere.

**Krav:**
- Tidsavbrudd på 10 minutter. Da returneres `null` og en forklaring, i stedet for å henge.
- Pollingen skal ikke hamre: start på 5 sekunder mellom forsøk.
- Finner den ikke domenet, sier den fra og lar `ADMIN_REBUILD_MS` stå usatt heller enn å gjette.

Testene bruker en falsk `hent` som svarer med gammel verdi noen ganger før den svarer med ny, og en falsk klokke.

- [ ] Samme fem steg.

---

### Task 4: koble på CLI-en, og porten til slutt

**Files:** Modify `bin/oppskalert-admin.mjs`, `README.md`. Create `test/kobler-cli.test.mjs`.

- [ ] `oppskalert-admin kobler [sti]` bygger et ekte `io` og kaller `kobler`.
- [ ] **Til slutt kjører den `doctor` automatisk** og skriver resultatet, så du får vite om noe mangler før du sender lenken til kunden.
- [ ] Bruksteksten oppdateres: `<init|doctor|tid|dev|kobler>`.
- [ ] README får en seksjon: hva kommandoen setter, hvorfor tokenet er det ene manuelle steget, og hva du skal velge i GitHub-skjemaet.
- [ ] Test: `oppskalert-admin` uten argument nevner `kobler`.

---

## Ikke i denne planen

- **Å lage tokenet automatisk.** GitHub har ikke endepunktet, og alternativene er dårligere sikkerhet. Begrunnelsen står øverst.
- **Å opprette Vercel-prosjektet.** Kommandoen forutsetter et prosjekt som alt er lenket med `vercel link`.
- **Å sende PIN-en til kunden.** Den skrives til skjermen, resten er din vurdering.

## Rekkefølge og tid

| Task | Anslag |
|---|---|
| 1 skallet | 1 time |
| 2 flyten | 2 timer |
| 3 byggetiden | 1 time |
| 4 CLI og README | 1 time |

Til sammen en halv dag.
