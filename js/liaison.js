// ==========================================================
// Simulateur BMDV — liaison entre le TCO et l'écran formateur
// Le moteur tourne dans la page du TCO (l'hôte). L'écran formateur
// reçoit l'état et renvoie des actions. Transport actuel : un
// BroadcastChannel, entre deux onglets du même navigateur. Il sera
// remplacé par un canal temps réel pour relier deux appareils.
// ==========================================================
const Liaison = (function () {
  const CANAL = 'bmdv';
  const PERIODE_MS = 400; // cadence maximale d'envoi de l'état quand rien de notable ne se passe

  // Côté TCO : diffuse l'état du moteur et exécute les actions reçues
  function heberger(moteur) {
    const canal = new BroadcastChannel(CANAL);
    let dernierEnvoi = 0;
    const envoyer = (resultat) => {
      dernierEnvoi = Date.now();
      canal.postMessage({ t: 'etat', etat: moteur.lire(), resultat });
    };
    canal.onmessage = (e) => {
      if (e.data.t === 'action') moteur.agir(e.data.action);
      if (e.data.t === 'bonjour') envoyer(null);
    };
    moteur.abonner((etat, resultat, action) => {
      const routine = action && action.type === 'TEMPS' && !(resultat && resultat.message);
      if (routine && Date.now() - dernierEnvoi < PERIODE_MS) return;
      envoyer(resultat);
    });
  }

  // Côté formateur : même interface que le moteur (agir, lire, abonner)
  function rejoindre() {
    const canal = new BroadcastChannel(CANAL);
    const abonnes = [];
    let etat = null;
    let dernierSigne = 0;
    canal.onmessage = (e) => {
      if (e.data.t !== 'etat') return;
      etat = e.data.etat;
      dernierSigne = Date.now();
      abonnes.forEach((f) => f(etat, e.data.resultat));
    };
    const saluer = () => canal.postMessage({ t: 'bonjour' });
    saluer();
    setInterval(() => { if (!estConnecte()) saluer(); }, 1000);
    const estConnecte = () => Date.now() - dernierSigne < 2000;
    return {
      agir: (action) => canal.postMessage({ t: 'action', action }),
      lire: () => etat,
      abonner: (f) => { abonnes.push(f); if (etat) f(etat, null); },
      estConnecte,
    };
  }

  return { heberger, rejoindre };
})();
