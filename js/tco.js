// ==========================================================
// Simulateur BMDV — liaison entre le moteur et le TCO
// Affiche l'état du moteur sur les éléments du TCO et transforme
// les clics de l'élève en actions.
// ==========================================================
const TCO = (function () {
  // Éléments du TCO utilisés par chaque voie
  const CABLAGE = {
    V1: {
      reddition: 'A_B_RED', sonnerieAnnonce: 'A_B_SN1',
      annonce: 'C_B_ANN', voieLibre: 'C_V_VL', sonnerieReddition: 'C_B_SN1',
      commutateur: 'A_C_S1', voyantSemaphore: 'A_V_S1', voyantAnnonce: 'T_V_AN1',
      zoneA: ['T_V_Z1', 'T_V_Z1B'], zoneB: ['T_V_Z3'],
      voletApproche: 'E_V_ZAP1', voletEap: 'E_V_EAP1', voletZone: 'E_V_Z1',
      voletCarre: 'E_V_C1', voyantCarre: 'T_V_C1',
      saatAnnonce: 'SAAT_AN1', saatCarre: 'SAAT_C1',
    },
    V2: {
      reddition: 'C_B_RED', sonnerieAnnonce: 'C_B_SN2',
      annonce: 'A_B_ANN', voieLibre: 'A_V_VL', sonnerieReddition: 'A_B_SN2',
      commutateur: 'C_C_S2', voyantSemaphore: 'C_V_S2', voyantAnnonce: 'T_V_AN2',
      zoneA: ['T_V_Z2', 'T_V_Z2B'], zoneB: ['T_V_Z4'],
      voletApproche: 'E_V_ZAP2', voletEap: 'E_V_EAP2', voletZone: 'E_V_Z2',
      voletCarre: 'E_V_C2', voyantCarre: 'T_V_C2',
      saatAnnonce: 'SAAT_AN2', saatCarre: 'SAAT_C2',
    },
  };

  const el = (id) => document.getElementById(id);
  const allumer = (id, couleur) => { el(id).dataset.etat = couleur || ''; };

  // Voyant électromécanique : le volet rouge tombe ou remonte, avec un clic
  let premierAffichage = true;
  function basculer(id, rouge) {
    const e = el(id);
    const voulu = rouge ? 'rouge' : '';
    if ((e.dataset.etat || '') === voulu) return;
    e.dataset.etat = voulu;
    if (!premierAffichage) Sonnerie.clic();
  }

  function afficher(etat) {
    let sonneAnnonce = false;
    let sonneReddition = false;

    Object.entries(CABLAGE).forEach(([voie, c]) => {
      const v = etat.voies[voie];
      // Gare hors service : les appareils de block de Bravo sont hors circuit, voyants éteints
      const hs = etat.gare === 'HS';
      allumer(c.reddition, !hs && v.annonceRecue && 'jaune');
      allumer(c.sonnerieAnnonce, v.sonnerieAnnonce && 'blanc');
      // L'anneau de l'action simultanée n'apparaît que si une reddition est possible :
      // train annoncé et passé chez nous. Sinon un simple appui arrête la sonnerie.
      el(c.sonnerieAnnonce).classList.toggle('reddition-possible', v.annonceRecue && v.sema.bloque);
      allumer(c.annonce, !hs && v.annonceEmise && 'rouge');
      allumer(c.voieLibre, !hs && !v.annonceEmise && 'blanc');
      allumer(c.sonnerieReddition, v.sonnerieReddition && 'blanc');
      // Occupation par les trains : annonce, zone d'approche, zones, SAAT
      const o = Moteur.occupation(etat, voie);
      // Un gong appuie l'allumage du voyant d'annonce
      if (o.annonce && !el(c.voyantAnnonce).dataset.etat && !premierAffichage) Sonnerie.gong();
      allumer(c.voyantAnnonce, o.annonce && 'jaune');
      basculer(c.voletApproche, o.approche);
      basculer(c.voletEap, o.eap);
      basculer(c.voletCarre, v.carre.ferme);
      allumer(c.voyantCarre, v.carre.ferme && 'rouge');
      basculer(c.voletZone, o.zoneA);
      c.zoneA.forEach((id) => allumer(id, o.zoneA && 'rouge'));
      c.zoneB.forEach((id) => allumer(id, o.zoneB && 'rouge'));
      el(c.saatAnnonce).querySelector('text').textContent = o.saatAnnonce;
      el(c.saatCarre).querySelector('text').textContent = o.saatCarre;
      // Le voyant contrôle l'état réel du sémaphore ; le TPL ne suit que sa manette
      allumer(c.voyantSemaphore, !v.sema.ouvert && 'rouge');
      el(c.commutateur).dataset.pos = v.sema.manette;
      allumer(c.commutateur, v.sema.manette === 'ferme' && 'rouge');
      sonneAnnonce = sonneAnnonce || v.sonnerieAnnonce;
      sonneReddition = sonneReddition || v.sonnerieReddition;
    });

    el('T_C_AUE').dataset.pos = etat.auE;
    allumer('T_C_AUE', etat.auE === 'I' && 'rouge');
    el('E_B_VCM1').dataset.pos = etat.vcm[1];
    el('E_B_VCM2').dataset.pos = etat.vcm[2];
    el('CONS_C_GARE').dataset.pos = etat.gare;
    allumer('CONS_C_GARE', etat.gare === 'HS' && 'blanc');

    Sonnerie.regler({ annonce: sonneAnnonce, reddition: sonneReddition });
    premierAffichage = false;
  }

  // Durée pendant laquelle un bouton relâché reste considéré comme appuyé :
  // permet l'action « simultanée » à la souris (Sonnerie puis Reddition).
  const MAINTIEN_MS = 3000;

  // Message bref en haut de l'écran (fonctions à venir, commutateur de gare...)
  let minuterieToast;
  function toast(message, duree = 3500) {
    const t = el('toast');
    t.textContent = message;
    t.classList.add('visible');
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => t.classList.remove('visible'), duree);
  }

  // Horloge du poste : heure réelle
  function demarrerHorloge() {
    const maj = () => { el('horloge-texte').textContent = new Date().toLocaleTimeString('fr-FR'); };
    maj();
    setInterval(maj, 1000);
  }

  function brancher(moteur) {
    const clic = (id, action) => el(id).addEventListener('click', () => moteur.agir(action));
    const maintenu = {};
    const estAppuye = (id) => (maintenu[id] || 0) > Date.now();

    // Anneau autour d'un bouton : plein tant qu'il est tenu, puis il se vide
    // pendant le maintien ; il clignote pour signaler le bouton manquant.
    function ajouterAnneau(id) {
      const use = el(id).querySelector('use');
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('class', 'anneau');
      r.setAttribute('x', use.getAttribute('x') - 31);
      r.setAttribute('y', use.getAttribute('y') - 31);
      r.setAttribute('width', 62); r.setAttribute('height', 62); r.setAttribute('rx', 9);
      r.setAttribute('pathLength', 100);
      r.style.setProperty('--maintien', MAINTIEN_MS + 'ms');
      el(id).append(r);
    }
    function clignoter(id) {
      const e = el(id);
      e.classList.remove('indice');
      void e.getBoundingClientRect(); // relance l'animation
      e.classList.add('indice');
      setTimeout(() => e.classList.remove('indice'), 1500);
    }

    function appuyer(id, auContact) {
      const e = el(id);
      let minuterie;
      e.addEventListener('pointerdown', () => {
        clearTimeout(minuterie);
        maintenu[id] = Infinity;
        e.classList.remove('relache', 'indice');
        e.classList.add('appuye');
        auContact();
      });
      const relacher = () => {
        if (maintenu[id] !== Infinity) return;
        maintenu[id] = Date.now() + MAINTIEN_MS;
        e.classList.add('relache');
        minuterie = setTimeout(() => e.classList.remove('appuye', 'relache'), MAINTIEN_MS);
      };
      e.addEventListener('pointerup', relacher);
      e.addEventListener('pointerleave', relacher);
      e.addEventListener('pointercancel', relacher);
    }

    Object.entries(CABLAGE).forEach(([voie, c]) => {
      // Voie libre : action simultanée sur Sonnerie et Reddition (même colonne)
      const rendre = () => {
        const sonnerieAppuyee = estAppuye(c.sonnerieAnnonce);
        const r = moteur.lire().reglages;
        if (!sonnerieAppuyee && r.redditionAvecSonnerie && r.aideReddition) clignoter(c.sonnerieAnnonce);
        moteur.agir({ type: 'B_REDDITION', voie, sonnerieAppuyee });
      };
      ajouterAnneau(c.sonnerieAnnonce);
      appuyer(c.reddition, rendre);
      appuyer(c.sonnerieAnnonce, () => {
        moteur.agir({ type: 'B_ARRET_SONNERIE', voie, sonnerie: 'annonce' });
        if (estAppuye(c.reddition)) rendre();
      });
      clic(c.annonce, { type: 'B_ANNONCE', voie });
      clic(c.sonnerieReddition, { type: 'B_ARRET_SONNERIE', voie, sonnerie: 'reddition' });
      clic(c.commutateur, { type: 'B_SEMAPHORE', voie });
    });
    clic('T_C_AUE', { type: 'B_AU_E' });
    clic('E_B_VCM1', { type: 'B_VCM', numero: 1 });
    clic('E_B_VCM2', { type: 'B_VCM', numero: 2 });
    clic('CONS_C_GARE', { type: 'B_GARE' });
    el('BTN_LIGNE').addEventListener('click', () => Schema.ouvrirFenetre(moteur.lire()));
    demarrerHorloge();

    document.addEventListener('pointerdown', Sonnerie.deverrouiller, { once: true });
    moteur.abonner((etat, resultat, action) => {
      afficher(etat);
      if (action && action.type === 'B_GARE' && resultat) toast(resultat.message, resultat.alerte ? 9000 : 4500);
    });
  }

  return { brancher, CABLAGE };
})();
