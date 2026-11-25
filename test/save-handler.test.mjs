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

test('les-side henter content/<side>.json fra GitHub og krever PIN', async () => {
  const ekte = globalThis.fetch;
  const urler = [];
  globalThis.fetch = async (url) => {
    urler.push(String(url));
    if (String(url).includes('content/finnes.json')) return new Response(JSON.stringify({ content: Buffer.from('{"show":[1]}').toString('base64') }));
    return new Response('{}', { status: 404 });
  };
  try {
    const feil = lagRes(); await save(lagReq({ pin: 'feil', les: 'finnes' }), feil);
    assert.equal(feil.kode, 401);
    const ok = lagRes(); await save(lagReq({ pin: 'hemmelig', les: 'finnes' }), ok);
    assert.deepEqual([ok.kode, ok.kropp], [200, { ok: true, innhold: { show: [1] } }]);
    const tom = lagRes(); await save(lagReq({ pin: 'hemmelig', les: 'ny-side' }), tom);
    assert.deepEqual(tom.kropp, { ok: true, innhold: {} });
    const ugyldig = lagRes(); await save(lagReq({ pin: 'hemmelig', les: '../hemmelig' }), ugyldig);
    assert.equal(ugyldig.kode, 400);
    assert.equal(urler.length, 2);
  } finally { globalThis.fetch = ekte; }
});

test('sider skriver flere sider i ett commit og fletter med det som ligger der', async () => {
  const ekte = globalThis.fetch;
  let tre = null; let commits = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/contents/content/index.json')) return new Response(JSON.stringify({ content: Buffer.from('{"tittel":"Hei","omtaler":[1]}').toString('base64') }));
    if (u.includes('/contents/')) return new Response('{}', { status: 404 });
    if (u.endsWith('git/ref/heads/main')) return new Response(JSON.stringify({ object: { sha: 'H' } }));
    if (u.endsWith('git/commits/H')) return new Response(JSON.stringify({ tree: { sha: 'T' } }));
    if (u.endsWith('git/trees')) { tre = JSON.parse(init.body).tree; return new Response(JSON.stringify({ sha: 'T2' })); }
    if (u.endsWith('git/commits')) { commits++; return new Response(JSON.stringify({ sha: 'C' })); }
    return new Response('{}');
  };
  try {
    const res = lagRes();
    await save(lagReq({ pin: 'hemmelig', sider: { index: { omtaler: [2, 1] }, omtaler: { omtaler: [2] } } }), res);
    assert.equal(res.kode, 200);
    assert.equal(commits, 1);
    const filer = Object.fromEntries(tre.map((f) => [f.path, JSON.parse(f.content)]));
    assert.deepEqual(filer['content/index.json'], { tittel: 'Hei', omtaler: [2, 1] });
    assert.deepEqual(filer['content/omtaler.json'], { omtaler: [2] });
    const ugyldig = lagRes();
    await save(lagReq({ pin: 'hemmelig', sider: { '../x': {} } }), ugyldig);
    assert.equal(ugyldig.kode, 400);
  } finally { globalThis.fetch = ekte; }
});
