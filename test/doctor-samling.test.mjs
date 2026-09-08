// test/doctor-samling.test.mjs
// Task 6: to doctor-regler for den valgfrie samlings-funksjonen. Begge skal
// vaere helt tause i et prosjekt uten content/samlinger/, se
// .superpowers/sdd/2026-09-08-oppskalert-admin-samlinger/task-6-brief.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import samlingMal, { samlingFelt } from '../doctor/regler/samling.mjs';

const p = (filer) => ({ rot: '/x', filer });

// --- samling-mal ---

test('samling-mal: en samling uten templates/_innlegg.html er en feil', () => {
  assert.equal(samlingMal.alvor, 'feil');
  const funn = samlingMal.sjekk(p([
    { sti: 'content/samlinger/aktuelt.json', tekst: '[]' }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /_innlegg\.html/);
});

test('samling-mal: intet content/samlinger/ i det hele tatt er taust', () => {
  assert.deepEqual(samlingMal.sjekk(p([
    { sti: 'templates/index.html', tekst: '<h1>Hei</h1>' }
  ])), []);
});

test('samling-mal: baade samling og mal er taust', () => {
  assert.deepEqual(samlingMal.sjekk(p([
    { sti: 'content/samlinger/aktuelt.json', tekst: '[]' },
    { sti: 'templates/_innlegg.html', tekst: '<h1 data-innlegg="tittel">X</h1>' }
  ])), []);
});

// --- samling-felt ---

test('samling-felt: mal med et felt ingen innlegg har er ett varsel', () => {
  assert.equal(samlingFelt.alvor, 'varsel');
  const funn = samlingFelt.sjekk(p([
    { sti: 'templates/_innlegg.html', tekst: '<h1 data-innlegg="felt-som-ikke-finnes">X</h1>' },
    { sti: 'content/samlinger/aktuelt.json', tekst: JSON.stringify([{ slug: 'a', tittel: 'A', dato: '2026-01-01' }]) }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /felt-som-ikke-finnes/);
});

test('samling-felt: mal og innlegg som stemmer overens gir ingen funn', () => {
  const funn = samlingFelt.sjekk(p([
    { sti: 'templates/_innlegg.html', tekst: '<h1 data-innlegg="tittel">X</h1><img data-innlegg-image="bilde">' },
    { sti: 'content/samlinger/aktuelt.json', tekst: JSON.stringify([{ slug: 'a', tittel: 'A', bilde: '/x.jpg', dato: '2026-01-01' }]) }
  ]));
  assert.deepEqual(funn, []);
});

test('samling-felt: prosjekt uten samling gir ingen funn, sjoel om malen finnes', () => {
  assert.deepEqual(samlingFelt.sjekk(p([
    { sti: 'templates/_innlegg.html', tekst: '<h1 data-innlegg="tittel">X</h1>' }
  ])), []);
});

test('samling-felt: felt som finnes i minst ett av flere innlegg teller som dekket', () => {
  const funn = samlingFelt.sjekk(p([
    { sti: 'templates/_innlegg.html', tekst: '<h1 data-innlegg="ingress">X</h1>' },
    { sti: 'content/samlinger/aktuelt.json', tekst: JSON.stringify([
      { slug: 'a', tittel: 'A', dato: '2026-01-01' },
      { slug: 'b', tittel: 'B', ingress: 'Har ingress', dato: '2026-01-02' }
    ]) }
  ]));
  assert.deepEqual(funn, []);
});

test('samling-felt: data-innlegg-image sjekkes paa samme maate som data-innlegg', () => {
  const funn = samlingFelt.sjekk(p([
    { sti: 'templates/_innlegg.html', tekst: '<img data-innlegg-image="mangler-bilde">' },
    { sti: 'content/samlinger/aktuelt.json', tekst: JSON.stringify([{ slug: 'a', tittel: 'A', dato: '2026-01-01' }]) }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /mangler-bilde/);
});

test('samling-felt: odelagt json i en samling stopper ikke regelen', () => {
  assert.doesNotThrow(() => samlingFelt.sjekk(p([
    { sti: 'templates/_innlegg.html', tekst: '<h1 data-innlegg="tittel">X</h1>' },
    { sti: 'content/samlinger/aktuelt.json', tekst: '{ ikke gyldig json' }
  ])));
});
