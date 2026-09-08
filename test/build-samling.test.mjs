// test/build-samling.test.mjs
// Task 2: bygget lager en side per innlegg i en samling.
// Task 3: samme byggesteg fyller listeseksjonen [data-samling] paa foreldresiden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'node-html-parser';
import { build } from '../build/index.mjs';

function lagProsjekt() {
  const rot = mkdtempSync(join(tmpdir(), 'oa-samling-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content'));
  writeFileSync(join(rot, 'templates', 'index.html'), '<html><body><h1>Hei</h1></body></html>');
  return rot;
}

function lagSamling(rot, navn, innlegg) {
  mkdirSync(join(rot, 'content', 'samlinger'), { recursive: true });
  writeFileSync(join(rot, 'content', 'samlinger', `${navn}.json`), JSON.stringify(innlegg));
}

function finnesTekstITre(mappe, tekst) {
  for (const f of readdirSync(mappe, { withFileTypes: true })) {
    const sti = join(mappe, f.name);
    if (f.isDirectory()) { if (finnesTekstITre(sti, tekst)) return true; continue; }
    if (readFileSync(sti, 'utf8').includes(tekst)) return true;
  }
  return false;
}

function malMedSamling(indre, attributter = '') {
  return `<html><body><div data-samling="aktuelt"${attributter}>${indre}</div></body></html>`;
}

// --- Task 2: en side per innlegg ---

test('to innlegg gir to sider paa riktig sti', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'), '<html><body><h1 data-innlegg="tittel">X</h1></body></html>');
  lagSamling(rot, 'aktuelt', [
    { slug: 'forste-sak', tittel: 'Foerste sak', dato: '2026-01-01' },
    { slug: 'andre-sak', tittel: 'Andre sak', dato: '2026-02-01' },
  ]);
  const res = build({ rot });
  assert.equal(res.innlegg, 2);
  assert.ok(existsSync(join(rot, 'dist', 'aktuelt', 'forste-sak', 'index.html')));
  assert.ok(existsSync(join(rot, 'dist', 'aktuelt', 'andre-sak', 'index.html')));
});

test('data-innlegg og data-innlegg-image bakes inn paa innleggssiden', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'),
    '<html><body><h1 data-innlegg="tittel">X</h1><img data-innlegg-image="bilde"></body></html>');
  lagSamling(rot, 'aktuelt', [
    { slug: 'a', tittel: 'Tittelen paa saken', bilde: '/assets/uploads/a.jpg', dato: '2026-01-01' },
  ]);
  build({ rot });
  const html = readFileSync(join(rot, 'dist', 'aktuelt', 'a', 'index.html'), 'utf8');
  assert.match(html, /Tittelen paa saken/);
  assert.match(html, /src="\/assets\/uploads\/a\.jpg"/);
});

test('et utkast gir ingen fil, og teksten finnes ikke noe sted i dist', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'), '<html><body><h1 data-innlegg="tittel">X</h1></body></html>');
  lagSamling(rot, 'aktuelt', [
    { slug: 'hemmelig', tittel: 'Ikke publisert ennaa', dato: '2026-01-01', _kladd: '1' },
  ]);
  const res = build({ rot });
  assert.equal(res.innlegg, 0);
  assert.ok(!existsSync(join(rot, 'dist', 'aktuelt', 'hemmelig')));
  assert.ok(!finnesTekstITre(join(rot, 'dist'), 'Ikke publisert ennaa'));
});

test('_innlegg.html bygges ikke som egen side i dist', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'), '<html><body><h1 data-innlegg="tittel">X</h1></body></html>');
  const res = build({ rot });
  assert.equal(res.sider, 1);
  assert.ok(!existsSync(join(rot, 'dist', '_innlegg.html')));
});

test('et prosjekt uten samlinger bygger som foer, innlegg er 0', () => {
  const rot = lagProsjekt();
  const res = build({ rot });
  assert.equal(res.sider, 1);
  assert.equal(res.innlegg, 0);
  assert.ok(!existsSync(join(rot, 'dist', 'aktuelt')));
});

