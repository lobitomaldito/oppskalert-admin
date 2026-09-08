// test/byggetid.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { malByggetid, finnDomene } from '../bin/_byggetid.mjs';

function prosjekt({ lenket = true, projectName = 'kundeside' } = {}) {
  const rot = mkdtempSync(join(tmpdir(), 'oa-byggetid-'));
  if (lenket) {
    mkdirSync(join(rot, '.vercel'), { recursive: true });
    writeFileSync(join(rot, '.vercel', 'project.json'), JSON.stringify({ projectId: 'x', orgId: 'y', projectName }));
  }
  return rot;
}

// Klokke som gaar 1000 ms fram for hvert kall, saa "10 minutter" naas etter
// 600 kall uten en eneste ekte pause.
function lagKlokke(steg = 1000) {
  let t = 0;
  return () => (t += steg);
}

function lagIo(rot, overstyr = {}) {
  const io = {
    kjort: [],
    skrevet: [],
    ventet: [],
    kjor(cmd, args, opt) {
      io.kjort.push({ cmd, args, opt });
      return '';
    },
    naa: lagKlokke(),
    hent: async () => ({ ok: true, text: async () => '' }),
    vent: async (ms) => { io.ventet.push(ms); },
    skriv: (l) => io.skrevet.push(String(l)),
    rot,
    ...overstyr
  };
  return io;
}

// Leser den ferske verdien rett fra disk, siden den er tilfeldig og bare
// kjent av malByggetid selv paa forhaand. Fila ligger allerede naar hent()
// begynner aa bli kalt, siden malByggetid skriver den foer den committer.
function lesMerke(rot) {
  return readFileSync(join(rot, 'static', '.byggemerke'), 'utf8').trim();
}

test('finnDomene leser prosjektnavnet fra .vercel/project.json', () => {
  const rot = prosjekt({ projectName: 'schei-restaurering' });
  assert.equal(finnDomene(rot), 'schei-restaurering.vercel.app');
});

test('finnDomene gir null naar prosjektet ikke er lenket', () => {
  const rot = prosjekt({ lenket: false });
  assert.equal(finnDomene(rot), null);
});

test('finnDomene gir null ved ugyldig json', () => {
  const rot = mkdtempSync(join(tmpdir(), 'oa-byggetid-'));
  mkdirSync(join(rot, '.vercel'), { recursive: true });
  writeFileSync(join(rot, '.vercel', 'project.json'), '{ ikke json');
  assert.equal(finnDomene(rot), null);
});

test('finnDomene gir null naar projectName mangler', () => {
  const rot = mkdtempSync(join(tmpdir(), 'oa-byggetid-'));
  mkdirSync(join(rot, '.vercel'), { recursive: true });
  writeFileSync(join(rot, '.vercel', 'project.json'), JSON.stringify({ projectId: 'x' }));
  assert.equal(finnDomene(rot), null);
});

test('uten et lenket prosjekt: null, en forklaring, og ingen git-kommandoer', async () => {
  const rot = prosjekt({ lenket: false });
  const io = lagIo(rot);
  const res = await malByggetid(io);
  assert.equal(res, null);
  assert.ok(io.skrevet.some((l) => /vercel link/i.test(l)));
  assert.equal(io.kjort.length, 0);
  assert.equal(existsSync(join(rot, 'static', '.byggemerke')), false);
});

test('skriver merkefila under static/ med en fersk verdi', async () => {
  const rot = prosjekt();
  const io = lagIo(rot, { hent: async () => ({ ok: true, text: async () => lesMerke(rot) }) });
  await malByggetid(io);
  assert.ok(existsSync(join(rot, 'static', '.byggemerke')));
  assert.match(lesMerke(rot), /^[0-9a-f]{18}$/);
});

test('committer og pusher merkefila, i den rekkefolgen', async () => {
  const rot = prosjekt();
  const io = lagIo(rot, { hent: async () => ({ ok: true, text: async () => lesMerke(rot) }) });
  await malByggetid(io);
  const kommandoer = io.kjort.map((k) => `${k.cmd} ${k.args[0]}`);
  assert.deepEqual(kommandoer, ['git add', 'git commit', 'git push']);
  assert.ok(io.kjort[0].args.includes(join('static', '.byggemerke')));
});

test('treffer med en gang naar hent svarer med den ferske verdien', async () => {
  const rot = prosjekt();
  const io = lagIo(rot, { hent: async () => ({ ok: true, text: async () => lesMerke(rot) }) });
  const ms = await malByggetid(io);
  assert.equal(typeof ms, 'number');
  assert.ok(ms > 0);
  assert.equal(io.ventet.length, 0, 'skulle ikke trengt aa vente naar forste forsok traff');
});

test('poller forbi gammel verdi til den ferske verdien dukker opp', async () => {
  const rot = prosjekt();
  let kall = 0;
  const io = lagIo(rot, {
    hent: async () => {
      kall += 1;
      if (kall <= 3) return { ok: true, text: async () => 'gammel-verdi-fra-forrige-runde' };
      return { ok: true, text: async () => lesMerke(rot) };
    }
  });
  const ms = await malByggetid(io);
  assert.equal(typeof ms, 'number');
  assert.equal(kall, 4);
  assert.equal(io.ventet.length, 3, 'skulle ventet mellom de tre bomskuddene');
});

test('venter minst 5 sekund foerste gang, hamrer ikke', async () => {
  const rot = prosjekt();
  let kall = 0;
  const io = lagIo(rot, {
    hent: async () => {
      kall += 1;
      if (kall === 1) return { ok: true, text: async () => 'gammel' };
      return { ok: true, text: async () => lesMerke(rot) };
    }
  });
  await malByggetid(io);
  assert.equal(io.ventet[0], 5000);
});

test('taaler at hent kaster (nettverksfeil) uten aa krasje', async () => {
  const rot = prosjekt();
  let kall = 0;
  const io = lagIo(rot, {
    hent: async () => {
      kall += 1;
      if (kall <= 2) throw new Error('kortvarig nettverksfeil');
      return { ok: true, text: async () => lesMerke(rot) };
    }
  });
  const ms = await malByggetid(io);
  assert.equal(typeof ms, 'number');
});

test('gir opp etter 10 minutter, med null og en forklaring, i stedet for aa henge', async () => {
  const rot = prosjekt();
  const io = lagIo(rot, {
    naa: lagKlokke(400_000), // to kall og vi er forbi tidsavbruddet
    hent: async () => ({ ok: true, text: async () => 'aldri den ferske verdien' })
  });
  const ms = await malByggetid(io);
  assert.equal(ms, null);
  assert.ok(io.skrevet.some((l) => /10 minutter/.test(l)));
});

test('returnerer millisekunder fra push til treff, ikke bare et sant/usant svar', async () => {
  const rot = prosjekt();
  let kall = 0;
  const io = lagIo(rot, {
    naa: lagKlokke(1000),
    hent: async () => {
      kall += 1;
      if (kall <= 2) return { ok: true, text: async () => 'gammel' };
      return { ok: true, text: async () => lesMerke(rot) };
    }
  });
  const ms = await malByggetid(io);
  // naa()-kall: start=1000, to bomskudd bruker ett timeout-sjekk-kall hver
  // (2000, 3000), treffet paa tredje forsok leser naa() en fjerde gang
  // (4000). 4000 - 1000 = 3000.
  assert.equal(ms, 3000);
});
