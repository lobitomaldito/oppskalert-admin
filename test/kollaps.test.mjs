import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../editor/kollaps.js', import.meta.url), 'utf8');

test('ES5-nivaa: ingen pilfunksjoner, let eller const, ingen template literals utenfor kommentarer', () => {
  const utenKommentarer = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/=>/.test(utenKommentarer), false, 'pilfunksjon funnet');
  assert.equal(/\b(let|const)\s/.test(utenKommentarer), false, 'let eller const funnet');
  assert.equal(/`/.test(utenKommentarer), false, 'template literal funnet');
});

test('ingen tankestrek i fila', () => {
  assert.equal(js.includes('—'), false);
});

test('WeakSet brukt for aa spore allerede bundne knapper', () => {
  assert.match(js, /new WeakSet\(\)/);
  assert.match(js, /boundButtons\.has\(/);
  assert.match(js, /boundButtons\.add\(/);
});

test('ingen markoerklasse brukt som erstatning for WeakSet-sjekken', () => {
  // Rebindingslogikken skal utelukkende styres av boundButtons (WeakSet), aldri
  // av en klasse paa knappen eller stillaset. En markoerklasse ville overlevd
  // et undo-snapshot mens lytteren doede med den gamle noden.
  assert.equal(/classList\.contains\(['"][^'"]*bound[^'"]*['"]\)/i.test(js), false);
  assert.equal(/classList\.contains\(['"]collapsible-more['"]\)/.test(js), false);
});

test('lytter paa adm:restored for aa bygge paa nytt etter admins Angre', () => {
  assert.match(js, /addEventListener\(['"]adm:restored['"]/);
});

test('data-collapsible og data-collapsible-noun styrer antall og ordet i knappen', () => {
  assert.match(js, /getAttribute\(['"]data-collapsible['"]\)/);
  assert.match(js, /getAttribute\(['"]data-collapsible-noun['"]\)/);
});

test('admin ser hele lista, uforkortet', () => {
  assert.match(js, /function isAdmin\s*\(/);
  assert.match(js, /if\s*\(isAdmin\(\)\)\s*return;/);
});

test('init() river ned gammelt stillas foer den bygger eller vurderer isAdmin(), ikke bare paa den ikke-admin-stien', () => {
  const initStart = js.indexOf('function init');
  assert.ok(initStart >= 0, 'fant ikke init()');
  const rest = js.slice(initStart);

  const teardownCallIdx = rest.indexOf('teardown(grid)');
  assert.ok(teardownCallIdx >= 0, 'init() kaller ikke teardown(grid)');

  const isAdminIdx = rest.indexOf('if (isAdmin())');
  assert.ok(isAdminIdx >= 0, 'fant ikke isAdmin()-sjekken i init()');

  const buildIdx = rest.indexOf("createElement('div')");
  assert.ok(buildIdx >= 0, 'fant ikke stedet der nytt stillas bygges');

  assert.ok(teardownCallIdx < isAdminIdx, 'teardown() maa kjoere foer isAdmin()-sjekken, ikke bare paa build-stien');
  assert.ok(isAdminIdx < buildIdx, 'isAdmin()-sjekken maa avgjoere om noe nytt bygges i det hele tatt');
});

test('teardown() fjerner wrapperen, men flytter selve listebeholderen tilbake urort', () => {
  const teardownMatch = js.match(/function teardown\(grid\) \{[\s\S]*?\n {2}\}/);
  assert.ok(teardownMatch, 'fant ikke teardown()');
  const body = teardownMatch[0];
  assert.match(body, /insertBefore\(grid, wrap\)/, 'grid maa flyttes ut av wrapperen igjen, ikke fjernes');
  assert.match(body, /wrap\.remove\(\)/, 'selve wrapperen maa fjernes');
});
