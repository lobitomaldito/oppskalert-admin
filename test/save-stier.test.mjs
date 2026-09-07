// test/save-stier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trygStI, trygSidenavn, MAKS_PAYLOAD } from '../api/_stier.mjs';

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

test('godtar jpg, jpeg, png, webp og gif', () => {
  for (const e of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
    assert.ok(trygStI(`static/assets/uploads/a.${e}`), e);
  }
});

test('avviser svg, som kan baere kjoerbart script paa kundens eget origin', () => {
  assert.equal(trygStI('static/assets/uploads/logo.svg'), null);
});

// Kroppen sendes som base64, fire tegn per tre byte. Med 3,5 MB dekodet ble den
// 4,54 MB paa traaden, over Vercels grense paa 4,5, og plattformen avviste foer
// handleren kjorte. Da naadde serverens egen 413-tekst aldri klienten.
test('grensen for én publisering er 3,0 MB dekodet, saa kroppen holder seg under Vercels 4,5 MB', () => {
  assert.equal(MAKS_PAYLOAD, 3.0 * 1024 * 1024);
  assert.ok(MAKS_PAYLOAD * 4 / 3 < 4.5 * 1024 * 1024);
});

test('godtar et vanlig sidenavn', () => {
  assert.equal(trygSidenavn('index'), 'index');
  assert.equal(trygSidenavn('om-oss_2'), 'om-oss_2');
});

test('avviser et sidenavn over 100 tegn, som ga ufanget ENAMETOOLONG', () => {
  assert.equal(trygSidenavn('a'.repeat(101)), null);
  assert.equal(trygSidenavn('a'.repeat(100)), 'a'.repeat(100));
});
