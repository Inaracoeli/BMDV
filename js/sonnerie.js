// ==========================================================
// Y-TECH — sonneries du block
// Sonnerie électromécanique : un marteau frappe très vite un
// timbre métallique. Le son est synthétisé (aucun fichier audio) :
// une rafale de frappes, chacune faite de partiels inharmoniques
// amortis et d'un petit choc, mise en boucle sans raccord audible.
// ==========================================================
const Sonnerie = (function () {
  const TIMBRES = {
    annonce:   { fondamentale: 2050, cadence: 26 },
    reddition: { fondamentale: 1560, cadence: 23 },
  };
  // Rapports de fréquence et niveaux des partiels d'un timbre en métal
  const PARTIELS = [[1, 1], [2.76, 0.65], [5.4, 0.45], [8.93, 0.25]];

  let ctx = null;
  const tampons = {};
  const enCours = {};

  function contexte() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function fabriquer(nom) {
    const { fondamentale, cadence } = TIMBRES[nom];
    const sr = ctx.sampleRate;
    const frappes = cadence * 2;                 // boucle de 2 secondes
    const n = Math.round((frappes / cadence) * sr);
    const tampon = ctx.createBuffer(1, n, sr);
    const d = tampon.getChannelData(0);
    const queue = Math.round(0.45 * sr);         // durée de résonance d'une frappe
    let graine = 12345;
    const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);

    for (let k = 0; k < frappes; k++) {
      const debut = Math.round((k / cadence) * sr);
      const force = 0.75 + 0.25 * alea();
      for (let i = 0; i < queue; i++) {
        const t = i / sr;
        let s = 0;
        for (const [rapport, niveau] of PARTIELS) {
          const f = fondamentale * rapport;
          if (f > sr * 0.45) continue;
          s += niveau * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (7 + rapport * 4));
        }
        if (t < 0.003) s += (alea() * 2 - 1) * 0.8 * (1 - t / 0.003); // choc du marteau
        d[(debut + i) % n] += s * force;
      }
    }
    let max = 0;
    for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(d[i]));
    for (let i = 0; i < n; i++) d[i] *= 0.9 / max;
    return tampon;
  }

  function demarrer(nom) {
    if (enCours[nom]) return;
    contexte();
    if (!tampons[nom]) tampons[nom] = fabriquer(nom);
    const source = ctx.createBufferSource();
    source.buffer = tampons[nom];
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    source.connect(gain).connect(ctx.destination);
    source.start();
    enCours[nom] = { source, gain };
  }

  function arreter(nom) {
    const s = enCours[nom];
    if (!s) return;
    delete enCours[nom];
    // Le timbre continue de résonner un court instant après la dernière frappe
    s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
    s.source.stop(ctx.currentTime + 0.4);
  }

  // Clic sec d'un voyant électromécanique qui bascule
  let tamponClic = null;
  function clic() {
    try {
      contexte();
      if (!tamponClic) {
        const sr = ctx.sampleRate;
        const n = Math.round(0.07 * sr);
        tamponClic = ctx.createBuffer(1, n, sr);
        const d = tamponClic.getChannelData(0);
        let precedent = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const bruit = Math.random() * 2 - 1;
          const sec = (bruit - precedent) * Math.exp(-t * 320);                 // claquement
          const sourd = Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t * 70);    // corps du relais
          precedent = bruit;
          d[i] = 0.7 * sec + 0.6 * sourd;
        }
      }
      const source = ctx.createBufferSource();
      source.buffer = tamponClic;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch (e) { /* pas de son disponible */ }
  }

  // Gong d'annonce : aigu et bref, à l'entrée d'un train en zone d'annonce
  let tamponGong = null;
  function gong() {
    try {
      contexte();
      if (!tamponGong) {
        const sr = ctx.sampleRate;
        const n = Math.round(0.9 * sr);
        tamponGong = ctx.createBuffer(1, n, sr);
        const d = tamponGong.getChannelData(0);
        const partiels = [[1320, 1, 6], [2640, 0.35, 9], [3565, 0.3, 11], [5410, 0.15, 16]];
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          let s = 0;
          for (const [f, niveau, amorti] of partiels) s += niveau * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * amorti);
          d[i] = 0.5 * s * Math.min(1, t / 0.002);
        }
      }
      const source = ctx.createBufferSource();
      source.buffer = tamponGong;
      const gain = ctx.createGain();
      gain.gain.value = 0.45;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch (e) { /* pas de son disponible */ }
  }

  // Freinage d'urgence puis choc : crissement des roues sur le rail (~2,6 s), puis impact et ferraille
  function freinage() {
    try {
      contexte();
      const sr = ctx.sampleRate;
      const duree = 4.2;
      const choc = 2.6; // instant du choc
      const n = Math.round(duree * sr);
      const b = ctx.createBuffer(2, n, sr);
      const g = b.getChannelData(0);
      const dr = b.getChannelData(1);
      let bruit = 0;
      let phase1 = 0;
      let phase2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        bruit = 0.75 * bruit + 0.25 * (Math.random() * 2 - 1);
        let s = 0;
        if (t < choc) {
          // Crissement : deux sifflements aigus qui glissent et tremblent, sur un souffle de freinage
          const env = Math.min(1, t / 0.15) * (0.6 + 0.4 * Math.sin(t * 7) ** 2);
          phase1 += 2 * Math.PI * (3100 - 500 * (t / choc) + 140 * Math.sin(t * 23)) / sr;
          phase2 += 2 * Math.PI * (4650 - 700 * (t / choc) + 220 * Math.sin(t * 31)) / sr;
          s = env * (0.32 * Math.sin(phase1) + 0.16 * Math.sin(phase2)) + 0.18 * bruit * Math.min(1, t / 0.4);
        } else {
          const u = t - choc;
          const sourd = Math.sin(2 * Math.PI * (48 - 18 * u) * u) * Math.exp(-u * 3.5) * 1.4;
          const ferraille = (Math.random() * 2 - 1) * Math.exp(-u * 2.4) * (0.45 + 0.55 * Math.sin(u * 41) ** 2);
          s = (sourd + ferraille) * Math.min(1, u / 0.002);
        }
        s = Math.max(-1, Math.min(1, s));
        g[i] = s;
        dr[i] = t < choc ? s * (0.85 + 0.15 * Math.sin(t * 3)) : s;
      }
      const source = ctx.createBufferSource();
      source.buffer = b;
      const gain = ctx.createGain();
      gain.gain.value = 0.7;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch (e) { /* pas de son disponible */ }
  }

  return {
    clic,
    gong,
    freinage,
    // regler({ annonce: true|false, reddition: true|false })
    regler(voulu) {
      Object.keys(TIMBRES).forEach((nom) => (voulu[nom] ? demarrer(nom) : arreter(nom)));
    },
    // Les navigateurs n'autorisent le son qu'après une première action de l'utilisateur
    deverrouiller: () => { try { contexte(); } catch (e) { /* pas de son disponible */ } },
  };
})();
