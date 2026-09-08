// test/kobler-cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath og ikke .pathname, se test/cli.test.mjs for hvorfor.
const CLI = fileURLToPath(new URL('../bin/oppskalert-admin.mjs', import.meta.url));

test('uten et kommandoargument nevner bruksteksten kobler', () => {
  try {
    execFileSync('node', [CLI], { encoding: 'utf8' });
    assert.fail('skulle avsluttet med kode 1 uten et kommandoargument');
  } catch (e) {
    assert.equal(e.status, 1);
    assert.match(e.stdout, /kobler/);
  }
});

test('en ukjent kommando nevner ogsaa kobler i bruksteksten', () => {
  try {
    execFileSync('node', [CLI, 'ikke-en-kommando'], { encoding: 'utf8' });
    assert.fail('skulle avsluttet med kode 1');
  } catch (e) {
    assert.equal(e.status, 1);
    assert.match(e.stdout, /<init\|doctor\|tid\|dev\|kobler>/);
  }
});
