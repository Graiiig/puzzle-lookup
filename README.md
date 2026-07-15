# puzzle-lookup

Service HTTP indépendant : à partir d'un code-barre EAN, retourne les infos
d'un puzzle (marque, nom, nombre de pièces, image) en scrapant deux sources
publiques. Utilisé par l'app [puzzle-tracker](https://github.com/Graiiig/puzzle-tracker)
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

Proxifie une image hébergée sur puzzle.fr (ex. l'`imageUrl` renvoyée par
`/lookup` — ean-search.org ne renvoie jamais d'image) : renvoie les octets de
l'image avec les bons headers CORS pour l'origine de puzzle-tracker. À
utiliser côté client au lieu d'un `fetch()` direct de l'`imageUrl`, puisque
cet hébergeur tiers n'est pas prévu pour être appelé en cross-origin depuis
un navigateur.

## Logique de résolution

1. **puzzle.fr** : recherche l'EAN via `https://www.puzzle.fr/recherche/<ean>?src=1`
   (URL confirmée en prod — pas de blocage Cloudflare observé, la page se
   rend normalement), prend le premier lien produit trouvé sur la page de
   résultats (repéré via la convention d'URL `...p<id>.html`, pas via des
   classes CSS), puis extrait marque/nom/image via les données structurées
   `schema.org/Product` (JSON-LD) de la page produit si présentes, avec
   repli sur les meta `og:title` / `og:image`, puis sur le `<title>` et la
   meta `description` (qui suit un template stable : "... de marque X
   comprenant Y pièces ..."). Le nombre de pièces est aussi recherché par
   regex dans le slug d'URL.
2. **ean-search.org** (si 1. ne trouve rien) : recherche l'EAN, extrait le nom
   du premier résultat et, si présent, un lien externe vers un revendeur.
   Nombre de pièces extrait par regex sur le nom (pas garanti).
3. Sinon → `{ "found": false }`.

Le scraping passe par Playwright (Chromium headless) car les deux sites
bloquent les requêtes HTTP simples (403).

Chaque source a un timeout (`SOURCE_TIMEOUT_MS`, 15s par défaut) : en cas de
dépassement, d'erreur, ou de structure de page imprévue, on passe à la source
suivante sans planter.

Un cache par EAN (fichier JSON, voir `CACHE_FILE_PATH`) évite de re-scraper à
chaque scan du même puzzle. TTL séparés pour les résultats trouvés
(`POSITIVE_CACHE_TTL_DAYS`, 30 jours par défaut) et non trouvés
(`NEGATIVE_CACHE_TTL_HOURS`, 24h par défaut, au cas où c'était un échec
transitoire du scraping plutôt qu'une vraie absence de résultat).

## ⚠️ Sélecteurs à vérifier avant mise en prod

Ce service a été développé dans un environnement sandbox dont la politique
réseau bloque les accès sortants vers puzzle.fr et ean-search.org. Les
sélecteurs ont donc été ajustés a posteriori, en prod, avec l'aide de deux
routes de debug (voir plus bas).

État actuel :
- **puzzle.fr** : URL de recherche et repérage du lien produit confirmés
  fonctionnels en prod (voir ci-dessus). Extraction marque/nom/pièces/image
  avec plusieurs replis (JSON-LD → og:meta → title/description) — pas encore
  confirmé lequel de ces chemins est réellement emprunté sur ce site (JSON-LD
  semble absent d'après un premier test).
- **ean-search.org** : pas encore vérifié en prod. L'extraction utilise une
  liste de sélecteurs candidats (`src/sources/eanSearch.ts`,
  `RESULT_NAME_SELECTORS`) essayés dans l'ordre, avec repli sur le `<title>`
  de la page — à confirmer/ajuster.
- Dans tous les cas, toute erreur ou structure inattendue fait échouer la
  source silencieusement (retour `null`) plutôt que de planter.

**Pour ajuster ces sélecteurs**, deux options :

1. Depuis une machine avec accès internet (locale ou VPS) :
   ```bash
   npm run inspect -- "https://www.puzzle.fr/recherche/<un_ean_connu>?src=1"
   npm run inspect -- "https://www.ean-search.org/?q=<un_ean_connu>"
   ```
   Ça ouvre un vrai Chromium (non-headless) et sauvegarde `debug/page.html` +
   `debug/page.png`.

2. Directement contre le service déployé (utile si pas d'accès Playwright en
   local), via les routes `/debug/html` et `/debug/screenshot` (protégées par
   `x-api-key`, restreintes aux hosts puzzle.fr/ean-search.org) :
   ```bash
   curl -H "x-api-key: <API_KEY>" \
     "https://<domaine>/debug/html?url=https%3A%2F%2Fwww.puzzle.fr%2Frecherche%2F<ean>%3Fsrc%3D1" \
     -o page.html
   curl -H "x-api-key: <API_KEY>" \
     "https://<domaine>/debug/screenshot?url=https%3A%2F%2Fwww.puzzle.fr%2Frecherche%2F<ean>%3Fsrc%3D1" \
     -o page.png
   ```

Dans les deux cas, compare avec ce que `src/sources/puzzleFr.ts` et
`src/sources/eanSearch.ts` attendent, et ajuste si besoin. Les tests dans
`test/sources.test.ts` tournent contre des fixtures HTML locales
(`test/fixtures/`) qui simulent la structure attendue — à mettre à jour avec
du vrai HTML si la structure réelle diffère.

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
   au minimum `API_KEY`. `PORT`/`HOST` peuvent rester par défaut.
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
