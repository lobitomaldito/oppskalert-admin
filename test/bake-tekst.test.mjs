// test/bake-tekst.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { bakeTekst, bakeBilder, settStilProp } from '../build/bake.mjs';

const fast = (innhold) => (_el, nokkel) => innhold[nokkel];

test('bakeTekst erstatter innholdet og teller treff', () => {
  const dom = parse('<h1 data-edit="hero.tittel">Standard</h1>');
  assert.equal(bakeTekst(dom, fast({ 'hero.tittel': 'Ny <strong>tittel</strong>' })), 1);
  assert.equal(dom.querySelector('h1').innerHTML, 'Ny <strong>tittel</strong>');
});

test('bakeTekst lar elementet staa naar noekkelen mangler', () => {
  const dom = parse('<h1 data-edit="mangler">Standard</h1>');
  assert.equal(bakeTekst(dom, fast({})), 0);
  assert.equal(dom.querySelector('h1').innerHTML, 'Standard');
});

test('tom streng er en gyldig verdi og skal slette teksten', () => {
  const dom = parse('<p data-edit="a">Standard</p>');
  assert.equal(bakeTekst(dom, fast({ a: '' })), 1);
  assert.equal(dom.querySelector('p').innerHTML, '');
});

test('bakeBilder setter src paa img', () => {
  const dom = parse('<img data-edit-image="hero.cover" src="/gammel.jpg">');
  bakeBilder(dom, fast({ 'hero.cover': '/ny.jpg' }));
  assert.equal(dom.querySelector('img').getAttribute('src'), '/ny.jpg');
});

test('bakeBilder setter background-image paa alt annet enn img', () => {
  const dom = parse('<div data-edit-image="hero.cover"></div>');
  bakeBilder(dom, fast({ 'hero.cover': '/ny.jpg' }));
  assert.match(dom.querySelector('div').getAttribute('style'), /background-image:url\('\/ny\.jpg'\)/);
});

test('fokuspunkt gir object-position paa img og background-position ellers', () => {
  const bilde = parse('<img data-edit-image="a" src="/x.jpg">');
  bakeBilder(bilde, fast({ 'a@pos': '50% 22%' }));
  assert.match(bilde.querySelector('img').getAttribute('style'), /object-position:50% 22%/);

  const boks = parse('<div data-edit-image="a"></div>');
  bakeBilder(boks, fast({ 'a@pos': '50% 22%' }));
  assert.match(boks.querySelector('div').getAttribute('style'), /background-position:50% 22%/);
});

test('fokuspunkt alene, uten ny url, endrer fortsatt utsnittet', () => {
  const dom = parse('<img data-edit-image="a" src="/beholdes.jpg">');
  assert.equal(bakeBilder(dom, fast({ 'a@pos': '10% 90%' })), 1);
  assert.equal(dom.querySelector('img').getAttribute('src'), '/beholdes.jpg');
});

test('settStilProp beholder oevrige deklarasjoner', () => {
  const dom = parse('<div style="color:red; background-position:0% 0%;"></div>');
  settStilProp(dom.querySelector('div'), 'background-position', '50% 50%');
  const s = dom.querySelector('div').getAttribute('style');
  assert.match(s, /color:red/);
  assert.match(s, /background-position:50% 50%/);
  assert.equal(s.match(/background-position/g).length, 1);
});
