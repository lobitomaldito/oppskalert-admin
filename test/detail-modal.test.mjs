import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../editor/detail-modal.js', import.meta.url), 'utf8');

test('ES5-nivaa: ingen pilfunksjoner, let eller const, ingen template literals utenfor kommentarer', () => {
  const utenKommentarer = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/=>/.test(utenKommentarer), false, 'pilfunksjon funnet');
  assert.equal(/\b(let|const)\s/.test(utenKommentarer), false, 'let eller const funnet');
  assert.equal(/`/.test(utenKommentarer), false, 'template literal funnet');
});

test('ingen tankestrek i fila', () => {
  assert.equal(js.includes('—'), false);
});

test('WeakSet brukt for aa spore allerede bundne kort', () => {
  assert.match(js, /new WeakSet\(\)/);
  assert.match(js, /boundCards\.has\(/);
  assert.match(js, /boundCards\.add\(/);
});

test('ingen markoerklasse brukt som erstatning for WeakSet-sjekken', () => {
  // Et gjenopprettet kort fra et undo-snapshot baerer klassen fra foer,
  // mens lytteren doede med den gamle noden. En classList-sjekk paa
  // ".dm-clickable" (eller lignende) for aa avgjoere om kortet alt er
  // bundet ville derfor hoppe over noeyaktig de nodene som trenger ny
  // binding. Bindingen skal utelukkende styres av boundCards (WeakSet).
  assert.equal(/classList\.contains\(['"]dm-clickable['"]\)/.test(js), false);
});

test('lytter paa adm:restored for aa binde paa nytt etter admins Angre', () => {
  assert.match(js, /addEventListener\(['"]adm:restored['"]/);
});

test('overlegget bygges paa document.body', () => {
  assert.match(js, /document\.body\.appendChild\(modal\)/);
});

test('init() er idempotent: kan kalles flere ganger uten aa bygge modalen paa nytt', () => {
  assert.match(js, /function init\s*\(/);
  // build() lager overlegget; init() maa ikke kalle det direkte, bare open() gjoer
  // det lazy (if (!modal) build();), saa gjentatte init()-kall aldri dobler <div class="dm">.
  const initBody = js.slice(js.indexOf('function init'));
  const firstCloseBrace = initBody.indexOf('\n  }');
  const initSrc = initBody.slice(0, firstCloseBrace);
  assert.equal(/\bbuild\(\)/.test(initSrc), false, 'init() skal ikke bygge modalen direkte');
});
