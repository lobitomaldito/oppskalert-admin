// test/skall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagPin, lesRepo, settEnv } from '../bin/_skall.mjs';

test('pin er seks siffer', () => {
  for (let i = 0; i < 200; i++) assert.match(lagPin(), /^\d{6}$/);
});

test('pin er ikke alltid den samme', () => {
  const sett = new Set();
  for (let i = 0; i < 200; i++) sett.add(lagPin());
  assert.ok(sett.size > 150, `for lite spredning: ${sett.size} unike av 200`);
});

test('leser repo fra https-remote', () => {
  assert.equal(lesRepo(() => 'https://github.com/lobitomaldito/kundeside.git\n'), 'lobitomaldito/kundeside');
});

test('leser repo fra ssh-remote', () => {
  assert.equal(lesRepo(() => 'git@github.com:lobitomaldito/kundeside.git\n'), 'lobitomaldito/kundeside');
});

test('leser repo uten .git-endelse', () => {
  assert.equal(lesRepo(() => 'https://github.com/a/b\n'), 'a/b');
});

test('gir null naar det ikke finnes noen remote', () => {
  assert.equal(lesRepo(() => { throw new Error('no remote'); }), null);
});

test('settEnv sender verdien paa stdin og aldri som argument', () => {
  let sett;
  settEnv((cmd, args, opt) => { sett = { cmd, args, opt }; return ''; }, 'GITHUB_TOKEN', 'hemmelig', true);
  assert.equal(sett.cmd, 'vercel');
  assert.ok(sett.args.includes('env') && sett.args.includes('add') && sett.args.includes('GITHUB_TOKEN'));
  assert.ok(sett.args.includes('--force'));
  assert.equal(sett.args.some((a) => String(a).includes('hemmelig')), false, 'verdien laa paa kommandolinja');
  assert.equal(sett.opt.input, 'hemmelig');
});

test('sensitiv verdi merkes sensitiv', () => {
  let sett;
  settEnv((c, a) => { sett = a; return ''; }, 'GITHUB_TOKEN', 'x', true);
  assert.ok(sett.includes('--sensitive'));
});
