import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../editor/edit.css', import.meta.url), 'utf8');

test('ingen hardkodede hex-farger utenfor fallback-verdiene i :root', () => {
  const utenRoot = css.replace(/:root\s*\{[\s\S]*?\}/, '');
  const treff = utenRoot.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(treff, [], `hardkodede farger igjen: ${treff.join(', ')}`);
});

test('alle fem rollene er definert med fallback', () => {
  for (const v of ['--adm-aksent', '--adm-flate', '--adm-tekst', '--adm-fare', '--adm-ok']) {
    assert.match(css, new RegExp(`${v}\\s*:`), `${v} mangler i :root`);
  }
});

test('bruksstedene leser variablene, ikke faste verdier', () => {
  assert.match(css, /\.adm__btn--primary\s*\{[^}]*var\(--adm-aksent\)/);
  assert.match(css, /\.adm\s*\{[^}]*var\(--adm-flate\)/);
});

test('ingen tankestrek i fila', () => {
  assert.equal(css.includes('—'), false);
});
