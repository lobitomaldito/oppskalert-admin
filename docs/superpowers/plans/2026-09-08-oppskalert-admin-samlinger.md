# Samlinger: implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** En kundeside skal kunne ha en blogg, en aktuelt-seksjon eller en nyhetsliste der hvert innlegg er en **ekte side med egen URL**, og kunden legger dem ut fra et skjema. Uten at noen annen side merker at funksjonen finnes.

**Architecture:** En «samling» er en JSON-fil med innlegg. Bygget lager én side per innlegg fra én mal, og fyller listeseksjonen på foreldresiden. Lagringen får en modus som legger til i stedet for å overskrive. Skjemaet er en knapp i admin-baren som bare dukker opp når siden faktisk har en samling.

**Tech Stack:** Node 18+, ESM, `node-html-parser`, `node:test`. `editor/skjema.js` er ES5-nivå nettleser-JS.

**Spec:** `docs/superpowers/specs/2026-09-06-oppskalert-admin-design.md`

## Kravet som styrer alt: dette er valgfritt

**Ingen side skal ha blogg, aktuelt eller siste nytt med mindre den ber om det.** Bestemt av brukeren 2026-09-08.

Det betyr konkret:

- `oppskalert-admin init` skal **ikke** lage en samling.
- `doctor` skal være **helt taus** om samlinger i et prosjekt uten `content/samlinger/`.
- Admin-baren skal **ikke** vise «Nytt innlegg» på en side uten samling.
- Å legge til en samling senere skal ikke kreve at prosjektet bygges om.

Fravær er standardtilstanden. En regel som klager på at en frisørsalong mangler blogg er en regel som blir slått av.

## Hvorfor dette ikke bare er en `data-editable-list`

Motoren har allerede lister kunden kan utvide, og med `data-list-detail` får hvert kort et fullskjermsoverlegg. Det er nesten et innlegg. Tre ting mangler:

1. **Egen URL.** I dag lever hvert kort inne i foreldresidens HTML. Ingen egen tittel i Google, ikke i sitemap. For en kunde som skal bli funnet på det de skriver, er det den viktigste mangelen.
2. **Et skjema.** Kunder som tenker i innlegg vil ha tittel, ingress, brødtekst og bilde i et skjema, ikke klikk-i-siden.
3. **Lagring som legger til.** `api/save.js` gjør `{...naa, ...edits}`. To publiseringer i samme byggevindu overskriver hverandre. Det slår ut nettopp når noen legger ut flere innlegg etter hverandre.

## Global Constraints

- ESM, `.mjs` for Node-moduler. `editor/skjema.js` er ES5-nivå: `var`, `function`, ingen pilfunksjoner, ingen `let`, ingen `const`, ingen template literals.
- Ingen nye avhengigheter.
- **Ingen tankestrek (—)** noe sted. **Ingen «ikke X, men Y».**
- All brukervendt tekst norsk.
- Commit-meldinger avsluttes med `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Et utkast skal aldri bygges.** `_skjult` på et listeelement gir `display:none`, og teksten står lesbar i kilden. Det duger for et kort som er midlertidig av. Det duger ikke for et innlegg kunden ikke har publisert. `_kladd` skal gjøre at innlegget ikke finnes i `dist/` i det hele tatt.

## Denne planen gir kontrakt og tester, ikke ferdig kode

Samme grep som de to forrige. Testene er fasit. Er en test feil, si fra i stedet for å tilpasse koden til den.

## Formen

```
content/samlinger/aktuelt.json     innleggene, en tabell med objekter
templates/_innlegg.html            malen for ETT innlegg
```

Understrek foran malnavnet betyr at bygget ikke lager en side av den selv. Den brukes bare av samlingen.

Et innlegg:

```json
{
  "slug": "nytt-bygg-i-sentrum",
  "tittel": "Nytt bygg i sentrum",
  "ingress": "Kort oppsummering.",
  "brodtekst": "<p>Full tekst.</p>",
  "bilde": "/assets/uploads/1757-bygg.jpg",
  "dato": "2026-09-08",
  "_kladd": "1"
}
```

Bygget lager `dist/aktuelt/nytt-bygg-i-sentrum/index.html`.

## Filstruktur

| Fil | Ansvar |
|---|---|
| `build/samling.mjs` | lese samlinger, lage slug, filtrere utkast |
| `build/index.mjs` | én side per innlegg, og fylle listeseksjonen |
| `api/_samling.mjs` | flette et innlegg inn i en samling uten å overskrive |
| `api/save.js` | ta imot `samling` i kroppen |
| `editor/skjema.js` | «Nytt innlegg»-knappen og skjemaet |
| `doctor/regler/samling.mjs` | de to reglene, tause uten samling |

---

### Task 1: `build/samling.mjs`

**Files:** Create `build/samling.mjs`, `test/samling.test.mjs`

**Produces:**
- `lagSlug(tittel, brukte = []) => string`. Små bokstaver, æ→ae, ø→oe, å→aa, mellomrom og tegnsetting til bindestrek, ingen ledende eller etterfølgende bindestrek. Finnes slugen i `brukte`, legges `-2`, `-3` og så videre på.
- `lesSamlinger(rot, lesFil, finnesFil, listMappe) => { navn: innlegg[] }`. Tom `{}` når `content/samlinger/` ikke finnes. Filsystemet injiseres.
- `synlige(innlegg) => innlegg[]`. Filtrerer bort alt med sann `_kladd`.

- [ ] **Steg 1: skriv testene**

```js
// test/samling.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagSlug, lesSamlinger, synlige } from '../build/samling.mjs';

