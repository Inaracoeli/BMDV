// ==========================================================
// Simulateur BMDV — mode test du TCO (étape 1)
// Permet de vérifier le rendu : un clic fait défiler les
// états visuels d'un élément. Sera remplacé par le moteur.
// ==========================================================
(function () {
  const ETATS_LUMINEUX = ['', 'blanc', 'jaune', 'rouge', 'bleu', 'vert'];
  const POSITIONS = {
    commut: (el) => (el.id === 'T_C_AUE' ? ['A', 'I'] : ['ferme', 'ouvert']),
    vcm: () => ['F', 'O'],
  };

  const modeTest = document.getElementById('mode-test');
  const info = document.getElementById('info-element');

  function suivant(liste, actuel) {
    const i = liste.indexOf(actuel || '');
    return liste[(i + 1) % liste.length];
  }

  document.querySelectorAll('svg [id]').forEach((el) => {
    const cible = el.matches('.btn, .lamp, .zone, .tile, .commut, .bulletin, .saat, [id^="E_B_CL"]');
    if (!cible) return;

    el.addEventListener('mouseenter', () => { info.textContent = el.id; });

    el.addEventListener('click', () => {
      info.textContent = el.id;
      if (!modeTest.checked) return;

      if (el.classList.contains('commut')) {
        el.dataset.pos = suivant(POSITIONS.commut(el), el.dataset.pos);
      } else if (el.id.startsWith('E_B_VCM')) {
        el.dataset.pos = suivant(POSITIONS.vcm(), el.dataset.pos);
        el.querySelector('circle').setAttribute('cx', el.dataset.pos === 'O'
          ? +el.querySelector('rect').getAttribute('x') + 34
          : +el.querySelector('rect').getAttribute('x') + 12);
      } else if (el.classList.contains('bulletin')) {
        el.dataset.etat = el.dataset.etat === 'actif' ? '' : 'actif';
      } else if (el.classList.contains('saat')) {
        const t = el.querySelector('text');
        t.textContent = t.textContent ? '' : '123456';
      } else {
        el.dataset.etat = suivant(ETATS_LUMINEUX, el.dataset.etat);
      }
    });
  });
})();
