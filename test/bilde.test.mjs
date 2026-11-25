// test/bilde.test.mjs
// Den rene delen av logobehandlingen i editor/bilde.js (kjøres i en vm, som i nettleseren).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../editor/bilde.js', import.meta.url), 'utf8'), ctx);
const { renLogo, maal } = ctx.oaBilde;

// Lager et bilde fra rader med tegn: . = hvit, R = rød, w = hvit (inne i det røde), t = gjennomsiktig
function bilde(rader) {
  const h = rader.length, b = rader[0].length, px = new Uint8ClampedArray(b * h * 4);
  const farge = { '.': [255, 255, 255, 255], R: [200, 20, 30, 255], w: [255, 255, 255, 255], t: [0, 0, 0, 0] };
  rader.forEach((r, y) => [...r].forEach((tegn, x) => px.set(farge[tegn], (y * b + x) * 4)));
  return { px, b, h };
}
const alfa = ({ px, b }, x, y) => px[(y * b + x) * 4 + 3];

test('hvit kant blir gjennomsiktig og kuttes, hvitt inne i logoen blir stående', () => {
  const bl = bilde([
    '.......',
    '..RRR..',
    '..RwR..',
    '..RRR..',
    '.......'
  ]);
  const boks = renLogo(bl.px, bl.b, bl.h);
  assert.deepEqual({ ...boks }, { x: 2, y: 1, b: 3, h: 3 });
  assert.equal(alfa(bl, 0, 0), 0, 'kanten er borte');
  assert.equal(alfa(bl, 3, 2), 255, 'hvitt inne i det røde står');
});

test('et bilde som allerede er gjennomsiktig får bare kanten kuttet', () => {
  const bl = bilde([
    'tttt',
    'tR.t',
    'tttt'
  ]);
  const boks = renLogo(bl.px, bl.b, bl.h);
  assert.deepEqual({ ...boks }, { x: 1, y: 1, b: 2, h: 1 });
  assert.equal(alfa(bl, 2, 1), 255, 'hvitt i en gjennomsiktig logo røres ikke');
});

test('helt hvitt bilde gir null', () => {
  const bl = bilde(['...', '...']);
  assert.equal(renLogo(bl.px, bl.b, bl.h), null);
});

test('maal skalerer inn i 400 x 160 og forstørrer aldri', () => {
  assert.deepEqual({ ...maal(800, 160) }, { b: 400, h: 80 });
  assert.deepEqual({ ...maal(300, 300) }, { b: 160, h: 160 });
  assert.deepEqual({ ...maal(120, 40) }, { b: 120, h: 40 });
});
