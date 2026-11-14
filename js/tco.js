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
    },
    V2: {
      reddition: 'C_B_RED', sonnerieAnnonce: 'C_B_SN2',
      annonce: 'A_B_ANN', voieLibre: 'A_V_VL', sonnerieReddition: 'A_B_SN2',
      commutateur: 'C_C_S2', voyantSemaphore: 'C_V_S2', voyantAnnonce: 'T_V_AN2',
    },
  };

  const el = (id) => document.getElementById(id);
  const allumer = (id, couleur) => { el(id).dataset.etat = couleur || ''; };

  function afficher(etat) {
    let sonneAnnonce = false;
    let sonneReddition = false;

    Object.entries(CABLAGE).forEach(([voie, c]) => {
      const v = etat.voies[voie];
      allumer(c.reddition, v.annonceRecue && 'jaune');
      allumer(c.sonnerieAnnonce, v.sonnerieAnnonce && 'blanc');
      allumer(c.annonce, v.annonceEmise && 'rouge');
      allumer(c.voieLibre, !v.annonceEmise && 'blanc');
      allumer(c.sonnerieReddition, v.sonnerieReddition && 'blanc');
      allumer(c.voyantAnnonce, v.approche && 'jaune');
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

    Sonnerie.regler({ annonce: sonneAnnonce, reddition: sonneReddition });
  }

  // Durée pendant laquelle un bouton relâché reste considéré comme appuyé :
  // permet l'action « simultanée » à la souris (Sonnerie puis Reddition).
  const MAINTIEN_MS = 3000;

  function brancher(moteur) {
    const clic = (id, action) => el(id).addEventListener('click', () => moteur.agir(action));
    const maintenu = {};
    const estAppuye = (id) => (maintenu[id] || 0) > Date.now();

    function appuyer(id, auContact) {
      const e = el(id);
      let minuterie;
      e.addEventListener('pointerdown', () => {
        clearTimeout(minuterie);
        maintenu[id] = Infinity;
        e.classList.add('appuye');
        auContact();
      });
      const relacher = () => {
        if (maintenu[id] !== Infinity) return;
        maintenu[id] = Date.now() + MAINTIEN_MS;
        minuterie = setTimeout(() => e.classList.remove('appuye'), MAINTIEN_MS);
      };
      e.addEventListener('pointerup', relacher);
      e.addEventListener('pointerleave', relacher);
      e.addEventListener('pointercancel', relacher);
    }

    Object.entries(CABLAGE).forEach(([voie, c]) => {
      // Voie libre : action simultanée sur Sonnerie et Reddition (même colonne)
      const rendre = () => moteur.agir({ type: 'B_REDDITION', voie, sonnerieAppuyee: estAppuye(c.sonnerieAnnonce) });
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

    document.addEventListener('pointerdown', Sonnerie.deverrouiller, { once: true });
    moteur.abonner(afficher);
  }

  return { brancher, CABLAGE };
})();
