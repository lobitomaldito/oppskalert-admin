// test/dekning.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import tekst, { dekningListe } from '../doctor/regler/dekning-tekst.mjs';
import bilde from '../doctor/regler/dekning-bilde.mjs';
import gruppe from '../doctor/regler/gjentatt-gruppe.mjs';

const p = (html) => ({ rot: '/x', filer: [{ sti: 'templates/index.html', tekst: html }] });

test('udekket p, h1, h2, h3 og blockquote er feil', () => {
  const funn = tekst.sjekk(p('<main><h1>En tittel</h1><h2>To</h2><h3>Tre</h3><p>Fire her</p><blockquote>Fem her</blockquote></main>'));
  assert.equal(tekst.alvor, 'feil');
  assert.equal(funn.length, 5);
});

test('meldingen navngir tagg og foreslaar markoren', () => {
  const f = tekst.sjekk(p('<main><h2>En tittel</h2></main>'))[0];
  assert.match(f.melding, /h2/);
  assert.match(f.melding, /data-edit/);
});

test('dekket tekst gir ingen funn', () => {
  assert.deepEqual(tekst.sjekk(p('<main><p data-edit="a.b">Tekst her</p></main>')), []);
});

test('data-edit-ignore demper regelen', () => {
  assert.deepEqual(tekst.sjekk(p('<main><section data-edit-ignore><p>Personvern her</p></section></main>')), []);
});

test('li og h4 er varsel og ikke feil', () => {
  assert.equal(dekningListe.alvor, 'varsel');
  assert.equal(tekst.sjekk(p('<main><ul><li>Et punkt her</li></ul><h4>En undertittel</h4></main>')).length, 0);
  assert.equal(dekningListe.sjekk(p('<main><ul><li>Et punkt her</li></ul><h4>En undertittel</h4></main>')).length, 2);
});

test('udekket bilde er feil, dekket er greit', () => {
  assert.equal(bilde.alvor, 'feil');
  assert.equal(bilde.sjekk(p('<main><img src="/a.jpg"></main>')).length, 1);
  assert.deepEqual(bilde.sjekk(p('<main><img data-edit-image="k" src="/a.jpg"></main>')), []);
});

test('bakgrunnsbilde teller som bilde', () => {
  assert.equal(bilde.sjekk(p('<main><div style="background-image:url(/a.jpg)"></div></main>')).length, 1);
});

test('tre like soesken uten liste er et varsel', () => {
  const h = '<main><div class="kort"><h3 data-edit="a">A</h3></div><div class="kort"><h3 data-edit="b">B</h3></div><div class="kort"><h3 data-edit="c">C</h3></div></main>';
  assert.equal(gruppe.alvor, 'varsel');
  assert.equal(gruppe.sjekk(p(h)).length, 1);
  assert.match(gruppe.sjekk(p(h))[0].melding, /data-editable-list/);
});

test('to like soesken er et layoutgrep og meldes ikke', () => {
  const h = '<main><div class="kol"><p data-edit="a">A</p></div><div class="kol"><p data-edit="b">B</p></div></main>';
  assert.deepEqual(gruppe.sjekk(p(h)), []);
});

test('tre soesken som allerede er en liste meldes ikke', () => {
  const h = '<main><ul data-editable-list="k"><li data-list-item class="k">A</li><li data-list-item class="k">B</li><li data-list-item class="k">C</li></ul></main>';
  assert.deepEqual(gruppe.sjekk(p(h)), []);
});

test('reglene ser bare paa maler under templates/', () => {
  const utenfor = { rot: '/x', filer: [{ sti: 'dist/index.html', tekst: '<main><p>Tekst her</p></main>' }] };
  assert.deepEqual(tekst.sjekk(utenfor), []);
  assert.deepEqual(bilde.sjekk(utenfor), []);
});
