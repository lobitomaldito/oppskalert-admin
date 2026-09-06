// Skriver innhold inn i en parset DOM. Modulen vet ingenting om filsystemet og
// ingenting om speiling: den faar et oppslag inn og bruker det.
import { parse } from 'node-html-parser';

// Bytt EN deklarasjon i et inline style-attributt, la resten staa.
export function settStilProp(el, prop, verdi) {
  const gammel = (el.getAttribute('style') || '')
    .replace(new RegExp(`${prop}\\s*:[^;]*;?`, 'i'), '')
    .trim();
  el.setAttribute('style', `${gammel}${gammel ? ' ' : ''}${prop}:${verdi};`);
}

// "50% 22%" styrer hva som vises i et beskaaret bilde. Uten den beholder
// nettleseren midten, og kutter gjerne hoder.
export function settFokuspunkt(el, pos) {
  if (!pos) return;
  settStilProp(el, el.tagName === 'IMG' ? 'object-position' : 'background-position', pos);
}

export function bakeTekst(dom, slaOpp) {
  let treff = 0;
  for (const el of dom.querySelectorAll('[data-edit]')) {
    const verdi = slaOpp(el, el.getAttribute('data-edit'));
    // != null slipper tom streng gjennom. En klient som toemmer et felt skal faa
    // det toemt, og ikke se standardteksten komme tilbake ved neste bygg.
    if (verdi != null) { el.set_content(verdi); treff++; }
  }
  return treff;
}

export function bakeBilder(dom, slaOpp) {
  let treff = 0;
  for (const el of dom.querySelectorAll('[data-edit-image]')) {
    const nokkel = el.getAttribute('data-edit-image');
    const url = slaOpp(el, nokkel);
    const pos = slaOpp(el, `${nokkel}@pos`);
    if (url == null && !pos) continue;
    treff++;
    if (url != null) {
      if (el.tagName === 'IMG') el.setAttribute('src', url);
      else settStilProp(el, 'background-image', `url('${url}')`);
    }
    settFokuspunkt(el, pos);
  }
  return treff;
}
