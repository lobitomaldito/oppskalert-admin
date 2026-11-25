// test/panel-bygg.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { lesPanel, lagPanel, bakDatoer, iDag } from '../build/panel.mjs';
import { bakeLister } from '../build/bake.mjs';

const MAL = `<body>
<ul data-editable-list="show" data-panel="Show">
  <li data-list-item><span data-list-field="dato" data-panel-type="dato">2026-12-16</span><span data-list-field="navn">Verdens beste jenter</span><a data-list-href="billett" href="https://latter.no">Billetter</a></li>
</ul>
<div data-content-src="stand-up"><ul data-editable-list="show" data-panel="Show"><li data-list-item><span data-list-field="dato">x</span></li></ul></div>
<ul data-editable-list="logoer" data-panel="Logoer"><li data-list-item><img data-list-image-field="bilde" data-panel-type="logo" src="/l/1.png" alt="Coop"></li></ul>
<ul data-editable-list="omtaler" data-panel-omtaler="Konferansier"><li data-list-item><blockquote data-list-field="tekst">«Bra»</blockquote><img data-list-image-field="logo" src="/l/2.png" alt=""><span data-list-field="fra">Coop</span></li></ul>
<span data-edit="tall_show" data-panel="Nøkkeltall" data-panel-etikett="Antall show">500+</span>
</body>`;

test('lesPanel finner lister, felt, standardinnhold, tekster og omtalelister, men hopper over speil', () => {
  const funn = lesPanel(parse(MAL), 'stand-up');
  assert.deepEqual(funn.lister.map((l) => [l.fane, l.liste]), [['Show', 'show'], ['Logoer', 'logoer']]);
  const show = funn.lister[0];
  assert.deepEqual(show.felt.map((f) => [f.navn, f.type]), [['dato', 'dato'], ['navn', 'tekst'], ['billett', 'lenke']]);
  assert.deepEqual(show.standard, [{ dato: '2026-12-16', navn: 'Verdens beste jenter', billett: 'https://latter.no' }]);
  const logo = funn.lister[1];
  assert.deepEqual(logo.felt.map((f) => [f.navn, f.type]), [['bilde', 'logo'], ['tittel', 'tekst']]);
  assert.deepEqual(logo.standard, [{ bilde: '/l/1.png', tittel: 'Coop' }]);
  assert.equal(funn.omtaler[0].oppdrag, 'Konferansier');
  assert.deepEqual(funn.omtaler[0].felt.map((f) => f.navn), ['tekst', 'logo', 'fra', 'tittel']);
  assert.deepEqual(funn.tekster, [{ fane: 'Nøkkeltall', side: 'stand-up', nokkel: 'tall_show', etikett: 'Antall show', standard: '500+' }]);
});

test('lagPanel grupperer i faner i rekkefølge', () => {
  const p = lagPanel([lesPanel(parse(MAL), 'stand-up'), lesPanel(parse(MAL), 'index')]);
  assert.deepEqual(p.faner.map((f) => f.navn), ['Show', 'Logoer', 'Nøkkeltall']);
  assert.equal(p.faner[0].lister.length, 2);
  assert.equal(p.omtaler.length, 2);
});

test('bakDatoer viser 16.12, merker kortet og tar ut passerte show', () => {
  const dom = parse(`<ul><li data-list-item><span data-panel-type="dato">2026-12-16</span></li><li data-list-item><span data-panel-type="dato">2026-11-24</span></li><li data-list-item><span data-panel-type="dato">18.11</span></li></ul>`);
  assert.equal(bakDatoer(dom, '2026-11-25'), 1);
  const kort = dom.querySelectorAll('[data-list-item]');
  assert.equal(kort.length, 2, 'det passerte showet er borte, det gamle formatet står');
  assert.equal(kort[0].getAttribute('data-dato'), '2026-12-16');
  assert.equal(kort[0].text, '16.12');
  assert.equal(bakDatoer(parse('<li data-list-item><span data-panel-type="dato">2026-11-25</span></li>'), '2026-11-25'), 1, 'showet står dagen det spilles');
});

test('iDag bruker norsk tid', () => {
  assert.equal(iDag(new Date('2026-11-25T23:30:00Z')), '2026-11-26');
});

test('bakeLister setter trygge lenker og skjuler tomme', () => {
  const dom = parse('<ul data-editable-list="m"><li data-list-item><a data-list-href="lenke" href="#">x</a></li></ul>');
  bakeLister(dom, () => [{ lenke: 'https://nrk.no/a' }, { lenke: 'javascript:alert(1)' }, { lenke: '' }]);
  const a = dom.querySelectorAll('a');
  assert.equal(a[0].getAttribute('href'), 'https://nrk.no/a');
  assert.equal(a[1].getAttribute('href'), undefined);
  assert.equal(a[1].hasAttribute('hidden'), true);
  assert.equal(a[2].hasAttribute('hidden'), true);
});
