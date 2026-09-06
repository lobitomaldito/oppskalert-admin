// test/save-handler.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import save from '../api/save.js';
import verifyPin from '../api/verify-pin.js';
import { nullstill } from '../api/_rateLimit.mjs';

function lagRes() {
  const r = { kode: 0, kropp: null };
  r.status = (k) => { r.kode = k; return r; };
  r.json = (b) => { r.kropp = b; return r; };
  return r;
}
const lagReq = (body, metode = 'POST') => ({
  method: metode, body, headers: { 'x-forwarded-for': '9.9.9.9' }, socket: {}
});

beforeEach(() => {
  nullstill();
  process.env.ADMIN_PIN = 'hemmelig';
  process.env.GITHUB_REPO = 'meg/side';
  process.env.GITHUB_TOKEN = 'token';
});

test('verify-pin avviser feil pin med 401', async () => {
  const res = lagRes();
  await verifyPin(lagReq({ pin: 'feil' }), res);
  assert.equal(res.kode, 401);
  assert.equal(res.kropp.ok, false);
});

test('verify-pin slipper riktig pin gjennom', async () => {
  const res = lagRes();
  await verifyPin(lagReq({ pin: 'hemmelig' }), res);
  assert.deepEqual([res.kode, res.kropp], [200, { ok: true }]);
});

test('verify-pin avviser GET med 405', async () => {
  const res = lagRes();
  await verifyPin(lagReq({}, 'GET'), res);
  assert.equal(res.kode, 405);
});

test('save avviser feil pin foer den roerer GitHub', async () => {
  const res = lagRes();
  await save(lagReq({ page: 'index', pin: 'feil', edits: { a: 1 } }), res);
  assert.equal(res.kode, 401);
});

test('save feiler lukket naar ADMIN_PIN mangler', async () => {
  delete process.env.ADMIN_PIN;
  const res = lagRes();
  await save(lagReq({ page: 'index', pin: '', edits: { a: 1 } }), res);
  assert.equal(res.kode, 500);
});

test('save avviser manglende page eller edits med 400', async () => {
  const res = lagRes();
  await save(lagReq({ pin: 'hemmelig', edits: { a: 1 } }), res);
  assert.equal(res.kode, 400);
});

test('save avviser bilder som ikke er en liste, i stedet for aa krasje', async () => {
  const res = lagRes();
  await save(lagReq({ page: 'index', pin: 'hemmelig', edits: {}, bilder: 'x' }), res);
  assert.equal(res.kode, 400);
  assert.match(res.kropp.error, /liste/);
});

test('save avviser en bildepost uten sti og data, i stedet for aa krasje', async () => {
  const res = lagRes();
  await save(lagReq({ page: 'index', pin: 'hemmelig', edits: {}, bilder: [null] }), res);
  assert.equal(res.kode, 400);
});

test('save avviser en ulovlig bildesti med 400 og norsk tekst', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    bilder: [{ sti: 'api/save.js', data: 'AAAA' }]
  }), res);
  assert.equal(res.kode, 400);
  assert.match(res.kropp.error, /Tillatte format/);
});

test('save avviser for stor publisering med 413', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    bilder: [{ sti: 'static/assets/uploads/a.jpg', data: 'A'.repeat(5 * 1024 * 1024) }]
  }), res);
  assert.equal(res.kode, 413);
});

test('save svarer 500 med norsk tekst naar GITHUB_TOKEN mangler', async () => {
  delete process.env.GITHUB_TOKEN;
  const res = lagRes();
  await save(lagReq({ page: 'index', pin: 'hemmelig', edits: { a: 1 } }), res);
  assert.equal(res.kode, 500);
  assert.match(res.kropp.error, /GITHUB_TOKEN/);
});
