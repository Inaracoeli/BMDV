// ==========================================================
// Simulateur BMDV — panneau formateur PROVISOIRE (étape 2)
// Permet de jouer Alfa, Charlie et le train depuis la même page
// pour tester le moteur. Sera remplacé par l'écran formateur.
// ==========================================================
(function () {
  const moteur = Moteur.creer();
  TCO.brancher(moteur);
  window.moteur = moteur; // pratique pour le débogage dans la console

  const panneau = document.getElementById('panneau-provisoire');
  const journal = document.getElementById('journal');

  const ENCLENCHEMENTS = {
    blocageSemaphore: 'Blocage du sémaphore',
    redditionSemaphoreBloque: 'Reddition : sémaphore bloqué exigé',
    redditionAnnonceAvantArrivee: 'Reddition : annonce avant arrivée exigée',
  };

  function bouton(texte, action) {
    const b = document.createElement('button');
    b.textContent = texte;
    b.addEventListener('click', () => moteur.agir(action));
    return b;
  }

  const lignes = {};
  ['V1', 'V2'].forEach((voie) => {
    const { amont, aval } = Moteur.POSTES[voie];
    const ligne = document.createElement('div');
    ligne.className = 'ligne';
    const titre = document.createElement('strong');
    titre.textContent = `${voie} · ${amont} → Bravo → ${aval}`;
    const etatAmont = document.createElement('span');
    const etatAval = document.createElement('span');
    ligne.append(
      titre,
      bouton(`${amont} annonce`, { type: 'AMONT_ANNONCE', voie }),
      bouton('Train en approche', { type: 'TRAIN_APPROCHE', voie }),
      bouton('Train franchit le sémaphore', { type: 'TRAIN_PEDALE', voie }),
      bouton(`${aval} rend voie libre`, { type: 'AVAL_REDDITION', voie }),
      etatAmont, etatAval,
    );
    panneau.querySelector('.voies').append(ligne);
    lignes[voie] = { etatAmont, etatAval, amont, aval };
  });

  const zoneEncl = panneau.querySelector('.enclenchements');
  const cases = {};
  Object.entries(ENCLENCHEMENTS).forEach(([nom, libelle]) => {
    const label = document.createElement('label');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.addEventListener('change', () => moteur.agir({ type: 'ENCLENCHEMENT', nom, actif: c.checked }));
    label.append(c, ' ' + libelle);
    zoneEncl.append(label);
    cases[nom] = c;
  });
  zoneEncl.append(bouton('Réinitialiser', { type: 'REINITIALISER' }));

  moteur.abonner((etat, resultat) => {
    Object.entries(lignes).forEach(([voie, l]) => {
      const v = etat.voies[voie];
      l.etatAmont.textContent = `${l.amont} : ${v.annonceRecue ? 'annonce rouge, VL éteint' : 'VL allumé'}`;
      l.etatAval.textContent = `${l.aval} : ${v.annonceEmise ? 'reddition jaune (train annoncé)' : 'rien reçu'}`;
    });
    Object.entries(cases).forEach(([nom, c]) => { c.checked = etat.enclenchements[nom]; });
    if (resultat) {
      journal.textContent = resultat.message;
      journal.className = resultat.ok ? '' : 'sans-effet';
    }
  });
})();