test('slug er smaa bokstaver med bindestrek', () => {
  assert.equal(lagSlug('Nytt bygg i sentrum'), 'nytt-bygg-i-sentrum');
});

test('norske tegn translittereres', () => {
  assert.equal(lagSlug('Årsmøte på Vestlandet'), 'aarsmoete-paa-vestlandet');
});

test('tegnsetting blir bindestrek, og ingen henger igjen i endene', () => {
  assert.equal(lagSlug('  Hva nå? Vi bygger!  '), 'hva-naa-vi-bygger');
});

test('kollisjon gir -2 og -3', () => {
  assert.equal(lagSlug('Nyhet', ['nyhet']), 'nyhet-2');
  assert.equal(lagSlug('Nyhet', ['nyhet', 'nyhet-2']), 'nyhet-3');
});

test('en tittel uten brukbare tegn gir en slug likevel', () => {
  assert.match(lagSlug('???'), /^[a-z0-9-]+$/);
});

test('ingen samlingsmappe gir tomt objekt', () => {
  assert.deepEqual(lesSamlinger('/x', () => '', () => false, () => []), {});
});

test('leser en samling per fil, navngitt etter filnavnet', () => {
  const s = lesSamlinger('/x',
    () => JSON.stringify([{ slug: 'a', tittel: 'A' }]),
    () => true,
    () => ['aktuelt.json']);
  assert.deepEqual(Object.keys(s), ['aktuelt']);
  assert.equal(s.aktuelt[0].tittel, 'A');
});

test('oedelagt json gir tom samling og stopper ikke bygget', () => {
  const s = lesSamlinger('/x', () => '{ ikke json', () => true, () => ['aktuelt.json']);
  assert.deepEqual(s.aktuelt, []);
});

