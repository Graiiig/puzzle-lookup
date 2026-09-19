# puzzle-lookup

Service HTTP indépendant : à partir d'un code-barre EAN, retourne les infos
d'un puzzle (marque, nom, nombre de pièces, image) en scrapant plusieurs
sources publiques. Utilisé par l'app [puzzle-tracker](https://github.com/Graiiig/puzzle-tracker)
(web + Android) pour pré-remplir le formulaire d'ajout après un scan caméra.

## API

```
GET /lookup?ean=<code-barre>[&refresh=1]
Header: x-api-key: <clé partagée>
```

`refresh=1` ignore le cache et force un nouveau scrape (utile pour retester une
source après un échec ponctuel — sans ça, un `found:true` mis en cache reste
servi tel quel jusqu'à expiration du TTL, même s'il vient d'une source de
repli suite à un raté transitoire de la source principale).

Réponse 200 dans tous les cas :

```json
{ "found": true, "source": "puzzle.fr", "brand": "Ravensburger", "name": "Tour Eiffel de nuit", "pieces": 1000, "imageUrl": "https://..." }
```
```json
{ "found": false }
```

`GET /health` renvoie `{ "ok": true }` sans authentification (healthcheck Coolify).

CORS est restreint aux origines listées dans `ALLOWED_ORIGINS` (par défaut :
GitHub Pages de puzzle-tracker + `localhost` de dev + l'origine par défaut du
WebView Capacitor Android) — un appel `fetch()` depuis un autre site sera
bloqué par le navigateur.

```
GET /image?url=<url_de_l_image>
Header: x-api-key: <clé partagée>
```

Proxifie une image hébergée sur puzzle.fr ou Philibert (ex. l'`imageUrl`
renvoyée par `/lookup`) : renvoie les octets de
l'image avec les bons headers CORS pour l'origine de puzzle-tracker. À
utiliser côté client au lieu d'un `fetch()` direct de l'`imageUrl`, puisque
cet hébergeur tiers n'est pas prévu pour être appelé en cross-origin depuis
un navigateur.

## Logique de résolution

