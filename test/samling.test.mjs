// test/samling.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagSlug, lesSamlinger, synlige, unikSlug } from '../build/samling.mjs';

// unikSlug er kollisjonsloekka lagSlug alltid har hatt, trukket ut som sin
// egen eksporterte funksjon. lagSlug regenererer en slug fra en TITTEL og
// deconflikterer den; api/save.js har allerede en FERDIG slug fra klienten
// (ingen tittel aa transliterere paa nytt) og trenger bare deconfliktere den
// direkte, saa den kaller unikSlug uten aa gaa via lagSlug.
test('unikSlug lar en unik slug staa uendret', () => {
  assert.equal(unikSlug('nyhet', ['noe-annet']), 'nyhet');
});

test('unikSlug gir -2 og -3 paa samme maate som lagSlug', () => {
  assert.equal(unikSlug('nyhet', ['nyhet']), 'nyhet-2');
  assert.equal(unikSlug('nyhet', ['nyhet', 'nyhet-2']), 'nyhet-3');
});

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
