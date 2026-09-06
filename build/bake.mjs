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

export function bakeLister(dom, slaOpp) {
  let treff = 0;

  for (const beholder of dom.querySelectorAll('[data-editable-list]')) {
    const poster = slaOpp(beholder, beholder.getAttribute('data-editable-list'));
    if (!Array.isArray(poster) || poster.length === 0) continue;

    const maler = beholder.querySelectorAll('[data-list-item]');
    if (maler.length === 0) continue;

    // Hver post rendres fra SIN egen mal etter indeks. En liste der kort 2 er
    // framhevet beholder framhevingen naar kort 1 redigeres. Rendres alt fra
    // den foerste malen, forsvinner strukturen ved foerste publisering.
    const malStrenger = Array.from(maler).map((el) => el.toString());
    maler.forEach((el) => el.remove());

    poster.forEach((post, i) => {
      const rot = parse(malStrenger[i] || malStrenger[malStrenger.length - 1]);
      const element = rot.querySelector('[data-list-item]');
      if (!element) return;

      for (const felt of element.querySelectorAll('[data-list-field]')) {
        const k = felt.getAttribute('data-list-field');
        if (post[k] != null) felt.set_content(post[k]);
      }

      for (const felt of element.querySelectorAll('[data-list-image-field]')) {
        const k = felt.getAttribute('data-list-image-field');
        const pos = post[`${k}@pos`];
        // Bildet i "Les mer"-modalen har sitt eget punkt, fordi utsnittet der er
        // en annen form enn kortets. Leses tilbake av detail-modal.js.
        const posModal = post[`${k}@pos-modal`];
        if (posModal) felt.setAttribute('data-pos-modal', posModal);
        if (post[k] == null && !pos) continue;
        if (post[k] != null) {
          if (felt.tagName === 'IMG') {
            felt.setAttribute('src', post[k]);
            if (post.tittel) felt.setAttribute('alt', post.tittel);
          } else {
            settStilProp(felt, 'background-image', `url('${post[k]}')`);
          }
        }
        settFokuspunkt(felt, pos);
      }

      if (post._skjult) {
        const klasser = (element.getAttribute('class') || '').trim();
        element.setAttribute('class', `${klasser}${klasser ? ' ' : ''}is-hidden-item`);
      }

      beholder.appendChild(element);
      treff++;
    });
  }

  return treff;
}
