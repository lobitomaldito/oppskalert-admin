// test/build-innleggside.test.mjs
// Egen mal per samling, galleri, relaterte innlegg, og skjemaet
// redigeringssiden leser fra dist/admin/samlinger.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'node-html-parser';
import { build } from '../build/index.mjs';
import { lagSkjema, renTekst, velgRelaterte } from '../build/innleggside.mjs';

const MAL =
  '<html><head><title data-innlegg="tittel">{} | Butikk</title>' +
  '<meta name="description" data-innlegg="ingress" content=""></head><body>' +
  '<h1 data-innlegg="tittel">X</h1>' +
  '<p data-innlegg="status" data-innlegg-valg="Til salgs|Solgt">X</p>' +
  '<p data-innlegg="pris" data-innlegg-type="linje" data-innlegg-hjelp="F.eks. 2 500 kr">X</p>' +
  '<img data-innlegg-image="bilde" src="/tom.jpg">' +
  '<div data-innlegg="brodtekst" data-innlegg-etikett="Om møbelet"></div>' +
  '<div class="galleri" data-innlegg-galleri="galleri"></div>' +
  '<section data-relaterte="2" data-relaterte-sist="status=solgt"><h2>Andre</h2><div class="rad">' +
  '<a data-relatert data-samling-lenke href="/varer/"><span data-innlegg="tittel">X</span></a></div></section>' +
  '</body></html>';

const post = (tittel, dato, ekstra = {}) =>
  ({ slug: tittel.toLowerCase(), tittel, dato, status: 'Til salgs', ...ekstra });

function lagProsjekt(poster, mal = MAL, malnavn = '_varer.html') {
  const rot = mkdtempSync(join(tmpdir(), 'oa-innleggside-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content', 'samlinger'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'varer.html'),
    '<html><body><div data-samling="varer" data-samling-ny="Legg ut ny vare" data-samling-tittel="Varer til salgs">' +
    '<a data-list-item data-samling-lenke href="/varer/"><span data-list-field="tittel">X</span></a></div></body></html>');
  if (mal) writeFileSync(join(rot, 'templates', malnavn), mal);
  writeFileSync(join(rot, 'content', 'samlinger', 'varer.json'), JSON.stringify(poster));
  return rot;
}

const les = (rot, ...d) => parse(readFileSync(join(rot, 'dist', ...d), 'utf8'));

function medVarsler(fn) {
  const linjer = [];
  const orig = console.warn;
  console.warn = (...a) => linjer.push(a.join(' '));
  try { fn(); } finally { console.warn = orig; }
  return linjer;
}

test('samlingen bruker sin egen mal _<navn>.html, uten understrek-varsel', () => {
  const rot = lagProsjekt([post('Stol', '2026-01-01')]);
  const varsler = medVarsler(() => build({ rot }));
  assert.equal(les(rot, 'varer', 'stol', 'index.html').querySelector('h1').text, 'Stol');
  assert.ok(!varsler.some((l) => l.includes('_varer.html')));
});

test('uten egen mal faller samlingen tilbake paa _innlegg.html', () => {
  const rot = lagProsjekt([post('Stol', '2026-01-01')], MAL, '_innlegg.html');
  build({ rot });
  assert.ok(existsSync(join(rot, 'dist', 'varer', 'stol', 'index.html')));
});

test('galleriet faar ett bilde per adresse, og ugyldige adresser slippes ikke inn', () => {
  const rot = lagProsjekt([post('Stol', '2026-01-01', {
    galleri: ['/assets/uploads/a.jpg', 'javascript:alert(1)', '/b.jpg" onerror="x', '/assets/uploads/b.jpg']
  })]);
  build({ rot });
  const srcs = les(rot, 'varer', 'stol', 'index.html').querySelectorAll('[data-innlegg-galleri] img').map((i) => i.getAttribute('src'));
  assert.deepEqual(srcs, ['/assets/uploads/a.jpg', '/assets/uploads/b.jpg']);
});

test('title og meta faar ren tekst med {} byttet ut', () => {
  const rot = lagProsjekt([post('Stol', '2026-01-01', { tittel: 'Stol &amp; krakk', slug: 'stol', ingress: '<b>Fin</b> stol' })]);
  build({ rot });
  const side = les(rot, 'varer', 'stol', 'index.html');
  assert.equal(side.querySelector('title').text, 'Stol & krakk | Butikk');
  assert.equal(side.querySelector('meta[name="description"]').getAttribute('content'), 'Fin stol');
});

test('relaterte: de neste i listerekkefoelge, uten seg selv, solgte bakerst', () => {
  const rot = lagProsjekt([
    post('A', '2026-01-04'), post('B', '2026-01-03', { status: 'Solgt' }), post('C', '2026-01-02'), post('D', '2026-01-01')
  ]);
  build({ rot });
  const kort = les(rot, 'varer', 'a', 'index.html').querySelectorAll('[data-relatert]');
  assert.deepEqual(kort.map((k) => k.text), ['C', 'D']);
  assert.deepEqual(kort.map((k) => k.getAttribute('href')), ['/varer/c/', '/varer/d/']);
  assert.equal(les(rot, 'varer', 'a', 'index.html').querySelector('h1').text, 'A');
});