test('utkast filtreres bort', () => {
  const i = [{ slug: 'a' }, { slug: 'b', _kladd: '1' }, { slug: 'c', _kladd: '' }];
  assert.deepEqual(synlige(i).map((x) => x.slug), ['a', 'c']);
});
```

- [ ] Steg 2: kjør, se dem feile. Steg 3: skriv fila. Steg 4: grønt. Steg 5: commit.

---

### Task 2: bygget lager én side per innlegg

**Files:** Modify `build/index.mjs`. Test i `test/build-samling.test.mjs`.

**Kontrakt:**
- Maler som starter med `_` bygges **ikke** som egne sider.
- For hver samling `navn`, for hvert **synlig** innlegg: render `templates/_innlegg.html` til `dist/<navn>/<slug>/index.html`.
- `data-innlegg="felt"` i malen får innleggets felt som innhold. `data-innlegg-image="felt"` setter `src` eller `background-image`.
- Finnes ingen samling, endres ingenting. Finnes en samling uten `_innlegg.html`, skal bygget **ikke** kaste. Det er `doctor` sin jobb å si fra.
- `build()` returnerer nå også `{ innlegg: <antall> }`.

**Tester, minst:**
- to innlegg gir to sider på riktig sti
- et utkast gir ingen fil, og teksten finnes ikke noe sted i `dist/`
- `_innlegg.html` bygges ikke som `dist/_innlegg.html`
- et prosjekt uten samlinger bygger som før, `innlegg` er 0
- en samling uten mal bygger resten og kaster ikke

- [ ] Fem steg som over.

---

### Task 3: listeseksjonen på foreldresiden

**Files:** Modify `build/index.mjs`. Test i samme fil som Task 2.

**Kontrakt:**
- `<div data-samling="aktuelt">` med et `[data-list-item]` inni fungerer som mal. Bygget rendrer ett element per synlig innlegg, nyeste `dato` først.
- `data-list-field="tittel"` og `data-list-image-field="bilde"` fungerer som i vanlige lister.
- `data-samling-lenke` på et `<a>` inne i elementet får `href="/<navn>/<slug>/"`.
- `data-samling-antall="3"` begrenser til de tre nyeste.
- **Editoren gjør seksjonen skrivebeskyttet.** Kilden er samlingen, og et innlegg redigeres der. Samme lås som `data-content-src` alt bruker.

**Tester, minst:** riktig antall elementer, riktig rekkefølge på dato, lenken peker riktig, `data-samling-antall` respekteres, utkast er ikke med, og en tom samling lar malen stå urørt.

- [ ] Fem steg.

---

### Task 4: lagring som legger til

**Files:** Create `api/_samling.mjs`. Modify `api/save.js`. Test i `test/samling-lagring.test.mjs`.

`api/save.js` gjør i dag `{...naa, ...edits}`. To publiseringer i samme byggevindu overskriver hverandre.

**Produces:** `flett(naavaerende, innlegg) => innlegg[]`
- Finnes slugen fra før, erstattes det innlegget på plassen sin.
- Finnes den ikke, legges innlegget **først** i tabellen.
- `naavaerende` som ikke er en tabell behandles som tom.

**`api/save.js`** tar imot `{ page, pin, edits, bilder, samling }` der `samling = { navn, innlegg }`. Samlingsfila leses fra GitHub, flettes, og skrives i **samme commit** som resten. `navn` valideres med samme strenghet som `trygSidenavn`. `slug` likeså.

**Tester, minst:** nytt innlegg legges først, kjent slug erstattes på plassen sin, to fletter etter hverandre beholder begge, ugyldig `navn` eller `slug` gir 400, og samlingen havner i samme commit som innholdet.

- [ ] Fem steg.

---

### Task 5: `editor/skjema.js`

**Files:** Create `editor/skjema.js`, `test/skjema.test.mjs`. Modify `build/index.mjs` om nødvendig.

**Kontrakt:**
- Fila legger en knapp «Nytt innlegg» i admin-baren **bare** når siden har minst én `[data-samling]`. Ingen samling, ingen knapp, ingen spor.
- Knappen åpner et overlegg med: tittel, ingress, brødtekst, bilde, dato, og en avkrysning «Lagre som utkast».
- Slug lages fra tittelen og vises, med mulighet til å rette den.
- Bildet går gjennom samme `prepImage`-krymping og samme utsatte opplasting som resten av motoren. Det skal reise i samme publisering.
- «Publiser innlegget» sender `{ page, pin, edits: {}, bilder, samling }` til `/api/save`.
- Overlegget lever på `<body>`, utenfor redigeringsområdet, så det overlever Angre.
- ES5-nivå.

**Tester:** statiske, som for `edit.js`. Minst: ES5-nivå, ingen tankestrek, knappen bygges bak en sjekk på `[data-samling]`, overlegget på `document.body`, og at fila havner i `dist/admin/`.

- [ ] Fem steg.

---

### Task 6: doctor, sitemap og dokumentasjon

**Files:** Create `doctor/regler/samling.mjs`. Modify `build/index.mjs`, `README.md`, `~/.claude/skills/website-intelligence-adminpanel-vercel/SKILL.md`, `~/.claude/assets/nettside-regler.md`.

**To regler, begge tause uten samling:**
- `samling-mal`, feil: prosjektet har `content/samlinger/*.json` men mangler `templates/_innlegg.html`.
- `samling-felt`, varsel: malen bruker et `data-innlegg="felt"` som ingen innlegg i samlingen har. Fanger et felt skjemaet lagrer og malen aldri viser, og motsatt.

**Sitemap:** har prosjektet en samling, skal innleggssidene med i `dist/sitemap.xml`. Finnes en `static/sitemap.xml` fra før, utvides den. Finnes den ikke, skrives en. Uten samling skal bygget ikke lage en sitemap det ikke lagde før.

**Dokumentasjon:** README får en seksjon om samlinger, med formen, malen, `_kladd`, og at funksjonen er av til den slås på. Skillet og regel 14 får to setninger hver om at muligheten finnes.

- [ ] Fem steg.

---

## Ikke i denne planen

- **Kategorier, taggen, paginering, RSS.** Kommer hvis en kunde faktisk trenger det.
- **Flere samlinger med ulik mal.** Én mal per prosjekt holder til vi ser noe annet.
- **Retting av eksisterende kundesider.** Uendret: kun nye.

## Rekkefølge og tid

| Task | Anslag |
|---|---|
| 1 slug og lesing | 2 timer |
| 2 side per innlegg | 3 timer |
| 3 listeseksjonen | 2 timer |
| 4 lagring som legger til | 3 timer |
| 5 skjemaet | 4 timer |
| 6 doctor, sitemap, docs | 2 timer |

Til sammen to dager. Task 5 er den tyngste, og den eneste som rører nettleseren.