test('en samling uten mal bygger resten og kaster ikke', () => {
  const rot = lagProsjekt();
  lagSamling(rot, 'aktuelt', [{ slug: 'a', tittel: 'A', dato: '2026-01-01' }]);
  let res;
  assert.doesNotThrow(() => { res = build({ rot }); });
  assert.equal(res.sider, 1);
  assert.equal(res.innlegg, 0);
});

// --- Task 3: listeseksjonen paa foreldresiden ---

test('samlingslista viser riktig antall elementer', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3></article>'));
  lagSamling(rot, 'aktuelt', [
    { slug: 'a', tittel: 'A', dato: '2026-01-01' },
    { slug: 'b', tittel: 'B', dato: '2026-01-02' },
  ]);
  build({ rot });
  const dom = parse(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'));
  assert.equal(dom.querySelectorAll('[data-list-item]').length, 2);
});

test('nyeste dato staar foerst i samlingslista', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3></article>'));
  lagSamling(rot, 'aktuelt', [
    { slug: 'gammel', tittel: 'Gammel', dato: '2026-01-01' },
    { slug: 'ny', tittel: 'Ny', dato: '2026-03-01' },
    { slug: 'midt', tittel: 'Midt', dato: '2026-02-01' },
  ]);
  build({ rot });
  const html = readFileSync(join(rot, 'dist', 'index.html'), 'utf8');
  const rekkefolge = [...html.matchAll(/data-list-field="tittel">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(rekkefolge, ['Ny', 'Midt', 'Gammel']);
});

test('data-samling-lenke faar riktig href', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><a data-samling-lenke href="#">Les mer</a></article>'));
  lagSamling(rot, 'aktuelt', [{ slug: 'nytt-bygg', tittel: 'Nytt bygg', dato: '2026-01-01' }]);
  build({ rot });
  const html = readFileSync(join(rot, 'dist', 'index.html'), 'utf8');
  assert.match(html, /href="\/aktuelt\/nytt-bygg\/"/);
});

test('data-list-image-field bakes inn bildets url', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><img data-list-image-field="bilde"></article>'));
  lagSamling(rot, 'aktuelt', [{ slug: 'a', tittel: 'A', bilde: '/assets/uploads/a.jpg', dato: '2026-01-01' }]);
  build({ rot });
  const html = readFileSync(join(rot, 'dist', 'index.html'), 'utf8');
  assert.match(html, /src="\/assets\/uploads\/a\.jpg"/);
});

test('data-samling-antall begrenser til de nyeste', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3></article>', ' data-samling-antall="2"'));
  lagSamling(rot, 'aktuelt', [
    { slug: 'a', tittel: 'A', dato: '2026-01-01' },
    { slug: 'b', tittel: 'B', dato: '2026-02-01' },
    { slug: 'c', tittel: 'C', dato: '2026-03-01' },
  ]);
  build({ rot });
  const dom = parse(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'));
  assert.equal(dom.querySelectorAll('[data-list-item]').length, 2);
});

test('utkast er ikke med i samlingslista', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3></article>'));
  lagSamling(rot, 'aktuelt', [
    { slug: 'a', tittel: 'Synlig', dato: '2026-01-01' },
    { slug: 'b', tittel: 'Kladd', dato: '2026-02-01', _kladd: '1' },
  ]);
  build({ rot });
  const html = readFileSync(join(rot, 'dist', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Kladd/);
});

test('en tom samling lar malen staa uroert', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">Standardtekst</h3></article>'));
  build({ rot }); // ingen content/samlinger i det hele tatt
  const html = readFileSync(join(rot, 'dist', 'index.html'), 'utf8');
  assert.match(html, /Standardtekst/);
  const dom = parse(html);
  assert.equal(dom.querySelectorAll('[data-list-item]').length, 1);
});

test('samlingsseksjonen laases som data-content-src, samme laas editoren alt bruker', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3></article>'));
  lagSamling(rot, 'aktuelt', [{ slug: 'a', tittel: 'A', dato: '2026-01-01' }]);
  build({ rot });
  const dom = parse(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'));
  const beholder = dom.querySelector('[data-samling="aktuelt"]');
  assert.ok(beholder.hasAttribute('data-content-src'));
});
