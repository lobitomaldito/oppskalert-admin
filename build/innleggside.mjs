// Innleggssiden: en side per innlegg i en samling, og skjemaet redigeringssiden
// bygger fra samme mal.
//
// Malen er templates/_<samling>.html, eller templates/_innlegg.html naar
// samlingen ikke har sin egen. Feltene merkes med
//   data-innlegg="felt"          tekst (paa <title>/<meta>: ren tekst, {} byttes)
//   data-innlegg-image="felt"    ett bilde
//   data-innlegg-galleri="felt"  en liste bilder, ett <img> per adresse
// og de samme merkene forteller redigeringssiden hvilke felt skjemaet skal ha.
import { parse } from 'node-html-parser';
import { settStilProp } from './bake.mjs';

const ENTITETER = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

// Ren tekst av et felt, til <title>, meta og alt. Feltene er HTML.
export function renTekst(html) {
  return String(html == null ? '' : html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITETER[e])
    .replace(/\s+/g, ' ')
    .trim();
}

function escAttr(tekst) {
  return String(tekst).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Bare rotrelative adresser og http(s) slipper inn i et <img src>. Galleriet
// skrives som raa HTML, saa en adresse med et " eller javascript: skal aldri
// naa fram dit.
function gyldigBilde(url) {
  return typeof url === 'string' && /^(\/(?!\/)|https?:\/\/)[^"<>\s]+$/i.test(url);
}

export function fyllInnlegg(rot, post) {
  for (const el of rot.querySelectorAll('[data-innlegg]')) {
    const verdi = post[el.getAttribute('data-innlegg')];
    if (verdi == null) continue;
    if (el.tagName === 'TITLE' || el.tagName === 'META') {
      const gammel = el.tagName === 'TITLE' ? el.text : (el.getAttribute('content') || '');
      const tekst = gammel.includes('{}') ? gammel.replace('{}', renTekst(verdi)) : renTekst(verdi);
      if (el.tagName === 'TITLE') el.set_content(escAttr(tekst));
      else el.setAttribute('content', tekst);
    } else {
      el.set_content(String(verdi));
    }
  }
  for (const el of rot.querySelectorAll('[data-innlegg-image]')) {
    const url = post[el.getAttribute('data-innlegg-image')];
    if (url == null) continue;
    if (el.tagName === 'IMG') {
      el.setAttribute('src', url);
      if (post.tittel) el.setAttribute('alt', renTekst(post.tittel));
    } else if (el.tagName === 'META') {
      el.setAttribute('content', url);
    } else {
      settStilProp(el, 'background-image', `url('${url}')`);
    }
  }
  for (const el of rot.querySelectorAll('[data-innlegg-galleri]')) {
    const liste = post[el.getAttribute('data-innlegg-galleri')];
    if (!Array.isArray(liste)) continue;
    const alt = escAttr(renTekst(post.tittel));
    el.set_content(liste.filter(gyldigBilde)
      .map((url) => `<img src="${escAttr(url)}" loading="lazy" alt="${alt}">`).join(''));
  }
}

// De andre innleggene, fra innlegget etter dette og rundt, saa nabosidene
// viser ulike forslag. sist="status=solgt" flytter innlegg der feltet
// inneholder verdien bakerst.
export function velgRelaterte(poster, i, antall, sist) {
  let andre = [];
  for (let k = 1; k < poster.length; k++) andre.push(poster[(i + k) % poster.length]);
  const [felt, verdi] = String(sist || '').split('=');
  if (felt && verdi) {
    const treff = (p) => renTekst(p[felt]).toLowerCase().includes(verdi.toLowerCase());
    andre = [...andre.filter((p) => !treff(p)), ...andre.filter(treff)];
  }
  return andre.slice(0, antall);
}

// Bygger innleggssiden for poster[i]. [data-relaterte="N"] er seksjonen med
// forslag, [data-relatert] inni den er kortmalen. Malen tas ut FOER siden
// fylles, ellers ville kortmalens felt faatt dette innleggets verdier.
export function bakInnleggside(dom, poster, i, navn) {
  const post = poster[i];
  const seksjoner = dom.querySelectorAll('[data-relaterte]').map((seksjon) => {
    const mal = seksjon.querySelector('[data-relatert]');
    const forelder = mal && mal.parentNode;
    const malStreng = mal ? mal.toString() : '';
    if (mal) mal.remove();
    return { seksjon, forelder, malStreng };
  });

  fyllInnlegg(dom, post);

  for (const { seksjon, forelder, malStreng } of seksjoner) {
    const n = Number(seksjon.getAttribute('data-relaterte'));
    const valgte = velgRelaterte(poster, i, Number.isFinite(n) && n > 0 ? n : 3, seksjon.getAttribute('data-relaterte-sist'));
    if (!malStreng || valgte.length === 0) { seksjon.remove(); continue; }
    for (const p of valgte) {
      const kort = parse(malStreng);
      fyllInnlegg(kort, p);
      for (const a of kort.querySelectorAll('[data-samling-lenke]')) a.setAttribute('href', `/${navn}/${p.slug}/`);
      forelder.appendChild(kort.querySelector('[data-relatert]'));
    }
  }

  // Leses av editor/skjema.js, som legger en Rediger-knapp paa siden for admin.
  const body = dom.querySelector('body');
  if (body) body.setAttribute('data-samling-innlegg', `${navn}/${post.slug}`);
}

const ETIKETTER = {
  tittel: 'Tittel', ingress: 'Kort beskrivelse', brodtekst: 'Beskrivelse',
  bilde: 'Hovedbilde', galleri: 'Flere bilder', dato: 'Dato', pris: 'Pris', status: 'Status'
};

function standardType(tag) {
  if (['DIV', 'SECTION', 'ARTICLE'].includes(tag)) return 'lang';
  if (['P', 'BLOCKQUOTE'].includes(tag)) return 'kort';
  return 'linje';
}

// Feltene redigeringssiden skal vise, i den rekkefoelgen de staar i malen.
// Kortmalen for relaterte, <title> og <meta> gjenbruker felt som allerede
// finnes paa siden, og teller ikke.
export function lagSkjema(malRaw) {
  const dom = parse(malRaw);
  const felt = [];
  const sett = new Set();
  for (const el of dom.querySelectorAll('[data-innlegg], [data-innlegg-image], [data-innlegg-galleri]')) {
    if (el.tagName === 'TITLE' || el.tagName === 'META' || el.closest('[data-relaterte]')) continue;
    let navn, type;
    if (el.hasAttribute('data-innlegg-galleri')) { navn = el.getAttribute('data-innlegg-galleri'); type = 'galleri'; }
    else if (el.hasAttribute('data-innlegg-image')) { navn = el.getAttribute('data-innlegg-image'); type = 'bilde'; }
    else {
      navn = el.getAttribute('data-innlegg');
      type = el.getAttribute('data-innlegg-valg') ? 'valg' : (el.getAttribute('data-innlegg-type') || standardType(el.tagName));
    }
    if (!navn || sett.has(navn)) continue;
    sett.add(navn);
    felt.push({
      navn, type,
      rekke: Number(el.getAttribute('data-innlegg-rekke')) || 1000 + felt.length,
      etikett: el.getAttribute('data-innlegg-etikett') || ETIKETTER[navn] || navn,
      hjelp: el.getAttribute('data-innlegg-hjelp') || '',
      valg: (el.getAttribute('data-innlegg-valg') || '').split('|').map((v) => v.trim()).filter(Boolean)
    });
  }
  // data-innlegg-rekke="1" styrer rekkefoelgen i skjemaet naar den boer vaere
  // en annen enn paa siden (tittel foer bilde). Uten den: malens rekkefoelge.
  return felt.sort((a, b) => a.rekke - b.rekke).map(({ rekke, ...f }) => f);
}
