// Samlinger: en enkel liste av innlegg som hver skal bli sin egen side (blogg,
// aktuelt, siste nytt). Egen, enklere sti enn speilet i mirror.mjs: en samling
// har ingen "kilde" aa slaa opp mot, bare en fil med en tabell innlegg.
import { join } from 'node:path';

const TRANSLITT = { æ: 'ae', ø: 'oe', å: 'aa' };

// unikSlug legger -2, -3 og saa videre paa en slug som allerede er i bruk,
// til den ikke kolliderer. Delt av lagSlug (etter transliterering av
// tittelen under) og api/save.js (deconflikterer en slug klienten allerede
// har generert, uten aa kjenne tittelen den kom fra).
export function unikSlug(slug, brukte = []) {
  let kandidat = slug;
  let i = 2;
  while (brukte.includes(kandidat)) {
    kandidat = `${slug}-${i}`;
    i++;
  }
  return kandidat;
}

// lagSlug lager en URL-vennlig streng av en tittel. Kolliderer den med en slug
// som allerede er i bruk (brukte), faar den -2, -3 og saa videre.
export function lagSlug(tittel, brukte = []) {
  let s = String(tittel || '')
    .trim()
    .toLowerCase()
    .replace(/[æøå]/g, (t) => TRANSLITT[t] || t)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!s) s = 'innlegg';

  return unikSlug(s, brukte);
}

// lesSamlinger leser content/samlinger/*.json, en fil per samling, navngitt
// etter filnavnet uten .json. Filsystemet injiseres saa modulen er testbar
// uten aa skrive filer. Oedelagt JSON stopper aldri et bygg: samlingen blir
// tom, og bygget fortsetter med resten.
export function lesSamlinger(rot, lesFil, finnesFil, listMappe) {
  const mappe = join(rot, 'content', 'samlinger');
  if (!finnesFil(mappe)) return {};

  const samlinger = {};
  for (const fil of listMappe(mappe)) {
    if (!fil.endsWith('.json')) continue;
    const navn = fil.replace(/\.json$/, '');

    let innlegg;
    try {
      const parsed = JSON.parse(lesFil(join(mappe, fil)));
      innlegg = Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn(`  ! ${fil} lar seg ikke lese som JSON, samlingen "${navn}" blir tom`);
      innlegg = [];
    }
    samlinger[navn] = innlegg;
  }
  return samlinger;
}

// synlige filtrerer bort ethvert innlegg som er markert som utkast. Et utkast
// skal aldri havne i et bygg, i motsetning til _skjult som bare gjemmes med CSS.
export function synlige(innlegg) {
  return innlegg.filter((i) => !i._kladd);
}

// GYLDIG_SLUG er moensteret lagSlug garantert produserer: smaa bokstaver,
// tall og enkeltbindestrek mellom, aldri tomt, aldri ".." eller "/". build/index.mjs
// bruker post.slug baade som stisegment (join(DIST, navn, post.slug)) og i en
// href, og maa sjekke den mot dette foer den stoles paa. Uten sjekken kan en
// slug som "../../evil" havne utenfor dist, og en manglende slug krasjer
// path.join() for hele bygget.
const GYLDIG_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugErGyldig(slug) {
  return typeof slug === 'string' && GYLDIG_SLUG.test(slug);
}
