// test/dekning-omfang.test.mjs
// Tester for de fem avgrensningene fra kalibreringen mot ekte kundesider,
// se .superpowers/sdd/2026-09-07-oppskalert-admin-kontroll/task-3-rapport.md.
// Uten disse traff dekningsreglene topptekst, bunntekst, skjema og <head>
// paa maler uten <main>, og ga 49 % falske positive paa fasit-sidene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import tekst, { dekningListe, dekningRammeTekst } from '../doctor/regler/dekning-tekst.mjs';
import bilde, { dekningRammeBilde } from '../doctor/regler/dekning-bilde.mjs';
import gruppe from '../doctor/regler/gjentatt-gruppe.mjs';

const prosjekt = (filer) => ({ rot: '/x', filer });
const enMal = (sti, html) => prosjekt([{ sti, tekst: html }]);

// --- 1. Hopp over maler editoren aldri aapner ---------------------------

test('en 404.html-mal ties om, uansett hva den inneholder', () => {
  const p = enMal('templates/404.html', '<main><h1>Her var det tomt</h1><img src="/a.jpg"></main>');
  assert.deepEqual(tekst.sjekk(p), []);
  assert.deepEqual(bilde.sjekk(p), []);
  assert.deepEqual(gruppe.sjekk(p), []);
});

test('en mal med meta http-equiv refresh ties om, den er en omdirigeringsstubbe', () => {
  const html = '<html><head><meta http-equiv="refresh" content="0; url=/?edit"></head><main><p>Aapner redigeringsmodus</p></main></html>';
  const p = enMal('templates/admin.html', html);
  assert.deepEqual(tekst.sjekk(p), []);
});

test('meta refresh gjenkjennes uansett fnutt-type og attributtrekkefolge', () => {
  const html = "<meta content='0; url=/' http-equiv='refresh'><main><p>Tekst her</p></main>";
  assert.deepEqual(tekst.sjekk(enMal('templates/x.html', html)), []);
});

test('en vanlig mal som ikke heter 404 og ikke omdirigerer, leses som foer', () => {
  const p = enMal('templates/index.html', '<main><p>Tekst her</p></main>');
  assert.equal(tekst.sjekk(p).length, 1);
});

// --- 2. Hopp over ren plassholdertekst -----------------------------------

test('en bladnode som bare er {{PLASSHOLDER}} ties om', () => {
  const p = enMal('templates/_rad.html', '<main><p>{{FORFATTER_BIO}}</p></main>');
  assert.deepEqual(tekst.sjekk(p), []);
});

test('plassholder med anforselstegn rundt seg ties ogsaa om', () => {
  const p = enMal('templates/_rad.html', '<main><p>«{{ORIGINALTITTEL}}»</p></main>');
  assert.deepEqual(tekst.sjekk(p), []);
});

test('en plassholder som bare er en del av teksten er fortsatt et ekte funn', () => {
  const p = enMal('templates/_rad.html', '<main><p>Stein-Eriks forhandlingsraad #{{NR}}</p></main>');
  assert.equal(tekst.sjekk(p).length, 1);
});

// --- 3. Nedgrader header/footer/nav fra feil til varsel ------------------

test('en udekket p i footer er ikke lenger en feil', () => {
  const p = enMal('templates/index.html', '<footer><p>Tekst her</p></footer>');
  assert.deepEqual(tekst.sjekk(p), []);
});

test('den samme p-en i footer meldes som varsel, med fil og linje', () => {
  const p = enMal('templates/index.html', '<footer>\n<p>Tekst her</p>\n</footer>');
  assert.equal(dekningRammeTekst.alvor, 'varsel');
  const funn = dekningRammeTekst.sjekk(p);
  assert.equal(funn.length, 1);
  assert.equal(funn[0].fil, 'templates/index.html');
  assert.equal(funn[0].linje, 2);
});

test('samme tagg i header og i nav nedgraderes ogsaa', () => {
  const p = enMal('templates/index.html', '<header><h2>Meny her</h2></header><nav><p>Lenke her</p></nav>');
  assert.deepEqual(tekst.sjekk(p), []);
  assert.equal(dekningRammeTekst.sjekk(p).length, 2);
});

test('samme tagg utenfor rammeverket er fortsatt feil, i footer blir den varsel', () => {
  const html = '<body><footer><p>Bunntekst her</p></footer><section><p>Innhold her</p></section></body>';
  const p = enMal('templates/index.html', html);
  const feil = tekst.sjekk(p);
  assert.equal(feil.length, 1);
  assert.match(feil[0].melding, /p/);
  assert.equal(dekningRammeTekst.sjekk(p).length, 1);
});

test('bilder i header og footer nedgraderes paa samme maate', () => {
  const p = enMal('templates/index.html', '<header><img src="/logo.png"></header><footer><img src="/logo.png"></footer>');
  assert.deepEqual(bilde.sjekk(p), []);
  assert.equal(dekningRammeBilde.alvor, 'varsel');
  assert.equal(dekningRammeBilde.sjekk(p).length, 2);
});

test('et bilde utenfor rammeverket er fortsatt feil, i header blir det varsel', () => {
  const html = '<body><header><img src="/logo.png"></header><section><img src="/kunde.jpg"></section></body>';
  const p = enMal('templates/index.html', html);
  assert.equal(bilde.sjekk(p).length, 1);
  assert.equal(dekningRammeBilde.sjekk(p).length, 1);
});

// --- 4. gjentatt-gruppe skal ikke lese <head> -----------------------------

test('tre like meta- eller link-soesken i head meldes ikke', () => {
  const html = '<head><meta property="og:a" content="1"><meta property="og:b" content="2"><meta property="og:c" content="3"></head><body><p>Tekst her</p></body>';
  const p = enMal('templates/index.html', html);
  assert.deepEqual(gruppe.sjekk(p), []);
});

test('samme moenster i body meldes fortsatt', () => {
  const html = '<body><div class="kort">A</div><div class="kort">B</div><div class="kort">C</div></body>';
  const p = enMal('templates/index.html', html);
  assert.equal(gruppe.sjekk(p).length, 1);
});

// --- 5. Gruppenoekkelen skal se bort fra animasjonsklasser ----------------

test('elleve kort med ulike delay-klasser meldes som en gruppe, ikke tre', () => {
  const kort = [];
  for (let i = 0; i < 11; i++) {
    const delay = i === 0 ? '' : ` delay-${i % 3}`;
    kort.push(`<a class="presse-card reveal${delay}" data-edit="k${i}">Klipp ${i}</a>`);
  }
  const html = `<main><div class="presse-liste">${kort.join('')}</div></main>`;
  const p = enMal('templates/presse.html', html);
  const funn = gruppe.sjekk(p);
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /11 like/);
});

test('to grupper som virkelig er ulike, splittes fortsatt', () => {
  const html = '<main><div class="kort-a">A</div><div class="kort-a">B</div><div class="kort-a">C</div>'
    + '<div class="kort-b">D</div><div class="kort-b">E</div><div class="kort-b">F</div></main>';
  const p = enMal('templates/index.html', html);
  assert.equal(gruppe.sjekk(p).length, 2);
});
