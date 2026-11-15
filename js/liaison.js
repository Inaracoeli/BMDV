// ==========================================================
// Simulateur BMDV — liaison entre le TCO et l'écran formateur
// Le moteur tourne dans la page du TCO (l'hôte). L'écran formateur
// reçoit l'état et renvoie des actions. Deux transports :
//   - local : deux onglets du même navigateur (BroadcastChannel), ou
//     deux cadres d'une même page (fichier de démonstration) ;
//   - distant : deux appareils, par la messagerie temps réel de
//     Supabase (diffusion sur un canal propre à la séance, sans table
//     ni compte). Le TCO affiche un code de séance, le formateur le saisit.
// ==========================================================
const Liaison = (function () {
  const CANAL = 'bmdv';
  const PERIODE_LOCALE_MS = 400;     // cadence d'envoi de l'état quand rien de notable ne se passe
  const PERIODE_DISTANTE_MS = 1000;  // plus lente à distance, pour ménager le quota de messages
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // sans 0, O, 1, I, L : pas de confusion à la saisie
  const CLE_CODE_TCO = 'bmdv-code-seance';
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

  // ---------- Transports : { envoyer(message), recevoir(fonction) } ----------
  function canalLocal() {
    if (window.parent !== window) {
      // Dans un cadre : la page parente relaie les messages vers l'autre cadre
      return {
        envoyer: (m) => window.parent.postMessage({ bmdv: m }, '*'),
        recevoir: (f) => window.addEventListener('message', (e) => { if (e.data && e.data.bmdv) f(e.data.bmdv); }),
      };
    }
    const canal = new BroadcastChannel(CANAL);
    return {
      envoyer: (m) => canal.postMessage(m),
      recevoir: (f) => { canal.onmessage = (e) => f(e.data); },
    };
  }

  // Canal Supabase de la séance ; null si la bibliothèque ou la configuration manquent
  function canalDistant(code) {
    const config = window.BMDV_CONFIG;
    if (!config || !window.supabase || typeof window.supabase.createClient !== 'function') return null;
    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseCle, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const canal = client.channel(`bmdv-${code}`, { config: { broadcast: { self: false, ack: false } } });
    let recepteur = null;
    let pret = false;
    canal.on('broadcast', { event: 'm' }, (message) => { if (recepteur) recepteur(message.payload); });
    canal.subscribe((statut) => { pret = statut === 'SUBSCRIBED'; });
    return {
      envoyer: (m) => { if (pret) canal.send({ type: 'broadcast', event: 'm', payload: m }); },
      recevoir: (f) => { recepteur = f; },
      pret: () => pret,
    };
  }

  // ---------- Côté TCO : diffuse l'état du moteur et exécute les actions reçues ----------
  function heberger(moteur) {
    let code = normaliser(lireStockage(CLE_CODE_TCO));
    if (!codeValide(code)) {
      code = nouveauCode();
      ecrireStockage(CLE_CODE_TCO, code);
    }
    const transports = [
      { canal: canalLocal(), periode: PERIODE_LOCALE_MS, dernierEnvoi: 0 },
    ];
    const distant = canalDistant(code);
    if (distant) transports.push({ canal: distant, periode: PERIODE_DISTANTE_MS, dernierEnvoi: 0, distant: true });
    let formateurVu = 0;

    const envoyer = (t, resultat) => {
      t.dernierEnvoi = Date.now();
      t.canal.envoyer({ t: 'etat', etat: moteur.lire(), resultat });
    };
    transports.forEach((t) => t.canal.recevoir((m) => {
      if (t.distant) formateurVu = Date.now();
      if (m.t === 'action') moteur.agir(m.action);
      if (m.t === 'bonjour') envoyer(t, null);
    }));
    moteur.abonner((etat, resultat, action) => {
      const routine = action && action.type === 'TEMPS' && !(resultat && resultat.message);
      transports.forEach((t) => {
        if (routine && Date.now() - t.dernierEnvoi < t.periode) return;
        envoyer(t, resultat);
      });
    });

    return {
      code: formater(code),
      // 'indisponible' : pas de liaison distante ; 'attente' : canal ouvert, pas de formateur ; 'relie'
      statut() {
        if (!distant) return 'indisponible';
        if (!distant.pret()) return 'connexion';
        return Date.now() - formateurVu < 15000 ? 'relie' : 'attente';
      },
    };
  }

  // ---------- Côté formateur : même interface que le moteur (agir, lire, abonner) ----------
  // Avec un code de séance : liaison distante. Sans code : liaison locale (même navigateur).
  function rejoindre(codeSaisi) {
    const code = normaliser(codeSaisi);
    const distant = codeValide(code) && window.parent === window ? canalDistant(code) : null;
    const canal = distant || canalLocal();
    const delaiSilence = distant ? 3500 : 2000;
    const abonnes = [];
    let etat = null;
    let dernierSigne = 0;
    canal.recevoir((m) => {
      if (m.t !== 'etat') return;
      etat = m.etat;
      dernierSigne = Date.now();
      abonnes.forEach((f) => f(etat, m.resultat));
    });
    const estConnecte = () => Date.now() - dernierSigne < delaiSilence;
    const saluer = () => canal.envoyer({ t: 'bonjour' });
    saluer();
    // Salut fréquent tant que le TCO ne répond pas, puis de temps en temps pour signaler sa présence
    let dernierSalut = Date.now();
    setInterval(() => {
      const ecart = estConnecte() ? 10000 : 1000;
      if (Date.now() - dernierSalut >= ecart) { dernierSalut = Date.now(); saluer(); }
    }, 500);
    return {
      agir: (action) => canal.envoyer({ t: 'action', action }),
      lire: () => etat,
      abonner: (f) => { abonnes.push(f); if (etat) f(etat, null); },
      estConnecte,
      distant: !!distant,
      code: distant ? formater(code) : null,
    };
  }

  return {
    heberger, rejoindre, normaliser, codeValide, formater,
    lireCodeFormateur: () => lireStockage(CLE_CODE_FORMATEUR),
    memoriserCodeFormateur: (code) => ecrireStockage(CLE_CODE_FORMATEUR, code),
  };
})();
