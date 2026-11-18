// ==========================================================
// Y-TECH — lecteur de QR code intégré à l'écran formateur
// Ouvre la caméra arrière, lit le QR code affiché sur le PC et
// rejoint la séance. Lecture par le navigateur (BarcodeDetector)
// quand il sait faire, sinon par jsQR (Apache 2.0), chargé à la demande.
// ==========================================================
const Scanner = (function () {
  let flux = null;
  let boucle = null;
  let detecteur = null;

  const fenetre = document.createElement('div');
  fenetre.id = 'scanner';
  fenetre.hidden = true;
  fenetre.innerHTML = `
    <video playsinline muted></video>
    <div class="viseur" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="ligne"></span></div>
    <p class="consigne-scan">Vise le QR code affiché sur le PC</p>
    <p class="erreur-scan" role="alert"></p>
    <button type="button" class="fermer-scan">Annuler</button>`;
  document.body.append(fenetre);
  const video = fenetre.querySelector('video');
  const erreur = fenetre.querySelector('.erreur-scan');
  const toile = document.createElement('canvas');
  const ctx = toile.getContext('2d', { willReadFrequently: true });

  function chargerJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jsQR.js';
      s.onload = ok;
      s.onerror = ko;
      document.head.append(s);
    });
  }

  function arreter() {
    clearTimeout(boucle);
    boucle = null;
    if (flux) flux.getTracks().forEach((t) => t.stop());
    flux = null;
    video.srcObject = null;
    fenetre.hidden = true;
  }
  fenetre.querySelector('.fermer-scan').addEventListener('click', arreter);

  async function lire() {
    if (video.readyState < 2) return null;
    if (detecteur) {
      const codes = await detecteur.detect(video).catch(() => []);
      return codes.length ? codes[0].rawValue : null;
    }
    const l = video.videoWidth;
    const h = video.videoHeight;
    if (!l || !h) return null;
    const echelle = Math.min(1, 640 / Math.max(l, h));
    toile.width = Math.round(l * echelle);
    toile.height = Math.round(h * echelle);
    ctx.drawImage(video, 0, 0, toile.width, toile.height);
    const image = ctx.getImageData(0, 0, toile.width, toile.height);
    const r = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  }

  // Le QR code porte l'adresse …/formateur.html#s=CODE ; un code seul est aussi accepté
  function codeDe(texte) {
    const m = /[#&?]s=([0-9A-Za-z-]+)/.exec(texte) || /^([0-9A-Za-z-]{12,14})$/.exec(String(texte).trim());
    if (!m) return null;
    const c = Liaison.normaliser(m[1]);
    return Liaison.codeValide(c) ? c : null;
  }

  async function ouvrir(surCode) {
    erreur.textContent = '';
    fenetre.hidden = false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      erreur.textContent = 'Caméra indisponible dans ce navigateur : utilise l\'appareil photo ou saisis le code.';
      return;
    }
    try {
      if ('BarcodeDetector' in window) {
        const formats = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
        if (formats.includes('qr_code')) detecteur = new window.BarcodeDetector({ formats: ['qr_code'] });
      }
      if (!detecteur) await chargerJsQR();
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = flux;
      await video.play();
    } catch (e) {
      erreur.textContent = e && e.name === 'NotAllowedError'
        ? 'Accès à la caméra refusé : autorise-le dans les réglages du navigateur, ou saisis le code.'
        : 'Impossible d\'ouvrir la caméra : saisis le code affiché sur le PC.';
      return;
    }
    const tour = async () => {
      if (!flux) return;
      const texte = await lire();
      const code = texte && codeDe(texte);
      if (code) {
        if (navigator.vibrate) navigator.vibrate(60);
        arreter();
        surCode(code);
        return;
      }
      if (texte) erreur.textContent = 'Ce QR code n\'est pas une séance Y-TECH.';
      boucle = setTimeout(tour, 180);
    };
    tour();
  }

  return { ouvrir, arreter, codeDe };
})();
