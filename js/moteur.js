// ==========================================================
// Simulateur BMDV — moteur du block (poste B)
//
// Aucune dépendance au navigateur : l'état est un simple objet
// (sérialisable en JSON, pour la synchronisation future) et tout
// changement passe par agir({ type, ... }).
//
// Chaque voie est décrite du point de vue de B :
//   amont = poste qui annonce le train à B   (V1 : Alfa,    V2 : Charlie)
//   aval  = poste à qui B annonce le train   (V1 : Charlie, V2 : Alfa)
// ==========================================================
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Moteur = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {

  const POSTES = {
    V1: { amont: 'Alfa', aval: 'Charlie' },
    V2: { amont: 'Charlie', aval: 'Alfa' },
  };

  function voieInitiale() {
    return {
      // Canton amont -> B
      annonceRecue: false,        // l'amont a annoncé un train, B n'a pas encore rendu voie libre
      sonnerieAnnonce: false,
      arriveeSansAnnonce: false,  // le train est arrivé à B sans avoir été annoncé
      // Canton B -> aval
      annonceEmise: false,        // B a annoncé le train à l'aval, voie libre pas encore reçue
      sonnerieReddition: false,
      // Sémaphore d'entrée du canton aval
      sema: {
        manette: 'ferme',         // position du commutateur : 'ferme' | 'ouvert'
        ouvert: false,            // état réel du signal
        bloque: false,            // bloqué fermé jusqu'à réception de voie libre
      },
      approche: false,            // train sur la zone d'annonce
    };
  }

  function etatInitial() {
    return {
      voies: { V1: voieInitiale(), V2: voieInitiale() },
      auE: 'A',
      vcm: { 1: 'F', 2: 'F' },
      // Enclenchements du block ; le formateur peut les lever pour créer un dérangement
      enclenchements: {
        blocageSemaphore: true,             // sémaphore bloqué fermé derrière un train
        redditionSemaphoreBloque: true,     // reddition sans effet si le sémaphore n'est pas bloqué
        redditionAnnonceAvantArrivee: true, // reddition sans effet si le train est arrivé sans annonce
      },
    };
  }

  function creer(etatDepart) {
    let etat = etatDepart ? JSON.parse(JSON.stringify(etatDepart)) : etatInitial();
    const abonnes = [];

    const ok = (message) => ({ ok: true, message });
    const sansEffet = (message) => ({ ok: false, message });

    const actions = {
      // ---------- Poste amont (joué par le formateur) ----------
      AMONT_ANNONCE(v, a) {
        const p = POSTES[a.voie];
        if (v.annonceRecue) return sansEffet(`${p.amont} : annonce sans effet, voie libre non reçue de Bravo`);
        v.annonceRecue = true;
        v.sonnerieAnnonce = true;
        return ok(`${p.amont} annonce un train à Bravo (${a.voie})`);
      },

      // ---------- Poste aval (joué par le formateur) ----------
      AVAL_REDDITION(v, a) {
        const p = POSTES[a.voie];
        if (!v.annonceEmise) return sansEffet(`${p.aval} : reddition sans effet, aucun train annoncé par Bravo`);
        v.annonceEmise = false;
        v.sonnerieReddition = true;
        v.sema.bloque = false;
        return ok(`${p.aval} rend voie libre à Bravo (${a.voie})`);
      },

      // ---------- Train ----------
      TRAIN_APPROCHE(v, a) {
        v.approche = a.present !== false;
        return ok(`${a.voie} : train ${v.approche ? 'sur' : 'hors de'} la zone d'annonce`);
      },
      // Franchissement du sémaphore : fermeture automatique (aubinage) et blocage
      TRAIN_PEDALE(v, a) {
        v.approche = false;
        v.sema.ouvert = false;
        v.sema.bloque = true;
        if (!v.annonceRecue) v.arriveeSansAnnonce = true;
        return ok(`${a.voie} : le train franchit le sémaphore, fermeture automatique`);
      },

      // ---------- Poste B (l'élève) ----------
      B_ARRET_SONNERIE(v, a) {
        const cle = a.sonnerie === 'reddition' ? 'sonnerieReddition' : 'sonnerieAnnonce';
        if (!v[cle]) return sansEffet(`Bravo : pas de sonnerie à arrêter (${a.voie})`);
        v[cle] = false;
        return ok(`Bravo arrête la sonnerie ${a.sonnerie === 'reddition' ? 'de reddition' : "d'annonce"} (${a.voie})`);
      },

      B_SEMAPHORE(v, a) {
        const s = v.sema;
        s.manette = a.position || (s.manette === 'ferme' ? 'ouvert' : 'ferme');
        if (s.manette === 'ferme') {
          s.ouvert = false;
          return ok(`Bravo met le commutateur du sémaphore sur fermé (${a.voie})`);
        }
        if (s.bloque && etat.enclenchements.blocageSemaphore) {
          return sansEffet(`Bravo commande l'ouverture du sémaphore (${a.voie}) : il n'obéit pas, sémaphore bloqué`);
        }
        s.ouvert = true;
        return ok(`Bravo ouvre le sémaphore (${a.voie})`);
      },

      B_ANNONCE(v, a) {
        const p = POSTES[a.voie];
        if (v.annonceEmise) return sansEffet(`Bravo : annonce sans effet, voie libre non reçue de ${p.aval}`);
        v.annonceEmise = true;
        v.sema.bloque = true;
        return ok(`Bravo annonce le train à ${p.aval} (${a.voie})`);
      },

      B_REDDITION(v, a) {
        const p = POSTES[a.voie];
        const e = etat.enclenchements;
        if (!v.annonceRecue) return sansEffet(`Bravo : reddition sans effet, aucune annonce reçue de ${p.amont}`);
        if (e.redditionSemaphoreBloque && !(v.sema.bloque && !v.sema.ouvert)) {
          return sansEffet(`Bravo : reddition sans effet, le sémaphore n'est pas bloqué (${a.voie})`);
        }
        if (e.redditionAnnonceAvantArrivee && v.arriveeSansAnnonce) {
          return sansEffet(`Bravo : reddition sans effet, le train est arrivé avant d'être annoncé (${a.voie})`);
        }
        v.annonceRecue = false;
        v.arriveeSansAnnonce = false;
        return ok(`Bravo rend voie libre à ${p.amont} (${a.voie})`);
      },
    };

    const actionsGenerales = {
      B_AU_E(a) {
        etat.auE = a.position || (etat.auE === 'A' ? 'I' : 'A');
        return ok(`Bravo met le commutateur Au E sur ${etat.auE}`);
      },
      B_VCM(a) {
        etat.vcm[a.numero] = a.position || (etat.vcm[a.numero] === 'F' ? 'O' : 'F');
        return ok(`Vcm ${a.numero} sur ${etat.vcm[a.numero]}`);
      },
      ENCLENCHEMENT(a) {
        if (!(a.nom in etat.enclenchements)) return sansEffet(`Enclenchement inconnu : ${a.nom}`);
        etat.enclenchements[a.nom] = !!a.actif;
        return ok(`Enclenchement « ${a.nom} » ${a.actif ? 'rétabli' : 'levé'}`);
      },
      REINITIALISER() {
        etat = etatInitial();
        return ok('Simulateur réinitialisé');
      },
    };

    function agir(action) {
      let resultat;
      if (actions[action.type]) {
        const v = etat.voies[action.voie];
        resultat = v ? actions[action.type](v, action) : sansEffet(`Voie inconnue : ${action.voie}`);
      } else if (actionsGenerales[action.type]) {
        resultat = actionsGenerales[action.type](action);
      } else {
        resultat = sansEffet(`Action inconnue : ${action.type}`);
      }
      abonnes.forEach((f) => f(etat, resultat, action));
      return resultat;
    }

    return {
      agir,
      lire: () => etat,
      abonner(f) { abonnes.push(f); f(etat, null, null); },
    };
  }

  return { creer, etatInitial, POSTES };
});
