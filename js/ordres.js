// ==========================================================
// Simulateur BMDV — ordres de franchissement (bulletins C, S, MV)
// L'agent de Bravo clique sur un bulletin de la console, remplit
// le formulaire et le délivre. Le moteur remet l'ordre au train ;
// le conducteur ne franchit que si l'ordre correspond à ce qu'il
// voit. Aucun contrôle n'est affiché ici : les écarts éventuels
// apparaissent sur le tableau de bord du formateur.
// Formulaires redessinés pour le simulateur.
// ==========================================================
const Ordres = (function () {
  let moteur = null;
  const echapper = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const aujourdhui = () => new Date().toLocaleDateString('fr-FR');
  const maintenant = () => { const d = new Date(); return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`; };

  const MODELES = {
    C: { titre: 'Ordre C', in: '38', couleur: '#1f5fa8' },
    S: { titre: 'Ordre S', in: '84', couleur: '#1b1d20' },
    MV: { titre: 'Ordre MV', in: '82', couleur: '#d63a3a' },
  };

  const dialogue = document.createElement('dialog');
  dialogue.id = 'ordre';
  dialogue.className = 'fenetre';
  document.body.append(dialogue);

  // Trains visibles au SAAT, pour la liste déroulante du n° de train
  function trainsSaat(etat) {
    const liste = [];
    ['V1', 'V2'].forEach((voie) => {
      const o = Moteur.occupation(etat, voie);
      [o.saatCarre, o.saatAnnonce].forEach((n) => { if (n && !liste.some((x) => x.numero === n)) liste.push({ numero: n, voie }); });
    });
    return liste;
  }
  function suggestionsLocalisation(etat, numero) {
    const t = etat.trains.find((x) => x.numero === numero);
    if (!t) return [];
    const n = t.voie[1];
    const p = Moteur.position(etat, t);
    return [`Arrêté devant le signal C${n}, voie ${n}`, `Voie ${n}, PK ${p.pkTete}`];
  }

  const champ = (code, libelle, contenu, large) => `
    <div class="champ${large ? ' large' : ''}"><div class="saisie">${contenu}</div><div class="etiquette"><b>${code}</b> ${libelle}</div></div>`;
  const caseACocher = (nom, code, texte, suite = '') => `
    <div class="option"><label class="case"><input type="checkbox" name="${nom}"><span></span><small>${code}</small></label>
      <div class="texte">${texte}${suite}</div></div>`;

  function formulaire(type, etat) {
    const m = MODELES[type];
    const trains = trainsSaat(etat);
    const numero = String(etat.numerosOrdres[type] + 1);
    const optionsTrain = trains.map((t) => `<option value="${echapper(t.numero)}">${echapper(t.numero)} (voie ${t.voie[1]})</option>`).join('');
    const entete = `
      <div class="bande grise grille">
        ${champ('A', 'N° du train / N° de composition de manœuvre', `
          <select name="train"><option value="">—</option>${optionsTrain}<option value="__autre">Autre…</option></select>
          <input name="trainAutre" placeholder="n° du train" hidden>`)}
        ${champ('B', 'Date', `<input name="date" value="${aujourdhui()}">`)}
        ${champ('C', 'Localisation du train / de la composition de manœuvre', `<input name="localisation" list="loc-ordre"><datalist id="loc-ordre"></datalist>`)}
        ${champ('D', "Localisation de l'émetteur", '<input name="emetteur" value="Poste de Bravo">')}
      </div>`;
    const signal = (code) => `<span class="enligne"><select name="signal"><option>C1</option><option>C2</option></select><small>${code} Numéro</small></span>`;
    let corps = '';
    if (type === 'S') {
      corps = `
        <div class="bande grise">
          ${caseACocher('franchirSemaphore', '84.10', '<b>Franchir fermé le sémaphore</b> présenté par le signal n°', signal('84.11.1'))}
          ${caseACocher('signauxDistance', '84.20', 'Le conducteur doit par ailleurs <b>agir comme s\'il rencontrait fermés les signaux à distance ci-après</b>, combinés avec le sémaphore :')}
          <textarea name="texte" rows="2"></textarea><small class="code">84.21.1 [texte libre]</small>
        </div>`;
    } else if (type === 'C') {
      corps = `
        <div class="bande grise">
          ${caseACocher('franchirCarre', '38', '<b>Franchir fermé le carré</b> présenté par le signal n°', signal(''))}
          ${caseACocher('signauxDistance', '38', 'Le conducteur doit par ailleurs <b>agir comme s\'il rencontrait fermés les signaux à distance ci-après</b> :')}
          <textarea name="texte" rows="2"></textarea><small class="code">[texte libre]</small>
        </div>`;
    } else {
      corps = `
        <div class="bande grise">
          ${caseACocher('penetrer', '82.20', '<b>Pénétrer en canton occupé</b>, en franchissant s\'il y a lieu le sémaphore fermé')}
          ${caseACocher('marcheAVue', '82.40', '<b>ET MARCHER à VUE</b> jusqu\'au poste de cantonnement de :',
            '<span class="enligne"><select name="poste"><option></option><option>Alfa</option><option>Charlie</option></select><small>82.41.1 Désignation du poste</small></span>')}
          ${caseACocher('arretPoste', '82.45', '<b>ET le conducteur devra s\'arrêter à ce poste pour remettre le présent formulaire au garde</b>')}
        </div>
        <div class="bande grise">
          ${caseACocher('complement', '82.95', 'Instructions complémentaires')}
          <textarea name="texte" rows="2"></textarea><small class="code">82.96 [texte libre]</small>
        </div>`;
    }
    const pied = type === 'MV' ? `
      <div class="bande reference">Numéro de référence <span class="preimprime">${numero}</span><small>82.97 Numéro</small></div>
      <div class="bande grise grille trois">
        ${champ('Y', 'Heure', `<input name="heure" value="${maintenant()}">`)}
        ${champ('', 'Motif', '<input name="motif">', true)}
        ${champ('Z', 'Identification unique', '<span class="enligne"><select name="zPrefixe"><option value="D">D</option><option value="M">M</option></select><input name="z" placeholder="n° ou signature"></span>')}
      </div>` : `
      <div class="bande grise grille trois">
        ${champ('Y', 'Heure', `<input name="heure" value="${maintenant()}">`)}
        ${champ('', 'Motif', '<input name="motif">', true)}
        ${champ('Z', 'Identification unique', `<span class="preimprime">${numero}</span>`)}
      </div>`;
    return `
      <form method="dialog" class="formulaire" style="--couleur:${m.couleur}">
        <div class="titre-ordre"><h2>Ordre <span>${type}</span></h2><em>Instruction nationale ${m.in}</em></div>
        ${entete}${corps}
        <div class="croix">${'X'.repeat(80)}</div>
        ${pied}
        <div class="mode">Mode d'emploi : cocher les cases des instructions nécessaires, compléter les champs validés, puis délivrer.
          Identification : D = digital, M = remise manuelle (signature)${type === 'MV' ? '' : ', T = téléphone, R = radio'}.</div>
        <div class="actions">
          <button type="button" class="annuler">Annuler</button>
          <button type="submit" class="delivrer">Délivrer l'ordre</button>
        </div>
      </form>
      <details class="souches"><summary>Souches des ordres ${type} délivrés</summary><ol></ol></details>`;
  }

  function ouvrir(type) {
    const etat = moteur.lire();
    dialogue.innerHTML = `<header><h1>BULLETIN ${type} <small>Autorisation de franchissement</small></h1>
      <button class="fermer" aria-label="Fermer">✕</button></header>${formulaire(type, etat)}`;
    const f = dialogue.querySelector('form');
    const selTrain = f.elements.train;
    const autre = f.elements.trainAutre;
    const remplirLoc = () => {
      const n = selTrain.value === '__autre' ? autre.value : selTrain.value;
      dialogue.querySelector('#loc-ordre').innerHTML = suggestionsLocalisation(moteur.lire(), n).map((s) => `<option value="${echapper(s)}">`).join('');
      const t = moteur.lire().trains.find((x) => x.numero === n);
      if (t && f.elements.signal) f.elements.signal.value = `C${t.voie[1]}`;
      if (t && f.elements.poste && !f.elements.poste.value) f.elements.poste.value = t.voie === 'V1' ? 'Charlie' : 'Alfa';
    };
    selTrain.addEventListener('change', () => { autre.hidden = selTrain.value !== '__autre'; if (!autre.hidden) autre.focus(); remplirLoc(); });
    autre.addEventListener('input', remplirLoc);
    dialogue.querySelector('.souches ol').innerHTML = moteur.lire().ordres.filter((o) => o.ordre === type).reverse()
      .map((o) => `<li>n° ${o.numero} · ${echapper(o.champs.heure)} · train ${echapper(o.champs.train || '?')} · ${echapper(o.champs.motif || '')}</li>`).join('')
      || '<li>Aucun.</li>';
    dialogue.querySelector('.fermer').addEventListener('click', () => dialogue.close());
    f.querySelector('.annuler').addEventListener('click', () => dialogue.close());
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const el = f.elements;
      const cases = {};
      f.querySelectorAll('input[type=checkbox]').forEach((c) => { cases[c.name] = c.checked; });
      const champs = {
        train: (el.train.value === '__autre' ? el.trainAutre.value : el.train.value).trim(),
        date: el.date.value, localisation: el.localisation.value, emetteur: el.emetteur.value,
        heure: el.heure.value, motif: el.motif.value, texte: el.texte ? el.texte.value : '',
        signal: el.signal ? el.signal.value : '', poste: el.poste ? el.poste.value : '',
        z: el.z ? (el.z.value.trim() ? `${el.zPrefixe.value}${el.z.value.trim()}` : '') : '',
        cases,
      };
      moteur.agir({ type: 'B_ORDRE', ordre: type, champs });
      dialogue.close();
    });
    dialogue.showModal();
  }

  function brancher(m) {
    moteur = m;
    [['BUL_C', 'C'], ['BUL_S', 'S'], ['BUL_MV', 'MV']].forEach(([id, type]) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => ouvrir(type));
    });
  }
  return { brancher, ouvrir };
})();
