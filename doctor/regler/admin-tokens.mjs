// doctor/regler/admin-tokens.mjs
const KREVDE = ['--adm-aksent', '--adm-flate', '--adm-tekst', '--adm-fare', '--adm-ok'];

export default {
  navn: 'admin-tokens',
  alvor: 'feil',
  sjekk: (p) => {
    const allCss = p.filer.filter((f) => f.sti.endsWith('.css')).map((f) => f.tekst).join('\n');
    const mangler = KREVDE.filter((v) => !allCss.includes(v));
    return mangler.length
      ? [{ fil: 'static/css/', linje: 0, melding: `Admin-baren mangler farger: ${mangler.join(', ')}. Sett dem i sidens :root.` }]
      : [];
  }
};
