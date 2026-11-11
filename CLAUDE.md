# Campus Tycoon: working rules for Claude

A mobile idle sim where the player runs a fictional Division I-style university. `DESIGN.md` is the source of truth for every design decision. Read it before proposing or building anything.

## Current status

- The owner said "build it" on 2026-11-11, for **Layer 0 only**.
- Layer 0 is built in four steps: sim core, map and zoning, intake loop, HUD.
- **Do not start Layer 1.** Stop when the first playable works and hand over the home-screen steps.

Update this section at the end of every layer.

| Layer | Name | Status |
|---|---|---|
| 0 | First playable | In progress: step 1 of 4 done (sim core) |
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
8. **Commit after each step inside a layer, with tests passing.** Do not push unless asked.
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
- `CREDITS.md` lists every pack in use and its licence.

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

- `npm test`: Vitest, all sim tests
- `npm run typecheck`: TypeScript with no output

Still to come in Layer 0, and this section must be updated when they land:

- `npm run dev`: local dev server
- `npm run simulate`: headless runs with the absent, casual and optimizer profiles
- `npm run build`: the static site for the home-screen web app
