// test/html-hjelper.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bladnoder, bilder } from '../doctor/_html.mjs';

test('finner en udekket p inne i main', () => {
  const n = bladnoder('<main><p>Nok tekst her</p></main>');
  assert.equal(n.length, 1);
  assert.deepEqual([n[0].tagg, n[0].dekket, n[0].ignorert], ['p', false, false]);
});

test('data-edit paa elementet selv gjor det dekket', () => {
  assert.equal(bladnoder('<main><p data-edit="a.b">Tekst her</p></main>')[0].dekket, true);
});

test('data-edit paa en forelder dekker barnet', () => {
  assert.equal(bladnoder('<main><div data-edit="a.b"><p>Tekst her</p></div></main>')[0].dekket, true);
});

test('et element i en listemal er dekket', () => {
  const h = '<main><ul data-editable-list="k"><li data-list-item><p>Tekst her</p></li></ul></main>';
  assert.ok(bladnoder(h).every((n) => n.dekket));
});

test('data-edit-ignore paa en forelder merker barnet som ignorert', () => {
  const n = bladnoder('<main><section data-edit-ignore><p>Personvern her</p></section></main>')[0];
  assert.deepEqual([n.dekket, n.ignorert], [false, true]);
});

test('elementer utenfor main teller ikke', () => {
  assert.equal(bladnoder('<header><p>Meny her</p></header><main><p>Innhold her</p></main>').length, 1);
});

test('uten main leses hele dokumentet', () => {
  assert.equal(bladnoder('<body><p>Tekst her</p></body>').length, 1);
});

test('bare bladnoder, en div med en p inni teller som p', () => {
  const n = bladnoder('<main><div><p>Tekst her</p></div></main>');
  assert.deepEqual(n.map((x) => x.tagg), ['p']);
});

test('et avsnitt med fet tekst er fortsatt en bladnode', () => {
  const n = bladnoder('<main><p>Vi tilbyr <strong>kurs</strong> i Oslo</p></main>');
  assert.deepEqual(n.map((x) => x.tagg), ['p']);
  assert.equal(n[0].tekst, 'Vi tilbyr kurs i Oslo');
});

test('en lenke inne i et avsnitt gir ett funn paa p, ikke ogsaa ett paa a', () => {
  const n = bladnoder('<main><p>Ring <a href="tel:1">1</a> i dag</p></main>');
  assert.deepEqual(n.map((x) => x.tagg), ['p']);
});

test('br deler ikke avsnittet i to bladnoder', () => {
  assert.deepEqual(bladnoder('<main><p>Linje ein<br>Linje to</p></main>').map((x) => x.tagg), ['p']);
});

test('en overskrift pakket i span meldes som overskriften', () => {
  assert.deepEqual(bladnoder('<main><h2><span>Overskrift</span></h2></main>').map((x) => x.tagg), ['h2']);
});

test('et blokk-barn gjor elementet til beholder, som foer', () => {
  assert.deepEqual(bladnoder('<main><div><p>Tekst her</p><p>Mer tekst</p></div></main>').map((x) => x.tagg), ['p', 'p']);
});

test('en inline-node rett under rota melder seg selv, ingen ytre bladnode finnes', () => {
  assert.deepEqual(bladnoder('<main><a href="/x">Les mer</a></main>').map((x) => x.tagg), ['a']);
});

test('tomme noder og rene dekortegn hoppes over', () => {
  assert.equal(bladnoder('<main><p></p><p>  </p><p>•</p><p>→</p></main>').length, 0);
});

test('en kort norsk overskrift som Om teller som innhold', () => {
  const n = bladnoder('<main><h2>Om</h2></main>');
  assert.equal(n.length, 1);
  assert.equal(n[0].tagg, 'h2');
});

test('linjenummeret peker paa elementet', () => {
  assert.equal(bladnoder('<main>\n\n<p>Tekst her</p>\n</main>')[0].linje, 3);
});

test('finner img og background-image, og ser markorene', () => {
  const b = bilder('<main><img src="/a.jpg"><div style="background-image:url(/b.jpg)"></div><img data-edit-image="k" src="/c.jpg"></main>');
  assert.equal(b.length, 3);
  assert.deepEqual(b.map((x) => x.dekket), [false, false, true]);
});

test('bilde i en listemal er dekket', () => {
  const h = '<main><ul data-editable-list="k"><li data-list-item><img src="/a.jpg"></li></ul></main>';
  assert.equal(bilder(h)[0].dekket, true);
});
