// Kundens Instagram inn på forsiden, hentet hver natt. Besøkende kobler seg
// aldri til Instagram: bildene lastes ned og committes til repoet, og bygget
// lager ren statisk HTML som før.
//
// Tre veier inn i samme funksjon:
//  ?koble     Sender kunden til Instagram-innloggingen (Instagram API with
//             Instagram Login, bare instagram_business_basic). Kunden logger inn
//             med Instagram og trenger ingen Facebook-side, men kontoen må være
//             en bedrifts- eller skaperkonto. Dette er lenken i mailen.
//  ?code=...  Kunden har godkjent. Koden byttes i en nøkkel som varer 60 dager,
//             kontoen slås opp, og første henting kjøres. Logger noen inn med en
//             annen konto enn IG_BRUKER, vises en testside og ingenting lagres.
//  cron       Vercel kaller daglig med CRON_SECRET, fornyer nøkkelen når den er
//             over en uke gammel og henter nye innlegg.
//
// Skriver til content/index.json: lista «insta» ({ bilde, tittel }) og tekstene
// ig_innlegg og ig_folgere. Endrer kunden dem i admin, varer det til neste natt.
// Bildene havner i static/assets/img/insta/ig-<id>.<ext>.
//
// Miljøvariabler (se README, «Instagram på forsiden»):
//   IG_APP_ID, IG_APP_SECRET                 delt i Vercel-teamet (Instagram-app-ID
//                                            og -hemmelighet, ikke Facebook-appens)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  delt i Vercel-teamet
//   IG_BRUKER, CRON_SECRET                   prosjektet
//   IG_REDIRECT_URI                          valgfri, ellers https://<host>/api/instagram
import { commitFiler, lesFil } from './_git.mjs';
import { supabase } from './_supabase.mjs';

