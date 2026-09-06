// test/harness.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('pakken heter oppskalert-admin og krever node 18', () => {
  const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(p.name, 'oppskalert-admin');
  assert.equal(p.type, 'module');
  assert.equal(p.engines.node, '>=18');
});
