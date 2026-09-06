// Byggesteget: templates/*.html + content/<side>.json -> dist/*.html
// Besoekende faar ren statisk HTML. Ingen kall paa lesestien, ingen blink.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { lagOppslag } from './mirror.mjs';
import { bakeTekst, bakeBilder, bakeLister } from './bake.mjs';

const EDITOR = fileURLToPath(new URL('../editor/', import.meta.url));

export function build(config = {}) {
  const rot = config.rot || process.cwd();
  const sti = (s, standard) => {
    const v = s || standard;
    return isAbsolute(v) ? v : join(rot, v);
  };

  const TPL = sti(config.templates, 'templates');
  const INNHOLD = sti(config.content, 'content');
  const STATISK = sti(config.statisk, 'static');
  const DIST = sti(config.dist, 'dist');

  // OEdelagt JSON skal aldri stoppe et bygg. En kundeside som ikke lar seg
  // deploye fordi en fil har en komma-feil, er verre enn en side som viser
  // standardteksten sin til noen retter opp.
  function lastInnhold(side) {
    const f = join(INNHOLD, `${side}.json`);
    if (!existsSync(f)) return {};
    try { return JSON.parse(readFileSync(f, 'utf8')); }
    catch { console.warn(`  ! ${side}.json lar seg ikke lese som JSON, bruker malens standardtekst`); return {}; }
  }

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  if (existsSync(STATISK)) cpSync(STATISK, DIST, { recursive: true });
  cpSync(EDITOR, join(DIST, 'admin'), { recursive: true });

  let sider = 0, treff = 0;

  for (const fil of readdirSync(TPL)) {
    if (!fil.endsWith('.html')) continue;
    const side = fil.replace(/\.html$/, '');
    const dom = parse(readFileSync(join(TPL, fil), 'utf8'), { comment: true });
    const slaOpp = lagOppslag(lastInnhold(side), lastInnhold);

    treff += bakeTekst(dom, slaOpp);
    treff += bakeBilder(dom, slaOpp);
    treff += bakeLister(dom, slaOpp);

    let html = dom.toString();
    if (!/^\s*<!doctype/i.test(html)) html = `<!DOCTYPE html>\n${html}`;
    writeFileSync(join(DIST, fil), html);
    sider++;
  }

  console.log(`✓ Bygde ${sider} sider med ${treff} innholdstreff -> dist/`);
  return { sider, treff };
}
