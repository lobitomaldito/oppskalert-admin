# Oppskalert Admin: implementeringsplan for motoren

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg `oppskalert-admin` som en versjonert, offentlig npm-pakke som gir en hvilken som helst statisk side inline-redigering, PIN-innlogging og publisering til git i ett commit.

**Architecture:** Motoren flyttes ut av kopier og inn i én pakke. Byggesteget baker `content/<side>.json` inn i instrumentert HTML før deploy, så besøkende får ren statisk HTML. Editoren kjører kun i nettleseren til en verifisert admin. Publisering samler tekst og nye bilder i ett GitHub-commit via Git Trees API, som gir ett Vercel-bygg i stedet for to.

**Tech Stack:** Node 18+, ESM, `node-html-parser` (eneste avhengighet), `node:test` som testramme (ingen testavhengigheter), GitHub REST API, Vercel Node-funksjoner.

**Spec:** `docs/superpowers/specs/2026-09-06-oppskalert-admin-design.md`

## Global Constraints

- **Repo:** `lobitomaldito/oppskalert-admin`, **offentlig**. Bestemt 2026-09-06.
- **Ingen hemmeligheter i pakken.** PIN, GitHub-token og repo-navn er miljøvariabler i den enkelte kundesiden (`ADMIN_PIN`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`).
- **Eneste kjøretidsavhengighet er `node-html-parser` ^6.1.13.** Ingen testavhengigheter: bruk `node:test` og `node:assert/strict`.
- **ESM overalt.** `"type": "module"`. Filendelse `.mjs` for Node-moduler, `.js` for `api/`-filer (Vercel ruter på `.js`).
- **Editoren er ES5-nivå nettleser-JS** uten byggesteg: `var`, `function`, ingen pilfunksjoner, ingen `const`. Den serveres rå til klientens nettleser. `edit.js` er den ene fila der denne regelen gjelder.
- **All brukervendt tekst er norsk.** Kodekommentarer kan være norske eller engelske, men feilmeldinger som når klienten skal være norske og forklarende.
- **Ingen tankestrek (—) noe sted.** Heller ikke i kommentarer, commit-meldinger eller feilmeldinger. Bruk komma, kolon, punktum eller parentes.
- **Ingen `fonts.googleapis.com` eller `fonts.gstatic.com`.**
- **Commit-meldinger** avsluttes med `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Avvik fra spec-en, bevisst

Spec 4.2 lister `api/save-image.js` i pakken. **Den droppes.** Når bildeopplasting utsettes til publisering (Task 8 og 10), er endepunktet overflødig, og hvert endepunkt som tar en PIN er en angrepsflate til. Bildebytene reiser sammen med teksten i `/api/save`. Konsekvens: et bilde klienten laster opp og så angrer på, havner aldri i repoet. Det er en forbedring over dagens oppførsel, der hver opplasting commit-es umiddelbart.

## Filstruktur

| Fil | Ansvar |
|---|---|
| `package.json` | pakkeform, `exports`, `bin`, én avhengighet |
| `build/mirror.mjs` | `data-content-src`: hvilken JSON et element leser fra |
| `build/bake.mjs` | å skrive innhold inn i DOM: tekst, bilder, fokuspunkt, lister |
| `build/index.mjs` | sideløkke, `dist/`, kopiering av editorfiler |
| `api/_rateLimit.mjs` | PIN-sjekk og IP-sperre, delt av endepunktene |
| `api/_git.mjs` | flere filer i ett GitHub-commit |
| `api/verify-pin.js` | bekrefter PIN før editoren bygges |
| `api/save.js` | innhold og nye bilder i ett commit |
| `editor/edit.css` | admin-UI, kun CSS-variabler |
| `editor/edit.js` | nettleser-motoren |
| `doctor/index.mjs` | kjører regelsettet, samler rapport |
| `doctor/regler/*.mjs` | én regel per fil, én fixture per regel |
| `bin/oppskalert-admin.mjs` | CLI: `init`, `doctor`, `tid` |
| `test/*.test.mjs` | én testfil per modul |

Grensesnittene er valgt slik at ingenting rører filsystemet eller nettet uten at det er injisert. `mirror` får `lastInnhold`, `_git` får `hent`. Det er det som gjør resten testbar uten nettverk.

---

### Task 1: Repo, pakkeskjelett og testharness

**Files:**
- Create: `package.json`, `.gitignore`, `test/harness.test.mjs`

**Interfaces:**
- Consumes: ingenting
- Produces: `npm test` kjører `node --test test/`. Pakkenavnet er `oppskalert-admin`, versjon `0.1.0`.

- [ ] **Step 1: Opprett repoet lokalt**

```bash
mkdir -p ~/Desktop/Antigravity/Nettsider/oppskalert-admin
cd ~/Desktop/Antigravity/Nettsider/oppskalert-admin
git init -b main
```

- [ ] **Step 2: Skriv `package.json`**

```json
{
  "name": "oppskalert-admin",
  "version": "0.1.0",
  "description": "Inline redigering og publisering til git for statiske sider.",
  "type": "module",
  "license": "MIT",
  "repository": "github:lobitomaldito/oppskalert-admin",
  "engines": { "node": ">=18" },
  "exports": {
    "./build": "./build/index.mjs",
    "./doctor": "./doctor/index.mjs",
    "./api/save.js": "./api/save.js",
    "./api/verify-pin.js": "./api/verify-pin.js",
    "./seksjoner/*": "./seksjoner/*"
  },
  "bin": { "oppskalert-admin": "./bin/oppskalert-admin.mjs" },
  "files": ["build", "editor", "api", "doctor", "seksjoner", "bin", "README.md"],
  "scripts": { "test": "node --test test/" },
  "dependencies": { "node-html-parser": "^6.1.13" }
}
```

- [ ] **Step 3: Skriv `.gitignore`**

```
node_modules/
.DS_Store
.env
.env.local
```

- [ ] **Step 4: Skriv en test som beviser at harnessen kjører**

```js
// test/harness.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('pakken heter oppskalert-admin og krever node 18', () => {
  const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(p.name, 'oppskalert-admin');
  assert.equal(p.type, 'module');
  assert.equal(p.engines.node, '>=18');
});
```

- [ ] **Step 5: Installer og kjør**

Run: `npm install && npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Pakkeskjelett og testharness

node:test som testramme, node-html-parser som eneste avhengighet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `build/mirror.mjs`, hvilken JSON et element leser fra

Ett avsnitt kan speiles på flere sider fra én kilde ved å pakke det i `data-content-src="kildeside"`. Da har innholdet én eier, og en endring ett sted viser likt overalt.

**Files:**
- Create: `build/mirror.mjs`
- Test: `test/mirror.test.mjs`

**Interfaces:**
- Consumes: ingenting
- Produces: `lagOppslag(sideInnhold: object, lastInnhold: (sidenavn: string) => object) => (el: HTMLElement, nokkel: string) => any`

- [ ] **Step 1: Skriv de tre feilende testene**

```js
// test/mirror.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { lagOppslag } from '../build/mirror.mjs';

test('uten data-content-src leses sidens eget innhold', () => {
  const dom = parse('<h1 data-edit="a">x</h1>');
  const slaOpp = lagOppslag({ a: 'fra siden' }, () => ({}));
  assert.equal(slaOpp(dom.querySelector('h1'), 'a'), 'fra siden');
});

test('data-content-src paa en forelder styrer oppslaget', () => {
  const dom = parse('<div data-content-src="cv"><h1 data-edit="a">x</h1></div>');
  const slaOpp = lagOppslag({ a: 'fra siden' }, (navn) => {
    assert.equal(navn, 'cv');
    return { a: 'fra cv' };
  });
  assert.equal(slaOpp(dom.querySelector('h1'), 'a'), 'fra cv');
});

test('samme kilde lastes bare en gang per bygg', () => {
  const dom = parse('<div data-content-src="cv"><i data-edit="a"></i><b data-edit="b"></b></div>');
  let antall = 0;
  const slaOpp = lagOppslag({}, () => { antall++; return { a: 1, b: 2 }; });
  slaOpp(dom.querySelector('i'), 'a');
  slaOpp(dom.querySelector('b'), 'b');
  assert.equal(antall, 1);
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/mirror.test.mjs`
Expected: FAIL, `Cannot find module '../build/mirror.mjs'`

- [ ] **Step 3: Skriv `build/mirror.mjs`**

```js
// Et element (eller en forelder) kan baere data-content-src="annenSide" for aa
// hente innholdet sitt fra en annen sides JSON. Da har speilet innhold en enkelt
// eier, og en endring ett sted viser likt overalt.
//
// lastInnhold injiseres slik at modulen aldri roerer filsystemet selv. Det er
// det som gjoer den testbar uten aa skrive filer.
export function lagOppslag(sideInnhold, lastInnhold) {
  const cache = Object.create(null);

  return function slaOpp(el, nokkel) {
    let node = el;
    while (node) {
      const kilde = node.getAttribute && node.getAttribute('data-content-src');
      if (kilde) {
        if (!(kilde in cache)) cache[kilde] = lastInnhold(kilde) || {};
        return cache[kilde][nokkel];
      }
      node = node.parentNode;
    }
    return sideInnhold[nokkel];
  };
}
```

- [ ] **Step 4: Kjør testene**

Run: `node --test test/mirror.test.mjs`
Expected: PASS, 3 tester.

- [ ] **Step 5: Commit**

```bash
git add build/mirror.mjs test/mirror.test.mjs
git commit -m "$(cat <<'EOF'
Speiling: lagOppslag avgjoer hvilken JSON et element leser fra

lastInnhold injiseres, saa modulen aldri roerer filsystemet og kan testes
uten aa skrive filer. Kilder caches per bygg.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `build/bake.mjs`, tekst og bilder

Fokuspunkt er verdt en setning: beskårne bilder er `object-fit: cover`, som beholder midten og gjerne kutter hoder. `content["nokkel@pos"]` er verdien klienten drar seg fram til i editoren, og den skrives ut som `object-position` eller `background-position`.

**Files:**
- Create: `build/bake.mjs`
- Test: `test/bake-tekst.test.mjs`

**Interfaces:**
- Consumes: `lagOppslag` fra Task 2 (kun som signatur: `(el, nokkel) => verdi`)
- Produces:
  - `settStilProp(el, prop: string, verdi: string) => void`
  - `settFokuspunkt(el, pos: string|undefined) => void`
  - `bakeTekst(dom, slaOpp) => number` (antall treff)
  - `bakeBilder(dom, slaOpp) => number`

- [ ] **Step 1: Skriv de feilende testene**

```js
// test/bake-tekst.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { bakeTekst, bakeBilder, settStilProp } from '../build/bake.mjs';

const fast = (innhold) => (_el, nokkel) => innhold[nokkel];

test('bakeTekst erstatter innholdet og teller treff', () => {
  const dom = parse('<h1 data-edit="hero.tittel">Standard</h1>');
  assert.equal(bakeTekst(dom, fast({ 'hero.tittel': 'Ny <strong>tittel</strong>' })), 1);
  assert.equal(dom.querySelector('h1').innerHTML, 'Ny <strong>tittel</strong>');
});

test('bakeTekst lar elementet staa naar noekkelen mangler', () => {
  const dom = parse('<h1 data-edit="mangler">Standard</h1>');
  assert.equal(bakeTekst(dom, fast({})), 0);
  assert.equal(dom.querySelector('h1').innerHTML, 'Standard');
});

test('tom streng er en gyldig verdi og skal slette teksten', () => {
  const dom = parse('<p data-edit="a">Standard</p>');
  assert.equal(bakeTekst(dom, fast({ a: '' })), 1);
  assert.equal(dom.querySelector('p').innerHTML, '');
});

test('bakeBilder setter src paa img', () => {
  const dom = parse('<img data-edit-image="hero.cover" src="/gammel.jpg">');
  bakeBilder(dom, fast({ 'hero.cover': '/ny.jpg' }));
  assert.equal(dom.querySelector('img').getAttribute('src'), '/ny.jpg');
});

test('bakeBilder setter background-image paa alt annet enn img', () => {
  const dom = parse('<div data-edit-image="hero.cover"></div>');
  bakeBilder(dom, fast({ 'hero.cover': '/ny.jpg' }));
  assert.match(dom.querySelector('div').getAttribute('style'), /background-image:url\('\/ny\.jpg'\)/);
});

test('fokuspunkt gir object-position paa img og background-position ellers', () => {
  const bilde = parse('<img data-edit-image="a" src="/x.jpg">');
  bakeBilder(bilde, fast({ 'a@pos': '50% 22%' }));
  assert.match(bilde.querySelector('img').getAttribute('style'), /object-position:50% 22%/);

  const boks = parse('<div data-edit-image="a"></div>');
  bakeBilder(boks, fast({ 'a@pos': '50% 22%' }));
  assert.match(boks.querySelector('div').getAttribute('style'), /background-position:50% 22%/);
});

test('fokuspunkt alene, uten ny url, endrer fortsatt utsnittet', () => {
  const dom = parse('<img data-edit-image="a" src="/beholdes.jpg">');
  assert.equal(bakeBilder(dom, fast({ 'a@pos': '10% 90%' })), 1);
  assert.equal(dom.querySelector('img').getAttribute('src'), '/beholdes.jpg');
});

test('settStilProp beholder oevrige deklarasjoner', () => {
  const dom = parse('<div style="color:red; background-position:0% 0%;"></div>');
  settStilProp(dom.querySelector('div'), 'background-position', '50% 50%');
  const s = dom.querySelector('div').getAttribute('style');
  assert.match(s, /color:red/);
  assert.match(s, /background-position:50% 50%/);
  assert.equal(s.match(/background-position/g).length, 1);
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/bake-tekst.test.mjs`
Expected: FAIL, `Cannot find module '../build/bake.mjs'`

- [ ] **Step 3: Skriv tekst- og bildedelen av `build/bake.mjs`**

```js
// Skriver innhold inn i en parset DOM. Modulen vet ingenting om filsystemet og
// ingenting om speiling: den faar et oppslag inn og bruker det.
import { parse } from 'node-html-parser';

// Bytt EN deklarasjon i et inline style-attributt, la resten staa.
export function settStilProp(el, prop, verdi) {
  const gammel = (el.getAttribute('style') || '')
    .replace(new RegExp(`${prop}\\s*:[^;]*;?`, 'i'), '')
    .trim();
  el.setAttribute('style', `${gammel}${gammel ? ' ' : ''}${prop}:${verdi};`);
}

// "50% 22%" styrer hva som vises i et beskaaret bilde. Uten den beholder
// nettleseren midten, og kutter gjerne hoder.
export function settFokuspunkt(el, pos) {
  if (!pos) return;
  settStilProp(el, el.tagName === 'IMG' ? 'object-position' : 'background-position', pos);
}

export function bakeTekst(dom, slaOpp) {
  let treff = 0;
  for (const el of dom.querySelectorAll('[data-edit]')) {
    const verdi = slaOpp(el, el.getAttribute('data-edit'));
    // != null slipper tom streng gjennom. En klient som toemmer et felt skal faa
    // det toemt, og ikke se standardteksten komme tilbake ved neste bygg.
    if (verdi != null) { el.set_content(verdi); treff++; }
  }
  return treff;
}

export function bakeBilder(dom, slaOpp) {
  let treff = 0;
  for (const el of dom.querySelectorAll('[data-edit-image]')) {
    const nokkel = el.getAttribute('data-edit-image');
    const url = slaOpp(el, nokkel);
    const pos = slaOpp(el, `${nokkel}@pos`);
    if (url == null && !pos) continue;
    treff++;
    if (url != null) {
      if (el.tagName === 'IMG') el.setAttribute('src', url);
      else settStilProp(el, 'background-image', `url('${url}')`);
    }
    settFokuspunkt(el, pos);
  }
  return treff;
}
```

- [ ] **Step 4: Kjør testene**

Run: `node --test test/bake-tekst.test.mjs`
Expected: PASS, 8 tester.

- [ ] **Step 5: Commit**

```bash
git add build/bake.mjs test/bake-tekst.test.mjs
git commit -m "$(cat <<'EOF'
Baking av tekst, bilder og fokuspunkt

Tom streng teller som en verdi, saa et felt klienten toemmer forblir toemt
i stedet for aa faa standardteksten tilbake ved neste bygg.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `build/bake.mjs`, lister

Den vanskelige delen: hvert listeelement skal rendres fra **sin egen** mal etter indeks. En liste der kort 2 er framhevet må beholde framhevingen når klienten redigerer kort 1. Renderes alt fra første mal, forsvinner strukturen.

**Files:**
- Modify: `build/bake.mjs` (legg til `bakeLister`)
- Test: `test/bake-lister.test.mjs`

**Interfaces:**
- Consumes: `settFokuspunkt`, `settStilProp` fra Task 3
- Produces: `bakeLister(dom, slaOpp) => number`

- [ ] **Step 1: Skriv de feilende testene**

```js
// test/bake-lister.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { bakeLister } from '../build/bake.mjs';

const fast = (innhold) => (_el, nokkel) => innhold[nokkel];
const MAL = `<ul data-editable-list="kort">
  <li data-list-item><h3 data-list-field="tittel">A</h3></li>
</ul>`;

test('rendrer ett element per array-post', () => {
  const dom = parse(MAL);
  assert.equal(bakeLister(dom, fast({ kort: [{ tittel: 'En' }, { tittel: 'To' }] })), 2);
  const rader = dom.querySelectorAll('[data-list-item]');
  assert.equal(rader.length, 2);
  assert.equal(rader[0].querySelector('h3').innerHTML, 'En');
  assert.equal(rader[1].querySelector('h3').innerHTML, 'To');
});

test('tom eller manglende liste lar malen staa uroert', () => {
  const dom = parse(MAL);
  assert.equal(bakeLister(dom, fast({ kort: [] })), 0);
  assert.equal(dom.querySelectorAll('[data-list-item]').length, 1);
});

test('hvert element rendres fra SIN egen mal etter indeks', () => {
  const dom = parse(`<ul data-editable-list="k">
    <li data-list-item class="vanlig"><h3 data-list-field="t">A</h3></li>
    <li data-list-item class="framhevet"><h3 data-list-field="t">B</h3></li>
  </ul>`);
  bakeLister(dom, fast({ k: [{ t: 'en' }, { t: 'to' }] }));
  const rader = dom.querySelectorAll('[data-list-item]');
  assert.equal(rader[0].getAttribute('class'), 'vanlig');
  assert.equal(rader[1].getAttribute('class'), 'framhevet');
});

test('flere poster enn maler faller tilbake paa den siste malen', () => {
  const dom = parse(`<ul data-editable-list="k">
    <li data-list-item class="a"><h3 data-list-field="t">A</h3></li>
    <li data-list-item class="b"><h3 data-list-field="t">B</h3></li>
  </ul>`);
  bakeLister(dom, fast({ k: [{ t: '1' }, { t: '2' }, { t: '3' }] }));
  const rader = dom.querySelectorAll('[data-list-item]');
  assert.equal(rader.length, 3);
  assert.equal(rader[2].getAttribute('class'), 'b');
});

test('_skjult gir klassen is-hidden-item', () => {
  const dom = parse(MAL);
  bakeLister(dom, fast({ kort: [{ tittel: 'X', _skjult: '1' }] }));
  assert.match(dom.querySelector('[data-list-item]').getAttribute('class'), /is-hidden-item/);
});

test('bildefelt i et listeelement faar src og alt fra tittelen', () => {
  const dom = parse(`<ul data-editable-list="k">
    <li data-list-item><img data-list-image-field="bilde" src=""><h3 data-list-field="tittel">A</h3></li>
  </ul>`);
  bakeLister(dom, fast({ k: [{ bilde: '/b.jpg', tittel: 'Portrett av Kari' }] }));
  const img = dom.querySelector('img');
  assert.equal(img.getAttribute('src'), '/b.jpg');
  assert.equal(img.getAttribute('alt'), 'Portrett av Kari');
});

test('modalen har sitt eget fokuspunkt, siden utsnittet er en annen form', () => {
  const dom = parse(`<ul data-editable-list="k">
    <li data-list-item><img data-list-image-field="b" src=""></li>
  </ul>`);
  bakeLister(dom, fast({ k: [{ b: '/x.jpg', 'b@pos': '50% 10%', 'b@pos-modal': '50% 80%' }] }));
  const img = dom.querySelector('img');
  assert.match(img.getAttribute('style'), /object-position:50% 10%/);
  assert.equal(img.getAttribute('data-pos-modal'), '50% 80%');
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/bake-lister.test.mjs`
Expected: FAIL, `bakeLister is not a function`

- [ ] **Step 3: Legg `bakeLister` nederst i `build/bake.mjs`**

```js
export function bakeLister(dom, slaOpp) {
  let treff = 0;

  for (const beholder of dom.querySelectorAll('[data-editable-list]')) {
    const poster = slaOpp(beholder, beholder.getAttribute('data-editable-list'));
    if (!Array.isArray(poster) || poster.length === 0) continue;

    const maler = beholder.querySelectorAll('[data-list-item]');
    if (maler.length === 0) continue;

    // Hver post rendres fra SIN egen mal etter indeks. En liste der kort 2 er
    // framhevet beholder framhevingen naar kort 1 redigeres. Rendres alt fra
    // den foerste malen, forsvinner strukturen ved foerste publisering.
    const malStrenger = Array.from(maler).map((el) => el.toString());
    maler.forEach((el) => el.remove());

    poster.forEach((post, i) => {
      const rot = parse(malStrenger[i] || malStrenger[malStrenger.length - 1]);
      const element = rot.querySelector('[data-list-item]');
      if (!element) return;

      for (const felt of element.querySelectorAll('[data-list-field]')) {
        const k = felt.getAttribute('data-list-field');
        if (post[k] != null) felt.set_content(post[k]);
      }

      for (const felt of element.querySelectorAll('[data-list-image-field]')) {
        const k = felt.getAttribute('data-list-image-field');
        const pos = post[`${k}@pos`];
        // Bildet i "Les mer"-modalen har sitt eget punkt, fordi utsnittet der er
        // en annen form enn kortets. Leses tilbake av detail-modal.js.
        const posModal = post[`${k}@pos-modal`];
        if (posModal) felt.setAttribute('data-pos-modal', posModal);
        if (post[k] == null && !pos) continue;
        if (post[k] != null) {
          if (felt.tagName === 'IMG') {
            felt.setAttribute('src', post[k]);
            if (post.tittel) felt.setAttribute('alt', post.tittel);
          } else {
            settStilProp(felt, 'background-image', `url('${post[k]}')`);
          }
        }
        settFokuspunkt(felt, pos);
      }

      if (post._skjult) {
        const klasser = (element.getAttribute('class') || '').trim();
        element.setAttribute('class', `${klasser}${klasser ? ' ' : ''}is-hidden-item`);
      }

      beholder.appendChild(element);
      treff++;
    });
  }

  return treff;
}
```

- [ ] **Step 4: Kjør hele testsuiten**

Run: `npm test`
Expected: PASS, 19 tester til sammen.

- [ ] **Step 5: Commit**

```bash
git add build/bake.mjs test/bake-lister.test.mjs
git commit -m "$(cat <<'EOF'
Baking av redigerbare lister

Hver post rendres fra sin egen mal etter indeks, saa en framhevet post
beholder strukturen sin naar en annen post redigeres.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `build/index.mjs`, sideløkke og dist

**Files:**
- Create: `build/index.mjs`
- Test: `test/build.test.mjs`

**Interfaces:**
- Consumes: `lagOppslag` (Task 2), `bakeTekst`/`bakeBilder`/`bakeLister` (Task 3, 4)
- Produces: `build(config?) => { sider: number, treff: number }`
  - `config.rot` (default `process.cwd()`), `config.templates`, `config.content`, `config.statisk`, `config.dist`. Alle stier løses mot `rot` når de er relative.

- [ ] **Step 1: Skriv de feilende testene**

```js
// test/build.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../build/index.mjs';

function lagProsjekt() {
  const rot = mkdtempSync(join(tmpdir(), 'oa-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content'));
  mkdirSync(join(rot, 'static', 'css'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'index.html'), '<html><body><h1 data-edit="t">Standard</h1></body></html>');
  writeFileSync(join(rot, 'content', 'index.json'), JSON.stringify({ t: 'Bakt' }));
  writeFileSync(join(rot, 'static', 'css', 'site.css'), 'body{margin:0}');
  return rot;
}

test('baker innhold inn i html og skriver til dist', () => {
  const rot = lagProsjekt();
  const res = build({ rot });
  assert.equal(res.sider, 1);
  assert.match(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'), /<h1 data-edit="t">Bakt<\/h1>/);
});

test('legger paa doctype naar malen mangler den', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.match(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'), /^<!DOCTYPE html>/);
});

test('kopierer static/ inn i dist', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.ok(existsSync(join(rot, 'dist', 'css', 'site.css')));
});

test('kopierer editorfilene til dist/admin', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.ok(existsSync(join(rot, 'dist', 'admin', 'edit.js')));
  assert.ok(existsSync(join(rot, 'dist', 'admin', 'edit.css')));
});

test('en side uten json bygges med malens standardtekst', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'om.html'), '<h1 data-edit="t">Om oss</h1>');
  const res = build({ rot });
  assert.equal(res.sider, 2);
  assert.match(readFileSync(join(rot, 'dist', 'om.html'), 'utf8'), /Om oss/);
});

test('oedelagt json stopper ikke bygget', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'content', 'index.json'), '{ dette er ikke json');
  const res = build({ rot });
  assert.equal(res.sider, 1);
  assert.match(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'), /Standard/);
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/build.test.mjs`
Expected: FAIL, `Cannot find module '../build/index.mjs'`

- [ ] **Step 3: Skriv `build/index.mjs`**

```js
// Byggesteget: templates/*.html + content/<side>.json -> dist/*.html
// Besoekende faar ren statisk HTML. Ingen kall paa lesestien, ingen blink.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { lagOppslag } from './mirror.mjs';
import { bakeTekst, bakeBilder, bakeLister } from './bake.mjs';

const EDITOR = fileURLToPath(new URL('../editor/', import.meta.url));

export function build(config = {}) {
  const rot = config.rot || process.cwd();
  const sti = (s, standard) => {
    const v = s || standard;
    return isAbsolute(v) ? v : join(rot, v);
  };

  const TPL = sti(config.templates, 'templates');
  const INNHOLD = sti(config.content, 'content');
  const STATISK = sti(config.statisk, 'static');
  const DIST = sti(config.dist, 'dist');

  // OEdelagt JSON skal aldri stoppe et bygg. En kundeside som ikke lar seg
  // deploye fordi en fil har en komma-feil, er verre enn en side som viser
  // standardteksten sin til noen retter opp.
  function lastInnhold(side) {
    const f = join(INNHOLD, `${side}.json`);
    if (!existsSync(f)) return {};
    try { return JSON.parse(readFileSync(f, 'utf8')); }
    catch { console.warn(`  ! ${side}.json lar seg ikke lese som JSON, bruker malens standardtekst`); return {}; }
  }

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  if (existsSync(STATISK)) cpSync(STATISK, DIST, { recursive: true });
  cpSync(EDITOR, join(DIST, 'admin'), { recursive: true });

  let sider = 0, treff = 0;

  for (const fil of readdirSync(TPL)) {
    if (!fil.endsWith('.html')) continue;
    const side = fil.replace(/\.html$/, '');
    const dom = parse(readFileSync(join(TPL, fil), 'utf8'), { comment: true });
    const slaOpp = lagOppslag(lastInnhold(side), lastInnhold);

    treff += bakeTekst(dom, slaOpp);
    treff += bakeBilder(dom, slaOpp);
    treff += bakeLister(dom, slaOpp);

    let html = dom.toString();
    if (!/^\s*<!doctype/i.test(html)) html = `<!DOCTYPE html>\n${html}`;
    writeFileSync(join(DIST, fil), html);
    sider++;
  }

  console.log(`✓ Bygde ${sider} sider med ${treff} innholdstreff -> dist/`);
  return { sider, treff };
}
```

- [ ] **Step 4: Lag tomme editorfiler slik at kopieringen har noe å ta**

```bash
mkdir -p editor
printf '/* fylles i Task 10 */\n' > editor/edit.js
printf '/* fylles i Task 9 */\n' > editor/edit.css
```

- [ ] **Step 5: Kjør hele testsuiten**

Run: `npm test`
Expected: PASS, 25 tester.

- [ ] **Step 6: Commit**

```bash
git add build/index.mjs editor/ test/build.test.mjs
git commit -m "$(cat <<'EOF'
Byggesteget: sideloekke, dist og kopiering av editoren

OEdelagt JSON logges og bygget fortsetter med malens standardtekst. En side
som ikke lar seg deploye pga en komma-feil er verre enn en side som viser
standardteksten til noen retter opp.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `api/_rateLimit.mjs` og `api/verify-pin.js`

Portes fra Alphaneg, som er den eneste kopien med serverside PIN-verifisering. Uten den kan en forfalsket `sessionStorage`-verdi bygge editoren.

**Files:**
- Create: `api/_rateLimit.mjs`, `api/verify-pin.js`
- Test: `test/ratelimit.test.mjs`

**Interfaces:**
- Consumes: ingenting
- Produces: `checkPin(req, innsendt: string, riktig: string) => { ok: true } | { ok: false, status: 401|429|500, error: string }`
  - `req` trenger kun `headers['x-forwarded-for']` og `socket.remoteAddress`.
  - `nullstill()` eksporteres for tester.

- [ ] **Step 1: Skriv de feilende testene**

```js
// test/ratelimit.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkPin, nullstill } from '../api/_rateLimit.mjs';

const req = (ip) => ({ headers: { 'x-forwarded-for': ip }, socket: {} });

beforeEach(() => nullstill());

test('riktig pin slipper gjennom', () => {
  assert.deepEqual(checkPin(req('1.1.1.1'), '1234', '1234'), { ok: true });
});

test('manglende ADMIN_PIN feiler lukket med 500', () => {
  const r = checkPin(req('1.1.1.1'), '', undefined);
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
  assert.match(r.error, /ADMIN_PIN/);
});

test('tom ADMIN_PIN feiler lukket, ikke aapent', () => {
  assert.equal(checkPin(req('1.1.1.1'), '', '').status, 500);
});

test('feil pin gir 401 og teller ned forsoek', () => {
  const r = checkPin(req('2.2.2.2'), 'feil', '1234');
  assert.equal(r.status, 401);
  assert.match(r.error, /4 forsøk igjen/);
});

test('fem bom laaser i 15 minutter og gir 429', () => {
  for (let i = 0; i < 5; i++) checkPin(req('3.3.3.3'), 'feil', '1234');
  const r = checkPin(req('3.3.3.3'), '1234', '1234');
  assert.equal(r.status, 429);
  assert.match(r.error, /15 min/);
});

test('en riktig pin nullstiller telleren', () => {
  checkPin(req('4.4.4.4'), 'feil', '1234');
  checkPin(req('4.4.4.4'), '1234', '1234');
  assert.match(checkPin(req('4.4.4.4'), 'feil', '1234').error, /4 forsøk igjen/);
});

test('sperren gjelder per ip', () => {
  for (let i = 0; i < 5; i++) checkPin(req('5.5.5.5'), 'feil', '1234');
  assert.deepEqual(checkPin(req('6.6.6.6'), '1234', '1234'), { ok: true });
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/ratelimit.test.mjs`
Expected: FAIL, `Cannot find module '../api/_rateLimit.mjs'`

- [ ] **Step 3: Skriv `api/_rateLimit.mjs`**

```js
// Delt PIN-sjekk med IP-sperre for alle endepunkter som tar en PIN.
// Fem bom fra samme IP gir 15 minutters sperre.
//
// Kjent begrensning, dokumentert med vilje: telleren ligger i minnet per
// funksjonsinstans og nullstilles ved kald start. For en side med én admin er
// det akseptabelt. Skal dette holde mot en seriøs angriper, maa telleren flyttes
// til delt lagring, og da koster siden penger.
const kartet = new Map();
const MAKS_BOM = 5;
const SPERRE_MS = 15 * 60 * 1000;

export function nullstill() { kartet.clear(); }

export function checkPin(req, innsendt, riktig) {
  // Uten en konfigurert PIN slipper ingen inn. Med `innsendt !== riktig` alene
  // ville begge vaere undefined naar ADMIN_PIN forsvinner fra miljoeet,
  // sammenligningen usann, og et tomt PIN-felt gitt full tilgang.
  if (typeof riktig !== 'string' || riktig.length === 0) {
    return { ok: false, status: 500, error: 'Innlogging er ikke satt opp på serveren (ADMIN_PIN mangler).' };
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'ukjent';
  const na = Date.now();
  const rad = kartet.get(ip) || { bom: 0, sperretTil: 0 };

  if (rad.sperretTil > na) {
    const min = Math.ceil((rad.sperretTil - na) / 60000);
    return { ok: false, status: 429, error: `For mange forsøk. Prøv igjen om ${min} min.` };
  }

  if (innsendt !== riktig) {
    rad.bom++;
    if (rad.bom >= MAKS_BOM) rad.sperretTil = na + SPERRE_MS;
    kartet.set(ip, rad);
    const igjen = MAKS_BOM - rad.bom;
    return {
      ok: false,
      status: 401,
      error: igjen > 0 ? `Feil PIN. ${igjen} forsøk igjen.` : 'Låst i 15 minutter.'
    };
  }

  kartet.delete(ip);
  return { ok: true };
}
```

- [ ] **Step 4: Skriv `api/verify-pin.js`**

```js
// Lar klienten bekrefte PIN-en FOER editoren bygges, i stedet for aa oppdage
// en feil PIN foerst ved Publiser. Deler sperren med save.js, saa dette ikke
// aapner en ny, ubeskyttet gjettesti.
import { checkPin } from './_rateLimit.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metoden er ikke tillatt' });
  const sjekk = checkPin(req, (req.body || {}).pin, process.env.ADMIN_PIN);
  if (!sjekk.ok) return res.status(sjekk.status).json({ ok: false, error: sjekk.error });
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 5: Kjør hele testsuiten**

Run: `npm test`
Expected: PASS, 32 tester.

- [ ] **Step 6: Commit**

```bash
git add api/_rateLimit.mjs api/verify-pin.js test/ratelimit.test.mjs
git commit -m "$(cat <<'EOF'
PIN-sjekk med IP-sperre, og verify-pin som eget endepunkt

Feiler lukket naar ADMIN_PIN mangler. Uten den sjekken ville begge sider av
sammenligningen vaert undefined, og et tomt PIN-felt gitt full tilgang.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `api/_git.mjs`, flere filer i ett commit

Dagens motor bruker Contents API, som tar én fil per kall. Ett bildebytte pluss én tekstendring blir to commits og to Vercel-bygg. Git Trees API legger alt i ett tre og ett commit.

**Files:**
- Create: `api/_git.mjs`
- Test: `test/git.test.mjs`

**Interfaces:**
- Consumes: ingenting
- Produces:
  - `commitFiler({ repo, branch, token, melding, filer, hent? }) => Promise<{ sha: string, antall: number }>`
    - `filer`: `[{ sti: string, innhold: string, base64?: boolean }]`
    - `hent` er `fetch` som standard, injiseres i tester.
  - `lesFil({ repo, branch, token, sti, hent? }) => Promise<object|null>` (leser og JSON-parser en fil, `null` hvis den ikke finnes)

- [ ] **Step 1: Skriv de feilende testene**

```js
// test/git.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitFiler, lesFil } from '../api/_git.mjs';

// Falsk GitHub. Samler kallene saa vi kan sjekke rekkefoelgen og at det
// bare blir ETT commit.
function falskGitHub(overstyr = {}) {
  const kall = [];
  const svar = {
    'git/ref/heads/main': { object: { sha: 'HEAD1' } },
    'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
    'git/blobs': { sha: 'BLOB1' },
    'git/trees': { sha: 'TRE1' },
    'git/commits': { sha: 'COMMIT1' },
    'git/refs/heads/main': {},
    ...overstyr
  };
  const hent = async (url, init) => {
    const n = Object.keys(svar).find((k) => url.endsWith(k));
    kall.push({ url, metode: init?.method || 'GET', kropp: init?.body ? JSON.parse(init.body) : null });
    if (svar[n] === 'FEIL') return { ok: false, status: 422, text: async () => 'Unprocessable' };
    return { ok: true, status: 200, text: async () => JSON.stringify(svar[n] ?? {}) };
  };
  return { hent, kall };
}

const grunn = { repo: 'meg/side', branch: 'main', token: 't', melding: 'Innhold' };

test('tekstfiler legges rett i treet, uten blob-kall', async () => {
  const { hent, kall } = falskGitHub();
  const res = await commitFiler({ ...grunn, filer: [{ sti: 'content/index.json', innhold: '{}' }], hent });
  assert.equal(res.sha, 'COMMIT1');
  assert.equal(kall.filter((k) => k.url.endsWith('git/blobs')).length, 0);
  const tre = kall.find((k) => k.url.endsWith('git/trees')).kropp;
  assert.deepEqual(tre.tree[0], { path: 'content/index.json', mode: '100644', type: 'blob', content: '{}' });
  assert.equal(tre.base_tree, 'TRE0');
});

test('binaerfiler lastes opp som blob foerst og refereres med sha', async () => {
  const { hent, kall } = falskGitHub();
  await commitFiler({ ...grunn, filer: [{ sti: 'static/assets/uploads/a.jpg', innhold: 'AAAA', base64: true }], hent });
  const blob = kall.find((k) => k.url.endsWith('git/blobs'));
  assert.deepEqual(blob.kropp, { content: 'AAAA', encoding: 'base64' });
  const tre = kall.find((k) => k.url.endsWith('git/trees')).kropp;
  assert.deepEqual(tre.tree[0], { path: 'static/assets/uploads/a.jpg', mode: '100644', type: 'blob', sha: 'BLOB1' });
});

test('tekst og bilder gir ETT commit til sammen', async () => {
  const { hent, kall } = falskGitHub();
  await commitFiler({
    ...grunn,
    filer: [
      { sti: 'content/index.json', innhold: '{"a":1}' },
      { sti: 'static/assets/uploads/a.jpg', innhold: 'AAAA', base64: true },
      { sti: 'static/assets/uploads/b.jpg', innhold: 'BBBB', base64: true }
    ],
    hent
  });
  const commits = kall.filter((k) => k.url.endsWith('git/commits') && k.metode === 'POST');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].kropp.parents[0], 'HEAD1');
  assert.equal(commits[0].kropp.tree, 'TRE1');
});

test('refen flyttes til det nye commit-et helt til slutt', async () => {
  const { hent, kall } = falskGitHub();
  await commitFiler({ ...grunn, filer: [{ sti: 'a.json', innhold: '{}' }], hent });
  const siste = kall[kall.length - 1];
  assert.equal(siste.metode, 'PATCH');
  assert.match(siste.url, /git\/refs\/heads\/main$/);
  assert.deepEqual(siste.kropp, { sha: 'COMMIT1' });
});

test('en feil fra GitHub kastes med status og utdrag', async () => {
  const { hent } = falskGitHub({ 'git/trees': 'FEIL' });
  await assert.rejects(
    () => commitFiler({ ...grunn, filer: [{ sti: 'a.json', innhold: '{}' }], hent }),
    /GitHub 422: Unprocessable/
  );
});

test('lesFil gir null naar fila ikke finnes', async () => {
  const hent = async () => ({ ok: false, status: 404, text: async () => 'Not Found' });
  assert.equal(await lesFil({ repo: 'a/b', branch: 'main', token: 't', sti: 'x.json', hent }), null);
});

test('lesFil dekoder base64 og parser json', async () => {
  const innhold = Buffer.from(JSON.stringify({ a: 1 })).toString('base64');
  const hent = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ content: innhold }) });
  assert.deepEqual(await lesFil({ repo: 'a/b', branch: 'main', token: 't', sti: 'x.json', hent }), { a: 1 });
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/git.test.mjs`
Expected: FAIL, `Cannot find module '../api/_git.mjs'`

- [ ] **Step 3: Skriv `api/_git.mjs`**

```js
// Skriver flere filer i ETT commit via GitHub Git Trees API.
// Contents API tar én fil per kall, saa ett bildebytte pluss én tekstendring
// ble to commits og to Vercel-bygg.
const API = 'https://api.github.com';

function hoder(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'oppskalert-admin',
    'Content-Type': 'application/json'
  };
}

async function kall(url, token, init, hent) {
  const r = await hent(url, { ...init, headers: hoder(token) });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${tekst.slice(0, 140)}`);
  return tekst ? JSON.parse(tekst) : {};
}

export async function lesFil({ repo, branch, token, sti, hent = fetch }) {
  const r = await hent(`${API}/repos/${repo}/contents/${sti}?ref=${branch}`, { headers: hoder(token) });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(await r.text());
    return JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  } catch { return null; }
}

export async function commitFiler({ repo, branch, token, melding, filer, hent = fetch }) {
  const ref = await kall(`${API}/repos/${repo}/git/ref/heads/${branch}`, token, {}, hent);
  const hode = ref.object.sha;
  const grunnCommit = await kall(`${API}/repos/${repo}/git/commits/${hode}`, token, {}, hent);

  const tre = [];
  for (const f of filer) {
    if (f.base64) {
      // Binaert innhold maa gjennom blob-endepunktet. Tre-endepunktet tar bare
      // UTF-8 i `content`, og et JPEG overlever ikke den veien.
      const blob = await kall(`${API}/repos/${repo}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content: f.innhold, encoding: 'base64' })
      }, hent);
      tre.push({ path: f.sti, mode: '100644', type: 'blob', sha: blob.sha });
    } else {
      tre.push({ path: f.sti, mode: '100644', type: 'blob', content: f.innhold });
    }
  }

  const nyttTre = await kall(`${API}/repos/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: grunnCommit.tree.sha, tree: tre })
  }, hent);

  const commit = await kall(`${API}/repos/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message: melding, tree: nyttTre.sha, parents: [hode] })
  }, hent);

  // Refen flyttes helt til slutt. Feiler noe foer dette, ligger blobbene igjen
  // som ureferert soppel som GitHub rydder selv, og branchen er uroert.
  await kall(`${API}/repos/${repo}/git/refs/heads/${branch}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha })
  }, hent);

  return { sha: commit.sha, antall: filer.length };
}
```

- [ ] **Step 4: Kjør hele testsuiten**

Run: `npm test`
Expected: PASS, 39 tester.

- [ ] **Step 5: Commit**

```bash
git add api/_git.mjs test/git.test.mjs
git commit -m "$(cat <<'EOF'
Ett commit for tekst og bilder via Git Trees API

Contents API tar én fil per kall, saa ett bildebytte pluss én tekstendring
ble to commits og to Vercel-bygg. Refen flyttes til slutt, saa en feil
underveis lar branchen staa uroert.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `api/save.js`, innhold og bilder i ett commit

Klienten regner ut den endelige bildestien selv (Task 10) og sender bytene med. Serveren må derfor validere stien, ellers er dette en sti-traversering.

**Files:**
- Create: `api/save.js`, `api/_stier.mjs`
- Test: `test/save-stier.test.mjs`

**Interfaces:**
- Consumes: `checkPin` (Task 6), `commitFiler`, `lesFil` (Task 7)
- Produces:
  - `trygStI(sti: string) => string|null` fra `api/_stier.mjs`. Returnerer stien hvis den er lovlig, ellers `null`.
  - `POST /api/save` tar `{ page, pin, edits, bilder?: [{ sti, data }] }` og svarer `{ ok, rebuildMs, sha, note }`.

- [ ] **Step 1: Skriv de feilende testene for stivalidering**

```js
// test/save-stier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trygStI, MAKS_PAYLOAD } from '../api/_stier.mjs';

test('godtar en vanlig opplastingssti', () => {
  assert.equal(trygStI('static/assets/uploads/1757000000-bilde.jpg'), 'static/assets/uploads/1757000000-bilde.jpg');
});

test('avviser sti utenfor uploads-mappa', () => {
  assert.equal(trygStI('api/save.js'), null);
  assert.equal(trygStI('static/assets/img/logo.svg'), null);
});

test('avviser sti-traversering', () => {
  assert.equal(trygStI('static/assets/uploads/../../../api/save.js'), null);
  assert.equal(trygStI('static/assets/uploads/..%2Fsave.js'), null);
});

test('avviser tegn utenfor det trygge settet', () => {
  assert.equal(trygStI('static/assets/uploads/bil de.jpg'), null);
  assert.equal(trygStI('static/assets/uploads/bilde;rm.jpg'), null);
});

test('avviser absolutt sti og ledende skraastrek', () => {
  assert.equal(trygStI('/static/assets/uploads/a.jpg'), null);
});

test('avviser filendelser som ikke er bilder', () => {
  assert.equal(trygStI('static/assets/uploads/skript.js'), null);
  assert.equal(trygStI('static/assets/uploads/a.html'), null);
});

test('godtar jpg, jpeg, png, webp, gif og svg', () => {
  for (const e of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']) {
    assert.ok(trygStI(`static/assets/uploads/a.${e}`), e);
  }
});

test('grensen for én publisering er 3,5 MB', () => {
  assert.equal(MAKS_PAYLOAD, 3.5 * 1024 * 1024);
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/save-stier.test.mjs`
Expected: FAIL, `Cannot find module '../api/_stier.mjs'`

- [ ] **Step 3: Skriv `api/_stier.mjs`**

```js
// Klienten regner ut den endelige bildestien selv, slik at den kan skrives inn
// i innholdet i samme runde. Da maa serveren validere stien: uten dette er
// feltet en sti-traversering rett inn i repoet.
export const UPLOAD_PREFIKS = 'static/assets/uploads/';
export const MAKS_PAYLOAD = 3.5 * 1024 * 1024;

const LOVLIG_FILNAVN = /^[A-Za-z0-9._-]+$/;
const LOVLIG_ENDELSE = /\.(jpe?g|png|webp|gif|svg)$/i;

export function trygStI(sti) {
  if (typeof sti !== 'string') return null;
  if (!sti.startsWith(UPLOAD_PREFIKS)) return null;

  const navn = sti.slice(UPLOAD_PREFIKS.length);
  // Ingen undermapper, ingen prosentkoding, ingen punktum-punktum.
  if (!LOVLIG_FILNAVN.test(navn)) return null;
  if (navn.includes('..')) return null;
  if (!LOVLIG_ENDELSE.test(navn)) return null;

  return sti;
}
```

- [ ] **Step 4: Kjør stitestene**

Run: `node --test test/save-stier.test.mjs`
Expected: PASS, 8 tester.

- [ ] **Step 5: Skriv `api/save.js`**

```js
// Publisering: innhold og eventuelle nye bilder i ETT commit.
// Vercel bygger, og besoekende faar ren statisk HTML.
import { checkPin } from './_rateLimit.mjs';
import { commitFiler, lesFil } from './_git.mjs';
import { trygStI, MAKS_PAYLOAD } from './_stier.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metoden er ikke tillatt' });

  const { page, pin, edits, bilder = [] } = req.body || {};

  const sjekk = checkPin(req, pin, process.env.ADMIN_PIN);
  if (!sjekk.ok) return res.status(sjekk.status).json({ ok: false, error: sjekk.error });

  if (!page || !edits) return res.status(400).json({ ok: false, error: 'Mangler page eller edits' });

  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!repo || !token) return res.status(500).json({ ok: false, error: 'Mangler GITHUB_REPO eller GITHUB_TOKEN på serveren.' });

  const stor = bilder.reduce((sum, b) => sum + String(b.data || '').length, 0);
  if (stor > MAKS_PAYLOAD) {
    return res.status(413).json({
      ok: false,
      error: 'For mye på én gang. Publiser tekstendringene først, så bildene i en runde til.'
    });
  }

  const filer = [];
  for (const b of bilder) {
    const sti = trygStI(b.sti);
    if (!sti) return res.status(400).json({ ok: false, error: `Ulovlig bildesti: ${String(b.sti).slice(0, 60)}` });
    filer.push({ sti, innhold: String(b.data).split(',').pop(), base64: true });
  }

  const innholdSti = `content/${String(page).replace(/[^a-zA-Z0-9_-]/g, '')}.json`;
  const naa = (await lesFil({ repo, branch, token, sti: innholdSti })) || {};
  filer.push({ sti: innholdSti, innhold: JSON.stringify({ ...naa, ...edits }, null, 2) });

  try {
    const { sha } = await commitFiler({
      repo, branch, token,
      melding: `Innhold: ${page}${bilder.length ? ` og ${bilder.length} bilde(r)` : ''} (admin)`,
      filer
    });
    return res.status(200).json({
      ok: true,
      sha,
      // Tid fra push til endringen er ute. Standardverdien er et anslag.
      // Kjør `oppskalert-admin tid` paa prosjektet og sett den maalte verdien
      // i ADMIN_REBUILD_MS. En nedtelling som gaar ut foer siden er klar leser
      // som en feil, og klienten trykker Publiser en gang til.
      rebuildMs: Number(process.env.ADMIN_REBUILD_MS) || 50000,
      note: 'Committet. Vercel bygger og deployer.'
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
}
```

- [ ] **Step 6: Kjør hele testsuiten**

Run: `npm test`
Expected: PASS, 47 tester.

- [ ] **Step 7: Commit**

```bash
git add api/save.js api/_stier.mjs test/save-stier.test.mjs
git commit -m "$(cat <<'EOF'
Publisering: innhold og bilder i ett commit

Klienten regner ut den endelige bildestien selv, saa serveren validerer den
mot uploads-mappa, et trygt tegnsett og en bilde-endelse. Uten den sjekken
er feltet en sti-traversering rett inn i repoet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `editor/edit.css`, admin-UI på variabler

Dagens `edit.css` har 32 hardkodede hex-forekomster av 7 unike verdier, alle hentet fra Schei Restaurering. Hver nye side arver den oransje baren til noen håndretter den.

**Files:**
- Create: `editor/edit.css` (erstatter plassholderen fra Task 5)
- Test: `test/edit-css.test.mjs`

**Interfaces:**
- Consumes: ingenting
- Produces: `editor/edit.css` med fem variabler: `--adm-aksent`, `--adm-flate`, `--adm-tekst`, `--adm-fare`, `--adm-ok`. Hover-varianter avledes med `color-mix`.

- [ ] **Step 1: Skriv den feilende testen**

```js
// test/edit-css.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../editor/edit.css', import.meta.url), 'utf8');

test('ingen hardkodede hex-farger utenfor fallback-verdiene i :root', () => {
  const utenRoot = css.replace(/:root\s*\{[\s\S]*?\}/, '');
  const treff = utenRoot.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(treff, [], `hardkodede farger igjen: ${treff.join(', ')}`);
});

test('alle fem rollene er definert med fallback', () => {
  for (const v of ['--adm-aksent', '--adm-flate', '--adm-tekst', '--adm-fare', '--adm-ok']) {
    assert.match(css, new RegExp(`${v}\\s*:`), `${v} mangler i :root`);
  }
});

test('bruksstedene leser variablene, ikke faste verdier', () => {
  assert.match(css, /\.adm__btn--primary\s*\{[^}]*var\(--adm-aksent\)/);
  assert.match(css, /\.adm\s*\{[^}]*var\(--adm-flate\)/);
});

test('ingen tankestrek i fila', () => {
  assert.equal(css.includes('—'), false);
});
```

- [ ] **Step 2: Kjør testen og se den feile**

Run: `node --test test/edit-css.test.mjs`
Expected: FAIL, plassholderfila mangler alt.

- [ ] **Step 3: Kopier dagens CSS som utgangspunkt**

```bash
cp ~/.claude/skills/website-intelligence-adminpanel-vercel/templates/admin/edit.css editor/edit.css
```

- [ ] **Step 4: Legg `:root`-blokken øverst i `editor/edit.css`**

```css
/* Admin-UI. Fargene er sidens egne: en side som setter --adm-* i sin :root
   faar en admin-bar som hoerer hjemme i designet. Fallbackene under er
   noeytrale med vilje, saa en side som glemmer aa sette dem faar en brukbar
   bar i stedet for en usynlig. */
:root {
  --adm-aksent: #3d6be0;
  --adm-flate:  #1c1b1a;
  --adm-tekst:  #f5f4f2;
  --adm-fare:   #c0392b;
  --adm-ok:     #3f9f6b;
}
```

- [ ] **Step 5: Bytt alle bruksstedene**

Erstatt i resten av fila, alle forekomster:

| Fra | Til |
|---|---|
| `#da762b` | `var(--adm-aksent)` |
| `#e2853c` | `color-mix(in srgb, var(--adm-aksent) 85%, white)` |
| `#f4ecdd` | `var(--adm-tekst)` |
| `#4a4540` | `var(--adm-flate)` |
| `#c0392b` | `var(--adm-fare)` |
| `#3f9f6b` | `var(--adm-ok)` |
| `#4bb87c` | `color-mix(in srgb, var(--adm-ok) 85%, white)` |
| `rgba(218,118,43,X)` | `color-mix(in srgb, var(--adm-aksent) <X*100>%, transparent)` |

Sett i tillegg `background: var(--adm-flate)` og `color: var(--adm-tekst)` på `.adm`.

- [ ] **Step 6: Kjør testen**

Run: `node --test test/edit-css.test.mjs`
Expected: PASS, 4 tester.

- [ ] **Step 7: Commit**

```bash
git add editor/edit.css test/edit-css.test.mjs
git commit -m "$(cat <<'EOF'
Admin-UI paa CSS-variabler i stedet for én kundes farger

32 hardkodede hex-forekomster av 7 unike verdier, alle fra Schei
Restaurering, byttet mot fem roller med noeytral fallback.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `editor/edit.js`, port og utsatt bildeopplasting

Den største enkeltjobben. Motoren portes fra Alphaneg (1195 linjer), som er den eneste kopien med serverside PIN-verifisering.

**Files:**
- Create: `editor/edit.js` (erstatter plassholderen fra Task 5)
- Test: `test/edit-js.test.mjs`

**Interfaces:**
- Consumes: `POST /api/verify-pin`, `POST /api/save` (Task 6, 8)
- Produces: `editor/edit.js`. Publiseringskroppen er `{ page, pin, edits, bilder: [{ sti, data }] }`.

- [ ] **Step 1: Skriv de feilende testene**

Statiske sjekker, siden fila kjører i nettleser og ikke har et DOM her.

```js
// test/edit-js.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../editor/edit.js', import.meta.url), 'utf8');

test('ingen kall til det fjernede save-image-endepunktet', () => {
  assert.equal(js.includes('/api/save-image'), false);
});

test('chat-assistenten er av med mindre siden slaar den paa', () => {
  assert.match(js, /CHAT_PAA\s*=\s*[^;]*data-admin-chat/);
  assert.equal(/CHAT_PAA\s*=\s*true\s*;/.test(js), false);
});

test('publisering sender bilder sammen med teksten', () => {
  assert.match(js, /bilder:\s*ventendeBilder/);
});

test('PIN verifiseres mot server foer editoren bygges', () => {
  assert.match(js, /verifyPin\(storedPin\)/);
});

test('ES5-nivaa: ingen pilfunksjoner, let eller const', () => {
  const utenKommentarer = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/=>/.test(utenKommentarer), false, 'pilfunksjon funnet');
  assert.equal(/\b(let|const)\s/.test(utenKommentarer), false, 'let eller const funnet');
});

test('ingen tankestrek i fila', () => {
  assert.equal(js.includes('—'), false);
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/edit-js.test.mjs`
Expected: FAIL, plassholderfila mangler alt.

- [ ] **Step 3: Kopier Alphaneg-motoren som utgangspunkt**

```bash
cp "$HOME/Desktop/Antigravity/Nettsider/Alphaneg/static/admin/edit.js" editor/edit.js
```

- [ ] **Step 4: Sett chat-assistenten av som standard**

Finn blokken merket `CHAT ASSISTANT` og sett en bryter øverst i fila. Siden slår den på med `<body data-admin-chat>`.

```js
  // Chat-assistenten er av med mindre siden ber om den. Den koster et
  // /api/chat-endepunkt og en API-noekkel, og de fleste kundesider trenger
  // den ikke.
  var CHAT_PAA = !!document.body.getAttribute('data-admin-chat');
```

Pakk oppbyggingen av chat-UI-et i `if (CHAT_PAA) { … }`.

- [ ] **Step 5: Bytt umiddelbar opplasting mot utsatt**

Erstatt hele `uploadImage` (linje 589 og utover i kopien) med:

```js
  // Bilder lastes IKKE opp med det samme lenger. De legges til side og reiser
  // med publiseringen, slik at tekst og bilder blir ett commit og ett
  // Vercel-bygg. Bivirkning verdt aa ha: et bilde klienten angrer paa havner
  // aldri i repoet.
  var ventendeBilder = [];

  function uploadImage(file, el, onUrl) {
    status.textContent = 'Behandler bilde …';
    prepImage(file, function (data, navn) {
      var trygtNavn = navn.replace(/[^a-zA-Z0-9._-]/g, '_');
      var filnavn = Date.now() + '-' + trygtNavn;
      var url = '/assets/uploads/' + filnavn;

      ventendeBilder.push({ sti: 'static/assets/uploads/' + filnavn, data: data });

      pushUndo();
      // Vis data-URL-en med en gang saa klienten ser bildet, men skriv den
      // ENDELIGE stien i data-img-url. Det er den som havner i innholdet ved
      // publisering, og den peker paa fila commit-et legger igjen.
      if (onUrl) { onUrl(url, data); }
      else { applyImage(el, data); el.setAttribute('data-img-url', url); }
      status.textContent = '✓ Bilde klart. Husk å Publisere.';
    });
  }
```

Oppdater hvert kallsted som brukte `onUrl(res.url)` til å ta imot `(url, forhaandsvisning)` og bruke `forhaandsvisning` som `src` og `url` i `data-img-url`.

- [ ] **Step 6: Send bildene med publiseringen**

I `publish()`, bytt kroppen:

```js
      body: JSON.stringify({
        page: pageKey,
        pin: currentPin(),
        edits: edits,
        bilder: ventendeBilder
      })
```

og tøm lista når publiseringen lyktes:

```js
        if (res.ok && res.j.ok) {
          ventendeBilder = [];
          showPublishModal(Math.round((res.j.rebuildMs || 50000) / 1000));
          return;
        }
```

- [ ] **Step 7: Håndter for stor publisering**

I feilgrenen, legg til før `offerPinRetry`:

```js
        if (res.status === 413) {
          status.textContent = '✗ ' + res.j.error;
          return;
        }
```

- [ ] **Step 8: Kjør hele testsuiten**

Run: `npm test`
Expected: PASS, 57 tester.

- [ ] **Step 9: Commit**

```bash
git add editor/edit.js test/edit-js.test.mjs
git commit -m "$(cat <<'EOF'
Editoren portet fra Alphaneg, med utsatt bildeopplasting

Bilder legges til side og reiser med publiseringen, saa tekst og bilder blir
ett commit. Et bilde klienten angrer paa havner dermed aldri i repoet.
Chat-assistenten er av med mindre siden setter data-admin-chat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `doctor`, regelsettet som håndhever byggereglene

**Files:**
- Create: `doctor/_hjelpere.mjs`, `doctor/index.mjs`, `doctor/regler/ingen-inline-margin.mjs`, `doctor/regler/strong-og-b.mjs`, `doctor/regler/admin-tokens.mjs`, `doctor/regler/ingen-google-fonts.mjs`, `doctor/regler/malt-byggetid.mjs`, `doctor/regler/tankestrek.mjs`, `doctor/regler/ikke-x-men-y.mjs`
- Test: `test/doctor.test.mjs`

**Interfaces:**
- Consumes: ingenting
- Produces:
  - Hver regel: `export default { navn: string, alvor: 'feil'|'varsel', sjekk(prosjekt) => Funn[] }` der `Funn` er `{ fil: string, linje: number, melding: string }` og `prosjekt` er `{ rot, filer: [{ sti, tekst }] }`.
  - `doctor/_hjelpere.mjs`: `perLinje(prosjekt, filter: (sti) => bool, test: (linje, fil) => string|null) => Funn[]`
  - `doctor/index.mjs`: `kjor(prosjekt, regler?) => { feil: Funn[], varsler: Funn[] }` og `STANDARDREGLER`

`perLinje` ligger i sin egen fil fordi reglene importerer den og `index.mjs`
importerer reglene. La den ligge i `index.mjs`, ble importen sirkulaer.

- [ ] **Step 1: Skriv de feilende testene**

```js
// test/doctor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kjor } from '../doctor/index.mjs';
import margin from '../doctor/regler/ingen-inline-margin.mjs';
import strongB from '../doctor/regler/strong-og-b.mjs';
import tokens from '../doctor/regler/admin-tokens.mjs';
import fonts from '../doctor/regler/ingen-google-fonts.mjs';
import byggetid from '../doctor/regler/malt-byggetid.mjs';
import strek from '../doctor/regler/tankestrek.mjs';
import ikkeXmenY from '../doctor/regler/ikke-x-men-y.mjs';

const p = (filer) => ({ rot: '/x', filer });

test('inline margin paa et listeelement er en feil', () => {
  const funn = margin.sjekk(p([{ sti: 'templates/a.html', tekst: '<li data-list-item style="margin-bottom:1rem">x</li>' }]));
  assert.equal(funn.length, 1);
  assert.equal(funn[0].linje, 1);
  assert.match(funn[0].melding, /gap/);
});

test('gap i en flex-wrapper er greit', () => {
  assert.deepEqual(margin.sjekk(p([{ sti: 'a.css', tekst: '.kort-stabel{display:flex;gap:1rem}' }])), []);
});

test('strong uten b er en feil, siden Bold setter inn b foer publisering', () => {
  const funn = strongB.sjekk(p([{ sti: 'static/css/site.css', tekst: '.cv strong { color: #fff }' }]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /\bb\b/);
});

test('strong og b sammen er greit', () => {
  assert.deepEqual(strongB.sjekk(p([{ sti: 'a.css', tekst: '.cv strong, .cv b { color:#fff }' }])), []);
});

test('manglende admin-tokens er en feil', () => {
  const funn = tokens.sjekk(p([{ sti: 'static/css/tokens.css', tekst: ':root{--font-brod:x}' }]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /--adm-aksent/);
});

test('alle fem tokens til stede er greit', () => {
  const css = ':root{--adm-aksent:#111;--adm-flate:#222;--adm-tekst:#333;--adm-fare:#444;--adm-ok:#555}';
  assert.deepEqual(tokens.sjekk(p([{ sti: 'static/css/tokens.css', tekst: css }])), []);
});

test('google fonts er en feil', () => {
  const funn = fonts.sjekk(p([{ sti: 'templates/a.html', tekst: '<link href="https://fonts.googleapis.com/css2?family=Inter">' }]));
  assert.equal(funn.length, 1);
});

test('tankestrek er et varsel, ikke en byggefeil', () => {
  assert.equal(strek.alvor, 'varsel');
  const funn = strek.sjekk(p([{ sti: 'content/index.json', tekst: '{"a":"noe — noe annet"}' }]));
  assert.equal(funn.length, 1);
});

test('manglende .admin-tid er et varsel om at byggetiden aldri ble maalt', () => {
  const funn = byggetid.sjekk(p([{ sti: 'templates/a.html', tekst: '<h1>x</h1>' }]));
  assert.equal(byggetid.alvor, 'varsel');
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /oppskalert-admin tid/);
});

test('.admin-tid til stede er greit', () => {
  assert.deepEqual(byggetid.sjekk(p([{ sti: '.admin-tid', tekst: '48000\n' }])), []);
});

test('«ikke X, men Y» flagges til gjennomlesing', () => {
  assert.equal(ikkeXmenY.alvor, 'varsel');
  const funn = ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Det handler ikke om pris."}' }]));
  assert.equal(funn.length, 1);
});

test('en ekte motstilling flagges ogsaa, og det er meningen', () => {
  // Regelen kan ikke skille en tic fra ekte informasjon. Derfor varsel og
  // ikke feil: hvert treff skal leses, ikke rettes blindt.
  const funn = ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Klipp 2 kommer paa en onsdag, ikke en loerdag."}' }]));
  assert.equal(funn.length, 1);
});

test('vanlig tekst uten moensteret gaar rent gjennom', () => {
  assert.deepEqual(ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Vi tar befaring i hele Harstad."}' }])), []);
});

test('kjor skiller feil fra varsler', () => {
  const res = kjor(
    p([{ sti: 'content/a.json', tekst: '{"a":"x — y"}' }, { sti: 'templates/a.html', tekst: '<li data-list-item style="margin:1rem">x</li>' }]),
    [margin, strek]
  );
  assert.equal(res.feil.length, 1);
  assert.equal(res.varsler.length, 1);
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/doctor.test.mjs`
Expected: FAIL, `Cannot find module '../doctor/index.mjs'`

- [ ] **Step 3: Skriv `doctor/index.mjs`**

```js
// doctor/_hjelpere.mjs
// Egen fil fordi reglene importerer denne og index.mjs importerer reglene.
// La den ligge i index.mjs, ble importen sirkulaer.
export function perLinje(prosjekt, filter, test) {
  const funn = [];
  for (const fil of prosjekt.filer) {
    if (!filter(fil.sti)) continue;
    fil.tekst.split('\n').forEach((linje, i) => {
      const melding = test(linje, fil);
      if (melding) funn.push({ fil: fil.sti, linje: i + 1, melding });
    });
  }
  return funn;
}
```

```js
// doctor/index.mjs
// Kjoerer regelsettet mot et prosjekt. Regler er rene funksjoner over
// { rot, filer }, saa de kan testes uten aa skrive en eneste fil.
import margin from './regler/ingen-inline-margin.mjs';
import strongB from './regler/strong-og-b.mjs';
import tokens from './regler/admin-tokens.mjs';
import fonts from './regler/ingen-google-fonts.mjs';
import byggetid from './regler/malt-byggetid.mjs';
import strek from './regler/tankestrek.mjs';
import ikkeXmenY from './regler/ikke-x-men-y.mjs';

export const STANDARDREGLER = [margin, strongB, tokens, fonts, byggetid, strek, ikkeXmenY];

export function kjor(prosjekt, regler = STANDARDREGLER) {
  const feil = [], varsler = [];
  for (const regel of regler) {
    for (const funn of regel.sjekk(prosjekt)) {
      (regel.alvor === 'feil' ? feil : varsler).push({ ...funn, regel: regel.navn });
    }
  }
  return { feil, varsler };
}
```

- [ ] **Step 4: Skriv de fem reglene**

```js
// doctor/regler/ingen-inline-margin.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'ingen-inline-margin',
  alvor: 'feil',
  sjekk: (p) => perLinje(p, (s) => s.endsWith('.html'), (linje) =>
    /data-list-item/.test(linje) && /style="[^"]*margin/i.test(linje)
      ? 'Inline margin paa et listeelement gir ujevne mellomrom naar klienten legger til eller flytter et kort. Bruk en flex-wrapper med gap i CSS.'
      : null)
};
```

```js
// doctor/regler/strong-og-b.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'strong-og-b',
  alvor: 'feil',
  sjekk: (p) => perLinje(p, (s) => s.endsWith('.css'), (linje) =>
    /\bstrong\b/.test(linje) && !/\bb\b\s*[,{]/.test(linje) && /\{/.test(linje)
      ? 'CSS som styler strong maa ogsaa style b. Bold i editoren setter inn <b>, og det normaliseres til <strong> foerst ved publisering, saa nyfetet tekst ser feil ut inntil da.'
      : null)
};
```

```js
// doctor/regler/admin-tokens.mjs
const KREVDE = ['--adm-aksent', '--adm-flate', '--adm-tekst', '--adm-fare', '--adm-ok'];

export default {
  navn: 'admin-tokens',
  alvor: 'feil',
  sjekk: (p) => {
    const allCss = p.filer.filter((f) => f.sti.endsWith('.css')).map((f) => f.tekst).join('\n');
    const mangler = KREVDE.filter((v) => !allCss.includes(v));
    return mangler.length
      ? [{ fil: 'static/css/', linje: 0, melding: `Admin-baren mangler farger: ${mangler.join(', ')}. Sett dem i sidens :root.` }]
      : [];
  }
};
```

```js
// doctor/regler/ingen-google-fonts.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'ingen-google-fonts',
  alvor: 'feil',
  sjekk: (p) => perLinje(p, (s) => /\.(html|css)$/.test(s), (linje) =>
    /fonts\.(googleapis|gstatic)\.com/.test(linje)
      ? 'Google Fonts logger besoekendes IP hos en tredjepart, som motsier personvernsiden. Selvhost fonten fra ~/.claude/assets/fonts/.'
      : null)
};
```

```js
// doctor/regler/malt-byggetid.mjs
// Nedtellingen etter Publiser er et loefte til klienten. Gaar den ut foer siden
// er klar, leser det som en feil og klienten trykker Publiser en gang til.
export default {
  navn: 'malt-byggetid',
  alvor: 'varsel',
  sjekk: (p) => p.filer.some((f) => f.sti === '.admin-tid')
    ? []
    : [{ fil: '.admin-tid', linje: 0, melding: 'Byggetiden er aldri maalt paa dette prosjektet. Kjoer `oppskalert-admin tid` og sett ADMIN_REBUILD_MS i Vercel.' }]
};
```

```js
// doctor/regler/ikke-x-men-y.mjs
// Moensteret fra CLAUDE.md. Varsel og ikke feil med vilje: en ekte motstilling
// ser likedan ut for et regulaert uttrykk. «Klipp 2 kommer paa en onsdag, ikke
// en loerdag» er informasjon og skal staa. Hvert treff skal leses.
import { perLinje } from '../_hjelpere.mjs';

const MOENSTER = /er ikke [^.,]{2,40}[.,] ?(det|den|dette) er|ikke bare [^.,]{2,40},? ?men|handler ikke om|, ikke (en|et|å) [a-zæøå]+/i;

export default {
  navn: 'ikke-x-men-y',
  alvor: 'varsel',
  sjekk: (p) => perLinje(p, (s) => /\.(html|json|md)$/.test(s), (linje) =>
    MOENSTER.test(linje)
      ? 'Mulig «ikke X, men Y». Les setningen: baerer negasjonen informasjon, skal den staa. Gjoer den ikke det, si Y og la X ligge.'
      : null)
};
```

```js
// doctor/regler/tankestrek.mjs
import { perLinje } from '../_hjelpere.mjs';

export default {
  navn: 'tankestrek',
  alvor: 'varsel',
  sjekk: (p) => perLinje(p, (s) => /\.(html|json|md)$/.test(s), (linje) =>
    linje.includes('—')
      ? 'Tankestrek funnet. Bruk komma, kolon eller punktum.'
      : null)
};
```

- [ ] **Step 5: Kjør hele testsuiten**

Run: `npm test`
Expected: PASS, 71 tester.

- [ ] **Step 6: Commit**

```bash
git add doctor/ test/doctor.test.mjs
git commit -m "$(cat <<'EOF'
doctor: regelsett som haandhever byggereglene

Fem regler, én fil hver, rene funksjoner over { rot, filer } saa de testes
uten aa skrive filer. Tankestrek er varsel og ikke byggefeil, siden en ekte
motstilling ser likedan ut for et regulaert uttrykk.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `bin/oppskalert-admin.mjs`, CLI-en

**Files:**
- Create: `bin/oppskalert-admin.mjs`, `bin/_les-prosjekt.mjs`
- Test: `test/cli.test.mjs`

**Interfaces:**
- Consumes: `kjor`, `STANDARDREGLER` (Task 11), `build` (Task 5)
- Produces:
  - `lesProsjekt(rot) => { rot, filer: [{ sti, tekst }] }` fra `bin/_les-prosjekt.mjs`. Leser `templates/`, `static/`, `content/`. Hopper over `node_modules`, `dist`, `.git`.
  - `oppskalert-admin doctor [sti]` avslutter med kode 1 hvis det finnes feil, 0 ellers. Varsler skrives ut, men endrer ikke koden.
  - `oppskalert-admin init [sti]` skriver `api/save.js`, `api/verify-pin.js`, `build.mjs` og legger `--adm-*` i `static/css/tokens.css`.
  - `oppskalert-admin tid [ms]` forklarer hvordan ett publiseringsløp måles, og skriver `.admin-tid` når tallet gis.
  - `oppskalert-admin dev` starter den lokale redigeringsløkken på port 8899.

- [ ] **Step 1: Skriv de feilende testene**

```js
// test/cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lesProsjekt } from '../bin/_les-prosjekt.mjs';

const CLI = new URL('../bin/oppskalert-admin.mjs', import.meta.url).pathname;

function prosjekt(htmlInnhold) {
  const rot = mkdtempSync(join(tmpdir(), 'oa-cli-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'static', 'css'), { recursive: true });
  mkdirSync(join(rot, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'index.html'), htmlInnhold);
  writeFileSync(join(rot, 'static', 'css', 'tokens.css'),
    ':root{--adm-aksent:#1;--adm-flate:#2;--adm-tekst:#3;--adm-fare:#4;--adm-ok:#5}');
  writeFileSync(join(rot, 'node_modules', 'x', 'stor.html'), '<li data-list-item style="margin:1rem">');
  return rot;
}

test('lesProsjekt hopper over node_modules', () => {
  const rot = prosjekt('<h1>ok</h1>');
  assert.equal(lesProsjekt(rot).filer.some((f) => f.sti.includes('node_modules')), false);
});

test('doctor avslutter med 0 naar alt er rent', () => {
  const rot = prosjekt('<h1 data-edit="t">ok</h1>');
  const ut = execFileSync('node', [CLI, 'doctor', rot], { encoding: 'utf8' });
  assert.match(ut, /Ingen feil/);
});

test('doctor avslutter med 1 og navngir regelen ved feil', () => {
  const rot = prosjekt('<li data-list-item style="margin-bottom:1rem">x</li>');
  try {
    execFileSync('node', [CLI, 'doctor', rot], { encoding: 'utf8' });
    assert.fail('skulle avsluttet med kode 1');
  } catch (e) {
    assert.equal(e.status, 1);
    assert.match(e.stdout, /ingen-inline-margin/);
  }
});

test('init skriver api-skallene og build.mjs', () => {
  const rot = prosjekt('<h1>ok</h1>');
  execFileSync('node', [CLI, 'init', rot], { encoding: 'utf8' });
  assert.ok(existsSync(join(rot, 'api', 'save.js')));
  assert.ok(existsSync(join(rot, 'api', 'verify-pin.js')));
  assert.match(readFileSync(join(rot, 'api', 'save.js'), 'utf8'), /oppskalert-admin\/api\/save\.js/);
  assert.match(readFileSync(join(rot, 'build.mjs'), 'utf8'), /oppskalert-admin\/build/);
});

test('dev bruker samme stivalidering som produksjon', async () => {
  const { trygStI } = await import('../api/_stier.mjs');
  assert.equal(trygStI('static/assets/uploads/../../api/save.js'), null);
  assert.equal(trygStI('static/assets/uploads/ok.jpg'), 'static/assets/uploads/ok.jpg');
});

test('init overskriver ikke en eksisterende fil', () => {
  const rot = prosjekt('<h1>ok</h1>');
  mkdirSync(join(rot, 'api'));
  writeFileSync(join(rot, 'api', 'save.js'), '// min egen');
  execFileSync('node', [CLI, 'init', rot], { encoding: 'utf8' });
  assert.equal(readFileSync(join(rot, 'api', 'save.js'), 'utf8'), '// min egen');
});
```

- [ ] **Step 2: Kjør testene og se dem feile**

Run: `node --test test/cli.test.mjs`
Expected: FAIL, `Cannot find module '../bin/_les-prosjekt.mjs'`

- [ ] **Step 3: Skriv `bin/_les-prosjekt.mjs`**

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const HOPP_OVER = new Set(['node_modules', 'dist', '.git', '.vercel', '.output', '.nuxt']);
const LES = /\.(html|css|json|js|mjs|md)$/;

export function lesProsjekt(rot) {
  const filer = [];
  (function gaa(mappe) {
    for (const navn of readdirSync(mappe)) {
      if (HOPP_OVER.has(navn) || navn.startsWith('.')) continue;
      const full = join(mappe, navn);
      if (statSync(full).isDirectory()) gaa(full);
      else if (LES.test(navn)) filer.push({ sti: relative(rot, full), tekst: readFileSync(full, 'utf8') });
    }
  })(rot);
  return { rot, filer };
}
```

- [ ] **Step 4: Skriv `bin/oppskalert-admin.mjs`**

```js
#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createServer } from 'node:http';
import { build } from '../build/index.mjs';
import { trygStI } from '../api/_stier.mjs';
import { kjor } from '../doctor/index.mjs';
import { lesProsjekt } from './_les-prosjekt.mjs';

const [, , kommando, sti] = process.argv;
const rot = sti || process.cwd();

const SKALL = {
  'api/save.js': "export { default } from 'oppskalert-admin/api/save.js';\n",
  'api/verify-pin.js': "export { default } from 'oppskalert-admin/api/verify-pin.js';\n",
  'build.mjs': "import { build } from 'oppskalert-admin/build';\n\nbuild();\n"
};

const TOKENS = `
/* Admin-baren arver sidens farger. Bytt verdiene til sidens egne. */
:root {
  --adm-aksent: #3d6be0;
  --adm-flate:  #1c1b1a;
  --adm-tekst:  #f5f4f2;
  --adm-fare:   #c0392b;
  --adm-ok:     #3f9f6b;
}
`;

function init() {
  for (const [rel, innhold] of Object.entries(SKALL)) {
    const full = join(rot, rel);
    if (existsSync(full)) { console.log(`  hopper over ${rel} (finnes fra foer)`); continue; }
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, innhold);
    console.log(`  skrev ${rel}`);
  }
  const tokensFil = join(rot, 'static/css/tokens.css');
  mkdirSync(join(rot, 'static/css'), { recursive: true });
  if (!existsSync(tokensFil)) writeFileSync(tokensFil, TOKENS.trimStart());
  else if (!readFileSync(tokensFil, 'utf8').includes('--adm-aksent')) appendFileSync(tokensFil, TOKENS);
  console.log('\nFerdig. Sett ADMIN_PIN, GITHUB_REPO og GITHUB_TOKEN i Vercel.');
}

function doctor() {
  const { feil, varsler } = kjor(lesProsjekt(rot));
  for (const v of varsler) console.log(`  varsel  ${v.fil}:${v.linje}  [${v.regel}] ${v.melding}`);
  for (const f of feil) console.log(`  FEIL    ${f.fil}:${f.linje}  [${f.regel}] ${f.melding}`);
  if (!feil.length) console.log(`\nIngen feil. ${varsler.length} varsel(er) til gjennomlesing.`);
  process.exit(feil.length ? 1 : 0);
}

function tid() {
  console.log('Maaler ett publiseringsloep.');
  console.log('1. Gjoer en liten endring i admin og trykk Publiser.');
  console.log('2. Ta tiden fra Publiser til endringen er ute paa sida.');
  console.log('3. Sett ADMIN_REBUILD_MS i Vercel til den maalte verdien i millisekunder.');
  console.log('\nEn nedtelling som gaar ut foer siden er klar leser som en feil,');
  console.log('og klienten trykker Publiser en gang til.');
  console.log('\nNaar du har tallet: oppskalert-admin tid <millisekunder>');
  if (/^\d+$/.test(String(sti))) {
    writeFileSync(join(rot === sti ? process.cwd() : rot, '.admin-tid'), `${sti}\n`);
    console.log(`\nSkrev .admin-tid med ${sti} ms.`);
  }
}

// Lokal redigeringsloekke uten Vercel. Serverer dist/, og POST /api/save
// skriver content/<side>.json og bygger om. Det er det en deploy gjoer, uten
// ventetiden. Samme trygStI som produksjon, saa valideringen ikke divergerer.
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon'
};

function dev() {
  const PORT = Number(process.env.PORT) || 8899;
  const PIN = process.env.ADMIN_PIN || '1234';
  build({ rot });

  createServer((req, res) => {
    const svar = (kode, kropp) => {
      res.writeHead(kode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(kropp));
    };

    if (req.method === 'POST' && (req.url === '/api/save' || req.url === '/api/verify-pin')) {
      const biter = [];
      req.on('data', (c) => biter.push(c));
      req.on('end', () => {
        let kropp = {};
        try { kropp = JSON.parse(Buffer.concat(biter).toString()); } catch {}
        if (kropp.pin !== PIN) return svar(401, { ok: false, error: 'Feil PIN.' });
        if (req.url === '/api/verify-pin') return svar(200, { ok: true });
        if (!kropp.page || !kropp.edits) return svar(400, { ok: false, error: 'Mangler page eller edits' });

        for (const b of kropp.bilder || []) {
          const trygg = trygStI(b.sti);
          if (!trygg) return svar(400, { ok: false, error: `Ulovlig bildesti: ${b.sti}` });
          mkdirSync(join(rot, 'static/assets/uploads'), { recursive: true });
          writeFileSync(join(rot, trygg), Buffer.from(String(b.data).split(',').pop(), 'base64'));
        }

        mkdirSync(join(rot, 'content'), { recursive: true });
        const f = join(rot, 'content', `${kropp.page}.json`);
        const naa = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
        writeFileSync(f, JSON.stringify({ ...naa, ...kropp.edits }, null, 2));
        build({ rot });
        svar(200, { ok: true, rebuildMs: 400, note: 'Bygget lokalt' });
      });
      return;
    }

    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    if (!extname(rel)) rel += '.html';
    const fil = join(rot, 'dist', rel);
    if (!fil.startsWith(join(rot, 'dist')) || !existsSync(fil)) {
      res.writeHead(404); return res.end('Ikke funnet');
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(fil)] || 'application/octet-stream' });
    res.end(readFileSync(fil));
  }).listen(PORT, () => console.log(`Kjoerer paa http://localhost:${PORT} (PIN ${PIN})`));
}

const kommandoer = { init, doctor, tid, dev };
if (!kommandoer[kommando]) {
  console.log('Bruk: oppskalert-admin <init|doctor|tid|dev> [sti]');
  process.exit(1);
}
kommandoer[kommando]();
```

- [ ] **Step 5: Gjør CLI-en kjørbar og kjør testene**

```bash
chmod +x bin/oppskalert-admin.mjs
npm test
```

Expected: PASS, 77 tester.

- [ ] **Step 6: Commit**

```bash
git add bin/ test/cli.test.mjs
git commit -m "$(cat <<'EOF'
CLI: init, doctor og tid

doctor avslutter med kode 1 ved feil saa den kan staa i et deploy-steg.
Varsler skrives ut uten aa stoppe noe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: README, publisering av repoet, og røyktest mot en ekte side

Prøven på om modellen holder: en ekte side skal kunne bygge og publisere uten at én motorfil håndredigeres.

**Files:**
- Create: `README.md`
- Test: manuell røyktest, beskrevet under

**Interfaces:**
- Consumes: alt over
- Produces: offentlig repo `lobitomaldito/oppskalert-admin`, tag `v1.0.0`

- [ ] **Step 1: Skriv `README.md`**

Må dekke, i denne rekkefølgen: hva pakken gjør på tre linjer; installering i et prosjekt (`npm i` med git-URL, så `npx oppskalert-admin init`); de fire miljøvariablene (`ADMIN_PIN`, `GITHUB_REPO`, `GITHUB_TOKEN`, `GITHUB_BRANCH`) og at `ADMIN_REBUILD_MS` settes fra `oppskalert-admin tid`; instrumenteringsattributtene (`data-edit`, `data-edit-image`, `data-editable-list`, `data-list-item`, `data-list-field`, `data-list-image-field`, `data-content-src`); og en **Kjente begrensninger**-seksjon som sier at IP-sperren ligger i minnet per funksjonsinstans og nullstilles ved kald start, og at skjulte listeelementer finnes i HTML-en med `display:none` og derfor aldri skal brukes til noe som er hemmelig.

- [ ] **Step 2: Opprett det offentlige repoet**

```bash
gh repo create lobitomaldito/oppskalert-admin --public --source=. --remote=origin --push
```

- [ ] **Step 3: Tagg versjon 1.0.0**

```bash
git tag v1.0.0 && git push origin v1.0.0
```

- [ ] **Step 4: Røyktest mot en kopi av en ekte side**

```bash
cp -R "$HOME/Desktop/Antigravity/Nettsider/Schei Restaurering" /tmp/roykttest
cd /tmp/roykttest
rm -rf build.mjs dev-server.mjs static/admin api node_modules dist
npm pkg delete dependencies.node-html-parser
npm i "github:lobitomaldito/oppskalert-admin#v1.0.0"
npx oppskalert-admin init .
npx oppskalert-admin doctor .
node build.mjs
```

Expected: `doctor` melder eventuelle funn i Schei sin HTML (den er skrevet før reglene fantes, så treff er forventet og informativt). `node build.mjs` skriver `dist/index.html` og `dist/tilsalgs.html` med innholdet fra `content/*.json` bakt inn, og `dist/admin/edit.js` finnes.

- [ ] **Step 5: Bekreft at ingen motorfil ble håndredigert**

```bash
cd /tmp/roykttest && git status --short
```

Expected: kun `package.json`, `api/`, `build.mjs` og `static/css/tokens.css` er endret eller nye. Ingenting under `node_modules/oppskalert-admin/`.

- [ ] **Step 6: Commit README**

```bash
cd ~/Desktop/Antigravity/Nettsider/oppskalert-admin
git add README.md
git commit -m "$(cat <<'EOF'
README med installering, attributter og kjente begrensninger

Sier eksplisitt at IP-sperren nullstilles ved kald start, og at skjulte
listeelementer ligger i HTML-en og derfor aldri skal baere noe hemmelig.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

## Neste plan

Seksjonsbiblioteket (13 seksjoner, kontrakt, `init`-stillasering) får sin egen plan når motoren er grønn. Den planen står på grensesnittene fra Task 3, 4 og 11 her: `data-list-field`-konvensjonen, `bakeLister`-oppførselen om mal per indeks, og regelformen i `doctor/regler/`.
