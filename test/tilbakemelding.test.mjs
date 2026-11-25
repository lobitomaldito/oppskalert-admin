// test/tilbakemelding.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import tilbakemelding, { nullstill } from '../api/tilbakemelding.js';
import { nullstill as nullstillPin } from '../api/_rateLimit.mjs';

let kall;
const ekteFetch = globalThis.fetch;
beforeEach(() => {
  nullstill(); nullstillPin();
  kall = [];
  Object.assign(process.env, { GITHUB_REPO: 'meg/side', ADMIN_PIN: '123456', SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' });
  globalThis.fetch = async (url, init = {}) => {
    kall.push({ url: String(url), metode: init.method || 'GET', kropp: init.body && JSON.parse(init.body) });
    const kropp = (init.method || 'GET') === 'GET' ? JSON.stringify([{ id: 'a', navn: 'Kari' }]) : '';
    return new Response(kropp, { status: init.method === 'POST' ? 201 : 200 });
  };
});
afterEach(() => { globalThis.fetch = ekteFetch; });

function lagRes() {
  const r = { kode: 0, kropp: null };
  r.status = (k) => { r.kode = k; return r; };
  r.json = (b) => { r.kropp = b; return r; };
  return r;
}
const post = async (body, ip = '9.9.9.9') => {
  const res = lagRes();
  await tilbakemelding({ method: 'POST', body, headers: { 'x-vercel-forwarded-for': ip }, socket: {} }, res);
  return res;
};
const gyldig = (ekstra = {}) => ({ navn: 'Kari Nordmann', firma: 'Coop', tekst: 'Strålende!', samtykke: 'on', oppdrag: 'Konferansier', ...ekstra });

test('gyldig omtale lagres med siden som nøkkel og status ny', async () => {
  const res = await post(gyldig());
  assert.equal(res.kode, 200);
  assert.equal(kall.length, 1);
  assert.equal(kall[0].url, 'https://sb/rest/v1/tilbakemeldinger');
  assert.equal(kall[0].kropp.side, 'meg/side');
  assert.equal(kall[0].kropp.firma, 'Coop');
  assert.equal(kall[0].kropp.status, undefined, 'status settes av databasen');
});

test('mangler samtykke eller felt gir 400 og lagrer ingenting', async () => {
  assert.equal((await post(gyldig({ samtykke: '' }))).kode, 400);
  assert.equal((await post(gyldig({ firma: ' ' }))).kode, 400);
  assert.equal(kall.length, 0);
});

test('honningkrukke og for rask utfylling gir ok uten lagring', async () => {
  assert.equal((await post(gyldig({ nettside: 'x' }))).kode, 200);
  assert.equal((await post(gyldig({ _t: 500 }))).kode, 200);
  assert.equal(kall.length, 0);
});

test('sperre etter fem innsendinger fra samme IP', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post(gyldig())).kode, 200);
  assert.equal((await post(gyldig())).kode, 429);
});

test('panelet trenger riktig PIN', async () => {
  assert.equal((await post({ pin: 'feil', handling: 'liste' })).kode, 401);
  const ok = await post({ pin: '123456', handling: 'liste' });
  assert.equal(ok.kode, 200);
  assert.deepEqual(ok.kropp.omtaler, [{ id: 'a', navn: 'Kari' }]);
  assert.match(kall.at(-1).url, /side=eq\.meg%2Fside&status=eq\.ny/);
});

test('merk setter status bare med gyldig id og status', async () => {
  const id = '3f2a1b4c-1234-4abc-8def-0123456789ab';
  assert.equal((await post({ pin: '123456', handling: 'merk', id: 'x; drop', status: 'publisert' })).kode, 400);
  assert.equal((await post({ pin: '123456', handling: 'merk', id, status: 'slettet' })).kode, 400);
  const ok = await post({ pin: '123456', handling: 'merk', id, status: 'publisert' });
  assert.equal(ok.kode, 200);
  assert.equal(kall.at(-1).metode, 'PATCH');
  assert.match(kall.at(-1).url, new RegExp(`id=eq\\.${id}&side=eq\\.meg%2Fside`));
  assert.deepEqual(kall.at(-1).kropp, { status: 'publisert' });
});
