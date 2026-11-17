// ==========================================================
// Simulateur BMDV — liaison entre le TCO et l'écran formateur
// Le moteur tourne dans la page du TCO (l'hôte), pour que les trains
// continuent même si le téléphone se met en veille. L'écran formateur
// reçoit l'état et renvoie des actions. Deux transports :
//   - local : deux onglets du même navigateur (BroadcastChannel), ou
//     deux cadres d'une même page (fichier de démonstration) ;
//   - distant : deux appareils, par la messagerie temps réel de
//     Supabase (diffusion sur un canal propre à la séance, sans table
//     ni compte).
// C'est le PC du TCO qui crée la séance : il affiche un QR code (et le code en
// clair, en secours). Le téléphone du formateur, connecté à son compte, le scanne
// et rejoint la séance. Le TCO n'accepte que les messages portant un jeton de
// formateur valide, vérifié par le serveur (/api/verifier, Cloudflare Pages).
// ==========================================================
const Liaison = (function () {
  const CANAL = 'bmdv';
  const PERIODE_LOCALE_MS = 400;     // cadence d'envoi de l'état quand rien de notable ne se passe
  const PERIODE_DISTANTE_MS = 1000;  // plus lente à distance, pour ménager le quota de messages
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // sans 0, O, 1, I, L : pas de confusion à la saisie
  const CLE_CODE_TCO = 'bmdv-code-tco';
  const CLE_CODE_FORMATEUR = 'bmdv-code-formateur';

  // ---------- Codes de séance ----------
  function nouveauCode() {
    const tirage = new Uint32Array(12);
    crypto.getRandomValues(tirage);
    return Array.from(tirage, (n) => ALPHABET[n % ALPHABET.length]).join('');
  }
  const normaliser = (texte) => String(texte || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const formater = (code) => (code.match(/.{1,4}/g) || []).join('-');
  const codeValide = (code) => code.length === 12 && [...code].every((c) => ALPHABET.includes(c));
  const lireStockage = (cle) => { try { return localStorage.getItem(cle); } catch (e) { return null; } };
  const ecrireStockage = (cle, valeur) => { try { localStorage.setItem(cle, valeur); } catch (e) { /* stockage indisponible */ } };

  // ---------- Transports : { envoyer(message), recevoir(fonction), fermer() } ----------
  function canalLocal() {
    if (window.parent !== window) {
      // Dans un cadre : la page parente relaie les messages vers l'autre cadre
      return {
        envoyer: (m) => window.parent.postMessage({ bmdv: m }, '*'),
        recevoir: (f) => window.addEventListener('message', (e) => { if (e.data && e.data.bmdv) f(e.data.bmdv); }),
        pret: () => true,
        fermer() {},
      };
    }
    const canal = new BroadcastChannel(CANAL);
    return {
      envoyer: (m) => canal.postMessage(m),
      recevoir: (f) => { canal.onmessage = (e) => f(e.data); },
      pret: () => true,
      fermer: () => canal.close(),
    };
  }

  // Canal Supabase de la séance ; null si la bibliothèque ou la configuration manquent
  let client = null;
  function distantDisponible() {
    return !!(window.BMDV_CONFIG && window.supabase && typeof window.supabase.createClient === 'function');
  }
  function canalDistant(code) {
    if (!distantDisponible()) return null;
    const config = window.BMDV_CONFIG;
    if (!client) {
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseCle, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    const canal = client.channel(`bmdv-${code}`, { config: { broadcast: { self: false, ack: false } } });
    let recepteur = null;
    let pret = false;
    canal.on('broadcast', { event: 'm' }, (message) => { if (recepteur) recepteur(message.payload); });
    canal.subscribe((statut) => { pret = statut === 'SUBSCRIBED'; });
    return {
      envoyer: (m) => { if (pret) canal.send({ type: 'broadcast', event: 'm', payload: m }); },
      recevoir: (f) => { recepteur = f; },
      pret: () => pret,
      fermer: () => { pret = false; try { client.removeChannel(canal); } catch (e) { /* canal déjà fermé */ } },
    };
  }

  // ---------- Vérification du jeton du formateur (par le serveur) ----------
  const authentification = () => !(window.BMDV_CONFIG && window.BMDV_CONFIG.authentification === false);
  const verifies = new Map(); // jeton → { ok, quand }
  const REVERIFIER_MS = 10 * 60 * 1000;
  function verifierJeton(jeton) {
    if (!authentification()) return Promise.resolve(true);
    if (!jeton) return Promise.resolve(false);
    const connu = verifies.get(jeton);
    if (connu && (connu.encours || Date.now() - connu.quand < REVERIFIER_MS)) return connu.encours || Promise.resolve(connu.ok);
    const encours = fetch('/api/verifier', { headers: { authorization: `Bearer ${jeton}` }, cache: 'no-store' })
      .then((r) => r.ok).catch(() => false)
      .then((ok) => { verifies.set(jeton, { ok, quand: Date.now() }); return ok; });
    verifies.set(jeton, { ok: false, quand: Date.now(), encours });
    return encours;
  }

  // ---------- Côté TCO : crée la séance, diffuse l'état, exécute les actions du formateur ----------
  function heberger(moteur) {
    const local = { canal: canalLocal(), periode: PERIODE_LOCALE_MS, dernierEnvoi: 0, local: true };
    let distant = null;
    let code = null;
    let formateurVu = 0;
    let contact = false; // un téléphone authentifié s'est manifesté sur cette séance
    let refus = 0;       // dernier message refusé (téléphone non connecté à son compte)

    const envoyer = (t, resultat) => {
      t.dernierEnvoi = Date.now();
      t.canal.envoyer({ t: 'etat', etat: moteur.lire(), resultat });
    };
    // Le transport local (même navigateur, même PC) est de confiance ; à distance, jeton exigé
    const ecouter = (t) => t.canal.recevoir(async (m) => {
      if (m.t !== 'action' && m.t !== 'bonjour') return;
      const autorise = t.local || await verifierJeton(m.jeton);
      if (!autorise) {
        refus = Date.now();
        t.canal.envoyer({ t: 'refus', jeton: m.jeton || null });
        return;
      }
      if (!t.local) { formateurVu = Date.now(); t.authentifie = true; }
      contact = true;
      if (m.t === 'action') moteur.agir(m.action);
      if (m.t === 'bonjour') envoyer(t, null);
    });
    ecouter(local);

    function ouvrir(c) {
      if (distant) distant.canal.fermer();
      distant = null;
      code = c;
      formateurVu = 0;
      contact = false;
      ecrireStockage(CLE_CODE_TCO, c);
      const canal = canalDistant(c);
      if (canal) {
        distant = { canal, periode: PERIODE_DISTANTE_MS, dernierEnvoi: 0 };
        ecouter(distant);
      }
    }
    const memorise = normaliser(lireStockage(CLE_CODE_TCO));
    ouvrir(codeValide(memorise) ? memorise : nouveauCode());

    moteur.abonner((etat, resultat, action) => {
      const routine = action && action.type === 'TEMPS' && !(resultat && resultat.message);
      [local, distant].forEach((t) => {
        // À distance, l'état n'est diffusé qu'une fois le téléphone du formateur authentifié
        if (!t || (!t.local && !t.authentifie)) return;
        if (routine && Date.now() - t.dernierEnvoi < t.periode) return;
        envoyer(t, resultat);
      });
    });

    return {
      // Nouvelle séance : nouveau code, l'ancien téléphone est déconnecté
      nouveauCode: () => ouvrir(nouveauCode()),
      code: () => formater(code),
      // Adresse ouverte par le QR code : l'écran formateur, code de séance dans l'ancre
      url: () => new URL(`formateur.html#s=${code}`, location.href).href,
      contact: () => contact,
      // 'indisponible' (pas de réseau) | 'connexion' | 'refus' | 'attente' (pas de formateur) | 'relie'
      statut() {
        if (!distant) return 'indisponible';
        if (!distant.canal.pret()) return 'connexion';
        if (Date.now() - formateurVu < 15000) return 'relie';
        return Date.now() - refus < 5000 ? 'refus' : 'attente';
      },
    };
  }

  // ---------- Côté formateur : même interface que le moteur (agir, lire, abonner) ----------
  // options : { code (séance du PC), jeton (compte du formateur), surRefus() }
  // Il écoute le canal de la séance et, s'il existe, un TCO ouvert dans le même navigateur.
  function rejoindre(options = {}) {
    const code = normaliser(options.code);
    ecrireStockage(CLE_CODE_FORMATEUR, code);
    const jeton = options.jeton || null;
    const dansUnCadre = window.parent !== window;
    const transports = [canalLocal()];
    if (!dansUnCadre && codeValide(code)) {
      const distant = canalDistant(code);
      if (distant) transports.push(distant);
    }
    const abonnes = [];
    let etat = null;
    let dernierSigne = 0;
    let source = null; // transport qui a livré le dernier état : les actions repartent par lui
    transports.forEach((t) => t.recevoir((m) => {
      // Refus du TCO : seulement s'il concerne ce téléphone (même jeton)
      if (m.t === 'refus') { if ((m.jeton || null) === jeton && options.surRefus) options.surRefus(); return; }
      if (m.t !== 'etat') return;
      etat = m.etat;
      dernierSigne = Date.now();
      source = t;
      abonnes.forEach((f) => f(etat, m.resultat));
    }));
    const estConnecte = () => Date.now() - dernierSigne < 3500;
    const saluer = () => transports.forEach((t) => t.envoyer({ t: 'bonjour', jeton }));
    saluer();
    // Salut fréquent tant que le TCO ne répond pas, puis de temps en temps pour signaler sa présence
    let dernierSalut = Date.now();
    const minuterie = setInterval(() => {
      const ecart = estConnecte() ? 10000 : 1000;
      if (Date.now() - dernierSalut >= ecart) { dernierSalut = Date.now(); saluer(); }
    }, 500);
    return {
      agir: (action) => { if (source) source.envoyer({ t: 'action', action, jeton }); },
      lire: () => etat,
      abonner: (f) => { abonnes.push(f); if (etat) f(etat, null); },
      estConnecte,
      code: formater(code),
      distant: transports.length > 1,
      quitter() { clearInterval(minuterie); transports.forEach((t) => t.fermer()); },
    };
  }

  const dernierCodeFormateur = () => {
    const c = normaliser(lireStockage(CLE_CODE_FORMATEUR));
    return codeValide(c) ? c : null;
  };

  return { heberger, rejoindre, normaliser, codeValide, formater, dernierCodeFormateur };
})();
