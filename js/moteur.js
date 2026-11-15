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
//
// Les trains se déplacent sur une ligne graduée en mètres : position de
// la tête, longueur, vitesse en km/h, accélération et freinage. Une zone
// est occupée dès qu'une partie du train la recouvre.
// ==========================================================
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Moteur = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {

  const POSTES = {
    V1: { amont: 'Alfa', aval: 'Charlie' },
    V2: { amont: 'Charlie', aval: 'Alfa' },
  };

  // ---------- Géométrie de la ligne ----------
  // Longueurs en mètres, dans le sens de circulation de chaque voie. Les PK
  // croissent dans le sens impair (V1, Alfa → Charlie). Avec ces valeurs :
  //   V1 : Alfa PK 100,000 · annonce 103,000 · ZAP 108,500 · C1/S1 110,000 ·
  //        z1 110,100 · aiguille E 110,900 · fin z3 111,350 · Charlie 121,000
  //   V2 : Charlie PK 121,000 · annonce 118,350 · ZAP 112,850 · C2/S2 111,350 ·
  //        z2 111,250 · aiguille F 110,500 · fin z4 110,000 · Alfa 100,000
  //   Quais (400 m) : PK 110,050 à 110,450, le long de z1 (V1) et de z4 (V2).
  // signalZone : distance entre le signal et le début de la zone suivante.
  // quaiFin : distance entre le signal et l'extrémité du quai, dans le sens de marche.
  // La longueur de la ligne après Bravo en V2 se déduit de la V1, pour retomber sur Alfa.
  const LIGNE = {
    pkAlfa: 100000,
    V1: { ligneAvant: 3000, annonce: 5500, approche: 1500, signalZone: 100, zoneA: 800, zoneB: 450, ligneApres: 9650, quaiFin: 450, quaiLongueur: 400 },
    V2: { ligneAvant: 2650, annonce: 5500, approche: 1500, signalZone: 100, zoneA: 750, zoneB: 500, quaiFin: 1300, quaiLongueur: 400 },
  };
  const SECTIONS = ['ligneAvant', 'annonce', 'approche', 'signalZone', 'zoneA', 'zoneB', 'ligneApres'];

  // Positions (en mètres depuis la gare d'origine de la voie) et PK des repères
  function geometrie(etat, voie) {
    const l = etat.ligne[voie];
    const v1 = etat.ligne.V1;
    const total = SECTIONS.reduce((s, n) => s + v1[n], 0);
    const g = {};
    g.debutAnnonce = l.ligneAvant;
    g.debutZap = g.debutAnnonce + l.annonce;
    g.signal = g.debutZap + l.approche;
    g.debutZoneA = g.signal + l.signalZone;
    g.aiguille = g.debutZoneA + l.zoneA;
    g.finZoneB = g.aiguille + l.zoneB;
    g.ligneApres = voie === 'V1' ? l.ligneApres : Math.max(500, total - g.finZoneB);
    g.fin = g.finZoneB + g.ligneApres;
    g.quaiFin = g.signal + l.quaiFin;
    g.quaiDebut = g.quaiFin - l.quaiLongueur;
    g.pk = (x) => (voie === 'V1' ? etat.ligne.pkAlfa + x : etat.ligne.pkAlfa + total - x);
    return g;
  }

  // PK en mètres → « 110,250 »
  function formatPK(m) {
    const r = Math.round(m);
    return `${Math.floor(r / 1000)},${String(r % 1000).padStart(3, '0')}`;
  }

  // ---------- Trains ----------
  // Caractéristiques par longueur : vitesse maximale par défaut (km/h),
  // accélération et freinage de service (m/s²)
  const TYPES = {
    50: { libelle: '50 m (engin seul)', vmax: 120, acceleration: 0.6, freinage: 0.8 },
    300: { libelle: '300 m (voyageurs)', vmax: 160, acceleration: 0.5, freinage: 0.7 },
    750: { libelle: '750 m (fret)', vmax: 100, acceleration: 0.15, freinage: 0.45 },
  };
  const FREIN_URGENCE = 1.2;   // m/s²
  const MARGE_ARRET = 20;      // un train s'arrête la tête à 20 m du signal fermé
  const PAS = 0.25;            // pas de calcul, en secondes de temps simulé
  const ACCELERATIONS = [1, 2, 5, 10, 20];

  // Voie empruntée selon l'origine et la destination
  function voieDe(origine, destination) {
    if (origine === destination) return null;
    if (destination === 'Charlie') return 'V1';
    if (destination === 'Alfa') return 'V2';
    if (destination === 'Bravo') return origine === 'Alfa' ? 'V1' : origine === 'Charlie' ? 'V2' : null;
    return null;
  }

  // Point d'arrêt à quai à Bravo : tête en bout de quai, plus loin si la queue
  // n'a pas dégagé le signal, sans jamais sortir de la gare
  function arretQuai(g, t) {
    return Math.min(Math.max(g.quaiFin, g.signal + t.longueur + MARGE_ARRET), g.finZoneB - 10);
  }

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
      // { id, numero, origine, destination, voie, longueur, vmax, a, b, s, v,
      //   arrete, urgence, demarrage, franchir, terminus, attenteDepart }
      trains: [],
      ligne: JSON.parse(JSON.stringify(LIGNE)),
      acceleration: 1,    // vitesse du simulateur : 1 = temps réel
      redemarrage: 4,     // secondes entre l'ouverture du signal et la remise en marche d'un train arrêté
      prochainTrain: 1,
      auE: 'A',
      vcm: { 1: 'F', 2: 'F' },
      gare: 'ES',         // commutateur gare : ES en service, HS hors service (fonctionnement à venir)
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
    function posteAutomatiques(dtMs, evenements) {
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
        v.delaiReddition -= dtMs;
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

    // ---------- Marche d'un train ----------
    // Le conducteur voit le signal à partir de l'avertissement (début de la ZAP) :
    // s'il est fermé, il freine pour s'arrêter devant. S'il se ferme trop tard,
    // le train ne peut plus s'arrêter et le franchit.
    function avancer(t, duree, evenements) {
      const g = geometrie(etat, t.voie);
      let reste = duree;
      while (reste > 1e-9 && !t.terminus && !t.attenteDepart) {
        const h = Math.min(PAS, reste);
        reste -= h;
        if (pas(t, g, h, evenements) === 'sorti') return;
      }
    }

    function pas(t, g, h, evenements) {
      const v = etat.voies[t.voie];
      const franchissable = () => t.franchir || (v.sema.ouvert && !v.carre.ferme);

      // Point d'arrêt visé : signal fermé en vue, ou quai en terminus
      let cible = null;
      if (t.s < g.signal && t.s >= g.debutZap && !franchissable()) cible = g.signal - MARGE_ARRET;
      if (t.destination === 'Bravo') {
        const q = arretQuai(g, t);
        cible = cible == null ? q : Math.min(cible, q);
      }

      const v0 = t.v;
      let s1;
      if (t.arrete) {
        // Arrêt ordonné par le formateur (ou d'urgence après un franchissement)
        if (t.v === 0) return null;
        t.v = Math.max(0, t.v - (t.urgence ? FREIN_URGENCE : t.b) * h);
        s1 = t.s + ((v0 + t.v) / 2) * h;
      } else {
        if (t.v === 0) {
          if (cible != null && cible - t.s <= 0.5) {
            t.demarrage = null;
            if (t.destination === 'Bravo' && Math.abs(cible - arretQuai(g, t)) < 0.5) {
              t.terminus = true;
              evenements.push(`Train ${t.numero} terminus Bravo, à quai (${t.voie})`);
            }
            return null;
          }
          // Inertie : le train met quelques secondes à se remettre en marche
          if (t.demarrage == null) {
            t.demarrage = etat.redemarrage;
            evenements.push(`Train ${t.numero} se remet en marche (${t.voie})`);
          }
          t.demarrage -= h;
          if (t.demarrage > 0) return null;
          t.demarrage = null;
        }
        let dec = 0;
        if (cible != null) {
          const dist = cible - t.s;
          if (dist <= 0) dec = FREIN_URGENCE;
          else {
            const requis = (t.v * t.v) / (2 * dist);
            if (requis >= 0.95 * t.b) dec = Math.min(requis, FREIN_URGENCE);
          }
        }
        t.v = dec > 0 ? Math.max(0, t.v - dec * h) : Math.min(t.vmax, t.v + t.a * h);
        s1 = t.s + ((v0 + t.v) / 2) * h;
        // Arrêt précis au point visé, quand il est atteignable
        if (cible != null && dec > 0 && dec < FREIN_URGENCE && (s1 >= cible || (t.v === 0 && cible - s1 < 5))) {
          s1 = cible;
          t.v = 0;
        }
      }

      // Franchissement du signal par la tête
      if (t.s < g.signal && s1 >= g.signal) {
        const autorise = franchissable();
        pedale(v);
        if (!autorise) {
          evenements.push(`Train ${t.numero} a franchi le signal fermé sans autorisation : arrêt d'urgence (${t.voie})`);
          t.arrete = true;
          t.urgence = true;
        } else {
          evenements.push(`Train ${t.numero} franchit le signal (${t.voie})`);
        }
        t.franchir = false;
      }
      t.s = s1;

      // Arrivée complète au poste suivant (queue sortie de la ligne)
      if (t.s - t.longueur >= g.fin) {
        etat.trains.splice(etat.trains.indexOf(t), 1);
        v.arrivesAval += 1;
        evenements.push(`Train ${t.numero} arrivé à ${t.destination} (${t.voie})`);
        return 'sorti';
      }
      return null;
    }

    const actionsGenerales = {
      // ---------- Trains (pilotés par le formateur) ----------
      // { origine, destination } parmi Alfa, Bravo, Charlie (ou { voie } pour un parcours complet),
      // longueur (50, 300 ou 750 m), vitesse maximale en km/h
      TRAIN_CREER(a) {
        const origine = a.origine || (POSTES[a.voie] || {}).amont;
        const destination = a.destination || (POSTES[a.voie] || {}).aval;
        const voie = voieDe(origine, destination);
        if (!voie) return sansEffet(`Parcours impossible : ${origine} → ${destination}`);
        const type = TYPES[a.longueur] || TYPES[300];
        const longueur = TYPES[a.longueur] ? Number(a.longueur) : 300;
        const kmh = Number(a.vitesse) > 0 ? Number(a.vitesse) : type.vmax;
        const numero = String(a.numero || '').trim() || String(etat.prochainTrain);
        const departBravo = origine === 'Bravo';
        const t = {
          id: etat.prochainTrain++, numero, origine, destination, voie, longueur,
          vmax: kmh / 3.6, a: type.acceleration, b: type.freinage,
          s: 0, v: kmh / 3.6,
          arrete: false, urgence: false, demarrage: null, franchir: false, terminus: false,
          aQuai: departBravo, // au départ de Bravo, à quai jusqu'à l'ordre de départ
          // Postes automatiques : le train attend à son origine que le poste ait voie libre pour l'annoncer
          attenteDepart: !departBravo && etat.reglages.postesAutomatiques,
        };
        // Un train au départ de Bravo attend à quai l'ordre de départ du formateur
        if (departBravo) {
          t.s = arretQuai(geometrie(etat, voie), t);
          t.v = 0;
          t.arrete = true;
        }
        etat.trains.push(t);
        if (t.attenteDepart) {
          const evenements = [];
          posteAutomatiques(0, evenements);
          return ok(evenements[0] || `Train ${numero} en attente à ${origine} : voie libre non reçue de Bravo (${voie})`);
        }
        return ok(departBravo
          ? `Train ${numero} à quai à Bravo, prêt au départ vers ${destination} (${voie})`
          : `Train ${numero} parti de ${origine} pour ${destination} (${voie})`);
      },
      TRAIN_ARRETER(a) {
        const t = trouver(a.id);
        if (!t) return sansEffet('Train introuvable');
        t.arrete = true;
        return ok(`Train ${t.numero} : arrêt demandé par le formateur`);
      },
      TRAIN_REPARTIR(a) {
        const t = trouver(a.id);
        if (!t) return sansEffet('Train introuvable');
        t.arrete = false;
        t.urgence = false;
        t.aQuai = false;
        return ok(`Train ${t.numero} : ordre de repartir`);
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
        if (!t || !(Number(a.vitesse) > 0)) return sansEffet('Train ou vitesse invalides');
        t.vmax = Number(a.vitesse) / 3.6;
        return ok(`Train ${t.numero} : vitesse maximale ${a.vitesse} km/h`);
      },
      TRAIN_SUPPRIMER(a) {
        const t = trouver(a.id);
        if (!t) return sansEffet('Train introuvable');
        etat.trains.splice(etat.trains.indexOf(t), 1);
        return ok(`Train ${t.numero} supprimé`);
      },
      // Écoulement du temps : appelé régulièrement par la page (dt en ms réelles)
      TEMPS(a) {
        const duree = (a.dt / 1000) * etat.acceleration;
        const evenements = [];
        posteAutomatiques(duree * 1000, evenements);
        etat.trains.slice().forEach((t) => avancer(t, duree, evenements));
        return { ok: true, message: evenements.join(' · ') || null };
      },

      // ---------- Réglages de la séance ----------
      ACCELERATION(a) {
        const f = Number(a.facteur);
        if (!ACCELERATIONS.includes(f)) return sansEffet(`Vitesse du simulateur invalide : ${a.facteur}`);
        etat.acceleration = f;
        return ok(f === 1 ? 'Simulateur en temps réel' : `Simulateur accéléré ×${f}`);
      },
      LIGNE(a) {
        const l = etat.ligne[a.voie];
        const m = Math.round(Number(a.metres));
        if (!l || !(a.nom in l) || !(m >= 0)) return sansEffet(`Longueur invalide : ${a.nom}`);
        l[a.nom] = m;
        return ok(`${a.voie} : ${a.nom} = ${m} m`);
      },
      REDEMARRAGE(a) {
        const s = Number(a.secondes);
        if (!(s >= 0)) return sansEffet('Temps de redémarrage invalide');
        etat.redemarrage = s;
        return ok(`Redémarrage devant un signal : ${s} s`);
      },

      B_AU_E(a) {
        etat.auE = a.position || (etat.auE === 'A' ? 'I' : 'A');
        return ok(`Bravo met le commutateur Au E sur ${etat.auE}`);
      },
      B_VCM(a) {
        etat.vcm[a.numero] = a.position || (etat.vcm[a.numero] === 'F' ? 'O' : 'F');
        return ok(`Vcm ${a.numero} sur ${etat.vcm[a.numero]}`);
      },
      // Commutateur de gare : position seulement, le fonctionnement reste à définir
      B_GARE(a) {
        etat.gare = a.position || (etat.gare === 'ES' ? 'HS' : 'ES');
        return ok(etat.gare === 'HS'
          ? 'Gare hors service (HS) : fonctionnement à venir'
          : 'Gare en service (ES) : fonctionnement à venir');
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
    const g = geometrie(etat, voie);
    const o = { annonce: false, approche: false, eap: false, zoneA: false, zoneB: false, saatAnnonce: '', saatCarre: '' };
    etat.trains.filter((t) => t.voie === voie && !t.attenteDepart).forEach((t) => {
      const tete = t.s;
      const queue = t.s - t.longueur;
      const recouvre = (debut, fin) => tete > debut && queue < fin;
      // Le voyant d'annonce suit la tête : il s'éteint quand elle entre en ZAP
      if (tete >= g.debutAnnonce && tete < g.debutZap) { o.annonce = true; o.saatAnnonce = t.numero; }
      if (recouvre(g.debutZap, g.debutZoneA)) o.approche = true;
      if (recouvre(g.debutZoneA, g.aiguille)) o.zoneA = true;
      if (recouvre(g.aiguille, g.finZoneB)) o.zoneB = true;
      // Le numéro reste sur la case du carré de l'entrée en ZAP jusqu'à la libération de la dernière zone
      if (tete >= g.debutZap && queue < g.finZoneB) o.saatCarre = t.numero;
    });
    // Enclenchement d'approche : ZAP occupée et carré ouvert
    o.eap = o.approche && !etat.voies[voie].carre.ferme;
    return o;
  }

  // Où se trouve un train : section de la tête, PK de la tête et de la queue
  function position(etat, t) {
    const g = geometrie(etat, t.voie);
    const p = POSTES[t.voie];
    const za = t.voie === 'V1' ? 'z1' : 'z2';
    const zb = t.voie === 'V1' ? 'z3' : 'z4';
    const x = t.s;
    let libelle;
    if (x < g.debutAnnonce) libelle = `en ligne, de ${p.amont} vers Bravo`;
    else if (x < g.debutZap) libelle = "en zone d'annonce";
    else if (x < g.signal) libelle = "en zone d'approche";
    else if (x < g.debutZoneA) libelle = 'vient de franchir le signal';
    else if (x < g.aiguille) libelle = `sur ${za}`;
    else if (x < g.finZoneB) libelle = `sur ${zb}`;
    else libelle = `en ligne, de Bravo vers ${p.aval}`;
    return {
      libelle,
      devantSignal: t.v === 0 && !t.arrete && x >= g.debutZap && x < g.signal,
      redemarre: t.demarrage != null,
      pkTete: formatPK(g.pk(x)),
      pkQueue: formatPK(g.pk(x - t.longueur)),
      kmh: Math.round(t.v * 3.6),
    };
  }

  return {
    creer, etatInitial, occupation, position, geometrie, formatPK, voieDe,
    POSTES, TYPES, ACCELERATIONS, LIGNE, SECTIONS,
  };
});
