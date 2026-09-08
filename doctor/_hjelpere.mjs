// doctor/_hjelpere.mjs
// Egen fil fordi reglene importerer denne og index.mjs importerer reglene.
// La den ligge i index.mjs, ble importen sirkulaer.
export function perLinje(prosjekt, filter, test) {
  const funn = [];
  for (const fil of prosjekt.filer) {
    if (!filter(fil.sti)) continue;
    fil.tekst.split('\n').forEach((linje, i) => {
      const melding = test(linje, fil);
      if (melding) funn.push({ fil: fil.sti, linje: i + 1, melding });
    });
  }
  return funn;
}

// Fanger <meta http-equiv="refresh" ...> uansett rekkefolge paa attributtene
// og om verdien staar i enkelt- eller dobbeltfnutt.
const META_REFRESH = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?refresh["']?[^>]*>/i;

// Delt av dekning-tekst, dekning-bilde og gjentatt-gruppe: hvilke maler
// dekningsreglene i det hele tatt skal lese. Tre slags maler blir aldri
// redigert direkte av kunden via data-edit/data-edit-image og skal derfor
// aldri gi funn her:
//   - 404-siden, som editoren ikke har noen inngang til
//   - en omdirigeringsstubbe, kjent paa <meta http-equiv="refresh">
//   - en underscore-prefikset mal (f.eks. templates/_innlegg.html), som
//     build/index.mjs bevisst aldri bygger som egen side (samme sjekk som
//     build() sin `if (fil.startsWith('_')) continue;`). Innleggsmaler
//     bruker data-innlegg/data-innlegg-image i stedet, sjekket av egne
//     regler i doctor/regler/samling.mjs, saa dekningsreglene skal ikke
//     lese dem i det hele tatt.
// Bevisst IKKE et kriterium: mangler data-page-key eller har noindex. Begge
// saa ut som gode filtre under kalibreringen, men Tiqri-demoene mangler
// data-page-key fordi de ikke er instrumentert i det hele tatt, og en av dem
// har noindex fordi den er en demo. Et filter paa noen av delene ville sloett
// av kontrollen paa nettopp de sidene den beviste seg paa. Se
// .superpowers/sdd/2026-09-07-oppskalert-admin-kontroll/task-3-rapport.md.
export function malFiler(p) {
  return p.filer.filter((f) => {
    if (!f.sti.startsWith('templates/') || !f.sti.endsWith('.html')) return false;
    const navn = f.sti.split('/').pop();
    if (navn === '404.html') return false;
    if (navn.startsWith('_')) return false;
    if (META_REFRESH.test(f.tekst)) return false;
    return true;
  });
}
