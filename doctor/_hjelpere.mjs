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
