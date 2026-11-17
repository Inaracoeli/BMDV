// Serveur de développement : fichiers du simulateur + fonctions /api (comme Cloudflare Pages).
// node tests/serveur.mjs [port]   — identifiants de test : BMDV_EMAIL, BMDV_MOT_DE_PASSE, BMDV_SECRET
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import * as connexion from '../functions/api/connexion.js';
import * as verifier from '../functions/api/verifier.js';

const racine = new URL('..', import.meta.url).pathname;
const env = {
  BMDV_EMAIL: process.env.BMDV_EMAIL || 'formateur@exemple.fr',
  BMDV_MOT_DE_PASSE: process.env.BMDV_MOT_DE_PASSE || 'essai',
  BMDV_SECRET: process.env.BMDV_SECRET || 'secret-de-developpement-assez-long-0123456789',
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const routes = { '/api/connexion': connexion, '/api/verifier': verifier };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = routes[url.pathname];
  if (route) {
    const corps = req.method === 'POST' ? await new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => r(d)); }) : undefined;
    const requete = new Request(url, { method: req.method, headers: req.headers, body: corps });
    const f = req.method === 'POST' ? route.onRequestPost : route.onRequestGet;
    const reponse = f ? await f({ request: requete, env }) : new Response('', { status: 405 });
    res.writeHead(reponse.status, Object.fromEntries(reponse.headers));
    res.end(await reponse.text());
    return;
  }
  const chemin = normalize(join(racine, url.pathname === '/' ? '/tco.html' : url.pathname));
  if (!chemin.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  try {
    const contenu = await readFile(chemin);
    res.writeHead(200, { 'content-type': types[extname(chemin)] || 'application/octet-stream' });
    res.end(contenu);
  } catch (e) { res.writeHead(404); res.end('introuvable'); }
}).listen(Number(process.argv[2]) || 8788, () => console.log('Simulateur sur http://localhost:' + (Number(process.argv[2]) || 8788)));
