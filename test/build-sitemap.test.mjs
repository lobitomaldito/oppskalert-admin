// test/build-sitemap.test.mjs
// Task 6: sitemap.xml utvides eller skrives naar bygget har en samling med
// minst ett synlig innlegg. Se
// .superpowers/sdd/2026-09-08-oppskalert-admin-samlinger/task-6-brief.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../build/index.mjs';

function lagProsjekt() {
  const rot = mkdtempSync(join(tmpdir(), 'oa-sitemap-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content'));
  writeFileSync(join(rot, 'templates', 'index.html'), '<html><body><h1>Hei</h1></body></html>');
  return rot;
}

function lagSamling(rot, navn, innlegg) {
  mkdirSync(join(rot, 'content', 'samlinger'), { recursive: true });
  writeFileSync(join(rot, 'content', 'samlinger', `${navn}.json`), JSON.stringify(innlegg));
}

test('to synlige innlegg og ingen static/sitemap.xml gir en ny sitemap med rot-relative loc', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'), '<html><body><h1 data-innlegg="tittel">X</h1></body></html>');
  lagSamling(rot, 'aktuelt', [
    { slug: 'forste-sak', tittel: 'Foerste sak', dato: '2026-01-01' },
    { slug: 'andre-sak', tittel: 'Andre sak', dato: '2026-02-01' },
  ]);
  build({ rot });
  const sitemapSti = join(rot, 'dist', 'sitemap.xml');
  assert.ok(existsSync(sitemapSti));
  const xml = readFileSync(sitemapSti, 'utf8');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?><urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<url><loc>\/aktuelt\/forste-sak\/<\/loc><\/url>/);
  assert.match(xml, /<url><loc>\/aktuelt\/andre-sak\/<\/loc><\/url>/);
  assert.match(xml, /<\/urlset>$/);
});

test('en eksisterende static/sitemap.xml med absolutte URL-er utvides med samme domene', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'), '<html><body><h1 data-innlegg="tittel">X</h1></body></html>');
  mkdirSync(join(rot, 'static'), { recursive: true });
  writeFileSync(join(rot, 'static', 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    '<url><loc>https://kunde.no/</loc></url></urlset>');
  lagSamling(rot, 'aktuelt', [{ slug: 'nytt-bygg', tittel: 'Nytt bygg', dato: '2026-01-01' }]);
  build({ rot });
  const xml = readFileSync(join(rot, 'dist', 'sitemap.xml'), 'utf8');
  assert.match(xml, /<url><loc>https:\/\/kunde\.no\/<\/loc><\/url>/);
  assert.match(xml, /<url><loc>https:\/\/kunde\.no\/aktuelt\/nytt-bygg\/<\/loc><\/url>/);
});

test('uten samling og uten static/sitemap.xml lages ingen dist/sitemap.xml', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.ok(!existsSync(join(rot, 'dist', 'sitemap.xml')));
});

test('uten samling men med en static/sitemap.xml fra foer staar den kopierte fila uroert', () => {
  const rot = lagProsjekt();
  mkdirSync(join(rot, 'static'), { recursive: true });
  const original = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    '<url><loc>https://kunde.no/</loc></url></urlset>';
  writeFileSync(join(rot, 'static', 'sitemap.xml'), original);
  build({ rot });
  assert.equal(readFileSync(join(rot, 'dist', 'sitemap.xml'), 'utf8'), original);
});

test('et utkast havner ikke i sitemap.xml', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', '_innlegg.html'), '<html><body><h1 data-innlegg="tittel">X</h1></body></html>');
  lagSamling(rot, 'aktuelt', [
    { slug: 'synlig-sak', tittel: 'Synlig', dato: '2026-01-01' },
    { slug: 'hemmelig-sak', tittel: 'Kladd', dato: '2026-02-01', _kladd: '1' },
  ]);
  build({ rot });
  const xml = readFileSync(join(rot, 'dist', 'sitemap.xml'), 'utf8');
  assert.match(xml, /synlig-sak/);
  assert.doesNotMatch(xml, /hemmelig-sak/);
});

test('en samling uten mal (ingen innlegg bygges) lager ingen sitemap', () => {
  const rot = lagProsjekt();
  lagSamling(rot, 'aktuelt', [{ slug: 'a', tittel: 'A', dato: '2026-01-01' }]);
  build({ rot });
  assert.ok(!existsSync(join(rot, 'dist', 'sitemap.xml')));
});
