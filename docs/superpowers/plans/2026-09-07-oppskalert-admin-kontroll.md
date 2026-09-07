# Dekningskontroll: implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `oppskalert-admin doctor` skal si nøyaktig hvilke felter på en ny side som mangler redigeringsmarkør, kalibrert mot hva som faktisk har vært redigerbart før, slik at ingen side kan leveres med glemte hull.

**Architecture:** Fire nye regler i det eksisterende regelsettet, pluss de to funksjonene pakken mangler. Ingen ny arkitektur: reglene er rene funksjoner over `{ rot, filer }` som resten, og de to funksjonene er filer motoren allerede refererer.

**Tech Stack:** Node 18+, ESM, `node-html-parser`, `node:test`. Alt finnes.

**Spec:** `docs/superpowers/specs/2026-09-06-oppskalert-admin-design.md`, seksjon 6.

## Hvorfor dette og ikke et seksjonsbibliotek

Den opprinnelige planen var 13 ferdig instrumenterte seksjoner. Måling på Tiqri, tre demoer bygget samme uke, forkastet den: demoene bruker 13 ulike seksjonstyper og **9 av dem passer ikke i noe bibliotek** (`collage`, `tallinje`, `band`, `oppslag`, `konsept-video`, `modell`, `kunder`, `tillit`, `aksentflate`).

Alle tretten koker likevel ned til tre ting motoren allerede kjenner: en tekst som kan endres, et bilde som kan byttes, en liste som kan utvides. Et bibliotek ville lagt et navnelag oppå som ikke generaliserer. En kontroll leser i stedet det som er bygget og sier hva som mangler.

## Kalibrering, målt

De fire instrumenterte sidene (Schei, Alphaneg, koflaath, Melanie Dahl), 22 maler,
bladnoder med tekst inne i `<main>`, elementer som allerede dekkes av en
`data-edit`-forelder eller en listemal holdt utenfor:

| Tagg | Dekket | Udekket | Dekning |
|---|---|---|---|
| `h3` | 55 | 0 | 100 % |
| `blockquote` | 7 | 0 | 100 % |
| `p` | 201 | 38 | 84 % |
| `h2` | 59 | 14 | 81 % |
| `h1` | 10 | 8 | 56 % |
| `li` | 25 | 145 | 15 % |
| `h4` | 4 | 27 | 13 % |
| `dt` / `dd` | 1 | 9 | 10 % |

**Feil** gis for udekket `p`, `h1`, `h2`, `h3`, `blockquote`. **Varsel** for `li`
og `h4`. `dt`/`dd` er utenfor, utvalget er for lite til å si noe.

Kravet fra brukeren, ordrett: det som skal kunne redigeres fremover er i hovedsak
det som har kunnet redigeres før. Tabellen over **er** den definisjonen.

## Global Constraints

