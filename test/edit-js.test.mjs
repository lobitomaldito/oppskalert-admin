import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../editor/edit.js', import.meta.url), 'utf8');

test('ingen kall til det fjernede save-image-endepunktet', () => {
  assert.equal(js.includes('/api/save-image'), false);
});

test('chat-assistenten er av med mindre siden slaar den paa', () => {
  assert.match(js, /CHAT_PAA\s*=\s*[^;]*data-admin-chat/);
  assert.equal(/CHAT_PAA\s*=\s*true\s*;/.test(js), false);
});

test('publisering sender bilder sammen med teksten', () => {
  assert.match(js, /bilder:\s*ventendeBilder/);
});

test('PIN verifiseres mot server foer editoren bygges', () => {
  assert.match(js, /verifyPin\(storedPin\)/);
});

test('ES5-nivaa: ingen pilfunksjoner, let eller const', () => {
  const utenKommentarer = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/=>/.test(utenKommentarer), false, 'pilfunksjon funnet');
  assert.equal(/\b(let|const)\s/.test(utenKommentarer), false, 'let eller const funnet');
});

test('ingen tankestrek i fila', () => {
  assert.equal(js.includes('—'), false);
});
