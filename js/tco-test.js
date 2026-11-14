// ==========================================================
// Simulateur BMDV — mode test du TCO (étape 1)
// Permet de vérifier le rendu : un clic fait défiler les
// états visuels d'un élément. Sera remplacé par le moteur.
// ==========================================================
(function () {
  const ETATS_LUMINEUX = ['', 'blanc', 'jaune', 'rouge', 'bleu', 'vert'];

  const modeTest = document.getElementById('mode-test');
  const info = document.getElementById('info-element');

  function suivant(liste, actuel) {
    const i = liste.indexOf(actuel || '');
    return liste[(i + 1) % liste.length];
  }

  document.querySelectorAll('svg [id]').forEach((el) => {
    const cible = el.matches('.btn, .lamp, .zone, .tile, .commut, .vcm, .bulletin, .saat, [id^="E_B_CL"]');
    if (!cible) return;

    el.addEventListener('mouseenter', () => { info.textContent = el.id; });

    el.addEventListener('click', () => {
      info.textContent = el.id;
      if (!modeTest.checked) return;

      if (el.classList.contains('commut')) {
        // TPL : allumé au rouge en position fermé (sémaphores) ou I (Au E)
        const auE = el.id === 'T_C_AUE';
        el.dataset.pos = suivant(auE ? ['A', 'I'] : ['ferme', 'ouvert'], el.dataset.pos);
        const actif = el.dataset.pos === (auE ? 'I' : 'ferme');
        el.dataset.etat = actif ? 'rouge' : '';
      } else if (el.classList.contains('vcm')) {
        el.dataset.pos = suivant(['F', 'O'], el.dataset.pos);
      } else if (el.classList.contains('bulletin')) {
        el.dataset.etat = el.dataset.etat === 'actif' ? '' : 'actif';
      } else if (el.classList.contains('saat')) {
        const t = el.querySelector('text');
        t.textContent = t.textContent ? '' : '123456';
      } else if (el.classList.contains('zone')) {
        // z1 et z2 ont deux contrôles qui s'allument ensemble
        const etat = suivant(['', 'rouge'], el.dataset.etat);
        document.querySelectorAll(`[data-zone="${el.dataset.zone}"]`)
          .forEach((z) => { z.dataset.etat = etat; });
      } else {
        el.dataset.etat = suivant(ETATS_LUMINEUX, el.dataset.etat);
      }
    });
  });
})();