1. **puzzle.fr** : la recherche interne de puzzle.fr n'indexe **pas** les
   produits par EAN — confirmé en testant `https://www.puzzle.fr/recherche?q=<ean>`
   à la main avec l'EAN d'un produit existant et bien établi sur le site
   ("0 Produits trouvés"). On localise donc la page produit via **Serper**
   (voir "Recherche puzzle.fr via Serper" ci-dessous), restreint à
   `puzzle.fr`, l'EAN étant affiché dans la fiche technique de chaque page
   produit et donc indexé par Google. Une fois l'URL du produit trouvée, son
   HTML est récupéré via **ScraperAPI** plutôt que par une navigation directe
   de ce serveur (voir "Récupération de la page produit via ScraperAPI"),
   puis on extrait marque/nom/image via les données structurées
   `schema.org/Product` (JSON-LD) de la page si présentes, avec repli sur les
   meta `og:title` / `og:image`, puis sur le `<title>` et la meta
   `description` (qui suit un template stable : "... de marque X comprenant Y
   pièces ..."). Le nombre de pièces est aussi recherché par regex dans le
   slug d'URL.
2. **Philibert** (philibertnet.com, si 1. ne trouve rien) : spécialiste FR
   jeux/puzzles, catalogue complémentaire à puzzle.fr. Même mécanique que
   puzzle.fr — localisation via Serper (l'EAN apparaît directement dans
   l'URL de ses pages produit, ex. `.../45151-level-up-4005556208654.html`,
   donc bien indexé par Google), puis extraction JSON-LD/og:meta générique
   (`extractGenericProduct`, partagée avec puzzle.fr). Contrairement à
   puzzle.fr, la page produit est récupérée par navigation Playwright
   directe (pas de ScraperAPI) — confirmé fonctionnel en prod sans.
3. **Revendeurs FR génériques** (`src/sources/frRetailers.ts`, si rien
   trouvé avant) : filet de sécurité plus large qu'un seul revendeur
   dédié — beaucoup de puzzles (marques plus confidentielles/régionales
   surtout) ne sont vendus que par des généralistes jouets/loisirs plutôt
   que par puzzle.fr ou Philibert. Liste courte et curée de sites FR
   (`FR_RETAILER_SITES` : Cultura, JouéClub, King Jouet, E.Leclerc, BCD
   Jeux) interrogés en **une seule requête Serper** avec des clauses
   `site:` combinées par `OR`, plutôt qu'un fichier dédié par site — pas
   de code spécifique par revendeur (pas d'équivalent ScraperAPI ou du fix
   d'image Philibert), juste `extractGenericProduct` telle quelle. La
   source réellement trouvée (`source` dans la réponse) est le nom
   d'hôte du résultat, déterminé dynamiquement plutôt que codé en dur.
   Pour ajouter un revendeur : une ligne dans `FR_RETAILER_SITES` + deux
   entrées d'hôte dans `FR_RETAILER_HOSTS`, à condition que le site ait un
   balisage schema.org/og:meta standard.
4. Sinon → `{ "found": false }`.

(ean-search.org a été utilisé comme 3ᵉ source de repli, mais retiré : peu
fiable en prod — bloquait une bonne partie des requêtes du serveur, page
"Access denied" probablement liée à une réputation d'IP datacenter — pour
une qualité de données plus faible que puzzle.fr/Philibert de toute façon
[pas d'image, comptage de pièces non garanti].)

### Recherche via Serper

Google's own Custom Search JSON API (le choix initial) est fermée aux
nouveaux projets depuis 2025 et sera totalement arrêtée en janvier 2027 — on
utilise donc [Serper](https://serper.dev), un tiers payant qui interroge
Google et renvoie de vrais résultats Google en JSON (ce n'est **pas** un
produit Google officiel, juste un fournisseur qui s'appuie dessus). Serper
n'a pas de paramètre dédié de restriction de site : l'opérateur `site:` est
inclus directement dans la requête texte (`site:puzzle.fr <ean>`), exactement
comme dans une recherche Google classique. `findProductUrlViaSerper`
(`src/sources/serperSearch.ts`) est générique — chaque source scrapée
l'appelle avec son propre nom de domaine, pas seulement puzzle.fr.

1. Créer un compte sur [serper.dev](https://serper.dev) et récupérer la clé
   API.
2. Renseigner `SERPER_API_KEY` (voir `.env.example`).

Tier gratuit à l'inscription largement suffisant vu le volume réel (quelques
nouveaux puzzles scannés par mois, le reste servi par le cache 30 jours) —
l'usage ne devrait jamais dépasser le gratuit. Sans cette variable, la
recherche échoue systématiquement (`errored: true`, court TTL d'erreur) pour
les trois sources, et chaque lookup renvoie `{ "found": false }`.

### Récupération de la page produit via ScraperAPI

Une fois l'URL du produit connue via Serper, son HTML n'est **pas** récupéré
en y naviguant directement depuis ce serveur — testé en conditions réelles :
la page produit exacte visée par un lookup timeout systématiquement (10s,
`page.goto` n'atteint jamais `domcontentloaded`) depuis ce serveur, alors
qu'elle se charge instantanément dans un navigateur normal — probablement
une réputation d'IP datacenter, mais qui se manifeste ici par un silence
complet plutôt qu'un blocage explicite.

[ScraperAPI](https://www.scraperapi.com/) (rotation de proxy + contournement
anti-bot) sert d'intermédiaire à la place : `GET api.scraperapi.com?api_key=<clé>&url=<url_produit>`
renvoie le HTML final, qui est ensuite injecté dans une page Playwright
locale (`page.setContent`) pour réutiliser tel quel le code d'extraction
JSON-LD/og:meta existant.

1. Créer un compte sur [scraperapi.com](https://www.scraperapi.com/) et
   récupérer la clé API.
2. Renseigner `SCRAPERAPI_KEY` (voir `.env.example`).

Comme pour Serper, le tier gratuit à l'inscription (1000 crédits) devrait
largement couvrir le volume réel de l'appli. Sans cette variable, la
récupération de la page produit échoue systématiquement (`errored: true`)
même quand Serper a bien trouvé l'URL.

Le scraping passe par Playwright (Chromium headless) car ces sites
bloquent les requêtes HTTP simples (403).

Chaque source a un timeout (`SOURCE_TIMEOUT_MS`, 40s par défaut) : en cas de
dépassement, d'erreur, ou de structure de page imprévue, on passe à la source
suivante sans planter.

Un cache par EAN (fichier JSON, voir `CACHE_FILE_PATH`) évite de re-scraper à
chaque scan du même puzzle. TTL séparés pour les résultats trouvés
(`POSITIVE_CACHE_TTL_DAYS`, 30 jours par défaut) et non trouvés
(`NEGATIVE_CACHE_TTL_HOURS`, 24h par défaut, au cas où c'était un échec
transitoire du scraping plutôt qu'une vraie absence de résultat).

## ⚠️ Sélecteurs à vérifier avant mise en prod

Ce service a été développé dans un environnement sandbox dont la politique
réseau bloque les accès sortants vers tous les sites scrapés. Les sélecteurs
ont donc été ajustés a posteriori, en prod, avec l'aide de deux routes de
debug (voir plus bas).

État actuel :
- **puzzle.fr** : localisation de la page produit via Serper puis
  récupération de son HTML via ScraperAPI (voir les deux sections
  ci-dessus, nécessite `SERPER_API_KEY` et `SCRAPERAPI_KEY`). Chaîne
  complète (Serper → ScraperAPI → extraction JSON-LD/og:meta) confirmée
  fonctionnelle en prod de bout en bout.
- **Philibert** : localisation via Serper puis navigation Playwright directe
  (pas de ScraperAPI, voir "Logique de résolution" ci-dessus). Chaîne
  complète confirmée fonctionnelle en prod de bout en bout — la navigation
  directe suffit, pas de blocage IP observé comme sur puzzle.fr. Nom/pièces/
  image extraits correctement ; `brand` en revanche pas encore vu renseigné
  sur un vrai produit (JSON-LD sans doute sans champ `brand` sur ce site, ou
  ailleurs dans la page — pas creusé plus, à revoir si besoin).
- **Revendeurs FR génériques** (Cultura, JouéClub, King Jouet, E.Leclerc,
  BCD Jeux) : **pas encore testé en prod** — ni la requête Serper multi-sites,
  ni la navigation directe, ni l'extraction générique sur ces sites en
  particulier. À vérifier comme puzzle.fr/Philibert l'ont été.
- Dans tous les cas, toute erreur ou structure inattendue fait échouer la
  source silencieusement (`found: false`) plutôt que de planter.

**Pour ajuster ces sélecteurs**, deux options :

1. Depuis une machine avec accès internet (locale ou VPS) :
   ```bash
   npm run inspect -- "https://www.puzzle.fr/<slug-produit-connu>.p<id>.html"
   npm run inspect -- "https://www.philibertnet.com/fr/<slug-produit-connu>.html"
   ```
   Ça ouvre un vrai Chromium (non-headless) et sauvegarde `debug/page.html` +
   `debug/page.png`.

2. Directement contre le service déployé (utile si pas d'accès Playwright en
   local), via les routes `/debug/html` et `/debug/screenshot` (protégées par
   `x-api-key`, restreintes aux hosts de `src/allowedHosts.ts`) :
   ```bash
   curl -H "x-api-key: <API_KEY>" \
     "https://<domaine>/debug/html?url=<url_produit_encodée>" \
     -o page.html
   curl -H "x-api-key: <API_KEY>" \
     "https://<domaine>/debug/screenshot?url=<url_produit_encodée>" \
     -o page.png
   ```

Dans les deux cas, compare avec ce que `src/sources/puzzleFr.ts` et
`src/sources/philibert.ts` (via `genericProductExtract.ts`) attendent, et
ajuste si besoin. Les tests dans `test/sources.test.ts` tournent contre des
fixtures HTML locales (`test/fixtures/`) qui simulent la structure attendue
— à mettre à jour avec du vrai HTML si la structure réelle diffère.

## Développement local

```bash
npm install
cp .env.example .env   # renseigner API_KEY
npm run dev
```

```bash
curl -H "x-api-key: <API_KEY>" "http://localhost:3000/lookup?ean=4005556197766"
```

## Tests / typecheck

```bash
npm run build   # typecheck + compilation
npm test        # tests unitaires (regex pièces) + tests d'extraction sur fixtures HTML
```

## Déploiement (Coolify)

1. Connecter ce repo Git dans Coolify. Le `Dockerfile` est détecté
   automatiquement (build/déploiement à chaque push, webhook standard).
2. Variables d'environnement à définir dans Coolify (voir `.env.example`) :
   `API_KEY`, ainsi que `SERPER_API_KEY` et `SCRAPERAPI_KEY` (voir les
   sections "Recherche puzzle.fr via Serper" et "Récupération de la page
   produit via ScraperAPI" — sans elles, puzzle.fr ne renverra jamais aucun
   résultat). `PORT`/`HOST` peuvent rester par défaut.
3. Démarrer en exposant IP:port pour tester, puis brancher un (sous-)domaine
   + HTTPS (géré automatiquement par Coolify) une fois validé.
4. `GET /health` peut servir de healthcheck Coolify.

L'image Docker part de `mcr.microsoft.com/playwright:v1.56.0-jammy`, qui
inclut déjà Chromium — pas de téléchargement de navigateur au build. La
version de l'image doit rester alignée avec la version du package
`playwright` dans `package.json` (actuellement `1.56.0`, choisie car c'est
la version dont la révision Chromium correspond à celle pré-installée dans
l'environnement de dev utilisé — libre à toi de la faire évoluer, en gardant
`Dockerfile` et `package.json` synchronisés).

## Hors scope (voir le repo puzzle-tracker)

- Scan caméra → EAN côté app.
- Appel à cette API depuis le formulaire d'ajout de puzzle-tracker.
