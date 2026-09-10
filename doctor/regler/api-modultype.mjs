// doctor/regler/api-modultype.mjs
// Vercel velger modulsystem for api/*.js ut fra "type" i package.json. Uten
// "type": "module" oversettes skallet `export { default } from ...` til
// require(), og pakken er ESM, saa hvert kall krasjer med ERR_REQUIRE_ESM.
// Motsatt vei krasjer et CommonJS-endepunkt naar typen er module. Verken dev
// eller bygget merker noe, feilen viser seg foerst etter deploy.
const ESM = /^\s*(import\s+[\w{*'"]|export\s)/;
const CJS = /^\s*(module\.exports|exports\.\w+\s*=)|\brequire\s*\(/;

function forsteLinje(tekst, moenster) {
  const linjer = tekst.split('\n');
  for (let i = 0; i < linjer.length; i++) {
    if (/^\s*(\/\/|\*|\/\*)/.test(linjer[i])) continue;
    if (moenster.test(linjer[i])) return i + 1;
  }
  return 0;
}

export default {
  navn: 'api-modultype',
  alvor: 'feil',
  sjekk: (p) => {
    const pakke = p.filer.find((f) => f.sti === 'package.json');
    let type;
    try { type = pakke ? JSON.parse(pakke.tekst).type : undefined; } catch { return []; }
    const erModule = type === 'module';
    const typeTekst = type ? `"type": "${type}"` : 'ingen "type"';

    const funn = [];
    for (const fil of p.filer) {
      if (!fil.sti.startsWith('api/') || !fil.sti.endsWith('.js')) continue;
      if (!erModule) {
        const linje = forsteLinje(fil.tekst, ESM);
        if (linje) funn.push({ fil: fil.sti, linje, melding: `Fila bruker import/export, men package.json har ${typeTekst}. Vercel laster den da som CommonJS, og hvert kall krasjer med ERR_REQUIRE_ESM etter deploy. Kjoer \`npm pkg set type=module\`.` });
      } else {
        const linje = forsteLinje(fil.tekst, CJS);
        if (linje) funn.push({ fil: fil.sti, linje, melding: 'Fila bruker require/module.exports, men package.json har "type": "module". Vercel laster den da som ESM, og hvert kall krasjer etter deploy. Skriv den om til import/export.' });
      }
    }
    return funn;
  }
};
