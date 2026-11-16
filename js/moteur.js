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
      // Gare de Bravo hors service : le poste amont annonce directement au poste aval
      // (canton Alfa–Charlie), voie libre pas encore rendue
      directe: false,
      // Carré protégeant la gare (C1 en voie 1, C2 en voie 2), normalement ouvert ;
      // fermé par son Vcm au point E, ou par le formateur (dérangement : force)
      carre: { ferme: false, force: false },
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
      auE: 'I',               // commutateur Au E : I interdit (repos), A autorisé
      vcm: { 1: 'O', 2: 'O' }, // Vcm du point E : O ouvert (repos), F fermé
      pointE: {
        eap: { V1: false, V2: false },          // enclenchements d'approche (mémorisés)
        cles: { E: 'vcm', F: 'vcm' },           // 'vcm' (dans son Vcm) ou 'serrure' (dans la serrure de l'aiguille)
        serrures: { E: true, F: true },         // true : verrouillée, pêne sorti
        aiguilles: { E: 'normale', F: 'normale' }, // 'normale' ou 'renversee'
      },
      tableau: JSON.parse(JSON.stringify(TABLEAU_DEFAUT)),
      // Historique de la séance pour le tableau de bord du formateur (le plus récent en dernier)
      historique: [],
      gare: 'ES',         // commutateur gare : ES en service, HS hors service (gare temporaire, IN1508)
      reglages: {
        redditionAvecSonnerie: true, // voie libre rendue par action simultanée sur Sonnerie et Reddition
        aideReddition: true,         // si Reddition est pressée seule, le bouton Sonnerie clignote
        postesAutomatiques: true,    // Alfa et Charlie annoncent et rendent voie libre tout seuls (par défaut)
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

  // ==========================================================
  // Point E et aiguilles : tableau d'enclenchement
  // Tableau à deux entrées : chaque LIGNE (manœuvre ou état) exige, pour chaque
  // COLONNE (condition), que la condition soit vraie (true) ou fausse (false) ;
  // une case absente est sans effet. Le formateur modifie le tableau dans l'app.
  // Correspondances : Vcm 1 ↔ carré C1 ↔ clé E ↔ aiguille E (voie 1, z1 / z3)
  //                   Vcm 2 ↔ carré C2 ↔ clé F ↔ aiguille F (voie 2, z2 / z4)
  // ==========================================================
  const CONDITIONS = [
    // [clé, libellé, groupe]
    ['aueA', 'Commutateur Au E sur A', 'Poste B'],
    ['aueDonnee', 'Au E donnée (voyant blanc)', 'Point E'],
    ['eap1Libre', 'EAP C1 libre', 'Point E'],
    ['eap2Libre', 'EAP C2 libre', 'Point E'],
    ['vcm1O', 'Vcm 1 sur O', 'Point E'],
    ['vcm2O', 'Vcm 2 sur O', 'Point E'],
    ['zap1Libre', 'ZAP C1 libre', 'Zones'],
    ['z1Libre', 'z1 libre', 'Zones'],
    ['z3Libre', 'z3 libre', 'Zones'],
    ['zap2Libre', 'ZAP C2 libre', 'Zones'],
    ['z2Libre', 'z2 libre', 'Zones'],
    ['z4Libre', 'z4 libre', 'Zones'],
    ['c1Ouvert', 'Carré C1 ouvert', 'Signaux'],
    ['c2Ouvert', 'Carré C2 ouvert', 'Signaux'],
    ['cleEVcm', 'Clé E dans le Vcm 1', 'Clés'],
    ['cleFVcm', 'Clé F dans le Vcm 2', 'Clés'],
    ['serrureEVerrouillee', 'Serrure E verrouillée', 'Aiguilles'],
    ['serrureFVerrouillee', 'Serrure F verrouillée', 'Aiguilles'],
    ['aigENormale', 'Aiguille E normale', 'Aiguilles'],
    ['aigFNormale', 'Aiguille F normale', 'Aiguilles'],
  ];

  // Lignes « état » : calculées en permanence, elles ne peuvent exiger que des
  // conditions de base (pas Au E donnée ni EAP, pour éviter les boucles).
  const LIGNES_TABLEAU = [
    // [clé, libellé, genre]
    ['aueDonnee', 'Au E donnée (voyant Au E blanc)', 'etat'],
    ['eap1Enclenche', "EAP C1 s'enclenche", 'etat'],
    ['eap1Libere', 'EAP C1 se libère', 'etat'],
    ['eap2Enclenche', "EAP C2 s'enclenche", 'etat'],
    ['eap2Libere', 'EAP C2 se libère', 'etat'],
    ['vcm1F', 'Vcm 1 : O → F (fermer C1)', 'manoeuvre'],
    ['vcm1O', 'Vcm 1 : F → O (ouvrir C1)', 'manoeuvre'],
    ['vcm2F', 'Vcm 2 : O → F (fermer C2)', 'manoeuvre'],
    ['vcm2O', 'Vcm 2 : F → O (ouvrir C2)', 'manoeuvre'],
    ['cleERetirer', 'Clé E : retirer du Vcm 1', 'manoeuvre'],
    ['cleERendre', 'Clé E : remettre dans le Vcm 1', 'manoeuvre'],
    ['cleFRetirer', 'Clé F : retirer du Vcm 2', 'manoeuvre'],
    ['cleFRendre', 'Clé F : remettre dans le Vcm 2', 'manoeuvre'],
    ['serrureEOuvrir', 'Serrure E : déverrouiller (pêne rentré)', 'manoeuvre'],
    ['serrureEFermer', 'Serrure E : verrouiller (pêne sorti)', 'manoeuvre'],
    ['serrureFOuvrir', 'Serrure F : déverrouiller (pêne rentré)', 'manoeuvre'],
    ['serrureFFermer', 'Serrure F : verrouiller (pêne sorti)', 'manoeuvre'],
    ['levierE', "Levier E : manœuvrer l'aiguille E", 'manoeuvre'],
    ['levierF', "Levier F : manœuvrer l'aiguille F", 'manoeuvre'],
  ];
  const COLONNES_DERIVEES = ['aueDonnee', 'eap1Libre', 'eap2Libre'];
  const TABLEAU_DEFAUT = {
    aueDonnee: { aueA: true, z1Libre: true, z2Libre: true },
    eap1Enclenche: { zap1Libre: false, c1Ouvert: true },
    eap1Libere: { zap1Libre: true, z1Libre: true },
    eap2Enclenche: { zap2Libre: false, c2Ouvert: true },
    eap2Libere: { zap2Libre: true, z2Libre: true },
    vcm1F: { aueDonnee: true, eap1Libre: true },
    vcm1O: { cleEVcm: true },
    vcm2F: { aueDonnee: true, eap2Libre: true },
    vcm2O: { cleFVcm: true },
    cleERetirer: { vcm1O: false },
    cleERendre: { serrureEVerrouillee: true },
    cleFRetirer: { vcm2O: false },
    cleFRendre: { serrureFVerrouillee: true },
    serrureEOuvrir: { cleEVcm: false },
    serrureEFermer: { aigENormale: true },
    serrureFOuvrir: { cleFVcm: false },
    serrureFFermer: { aigFNormale: true },
    // Seules z1 et z2 protègent les aiguilles : un train arrêté sur z3 / z4 permet de manœuvrer
    levierE: { serrureEVerrouillee: false, z1Libre: true },
    levierF: { serrureFVerrouillee: false, z2Libre: true },
  };
  const LIBELLE_CONDITION = Object.fromEntries(CONDITIONS.map(([c, l]) => [c, l]));

  // Valeur de chaque condition dans l'état courant
  function conditions(etat) {
    const o1 = occupation(etat, 'V1');
    const o2 = occupation(etat, 'V2');
    const e = etat.pointE;
    const c = {
      aueA: etat.auE === 'A',
      zap1Libre: !o1.approche, z1Libre: !o1.zoneA, z3Libre: !o1.zoneB,
      zap2Libre: !o2.approche, z2Libre: !o2.zoneA, z4Libre: !o2.zoneB,
      eap1Libre: !e.eap.V1, eap2Libre: !e.eap.V2,
      c1Ouvert: !etat.voies.V1.carre.ferme, c2Ouvert: !etat.voies.V2.carre.ferme,
      vcm1O: etat.vcm[1] === 'O', vcm2O: etat.vcm[2] === 'O',
      cleEVcm: e.cles.E === 'vcm', cleFVcm: e.cles.F === 'vcm',
      serrureEVerrouillee: e.serrures.E, serrureFVerrouillee: e.serrures.F,
      aigENormale: e.aiguilles.E === 'normale', aigFNormale: e.aiguilles.F === 'normale',
    };
    c.aueDonnee = manquantes(etat, 'aueDonnee', c).length === 0;
    return c;
  }
  // Conditions exigées par une ligne du tableau et non réalisées
  function manquantes(etat, ligne, c) {
    const exige = (etat.tableau && etat.tableau[ligne]) || {};
    return Object.entries(exige)
      .filter(([col, val]) => col in c && c[col] !== val)
      .map(([col, val]) => (val ? LIBELLE_CONDITION[col] : `non « ${LIBELLE_CONDITION[col]} »`));
  }

  function creer(etatDepart) {
    let etat = etatDepart ? JSON.parse(JSON.stringify(etatDepart)) : etatInitial();
    const abonnes = [];

    const ok = (message) => ({ ok: true, message });
    const sansEffet = (message) => ({ ok: false, message });

    // Refus motivé si une manœuvre n'a pas toutes les conditions du tableau
    function verifier(ligne, libelle) {
      const m = manquantes(etat, ligne, conditions(etat));
      return m.length ? sansEffet(`${libelle} : refusé par les enclenchements (${m.join(', ')})`) : null;
    }
    // Carré fermé par son Vcm (F) ou par dérangement
    function majCarres() {
      [['V1', 1], ['V2', 2]].forEach(([voie, n]) => {
        const c = etat.voies[voie].carre;
        c.ferme = etat.vcm[n] === 'F' || !!c.force;
      });
    }
    // Enclenchements d'approche : s'enclenchent et se libèrent selon le tableau
    function majPointE() {
      const e = etat.pointE;
      [['V1', 1], ['V2', 2]].forEach(([voie, n]) => {
        if (!etat.enclenchements.approche) { e.eap[voie] = false; return; }
        const c = conditions(etat);
        if (e.eap[voie] && !manquantes(etat, `eap${n}Libere`, c).length) e.eap[voie] = false;
        else if (!e.eap[voie] && !manquantes(etat, `eap${n}Enclenche`, c).length) e.eap[voie] = true;
      });
    }
    majCarres();

    // Historique : manœuvres de Bravo (effectuées ou refusées, avec le motif),
    // actions d'Alfa, de Charlie et du formateur, événements des trains
    const HISTORIQUE_MAX = 150;
    function acteur(type) {
      if (/^B_/.test(type)) return 'Bravo';
      if (/^AMONT_|^AVAL_/.test(type)) return 'Alfa / Charlie';
      if (type === 'TEMPS') return 'Ligne';
      return 'Formateur';
    }
    function noter(action, resultat) {
      if (!action || !resultat || !resultat.message) return;
      if (action.type === 'TEMPS' && !resultat.message) return;
      const qui = action.type === 'AMONT_ANNONCE' || action.type === 'AMONT_ARRET_SONNERIE'
        ? POSTES[action.voie] && POSTES[action.voie].amont
        : /^AVAL_/.test(action.type) ? POSTES[action.voie] && POSTES[action.voie].aval : acteur(action.type);
      const messages = action.type === 'TEMPS' ? resultat.message.split(' · ') : [resultat.message];
      const h = Date.now();
      messages.forEach((m) => etat.historique.push({ h, qui: qui || acteur(action.type), type: action.type, ok: !!resultat.ok, message: m }));
      if (etat.historique.length > HISTORIQUE_MAX) etat.historique.splice(0, etat.historique.length - HISTORIQUE_MAX);
    }

    const actions = {
      // ---------- Poste amont (joué par le formateur) ----------
      AMONT_ANNONCE(v, a) {
        const p = POSTES[a.voie];
        const vers = horsService() ? p.aval : 'Bravo';
        if (!annoncerAmont(v)) return sansEffet(`${p.amont} : annonce sans effet, voie libre non reçue de ${vers}`);
        return ok(`${p.amont} annonce un train à ${vers} (${a.voie})`);
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
        const vers = horsService() ? p.amont : 'Bravo';
        if (!rendreAval(v)) return sansEffet(`${p.aval} : reddition sans effet, aucun train annoncé par ${vers}`);
        return ok(`${p.aval} rend voie libre à ${vers} (${a.voie})`);
      },

      // ---------- Pédale (actionnée par un train, ou seule pour un dérangement) ----------
      TRAIN_PEDALE(v, a) {
        pedale(v);
        return ok(`${a.voie} : pédale actionnée, fermeture automatique du sémaphore et sonnerie`);
      },

      // ---------- Poste B (l'élève) ----------
      B_ARRET_SONNERIE(v, a) {
        if (horsService()) return sansEffet(HORS_CIRCUIT);
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
        if (s.bloque && etat.enclenchements.blocageSemaphore && !horsService()) {
          return sansEffet(`Bravo commande l'ouverture du sémaphore (${a.voie}) : il n'obéit pas, sémaphore bloqué`);
        }
        s.ouvert = true;
        return ok(`Bravo ouvre le sémaphore (${a.voie})`);
      },

      // Dérangement : carré fermé par le formateur, indépendamment du Vcm
      B_CARRE(v, a) {
        v.carre.force = a.ferme !== undefined ? !!a.ferme : !v.carre.force;
        return ok(`Carré C${a.voie[1]} : ${v.carre.force ? 'fermé par dérangement' : 'dérangement levé'}`);
      },

      B_ANNONCE(v, a) {
        if (horsService()) return sansEffet(HORS_CIRCUIT);
        const p = POSTES[a.voie];
        if (v.annonceEmise) return sansEffet(`Bravo : annonce sans effet, voie libre non reçue de ${p.aval}`);
        v.annonceEmise = true;
        v.sonnerieAval = true;
        v.sema.bloque = true;
        return ok(`Bravo annonce le train à ${p.aval} (${a.voie})`);
      },

      B_REDDITION(v, a) {
        if (horsService()) return sansEffet(HORS_CIRCUIT);
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

    const horsService = () => etat.gare === 'HS';
    const HORS_CIRCUIT = 'Gare de Bravo hors service : appareils de block hors circuit';

    // Le poste amont annonce un train (possible seulement s'il a voie libre) :
    // à Bravo, ou directement au poste aval quand Bravo est hors service
    function annoncerAmont(v) {
      if (horsService()) {
        if (v.directe) return false;
        v.directe = true;
        v.sonnerieAval = true;
        return true;
      }
      if (v.annonceRecue) return false;
      v.annonceRecue = true;
      v.sonnerieAnnonce = true;
      return true;
    }
    // Le poste aval rend voie libre (possible seulement si le train lui a été annoncé) :
    // à Bravo, ou directement au poste amont quand Bravo est hors service
    function rendreAval(v) {
      if (horsService()) {
        if (!v.directe) return false;
        v.directe = false;
        v.sonnerieAmont = true;
      } else {
        if (!v.annonceEmise) return false;
        v.annonceEmise = false;
        v.sonnerieReddition = true;
        v.sema.bloque = false;
      }
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
          evenements.push(`${t.origine} annonce le train ${t.numero} à ${horsService() ? POSTES[t.voie].aval : 'Bravo'} et l'expédie (${t.voie})`);
        }
      });
      if (!auto) return;
      Object.entries(etat.voies).forEach(([voie, v]) => {
        v.sonnerieAmont = false; // les postes automatiques arrêtent leurs sonneries
        v.sonnerieAval = false;
        const annonce = horsService() ? v.directe : v.annonceEmise;
        if (!(v.arrivesAval > 0 && annonce)) { v.delaiReddition = null; return; }
        if (v.delaiReddition == null) v.delaiReddition = DELAI_REDDITION_AUTO;
        v.delaiReddition -= dtMs;
        if (v.delaiReddition <= 0 && rendreAval(v)) {
          evenements.push(`${POSTES[voie].aval} rend voie libre à ${horsService() ? POSTES[voie].amont : 'Bravo'} (${voie})`);
        }
      });
    }

    // Franchissement du sémaphore : fermeture automatique (aubinage), blocage, sonnerie
    function pedale(v) {
      if (horsService()) return; // dispositifs de fermeture automatique annulés
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
        majPointE();
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
      // ---------- Point E (enclenchements du tableau) ----------
      B_VCM(a) {
        const n = Number(a.numero);
        const vers = a.position || (etat.vcm[n] === 'F' ? 'O' : 'F');
        if (vers === etat.vcm[n]) return ok(`Vcm ${n} déjà sur ${vers}`);
        const refus = verifier(`vcm${n}${vers}`, `Vcm ${n} sur ${vers}`);
        if (refus) return refus;
        etat.vcm[n] = vers;
        majCarres();
        return ok(`Vcm ${n} sur ${vers} : carré C${n} ${vers === 'F' ? 'fermé' : 'ouvert'}`);
      },
      B_CLE(a) {
        const cle = a.cle === 'F' ? 'F' : 'E';
        const n = cle === 'E' ? 1 : 2;
        const e = etat.pointE;
        if (e.cles[cle] === 'vcm') {
          const refus = verifier(`cle${cle}Retirer`, `Clé ${cle} : retrait du Vcm ${n}`);
          if (refus) return refus;
          e.cles[cle] = 'serrure';
          return ok(`Clé ${cle} retirée du Vcm ${n} et engagée dans la serrure de l'aiguille ${cle}`);
        }
        const refus = verifier(`cle${cle}Rendre`, `Clé ${cle} : retour au Vcm ${n}`);
        if (refus) return refus;
        e.cles[cle] = 'vcm';
        return ok(`Clé ${cle} remise dans le Vcm ${n}`);
      },
      B_SERRURE(a) {
        const aig = a.aiguille === 'F' ? 'F' : 'E';
        const e = etat.pointE;
        const verrouiller = !e.serrures[aig];
        const refus = verifier(`serrure${aig}${verrouiller ? 'Fermer' : 'Ouvrir'}`,
          `Serrure ${aig} : ${verrouiller ? 'verrouillage' : 'déverrouillage'}`);
        if (refus) return refus;
        e.serrures[aig] = verrouiller;
        return ok(`Serrure ${aig} ${verrouiller ? 'verrouillée : pêne sorti, aiguille immobilisée' : 'déverrouillée : pêne rentré, levier libre'}`);
      },
      B_LEVIER(a) {
        const aig = a.aiguille === 'F' ? 'F' : 'E';
        const e = etat.pointE;
        const refus = verifier(`levier${aig}`, `Levier ${aig}`);
        if (refus) return refus;
        e.aiguilles[aig] = e.aiguilles[aig] === 'normale' ? 'renversee' : 'normale';
        return ok(`Aiguille ${aig} ${e.aiguilles[aig] === 'normale' ? 'en position normale' : 'renversée'}`);
      },
      // ---------- Tableau d'enclenchement (formateur) ----------
      TABLEAU_CASE(a) {
        const ligne = LIGNES_TABLEAU.find(([l]) => l === a.ligne);
        if (!ligne || !(a.colonne in LIBELLE_CONDITION)) return sansEffet('Case du tableau inconnue');
        if (ligne[2] === 'etat' && COLONNES_DERIVEES.includes(a.colonne)) {
          return sansEffet('Une ligne « état » ne peut dépendre que de conditions de base');
        }
        const t = etat.tableau[a.ligne] || (etat.tableau[a.ligne] = {});
        if (a.valeur === true || a.valeur === false) t[a.colonne] = a.valeur;
        else delete t[a.colonne];
        majPointE();
        const v = a.valeur === true ? 'exige' : a.valeur === false ? 'interdit' : 'ne dépend plus de';
        return ok(`Tableau : « ${ligne[1]} » ${v} « ${LIBELLE_CONDITION[a.colonne]} »`);
      },
      TABLEAU(a) {
        if (a.tableau === 'defaut' || !a.tableau) etat.tableau = JSON.parse(JSON.stringify(TABLEAU_DEFAUT));
        else {
          const t = {};
          LIGNES_TABLEAU.forEach(([l, , genre]) => {
            t[l] = {};
            Object.entries(a.tableau[l] || {}).forEach(([c, val]) => {
              if (c in LIBELLE_CONDITION && typeof val === 'boolean' && !(genre === 'etat' && COLONNES_DERIVEES.includes(c))) t[l][c] = val;
            });
          });
          etat.tableau = t;
        }
        majPointE();
        return ok(a.tableau === 'defaut' ? "Tableau d'enclenchement par défaut rétabli" : "Tableau d'enclenchement chargé");
      },
      // Commutateur de gare (gare temporaire, IN1508). Les conditions de cessation et de
      // reprise sont de la responsabilité de l'agent : le commutateur ne s'y oppose pas,
      // mais le message signale ce qui n'était pas réuni.
      B_GARE(a) {
        const nouvelle = a.position || (etat.gare === 'ES' ? 'HS' : 'ES');
        if (nouvelle === etat.gare) return ok(`Gare déjà ${nouvelle === 'HS' ? 'hors service' : 'en service'}`);
        const alertes = [];
        Object.entries(etat.voies).forEach(([voie, v]) => {
          if (nouvelle === 'HS') {
            if (v.annonceRecue) alertes.push(`${voie} : voie libre non rendue à ${POSTES[voie].amont}`);
            if (v.annonceEmise) alertes.push(`${voie} : voie libre non reçue de ${POSTES[voie].aval}`);
            if (!v.sema.ouvert) alertes.push(`${voie} : sémaphore fermé`);
          }
        });
        if (nouvelle === 'HS' && etat.trains.some((t) => !t.attenteDepart && !t.terminus)) alertes.push('trains en ligne');
        etat.gare = nouvelle;
        const occupes = [];
        Object.entries(etat.voies).forEach(([voie, v]) => {
          v.sonnerieAnnonce = false;
          v.sonnerieReddition = false;
          if (nouvelle !== 'ES') return;
          // Reprise : le block de Bravo repart d'un état propre, cantons libres...
          const enLigne = etat.trains.filter((t) => t.voie === voie && !t.attenteDepart && !t.terminus && !t.aQuai);
          const occupe = v.directe || enLigne.length > 0;
          v.directe = false;
          v.annonceRecue = false;
          v.annonceEmise = false;
          v.arriveeSansAnnonce = false;
          v.sema.bloque = false;
          v.sema.ouvert = v.sema.manette === 'ouvert';
          if (!occupe) return;
          // ... sauf reprise en canton occupé (IN1508, fiche 7) : le train encore en ligne
          // (ou annoncé mais pas encore arrivé chez le poste aval) est reporté sur le block de Bravo.
          const p = POSTES[voie];
          const g = geometrie(etat, voie);
          const apres = enLigne.filter((t) => t.s >= g.signal);
          const avant = enLigne.filter((t) => t.s < g.signal);
          // Canton Bravo → aval occupé : train passé à Bravo, ou arrivé sans voie libre rendue
          if (apres.length || (enLigne.length === 0 && v.arrivesAval > 0)) {
            v.annonceEmise = true;
            v.sema.ouvert = false;
            v.sema.bloque = true;
            occupes.push(`${voie} : canton Bravo–${p.aval} considéré occupé${apres.length ? ` (train ${apres.map((t) => t.numero).join(', ')})` : ''}, sémaphore fermé`);
          }
          // Canton amont → Bravo occupé : train pas encore arrivé à Bravo, ou annoncé et pas encore parti
          if (avant.length || (enLigne.length === 0 && v.arrivesAval === 0)) {
            v.annonceRecue = true;
            occupes.push(`${voie} : canton ${p.amont}–Bravo occupé${avant.length ? ` (train ${avant.map((t) => t.numero).join(', ')})` : ''}, annonce reportée à Bravo`);
          }
        });
        if (occupes.length) {
          return {
            ok: true, alerte: true,
            message: `Commutateur sur ES : reprise en canton occupé (fiche 7, autorisation d'Alfa et de Charlie nécessaire). ${occupes.join(' ; ')}`,
          };
        }
        const message = nouvelle === 'HS'
          ? 'Commutateur sur HS : gare de Bravo hors service, Alfa et Charlie travaillent directement entre eux'
          : 'Commutateur sur ES : gare de Bravo en service, block repris';
        return alertes.length
          ? { ok: true, alerte: true, message: `${message}. Attention : ${alertes.join(' ; ')}` }
          : ok(message);
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
        const tableau = etat.tableau; // le tableau du formateur est conservé
        etat = etatInitial();
        etat.tableau = tableau;
        etat.historique = [];
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
      majCarres();
      majPointE();
      noter(action, resultat);
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
    // Enclenchement d'approche : mémorisé par le moteur (voir majPointE)
    o.eap = !!(etat.pointE && etat.pointE.eap[voie]);
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
    creer, etatInitial, occupation, position, geometrie, formatPK, voieDe, conditions, manquantes,
    CONDITIONS, LIGNES_TABLEAU, COLONNES_DERIVEES, TABLEAU_DEFAUT,
    POSTES, TYPES, ACCELERATIONS, LIGNE, SECTIONS,
  };
});
