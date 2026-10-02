import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const js = readFileSync(new URL('../editor/edit.js', import.meta.url), 'utf8');

test('ingen kall til det fjernede save-image-endepunktet', () => {
  assert.equal(js.includes('/api/save-image'), false);
});

test('ingen chat-kode i pakken, siden endepunktet og stilarket ikke finnes', () => {
  assert.equal(/CHAT_PAA|data-admin-chat|\/api\/chat/.test(js), false);
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

test('et trykk paa en samlingslenke navigerer ikke bort under redigering', () => {
  assert.match(js, /closest\('\[data-samling-lenke\]'\)\) e\.preventDefault\(\)/);
});

test('avif og heic kan velges og gjoeres alltid om til jpg foer opplasting', () => {
  assert.match(js, /fileInput\.accept = '[^']*\.avif[^']*\.heic/);
  assert.match(js, /TIL_JPG = \/\^image\\\/\(avif\|heic\|heif\)\$/);
  assert.match(js, /if \(!tilJpg && Math\.max\(sw, sh\) <= 1800/);
});

// Henter en funksjon ut av edit.js og kjoerer den alene. Hele fila kan ikke
// kjoeres i node, editoren bygges foerst etter en PIN-sjekk mot serveren.
function funksjon(navn, globale = {}) {
  const start = js.indexOf('function ' + navn + '(');
  const slutt = js.indexOf('\n  }\n', start) + 4;
  return vm.runInNewContext(js.slice(start, slutt) + '; ' + navn, globale);
}

test('png blir jpg naar bildet ikke har gjennomsiktige piksler', () => {
  const harAlfa = funksjon('harAlfa');
  assert.equal(harAlfa([10, 20, 30, 255, 40, 50, 60, 255]), false);
  assert.equal(harAlfa([10, 20, 30, 255, 40, 50, 60, 254]), true);
  assert.equal(harAlfa([0, 0, 0, 0]), true);
  assert.match(js, /isPng && harAlfa\(ctx\.getImageData\(0, 0, w, h\)\.data\) \? 'image\/png' : 'image\/jpeg'/);
  assert.match(js, /if \(!isPng\) \{ ctx\.fillStyle = '#fff'; ctx\.fillRect\(0, 0, w, h\); \}\s*ctx\.drawImage/);
});

test('ett bilde over grensen er for stort, mange smaa er for mange', () => {
  const koeFeil = funksjon('koeFeil', { MAKS_KOE: 100 });
  assert.equal(koeFeil(50, 0), '');
  assert.equal(koeFeil(100, 0), '');
  assert.match(koeFeil(101, 0), /^✗ Bildet er for stort\./);
  assert.match(koeFeil(101, 40), /^✗ Bildet er for stort\./);
  assert.match(koeFeil(60, 60), /^✗ For mange bilder på én gang\./);
  assert.match(js, /var feil = koeFeil\(Math\.floor\(String\(data\)\.length \* 3 \/ 4\), koeStorrelse\(\)\);/);
});
