// test/skjema.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../build/index.mjs';

const js = readFileSync(new URL('../editor/skjema.js', import.meta.url), 'utf8');
const editJs = readFileSync(new URL('../editor/edit.js', import.meta.url), 'utf8');

function lagProsjekt() {
  const rot = mkdtempSync(join(tmpdir(), 'oa-skjema-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content'));
  mkdirSync(join(rot, 'static', 'css'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'index.html'), '<html><body><h1 data-edit="t">Standard</h1></body></html>');
  writeFileSync(join(rot, 'content', 'index.json'), JSON.stringify({ t: 'Bakt' }));
  writeFileSync(join(rot, 'static', 'css', 'site.css'), 'body{margin:0}');
  return rot;
}

test('ES5-nivaa: ingen pilfunksjoner, let eller const, ingen template literals utenfor kommentarer', () => {
  const utenKommentarer = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/=>/.test(utenKommentarer), false, 'pilfunksjon funnet');
  assert.equal(/\b(let|const)\s/.test(utenKommentarer), false, 'let eller const funnet');
  assert.equal(/`/.test(utenKommentarer), false, 'template literal funnet');
});

test('ingen tankestrek i fila', () => {
  assert.equal(js.includes('—'), false);
});

test('knappen bygges bak en sjekk paa [data-samling]', () => {
  const vakt = js.indexOf("querySelector('[data-samling]')");
  assert.ok(vakt >= 0, 'fant ingen sjekk paa [data-samling]');

  const lagKnapp = js.indexOf("createElement('button')");
  assert.ok(lagKnapp >= 0, 'fant ikke stedet knappen lages');
  assert.ok(vakt < lagKnapp, 'samlingssjekken maa staa foer knappen lages');

  // Ingen samling paa siden gir ingen knapp i det hele tatt, ikke en skjult en.
  const start = js.slice(js.indexOf('function start'), lagKnapp);
  assert.match(start, /if\s*\(!navn\)\s*return;/, 'mangler tidlig retur naar siden ikke har en samling');
  assert.equal(/hidden\s*=\s*true/.test(start), false, 'knappen skal utelates, ikke skjules');
});

test('overlegget legges paa document.body, utenfor redigeringsomraadet', () => {
  assert.match(js, /document\.body\.appendChild\(overlegg\)/);
  // editRegion() i edit.js er <main>. Overlegget maa aldri havne der inne,
  // for Angre bytter hele innerHTML i det omraadet.
  assert.equal(/querySelector\(['"]main['"]\)/.test(js), false, 'overlegget maa ikke bygges inne i <main>');
});

test('bildet bruker motorens egen prepImage, ikke en kopi', () => {
  assert.equal(/function prepImage/.test(js), false, 'skjema.js definerer sin egen prepImage');
  assert.match(js, /window\.oppskalertAdmin/, 'henter ikke verktoeyet edit.js deler');
  assert.match(js, /\bv\.prepImage\(/, 'kaller ikke den delte prepImage');
  // Bildet skal legges i koe og reise med publiseringen, aldri lastes opp for seg.
  assert.match(js, /ventendeBilder = \[\{ sti: 'static\/assets\/uploads\/'/);
});

test('edit.js deler prepImage og sier fra naar baren staar', () => {
  assert.match(editJs, /window\.oppskalertAdmin\s*=/);
  assert.match(editJs, /prepImage:\s*prepImage/);
  assert.match(editJs, /dispatchEvent\(new Event\('adm:klar'\)\)/);
});

test('publiseringen sender tom edits, bildekoeen og samlingen til /api/save', () => {
  assert.match(js, /fetch\(['"]\/api\/save['"]/);
  assert.match(js, /edits:\s*\{\}/);
  assert.match(js, /bilder:\s*ventendeBilder/);
  assert.match(js, /samling:\s*\{\s*navn:/);
});

test('innlegget baerer feltene serveren og bygget venter seg', () => {
  ['slug', 'tittel', 'ingress', 'brodtekst', 'bilde', 'dato', '_kladd'].forEach((felt) => {
    assert.match(js, new RegExp('\\b' + felt + ':'), 'mangler feltet ' + felt);
  });
});

test('slug lages fra tittelen med norsk translitterasjon', () => {
  assert.match(js, /function lagSlug/);
  assert.match(js, /replace\(\/æ\/g, 'ae'\)/);
  assert.match(js, /replace\(\/ø\/g, 'oe'\)/);
  assert.match(js, /replace\(\/å\/g, 'aa'\)/);
  assert.match(js, /replace\(\/\^-\+\|-\+\$\/g, ''\)/);
});

test('skjema.js havner i dist/admin etter et bygg', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.ok(existsSync(join(rot, 'dist', 'admin', 'skjema.js')));
});
