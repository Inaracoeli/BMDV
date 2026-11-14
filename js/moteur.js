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

  // Parcours d'un train, identique pour les deux voies. « signal » : le train
  // s'arrête en fin d'étape si le sémaphore est fermé.
  // zone-a / zone-b = z1 / z3 en voie 1, z2 / z4 en voie 2. Le quai est sur zone-a.
  const PARCOURS = [
    { nom: 'canton-amont' },
    { nom: 'annonce' },                 // zone d'annonce
    { nom: 'approche', signal: true },  // ZAP, jusqu'au signal
    { nom: 'pedale' },                  // franchissement du signal
    { nom: 'zone-a' },
    { nom: 'zone-b' },
    { nom: 'canton-aval' },
  ];
  const ETAPE = Object.fromEntries(PARCOURS.map((e, i) => [e.nom, i]));
  // Durées par défaut en millisecondes, à vitesse normale (réglables par le formateur).
  // 30 s en ligne entre les gares, 10 s par zone en gare. « redemarrage » : inertie
  // d'un train arrêté devant un signal, entre l'ouverture et sa remise en marche.
  const DUREES = {
    'canton-amont': 30000, annonce: 10000, approche: 10000, pedale: 1000,
    'zone-a': 10000, 'zone-b': 10000, 'canton-aval': 30000, redemarrage: 4000,
  };
  // Voie empruntée selon l'origine et la destination
  function voieDe(origine, destination) {
    if (origine === destination) return null;
    if (destination === 'Charlie') return 'V1';
    if (destination === 'Alfa') return 'V2';
    if (destination === 'Bravo') return origine === 'Alfa' ? 'V1' : origine === 'Charlie' ? 'V2' : null;
    return null;
  }
  const VITESSES = { lente: 0.5, normale: 1, rapide: 2 };

  function voieInitiale() {
    return {
      // Canton amont -> B
      annonceRecue: false,        // l'amont a annoncé un train, B n'a pas encore rendu voie libre
      sonnerieAnnonce: false,
      arriveeSansAnnonce: false,  // le train est arrivé à B sans avoir été annoncé
      // Canton B -> aval
      annonceEmise: false,        // B a annoncé le train à l'aval, voie libre pas encore reçue
      sonnerieReddition: false,
      // Sonneries chez les postes voisins (pupitres du formateur)
      sonnerieAmont: false,       // l'amont reçoit la voie libre rendue par B
      sonnerieAval: false,        // l'aval reçoit l'annonce de B
      // Sémaphore d'entrée du canton aval
      sema: {
        manette: 'ferme',         // position du commutateur : 'ferme' | 'ouvert'
        ouvert: false,            // état réel du signal
        bloque: false,            // bloqué fermé jusqu'à réception de voie libre
      },
      // Postes automatiques : trains arrivés au poste aval dont la voie libre reste à rendre,
      // et délai avant que le poste aval la rende
      arrivesAval: 0,
      delaiReddition: null,
      // Carré protégeant la gare (C1 en voie 1, C2 en voie 2), normalement ouvert
      carre: { ferme: false },
    };
  }

  function etatInitial() {
    return {
      voies: { V1: voieInitiale(), V2: voieInitiale() },
      // { id, numero, origine, destination, voie, vitesse, etape, reste, arrete, attente, franchir, terminus }
      trains: [],
      durees: { ...DUREES },
      prochainTrain: 1,
      auE: 'A',
      vcm: { 1: 'F', 2: 'F' },
      reglages: {
        redditionAvecSonnerie: true, // voie libre rendue par action simultanée sur Sonnerie et Reddition
        aideReddition: true,         // si Reddition est pressée seule, le bouton Sonnerie clignote
        postesAutomatiques: false,   // Alfa et Charlie annoncent et rendent voie libre tout seuls
      },
      // Enclenchements du block ; le formateur peut les lever pour créer un dérangement
      enclenchements: {
        blocageSemaphore: true,             // sémaphore bloqué fermé derrière un train
        redditionSemaphoreBloque: true,     // reddition sans effet si le sémaphore n'est pas bloqué
        redditionAnnonceAvantArrivee: true, // reddition sans effet si le train est arrivé sans annonce
        approche: true,                     // EAP : carré impossible à refermer tant que la ZAP est occupée
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
        if (!annoncerAmont(v)) return sansEffet(`${p.amont} : annonce sans effet, voie libre non reçue de Bravo`);
        return ok(`${p.amont} annonce un train à Bravo (${a.voie})`);
      },

      AMONT_ARRET_SONNERIE(v, a) {
        v.sonnerieAmont = false;
        return ok(`${POSTES[a.voie].amont} arrête sa sonnerie (${a.voie})`);
      },
      AVAL_ARRET_SONNERIE(v, a) {
        v.sonnerieAval = false;
        return ok(`${POSTES[a.voie].aval} arrête sa sonnerie (${a.voie})`);
      },

      // ---------- Poste aval (joué par le formateur) ----------
      AVAL_REDDITION(v, a) {
        const p = POSTES[a.voie];
        if (!rendreAval(v)) return sansEffet(`${p.aval} : reddition sans effet, aucun train annoncé par Bravo`);
        return ok(`${p.aval} rend voie libre à Bravo (${a.voie})`);
      },

      // ---------- Pédale (actionnée par un train, ou seule pour un dérangement) ----------
      TRAIN_PEDALE(v, a) {
        pedale(v);
        return ok(`${a.voie} : pédale actionnée, fermeture automatique du sémaphore et sonnerie`);
      },

      // ---------- Poste B (l'élève) ----------
      B_ARRET_SONNERIE(v, a) {
        const cle = a.sonnerie === 'reddition' ? 'sonnerieReddition' : 'sonnerieAnnonce';
        if (!v[cle]) return ok(`Bravo appuie sur Sonnerie (${a.voie})`);
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

      // Fermeture / ouverture du carré (sera commandée par les Vcm du point E)
      B_CARRE(v, a) {
        const fermer = a.ferme !== undefined ? !!a.ferme : !v.carre.ferme;
        if (fermer && !v.carre.ferme && etat.enclenchements.approche && occupation(etat, a.voie).eap) {
          return sansEffet(`Carré ${a.voie} : fermeture impossible, enclenchement d'approche (ZAP occupée)`);
        }
        v.carre.ferme = fermer;
        return ok(`Carré ${a.voie} ${fermer ? 'fermé' : 'ouvert'}`);
      },

      B_ANNONCE(v, a) {
        const p = POSTES[a.voie];
        if (v.annonceEmise) return sansEffet(`Bravo : annonce sans effet, voie libre non reçue de ${p.aval}`);
        v.annonceEmise = true;
        v.sonnerieAval = true;
        v.sema.bloque = true;
        return ok(`Bravo annonce le train à ${p.aval} (${a.voie})`);
      },

      B_REDDITION(v, a) {
        const p = POSTES[a.voie];
        const e = etat.enclenchements;
        if (etat.reglages.redditionAvecSonnerie && !a.sonnerieAppuyee) {
          return sansEffet(`Bravo : reddition sans effet, appuyer en même temps sur Sonnerie et Reddition (${a.voie})`);
        }
        if (!v.annonceRecue) return sansEffet(`Bravo : reddition sans effet, aucune annonce reçue de ${p.amont}`);
        if (e.redditionSemaphoreBloque && !(v.sema.bloque && !v.sema.ouvert)) {
          return sansEffet(`Bravo : reddition sans effet, le sémaphore n'est pas bloqué (${a.voie})`);
        }
        if (e.redditionAnnonceAvantArrivee && v.arriveeSansAnnonce) {
          return sansEffet(`Bravo : reddition sans effet, le train est arrivé avant d'être annoncé (${a.voie})`);
        }
        v.annonceRecue = false;
        v.arriveeSansAnnonce = false;
        v.sonnerieAmont = true;
        return ok(`Bravo rend voie libre à ${p.amont} (${a.voie})`);
      },
    };

    // Le poste amont annonce un train à Bravo (possible seulement s'il a voie libre)
    function annoncerAmont(v) {
      if (v.annonceRecue) return false;
      v.annonceRecue = true;
      v.sonnerieAnnonce = true;
      return true;
    }
    // Le poste aval rend voie libre à Bravo (possible seulement si Bravo lui a annoncé le train)
    function rendreAval(v) {
      if (!v.annonceEmise) return false;
      v.annonceEmise = false;
      v.sonnerieReddition = true;
      v.sema.bloque = false;
      v.arrivesAval = Math.max(0, v.arrivesAval - 1);
      v.delaiReddition = null;
      return true;
    }
    // Postes automatiques : départ des trains après annonce, voie libre rendue à l'arrivée
    const DELAI_REDDITION_AUTO = 3000;
    function posteAutomatiques(dt, evenements) {
      const auto = etat.reglages.postesAutomatiques;
      etat.trains.forEach((t) => {
        if (!t.attenteDepart) return;
        const v = etat.voies[t.voie];
        if (!auto) { t.attenteDepart = false; return; }
        if (annoncerAmont(v)) {
          t.attenteDepart = false;
          evenements.push(`${t.origine} annonce le train ${t.numero} à Bravo et l'expédie (${t.voie})`);
        }
      });
      if (!auto) return;
      Object.entries(etat.voies).forEach(([voie, v]) => {
        v.sonnerieAmont = false; // les postes automatiques arrêtent leurs sonneries
        v.sonnerieAval = false;
        if (!(v.arrivesAval > 0 && v.annonceEmise)) { v.delaiReddition = null; return; }
        if (v.delaiReddition == null) v.delaiReddition = DELAI_REDDITION_AUTO;
        v.delaiReddition -= dt;
        if (v.delaiReddition <= 0 && rendreAval(v)) evenements.push(`${POSTES[voie].aval} rend voie libre à Bravo (${voie})`);
      });
    }

    // Franchissement du sémaphore : fermeture automatique (aubinage), blocage, sonnerie
    function pedale(v) {
      v.sema.ouvert = false;
      v.sema.bloque = true;
      v.sonnerieAnnonce = true;
      if (!v.annonceRecue) v.arriveeSansAnnonce = true;
    }

    const trouver = (id) => etat.trains.find((t) => t.id === id);

    // Fait avancer un train de dt millisecondes ; renvoie les événements survenus
    function avancer(t, dt, evenements) {
      const v = etat.voies[t.voie];
      const facteur = VITESSES[t.vitesse] || 1;
      // Le signal est franchissable si le sémaphore et le carré sont ouverts, ou sur autorisation
      const franchissable = () => t.franchir || (v.sema.ouvert && !v.carre.ferme);
      dt *= facteur;
      while (dt > 0 && !t.terminus && !t.attenteDepart) {
        if (t.attente) {
          if (!franchissable()) { t.demarrage = null; return; }
          // Inertie : le train met quelques secondes à se remettre en marche
          if (t.demarrage == null) {
            t.demarrage = etat.durees.redemarrage;
            evenements.push(`Train ${t.numero} se remet en marche (${t.voie})`);
          }
          const reel = dt / facteur;
          if (t.demarrage > reel) { t.demarrage -= reel; return; }
          dt -= t.demarrage * facteur;
          t.demarrage = null;
          t.attente = false;
        }
        if (t.reste > dt) { t.reste -= dt; return; }
        dt -= t.reste;
        t.reste = 0;
        if (PARCOURS[t.etape].signal && !franchissable()) {
          evenements.push(`Train ${t.numero} arrêté devant le signal fermé (${t.voie})`);
          t.attente = true;
          t.demarrage = null;
          return;
        }
        t.etape += 1;
        if (t.etape >= PARCOURS.length) {
          etat.trains.splice(etat.trains.indexOf(t), 1);
          v.arrivesAval += 1;
          evenements.push(`Train ${t.numero} arrivé à ${t.destination} (${t.voie})`);
          return;
        }
        t.reste = etat.durees[PARCOURS[t.etape].nom];
        if (PARCOURS[t.etape].nom === 'zone-a' && t.destination === 'Bravo') {
          t.terminus = true;
          evenements.push(`Train ${t.numero} terminus Bravo, à quai (${t.voie})`);
        }
        if (PARCOURS[t.etape].nom === 'pedale') {
          t.franchir = false;
          pedale(v);
          evenements.push(`Train ${t.numero} franchit le signal (${t.voie})`);
        }
      }
    }

    const actionsGenerales = {
      // ---------- Trains (pilotés par le formateur) ----------
      // { origine, destination } parmi Alfa, Bravo, Charlie (ou { voie } pour un parcours complet)
      TRAIN_CREER(a) {
        const origine = a.origine || (POSTES[a.voie] || {}).amont;
        const destination = a.destination || (POSTES[a.voie] || {}).aval;
        const voie = voieDe(origine, destination);
        if (!voie) return sansEffet(`Parcours impossible : ${origine} → ${destination}`);
        const numero = String(a.numero || '').trim() || String(etat.prochainTrain);
        // Un train au départ de Bravo attend à quai l'ordre de départ du formateur
        const departBravo = origine === 'Bravo';
        const etape = departBravo ? ETAPE['zone-a'] : 0;
        etat.trains.push({
          id: etat.prochainTrain++, numero, origine, destination, voie,
          vitesse: VITESSES[a.vitesse] ? a.vitesse : 'normale',
          etape, reste: etat.durees[PARCOURS[etape].nom],
          arrete: departBravo, attente: false, demarrage: null, franchir: false, terminus: false,
          // Postes automatiques : le train attend à son origine que le poste ait voie libre pour l'annoncer
          attenteDepart: !departBravo && etat.reglages.postesAutomatiques,
        });
        if (!departBravo && etat.reglages.postesAutomatiques) {
          const evenements = [];
          posteAutomatiques(0, evenements);
          return ok(evenements[0] || `Train ${numero} en attente à ${origine} : voie libre non reçue de Bravo (${voie})`);
        }
        return ok(departBravo
          ? `Train ${numero} à quai à Bravo, prêt au départ vers ${destination} (${voie})`
          : `Train ${numero} parti de ${origine} pour ${destination} (${voie})`);
      },
      DUREE(a) {
        const ms = Math.round(Number(a.secondes) * 1000);
        if (!(a.nom in etat.durees) || !(ms >= 0)) return sansEffet(`Durée invalide : ${a.nom}`);
        etat.durees[a.nom] = ms;
        return ok(`Durée « ${a.nom} » : ${ms / 1000} s`);
      },
      TRAIN_ARRETER(a) {
        const t = trouver(a.id);
        if (!t) return sansEffet('Train introuvable');
        t.arrete = true;
        return ok(`Train ${t.numero} arrêté par le formateur`);
      },
      TRAIN_REPARTIR(a) {
        const t = trouver(a.id);
        if (!t) return sansEffet('Train introuvable');
        t.arrete = false;
        return ok(`Train ${t.numero} remis en marche`);
      },
      // Autorise le train à franchir le signal fermé (tient lieu de bulletin pour l'instant)
      TRAIN_FRANCHIR(a) {
        const t = trouver(a.id);
        if (!t) return sansEffet('Train introuvable');
        t.franchir = true;
        return ok(`Train ${t.numero} autorisé à franchir le signal fermé`);
      },
      TRAIN_VITESSE(a) {
        const t = trouver(a.id);
        if (!t || !VITESSES[a.vitesse]) return sansEffet('Train ou vitesse inconnus');
        t.vitesse = a.vitesse;
        return ok(`Train ${t.numero} : vitesse ${a.vitesse}`);
      },
      TRAIN_SUPPRIMER(a) {
        const t = trouver(a.id);
        if (!t) return sansEffet('Train introuvable');
        etat.trains.splice(etat.trains.indexOf(t), 1);
        return ok(`Train ${t.numero} supprimé`);
      },
      // Écoulement du temps : appelé régulièrement par la page
      TEMPS(a) {
        const evenements = [];
        posteAutomatiques(a.dt, evenements);
        etat.trains.slice().forEach((t) => { if (!t.arrete) avancer(t, a.dt, evenements); });
        return { ok: true, message: evenements.join(' · ') || null };
      },

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
      REGLAGE(a) {
        if (!(a.nom in etat.reglages)) return sansEffet(`Réglage inconnu : ${a.nom}`);
        etat.reglages[a.nom] = !!a.actif;
        return ok(`Réglage « ${a.nom} » ${a.actif ? 'activé' : 'désactivé'}`);
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

  // Ce que les trains occupent sur une voie, pour l'affichage
  function occupation(etat, voie) {
    const o = { annonce: false, approche: false, eap: false, zoneA: false, zoneB: false, saatAnnonce: '', saatCarre: '' };
    etat.trains.filter((t) => t.voie === voie).forEach((t) => {
      const nom = PARCOURS[t.etape].nom;
      if (nom === 'annonce') { o.annonce = true; o.saatAnnonce = t.numero; }
      if (nom === 'approche') o.approche = true;
      if (nom === 'zone-a') o.zoneA = true;
      if (nom === 'zone-b') o.zoneB = true;
      // Le numéro reste sur la case du carré de l'entrée en ZAP jusqu'à la libération de la dernière zone
      if (['approche', 'pedale', 'zone-a', 'zone-b'].includes(nom)) o.saatCarre = t.numero;
    });
    // Enclenchement d'approche : ZAP occupée et carré ouvert
    o.eap = o.approche && !etat.voies[voie].carre.ferme;
    return o;
  }

  return { creer, etatInitial, occupation, voieDe, POSTES, PARCOURS, DUREES, VITESSES };
});
