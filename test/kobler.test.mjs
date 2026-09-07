// test/kobler.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kobler } from '../bin/_kobler.mjs';

function lagIo(overstyr = {}) {
  const io = {
    skrevet: [], kjort: [], aapnet: [],
    kjor(cmd, args, opt) {
      io.kjort.push({ cmd, args, opt });
      if (cmd === 'git') return 'https://github.com/eier/kundeside.git\n';
      return '';
    },
    spor: async () => true,
    skriv: (l) => io.skrevet.push(String(l)),
    aapne: (u) => io.aapnet.push(u),
    naa: (() => { let t = 0; return () => (t += 1000); })(),
    lesToken: async () => 'github_pat_HEMMELIG',
    rot: '/tmp/x',
    malByggetid: async () => 48000,
    ...overstyr
  };
  return io;
}

test('setter de fire variablene', async () => {
  const io = lagIo();
  const res = await kobler(io);
  assert.deepEqual(res.satt.sort(), ['ADMIN_PIN', 'ADMIN_REBUILD_MS', 'GITHUB_REPO', 'GITHUB_TOKEN']);
  assert.equal(res.repo, 'eier/kundeside');
  assert.match(res.pin, /^\d{6}$/);
});

test('tokenet lekker aldri til skjermen', async () => {
  const io = lagIo();
  await kobler(io);
  assert.equal(io.skrevet.some((l) => l.includes('github_pat_HEMMELIG')), false);
});

test('tokenet ligger aldri paa en kommandolinje', async () => {
  const io = lagIo();
  await kobler(io);
  for (const k of io.kjort) {
    assert.equal((k.args || []).some((a) => String(a).includes('github_pat_HEMMELIG')), false);
  }
});

test('nei paa bekreftelsen setter ingenting', async () => {
  const io = lagIo({ spor: async () => false });
  const res = await kobler(io);
  assert.deepEqual(res.satt, []);
  assert.equal(io.kjort.some((k) => k.cmd === 'vercel'), false);
});

test('uten remote avbrytes det med en forklaring', async () => {
  const io = lagIo({ kjor: () => { throw new Error('no remote'); } });
  await assert.rejects(() => kobler(io), /remote/i);
});

test('tomt token avbryter i stedet for aa sette tomt', async () => {
  const io = lagIo({ lesToken: async () => '   ' });
  await assert.rejects(() => kobler(io), /token/i);
  assert.equal(io.kjort.some((k) => k.args?.includes('GITHUB_TOKEN')), false);
});

test('pin-en skrives ut til slutt', async () => {
  const io = lagIo();
  const res = await kobler(io);
  assert.ok(io.skrevet.some((l) => l.includes(res.pin)));
});

test('github-siden aapnes med rettighetene forklart foerst', async () => {
  const io = lagIo();
  await kobler(io);
  assert.equal(io.aapnet.length, 1);
  assert.match(io.aapnet[0], /github\.com\/settings\/personal-access-tokens/);
  assert.ok(io.skrevet.some((l) => /Contents/i.test(l)));
});

test('en feilende env add stopper flyten og sier hvilken', async () => {
  const io = lagIo({
    kjor(cmd, args) {
      if (cmd === 'git') return 'https://github.com/e/k.git\n';
      if (args?.includes('GITHUB_REPO')) throw new Error('Vercel avviste');
      return '';
    }
  });
  await assert.rejects(() => kobler(io), /GITHUB_REPO/);
});
