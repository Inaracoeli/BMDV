// ==========================================================
// Simulateur BMDV — liaison entre le TCO et l'écran formateur
// Le moteur tourne dans la page du TCO (l'hôte). L'écran formateur
// reçoit l'état et renvoie des actions. Transport actuel :
//   - deux onglets du même navigateur : BroadcastChannel ;
//   - deux cadres d'une même page (fichier de démonstration) : messages
//     relayés par la page qui les contient.
// Il sera remplacé par un canal temps réel pour relier deux appareils.
// ==========================================================
const Liaison = (function () {
  const CANAL = 'bmdv';

  // Renvoie { envoyer(message), recevoir(fonction) }
  function ouvrirCanal() {
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
  const PERIODE_MS = 400; // cadence maximale d'envoi de l'état quand rien de notable ne se passe

  // Côté TCO : diffuse l'état du moteur et exécute les actions reçues
  function heberger(moteur) {
    const canal = ouvrirCanal();
    let dernierEnvoi = 0;
    const envoyer = (resultat) => {
      dernierEnvoi = Date.now();
      canal.envoyer({ t: 'etat', etat: moteur.lire(), resultat });
    };
    canal.recevoir((m) => {
      if (m.t === 'action') moteur.agir(m.action);
      if (m.t === 'bonjour') envoyer(null);
    });
    moteur.abonner((etat, resultat, action) => {
      const routine = action && action.type === 'TEMPS' && !(resultat && resultat.message);
      if (routine && Date.now() - dernierEnvoi < PERIODE_MS) return;
      envoyer(resultat);
    });
  }

  // Côté formateur : même interface que le moteur (agir, lire, abonner)
  function rejoindre() {
    const canal = ouvrirCanal();
    const abonnes = [];
    let etat = null;
    let dernierSigne = 0;
    canal.recevoir((m) => {
      if (m.t !== 'etat') return;
      etat = m.etat;
      dernierSigne = Date.now();
      abonnes.forEach((f) => f(etat, m.resultat));
    });
    const saluer = () => canal.envoyer({ t: 'bonjour' });
    saluer();
    setInterval(() => { if (!estConnecte()) saluer(); }, 1000);
    const estConnecte = () => Date.now() - dernierSigne < 2000;
    return {
      agir: (action) => canal.envoyer({ t: 'action', action }),
      lire: () => etat,
      abonner: (f) => { abonnes.push(f); if (etat) f(etat, null); },
      estConnecte,
    };
  }

  return { heberger, rejoindre };
})();
