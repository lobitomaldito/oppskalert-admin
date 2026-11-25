// Kundens Instagram inn på forsiden, hentet hver natt. Besøkende kobler seg
// aldri til Instagram: bildene lastes ned og committes til repoet, og bygget
// lager ren statisk HTML som før.
//
// Tre veier inn i samme funksjon:
//  ?koble     Sender kunden til innloggingen hos Meta. Dette er lenken i mailen.
//  ?code=...  Kunden har godkjent. Koden byttes i en nøkkel (Facebook Login for
//             Business, «System-user access token» som ikke går ut), kontoen slås
//             opp, og første henting kjøres. Logger noen inn med en annen konto
//             enn IG_BRUKER, vises en testside og ingenting lagres.
//  cron       Vercel kaller daglig med CRON_SECRET og henter nye innlegg.
//
// Skriver til content/index.json: lista «insta» ({ bilde, tittel }) og tekstene
// ig_innlegg og ig_folgere. Endrer kunden dem i admin, varer det til neste natt.
// Bildene havner i static/assets/img/insta/ig-<id>.<ext>.
//
// Miljøvariabler (se README, «Instagram på forsiden»):
//   IG_APP_ID, IG_CONFIG_ID, IG_APP_SECRET   delt i Vercel-teamet
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  delt i Vercel-teamet
//   IG_BRUKER, CRON_SECRET                   prosjektet
//   IG_REDIRECT_URI                          valgfri, ellers https://<host>/api/instagram
import { commitFiler, lesFil } from './_git.mjs';

const ANTALL = 18;
const FB = 'https://graph.facebook.com/v27.0';
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
// Instagram-konto. Tabellen har RLS uten policyer, så bare service-nøkkelen
// slipper inn. Bare apikey: de nye sb_secret_-nøklene er ikke JWT.

const sb = () => ({ apikey: env('SUPABASE_SERVICE_ROLE_KEY') });

async function lesNokkel(bruker) {
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/instagram_tilkoblinger?side=eq.${encodeURIComponent(bruker)}&select=token,ig_id`, { headers: sb() });
  return (await json(r))[0] || null;
}

async function lagreNokkel(bruker, token, igId) {
  await json(await fetch(`${env('SUPABASE_URL')}/rest/v1/instagram_tilkoblinger`, {
    method: 'POST',
    headers: { ...sb(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ side: bruker, token, ig_id: igId, fornyet: new Date().toISOString() })
  }));
}

// ---------- Meta

const fb = async (sti, token) => json(await fetch(`${FB}/${sti}${sti.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`));

const tilbake = (req) => process.env.IG_REDIRECT_URI || `https://${req.headers.host}/api/instagram`;

export function innloggingsUrl(redirect) {
  const q = new URLSearchParams({
    client_id: env('IG_APP_ID'), config_id: env('IG_CONFIG_ID'), redirect_uri: redirect,
    response_type: 'code', override_default_response_type: 'true', prompt: 'login'
  });
  return `https://www.facebook.com/dialog/oauth?${q}`;
}

async function byttKode(code, redirect) {
  const q = new URLSearchParams({ client_id: env('IG_APP_ID'), client_secret: env('IG_APP_SECRET'), redirect_uri: redirect, code });
  const { access_token: token } = await json(await fetch(`${FB}/oauth/access_token?${q}`));
  const { data = [] } = await fb('me/assigned_instagram_accounts?fields=id,username', token);
  return { token, kontoer: data };
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
  const meg = await fb(`${igId}?fields=username,media_count,followers_count`, token);
  const { data = [] } = await fb(`${igId}/media?fields=id,caption,media_type,media_url,thumbnail_url&limit=${ANTALL + 6}`, token);

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
      const { token, kontoer } = await byttKode(String(q.code), tilbake(req));
      const konto = kontoer.find((k) => k.username === bruker);
      if (!konto) {
        const navn = kontoer.map((k) => `@${k.username}`).join(', ') || 'ingen Instagram-konto';
        const prove = kontoer[0] ? await fb(`${kontoer[0].id}/media?fields=caption&limit=5`, token) : { data: [] };
        const medTekst = prove.data.filter((m) => m.caption).length;
        return html(200, 'Innloggingen virker', `Koblet til ${navn}, ikke @${bruker}, så ingenting er lagret. Test: ${prove.data.length} innlegg lest, ${medTekst} med bildetekst.`);
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
    return res.status(200).json(await synk(rad.token, rad.ig_id));
  } catch (e) {
    console.error('Instagram-henting feilet:', e.message);
    return res.status(500).json({ ok: false, feil: e.message.slice(0, 200) });
  }
}
