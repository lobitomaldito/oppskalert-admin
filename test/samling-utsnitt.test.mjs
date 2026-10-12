// test/samling-utsnitt.test.mjs
// Utsnitt (fokuspunkt) paa bildene i en samling: kortet paa foreldresiden,
// toppbildet og de relaterte kortene paa innleggssiden, og handlingen
// "utsnitt" som lagrer ett punkt uten aa roere resten av innlegget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'node-html-parser';
import { build } from '../build/index.mjs';
import { behandle } from '../api/_samling.mjs';

const MAL =
  '<html><head><title data-innlegg="tittel">{}</title></head><body>' +
  '<h1 data-innlegg="tittel">X</h1><img class="topp" data-innlegg-image="bilde" src="/tom.jpg">' +
  '<section data-relaterte="2"><a data-relatert data-samling-lenke href="/x/">' +
  '<img data-innlegg-image="bilde" src="/tom.jpg"></a></section></body></html>';

function lagProsjekt(poster) {
  const rot = mkdtempSync(join(tmpdir(), 'oa-utsnitt-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content', 'samlinger'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'arr.html'),
    '<html><body><ul data-samling="arr"><li data-list-item><a data-samling-lenke href="/arr/">' +
    '<img data-list-image-field="bilde" src="/tom.jpg"><span data-list-field="tittel">X</span></a></li></ul></body></html>');
  writeFileSync(join(rot, 'templates', '_arr.html'), MAL);
  writeFileSync(join(rot, 'content', 'samlinger', 'arr.json'), JSON.stringify(poster));
  build({ rot });
  return rot;
}
const les = (rot, ...d) => parse(readFileSync(join(rot, 'dist', ...d), 'utf8'));

const POSTER = [
  { slug: 'a', tittel: 'A', dato: '2026-02-01', bilde: '/a.jpg', 'bilde@pos': '50% 20%' },
  { slug: 'b', tittel: 'B', dato: '2026-01-01', bilde: '/b.jpg' }
];

test('kortet paa foreldresiden faar utsnittet og vet hvilket innlegg det er', () => {
  const rot = lagProsjekt(POSTER);
  const kort = les(rot, 'arr.html').querySelectorAll('[data-list-item]');
  assert.equal(kort[0].getAttribute('data-samling-post'), 'arr/a');
  assert.match(kort[0].querySelector('img').getAttribute('style'), /object-position:50% 20%/);
  assert.equal(kort[1].querySelector('img').getAttribute('style'), undefined);
});

test('innleggssiden bruker samme utsnitt paa toppbildet og paa det relaterte kortet', () => {
  const rot = lagProsjekt(POSTER);
  assert.match(les(rot, 'arr', 'a', 'index.html').querySelector('img.topp').getAttribute('style'), /object-position:50% 20%/);
  const relatert = les(rot, 'arr', 'b', 'index.html').querySelector('[data-relatert]');
  assert.equal(relatert.getAttribute('data-samling-post'), 'arr/a');
  assert.match(relatert.querySelector('img').getAttribute('style'), /object-position:50% 20%/);
});

test('et utsnitt som ikke er to prosenttall, skrives aldri inn i style', () => {
  const rot = lagProsjekt([{ ...POSTER[0], 'bilde@pos': '1%;background:url(x)' }]);
  assert.equal(les(rot, 'arr.html').querySelector('img').getAttribute('style'), undefined);
  assert.equal(les(rot, 'arr', 'a', 'index.html').querySelector('img.topp').getAttribute('style'), undefined);
});

test('handlingen utsnitt setter ett punkt og lar resten av innlegget staa', () => {
  const r = behandle(POSTER, { handling: 'utsnitt', slug: 'b', felt: 'bilde', pos: '30% 10%' });
  assert.equal(r.skriv, true);
  assert.deepEqual(r.liste[1], { ...POSTER[1], 'bilde@pos': '30% 10%' });
  assert.deepEqual(r.liste[0], POSTER[0]);
});

test('handlingen utsnitt avviser ukjent innlegg, ugyldig felt og ugyldig punkt', () => {
  assert.equal(behandle(POSTER, { handling: 'utsnitt', slug: 'z', felt: 'bilde', pos: '1% 1%' }).feil.status, 404);
  assert.equal(behandle(POSTER, { handling: 'utsnitt', slug: 'a', felt: '__proto__"', pos: '1% 1%' }).feil.status, 400);
  assert.equal(behandle(POSTER, { handling: 'utsnitt', slug: 'a', felt: 'bilde', pos: 'red' }).feil.status, 400);
});
