// test/doctor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kjor } from '../doctor/index.mjs';
import margin from '../doctor/regler/ingen-inline-margin.mjs';
import strongB from '../doctor/regler/strong-og-b.mjs';
import tokens from '../doctor/regler/admin-tokens.mjs';
import fonts from '../doctor/regler/ingen-google-fonts.mjs';
import byggetid from '../doctor/regler/malt-byggetid.mjs';
import strek from '../doctor/regler/tankestrek.mjs';
import ikkeXmenY from '../doctor/regler/ikke-x-men-y.mjs';

const p = (filer) => ({ rot: '/x', filer });

test('inline margin paa et listeelement er en feil', () => {
  const funn = margin.sjekk(p([{ sti: 'templates/a.html', tekst: '<li data-list-item style="margin-bottom:1rem">x</li>' }]));
  assert.equal(funn.length, 1);
  assert.equal(funn[0].linje, 1);
  assert.match(funn[0].melding, /gap/);
});

test('gap i en flex-wrapper er greit', () => {
  assert.deepEqual(margin.sjekk(p([{ sti: 'a.css', tekst: '.kort-stabel{display:flex;gap:1rem}' }])), []);
});

test('strong uten b er en feil, siden Bold setter inn b foer publisering', () => {
  const funn = strongB.sjekk(p([{ sti: 'static/css/site.css', tekst: '.cv strong { color: #fff }' }]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /\bb\b/);
});

test('strong og b sammen er greit', () => {
  assert.deepEqual(strongB.sjekk(p([{ sti: 'a.css', tekst: '.cv strong, .cv b { color:#fff }' }])), []);
});

test('et klassenavn som slutter paa -b teller ikke som b-elementet', () => {
  const funn = strongB.sjekk(p([{ sti: 'a.css', tekst: '.cv strong, .cv .tab-b { color:#fff }' }]));
  assert.equal(funn.length, 1);
});

test('strong b styrer b inne i strong, ikke fritt b, og skal ikke flagges', () => {
  assert.deepEqual(strongB.sjekk(p([{ sti: 'a.css', tekst: 'strong b { color:#fff }' }])), []);
});

test('manglende admin-tokens er en feil', () => {
  const funn = tokens.sjekk(p([{ sti: 'static/css/tokens.css', tekst: ':root{--font-brod:x}' }]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /--adm-aksent/);
});

test('fem tokens definert og fila lenket fra en mal er greit', () => {
  const css = ':root{--adm-aksent:#111;--adm-flate:#222;--adm-tekst:#333;--adm-fare:#444;--adm-ok:#555}';
  assert.deepEqual(tokens.sjekk(p([
    { sti: 'static/css/tokens.css', tekst: css },
    { sti: 'templates/index.html', tekst: '<link rel="stylesheet" href="/css/tokens.css">' }
  ])), []);
});

test('tokens definert men fila aldri lenket er en feil, siden baren da kjorer paa fallback', () => {
  const css = ':root{--adm-aksent:#111;--adm-flate:#222;--adm-tekst:#333;--adm-fare:#444;--adm-ok:#555}';
  const funn = tokens.sjekk(p([
    { sti: 'static/css/tokens.css', tekst: css },
    { sti: 'templates/index.html', tekst: '<h1>ingen lenke her</h1>' }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /ingen mal lenker/);
});

test('google fonts er en feil', () => {
  const funn = fonts.sjekk(p([{ sti: 'templates/a.html', tekst: '<link href="https://fonts.googleapis.com/css2?family=Inter">' }]));
  assert.equal(funn.length, 1);
});

test('tankestrek er et varsel, ikke en byggefeil', () => {
  assert.equal(strek.alvor, 'varsel');
  const funn = strek.sjekk(p([{ sti: 'content/index.json', tekst: '{"a":"noe — noe annet"}' }]));
  assert.equal(funn.length, 1);
});

test('manglende admin-tid.json er et varsel om at byggetiden aldri ble maalt', () => {
  const funn = byggetid.sjekk(p([{ sti: 'templates/a.html', tekst: '<h1>x</h1>' }]));
  assert.equal(byggetid.alvor, 'varsel');
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /oppskalert-admin tid/);
});

test('admin-tid.json til stede er greit', () => {
  assert.deepEqual(byggetid.sjekk(p([{ sti: 'admin-tid.json', tekst: '{"rebuildMs":48000}' }])), []);
});

test('«ikke X, men Y» flagges til gjennomlesing', () => {
  assert.equal(ikkeXmenY.alvor, 'varsel');
  const funn = ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Det handler ikke om pris."}' }]));
  assert.equal(funn.length, 1);
});

test('en ekte motstilling flagges ogsaa, og det er meningen', () => {
  // Regelen kan ikke skille en tic fra ekte informasjon. Derfor varsel og
  // ikke feil: hvert treff skal leses, ikke rettes blindt.
  const funn = ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Klipp 2 kommer paa en onsdag, ikke en loerdag."}' }]));
  assert.equal(funn.length, 1);
});

test('vanlig tekst uten moensteret gaar rent gjennom', () => {
  assert.deepEqual(ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Vi tar befaring i hele Harstad."}' }])), []);
});

test('kjor skiller feil fra varsler', () => {
  const res = kjor(
    p([{ sti: 'content/a.json', tekst: '{"a":"x — y"}' }, { sti: 'templates/a.html', tekst: '<li data-list-item style="margin:1rem">x</li>' }]),
    [margin, strek]
  );
  assert.equal(res.feil.length, 1);
  assert.equal(res.varsler.length, 1);
});
