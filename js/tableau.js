// ==========================================================
// Simulateur BMDV — tableau d'enclenchement du point E
// Tableau à deux entrées : en ligne les manœuvres et les états,
// en colonne les conditions. Une case ✓ exige la condition,
// une case ✗ exige son contraire, une case vide est sans effet.
// Le moteur applique ce tableau ; le formateur le modifie ici
// (mode Modifier). Le tableau est conservé dans le navigateur.
// ==========================================================
const Tableau = (function () {
  const CLE = 'bmdv-tableau';
  let moteur = null;
  let edition = false;

  const dialogue = document.createElement('dialog');
  dialogue.id = 'tableau';
  dialogue.className = 'fenetre';
  dialogue.innerHTML = `
    <header>
      <h1>TABLEAU D'ENCLENCHEMENT <small>Point E · aiguilles E et F</small></h1>
      <button class="fermer" aria-label="Fermer le tableau">✕</button>
    </header>
    <div class="outils">
      <p class="legende"><span class="v oui">✓</span> exige la condition
        <span class="v non">✗</span> exige son contraire
        <span class="v"></span> sans effet
        <span class="live"><span class="pastille vrai"></span> condition réalisée maintenant
        <span class="etat-ligne permis">permis</span> <span class="etat-ligne refuse">refusé</span> état actuel (mode Modifier, pour le formateur)</span></p>
      <span class="espace"></span>
      <button type="button" class="modifier">Modifier</button>
      <button type="button" class="defaut" hidden>Tableau par défaut</button>
      <button type="button" class="exporter">Exporter</button>
      <label class="importer">Importer<input type="file" accept="application/json" hidden></label>
    </div>
    <div class="corps"></div>
    <p class="aide">Correspondances : Vcm 1 ↔ carré C1 ↔ clé E ↔ aiguille E (voie 1) · Vcm 2 ↔ carré C2 ↔ clé F ↔ aiguille F (voie 2).
      Les lignes « état » sont recalculées en permanence et ne peuvent dépendre que des conditions de base.</p>`;
  document.body.append(dialogue);
  const corps = dialogue.querySelector('.corps');
  const btnModifier = dialogue.querySelector('.modifier');
  const btnDefaut = dialogue.querySelector('.defaut');

  function construire() {
    const groupes = [];
    Moteur.CONDITIONS.forEach(([, , g]) => { if (groupes[groupes.length - 1]?.nom !== g) groupes.push({ nom: g, n: 0 }); groupes[groupes.length - 1].n++; });
    const ligneGroupe = `<tr><th class="coin" rowspan="2">Pour que… <span>il faut que…</span></th>${groupes.map((g) => `<th class="groupe" colspan="${g.n}">${g.nom}</th>`).join('')}<th class="coin etat-ligne" rowspan="2">Maintenant</th></tr>`;
    const ligneCond = `<tr>${Moteur.CONDITIONS.map(([c, l]) => `<th class="cond" data-col="${c}"><div><span class="pastille"></span>${l}</div></th>`).join('')}</tr>`;
    let genrePrec = null;
    const corpsTable = Moteur.LIGNES_TABLEAU.map(([l, libelle, genre]) => {
      const titre = genre !== genrePrec ? `<tr class="intertitre"><td colspan="${Moteur.CONDITIONS.length + 2}">${genre === 'etat' ? 'États (calculés en permanence)' : 'Manœuvres (refusées si une condition manque)'}</td></tr>` : '';
      genrePrec = genre;
      const cases = Moteur.CONDITIONS.map(([c]) => {
        const interdite = c === l || (genre === 'etat' && Moteur.COLONNES_DERIVEES.includes(c));
        return `<td class="case${interdite ? ' interdite' : ''}" data-ligne="${l}" data-col="${c}"></td>`;
      }).join('');
      return `${titre}<tr data-ligne="${l}"><th class="libelle">${libelle}</th>${cases}<td class="etat-ligne"></td></tr>`;
    }).join('');
    corps.innerHTML = `<table class="matrice"><thead>${ligneGroupe}${ligneCond}</thead><tbody>${corpsTable}</tbody></table>`;
  }

  function afficher(etat) {
    if (!dialogue.open) return;
    const c = Moteur.conditions(etat);
    corps.querySelectorAll('th.cond').forEach((th) => th.classList.toggle('vrai', !!c[th.dataset.col]));
    corps.querySelectorAll('td.case').forEach((td) => {
      const v = (etat.tableau[td.dataset.ligne] || {})[td.dataset.col];
      td.className = `case${td.classList.contains('interdite') ? ' interdite' : ''}${v === true ? ' oui' : v === false ? ' non' : ''}`;
      td.textContent = v === true ? '✓' : v === false ? '✗' : '';
    });
    corps.querySelectorAll('tr[data-ligne]').forEach((tr) => {
      const m = Moteur.manquantes(etat, tr.dataset.ligne, c);
      const cell = tr.querySelector('.etat-ligne');
      const permis = m.length === 0;
      const etatLigne = Moteur.LIGNES_TABLEAU.find(([l]) => l === tr.dataset.ligne)[2] === 'etat';
      cell.textContent = etatLigne ? (permis ? 'oui' : 'non') : (permis ? 'permis' : 'refusé');
      cell.className = `etat-ligne ${permis ? 'permis' : 'refuse'}`;
      cell.title = permis || !edition ? '' : `Manque : ${m.join(', ')}`;
    });
    dialogue.classList.toggle('edition', edition);
  }

  // Mode Modifier : chaque clic fait tourner la case vide → ✓ → ✗ → vide
  corps.addEventListener('click', (e) => {
    const td = e.target.closest('td.case');
    if (!td || !edition || td.classList.contains('interdite') || !moteur) return;
    const v = (moteur.lire().tableau[td.dataset.ligne] || {})[td.dataset.col];
    const suivante = v === undefined ? true : v === true ? false : null;
    moteur.agir({ type: 'TABLEAU_CASE', ligne: td.dataset.ligne, colonne: td.dataset.col, valeur: suivante });
  });
  btnModifier.addEventListener('click', () => {
    edition = !edition;
    btnModifier.textContent = edition ? 'Terminer' : 'Modifier';
    btnModifier.classList.toggle('actif', edition);
    btnDefaut.hidden = !edition;
    afficher(moteur.lire());
  });
  btnDefaut.addEventListener('click', () => {
    if (btnDefaut.dataset.confirmer) { moteur.agir({ type: 'TABLEAU', tableau: 'defaut' }); delete btnDefaut.dataset.confirmer; btnDefaut.textContent = 'Tableau par défaut'; return; }
    btnDefaut.dataset.confirmer = '1';
    btnDefaut.textContent = 'Confirmer ?';
    setTimeout(() => { delete btnDefaut.dataset.confirmer; btnDefaut.textContent = 'Tableau par défaut'; }, 4000);
  });
  dialogue.querySelector('.exporter').addEventListener('click', () => {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([JSON.stringify(moteur.lire().tableau, null, 2)], { type: 'application/json' }));
    lien.download = 'bmdv-tableau-enclenchement.json';
    lien.click();
    URL.revokeObjectURL(lien.href);
  });
  dialogue.querySelector('.importer input').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { moteur.agir({ type: 'TABLEAU', tableau: JSON.parse(await f.text()) }); } catch (err) { /* fichier illisible */ }
    e.target.value = '';
  });
  dialogue.querySelector('.fermer').addEventListener('click', () => dialogue.close());
  dialogue.addEventListener('click', (e) => { if (e.target === dialogue) dialogue.close(); });

  function brancher(m) {
    moteur = m;
    construire();
    // Tableau du formateur conservé d'une séance à l'autre
    try {
      const sauve = JSON.parse(localStorage.getItem(CLE));
      if (sauve) moteur.agir({ type: 'TABLEAU', tableau: sauve });
    } catch (e) { /* rien de sauvegardé */ }
    moteur.abonner((etat, resultat, action) => {
      if (action && /^TABLEAU/.test(action.type) && resultat && resultat.ok) {
        try { localStorage.setItem(CLE, JSON.stringify(etat.tableau)); } catch (e) { /* stockage indisponible */ }
      }
      afficher(etat);
    });
    const b = document.getElementById('BTN_TABLEAU');
    if (b) b.addEventListener('click', () => { dialogue.showModal(); afficher(moteur.lire()); });
  }

  return { brancher };
})();
