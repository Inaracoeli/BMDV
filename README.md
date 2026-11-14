# BMDV — Simulateur de block manuel de double voie

Simulateur web destiné à la formation des aiguilleurs : un TCO du poste B pour l'élève,
un écran formateur (pupitres Alfa / Charlie, scénarios, dérangements), synchronisés en temps réel.

Ce dépôt ne contient que le fonctionnement du simulateur. Aucun document réglementaire,
texte de procédure ou donnée d'exploitation n'y est stocké : ces éléments résident dans
la base de données, accessible uniquement après authentification.

## Structure

| Fichier | Rôle |
|---|---|
| `tco.html` | TCO du poste B (écran élève) |
| `css/tco.css` | Styles et états lumineux du TCO |
| `js/tco-test.js` | Mode test de l'étape 1 (défilement manuel des états) |

## Nomenclature des éléments

Chaque élément du TCO porte un identifiant `PREFIXE_TYPE_NOM` :

- Préfixes : `A_` block côté Alfa, `C_` block côté Charlie, `T_` TCC, `E_` point E,
  `SAAT_` afficheurs, `BUL_` bulletins
- Types : `B_` bouton, `V_` voyant, `C_` commutateur

Les pupitres « Circulation côté Alfa / Charlie » (`AA_`, `CC_`) sont réservés à l'écran formateur.

L'état visuel se pilote par l'attribut `data-etat` (`blanc`, `jaune`, `rouge`, `bleu`, `vert`)
ou `data-pos` pour les commutateurs (`ferme`/`ouvert`, `A`/`I`, `F`/`O`).

## Avancement

- [x] Étape 1 — TCO statique
- [ ] Étape 2 — Moteur de block (sans réseau)
- [ ] Étape 3 — Circulation des trains
- [ ] Étape 4 — Écran formateur
- [ ] Étape 5 — Synchronisation temps réel et authentification
- [ ] Étape 6 — Scénarios et dérangements
