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
