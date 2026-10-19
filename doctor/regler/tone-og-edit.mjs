// doctor/regler/tone-og-edit.mjs
// Design Lab fra /quick-demo bytter tekst med settTone(), og kjoerer
// settTone('1') ved hver sidelasting. Leser tone 1 data-tone-1, skrives den
// opprinnelige demoteksten tilbake over det kunden har lagret i panelet:
// bygget er riktig, men besoekende ser gammel tekst. Kom fra Lin Advokater
// 2026-10-19. Rettelsen er at tone 1 leses fra elementets egen tekst.
import { parse } from 'node-html-parser';

const TONE = /^data-tone-\d+$/;
// ponytail: heuristikk. Et skript som nevner data-tone og leser .textContent
// inn i en variabel regnes som rettet (el.__t1 = el.textContent). Lurer den
// seg, er neste steg aa kjoere settTone i jsdom og sammenligne teksten.
const LESER_TEKST = /=\s*[\w.$]+\.textContent\b(?!\s*=)/;

function rettetISkript(p) {
  return p.filer.some((f) => f.sti.endsWith('.js') && f.tekst.includes('data-tone') && LESER_TEKST.test(f.tekst));
}

export default {
  navn: 'tone-og-edit',
  alvor: 'feil',
  sjekk: (p) => {
    if (rettetISkript(p)) return [];
    const funn = [];
    for (const fil of p.filer) {
      if (!fil.sti.startsWith('templates/') || !fil.sti.endsWith('.html')) continue;
      for (const el of parse(fil.tekst).querySelectorAll('[data-edit]')) {
        if (!Object.keys(el.attributes).some((a) => TONE.test(a))) continue;
        funn.push({
          fil: fil.sti,
          linje: 0,
          melding: `data-edit="${el.getAttribute('data-edit')}" har ogsaa data-tone-N. En tonebytter i nettleseren (Design Lab) skriver over lagret innhold ved hver sidelasting, med mindre tone 1 leses fra elementets egen tekst (el.textContent) i stedet for data-tone-1.`
        });
      }
    }
    return funn;
  }
};
