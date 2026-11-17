// ==========================================================
// Simulateur BMDV — jetons du formateur (Cloudflare Pages Functions)
// Un jeton = charge utile en base64url + signature HMAC-SHA256 avec le
// secret BMDV_SECRET (variable d'environnement chiffrée de Cloudflare).
// Le secret ne quitte jamais le serveur : le TCO fait vérifier le jeton
// par /api/verifier.
// ==========================================================
const encodeur = new TextEncoder();
const DUREE_MS = 30 * 24 * 3600 * 1000; // un téléphone reste connecté 30 jours

const b64url = (octets) => btoa(String.fromCharCode(...new Uint8Array(octets)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (texte) => Uint8Array.from(atob(texte.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function cle(secret) {
  return crypto.subtle.importKey('raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signer(secret, maintenant = Date.now()) {
  const charge = b64url(encodeur.encode(JSON.stringify({ sub: 'formateur', exp: maintenant + DUREE_MS })));
  const signature = await crypto.subtle.sign('HMAC', await cle(secret), encodeur.encode(charge));
  return `${charge}.${b64url(signature)}`;
}

export async function verifier(secret, jeton, maintenant = Date.now()) {
  if (typeof jeton !== 'string' || !/^[\w-]+\.[\w-]+$/.test(jeton)) return null;
  const [charge, signature] = jeton.split('.');
  let valide = false;
  try {
    valide = await crypto.subtle.verify('HMAC', await cle(secret), deB64url(signature), encodeur.encode(charge));
  } catch (e) { return null; }
  if (!valide) return null;
  try {
    const contenu = JSON.parse(new TextDecoder().decode(deB64url(charge)));
    return contenu.exp > maintenant ? contenu : null;
  } catch (e) { return null; }
}

// Comparaison à durée constante (empreintes de même longueur)
export async function egal(a, b) {
  const [ha, hb] = await Promise.all([a, b].map((t) => crypto.subtle.digest('SHA-256', encodeur.encode(String(t)))));
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export const json = (corps, statut = 200) => new Response(JSON.stringify(corps), {
  status: statut,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function configure(env) {
  return !!(env && env.BMDV_EMAIL && env.BMDV_MOT_DE_PASSE && env.BMDV_SECRET && env.BMDV_SECRET.length >= 32);
}
