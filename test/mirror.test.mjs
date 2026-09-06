// test/mirror.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { lagOppslag } from '../build/mirror.mjs';

test('uten data-content-src leses sidens eget innhold', () => {
  const dom = parse('<h1 data-edit="a">x</h1>');
  const slaOpp = lagOppslag({ a: 'fra siden' }, () => ({}));
  assert.equal(slaOpp(dom.querySelector('h1'), 'a'), 'fra siden');
});

test('data-content-src paa en forelder styrer oppslaget', () => {
  const dom = parse('<div data-content-src="cv"><h1 data-edit="a">x</h1></div>');
  const slaOpp = lagOppslag({ a: 'fra siden' }, (navn) => {
    assert.equal(navn, 'cv');
    return { a: 'fra cv' };
  });
  assert.equal(slaOpp(dom.querySelector('h1'), 'a'), 'fra cv');
});

test('samme kilde lastes bare en gang per bygg', () => {
  const dom = parse('<div data-content-src="cv"><i data-edit="a"></i><b data-edit="b"></b></div>');
  let antall = 0;
  const slaOpp = lagOppslag({}, () => { antall++; return { a: 1, b: 2 }; });
  slaOpp(dom.querySelector('i'), 'a');
  slaOpp(dom.querySelector('b'), 'b');
  assert.equal(antall, 1);
});
