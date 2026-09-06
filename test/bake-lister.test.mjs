// test/bake-lister.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { bakeLister } from '../build/bake.mjs';

const fast = (innhold) => (_el, nokkel) => innhold[nokkel];
const MAL = `<ul data-editable-list="kort">
  <li data-list-item><h3 data-list-field="tittel">A</h3></li>
</ul>`;

test('rendrer ett element per array-post', () => {
  const dom = parse(MAL);
  assert.equal(bakeLister(dom, fast({ kort: [{ tittel: 'En' }, { tittel: 'To' }] })), 2);
  const rader = dom.querySelectorAll('[data-list-item]');
  assert.equal(rader.length, 2);
  assert.equal(rader[0].querySelector('h3').innerHTML, 'En');
  assert.equal(rader[1].querySelector('h3').innerHTML, 'To');
});

test('tom eller manglende liste lar malen staa uroert', () => {
  const dom = parse(MAL);
  assert.equal(bakeLister(dom, fast({ kort: [] })), 0);
  assert.equal(dom.querySelectorAll('[data-list-item]').length, 1);
});

test('hvert element rendres fra SIN egen mal etter indeks', () => {
  const dom = parse(`<ul data-editable-list="k">
    <li data-list-item class="vanlig"><h3 data-list-field="t">A</h3></li>
    <li data-list-item class="framhevet"><h3 data-list-field="t">B</h3></li>
  </ul>`);
  bakeLister(dom, fast({ k: [{ t: 'en' }, { t: 'to' }] }));
  const rader = dom.querySelectorAll('[data-list-item]');
  assert.equal(rader[0].getAttribute('class'), 'vanlig');
  assert.equal(rader[1].getAttribute('class'), 'framhevet');
});

test('flere poster enn maler faller tilbake paa den siste malen', () => {
  const dom = parse(`<ul data-editable-list="k">
    <li data-list-item class="a"><h3 data-list-field="t">A</h3></li>
    <li data-list-item class="b"><h3 data-list-field="t">B</h3></li>
  </ul>`);
  bakeLister(dom, fast({ k: [{ t: '1' }, { t: '2' }, { t: '3' }] }));
  const rader = dom.querySelectorAll('[data-list-item]');
  assert.equal(rader.length, 3);
  assert.equal(rader[2].getAttribute('class'), 'b');
});

test('_skjult gir klassen is-hidden-item', () => {
  const dom = parse(MAL);
  bakeLister(dom, fast({ kort: [{ tittel: 'X', _skjult: '1' }] }));
  assert.match(dom.querySelector('[data-list-item]').getAttribute('class'), /is-hidden-item/);
});

test('bildefelt i et listeelement faar src og alt fra tittelen', () => {
  const dom = parse(`<ul data-editable-list="k">
    <li data-list-item><img data-list-image-field="bilde" src=""><h3 data-list-field="tittel">A</h3></li>
  </ul>`);
  bakeLister(dom, fast({ k: [{ bilde: '/b.jpg', tittel: 'Portrett av Kari' }] }));
  const img = dom.querySelector('img');
  assert.equal(img.getAttribute('src'), '/b.jpg');
  assert.equal(img.getAttribute('alt'), 'Portrett av Kari');
});

test('modalen har sitt eget fokuspunkt, siden utsnittet er en annen form', () => {
  const dom = parse(`<ul data-editable-list="k">
    <li data-list-item><img data-list-image-field="b" src=""></li>
  </ul>`);
  bakeLister(dom, fast({ k: [{ b: '/x.jpg', 'b@pos': '50% 10%', 'b@pos-modal': '50% 80%' }] }));
  const img = dom.querySelector('img');
  assert.match(img.getAttribute('style'), /object-position:50% 10%/);
  assert.equal(img.getAttribute('data-pos-modal'), '50% 80%');
});