- ESM, `.mjs` for Node-moduler. Ingen nye avhengigheter.
- Regler er rene funksjoner over `{ rot, filer }`, uten filsystem eller nett. `perLinje` ligger i `doctor/_hjelpere.mjs`, aldri i `index.mjs` (sirkulær import).
- Hver regel: `{ navn, alvor: 'feil'|'varsel', sjekk(prosjekt) => Funn[] }`, `Funn` er `{ fil, linje, melding }`.
- **Ingen tankestrek (—)** noe sted. **Ingen «ikke X, men Y».**
- All brukervendt tekst norsk og forklarende. En melding skal si hvilken fil, hvilket element, og hva som skal gjøres.
- `editor/detail-modal.js` er nettleser-JS på **ES5-nivå**, som `editor/edit.js`.
- Commit-meldinger avsluttes med `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Endring i hvordan denne planen er skrevet

Motorplanen inneholdt ferdig implementasjonskode. Det gjorde implementørene til
avskrivere som ikke kunne fange feilene mine, og seks fikserunder gikk med til
bugs jeg selv hadde skrevet inn i planen.

Denne planen gir **kontrakt og tester**, og lar implementøren skrive koden. Testene
er fasit. Er en test feil, skal implementøren si fra i stedet for å tilpasse koden
til den.

## Filstruktur

| Fil | Ansvar |
|---|---|
| `doctor/_html.mjs` | delt HTML-hjelper: parse en mal, finn bladnoder, avgjør om et element allerede dekkes |
| `doctor/regler/dekning-tekst.mjs` | udekket tekst som historisk har vært redigerbar |
| `doctor/regler/dekning-bilde.mjs` | `<img>` og `background-image` uten markør |
| `doctor/regler/gjentatt-gruppe.mjs` | to eller flere like søsken som burde vært en liste |
| `editor/detail-modal.js` | «Les mer»-overlegg for `data-list-detail` |
| `editor/kollaps.js` | «Se N til» for `data-collapsible` |

`data-edit-ignore` er avmeldingsmarkøren. Den håndteres i `_html.mjs` og gjelder
alle tre dekningsreglene.

---

### Task 1: `doctor/_html.mjs`, den delte HTML-hjelperen

**Files:** Create `doctor/_html.mjs`, `test/html-hjelper.test.mjs`

**Produces:**
- `bladnoder(html: string) => [{ tagg, tekst, linje, dekket: bool, ignorert: bool }]`
  - Kun elementer inne i `<main>` (hele dokumentet hvis `<main>` mangler).
  - Kun elementer uten barn av samme slag (bladnoder), med minst 3 tegn synlig tekst.
  - `dekket` er sant når elementet selv eller en forelder har `data-edit`, `data-list-field`, `data-list-item`, `data-editable-list` eller `data-content-src`.
  - `ignorert` er sant når elementet selv eller en forelder har `data-edit-ignore`.
  - `linje` er 1-indeksert linjenummer i kilden.
- `bilder(html: string) => [{ kilde, linje, dekket, ignorert }]`
  - Både `<img>` og elementer med `background-image` i `style`.
  - `dekket` når elementet har `data-edit-image` eller `data-list-image-field`, eller ligger i en listemal.

- [ ] **Steg 1: skriv testene**

```js
// test/html-hjelper.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bladnoder, bilder } from '../doctor/_html.mjs';

test('finner en udekket p inne i main', () => {
  const n = bladnoder('<main><p>Nok tekst her</p></main>');
  assert.equal(n.length, 1);
  assert.deepEqual([n[0].tagg, n[0].dekket, n[0].ignorert], ['p', false, false]);
});

test('data-edit paa elementet selv gjor det dekket', () => {
  assert.equal(bladnoder('<main><p data-edit="a.b">Tekst her</p></main>')[0].dekket, true);
});

test('data-edit paa en forelder dekker barnet', () => {
  assert.equal(bladnoder('<main><div data-edit="a.b"><p>Tekst her</p></div></main>')[0].dekket, true);
});

test('et element i en listemal er dekket', () => {
  const h = '<main><ul data-editable-list="k"><li data-list-item><p>Tekst her</p></li></ul></main>';
  assert.ok(bladnoder(h).every((n) => n.dekket));
});

test('data-edit-ignore paa en forelder merker barnet som ignorert', () => {
  const n = bladnoder('<main><section data-edit-ignore><p>Personvern her</p></section></main>')[0];
  assert.deepEqual([n.dekket, n.ignorert], [false, true]);
});

test('elementer utenfor main teller ikke', () => {
  assert.equal(bladnoder('<header><p>Meny her</p></header><main><p>Innhold her</p></main>').length, 1);
});

test('uten main leses hele dokumentet', () => {
  assert.equal(bladnoder('<body><p>Tekst her</p></body>').length, 1);
});

test('bare bladnoder, en div med en p inni teller som p', () => {
  const n = bladnoder('<main><div><p>Tekst her</p></div></main>');
  assert.deepEqual(n.map((x) => x.tagg), ['p']);
});

test('tom eller altfor kort tekst hoppes over', () => {
  assert.equal(bladnoder('<main><p></p><p>  </p><p>ok</p></main>').length, 0);
});

test('linjenummeret peker paa elementet', () => {
  assert.equal(bladnoder('<main>\n\n<p>Tekst her</p>\n</main>')[0].linje, 3);
});

test('finner img og background-image, og ser markorene', () => {
  const b = bilder('<main><img src="/a.jpg"><div style="background-image:url(/b.jpg)"></div><img data-edit-image="k" src="/c.jpg"></main>');
  assert.equal(b.length, 3);
  assert.deepEqual(b.map((x) => x.dekket), [false, false, true]);
});

