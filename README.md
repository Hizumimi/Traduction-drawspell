# Drawspell en VF

Petit site pour jouer sur [drawspell.space](https://drawspell.space) avec des cartes Magic **en français**.

Le problème : ManaBox exporte les decks en anglais, avec l'édition et le numéro (`1 Murder (DSK) 110`). drawspell
demande ces cartes à Scryfall, qui renvoie toujours la version anglaise. Le site cherche la version française de
chaque carte sur Scryfall et produit une liste à coller dans drawspell.

## Utilisation

1. Ouvre `index.html` dans ton navigateur (ou la version en ligne, voir plus bas).
2. Dans ManaBox, exporte ton deck en texte. Colle-le dans « Ton deck », ou ouvre le fichier `.txt`.
3. Clique sur « Traduire le deck ».
4. Copie la liste de droite. Dans drawspell, clique sur « Load Deck », colle la liste et valide.

Le site marche aussi avec les listes Moxfield, Archidekt, MTG Arena et MTGO, ainsi qu'avec l'export CSV de ManaBox.
La langue des cartes se choisit dans la liste (français par défaut).

### Les deux modes

| | Sans installation | Avec le script VF |
|---|---|---|
| Ce que contient la liste | les noms français vérifiés (`1 Homicide`…) | les noms anglais avec l'édition (`1 Murder (DSK) 110`) |
| Cartes en VF | la plupart (87 sur 100 sur le deck d'exemple) | toutes celles qui existent en français |
| Édition | l'impression française la plus récente | ton édition quand elle existe en VF |
| Temps de chargement dans drawspell | environ 1 à 2 minutes pour 100 cartes | quelques secondes |

Pourquoi des cartes restent en VO sans le script : certains noms français ressemblent trop à un nom anglais
(Homicide, Plaine, Réanimation…). Scryfall choisirait alors la carte anglaise, ou même une autre carte. Le site teste
chaque nom avant de l'écrire. Si le résultat n'est pas la bonne carte en français, il garde la ligne anglaise avec ton
édition.

Dans les deux modes, la liste corrige aussi l'export ManaBox. drawspell ne comprend pas `// COMMANDER` : il le
prend pour une carte, ajoute « Commandeer » au deck et met le commandant dans la bibliothèque. La liste utilise les
sections `Commander`, `Deck` et `Sideboard` de drawspell, et retire la maybeboard.

### Le script Drawspell VF

Le script modifie les réponses de Scryfall dans drawspell pour charger la version française de chaque carte. Seule la
personne qui importe le deck en a besoin : les images sont partagées avec toute la partie.

- **Favori (ordinateur)** : glisse le bouton « Drawspell VF » du site dans ta barre de favoris. Sur drawspell,
  entre dans ta partie, clique sur le favori (une bulle « Drawspell VF · actif » apparaît), puis « Load Deck ».
  Clique à nouveau sur le favori après chaque rechargement de la page.
- **Tampermonkey** : installe l'extension, puis ouvre `drawspell-vf.user.js` et clique sur « Installer ». Le script
  s'active alors tout seul sur drawspell. Sur Chrome, active aussi « Autoriser les scripts utilisateur » dans les
  détails de l'extension.
- **Téléphone** : le bouton « Copier le code du favori » copie le code. Crée un favori, colle ce code à la place de
  son adresse, puis ouvre-le depuis la barre d'adresse quand tu es sur drawspell.

## Mettre le site en ligne (gratuit)

Pour que tes potes l'utilisent depuis un simple lien, sur ordinateur comme sur téléphone :

**GitHub Pages**
1. Crée un compte sur github.com, puis un dépôt public (par exemple `drawspell-vf`).
2. « Add file › Upload files » : envoie `index.html`, `drawspell-vf.user.js` et `README.md`.
3. Dans « Settings › Pages », choisis « Deploy from a branch », branche `main`, dossier `/ (root)`.
4. Le site est en ligne après une minute, à l'adresse `https://<ton-pseudo>.github.io/drawspell-vf/`.

**Netlify Drop** : glisse le dossier du projet sur https://app.netlify.com/drop.

Le site n'a pas de serveur : tout se passe dans le navigateur, qui interroge directement l'API de Scryfall.

## Fichiers

- `index.html` : le site (HTML, CSS et JavaScript dans un seul fichier).
- `drawspell-vf.user.js` : le script Drawspell VF. Une copie est intégrée dans `index.html` pour fabriquer le favori.
- `tools/embed_userscript.py` : recopie le script dans `index.html`. À lancer après chaque modification du script :
  `py tools/embed_userscript.py`.
- `tools/drawspell_harness.js` : banc de test qui rejoue l'import de drawspell (à coller dans la console d'un onglet
  drawspell.space).
- `samples/` : l'export ManaBox d'exemple et les deux listes générées pour ce deck.

## Bon à savoir

- Scryfall limite le nombre de requêtes. Le site les espace et garde les résultats 3 jours dans le navigateur. Une
  deuxième traduction du même deck est donc instantanée. Si Scryfall demande une pause, le site attend une minute,
  puis reprend tout seul.
- Une carte que Scryfall ne trouve pas est retirée de la liste. Sinon, drawspell refuserait tout l'import.
- Les noms affichés dans le journal de partie de drawspell restent en anglais : drawspell les lit dans les données
  anglaises de Scryfall. Seules les images passent en français.
- Les jetons créés pendant la partie restent en anglais.

Données et images des cartes : [Scryfall](https://scryfall.com). Ce projet n'est affilié ni à drawspell, ni à
ManaBox, ni à Scryfall, ni à Wizards of the Coast.
