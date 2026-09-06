// test/build.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../build/index.mjs';

function lagProsjekt() {
  const rot = mkdtempSync(join(tmpdir(), 'oa-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content'));
  mkdirSync(join(rot, 'static', 'css'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'index.html'), '<html><body><h1 data-edit="t">Standard</h1></body></html>');
  writeFileSync(join(rot, 'content', 'index.json'), JSON.stringify({ t: 'Bakt' }));
  writeFileSync(join(rot, 'static', 'css', 'site.css'), 'body{margin:0}');
  return rot;
}

test('baker innhold inn i html og skriver til dist', () => {
  const rot = lagProsjekt();
  const res = build({ rot });
  assert.equal(res.sider, 1);
  assert.match(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'), /<h1 data-edit="t">Bakt<\/h1>/);
});

test('legger paa doctype naar malen mangler den', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.match(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'), /^<!DOCTYPE html>/);
});

test('kopierer static/ inn i dist', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.ok(existsSync(join(rot, 'dist', 'css', 'site.css')));
});

test('kopierer editorfilene til dist/admin', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.ok(existsSync(join(rot, 'dist', 'admin', 'edit.js')));
  assert.ok(existsSync(join(rot, 'dist', 'admin', 'edit.css')));
});

test('en side uten json bygges med malens standardtekst', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'templates', 'om.html'), '<h1 data-edit="t">Om oss</h1>');
  const res = build({ rot });
  assert.equal(res.sider, 2);
  assert.match(readFileSync(join(rot, 'dist', 'om.html'), 'utf8'), /Om oss/);
});

test('oedelagt json stopper ikke bygget', () => {
  const rot = lagProsjekt();
  writeFileSync(join(rot, 'content', 'index.json'), '{ dette er ikke json');
  const res = build({ rot });
  assert.equal(res.sider, 1);
  assert.match(readFileSync(join(rot, 'dist', 'index.html'), 'utf8'), /Standard/);
});
