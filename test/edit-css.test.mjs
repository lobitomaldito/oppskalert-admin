import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../editor/edit.css', import.meta.url), 'utf8');

test('ingen hardkodede hex-farger utenfor fallback-verdiene i :root', () => {
  const utenRoot = css.replace(/:where\(:root\)\s*\{[\s\S]*?\}/, '');
  const treff = utenRoot.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(treff, [], `hardkodede farger igjen: ${treff.join(', ')}`);
});

test('alle fem rollene er definert med fallback', () => {
  for (const v of ['--adm-aksent', '--adm-flate', '--adm-tekst', '--adm-fare', '--adm-ok']) {
    assert.match(css, new RegExp(`${v}\\s*:`), `${v} mangler i :root`);
  }
});

test('bruksstedene leser variablene, ikke faste verdier', () => {
  assert.match(css, /\.adm__btn--primary\s*\{[^}]*var\(--adm-aksent\)/);
  assert.match(css, /\.adm\s*\{[^}]*var\(--adm-flate\)/);
});

// edit.js injiserer edit.css sist i <head>, etter sidens tokens.css. Med samme
// spesifisitet vinner den som kommer sist, og hver side fikk den blaa
// fallback-baren. :where() gir fallbackene spesifisitet 0, saa sidens :root
// vinner uansett rekkefolge.
test('fallbackene har spesifisitet 0, saa sidens :root vinner selv om edit.css lastes sist', () => {
  const blokk = css.match(/([^{}]+)\{[^}]*--adm-aksent\s*:/);
  assert.ok(blokk, 'fant ingen blokk som setter --adm-aksent');
  assert.equal(blokk[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), ':where(:root)');
});

// Maalt paa 390x844: baren ble 172 px hoy, gikk utenfor skjermkanten og
// dekket innholdet. Paa smal skjerm skal den ligge i full bredde, holde seg
// paa maks to rader og kutte statusteksten med ellipse. Statusen ligger
// utenfor knapperaden (absolute), saa en lang melding aldri presser fram en
// tredje rad.
test('smal skjerm: baren gaar i full bredde og statusteksten kuttes med ellipse', () => {
  const media = css.match(/@media\s*\(max-width:\s*600px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(media, 'mangler @media (max-width: 600px)');
  const regel = (sel) => (media[1].match(new RegExp(`${sel}\\s*\\{([^}]*)\\}`)) || [])[1] || '';
  assert.match(regel('\\.adm'), /left:\s*8px/);
  assert.match(regel('\\.adm'), /right:\s*8px/);
  assert.match(regel('\\.adm'), /transform:\s*none/);
  assert.doesNotMatch(regel('\\.adm'), /flex-wrap:\s*wrap/);
  assert.match(regel('\\.adm__status'), /position:\s*absolute/);
  assert.match(regel('\\.adm__status'), /text-overflow:\s*ellipsis/);
  assert.match(regel('\\.adm__status'), /white-space:\s*nowrap/);
});

test('ingen tankestrek i fila', () => {
  assert.equal(css.includes('—'), false);
});
