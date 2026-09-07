// doctor/regler/admin-tokens.mjs
const KREVDE = ['--adm-aksent', '--adm-flate', '--adm-tekst', '--adm-fare', '--adm-ok'];

export default {
  navn: 'admin-tokens',
  alvor: 'feil',
  sjekk: (p) => {
    const cssFiler = p.filer.filter((f) => f.sti.endsWith('.css'));
    const definerer = cssFiler.filter((f) => KREVDE.every((v) => f.tekst.includes(v)));

    if (definerer.length === 0) {
      const alt = cssFiler.map((f) => f.tekst).join('\n');
      const mangler = KREVDE.filter((v) => !alt.includes(v));
      return [{
        fil: 'static/css/', linje: 0,
        melding: `Admin-baren mangler farger: ${mangler.join(', ')}. Sett dem i sidens :root.`
      }];
    }

    // Aa definere dem holder ikke. Er fila ikke lenket fra noen mal, laster
    // nettleseren den aldri, og admin-baren kjorer paa fallbackene i edit.css.
    // Regelen meldte OK paa noeyaktig det tilfellet den finnes for.
    const html = p.filer.filter((f) => f.sti.endsWith('.html')).map((f) => f.tekst).join('\n');
    const lenket = definerer.some((f) => {
      const navn = f.sti.split('/').pop();
      return html.includes(navn);
    });
    if (!lenket) {
      return [{
        fil: definerer[0].sti, linje: 0,
        melding: `${definerer[0].sti} definerer admin-fargene, men ingen mal lenker til den. Legg inn en <link> i <head>, etter admin/edit.css.`
      }];
    }
    return [];
  }
};
