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

// Fanger console.warn under et bygg. Bygget varsler i stedet for aa kaste, saa
// varselet er den eneste maaten en test kan se at motoren sa fra.
function medVarsler(fn) {
  const linjer = [];
  const orig = console.warn;
  console.warn = (...a) => linjer.push(a.join(' '));
  try { fn(); } finally { console.warn = orig; }
  return linjer;
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

test('et innlegg uten slug, eller med en usanert slug, kastes ikke, resten av bygget fullfoeres', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'), '<html><body><h1 data-innlegg="tittel">X</h1></body></html>');
  lagSamling(rot, 'aktuelt', [
    { tittel: 'Mangler slug', dato: '2026-01-01' },
    { slug: '../../evil', tittel: 'Sti-forsoek', dato: '2026-01-02' },
    { slug: 'gyldig-sak', tittel: 'Gyldig sak', dato: '2026-01-03' },
  ]);
  let res;
  assert.doesNotThrow(() => { res = build({ rot }); });
  assert.equal(res.sider, 1);
  assert.equal(res.innlegg, 1);
  assert.ok(existsSync(join(rot, 'dist', 'aktuelt', 'gyldig-sak', 'index.html')));
  // Ingen fil skal ha havnet utenfor dist-mappa via den usanerte slug-en.
  assert.ok(!existsSync(join(rot, 'evil', 'index.html')));
});

test('et innlegg med ugyldig slug faar ingen lenke i samlingslista', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3><a data-samling-lenke href="#">Les mer</a></article>'));
  lagSamling(rot, 'aktuelt', [
    { tittel: 'Mangler slug', dato: '2026-01-01' },
    { slug: 'gyldig-sak', tittel: 'Gyldig sak', dato: '2026-01-02' },
  ]);
  build({ rot });
  const dom = parse(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'));
  assert.equal(dom.querySelectorAll('[data-list-item]').length, 1);
  assert.doesNotMatch(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'), /undefined/);
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

// Number('tre') er NaN, og slice(0, NaN) toemte foer hele seksjonen. En
// skrivefeil i ett attributt skal ikke slette nyhetsfeltet fra den ferdige
// siden, og aller minst uten et ord om det.
test('en ugyldig data-samling-antall viser alle innlegg og varsler', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3></article>', ' data-samling-antall="tre"'));
  lagSamling(rot, 'aktuelt', [
    { slug: 'a', tittel: 'A', dato: '2026-01-01' },
    { slug: 'b', tittel: 'B', dato: '2026-02-01' },
    { slug: 'c', tittel: 'C', dato: '2026-03-01' },
  ]);
  const varsler = medVarsler(() => build({ rot }));
  const dom = parse(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'));
  assert.equal(dom.querySelectorAll('[data-list-item]').length, 3, 'seksjonen ble tommet eller kuttet');
  assert.ok(varsler.some((l) => /data-samling-antall="tre"/.test(l)), `manglet varsel, fikk: ${varsler.join(' | ')}`);
});

test('data-samling-antall="0" viser alle innlegg og varsler', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3></article>', ' data-samling-antall="0"'));
  lagSamling(rot, 'aktuelt', [
    { slug: 'a', tittel: 'A', dato: '2026-01-01' },
    { slug: 'b', tittel: 'B', dato: '2026-02-01' },
  ]);
  const varsler = medVarsler(() => build({ rot }));
  const dom = parse(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'));
  assert.equal(dom.querySelectorAll('[data-list-item]').length, 2);
  assert.ok(varsler.some((l) => /data-samling-antall="0"/.test(l)));
});

test('et gyldig data-samling-antall varsler ikke', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'index.html'), malMedSamling(
    '<article data-list-item><h3 data-list-field="tittel">X</h3></article>', ' data-samling-antall="1"'));
  lagSamling(rot, 'aktuelt', [
    { slug: 'a', tittel: 'A', dato: '2026-01-01' },
    { slug: 'b', tittel: 'B', dato: '2026-02-01' },
  ]);
  const varsler = medVarsler(() => build({ rot }));
  assert.ok(!varsler.some((l) => /data-samling-antall/.test(l)), `varslet paa en gyldig verdi: ${varsler.join(' | ')}`);
});

// --- Understrek-maler ---

// Regelen "maler som starter med _ bygges ikke som egen side" er ubetinget og
// skal staa. Et gammelt prosjekt kan ha en understrek-mal av en annen grunn,
// og skal faa vite at siden forsvant.
test('en annen understrek-mal enn _innlegg.html hoppes over MED et varsel', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_annenting.html'), '<html><body><h1>Annet</h1></body></html>');
  const varsler = medVarsler(() => build({ rot }));
  assert.ok(!existsSync(join(rot, 'dist', '_annenting.html')), 'understrek-malen ble bygd som egen side');
  assert.ok(varsler.some((l) => /_annenting\.html hoppes over/.test(l)), `manglet varsel, fikk: ${varsler.join(' | ')}`);
});

test('_innlegg.html hoppes over stille, det er dens tiltenkte rolle', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'), '<html><body><h1 data-innlegg="tittel">X</h1></body></html>');
  lagSamling(rot, 'aktuelt', [{ slug: 'a', tittel: 'A', dato: '2026-01-01' }]);
  const varsler = medVarsler(() => build({ rot }));
  assert.ok(!existsSync(join(rot, 'dist', '_innlegg.html')));
  assert.ok(!varsler.some((l) => /_innlegg\.html/.test(l)), `varslet paa _innlegg.html: ${varsler.join(' | ')}`);
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