test('bilde i en listemal er dekket', () => {
  const h = '<main><ul data-editable-list="k"><li data-list-item><img src="/a.jpg"></li></ul></main>';
  assert.equal(bilder(h)[0].dekket, true);
});
```

- [ ] **Steg 2:** kjør, se dem feile.
- [ ] **Steg 3:** skriv `doctor/_html.mjs` til testene passerer. Bruk `node-html-parser`. Linjenummer får du ved å telle nylinjer i kilden fram til elementets `range`, eller ved å søke opp elementets `outerHTML`. Velg den som er robust for gjentatt markup, og si i rapporten hvilken du valgte og hvorfor.
- [ ] **Steg 4:** kjør til grønt.
- [ ] **Steg 5:** commit.

---

### Task 2: de tre dekningsreglene

**Files:** Create `doctor/regler/dekning-tekst.mjs`, `doctor/regler/dekning-bilde.mjs`, `doctor/regler/gjentatt-gruppe.mjs`, `test/dekning.test.mjs`. Modify `doctor/index.mjs`.

**Consumes:** `bladnoder`, `bilder` fra Task 1.

**Kontrakt:**

- `dekning-tekst`, alvor `feil`: melder hver udekket, ikke-ignorert bladnode med tagg `p`, `h1`, `h2`, `h3` eller `blockquote`. Melder `li` og `h4` **ikke** (egen regel under, som varsel).
- `dekning-liste`, alvor `varsel`, i samme fil som `dekning-tekst`: melder udekket `li` og `h4`. Egen eksport `dekningListe`.
- `dekning-bilde`, alvor `feil`: melder hvert udekket, ikke-ignorert bilde.
- `gjentatt-gruppe`, alvor `varsel`: melder når tre eller flere søsken deler tagg og klasseattributt, ingen av dem ligger i en `data-editable-list`, og ingen er ignorert.

Terskelen er tre og ikke to, fordi to like søsken er et vanlig layoutgrep (to kolonner) mens tre er et mønster.

- [ ] **Steg 1: skriv testene**

```js
// test/dekning.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import tekst, { dekningListe } from '../doctor/regler/dekning-tekst.mjs';
import bilde from '../doctor/regler/dekning-bilde.mjs';
import gruppe from '../doctor/regler/gjentatt-gruppe.mjs';

const p = (html) => ({ rot: '/x', filer: [{ sti: 'templates/index.html', tekst: html }] });

test('udekket p, h1, h2, h3 og blockquote er feil', () => {
  const funn = tekst.sjekk(p('<main><h1>En tittel</h1><h2>To</h2><h3>Tre</h3><p>Fire her</p><blockquote>Fem her</blockquote></main>'));
  assert.equal(tekst.alvor, 'feil');
  assert.equal(funn.length, 5);
});

test('meldingen navngir tagg og foreslaar markoren', () => {
  const f = tekst.sjekk(p('<main><h2>En tittel</h2></main>'))[0];
  assert.match(f.melding, /h2/);
  assert.match(f.melding, /data-edit/);
});

test('dekket tekst gir ingen funn', () => {
  assert.deepEqual(tekst.sjekk(p('<main><p data-edit="a.b">Tekst her</p></main>')), []);
});

test('data-edit-ignore demper regelen', () => {
  assert.deepEqual(tekst.sjekk(p('<main><section data-edit-ignore><p>Personvern her</p></section></main>')), []);
});

test('li og h4 er varsel og ikke feil', () => {
  assert.equal(dekningListe.alvor, 'varsel');
  assert.equal(tekst.sjekk(p('<main><ul><li>Et punkt her</li></ul><h4>En undertittel</h4></main>')).length, 0);
  assert.equal(dekningListe.sjekk(p('<main><ul><li>Et punkt her</li></ul><h4>En undertittel</h4></main>')).length, 2);
});

test('udekket bilde er feil, dekket er greit', () => {
  assert.equal(bilde.alvor, 'feil');
  assert.equal(bilde.sjekk(p('<main><img src="/a.jpg"></main>')).length, 1);
  assert.deepEqual(bilde.sjekk(p('<main><img data-edit-image="k" src="/a.jpg"></main>')), []);
});

