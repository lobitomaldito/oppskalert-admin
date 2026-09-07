// Editoren skriver content/<data-page-key>.json, bygget leser
// content/<malfilnavn>.json. Er de ulike, gaar publiseringen groent og siden
// endrer seg aldri. Ingen feilmelding noe sted, saa regelen er eneste vakt.
export default {
  navn: 'sidenokkel',
  alvor: 'feil',
  sjekk: (p) => {
    const funn = [];
    for (const fil of p.filer) {
      if (!fil.sti.endsWith('.html') || !fil.sti.startsWith('templates/')) continue;
      const malnavn = fil.sti.split('/').pop().replace(/\.html$/, '');
      const m = fil.tekst.match(/data-page-key=["']([^"']*)["']/);
      if (!m) continue;
      if (m[1] !== malnavn) {
        funn.push({
          fil: fil.sti, linje: 0,
          melding: `data-page-key er "${m[1]}", men malen heter ${malnavn}.html. Editoren ville skrevet content/${m[1]}.json mens bygget leser content/${malnavn}.json, saa publiseringen ville gaatt groent uten aa endre siden.`
        });
      }
    }
    return funn;
  }
};
