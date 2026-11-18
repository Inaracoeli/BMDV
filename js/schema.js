// ==========================================================
// Y-TECH — schéma simplifié de la ligne, avec les PK
// Dessiné à partir de la géométrie du moteur : il suit les longueurs
// réglées par le formateur. L'échelle n'est pas linéaire (les sections
// longues sont resserrées) pour que la gare reste lisible.
// Option trains : affiche la position des trains (écran formateur).
// ==========================================================
const Schema = (function () {
  const COULEURS = {
    ligne: '#7d8288', annonce: '#e9c552', approche: '#e8913a', signalZone: '#9aa0a6',
    zone: '#5e7fa3', quai: '#d8d4c2', train: '#b3261e',
  };
  const Y1 = 128;   // voie 1
  const Y2 = 292;   // voie 2
  const EP = 12;    // épaisseur d'une section

  function svg(etat, options = {}) {
    const g1 = Moteur.geometrie(etat, 'V1');
    const g2 = Moteur.geometrie(etat, 'V2');
    const pk = Moteur.formatPK;

    // Repères de chaque voie, en PK
    const reperes = (g) => [0, g.debutAnnonce, g.debutZap, g.signal, g.debutZoneA, g.aiguille, g.finZoneB, g.fin].map(g.pk);
    const tous = [...new Set([...reperes(g1), ...reperes(g2)].map(Math.round))].sort((a, b) => a - b);

    // Échelle par morceaux : chaque intervalle reçoit une largeur croissant avec le logarithme de sa longueur
    const MARGE = 92;
    const xs = [MARGE];
    for (let i = 1; i < tous.length; i++) xs.push(xs[i - 1] + 26 + 30 * Math.log(1 + (tous[i] - tous[i - 1]) / 60));
    const largeur = xs[xs.length - 1] + MARGE;
    const X = (p) => {
      if (p <= tous[0]) return xs[0];
      for (let i = 1; i < tous.length; i++) {
        if (p <= tous[i]) return xs[i - 1] + ((p - tous[i - 1]) / (tous[i] - tous[i - 1])) * (xs[i] - xs[i - 1]);
      }
      return xs[xs.length - 1];
    };

    const morceaux = [];
    const rect = (pa, pb, y, couleur) => {
      const xa = X(Math.min(pa, pb));
      const xb = X(Math.max(pa, pb));
      morceaux.push(`<rect x="${xa.toFixed(1)}" y="${y - EP / 2}" width="${Math.max(0, xb - xa).toFixed(1)}" height="${EP}" fill="${couleur}"/>`);
      return (xa + xb) / 2;
    };
    const texte = (x, y, t, classe = '', extra = '') => morceaux.push(`<text x="${x.toFixed(1)}" y="${y}" class="${classe}" ${extra}>${t}</text>`);

    // ---------- Gare de Bravo : cadre et quais ----------
    const gareA = X(Math.min(g1.pk(g1.signal), g2.pk(g2.finZoneB))) - 14;
    const gareB = X(Math.max(g1.pk(g1.finZoneB), g2.pk(g2.signal))) + 14;
    morceaux.push(`<rect x="${gareA}" y="${Y1 - 58}" width="${gareB - gareA}" height="${Y2 - Y1 + 116}" rx="8" class="cadre-gare"/>`);
    texte((gareA + gareB) / 2, Y1 - 64, 'BRAVO', 'nom-gare');
    const q1a = X(g1.pk(g1.quaiDebut));
    const q1b = X(g1.pk(g1.quaiFin));
    morceaux.push(`<rect x="${q1a}" y="${Y1 - 30}" width="${q1b - q1a}" height="12" fill="${COULEURS.quai}" stroke="#8a8676"/>`);
    texte((q1a + q1b) / 2, Y1 - 34, `Quai V1 · ${etat.ligne.V1.quaiLongueur} m`, 'petit');
    const q2a = X(g2.pk(g2.quaiFin));
    const q2b = X(g2.pk(g2.quaiDebut));
    morceaux.push(`<rect x="${q2a}" y="${Y2 + 18}" width="${q2b - q2a}" height="12" fill="${COULEURS.quai}" stroke="#8a8676"/>`);
    texte((q2a + q2b) / 2, Y2 + 44, `Quai V2 · ${etat.ligne.V2.quaiLongueur} m`, 'petit');

    // ---------- Sections de chaque voie ----------
    const voie = (g, y, za, zb) => {
      rect(g.pk(0), g.pk(g.debutAnnonce), y, COULEURS.ligne);
      texte(rect(g.pk(g.debutAnnonce), g.pk(g.debutZap), y, COULEURS.annonce), y + 4, "zone d'annonce", 'dans');
      texte(rect(g.pk(g.debutZap), g.pk(g.signal), y, COULEURS.approche), y + 4, 'ZAP', 'dans');
      rect(g.pk(g.signal), g.pk(g.debutZoneA), y, COULEURS.signalZone);
      texte(rect(g.pk(g.debutZoneA), g.pk(g.aiguille), y, COULEURS.zone), y + 4, za, 'dans clair');
      texte(rect(g.pk(g.aiguille), g.pk(g.finZoneB), y, COULEURS.zone), y + 4, zb, 'dans clair');
      rect(g.pk(g.finZoneB), g.pk(g.fin), y, COULEURS.ligne);
    };
    voie(g1, Y1, 'z1', 'z3');
    voie(g2, Y2, 'z2', 'z4');
    // Séparations entre zones de gare
    [[g1, Y1, [g1.debutZoneA, g1.aiguille, g1.finZoneB]], [g2, Y2, [g2.debutZoneA, g2.aiguille, g2.finZoneB]]].forEach(([g, y, xs2]) => {
      xs2.forEach((x) => morceaux.push(`<line x1="${X(g.pk(x))}" y1="${y - EP / 2}" x2="${X(g.pk(x))}" y2="${y + EP / 2}" stroke="#fff" stroke-width="2"/>`));
    });

    // ---------- Communication E – F ----------
    const xE = X(g1.pk(g1.aiguille));
    const xF = X(g2.pk(g2.aiguille));
    morceaux.push(`<line x1="${xE}" y1="${Y1}" x2="${xF}" y2="${Y2}" stroke="${COULEURS.ligne}" stroke-width="6"/>`);
    morceaux.push(`<circle cx="${xE}" cy="${Y1 - 24}" r="11" class="rond-aiguille"/>`);
    texte(xE, Y1 - 19, 'E', 'lettre-aiguille');
    morceaux.push(`<circle cx="${xF + 16}" cy="${Y2 + 24}" r="11" class="rond-aiguille"/>`);
    texte(xF + 16, Y2 + 29, 'F', 'lettre-aiguille');

    // ---------- Signaux ----------
    const signal = (x, y, haut, nom) => {
      const d = haut ? -1 : 1;
      morceaux.push(`<line x1="${x}" y1="${y + d * 8}" x2="${x}" y2="${y + d * 26}" stroke="#2b2f33" stroke-width="2"/>`);
      morceaux.push(`<circle cx="${x}" cy="${y + d * 31}" r="6" fill="#d0281c" stroke="#2b2f33" stroke-width="1.5"/>`);
      texte(x, y + d * (haut ? 42 : 50), nom, 'signal');
    };
    signal(X(g1.pk(g1.signal)), Y1, true, 'C1 / S1');
    signal(X(g2.pk(g2.signal)), Y2, false, 'C2 / S2');

    // ---------- Gares extrêmes et sens ----------
    texte(X(etat.ligne.pkAlfa) - 14, Y1 - 64, 'ALFA', 'nom-gare', 'style="text-anchor:end"');
    texte(X(etat.ligne.pkAlfa) - 14, Y1 - 48, `PK ${pk(etat.ligne.pkAlfa)}`, 'petit', 'style="text-anchor:end"');
    const pkCharlie = g1.pk(g1.fin);
    texte(X(pkCharlie) + 14, Y1 - 64, 'CHARLIE', 'nom-gare', 'style="text-anchor:start"');
    texte(X(pkCharlie) + 14, Y1 - 48, `PK ${pk(pkCharlie)}`, 'petit', 'style="text-anchor:start"');
    texte(xs[0] - 10, Y1 + 5, 'V1 →', 'nom-voie', 'style="text-anchor:end"');
    texte(xs[0] - 10, Y2 + 5, '← V2', 'nom-voie', 'style="text-anchor:end"');
    texte(xs[xs.length - 1] + 10, Y1 + 5, 'sens impair', 'petit', 'style="text-anchor:start"');
    texte(xs[xs.length - 1] + 10, Y2 + 5, 'sens pair', 'petit', 'style="text-anchor:start"');

    // ---------- PK des repères (verticaux, au-dessus de V1 et sous V2) ----------
    // Un PK commun aux deux voies est écrit une fois, au milieu ; sinon près de sa voie
    const pkV = (g) => [g.debutAnnonce, g.debutZap, g.signal, g.debutZoneA, g.aiguille, g.finZoneB].map((x) => Math.round(g.pk(x)));
    const p1 = pkV(g1);
    const p2 = pkV(g2);
    const ecrire = (p, yt) => {
      const xp = X(p);
      morceaux.push(`<text x="${xp}" y="${yt}" class="pk" transform="rotate(-90 ${xp} ${yt})">${pk(p)}</text>`);
    };
    const milieu = (Y1 + Y2) / 2;
    [...new Set([...p1, ...p2])].forEach((p) => {
      const xp = X(p);
      const sur1 = p1.includes(p);
      const sur2 = p2.includes(p);
      if (sur1) morceaux.push(`<line x1="${xp}" y1="${Y1 + EP / 2}" x2="${xp}" y2="${Y1 + 14}" class="graduation"/>`);
      if (sur2) morceaux.push(`<line x1="${xp}" y1="${Y2 - EP / 2}" x2="${xp}" y2="${Y2 - 14}" class="graduation"/>`);
      if (sur1 && sur2) ecrire(p, milieu + 26);
      else if (sur1) ecrire(p, Y1 + 70);
      else ecrire(p, Y2 - 18);
    });

    // ---------- Trains ----------
    if (options.trains) {
      etat.trains.filter((t) => !t.attenteDepart).forEach((t) => {
        const g = t.voie === 'V1' ? g1 : g2;
        const y = t.voie === 'V1' ? Y1 : Y2;
        const xa = X(g.pk(t.s));
        const xb = X(g.pk(t.s - t.longueur));
        const x0 = Math.min(xa, xb);
        const l = Math.max(5, Math.abs(xa - xb));
        morceaux.push(`<rect x="${x0}" y="${y - 9}" width="${l}" height="18" rx="4" fill="${COULEURS.train}" stroke="#fff" stroke-width="1.5"/>`);
        texte(xa, t.voie === 'V1' ? y - 14 : y + 24, t.numero, 'numero-train');
      });
    }

    // ---------- Légende ----------
    const ly = Y2 + 84;
    let lx = MARGE;
    [['ligne', 'Pleine ligne'], ['annonce', "Zone d'annonce"], ['approche', "Zone d'approche (ZAP)"], ['zone', 'Zones de gare'], ['quai', 'Quai']]
      .forEach(([c, t]) => {
        morceaux.push(`<rect x="${lx}" y="${ly - 9}" width="22" height="11" fill="${COULEURS[c]}"/>`);
        texte(lx + 28, ly, t, 'legende', 'style="text-anchor:start"');
        lx += 36 + t.length * 7.2;
      });
    if (options.trains) {
      morceaux.push(`<rect x="${lx}" y="${ly - 9}" width="22" height="11" rx="3" fill="${COULEURS.train}"/>`);
      texte(lx + 28, ly, 'Train', 'legende', 'style="text-anchor:start"');
    }
    texte(largeur - 16, ly, 'Échelle non linéaire', 'legende discret', 'style="text-anchor:end"');

    return `<svg class="schema-ligne" viewBox="0 0 ${largeur.toFixed(0)} ${ly + 16}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .schema-ligne text { font-family: Arial, Helvetica, sans-serif; fill: #2b2f33; text-anchor: middle; }
        .schema-ligne .dans { font-size: 10px; font-weight: 700; }
        .schema-ligne .clair { fill: #fff; }
        .schema-ligne .petit { font-size: 11px; fill: #55595e; }
        .schema-ligne .nom-gare { font-size: 15px; font-weight: 700; letter-spacing: 2px; }
        .schema-ligne .nom-voie { font-size: 14px; font-weight: 700; }
        .schema-ligne .signal { font-size: 11px; font-weight: 700; }
        .schema-ligne .pk { font-size: 10.5px; fill: #3a3e43; text-anchor: start; dominant-baseline: middle; }
        .schema-ligne .graduation { stroke: #55595e; stroke-width: 1; }
        .schema-ligne .lettre-aiguille { font-size: 13px; font-weight: 700; fill: #c4620a; }
        .schema-ligne .rond-aiguille { fill: #fbf9ec; stroke: #e8891c; stroke-width: 2; }
        .schema-ligne .cadre-gare { fill: rgba(217, 115, 13, .06); stroke: #d9730d; stroke-width: 1.5; stroke-dasharray: 6 4; }
        .schema-ligne .numero-train { font-size: 12px; font-weight: 700; fill: #b3261e; }
        .schema-ligne .legende { font-size: 12px; }
        .schema-ligne .discret { fill: #8a8d92; font-style: italic; }
      </style>
      ${morceaux.join('\n      ')}
    </svg>`;
  }

  // Fenêtre du TCO : schéma sans les trains (l'aiguilleur ne voit pas les trains en ligne)
  function ouvrirFenetre(etat) {
    let fenetre = document.getElementById('fenetre-ligne');
    if (!fenetre) {
      fenetre = document.createElement('dialog');
      fenetre.id = 'fenetre-ligne';
      fenetre.className = 'fenetre';
      fenetre.innerHTML = `
        <header><h1>Schéma de la ligne <small>Alfa · Bravo · Charlie</small></h1>
          <button class="fermer" aria-label="Fermer le schéma">✕</button></header>
        <div class="contenu"></div>`;
      document.body.append(fenetre);
      fenetre.querySelector('.fermer').addEventListener('click', () => fenetre.close());
      fenetre.addEventListener('click', (e) => { if (e.target === fenetre) fenetre.close(); });
    }
    fenetre.querySelector('.contenu').innerHTML = svg(etat);
    fenetre.showModal();
  }

  return { svg, ouvrirFenetre };
})();
