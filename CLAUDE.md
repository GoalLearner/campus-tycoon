# Campus Tycoon: working rules for Claude

A mobile idle sim where the player runs a fictional Division I-style university. `DESIGN.md` is the source of truth for every design decision. Read it before proposing or building anything.

## Current status

- **Layer 0, the first playable, is built** (2026-11-11). It is waiting for the owner to play it. **Do not start Layer 1 until he says so.**
- The repository is public on GitHub. `main` holds the playable game and `layer-0-first-playable` records the layer as built.
- Distribution is being set up outside the layers: Cloudflare Pages for the web build and TestFlight through Codemagic for iOS. See the Distribution section below.
- **A feedback pass on Layer 0 is in progress** (2026-11-11). Walking students, placeable trees and laid-out quads are on the branch `layer-0-feedback` with candidate free art. A larger set is requested and not started: a Build menu of hand-placed buildings, ponds, Medical and Safety coverage, and incidents. **The owner's order for this pass: first one phone-sized screenshot with every new item for him to approve the look, then the mechanics.** Football and the stadium stay in Layer 1, after this pass.
- **Branches (owner's rule, 2026-11-11):** each play stop is built on its own branch and merged into main only when the stop is finished and its tests pass. Main is what Cloudflare Pages builds on every push, once that project exists, and what a `v` tag for TestFlight is put on.
- **Play stops 1, 2 and 3 of the feedback pass are built (2026-11-11) and waiting for the owner to play.** Stop 1: the Build menu and hand-placed buildings (`src/sim/config/placed.ts`, `src/sim/systems/placed.ts`), Happiness (`src/sim/systems/happiness.ts`; the code says approval, the screen says Happiness), retention from it, class records, refunds, the HUD date. Stop 2: Medical Center and Campus Safety, incidents (`src/sim/config/incidents.ts`, `src/sim/systems/incidents.ts`), safety as the fifth cause of Happiness at half weight, students with no bed leaving at the end of the semester, and test players who use the Build menu (`scripts/bots.ts`). Save version 5. Stop 2 fixes (same day): calendar dates run evenly inside each phase and football fits the dates, never the reverse (a test holds it); Happiness has four causes at full weight, gathered from five drivers (`CAUSE_OF` in `src/sim/config/students.ts`); the waitlist window is 36 hours, the shortest any window the player can act in may be (`MIN_WINDOW_TICKS`). Once a day is the slowest rhythm the game supports: DESIGN.md 2.3 is the contract and 4.9 the audit of every timer. Stop 3 is built too (same day) and waits for him to play: the town down the east side of a 42 by 48 map with two fields for sale to the south (`src/sim/config/town.ts`, `src/sim/systems/town.ts`), locals who walk or drive (`admitPlan` in `src/sim/systems/admissions.ts`; `GameState.offCampus` follows each class year), roads, crossings and car parks, tuition plus a room fee, save version 6, cars for show (`src/game/Cars.ts`), and day and night from the device clock (`src/app/daylight.ts`). DESIGN.md 25.6 and 28.4 say what was built and what is rough. Play stop 4a (Grounds, DESIGN.md 29, as built in 29.14) is built too: litter, bins, seating, Facilities Yards and workers (`src/sim/config/grounds.ts`, `src/sim/systems/grounds.ts`), Grounds as the cause that was Green space (`PART_WEIGHTS`), save version 7. The fixes after it are built too (DESIGN.md 29.15): a yard reaches 12 cells, a broken bin is mended first, breakage reads the students near the spot (`moodNear`), a broken street lamp has a panel (`lampReport`), save version 8. Stop 4b (food and Academics, DESIGN.md 30) is not started and waits for his word. Layer 1 (football, calendar events, Stress in section 27, time of day and weather in section 28) is not started either. Anything assembled or rendered instead of drawn goes on the list in DESIGN.md section 26.
- **Since then, all on main (2026-11-11):** stop 3 fixes; play stop 4a, Grounds (litter, bins, benches, picnic tables, the Facilities Yard and its workers; DESIGN.md 29); stop 4a fixes; and play stop 5, Money (every cost as its own line, the Money panel, marketing steps, the plain endowment, a seven-day phase-in on older saves, four class years from the first day; DESIGN.md 31 and 32.1). 269 tests and 21 simulate checks. **Next, each only when the owner says go after playing:** a small People stop (DESIGN.md 32.2), then stop 4b, food and Academics (DESIGN.md 30). Layer 1 is not started.
- **How the owner works (his rule, 2026-11-11):** he messages only the main session. A build session does the work and reports to the main session, which checks it (tsc, vitest, simulate, screenshots by eye) and reports to him. A build session never addresses him and never sends him files.
- **The long run of 2026-11-12, all on main:** Stop A, Life and sound (DESIGN.md 33; every sound made from noise is off, `NOISE_AMBIENCE` in `src/app/sound.ts`, until recordings replace it). Stop B, football and the academic calendar (DESIGN.md 34). The model campus (DESIGN.md 35): laid by `src/sim/modelCampus.ts`, opening with 46,000 students through a **campus scale** (`map.scale`, read through `scaleOf`; 28 on the model campus and 1 everywhere else; it multiplies every head count and every building price, and never anything counted for each student; the stadium and football's own costs are real size at any scale). **Every new game begins on the model campus** (the owner's decision; `store.foundUniversity`). The small campus stays as the sim's default for the tests and the long runs, and no player is offered it. A game begun on it is left as it is and keeps "Visit the model campus". Stop C, the daily player and the newspaper (DESIGN.md 36): the paper after an hour or more away, the Inbox with four advisors and 22 items (`src/sim/config/inbox.ts`), the first issue as a new game's first screen, and iPhone notifications (`src/app/notices.ts`, plugin installed, never run on a phone). Save version 14. 542 tests and 40 simulate checks. **Nothing further is started: the owner plays first.** Open points he knows about: the size ladder of 15.2 sits below the opening size, a legal check on following a real campus's layout before release, and the real-iPhone checks.
- **Size goals (2026-11-12, on main, DESIGN.md 37; 37.11 is the as-built record):** a game begun on the model campus has `state.goals` (null on a game begun on the small campus). Everything that differs for such a game (applicants from reach, tuition, what marketing costs, the rank's pull, the goals) is keyed on that, never on the campus scale. Fall applicants there are `fallApplicants` in `src/sim/systems/demand.ts`: reach (11,000) times four causes (how the campus looks, marketing, football, academic rank), rounded cause by cause, so what the Size panel shows (`src/ui/sizeUi.ts`, opened from the student count) is what the intake uses. Do not add a fifth cause. Eight size goals (50,000 to 100,000) land only at an intake and eight rank goals (Top 175 to Top 10) only on rankings day; all are kept for good (`src/sim/systems/goals.ts`). Eras are worked out from the goals kept and unlock nothing yet: the owner wants each to unlock something real, to be proposed at the milestones layer (DESIGN.md 15.2). **The owner's money target for a model campus is $12 to $17 kept of every $100**, checked in `npm run simulate` on the casual and once-a-day players in years 3 to 8. A free building for a size goal is NOT switched on until the owner has picked from the sheet of candidates (`goals.rewards` is the counter waiting for it). The main street is Lantern Avenue, and `tests/goals.test.ts` fails if a current file says otherwise; old-version save fixtures keep the old value to prove the migration. Save version 15. The name the founding screen offers is Larp University (`DEFAULT_SCHOOL_NAME`, the owner's choice). **Changed the same day by the cap (see "Capacity, faculty and the cap" below): one size goal is left (50,000), the rank goals are the long climb, eras open by rank alone, and a free building now goes with a rank goal (still off).** On the later roadmap, not to build: Student mode (DESIGN.md 20.3).
- **Order on the streets (2026-11-12, on main, DESIGN.md 39):** stop signs at every junction, marked crossings, cars that stop for people and keep a gap. The rules of the road are in `src/app/traffic.ts`, pure and tested without Phaser (`tests/traffic.test.ts`); `src/game/Cars.ts` and `src/game/Walkers.ts` only draw. Traffic is for show: it never touches the sim or the save. Cars measure position with a cell's centre at a whole number, walkers with a cell's corner at a whole number. 587 tests and 46 simulate checks.
- **Capacity, faculty and the cap (2026-11-12, on main, DESIGN.md 38; 38.5 to 38.8 are the as-built record):** a game with goals never enrols more than 50,000 students (`enrollmentCap`, by the campus scale), and applicants past the room are turned away for good. One size goal is left and the eight rank goals are the long climb; the published rating moves a point a year at most (`RANK_STEP`), and the rank adds 25 in a hundred to applicants (`RANK_LIFT`). Faculty and staff are head counts in the save (`state.staffing`, `src/sim/systems/staffing.ts`): they arrive and leave a semester behind the students, nobody is let go, and over the summer only those the summer's students need are paid. The Instruction slider sets the ratio, 25 to 15 students to a member of faculty, in eleven steps. Class size is one number (`classPressure`), seats and faculty in equal parts. The student count opens one screen with two pages, Goals and Capacity (`src/sim/systems/capacity.ts`, `src/ui/sizeUi.ts`): nine rows, each OK, Tight or Short, and a shortfall never blocks. All of it is keyed on `state.goals`: a game begun on the small campus keeps faculty that follow its students at once, and its long-run tables must not move. Do not turn `LAG_EVERY_GAME` on: four small-campus long-run checks fail with it. **In the long run the Instruction slider is what holds a model campus inside the owner's $12 to $17 kept of every $100**; `npm run simulate -- --no-slider` shows the later weeks without it and is expected to fail one check. Save version 16, with `tests/fixtures/save-v15-model.json` as a game like the owner's own. 616 tests and 48 simulate checks. Not built: decay of empty buildings, the Scorecard.
- **A building for each rank goal (2026-11-12, on main, DESIGN.md 40; 40.3 onward is the as-built record):** the owner said "Yes, as shown" to the eight on his sheet. `RANK_REWARDS` in `src/sim/config/placed.ts` pairs the eight rank goals with them, in order. Which are waiting is worked out from the goals reached and the map (`rewardsWaiting` in `src/sim/systems/goals.ts`): nothing is saved for it, so do not add a list to the save. Each lifts desirability within six cells (`rewardLift`), the best in reach counting, and costs nothing to place or keep. They are earned, never sold: keep them out of `BUILD_ORDER`. A cleared one goes back to the Build menu. The drawings are the pack's own, as drawn, in the private atlas only. The names are the ones on his sheet; none is on the reference map. Save version 16 still. 632 tests and 50 simulate checks.
- **Era policies (2026-11-12, on main, DESIGN.md 41; 41.7 to 41.12 are the as-built record):** the owner approved what each era unlocks, one stop for each era, and the policies are the first stop. An era only adds: nothing a game can build today goes behind one. The eight policies are data in `src/sim/config/policies.ts`, each one gain and one named cost made of the ten kinds of `PolicyEffect`. No code outside that file may name a policy (a test scans for it): add a ninth as one more entry. Every effect goes through a hook in `src/sim/systems/policies.ts` that answers "nothing" on a game with no switch on. No fifth cause: a policy's effect on Happiness is added inside one of the four causes (`cause.policies`) and named on that cause's line. A changed switch is held until the next intake (`unlockPolicies` in `runIntake`). The page is the third page behind the student count, with a chip beside Inbox once Growth is reached. Two switches are one-sided and the owner has been told (Freshmen live on campus, Free student section). Save version 17. 662 tests and 53 simulate checks. `npm run simulate -- --no-policies` plays with every switch off. **Not built, and each waits for his word: the three Flagship buildings (41.3) and the three Legacy landmarks (41.4). No art sheet has been made for either.**
- **The daily layer (2026-11-12, DESIGN.md 42): agreed as a design with the owner. He said "Build it" on 2026-11-12: it is built one stop at a time in the order of 42.11, and a later stop is not begun until the one before is verified and he has been told.** A University Level, an orders board, collecting, decorating with photo mode, a workshop, a daily gift, a store with one earned currency, and accounts with cloud saves. Its rules are in 42.1: bonus only, every deadline 36 hours or longer, nothing behind a level or the store that a game has today, nothing taken away for being absent, and money buys time and looks, never power. The build order is 42.11, one stop each.
- **The daily layer, stop 1 (2026-11-12, on main, DESIGN.md 42.12 to 42.15):** the University Level, Gold Seals and collecting, on games with goals only. Every size is in `src/sim/config/daily.ts`: add a source of experience to `XP_SOURCES` or a level's gift to `LEVEL_UNLOCKS` and the Level page lists it. What a building holds to collect is worked out from time in `collectables` (`src/sim/systems/daily.ts`): never add a tick loop for it. Collecting pays experience and a capped little cash, and is not in the budget. "Finish now" works only on waits the game already had (`waits`), at a Seal for every six hours left; the owner's brief allows it on hiring, and it brings a rank goal up to two weeks sooner on some games. Experience never falls. The marker and burst are the gold medal on a ribbon, the Seal is the gold pin medal and the badge is the laurel wreath: the owner chose them from a sheet. Save version 18. 687 tests and 59 simulate checks. `npm run simulate -- --no-daily` plays with the layer untouched. **Stop 2 followed (next line).**
- **The daily layer, stop 2 (2026-11-12, on main, DESIGN.md 42.16 to 42.19):** the orders board. `src/sim/config/orders.ts` is all data (four givers, twenty kinds, the places, the hours, the cash cap); `src/sim/systems/orders.ts` reads progress from selectors when asked and never on a tick. An order is a stub until `seeOrders`, so its clock starts when the player first sees it. A second order comes on a day whose new order is a long one with nothing else for a sitting on the board (`ORDER_SECOND_FOR_TODAY`): about ten orders a week, kept by the main session and told to the owner. An order that means a yearly cost is asked only while the campus keeps $15 or more of every $100 (`ORDER_UPKEEP_KEPT`): it is what holds his money range. Orders pay experience, Seals and a capped little cash, never rank. The town pays experience until decorations exist. The row of buttons under the top bar is a number over a word (`src/ui/chips.ts`) and holds five at 375 wide. Save version 19. 721 tests and 66 simulate checks; `npm run simulate` now plays three sets and takes about eight minutes. `npm run simulate -- --no-orders` plays with the board untouched. **Next in 42.11, on his word: stop 3, decorating, the workshop and photo mode, with a sheet of art for him first.**
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
