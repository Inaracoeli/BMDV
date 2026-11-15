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
// C'est le formateur qui crée la séance : son téléphone affiche un code,
// qu'il saisit ensuite sur le PC du TCO.
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
      fermer: () => { pret = false; client.removeChannel(canal); },
    };
  }

  // ---------- Côté TCO : diffuse l'état du moteur et exécute les actions reçues ----------
  function heberger(moteur) {
    const local = { canal: canalLocal(), periode: PERIODE_LOCALE_MS, dernierEnvoi: 0 };
    let distant = null;
    let code = null;
    let formateurVu = 0;

    const envoyer = (t, resultat) => {
      t.dernierEnvoi = Date.now();
      t.canal.envoyer({ t: 'etat', etat: moteur.lire(), resultat });
    };
    const ecouter = (t) => t.canal.recevoir((m) => {
      if (t === distant) formateurVu = Date.now();
      if (m.t === 'action') moteur.agir(m.action);
      if (m.t === 'bonjour') envoyer(t, null);
    });
    ecouter(local);

    // Se relier à la séance créée par le formateur ; renvoie false si le code est incorrect
    function relier(codeSaisi) {
      const c = normaliser(codeSaisi);
      if (!codeValide(c)) return false;
      if (distant) distant.canal.fermer();
      distant = null;
      code = c;
      formateurVu = 0;
      ecrireStockage(CLE_CODE_TCO, c);
      const canal = canalDistant(c);
      if (canal) {
        distant = { canal, periode: PERIODE_DISTANTE_MS, dernierEnvoi: 0 };
        ecouter(distant);
      }
      return true;
    }
    const memorise = normaliser(lireStockage(CLE_CODE_TCO));
    if (codeValide(memorise)) relier(memorise);

    moteur.abonner((etat, resultat, action) => {
      const routine = action && action.type === 'TEMPS' && !(resultat && resultat.message);
      [local, distant].forEach((t) => {
        if (!t || (routine && Date.now() - t.dernierEnvoi < t.periode)) return;
        envoyer(t, resultat);
      });
    });

    return {
      relier,
      code: () => (code ? formater(code) : null),
      // 'sans-code' | 'indisponible' (pas de réseau) | 'connexion' | 'attente' (pas de formateur) | 'relie'
      statut() {
        if (!code) return 'sans-code';
        if (!distant) return 'indisponible';
        if (!distant.canal.pret()) return 'connexion';
        return Date.now() - formateurVu < 15000 ? 'relie' : 'attente';
      },
    };
  }

  // ---------- Côté formateur : même interface que le moteur (agir, lire, abonner) ----------
  // Le téléphone crée la séance (code mémorisé jusqu'à « Nouvelle séance »). Il écoute à la
  // fois le canal de la séance et, s'il existe, un TCO ouvert dans le même navigateur.
  function rejoindre() {
    let code = normaliser(lireStockage(CLE_CODE_FORMATEUR));
    if (!codeValide(code)) {
      code = nouveauCode();
      ecrireStockage(CLE_CODE_FORMATEUR, code);
    }
    const dansUnCadre = window.parent !== window;
    const transports = [canalLocal()];
    if (!dansUnCadre) {
      const distant = canalDistant(code);
      if (distant) transports.push(distant);
    }
    const abonnes = [];
    let etat = null;
    let dernierSigne = 0;
    let source = null; // transport qui a livré le dernier état : les actions repartent par lui
    transports.forEach((t) => t.recevoir((m) => {
      if (m.t !== 'etat') return;
      etat = m.etat;
      dernierSigne = Date.now();
      source = t;
      abonnes.forEach((f) => f(etat, m.resultat));
    }));
    const estConnecte = () => Date.now() - dernierSigne < 3500;
    const saluer = () => transports.forEach((t) => t.envoyer({ t: 'bonjour' }));
    saluer();
    // Salut fréquent tant que le TCO ne répond pas, puis de temps en temps pour signaler sa présence
    let dernierSalut = Date.now();
    setInterval(() => {
      const ecart = estConnecte() ? 10000 : 1000;
      if (Date.now() - dernierSalut >= ecart) { dernierSalut = Date.now(); saluer(); }
    }, 500);
    return {
      agir: (action) => { if (source) source.envoyer({ t: 'action', action }); },
      lire: () => etat,
      abonner: (f) => { abonnes.push(f); if (etat) f(etat, null); },
      estConnecte,
      code: formater(code),
      distant: transports.length > 1,
      // Nouvelle séance : nouveau code, à saisir de nouveau sur le PC
      nouvelleSeance() {
        ecrireStockage(CLE_CODE_FORMATEUR, nouveauCode());
        location.reload();
      },
    };
  }

  return { heberger, rejoindre, normaliser, codeValide, formater };
})();
