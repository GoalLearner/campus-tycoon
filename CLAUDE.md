# Campus Tycoon: working rules for Claude

A mobile idle sim where the player runs a fictional Division I-style university. `DESIGN.md` is the source of truth for every design decision. Read it before proposing or building anything.

## Current status

- **Layer 0, the first playable, is built** (2026-11-11). It is waiting for the owner to play it. **Do not start Layer 1 until he says so.**
- The repository is public on GitHub. `main` holds the playable game and `layer-0-first-playable` records the layer as built.
- Distribution is being set up outside the layers: Cloudflare Pages for the web build and TestFlight through Codemagic for iOS. See the Distribution section below.
- **A feedback pass on Layer 0 is in progress** (2026-11-11). Walking students, placeable trees and laid-out quads are on the branch `layer-0-feedback` with candidate free art. A larger set is requested and not started: a Build menu of hand-placed buildings, ponds, Medical and Safety coverage, and incidents. **The owner's order for this pass: first one phone-sized screenshot with every new item for him to approve the look, then the mechanics.** Football and the stadium stay in Layer 1, after this pass.
- **Branches (owner's rule, 2026-11-11):** each play stop is built on its own branch and merged into main only when the stop is finished and its tests pass. Main is what Cloudflare Pages builds on every push, once that project exists, and what a `v` tag for TestFlight is put on.
- **Play stop 1 of the feedback pass is built (2026-11-11) and waiting for the owner to play.** The Build menu and twelve hand-placed buildings (`src/sim/config/placed.ts`, `src/sim/systems/placed.ts`), Happiness (`src/sim/systems/happiness.ts`; the code says approval, the screen says Happiness), retention from it, class records, save version 3. Stops 2 (medical, safety, incidents) and 3 (neighbourhoods, roads, parking, land purchase; DESIGN.md 25) are not started and each ends with a stop for him to play. Anything assembled or rendered instead of drawn goes on the list in DESIGN.md section 26.
- **Also on that branch (2026-11-11):** the student card (DESIGN.md 13.8): tap a walker for five lines, worked out from a seeded identity and live campus numbers, nothing stored. All five stadium tiers as sprites (four and five are a rendered stand-in, to be replaced before release; the stadium plot is 2 by 3 cells). DESIGN.md section 24 holds the agreed success metrics. Still waiting on the owner's look approval before any Build menu rules, and before the three metrics pieces of 24.7.

Update this section at the end of every layer.

| Layer | Name | Status |
|---|---|---|
| 0 | First playable | Built. Waiting for the owner to play it |
| 1 | Football and calendar | Not started |
| 2 | Tiers and money levers | Not started |
| 3 | Services and overlays | Not started |
| 4 | Advisors and newspaper | Not started |
| 5 | Milestones | Not started |
| 6 | Identity | Not started |
| 7 | Polish | Not started |

## Working agreement

1. **Build one layer at a time.** A layer's contents, acceptance checks and simulate assertions are in DESIGN.md section 18.
2. **Stop at the end of each layer.** Tell the owner how to open it on his phone and what to try. He plays it.
3. **Never start the next layer without his go-ahead.** A layer being green is not a go-ahead.
4. **A layer is done only when** its tests pass, `npm run simulate` passes that layer's assertions, and its acceptance checks have been run in the real app.
5. **Stay inside the current layer.** Something from a later layer is out of scope even when it would be easy. Say so and move on.
6. **Design changes go through the owner.** If building shows a decision in DESIGN.md is wrong, stop, explain, and propose options. Update DESIGN.md when he decides. Never drift from it silently.
7. **Check every proposal against the eight design tests** (DESIGN.md 2.1) and say which one it fails, if any.
8. **Commit after each step inside a layer, with tests passing, and push after every commit.** The repository is public, so check each commit for secrets, signing files, personal paths and paid art before it goes.
9. **Spend nothing.** No paid services, hosts, assets or accounts without asking first.

## Architecture rules

1. **Sim purity.** `src/sim` is pure TypeScript. It imports nothing from Phaser, Capacitor, the DOM, `src/game`, `src/ui` or `src/app`. Everything in it is unit-testable with Vitest.
2. **Wall-clock time.** Sim progress never depends on frames. Nothing in `src/sim` calls `Date.now()`, `Math.random()` or `performance.now()`. Time arrives as arguments.
3. **Deterministic advance.** `advance(state, from, to)` gives identical state and log in one call or many. Tick timing lives in the state. Randomness comes only from the seeded streams stored in the state, one stream per system. Rendering never draws from them.
4. **Config-driven tuning.** Every number marked [T] in DESIGN.md lives in `src/sim/config`. No tuning literals in logic files.
5. **Content is data.** Inbox items, policies, traditions, archetypes, quirks, name parts and recaps live in `src/sim/content`. Adding one must not need new code.
6. **Versioned saves.** Every save has a version and runs through migrations on load. Any change to the state shape adds a migration and a test with an old fixture.
7. **Stored, not regenerated.** The map layout, the national field, generated names and named regulars are saved. Never rebuild them from the seed.
8. **One way in.** The UI reads state through selectors and changes it only by dispatching actions. Every action advances to now first, then runs a pure reducer, then saves.
9. **Catch-up is cheap.** Students are cohorts, never individuals. No pass walks every lot on a tick. Thirty days of catch-up must stay inside its time target.
10. **Neglect-safe.** Nothing may end the game. Every inbox item has a default. Cash never causes decay. Run the absent-player profile before calling any layer done.

## Art rules

- Real sprites only. Nothing on the map is a coloured box.
- Art is data. One manifest maps each zone, stage and variant to a sprite, its anchor and its footprint. Swapping art is a manifest edit, never a code change.
- Missing art falls back to a labelled placeholder so nothing breaks.
- Downloaded packs live in `art/source`, which is git-ignored. A paid pack must never be committed or sit in a public repository.
- A paid pack's recipe is marked `"private": true`. Its atlas is built into `art/private` (git-ignored) and uploaded to the private repository `GoalLearner/campus-tycoon-art` with `npm run art:publish`. Builds given `ART_TOKEN` download it. Builds without it use the Kenney art in `public/assets`.
- `CREDITS.md` lists every pack in use and its licence.
- **Every visible thing is a real sprite** (owner's rule, 2026-11-11): buildings, water and shorelines, trees, benches, people, responders, incident icons, the placement ghost and menu thumbnails. No coloured boxes, dots, circles or text labels standing in for art. A tint on ground tiles for a radius or coverage is feedback, not art.
- People are sprites named `person.<look>.<direction>.<frame>`, described by `people` in the manifest. With no people in the manifest there are no walkers. 3D characters become walk sheets with `tools/render/people.html`, opened from the dev server.
- **On screen the word is Happiness, never approval** (owner's rule, 2026-11-11; DESIGN.md 16.2). The code may keep `approval` as a name. `tests/wording.test.ts` fails if quoted text in the UI says it.
- **Student card stand-ins are swapped as real systems arrive, and the owner is told each time** (his standing instruction, 2026-11-11; the list is at the end of DESIGN.md 13.8).
- Walkers are for show only. Nothing in `src/sim` may depend on them, and money or traffic must never be read from them. Each walker is one enrolled student, found from the seed (`studentKey`), and only goes home to their own dorm. Student card content lives in `src/sim/config/students.ts` and must pass the tone guide.

## Design rules that are easy to forget

- The player pays for permission and conditions. The campus does the building.
- The old building serves until the new one opens.
- Every stall, loss and disaster names its cause and its fix.
- A default never locks the player in for more than one year. No annual decision has under 48 hours.
- Unlocks are permanent. Standing can fall.
- Keeping something never needs a tap.

## Content rules

- Everything is fictional. No real universities, conferences, mascots, fraternities, sororities, people or brands. Generators must be collision-proof by construction, with a blocklist as the second line.
- Follow the tone guide (DESIGN.md section 16) for every line of player-facing text.
- **No alcohol, tobacco, drug or gambling references anywhere.** One would move the App Store rating to 13+, which the owner has ruled out.
- The joke sits on top and the number sits underneath. Jokes aim at institutions, never at students. Events harm buildings, budgets and pride, never people.

## Commands

- `npm run dev`: local dev server on port 5183, with the time-skip panel in the Menu
- `npm run phone`: the same, reachable from a phone on the same Wi-Fi
- `npm test`: Vitest, all sim tests
- `npm run typecheck`: TypeScript with no output
- `npm run simulate`: headless runs with absent, casual and optimizer players, then the layer's assertions. Options: `-- --years 10 --seeds 1,2,3`
- `npm run build`: fetch private art if a token is set, typecheck, then the web build in `dist` with its service worker
- `npm run deploy`: test, build and upload the web build to Cloudflare Pages
- `npm run build:ios`: the app's copy of the game in `dist-ios`, then `cap sync ios`. Set `TESTER_TOOLS=1` to compile in the hidden time-skip panel
- `npm run preview`: serve `dist` locally
- `npm run art`: rebuild the atlas, manifest and CREDITS.md from `art/recipes/kenney.json`. Needs Python with Pillow and the packs in `art/source`
- `npm run art:publish`: upload the atlas in `art/private` to the private art repository
- `python tools/build_icons.py`: redraw the placeholder iOS icon and launch image
- Dev builds: `?demo&view=14,17,1.3&arrive=24` frames a cell at a zoom and shows students moving in, for screenshots

Dev builds only: `window.__campus` exposes the store, session and clock, and opening the page with `?demo` shows a small tended campus without touching the save. A phone-sized screenshot can be taken with headless Edge pointed at `http://localhost:5183/?demo` (window size 500 by 1000, device scale factor 2, `--enable-unsafe-swiftshader`).

## Distribution

Set up on 2026-11-11, outside the layers. DESIGN.md section 17.8 has the decisions.

- **Repository:** public at `github.com/GoalLearner/campus-tycoon`, for viewing only, all rights reserved. Commits use the GitHub no-reply address. Before every push, check the commit for secrets, signing files, personal paths, local addresses and paid art.
- **Web:** Cloudflare Pages project `campus-tycoon`, connected to GitHub. A push to `main` deploys. Build command `npm run build`, output folder `dist`. The project must be created in the dashboard with the Git connection, never from the command line, or it can never be connected to GitHub.
- **Updates:** `tools/finish-build.ts` writes `sw.js` from `src/sw/service-worker.js` with a cache name made from a hash of the build. `src/app/updates.ts` shows the Update row when a new build is waiting. Never add `skipWaiting()` to the install step: the player picks the moment.
- **iOS:** Capacitor 8 with Swift packages, so there is no CocoaPods step. `capacitor.config.json` must never get a `server.url`: the app carries its own copy of the game. The app has no service worker. `scripts/check-ios-bundle.mjs` enforces both.
- **TestFlight:** `codemagic.yaml`, workflow `ios-testflight`. Push a tag that starts with `v` to build and upload. The version comes from `package.json`. Bump it there, never in Xcode.
- **Tester tools:** the TestFlight workflow sets `TESTER_TOOLS=1`. A future App Store release workflow must leave it unset.

Secrets and where they live. None is ever written to a file in this repository.

| Secret | Where | Needed for |
|---|---|---|
| App Store Connect API key | Codemagic, Teams, Integrations, connection named `Codemagic` | Upload to TestFlight and the build number |
| Apple Distribution certificate | Codemagic, Teams, Code signing identities, reference `awakened-distribution` | Signing |
| App Store provisioning profile | Codemagic, Teams, Code signing identities, reference `campus-tycoon-app-store` | Signing |
| `ART_TOKEN` | Cloudflare Pages, Settings, Variables and Secrets (type Secret). Codemagic, app Environment variables, group `campus_tycoon`, marked Secure | Fetching the private art pack. It is a read-only deploy key for `GoalLearner/campus-tycoon-art`, stored as one line of base64. To replace it, make a new key pair, add the public half with `gh repo deploy-key add`, and delete the old one |
| Cloudflare sign-in | On the owner's PC, from `npx wrangler login` | `npm run deploy` |

## Where things are

- `src/sim`: the pure simulation. `advance.ts` is the heart. `actions.ts` is everything the player can do. One file per system under `systems/`, one config file per system under `config/`.
- `src/app`: clock, store, saves, update watcher, dev tools. The store is the only thing that changes the game state. `persistence.ts` picks IndexedDB on the web and files in the app's Library folder on iOS.
- `src/game`: Phaser. `CampusScene.ts` draws the map and reads touches. `art.ts` resolves sprites through the manifest.
- `src/ui`: the HUD and panels as plain HTML.
- `scripts`: the simulate script and its scripted players, plus the build helpers: `fetch-art.mjs`, `publish-art.mjs`, `deploy.mjs`, `ios-version.mjs`, `check-ios-bundle.mjs`.
- `ios`: the Xcode project. It is committed. `ios/App/App/public` is not: `cap sync` fills it.
- `tools/build_art.py` and `art/recipes`: how sprites are put together from the source pack. `tools/finish-build.ts` is the Vite plugin that swaps in private art and writes the service worker.
