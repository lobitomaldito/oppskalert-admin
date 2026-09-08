// test/samling-lagring.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { flett } from '../api/_samling.mjs';
import save from '../api/save.js';
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

// Falsk GitHub for de testene som skal helt gjennom til commitFiler(). Samler
// kallene saa vi kan sjekke at samlingsfila havner i SAMME tre som resten.
function falskGitHub(svar) {
  const kall = [];
  const hent = async (url, init) => {
    kall.push({ url, metode: init?.method || 'GET', kropp: init?.body ? JSON.parse(init.body) : null });
    const nokkel = Object.keys(svar).find((k) => url.includes(k));
    const v = svar[nokkel];
    if (v === 'IKKE_FUNNET') return { ok: false, status: 404, text: async () => 'Not Found' };
    return { ok: true, status: 200, text: async () => JSON.stringify(v ?? {}) };
  };
  return { hent, kall };
}

beforeEach(() => {
  nullstill();
  process.env.ADMIN_PIN = 'hemmelig';
  process.env.GITHUB_REPO = 'meg/side';
  process.env.GITHUB_TOKEN = 'token';
});

let opprinneligFetch;
beforeEach(() => { opprinneligFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = opprinneligFetch; });

// --- flett(): rene enhetstester ---

test('flett legger et nytt innlegg foerst naar slugen ikke finnes fra foer', () => {
  const res = flett([{ slug: 'gammel', tittel: 'A' }], { slug: 'ny', tittel: 'B' });
  assert.deepEqual(res, [{ slug: 'ny', tittel: 'B' }, { slug: 'gammel', tittel: 'A' }]);
});

test('flett erstatter kjent slug paa plassen sin, uten aa flytte den til start', () => {
  const res = flett(
    [{ slug: 'a', tittel: '1' }, { slug: 'b', tittel: '2' }, { slug: 'c', tittel: '3' }],
    { slug: 'b', tittel: 'oppdatert' }
  );
  assert.deepEqual(res, [
    { slug: 'a', tittel: '1' },
    { slug: 'b', tittel: 'oppdatert' },
    { slug: 'c', tittel: '3' }
  ]);
});

test('flett bevarer alle andre felt paa uroerte innlegg naar ett annet erstattes', () => {
  const res = flett(
    [
      { slug: 'a', tittel: '1', bilde: 'x.jpg', dato: '2026-01-01' },
      { slug: 'b', tittel: '2' }
    ],
    { slug: 'b', tittel: 'ny' }
  );
  assert.deepEqual(res[0], { slug: 'a', tittel: '1', bilde: 'x.jpg', dato: '2026-01-01' });
  assert.deepEqual(res[1], { slug: 'b', tittel: 'ny' });
});

test('flett behandler en naavaerende som ikke er en tabell som tom', () => {
  assert.deepEqual(flett(null, { slug: 'x' }), [{ slug: 'x' }]);
  assert.deepEqual(flett(undefined, { slug: 'x' }), [{ slug: 'x' }]);
  assert.deepEqual(flett({ ikke: 'en liste' }, { slug: 'x' }), [{ slug: 'x' }]);
});

test('to fletter etter hverandre beholder begge innleggene', () => {
  let liste = flett([], { slug: 'foerste', tittel: 'A' });
  liste = flett(liste, { slug: 'andre', tittel: 'B' });
  assert.deepEqual(liste, [
    { slug: 'andre', tittel: 'B' },
    { slug: 'foerste', tittel: 'A' }
  ]);
});

// --- api/save.js: validering ---

test('save avviser ugyldig navn paa samlingen med 400', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    samling: { navn: '', innlegg: { slug: 'gyldig-slug' } }
  }), res);
  assert.equal(res.kode, 400);
  assert.match(res.kropp.error, /navn/i);
});

test('save avviser ugyldig slug i samlingens innlegg med 400', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    samling: { navn: 'aktuelt', innlegg: { slug: 'Ugyldig Slug!' } }
  }), res);
  assert.equal(res.kode, 400);
  assert.match(res.kropp.error, /slug/i);
});

test('save avviser samling uten innlegg-objekt med 400, i stedet for aa krasje', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    samling: { navn: 'aktuelt' }
  }), res);
  assert.equal(res.kode, 400);
});

// --- api/save.js: hele veien gjennom, med falsk GitHub ---

test('samlingen havner i samme commit som edits og bilder', async () => {
  const gammeltInnhold = Buffer.from(JSON.stringify({ tittel: 'Gammel' })).toString('base64');
  const gammelSamling = Buffer.from(JSON.stringify([{ slug: 'gammel-post', tittel: 'Gammel post' }])).toString('base64');
  const { hent, kall } = falskGitHub({
    'contents/content/aktuelt.json': { content: gammeltInnhold },
    'contents/content/samlinger/aktuelt.json': { content: gammelSamling },
    'git/ref/heads/main': { object: { sha: 'HEAD1' } },
    'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
    'git/trees': { sha: 'TRE1' },
    'git/commits': { sha: 'COMMIT1' },
    'git/refs/heads/main': {}
  });
  globalThis.fetch = hent;

  const res = lagRes();
  await save(lagReq({
    page: 'aktuelt', pin: 'hemmelig', edits: { tittel: 'Ny tittel' },
    samling: { navn: 'aktuelt', innlegg: { slug: 'ny-post', tittel: 'Ny post' } }
  }), res);

  assert.equal(res.kode, 200);
  const commitKall = kall.filter((k) => k.url.endsWith('git/commits') && k.metode === 'POST');
  assert.equal(commitKall.length, 1);
  const tre = kall.find((k) => k.url.endsWith('git/trees')).kropp;
  const stier = tre.tree.map((t) => t.path);
  assert.ok(stier.includes('content/aktuelt.json'));
  assert.ok(stier.includes('content/samlinger/aktuelt.json'));

  const samlingBlob = tre.tree.find((t) => t.path === 'content/samlinger/aktuelt.json');
  const flettet = JSON.parse(samlingBlob.content);
  assert.deepEqual(flettet, [
    { slug: 'ny-post', tittel: 'Ny post' },
    { slug: 'gammel-post', tittel: 'Gammel post' }
  ]);
});

test('uten samling i requesten fungerer publisering akkurat som foer (regresjon)', async () => {
  const gammeltInnhold = Buffer.from(JSON.stringify({ tittel: 'Gammel' })).toString('base64');
  const { hent, kall } = falskGitHub({
    'contents/content/aktuelt.json': { content: gammeltInnhold },
    'git/ref/heads/main': { object: { sha: 'HEAD1' } },
    'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
    'git/trees': { sha: 'TRE1' },
    'git/commits': { sha: 'COMMIT1' },
    'git/refs/heads/main': {}
  });
  globalThis.fetch = hent;

  const res = lagRes();
  await save(lagReq({ page: 'aktuelt', pin: 'hemmelig', edits: { tittel: 'Ny tittel' } }), res);

  assert.equal(res.kode, 200);
  const tre = kall.find((k) => k.url.endsWith('git/trees')).kropp;
  assert.equal(tre.tree.length, 1);
  assert.equal(tre.tree[0].path, 'content/aktuelt.json');
});