test('bakgrunnsbilde teller som bilde', () => {
  assert.equal(bilde.sjekk(p('<main><div style="background-image:url(/a.jpg)"></div></main>')).length, 1);
});

test('tre like soesken uten liste er et varsel', () => {
  const h = '<main><div class="kort"><h3 data-edit="a">A</h3></div><div class="kort"><h3 data-edit="b">B</h3></div><div class="kort"><h3 data-edit="c">C</h3></div></main>';
  assert.equal(gruppe.alvor, 'varsel');
  assert.equal(gruppe.sjekk(p(h)).length, 1);
  assert.match(gruppe.sjekk(p(h))[0].melding, /data-editable-list/);
});

test('to like soesken er et layoutgrep og meldes ikke', () => {
  const h = '<main><div class="kol"><p data-edit="a">A</p></div><div class="kol"><p data-edit="b">B</p></div></main>';
  assert.deepEqual(gruppe.sjekk(p(h)), []);
});

test('tre soesken som allerede er en liste meldes ikke', () => {
  const h = '<main><ul data-editable-list="k"><li data-list-item class="k">A</li><li data-list-item class="k">B</li><li data-list-item class="k">C</li></ul></main>';
  assert.deepEqual(gruppe.sjekk(p(h)), []);
});

test('reglene ser bare paa maler under templates/', () => {
  const utenfor = { rot: '/x', filer: [{ sti: 'dist/index.html', tekst: '<main><p>Tekst her</p></main>' }] };
  assert.deepEqual(tekst.sjekk(utenfor), []);
  assert.deepEqual(bilde.sjekk(utenfor), []);
});
```

- [ ] **Steg 2:** kjør, se dem feile.
- [ ] **Steg 3:** skriv de tre reglene. Registrer alle fire eksportene (`tekst`, `dekningListe`, `bilde`, `gruppe`) i `STANDARDREGLER` i `doctor/index.mjs`.
- [ ] **Steg 4:** kjør hele suiten til grønt.
- [ ] **Steg 5:** kjør `node bin/oppskalert-admin.mjs doctor .` på pakkens eget repo. Det har ingen `templates/`, så de nye reglene skal tie. Bekreft exit 0.
- [ ] **Steg 6:** commit.

---

### Task 3: kalibrer mot ekte sider

Dette er prøven på at tersklene stemmer med virkeligheten, ikke bare med testene.

**Files:** ingen nye. Rapport.

- [ ] **Steg 1:** kjør de nye reglene mot malene i disse fire, som alle er instrumentert for hånd og regnes som fasit:
  - `~/Desktop/Antigravity/Nettsider/Schei Restaurering/templates/`
  - `~/Desktop/Antigravity/Nettsider/Alphaneg/templates/`
  - `~/Desktop/Antigravity/Nettsider/koflaath/templates/`
  - `~/Desktop/Antigravity/Nettsider/Melanie Dahl/templates/`

- [ ] **Steg 2:** for hver: hvor mange **feil** melder `dekning-tekst` og `dekning-bilde`?

Forventning: lavt tall. Disse sidene er instrumentert av et menneske som gjorde jobben. Melder regelen 40 feil på en ferdig side, er terskelen for streng og skal justeres, ikke siden.

- [ ] **Steg 3:** **les hvert eneste treff.** For hvert: er dette et felt kunden burde kunne redigere (ekte funn) eller noe som med rette står fast (falsk positiv)?

- [ ] **Steg 4:** rapporter i tabell: side, antall feil, antall ekte, antall falske, og hva de falske hadde til felles.

- [ ] **Steg 5:** er andelen falske positive over en tredjedel, foreslå en justert terskel og si hvorfor. **Ikke** endre reglene uten å legge fram tallene først.

- [ ] **Steg 6:** kjør også mot `~/Desktop/Antigravity/Nettsider/Tiqri/site/a-marked/index.html` og `c-folk/index.html`, som **ikke** er instrumentert. Der skal regelen melde mye. Det tallet er verdien av kontrollen: så mange hull ville blitt igjen om siden ble levert i dag.

---

### Task 4: `editor/detail-modal.js`

Pakken refererer `data-list-detail` i motoren, men leverer ikke fila som åpner overlegget. Schei bruker det seks steder. Uten den er et kort merket som «har mer innhold» uten at noe skjer ved klikk.

**Files:** Create `editor/detail-modal.js`, `test/detail-modal.test.mjs`. Modify `build/index.mjs`.

**Kilde:** `~/Desktop/Antigravity/Nettsider/Schei Restaurering/static/detail-modal.js` er en fungerende versjon. Port den.

**Kontrakt:**
- Et klikk på et `[data-list-item]` som inneholder `[data-list-detail]` åpner et fullskjerms overlegg med innholdet fra detaljblokken.
- Overlegget lever på `<body>`, utenfor redigeringsområdet, så det overlever Angre.
- `init()` er idempotent og kjøres på nytt ved `adm:restored`. Bundne noder spores i et `WeakSet`, aldri en markørklasse: et gjenopprettet kort bærer klassen mens lytteren er borte.
- Bare tekst-URL-er til YouTube og Vimeo i en detaljblokk blir til innebygde spillere. Innliming er ren tekst, så klienten kan ikke lage lenker.
- Fila kopieres til `dist/admin/` av bygget, som de andre editorfilene.

**Testene** er statiske, som for `edit.js`: ingen tankestrek, ES5-nivå, `WeakSet` brukt og ikke en markørklasse, `adm:restored` lyttet på, og at `build()` legger fila i `dist/admin/`.

- [ ] **Steg 1:** skriv testene. **Steg 2:** kjør, se dem feile. **Steg 3:** port fila og utvid `build/index.mjs`. **Steg 4:** grønt. **Steg 5:** commit.

---

### Task 5: `editor/kollaps.js`

`data-collapsible="3"` finnes i det gamle skillet og i Schei, og ikke i pakken.

**Files:** Create `editor/kollaps.js`, `test/kollaps.test.mjs`. Modify `build/index.mjs`.

**Kontrakt:**
- En beholder med `data-collapsible="N"` viser N elementer for besøkende, med en knapp «Se X til» som folder ut resten. `data-collapsible-noun` styrer ordet i knappen.
- I redigeringsmodus vises **alle** elementene, så admin kan flytte og redigere hele lista.
- Samme idempotens- og `adm:restored`-krav som Task 4. Denne pakker DOM (`.collapsible` og en knapp-wrapper), så `init()` må rive gammelt stillas før den bygger nytt, ellers dobbeltpakkes lista ved hver Angre.
- ES5-nivå. Kopieres til `dist/admin/`.

- [ ] Samme fem steg som Task 4.

---

### Task 6: dokumentasjon og port

**Files:** Modify `README.md`, `~/.claude/skills/website-intelligence-adminpanel-vercel/SKILL.md`, `~/.claude/assets/nettside-regler.md`.

- [ ] **Steg 1:** README får en seksjon om dekningskontrollen: hvilke tagger som gir feil, hvilke som gir varsel, tabellen med den målte kalibreringen, og `data-edit-ignore` som avmelding.
- [ ] **Steg 2:** README dokumenterer `detail-modal.js` og `kollaps.js`: markupen, at de kopieres av bygget, og at de må lenkes i malen.
- [ ] **Steg 3:** rett de tre påstandene i skillet som sa at disse to ikke finnes.
- [ ] **Steg 4:** regel 14 i `nettside-regler.md` får to setninger: at `doctor` nå sier hvilke felter som mangler markør, og at `data-edit-ignore` er måten å si at noe skal stå fast.
- [ ] **Steg 5:** commit.

## Ikke i denne planen

- **`__append` i `api/save.js`.** Den trengs bare for publiseringsskjema-varianten, som pakken ikke leverer. Føres opp når skjemaet eventuelt kommer.
- **Retting av de fire eksisterende sidene.** Bestemt: kun nye sider.
- **`oppskalert-admin kobler`.** Egen plan.

## Rekkefølge og tid

| Task | Anslag |
|---|---|
| 1 HTML-hjelperen | 2 timer |
| 2 de tre reglene | 2 timer |
| 3 kalibrering mot ekte sider | 1 time |
| 4 detail-modal | 1 time |
| 5 kollaps | 1 time |
| 6 dokumentasjon | 1 time |

Til sammen en dag. Task 3 er den som avgjør om kontrollen er brukbar eller bare støy.
