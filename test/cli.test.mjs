// test/cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { lesProsjekt } from '../bin/_les-prosjekt.mjs';

// fileURLToPath og ikke .pathname: pathname er prosent-kodet, saa en mappe med
// mellomrom i navnet blir til en sti som ikke finnes. Flere av kundesidene
// ligger i slike mapper.
const CLI = fileURLToPath(new URL('../bin/oppskalert-admin.mjs', import.meta.url));

function prosjekt(htmlInnhold) {
  const rot = mkdtempSync(join(tmpdir(), 'oa-cli-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'static', 'css'), { recursive: true });
  mkdirSync(join(rot, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'index.html'), htmlInnhold);
  writeFileSync(join(rot, 'static', 'css', 'tokens.css'),
    ':root{--adm-aksent:#1;--adm-flate:#2;--adm-tekst:#3;--adm-fare:#4;--adm-ok:#5}');
  writeFileSync(join(rot, 'node_modules', 'x', 'stor.html'), '<li data-list-item style="margin:1rem">');
  return rot;
}

test('lesProsjekt hopper over node_modules', () => {
  const rot = prosjekt('<h1>ok</h1>');
  assert.equal(lesProsjekt(rot).filer.some((f) => f.sti.includes('node_modules')), false);
});

test('doctor avslutter med 0 naar alt er rent', () => {
  const rot = prosjekt('<h1 data-edit="t">ok</h1>');
  const ut = execFileSync('node', [CLI, 'doctor', rot], { encoding: 'utf8' });
  assert.match(ut, /Ingen feil/);
});

test('doctor avslutter med 1 og navngir regelen ved feil', () => {
  const rot = prosjekt('<li data-list-item style="margin-bottom:1rem">x</li>');
  try {
    execFileSync('node', [CLI, 'doctor', rot], { encoding: 'utf8' });
    assert.fail('skulle avsluttet med kode 1');
  } catch (e) {
    assert.equal(e.status, 1);
    assert.match(e.stdout, /ingen-inline-margin/);
  }
});

test('init skriver api-skallene og build.mjs', () => {
  const rot = prosjekt('<h1>ok</h1>');
  execFileSync('node', [CLI, 'init', rot], { encoding: 'utf8' });
  assert.ok(existsSync(join(rot, 'api', 'save.js')));
  assert.ok(existsSync(join(rot, 'api', 'verify-pin.js')));
  assert.match(readFileSync(join(rot, 'api', 'save.js'), 'utf8'), /oppskalert-admin\/api\/save\.js/);
  assert.match(readFileSync(join(rot, 'build.mjs'), 'utf8'), /oppskalert-admin\/build/);
});

test('dev bruker samme stivalidering som produksjon', async () => {
  const { trygStI } = await import('../api/_stier.mjs');
  assert.equal(trygStI('static/assets/uploads/../../api/save.js'), null);
  assert.equal(trygStI('static/assets/uploads/ok.jpg'), 'static/assets/uploads/ok.jpg');
});

test('init overskriver ikke en eksisterende fil', () => {
  const rot = prosjekt('<h1>ok</h1>');
  mkdirSync(join(rot, 'api'));
  writeFileSync(join(rot, 'api', 'save.js'), '// min egen');
  execFileSync('node', [CLI, 'init', rot], { encoding: 'utf8' });
  assert.equal(readFileSync(join(rot, 'api', 'save.js'), 'utf8'), '// min egen');
});
