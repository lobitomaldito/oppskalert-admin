// doctor/index.mjs
// Kjoerer regelsettet mot et prosjekt. Regler er rene funksjoner over
// { rot, filer }, saa de kan testes uten aa skrive en eneste fil.
import margin from './regler/ingen-inline-margin.mjs';
import strongB from './regler/strong-og-b.mjs';
import tokens from './regler/admin-tokens.mjs';
import fonts from './regler/ingen-google-fonts.mjs';
import byggetid from './regler/malt-byggetid.mjs';
import strek from './regler/tankestrek.mjs';
import ikkeXmenY from './regler/ikke-x-men-y.mjs';
import sidenokkel from './regler/sidenokkel.mjs';
import dekningTekst, { dekningListe, dekningRammeTekst } from './regler/dekning-tekst.mjs';
import dekningBilde, { dekningRammeBilde } from './regler/dekning-bilde.mjs';
import gjentattGruppe from './regler/gjentatt-gruppe.mjs';
import samlingMal, { samlingFelt, malUnderstrek } from './regler/samling.mjs';
import apiModultype from './regler/api-modultype.mjs';

export const STANDARDREGLER = [
  margin, strongB, tokens, fonts, byggetid, strek, ikkeXmenY, sidenokkel,
  dekningTekst, dekningListe, dekningRammeTekst, dekningBilde, dekningRammeBilde, gjentattGruppe,
  samlingMal, samlingFelt, malUnderstrek, apiModultype
];

export function kjor(prosjekt, regler = STANDARDREGLER) {
  const feil = [], varsler = [];
  for (const regel of regler) {
    for (const funn of regel.sjekk(prosjekt)) {
      (regel.alvor === 'feil' ? feil : varsler).push({ ...funn, regel: regel.navn });
    }
  }
  return { feil, varsler };
}
