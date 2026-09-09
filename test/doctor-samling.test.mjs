// test/doctor-samling.test.mjs
// Task 6: to doctor-regler for den valgfrie samlings-funksjonen. Begge skal
// vaere helt tause i et prosjekt uten content/samlinger/, se
// .superpowers/sdd/2026-09-08-oppskalert-admin-samlinger/task-6-brief.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import samlingMal, { samlingFelt, malUnderstrek } from '../doctor/regler/samling.mjs';
import { kjor, STANDARDREGLER } from '../doctor/index.mjs';
import { lesProsjekt } from '../bin/_les-prosjekt.mjs';

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

// --- mal-understrek ---
//
// build/index.mjs hopper stille over _innlegg.html, men VARSLER i konsollen
// for enhver annen understrek-mal (en navnekollisjon paa et eksisterende
// prosjekt, mest sannsynlig). doctor/_hjelpere.mjs sin malFiler() ekskluderer
// den samme fila fra dekningsreglene, men helt stille. Denne regelen gir
// bygget sitt varsel en tvilling i doctor, saa den som bare kjoerer
// `doctor .` ogsaa faar vite det. Ubetinget av samling: gjelder ethvert
// prosjekt, ikke bare de med content/samlinger/.
test('mal-understrek: en annen understrek-mal enn _innlegg.html er et varsel', () => {
  assert.equal(malUnderstrek.alvor, 'varsel');
  const funn = malUnderstrek.sjekk(p([
    { sti: 'templates/_gammelpartial.html', tekst: '<h1>X</h1>' }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /_gammelpartial\.html/);
});

test('mal-understrek: _innlegg.html hoppes over, det er dens tiltenkte rolle', () => {
  assert.deepEqual(malUnderstrek.sjekk(p([
    { sti: 'templates/_innlegg.html', tekst: '<h1 data-innlegg="tittel">X</h1>' }
  ])), []);
});

test('mal-understrek: en vanlig mal uten understrek gir ingen funn', () => {
  assert.deepEqual(malUnderstrek.sjekk(p([
    { sti: 'templates/index.html', tekst: '<h1>X</h1>' }
  ])), []);
});

// --- hele doctor-regelsettet mot et korrekt bygget samling-prosjekt ---
//
// Reproduserer funnet fra task-reviewen: dekning-tekst, dekning-bilde og
// gjentatt-gruppe (doctor/_hjelpere.mjs sin malFiler()) leste tidligere
// templates/_innlegg.html som en vanlig side og krevde data-edit/
// data-edit-image der, selv om innleggsmaler bevisst bruker
// data-innlegg/data-innlegg-image og aldri bygges som egen side (samme
// underscore-konvensjon som build/index.mjs sin `if (fil.startsWith('_'))
// continue;`). Denne testen bygger et prosjekt paa disk, akkurat som
// test/cli.test.mjs sin prosjekt()-fixture, med en EKTE content/samlinger/-
// fil og en KORREKT instrumentert _innlegg.html (data-innlegg, ikke
// data-edit), og kjorer hele STANDARDREGLER, ikke bare de to
// samling-reglene isolert.
function byggSamlingsprosjekt() {
  const rot = mkdtempSync(join(tmpdir(), 'oa-samling-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'static', 'css'), { recursive: true });
  mkdirSync(join(rot, 'content', 'samlinger'), { recursive: true });

  writeFileSync(join(rot, 'static', 'css', 'tokens.css'),
    ':root{--adm-aksent:#1;--adm-flate:#2;--adm-tekst:#3;--adm-fare:#4;--adm-ok:#5}');

  // Forsiden: minimalt, men dekket, saa den ikke selv gir feil paa
  // dekning-tekst/dekning-bilde. Lenker tokens.css, se admin-tokens.mjs.
  writeFileSync(join(rot, 'templates', 'index.html'), `<!doctype html>
<html><head><link rel="stylesheet" href="/css/tokens.css"></head>
<body>
<h1 data-edit="forside-tittel">Aktuelt</h1>
</body></html>`);

  // Innleggsmalen: data-innlegg/data-innlegg-image, IKKE data-edit. Dette er
  // nettopp instrumenteringen README-seksjonen fra denne tasken dokumenterer.
  writeFileSync(join(rot, 'templates', '_innlegg.html'), `<!doctype html>
<html><head><link rel="stylesheet" href="/css/tokens.css"></head>
<body>
<h1 data-innlegg="tittel">Tittel</h1>
<p data-innlegg="ingress">Ingress</p>
<div data-innlegg="brodtekst">Brodtekst</div>
<img data-innlegg-image="bilde" src="/img/x.jpg" alt="">
</body></html>`);

  writeFileSync(join(rot, 'content', 'samlinger', 'aktuelt.json'), JSON.stringify([
    {
      slug: 'forste-innlegg',
      tittel: 'Forste innlegg',
      ingress: 'En kort ingress.',
      brodtekst: 'Hele brodteksten.',
      bilde: '/img/forste.jpg',
      dato: '2026-01-01',
      _kladd: false
    }
  ]));

  return rot;
}

test('doctor: et korrekt bygget samling-prosjekt gir null feil-funn i hele STANDARDREGLER', () => {
  const rot = byggSamlingsprosjekt();
  const prosjekt = lesProsjekt(rot);
  const { feil } = kjor(prosjekt, STANDARDREGLER);
  assert.deepEqual(feil, []);
});
