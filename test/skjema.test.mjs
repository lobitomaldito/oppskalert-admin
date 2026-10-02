// test/skjema.test.mjs
// editor/skjema.js (inngangene paa nettsiden) og editor/samling.js
// (redigeringssiden). Rene hjelpere i samling.js kjoeres i en vm uten DOM:
// fila eksporterer dem paa window foer den ser etter #samling-app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { build } from '../build/index.mjs';
import { lagSlug } from '../build/samling.mjs';

const js = readFileSync(new URL('../editor/skjema.js', import.meta.url), 'utf8');
const side = readFileSync(new URL('../editor/samling.js', import.meta.url), 'utf8');
const editJs = readFileSync(new URL('../editor/edit.js', import.meta.url), 'utf8');

function hjelpere() {
  const window = {};
  vm.runInNewContext(side, { window, document: { getElementById: () => null } });
  return window.oppskalertSamling;
}

const utenKommentarer = (kilde) => kilde.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

for (const [navn, kilde] of [['skjema.js', js], ['samling.js', side]]) {
  test(`${navn}: ES5, ingen pilfunksjoner, let, const eller template literals`, () => {
    const k = utenKommentarer(kilde);
    assert.equal(/=>/.test(k), false, 'pilfunksjon funnet');
    assert.equal(/\b(let|const)\s/.test(k), false, 'let eller const funnet');
    assert.equal(/`/.test(k), false, 'template literal funnet');
  });

  test(`${navn}: ingen tankestrek`, () => {
    assert.equal(kilde.includes('—'), false);
  });
}

test('skjema.js gjoer ingenting for en besoekende uten PIN', () => {
  const vakt = js.indexOf('if (!pin) return;');
  assert.ok(vakt >= 0, 'fant ingen PIN-vakt');
  assert.ok(vakt < js.indexOf("createElement('style')"), 'stilen legges foer vakten');
  assert.ok(vakt < js.indexOf("createElement('a')"), 'knappene lages foer vakten');
});

test('skjema.js: stor knapp foran lista og Rediger paa innleggssiden, begge til /admin/samling', () => {
  assert.match(js, /querySelectorAll\('\[data-samling\]'\)/);
  assert.match(js, /data-samling-ny/);
  assert.match(js, /getAttribute\('data-samling-innlegg'\)/);
  assert.match(js, /'\/admin\/samling\?navn='/);
});

test('lagSlug i samling.js gir samme slug som lagSlug i build/samling.mjs', () => {
  const { lagSlug: klient } = hjelpere();
  for (const tittel of ['Ærlig øl på Åsen!', '  --Hei--  ', '', 'Blåbær & fløte, 2026', '???', 'Thonet nr. 14']) {
    assert.equal(klient(tittel), lagSlug(tittel), 'ulik slug for ' + JSON.stringify(tittel));
  }
  assert.equal(klient('Ærlig øl på Åsen!'), 'aerlig-oel-paa-aasen');
});

test('broedteksten deles i avsnitt, og < & > kommer ut som synlig tekst', () => {
  const { tekstTilHtml } = hjelpere();
  assert.equal(tekstTilHtml('Første\nlinje\n\nAndre <b>fet</b> & sånn'),
    '<p>Første<br>linje</p><p>Andre &lt;b&gt;fet&lt;/b&gt; &amp; sånn</p>');
  assert.equal(tekstTilHtml('\n\n  \n'), '');
});

test('htmlTilTekst gir tilbake det klienten skrev, saa Rediger ikke endrer teksten', () => {
  const { tekstTilHtml, htmlTilTekst, escapeHtml } = hjelpere();
  const tekst = 'Nyflettet sete.\nPris etter avtale.\n\nMål: 47 & 71 cm <ca>';
  assert.equal(htmlTilTekst(tekstTilHtml(tekst)), tekst);
  assert.equal(htmlTilTekst(escapeHtml('Stol & krakk')), 'Stol & krakk');
  assert.equal(htmlTilTekst('&amp;lt;'), '&lt;');
});

test('samling.js sender bildene med samme kall som innlegget, og konverterer alt til jpg', () => {
  assert.match(side, /bilder: bilder,\s*samling: \{ navn: navn, handling: eksisterende \? 'oppdater' : 'ny'/);
  assert.match(side, /toDataURL\('image\/jpeg'/);
  assert.match(side, /accept: '[^']*\.avif[^']*\.heic/);
});

test('samling.js legger hvit bunn under bildet foer det blir jpg', () => {
  assert.match(side, /ctx\.fillStyle = '#fff';\s*ctx\.fillRect\(0, 0, c\.width, c\.height\);\s*ctx\.drawImage\(kilde/);
});

test('samling.js setter aldri innleggstekst med innerHTML', () => {
  const bruk = side.match(/innerHTML\s*=\s*[^;]+;/g) || [];
  assert.deepEqual([...new Set(bruk)], ["innerHTML = '';"]);
});

test('Cmd/Ctrl+Z i edit.js lar INPUT og TEXTAREA beholde nettleserens tekst-angre', () => {
  const gren = editJs.slice(editJs.indexOf("e.key === 'z'"));
  const unntak = gren.slice(0, gren.indexOf('e.preventDefault()'));
  assert.match(unntak, /tagName === 'INPUT'/);
  assert.match(unntak, /tagName === 'TEXTAREA'/);
  assert.match(unntak, /isContentEditable/);
});

test('skjema.js, samling.js og samling.html havner i dist/admin etter et bygg', () => {
  const rot = mkdtempSync(join(tmpdir(), 'oa-skjema-'));
  mkdirSync(join(rot, 'templates'));
  writeFileSync(join(rot, 'templates', 'index.html'), '<html><body><h1>Hei</h1></body></html>');
  build({ rot });
  for (const f of ['skjema.js', 'samling.js', 'samling.html']) assert.ok(existsSync(join(rot, 'dist', 'admin', f)), f);
});