test('et utkast faar ingen side og vises ikke som relatert', () => {
  const rot = lagProsjekt([post('A', '2026-01-03'), post('B', '2026-01-02', { _kladd: true }), post('C', '2026-01-01')]);
  build({ rot });
  assert.ok(!existsSync(join(rot, 'dist', 'varer', 'b')));
  assert.deepEqual(les(rot, 'varer', 'a', 'index.html').querySelectorAll('[data-relatert]').map((k) => k.text), ['C']);
});

test('uten andre innlegg fjernes hele relatert-seksjonen', () => {
  const rot = lagProsjekt([post('Alene', '2026-01-01')]);
  build({ rot });
  assert.equal(les(rot, 'varer', 'alene', 'index.html').querySelector('[data-relaterte]'), null);
});

test('innleggssiden sier hvilket innlegg den er, for Rediger-knappen', () => {
  const rot = lagProsjekt([post('Stol', '2026-01-01')]);
  build({ rot });
  assert.equal(les(rot, 'varer', 'stol', 'index.html').querySelector('body').getAttribute('data-samling-innlegg'), 'varer/stol');
});

test('dist/admin/samlinger.json har feltene fra malen og etikettene fra lista', () => {
  const rot = lagProsjekt([post('Stol', '2026-01-01')]);
  build({ rot });
  const s = JSON.parse(readFileSync(join(rot, 'dist', 'admin', 'samlinger.json'), 'utf8'));
  assert.equal(s.varer.ny, 'Legg ut ny vare');
  assert.equal(s.varer.tittel, 'Varer til salgs');
  assert.deepEqual(s.varer.felt.map((f) => `${f.navn}:${f.type}`),
    ['tittel:linje', 'status:valg', 'pris:linje', 'bilde:bilde', 'brodtekst:lang', 'galleri:galleri']);
  const status = s.varer.felt.find((f) => f.navn === 'status');
  assert.deepEqual(status.valg, ['Til salgs', 'Solgt']);
  assert.equal(s.varer.felt.find((f) => f.navn === 'brodtekst').etikett, 'Om møbelet');
  assert.equal(s.varer.felt.find((f) => f.navn === 'pris').hjelp, 'F.eks. 2 500 kr');
});

test('uten samlinger skrives ingen samlinger.json', () => {
  const rot = mkdtempSync(join(tmpdir(), 'oa-innleggside-'));
  mkdirSync(join(rot, 'templates'));
  writeFileSync(join(rot, 'templates', 'index.html'), '<html><body><h1>Hei</h1></body></html>');
  build({ rot });
  assert.ok(!existsSync(join(rot, 'dist', 'admin', 'samlinger.json')));
});

test('lagSkjema: P blir kort, DIV lang, H1 linje, og relatert-kortet teller ikke', () => {
  const felt = lagSkjema('<h1 data-innlegg="tittel"></h1><p data-innlegg="ingress"></p><div data-innlegg="tekst"></div>' +
    '<section data-relaterte><a data-relatert><span data-innlegg="annet"></span></a></section>');
  assert.deepEqual(felt.map((f) => `${f.navn}:${f.type}`), ['tittel:linje', 'ingress:kort', 'tekst:lang']);
});

test('renTekst og velgRelaterte', () => {
  assert.equal(renTekst('<p>Hei&nbsp;&amp;\n <b>deg</b></p>'), 'Hei & deg');
  const p = ['A', 'B', 'C', 'D'].map((t) => ({ tittel: t }));
  assert.deepEqual(velgRelaterte(p, 2, 3).map((x) => x.tittel), ['D', 'A', 'B']);
});

test('data-innlegg-rekke styrer rekkefoelgen i skjemaet, resten beholder malens', () => {
  const felt = lagSkjema('<img data-innlegg-image="bilde"><h1 data-innlegg="tittel" data-innlegg-rekke="1"></h1>' +
    '<p data-innlegg="pris" data-innlegg-rekke="2"></p><div data-innlegg="brodtekst"></div>');
  assert.deepEqual(felt.map((f) => f.navn), ['tittel', 'pris', 'bilde', 'brodtekst']);
  assert.equal('rekke' in felt[0], false);
});

test('data-samling-sist legger solgte bakerst i lista, foer antall kutter', () => {
  const rot = mkdtempSync(join(tmpdir(), 'oa-innleggside-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content', 'samlinger'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'index.html'),
    '<html><body><ul data-samling="varer" data-samling-sist="status=solgt" data-samling-antall="2">' +
    '<li data-list-item><span data-list-field="tittel">X</span></li></ul></body></html>');
  writeFileSync(join(rot, 'content', 'samlinger', 'varer.json'), JSON.stringify([
    { slug: 'a', tittel: 'A', dato: '2026-01-03', status: 'Solgt' },
    { slug: 'b', tittel: 'B', dato: '2026-01-02', status: 'Til salgs' },
    { slug: 'c', tittel: 'C', dato: '2026-01-01', status: 'Til salgs' }
  ]));
  build({ rot });
  assert.deepEqual(les(rot, 'index.html').querySelectorAll('li').map((l) => l.text), ['B', 'C']);
});