const ANTALL = 18;
const IG = 'https://graph.instagram.com';
const VERSJON = 'v27.0';
const UKE = 7 * 24 * 3600 * 1000;
const INNHOLD = 'content/index.json';

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Mangler miljøvariabel ${k}`);
  return v;
};

async function json(r) {
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : {};
}

// ---------- Nøkkellager: Supabase-tabellen instagram_tilkoblinger, én rad per
// Instagram-konto.

async function lesNokkel(bruker) {
  return (await supabase(`instagram_tilkoblinger?side=eq.${encodeURIComponent(bruker)}&select=token,ig_id,fornyet`))[0] || null;
}

async function lagreNokkel(bruker, token, igId) {
  await supabase('instagram_tilkoblinger', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ side: bruker, token, ig_id: igId, fornyet: new Date().toISOString() })
  });
}

// ---------- Instagram

const ig = async (sti, token) => json(await fetch(`${IG}/${VERSJON}/${sti}${sti.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`));

const tilbake = (req) => process.env.IG_REDIRECT_URI || `https://${req.headers.host}/api/instagram`;

export function innloggingsUrl(redirect) {
  const q = new URLSearchParams({
    client_id: env('IG_APP_ID'), redirect_uri: redirect, response_type: 'code',
    scope: 'instagram_business_basic', force_reauth: 'true'
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

// Kort nøkkel (1 time) byttes straks i en lang (60 dager). Svaret på det første
// byttet har kommet både flatt og pakket i data[], så begge godtas.
async function byttKode(code, redirect) {
  const kropp = new URLSearchParams({
    client_id: env('IG_APP_ID'), client_secret: env('IG_APP_SECRET'),
    grant_type: 'authorization_code', redirect_uri: redirect, code: code.replace(/#_$/, '')
  });
  const svar = await json(await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: kropp }));
  const kort = (svar.data ? svar.data[0] : svar).access_token;
  const q = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: env('IG_APP_SECRET'), access_token: kort });
  const { access_token: token } = await json(await fetch(`${IG}/access_token?${q}`));
  const konto = await ig('me?fields=user_id,username', token);
  return { token, konto: { id: String(konto.user_id || konto.id), username: konto.username } };
}

// Lang nøkkel som er minst ett døgn gammel kan fornyes til nye 60 dager.
async function fornyNokkel(token) {
  const q = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
  return (await json(await fetch(`${IG}/refresh_access_token?${q}`))).access_token;
}

// ---------- Tekst

export function tall(n) {
  if (n < 10000) return String(n);
  return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')}k`;
}

export function altTekst(caption) {
  const linje = String(caption || '').split('\n')[0].replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
  if (!linje) return 'Innlegg fra Instagram';
  return linje.length > 120 ? `${linje.slice(0, 117).trimEnd()}…` : linje;
}

const ENDELSE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// ---------- Henting

export async function synk(token, igId) {
  const meg = await ig('me?fields=username,media_count,followers_count', token);
  const { data = [] } = await ig(`me/media?fields=id,caption,media_type,media_url,thumbnail_url&limit=${ANTALL + 6}`, token);

  const git = { repo: env('GITHUB_REPO'), token: env('GITHUB_TOKEN'), branch: process.env.GITHUB_BRANCH || 'main' };
  // lesFil kaster på alt annet enn 404. Behandlet som tomt ville commiten
  // slettet alt kunden har lagret på forsiden.
  const innhold = (await lesFil({ ...git, sti: INNHOLD })) || {};
  const kjente = new Map((innhold.insta || []).map((p) => [String(p.bilde).replace(/\.\w+$/, ''), p.bilde]));

  const poster = [];
  const filer = [];
  for (const m of data) {
    if (poster.length === ANTALL) break;
    const base = `/assets/img/insta/ig-${m.id}`;
    let bilde = kjente.get(base);
    if (!bilde) {
      // media_url mangler på videoer med lisensiert lyd. Da brukes miniatyren.
      const url = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url;
      if (!url) continue;
      const r = await fetch(url);
      const ext = ENDELSE[(r.headers.get('content-type') || '').split(';')[0]];
      if (!r.ok || !ext) continue; // f.eks. et karusellinnlegg som starter med video
      bilde = `${base}.${ext}`;
      filer.push({ sti: `static${bilde}`, innhold: Buffer.from(await r.arrayBuffer()).toString('base64'), base64: true });
    }
    poster.push({ bilde, tittel: altTekst(m.caption) });
  }
  if (poster.length === 0) return { ok: false, grunn: 'Fant ingen bilder å vise' };

  const nytt = { ...innhold, insta: poster, ig_innlegg: String(meg.media_count), ig_folgere: tall(meg.followers_count) };
  if (JSON.stringify(nytt) === JSON.stringify(innhold)) return { ok: true, endret: false };

  const nye = filer.length;
  filer.push({ sti: INNHOLD, innhold: `${JSON.stringify(nytt, null, 2)}\n` });
  // Ikke force: har admin committet i mellomtiden, feiler dette og neste natt prøver igjen.
  const { sha } = await commitFiler({ ...git, filer, melding: `Instagram: ${nye ? `${nye} nye innlegg` : 'oppdaterte tall'} (automatisk)` });
  return { ok: true, endret: true, nye, sha };
}

// ---------- Inngang

function side(tittel, tekst) {
  return `<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${tittel}</title>`
    + `<body style="font:18px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem"><h1>${tittel}</h1><p>${tekst}</p></body></html>`;
}

export default async function handler(req, res) {
  const html = (status, tittel, tekst) => res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8').send(side(tittel, tekst));
  const q = req.query || {};

  if ('koble' in q) return res.redirect(302, innloggingsUrl(tilbake(req)));

  if (q.error) return html(200, 'Ikke koblet', 'Du trykket avbryt, så ingenting er endret. Klikk lenken du fikk igjen når du vil koble til.');

  if (q.code) {
    try {
      const bruker = env('IG_BRUKER');
      const { token, konto } = await byttKode(String(q.code), tilbake(req));
      if (konto.username !== bruker) {
        const prove = await ig('me/media?fields=caption&limit=5', token);
        const medTekst = prove.data.filter((m) => m.caption).length;
        return html(200, 'Innloggingen virker', `Koblet til @${konto.username}, ikke @${bruker}, så ingenting er lagret. Test: ${prove.data.length} innlegg lest, ${medTekst} med bildetekst.`);
      }
      await lagreNokkel(bruker, token, konto.id);
      await synk(token, konto.id);
      return html(200, 'Ferdig!', 'Instagram er koblet til nettsiden. Innleggene dine dukker opp der i løpet av et par minutter, og nye innlegg kommer med hver natt. Du kan lukke denne fanen.');
    } catch (e) {
      console.error('Instagram-tilkobling feilet:', e.message);
      return html(500, 'Det gikk ikke helt', 'Tilkoblingen ble ikke fullført. Ingenting er endret på kontoen din. Send et ord til den som sendte deg lenken.');
    }
  }

  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();

  try {
    const rad = await lesNokkel(env('IG_BRUKER'));
    if (!rad) return res.status(200).json({ ok: false, grunn: 'Instagram er ikke koblet til ennå' });
    let token = rad.token;
    if (!rad.fornyet || Date.now() - Date.parse(rad.fornyet) > UKE) {
      // Feiler fornyelsen, brukes den gamle nøkkelen, og neste natt prøver igjen.
      try {
        token = await fornyNokkel(token);
        await lagreNokkel(env('IG_BRUKER'), token, rad.ig_id);
      } catch (e) { console.error('Instagram-nøkkelen ble ikke fornyet:', e.message); }
    }
    return res.status(200).json(await synk(token, rad.ig_id));
  } catch (e) {
    console.error('Instagram-henting feilet:', e.message);
    return res.status(500).json({ ok: false, feil: e.message.slice(0, 200) });
  }
}
