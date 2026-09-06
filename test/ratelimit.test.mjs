// test/ratelimit.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkPin, nullstill } from '../api/_rateLimit.mjs';

const req = (ip) => ({ headers: { 'x-forwarded-for': ip }, socket: {} });

beforeEach(() => nullstill());

test('riktig pin slipper gjennom', () => {
  assert.deepEqual(checkPin(req('1.1.1.1'), '1234', '1234'), { ok: true });
});

test('manglende ADMIN_PIN feiler lukket med 500', () => {
  const r = checkPin(req('1.1.1.1'), '', undefined);
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
  assert.match(r.error, /ADMIN_PIN/);
});

test('tom ADMIN_PIN feiler lukket, ikke aapent', () => {
  assert.equal(checkPin(req('1.1.1.1'), '', '').status, 500);
});

test('feil pin gir 401 og teller ned forsoek', () => {
  const r = checkPin(req('2.2.2.2'), 'feil', '1234');
  assert.equal(r.status, 401);
  assert.match(r.error, /4 forsøk igjen/);
});

test('fem bom laaser i 15 minutter og gir 429', () => {
  for (let i = 0; i < 5; i++) checkPin(req('3.3.3.3'), 'feil', '1234');
  const r = checkPin(req('3.3.3.3'), '1234', '1234');
  assert.equal(r.status, 429);
  assert.match(r.error, /15 min/);
});

test('en riktig pin nullstiller telleren', () => {
  checkPin(req('4.4.4.4'), 'feil', '1234');
  checkPin(req('4.4.4.4'), '1234', '1234');
  assert.match(checkPin(req('4.4.4.4'), 'feil', '1234').error, /4 forsøk igjen/);
});

test('sperren gjelder per ip', () => {
  for (let i = 0; i < 5; i++) checkPin(req('5.5.5.5'), 'feil', '1234');
  assert.deepEqual(checkPin(req('6.6.6.6'), '1234', '1234'), { ok: true });
});
