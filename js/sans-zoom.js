// ==========================================================
// Y-TECH — pas de zoom : l'écran reste cadré comme une appli
// (le viewport l'interdit déjà ; Safari iOS l'ignore, d'où ces garde-fous)
// ==========================================================
(function () {
  const bloquer = (e) => e.preventDefault();
  // Pincement sur iPhone / iPad
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, bloquer, { passive: false }));
  // Pincement à deux doigts (navigateurs tactiles)
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // Double toucher rapide
  let dernier = 0;
  document.addEventListener('touchend', (e) => {
    const maintenant = Date.now();
    if (maintenant - dernier < 300 && !e.target.closest('input, textarea, select')) e.preventDefault();
    dernier = maintenant;
  }, { passive: false });
  // Ctrl + molette ou pincement du pavé tactile, Ctrl + / Ctrl - au clavier
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
  });
})();
