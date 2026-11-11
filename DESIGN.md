# Campus Tycoon: Design

Working title. Written 2026-11-11 from the design discussion between the owner and Claude.

**Status: Layer 0, the first playable, is built and waiting for the owner to play it.** Nothing from Layer 1 has been started. Building goes one layer at a time (section 18). Distribution was set up early, on 2026-11-11, outside the layers: a public repository, the web build on Cloudflare Pages, and the iOS app for TestFlight (section 17.8).

How to read this document:

- **[T]** marks a tuning target: a number we expect to change during balancing. Every one lives in a config file and is listed again in section 22.
- Numbers without the mark are structural decisions.
- Each decision carries a short "why" so later sessions do not reopen settled questions.
- Section 21 lists what is still open.

---

## 1. The game

A mobile idle sim. The player is president of a fictional Division I-style university. The campus runs in real time, forever, with no win state and no game over. The player checks in two or three times a day for a few minutes to read what happened, make a few decisions, and build.

**Core loop:** zone land, the campus grows on its own, a class arrives and fills it, a bottleneck shows, the player fixes it.

**Baseline:** SimCity 2000 and SimCity 4, using the best version of each system. Borrowed from elsewhere: timers and gated unlocks from SimCity BuildIt, guest thoughts, yearly awards and ticket pricing from RollerCoaster Tycoon, the academic-year loop from Two Point Campus, monuments from Cities: Skylines.

**Legal:** every school, conference, mascot, chapter and person is fictional. No real university names, logos, fraternity or sorority names, or NCAA trademarks. Name generators are built so they cannot collide with real names (sections 11 and 14).

---

## 2. Standing rules

These apply to every system below and to every future proposal.

### 2.1 The eight design tests

A proposal that fails one is called out and fixed or dropped.

1. **Interdependence.** Zones must need each other. No system is solvable in isolation.
2. **Earned growth.** Density tiers upgrade on their own only when services, desirability and demand line up. Upgrades are the visible reward.
3. **Caps as puzzles.** Growth hits walls with a specific, discoverable cause and a specific fix. Every plateau answers "what is holding me back?"
4. **Legible feedback.** The player can always find out why something is failing, through advisors, overlays and the newspaper. Never punish with a cause the player cannot see. SimCity 4's commute-time abandonment is the anti-pattern.
5. **Edge of chaos.** Neglect-safe does not mean static. The campus always has a live tension or two.
6. **Long arc.** Era-based unlocks and late-game prestige landmarks, so a full map is not the end.
7. **Scale.** Maps must be big enough for creative layouts.
8. **Toy first.** No win or loss, and simple rules that combine into complex outcomes.

### 2.2 Idle constraints

- The sim advances on wall-clock time and catches up when the app opens.
- A neglected campus drifts toward mediocre. It never dies.
- Decisions wait in an inbox with safe defaults. Nothing blocks the simulation.
- Every check-in offers something to review, decide and build in a few minutes.

### 2.3 The check-in contract

Every system must help meet these three targets.

| Part | Target |
|---|---|
| Review | A newspaper edition greets each check-in after an hour or more away |
| Decide | About three new inbox decisions a day, deadlines of at least one day, at most four routine items open |
| Build | Income tuned so a typical gap between check-ins funds one meaningful purchase, and a week funds one big project |

### 2.4 House rules that came out of the discussion

| Rule | Why |
|---|---|
| The player pays for permission and conditions; the campus does the building | Keeps SimCity's split and makes growth while away the reward |
| The old building serves until the new one opens | Growing must never punish the player |
| Cash never causes decay | One failure, one consequence. Money trouble goes to the bailout, not to buildings |
| Every stall, loss and disaster names its cause and its fix | Test 4 |
| A default never locks the player in for more than one year | Missing one weekend must stay mildly worse, not ruinous |
| No annual decision has less than 48 hours to answer | Same reason |
| Keeping something never needs a tap | Traditions and defaults survive an absent player |
| Unlocks are permanent; standing can fall | Rewards are never taken away, and tension lives in the rankings |
| Generated things are stored, never regenerated | A later generator change must not alter an existing campus |

---

## 3. What we kept, changed and cut from SimCity

| SimCity system | Verdict | Our version |
|---|---|---|
| Zoning and organic growth | Kept as the core verb | Stamped lots that grow by stage (5, 6) |
| RCI demand meter | Rebuilt | Applicants are the demand, zones are the supply (7) |
| Land value | Kept | Desirability: one set of emitters, read differently by each zone (8) |
| Service radii | Kept | Circles that shrink when underfunded or overloaded (8) |
| Tax rates per wealth level | Kept | Three price levers, one per applicant tier (9) |
| Department funding | Kept | Five sliders with named consequences (9) |
| Ordinances | Kept | Campus policies (12) |
| Advisors and petitioners | Kept, merged | Four advisors who feed the inbox (12) |
| Newspaper and polls | Kept | The check-in digest (12) |
| Reward buildings and arcologies | Kept | Reward buildings, ceiling landmarks, prestige landmarks (15) |
| Disasters | Kept, softened | Rare inbox events, never save-ending (12) |
| City rating | Kept | Academic standing, athletic standing, student approval |
| Data maps | Kept, reduced | Four overlays (8) |
| Neighbor deals | Folded in | TV and donor deals in the inbox (10, 12) |
| Power, water and other networks | Cut | They were chores, and they fail while the player is away |
| Traffic simulation | Cut | Walk time to class survives as a desirability input |
| Terrain, pollution, garbage | Cut | Stadium and parking noise, plus three fixed map features |
| Regions | Later | Satellite campuses (20) |

---

## 4. Time and calendar

### 4.1 The clock

| Item | Value | Why |
|---|---|---|
| One game year | 7 real days (`REAL_MS_PER_GAME_YEAR`) | A weekly rhythm builds a habit |
| Tick | 1 real minute, so 10,080 ticks a year | Whole-day phases need a day to be a whole number of ticks. Live games reveal by quarter |
| Catch-up | On open or resume, advance from the last simulated moment to now | The core idle promise |
| Catch-up cap | 30 real days. Longer absences drop whole weeks | Dropping whole weeks keeps the weekly anchor aligned. The newspaper says how long the campus was paused |
| Clock moved backward | No advance, no crash | Device clocks get changed |

Clock speed never changes. An accelerated early game was rejected: the first football season would pass overnight, income per real hour would visibly fall as the clock slowed, and build timers would drift from the calendar.

### 4.2 The anchor

Intakes and marquee games must land in the player's waking hours.

- Setup asks one question: "When does your day usually start?", prefilled from the device clock.
- The **anchor hour** is two hours after that [T], stored in UTC.
- **Session one is unchanged.** The first class moves in fifteen minutes after setup, at any hour.
- A **founding day** of zero to twenty-four hours runs from that first intake to the first anchor hour. The normal week starts there. Only year one is longer.
- A **founding scrimmage** kicks off two hours after the first intake, so football exists on day one. It reuses the spring game. It is skipped when the founding day is shorter than five hours [T].
- The player can **shift the anchor** from settings. A shift stretches one summer by up to a day and never shortens anything, so it cannot dodge a deadline. It recharges every four weeks, because daylight saving and travel move people's mornings.

### 4.3 The week

Phases are whole days so every intake and report lands at the anchor hour. The earlier 56/56/14/42-hour split was replaced because it put the two intakes eight clock hours apart.

| Day | Phase | At the anchor hour | Football and other beats |
|---|---|---|---|
| 1 | Fall | Fall intake, waitlist opens | Two home games by day, two away overnight. Rush week begins |
| 2 | Fall | Rush results | Two home games by day, two away overnight. Homecoming is the afternoon game |
| 3 | Fall | Recruiting pitch opens | Two games, the rivalry last in the evening. Finals overnight |
| 4 | Spring | Spring intake, waitlist opens | Conference title game, then a bowl, if earned. Commencement speaker choice opens |
| 5 | Spring | Rankings day and signing day | Spring game in the evening. Coach and stadium decisions open. Finals overnight |
| 6 | Graduation | Commencement, donation drive | Seniors leave the roster. TV deal and Board goal open |
| 7 | Summer | Year-End report, decay verdicts | Annual decisions close at the next fall anchor |

Game slots [T]: day games at anchor +2 h and +8 h, overnight games at +14 h and +20 h. A morning visit finds two overnight results and later visits find one each.

**Spring is the prestige season.** National rankings publish, recruits sign and scholars commit, so each ladder has its own peak in the week.

### 4.4 Annual decisions

They open as soon as their facts are known, are staggered, and all close at the fall anchor. None extends into Fall, because stadium work cannot start in season and a late coach would miss game one.

| Decision | Opens | Window | Default |
|---|---|---|---|
| Recruiting pitch | Day 3, closes on signing day | 48 hours | Safe class |
| Commencement speaker | Day 4, closes at commencement | 48 hours | The Provost picks the safe speaker |
| Coach contract, final contract year only | Day 5 | 72 hours | One-year extension at market rate |
| Stadium upgrade, when a tier is earned | Day 5 | 72 hours | Stays as is; the earned tier stays banked |
| TV deal, renewal years only | Day 6 | 48 hours | Current deal rolls one year at slightly less money |
| Board goal | Day 6 | 48 hours | A steady year with no goal |

Annual items sit in their own inbox section and never count against the four-item cap. Routine arrivals pause while two or more annual items are open. A notification fires twelve hours before any annual item closes. Approving the stadium early gives more building days before Fall.

### 4.5 Calendar moments

| Moment | When | What happens |
|---|---|---|
| Rush week | After the fall intake | Students move from dorm beds into chapters (14.1) |
| Homecoming | Day 2 afternoon home game | Returning alumni, a parade, a donation spike |
| Finals | Overnight at the end of days 3 and 5, about ten hours [T] | The library's circle shrinks under load and approval dips |
| Spring concert | Day 5 | An ordinary inbox item: pick an act |
| Seasonal palettes | Across the week | Autumn, first snow, thaw, bloom, summer. Tints and particles in v1 |

### 4.6 First-week pacing

A weekly intake alone would make a new player wait seven days to learn whether zoning worked. Three rules fix that:

| Rule | Effect |
|---|---|
| Open on move-in day | A new game starts fifteen minutes before the first fall intake |
| Waitlist window | After every intake, turned-away applicants wait nine hours [T]. Capacity that opens in that window fills at once |
| Spring intake | A second class each year, about a fifth the size of fall [T] |

The demand bars are forecasts of the next intake, so they react within minutes of zoning. The player learns at once and gets paid at the intake.

### 4.7 The first three check-ins

| Check-in | Review | Decide | Build |
|---|---|---|---|
| Session one, ten minutes | Admitted students with no beds or seats | School name, colors, mascot, wake time | Housing and Academic lots, which rise in two minutes. The class moves in and the waitlist fills what is added next |
| That evening | Newspaper: the founding scrimmage, lots that grew a stage, the waitlist closed with a count lost | First advisor decision | A quad or a Campus Safety office. The desirability overlay appears |
| Next morning | Overnight income, first results, first size rung | Where the reward building goes | Student Life zoning unlocks. The spring forecast sets the next goal |

---

## 5. Map and zoning

### 5.1 Decisions

| Decision | Why |
|---|---|
| Stamped lots on one fixed grid. One lot is one cell and holds one building | Finger-sized targets, readable growth events, a bounded art list, cheap catch-up. This is how the original SimCity zoned |
| A path fills a whole cell, and a lot must touch a path to develop | SimCity's road rule. One fixed grid also lets merges line up later |
| Three zones: Housing, Academic, Student Life | Each has its own job (7.1), which is what makes them need each other |
| Athletics is not a zone | A stadium is a landmark, and the program is a management layer |
| Greek Row is a Housing brush variant, not a fourth zone | Section 14.1 |
| Drag to lay a row in one gesture, with a live cost preview before release. The same gesture fills a rectangle and upzones | Zoning a block must not take twenty taps |
| Hand-placed: paths, quads, parking, services, the stadium, reward buildings, landmarks | The player places infrastructure and landmarks only |
| Preserve toggle on any lot | SimCity 4's "historical" flag. A preserved lot never grows, redevelops or merges, so it is also the brake pedal against overbuilding |
| Footprint is stored per building from day one | Lot merging is on the later roadmap and must not need a rewrite |
| Land is bought in adjacent parcels for cash. The number ownable is set by era | Land gets a long arc, and the start stays generous |
| Three fixed map features: a lake, a town edge, a highway | They are emitters, not terrain, and they make each parcel a real choice |
| Map variety by seeded choice from hand-made pieces | Dozens of maps for little work, and no bad seeds |

### 5.2 Numbers

| Item | Value |
|---|---|
| Full map | 80 by 80 cells, in 25 parcels of 16 by 16 [T] |
| Starting land | 4 parcels [T] |
| Parcels ownable by era | Founding 4, Growth 10, Flagship 17, Legacy 25 [T] |
| Path reach | A lot must be edge-adjacent to a path [T] |

### 5.3 Map generation

The seed picks which side gets the town edge, which side gets the highway, and one of several pre-drawn lake placements. The starter campus always sits at the centre of the starting land with features at the edges, so the tutorial works on every map. The generated layout is stored in the save. Balance tests loop over seeds. The first playable uses one fixed map.

| Feature | Read by zones as |
|---|---|
| Lake | Liked by every zone |
| Town edge | Liked by Student Life and Greek Row |
| Highway | Noisy. Suits the stadium and parking |

---

## 6. Growth, redevelopment and decay

### 6.1 Decisions

| Decision | Why |
|---|---|
| Three density tiers of two stages each. Lots start low. Medium and high unlock by era, and the player pays to upzone | SimCity 4's model. Upzoning is the main late-game verb and money sink |
| Inside a tier, growth is automatic when demand, desirability and service gates line up | Test 2 |
| A stalled lot names the one thing holding it back | Test 3 |
| Redevelopment is a timed rebuild, and the old building keeps serving | Check-ins get reveals, and growing never tightens a bottleneck |
| Growth is free | The player pays for zoning, upzoning, paths, parks, services and landmarks |
| Overbuilding is the budget pressure | Upkeep rises with each stage and a building earns only from its occupants |
| Taller stages are cheaper per student when full and costlier when empty | Density raises both the reward and the risk |
| Decay warns first, then drops one stage. Four causes only. Never abandoned | Test 4, and no SimCity-style ghost buildings |
| Decay has a four-part brake (6.5) | A week away must not flatten the campus |

### 6.2 Stages

All capacities and timers are tuning targets.

| Stage | Tier | Housing beds | Academic seats | Student Life places | Greek beds | Rebuild time | Desirability needed |
|---|---|---|---|---|---|---|---|
| 1 | Low | 12 | 20 | 20 | 8 | 2 min | 20 |
| 2 | Low | 30 | 50 | 50 | 16 | 10 min | 35 |
| 3 | Medium | 60 | 100 | 100 | 28 | 45 min | 50 |
| 4 | Medium | 120 | 200 | 200 | 40 | 2 h | 60 |
| 5 | High | 200 | 350 | 350 | none | 6 h | 70 |
| 6 | High | 300 | 500 | 500 | none | 18 h | 80 |

Upkeep per building rises with stage while upkeep per bed or seat falls. That one curve produces the density economics.

### 6.3 How a lot grows

Every fifteen minutes [T], for each zone:

```
shortage = capacity wanted for the next intake - (capacity open + capacity under construction)
if shortage > 0:
    pick the eligible lot with the highest desirability
    start its rebuild to the next stage
eligible = not preserved, not Rundown, not already rebuilding,
           stage below the cap of its density tier,
           desirability >= the next stage's threshold,
           service gates for the next stage are met
```

Growth chases next fall's applicants, not current enrollment. A zone builds ahead of the class it expects, which makes growth a bet and makes balance the player's skill. Growing only to current enrollment would never overbuild and would fail test 5. Automatic balance across zones would solve the puzzle for the player and fail tests 1 and 3.

### 6.4 Stall causes

A stalled lot shows exactly one primary cause, with any others listed beneath it. Causes are checked in the order of the table.

| Cause | Fix |
|---|---|
| No path beside it | Lay a path next to the lot. Checked first, because nothing else matters until it is fixed |
| No demand | Raise applicant draw, or wait for the next class |
| Density cap | Upzone the lot, or reach the next era |
| No Campus Safety coverage | Place or fund Campus Safety. Gates medium density |
| No Health Center coverage | Place or fund a Health Center. Gates high density |
| Low desirability | The lot inspector names the top two minuses, such as stadium noise or a long walk |

### 6.5 Decay and its brake

A lot turns **Rundown** for one of four causes, each shown on the lot and in the newspaper:

| Cause | Trigger |
|---|---|
| Empty beds or seats | The zone is in surplus. The lowest-desirability lots are flagged until the surplus clears |
| Fallen desirability | The score sits below the stage's threshold by a margin of 8 [T] for a day [T] |
| Lost service coverage | The gate for the lot's stage is no longer met |
| Underfunded maintenance | The Facilities slider is below full funding. The share of lots flagged scales with the shortfall |

A Rundown building loses a quarter of its capacity [T] and costs half upkeep. It recovers when its cause clears.

The brake:

1. **Stage loss happens only at year-end.** A lot that has been Rundown for at least two real days [T] when the year closes drops one stage. That caps losses at one stage per lot per real week, on a date the newspaper announces.
2. **One-tier floor.** A building never falls more than one density tier, two stages, below the best stage it has reached.
3. **Cash never causes decay.** Decay reads occupancy, desirability, coverage and the maintenance slider. A cash shortfall goes to the bailout instead.
4. **Rundown is cheap and does not spread.** Half upkeep, and no drag on neighbors, so a shrunken campus gets cheaper to carry and settles.

If the simulation still shows a cliff, the next knob is a cap on how many lots may drop per year.

### 6.6 Where empty buildings come from

| Source | Mechanism |
|---|---|
| Lag | Buildings open during the year, but students arrive only at intakes |
| Lopsided zoning | A zone grows toward applicants while enrollment is held by the scarcest zone |
| Busts | Demand falls after the campus built for a peak |

---

## 7. Demand and admissions

### 7.1 Decisions

| Decision | Why |
|---|---|
| Applicants are the demand, zones are the supply, and enrollment is capped by the scarcest zone | Three needs of one population are not an RCI loop. This is the version that passes test 1 |
| Each zone has its own job | Housing sets beds and earns room fees. Academic sets seats and produces prestige. Student Life drives approval and retention and earns from foot traffic |
| Three demand bars that can go negative | Up is shortage, down is surplus. Surplus is the overbuilding warning |
| The tightest zone carries a Bottleneck tag and the count of qualified applicants turned away. Tapping it gives the number of lots that would fix it | The same number reads as lost income on the size ladder and as selectivity on the prestige ladder |
| Three applicant tiers that share buildings | They make the two ladders mechanically different without SimCity 4's wealth-specific lots |
| Recruited athletes are recruiting classes inside athletics | A few hundred people cannot move a zone bar, and star recruits are louder there |
| Selectivity is emergent: applicants per seat | A school that does not expand while demand is high becomes selective on its own |
| Each tier's pool has a ceiling lifted by a named landmark or deal | SimCity's demand caps. Tests 3 and 6 |
| The newspaper runs a yearly admissions story naming the top driver per tier | Three tiers across three zones could blur why a bar moved. Test 4 |

### 7.2 Applicant tiers

| Tier | Drawn by | Money | Beds needed | Gives the school |
|---|---|---|---|---|
| In-state | Low price, open seats | Low tuition plus state funding | About a third [T]; the rest commute and need parking | Steady volume. Barely reacts to prestige, so it is the neglect floor |
| Out-of-state | Football success, student life, reputation | High tuition | All | Profit and housing demand |
| Top scholars | Faculty, library, small classes | Cost scholarships | All | Academic prestige |

### 7.3 Forecast and intake

Coefficients are tuning targets. Shapes are decisions.

```
pool[tier]     = min(ceiling[tier], base[tier] * draw[tier])
draw[inState]  = priceEffect(inStateTuition) * mild(approval) * mild(academicStanding)
draw[outState] = priceEffect(outStateTuition) * strong(athleticStanding, academicStanding)
                 * mild(approval, studentLifeCoverage)
draw[scholar]  = strong(academicStanding) * mild(libraryCoverage, instructionFunding)
                 capped at scholarshipBudget / scholarshipCost
expected[tier] = pool[tier] * yield[tier]
```

At an intake:

```
1. Scholars are admitted first, up to the scholarship budget.
2. Find the largest share s <= 1 of the remaining expected students such that
       all students           <= free Academic seats
       all students           <= free Student Life places
       sum(bedNeed * students) <= free Housing beds
   In-state and out-of-state are admitted in proportion: s * expected[tier].
3. turnedAway[tier] = expected[tier] - admitted[tier]
4. The zone whose line bound s is the Bottleneck.
5. applicantsPerSeat = total expected / total admitted
```

The waitlist reruns step 2 for the turned-away students whenever capacity opens during the window. The spring intake runs the same steps on a smaller pool.

```
bar[zone] = (capacity wanted for the next intake - capacity open) / capacity open
```

### 7.4 Students

Students are simulated as cohorts by class year and tier, never as individuals. Retention is applied at each semester's end and falls with low approval. Seniors graduate on day 6 and join an alumni pool that grows forever and drives donations. Walkers, student cards and personalities are a readout of the cohorts (section 13).

---

## 8. Desirability, services and overlays

### 8.1 Decisions

| Decision | Why |
|---|---|
| One set of emitters, read differently by each zone | The stadium must be good for Student Life and bad for Housing. A single universal score would fail test 1 |
| Five inputs: neighboring zones, green space, landmarks, noise and eyesores, walk time to class along paths | Enough for a real placement puzzle and few enough to show on a phone |
| Walk time shows in minutes on every housing lot and in the overlay | It is our version of SimCity 4's commute, the named anti-pattern, so it must be the most visible number |
| Services gate stages and stay out of the score | Every stall then has a distinct label |
| A service circle shrinks when underfunded or overloaded | One visible circle carries both failures, and growth keeps service placement alive |
| Four overlays, and the right one appears while placing | Legibility without SimCity 4's dozen data views |
| No approval overlay | Approval is campus-wide. The newspaper poll covers it |

### 8.2 How each zone reads the emitters

```
score(lot, zone) = base + sum over emitters in range of weight[zone][kind] * falloff(distance)
                   - walkPenalty(zone, minutes)
```

`++` strong like, `+` like, `0` ignores, `-` dislike, `--` strong dislike. Radii and weights are tuning targets.

| Emitter | Housing | Academic | Student Life | Greek Row |
|---|---|---|---|---|
| Student Life lots | ++ | 0 | 0 | + |
| Academic lots | + | + | + | 0 |
| Housing lots, as foot traffic | 0 | 0 | + | + |
| Other chapter houses | - | - | 0 | ++ |
| Quads and parks | ++ | + | + | + |
| Reward and prestige landmarks | + | + | + | + |
| Library | 0 | ++ | 0 | 0 |
| Stadium noise, widening by tier | -- | - | ++ | + |
| Parking | - | - | 0 | 0 |
| Highway | -- | - | 0 | 0 |
| Lake | ++ | + | + | + |
| Town edge | 0 | 0 | ++ | + |
| Isolation, no foot traffic | 0 | 0 | -- | - |
| Walk to class beyond 8 minutes [T] | - | not used | 0 | 0 |

Walk time is the path distance from a housing lot to the nearest Academic lot, counted along paths. Shuttle stops shorten it.

### 8.3 Services

```
effectiveRadius = baseRadius * fundingFactor(Student Services slider) * min(1, capacity / load)
```

| Service | Gate | Ongoing effect |
|---|---|---|
| Campus Safety | Medium density | Less mischief damage inside its circle |
| Health Center | High density | Better retention |
| Library | None | Lifts Academic desirability and draws scholars |
| Shuttle stop | None | Cuts walk time between stops. First cut if scope slips |
| Parking | None | Commuter capacity for in-state students, and an eyesore |

Campus Safety handles mischief, not crime (section 16).

### 8.4 Overlays

| Overlay | Shows |
|---|---|
| Growth | Each lot coloured by its stall cause, plus Rundown risk |
| Desirability | A zone picker, the score, the top pluses and minuses, walk minutes on housing |
| Coverage | A service picker, each circle, and a ghost outline of its full size |
| Money | Each lot's net income per real hour |

---

## 9. Money

### 9.1 Decisions

| Decision | Why |
|---|---|
| Three price levers: in-state tuition, out-of-state tuition, scholarship budget | SimCity 4's tax rate per wealth level |
| Five steps per lever, with the forecast shown before commit | Legible and thumb-friendly |
| A new price bills from the next intake | Stops raising tuition after move-in and dropping it before admissions |
| A hike hits student approval at once | Enrolled students react now, and the money follows later |
| Seats split in proportion to applicants, after scholars | Prices alone steer the mix. No fourth lever |
| State funding follows the in-state share | Chasing out-of-state money costs state money |
| Five funding sliders as a percentage of need | Need scales with the campus, so full funding stays the safe default |
| Overfunding to about 120 percent with three guards | Gives late-game cash a use and makes the ladders play differently |
| Bailout only in v1; bonds later | One safety net is enough for the first release |
| An endowment the player can pay into | A late-game cash sink, a permanent income, and the headline legacy number |
| Faculty are folded into the Instruction slider | Only the head coach is hired individually |
| The HUD shows cash and net income per real hour | Idle progress must be legible. Tapping it opens the budget screen |

### 9.2 Budget lines

| Income | Notes |
|---|---|
| In-state tuition | Lever, five steps |
| Out-of-state tuition | Lever, five steps |
| State funding | Per in-state student, scaled by the in-state share |
| Room fees | Per occupied bed |
| Student Life foot traffic | Per student served, with game-day bursts |
| Tickets, concessions, merchandise | Per home game |
| TV and conference deal | Negotiated |
| Alumni donations | Alumni pool times affinity |
| Endowment income | Small permanent yield |
| One-off gifts and naming deals | Inbox |

| Spending | Notes |
|---|---|
| Instruction | Slider |
| Facilities | Slider. All building and stadium upkeep lives here |
| Student Services | Slider. Runs the service circles |
| Student Life | Slider |
| Athletics | Slider. Includes the coach |
| Scholarships | Lever |
| Events and one-offs | Inbox |
| Projects | Zoning, upzoning, paths, parks, services, landmarks, stadium tiers, land |

### 9.3 Sliders

| Slider | When underfunded | Above full funding |
|---|---|---|
| Instruction | Classes swell, academic rating falls, scholars leave | Academic rating and scholar draw |
| Student Services | Safety, health and shuttle circles shrink | Bigger circles, so fewer buildings needed |
| Facilities | Buildings turn Rundown | A small desirability lift across campus |
| Student Life | Approval and retention fall | Approval and retention |
| Athletics | Team rating and recruiting fall | Team rating and recruiting |

Overfunding guards:

1. Cost climbs steeply above full funding, so the player can afford to max one or two sliders, not all five.
2. Bonuses follow the past year's average funding, which stops boosting Athletics the hour before kickoff.
3. A bailout caps every slider at 100 percent during its freeze, so the state never pays for a bonus.

### 9.4 Budget targets

Design targets for a mid-game campus on each ladder. They are tuning goals, not measurements. Unit prices are solved from these shares during the balance pass.

| Income line | Size ladder | Prestige ladder |
|---|---|---|
| In-state tuition | 22% | 16% |
| Out-of-state tuition | 24% | 30% |
| State funding | 14% | 9% |
| Room fees | 13% | 13% |
| Student Life foot traffic | 7% | 6% |
| Tickets, concessions, merchandise | 6% | 2% |
| TV and conference deal | 5% | 1% |
| Alumni donations | 8% | 21% |
| One-off gifts and naming deals | 1% | 2% |

| Spending, as a share of income | Size ladder | Prestige ladder |
|---|---|---|
| Instruction | 33% | 40% |
| Facilities | 19% | 18% |
| Student Services | 7% | 6% |
| Student Life | 7% | 7% |
| Athletics | 13% | 5% |
| Scholarships | 4% | 12% |
| Events and one-offs | 2% | 2% |
| Left for projects | 15% | 10% |

### 9.5 Deficits and the endowment

When cash would go below zero at the daily check:

```
1. The endowment covers the shortfall first.
2. If cash is still negative, the state covers it: the academic rating takes a hit that grows with
   each repeat, new zoning and placement freeze for a while, and every slider is capped at 100%.
3. The game never ends.
```

Cash paid into the endowment cannot be withdrawn. It earns a small permanent income [T]. Because a deficit draws on it before the state steps in, nobody can hoard and take a bailout.

---

## 10. Athletics

Athletics is half the fantasy, so it stays loud: game days visibly change the campus and the stadium is a long upgrade path.

### 10.1 The money model

| Stage of the game | Football is |
|---|---|
| Early | A cost. A small stadium sells few tickets and has no TV deal |
| Mid-game | A loss leader. Its own lines lose money. It pays back through out-of-state applicants, donations and game-day foot traffic, and only if the campus has the beds and Student Life lots to cash that in |
| Late | A profit centre for the few. Only a top-tier stadium with a top TV deal turns a direct profit |
| Always | A swing. Coach and upkeep costs are fixed, and returns move with the season |

A pure profit centre would be a dominant strategy and fail tests 1 and 5. A pure gamble would fail test 4. The Athletic Director's page shows a football profit-and-loss line that includes the applicants it drew.

### 10.2 Decisions

| Decision | Why |
|---|---|
| Ten regular-season games | Twelve would push the rivalry overnight. Nine would leave no result waiting in the morning |
| Home games take the day slots; away games play overnight | The player can watch game day, and wakes to results |
| Twelve-team conference in two divisions: one opener, five division games, four crossovers | Gives a title game between division winners |
| Tiered bowls, the top bowl being the national title | A postseason without a bracket. The playoff bracket is later |
| Team rating from four visible inputs | Head coach, roster talent, stadium tier, Athletics funding. Every loss recap names the biggest gap |
| Roster talent is the average of the last four signing classes | Each class matters for four years, so investment pays off slowly |
| One pitch choice per signing class | Safe class, or chase a star who may sign elsewhere. Recruit-by-recruit is too active for an idle game |
| The coach has one rating and one trait | Hired or renewed in summer |
| Five stadium tiers, each earned by a season of near sell-outs | Test 2 applied to the stadium |
| A ticket price lever in five steps | Cheap tickets fill seats and earn the next tier. Dear tickets earn more now |
| Stadium work starts only in the off-season, on a footprint reserved from the start | The old stadium serves until the new tier opens |
| Before tier one, the team rents a field in town | The first stadium is an early goal |
| Each stadium tier widens its noise radius and game-day crowd | Nearby housing runs down and the area needs rezoning. This keeps athletics loud on the map |
| Live games: forty real minutes, score by quarter, computed at kickoff | Appointment viewing that stays deterministic |
| TV and conference deals are negotiated in the inbox | A long safe deal, or a short one that bets on the next seasons. Better deals need a higher stadium tier and lift the out-of-state ceiling |
| No weekly football chore | In-season decisions come from football-flavoured inbox events |
| An athletics beat in every phase | Section 4.3 |
| Basketball is later, as the spring sport | Scope |

### 10.3 Team rating and game simulation

```
rating  = wCoach * coach + wRoster * roster + wStadium * stadiumTierScore + wFunding * fundingScore
roster  = average of the last four signing-class ratings
class   = f(last season's record, athletic standing, coach, funding, stadium tier), then the pitch outcome

diff    = ratingHome + homeEdge - ratingAway
pWin    = 1 / (1 + exp(-diff / k))        k set so a 10-point edge wins about three games in four [T]
```

At kickoff the whole game is rolled from the seeded generator: the winner, then quarter-by-quarter scores. The scores are revealed by the clock over forty minutes. The recap picks a template by margin and upset, and names the largest rating gap.

```
attendance = min(seats, fanDemand(enrollment, alumni, athletic standing, streak, ticket step,
                                  rivalry or homecoming))
tier earned = season average attendance >= 95% of seats [T]
```

### 10.4 Game day

At home games, crowds in school colors walk the paths to the stadium, tailgates fill the parking lots, the marching band forms up, and Student Life lots on the route earn a burst. The noise radius is live. The rivalry game can end in a **field storming** where Campus Safety coverage is thin: fans carry off the goalposts, and the damage is to property and pride.

---

## 11. The national field

"Top 25" needs schools to be ranked against, and standing must be able to fall while the player stands still.

| Decision | Why |
|---|---|
| 200 schools including the player [T] | Enough for every prestige rung down to Top 175 |
| Generated from the seed out of hand-made name parts built on invented place names | Collision-proof with real schools. A blocklist and one manual review of the parts are the second line |
| Stored in the save, never rebuilt from the seed | House rule |
| Each school has a long-run pedigree and a current rating, for academics and for football | Standing has both stability and movement |
| The eleven conference rivals are members of the field, with every game simulated | One world, not two |
| The other 188 get one sampled season record a year | Cheap, and enough for a poll |
| Bowl opponents come from a similar poll position; the top bowl is first against second | No bracket needed |
| The field does not rise over time | It must not be a treadmill |

```
each year, for each school and each of {academic, athletic}:
    rating = rating + pull * (pedigree - rating) + yearlyShock + arcStep
    a school sometimes starts a multi-year arc, a steady rise or fall
    pedigree itself drifts very slowly

academic rank  = position of the rating among the 200
football poll  = schools sorted by season result, weighted by opponent strength
```

Cost is about a thousand operations per game year, which is nothing in catch-up.

The rankings-day story lists the movers. When the player falls while standing still, it says who passed them and why. Conference rivals' arcs get named stories.

---

## 12. Advisors, inbox, policies, events and the newspaper

### 12.1 Decisions

| Decision | Why |
|---|---|
| Four advisors, each with one top-issue line | The line names the binding constraint in their domain. It is the campus-level version of a lot's stall cause |
| Advisors send the petitions | One voice per domain |
| Four kinds of inbox item | Annual business, petitions, deals with strings, events |
| Petitions are triggered by the campus's real state | Never by a dice roll alone. Test 4 |
| Every item shows the advisor's pick and marks the default | The player always knows what happens if they do nothing |
| Most items resolve at once; a few scandals run as two-step chains | Some edge of chaos without a quest log |
| Policies are a flat list, each with one benefit and one named cost beyond money | SimCity 2000's ordinances. A pure-benefit policy would be a dominant choice |
| A changed policy locks until the next intake | Stops flip-flopping around admissions |
| About fourteen policies in v1, unlocked by era | Twelve plus the two for Greek Row |
| Disasters are rare, show a risk factor first, and do repairable damage | Never save-ending. The story names what would have reduced it |
| The newspaper is the check-in digest | It carries a poll of top student complaints, RollerCoaster Tycoon's guest thoughts added up |
| About sixty-five content items for launch | Templated petitions name the player's own buildings. If writing runs long, the cadence drops to two a day before any system is cut |

### 12.2 Advisors

| Advisor | Domain | Example top issue |
|---|---|---|
| Provost | Academic zone, Instruction, scholars, rankings | "Academic seats are the bottleneck: 412 turned away" |
| CFO | Budget, overbuilding, deficits | "Housing is 18% empty and losing money every hour" |
| Athletic Director | Football, stadium, deals | "Five sell-outs in five: the next tier is earned" |
| Dean of Students | Housing, Student Life, approval, safety, Greek Row | "38 housing lots stalled by stadium noise" |

### 12.3 Starting policy list

Final wording follows the tone guide.

| Policy | Helps | Costs |
|---|---|---|
| Quiet Hours | Less mischief | Approval and Student Life income |
| Need-blind admissions | In-state and scholar applicants | Scholarship spending |
| Athlete tutoring | Fewer eligibility crises | Instruction budget |
| Freshman live-on rule | Full dorms and room fees | Approval and commuter applicants |
| Night games | TV money | Longer noise hours near the stadium |
| Free student section | Attendance and approval | Ticket income |
| Parking fees | Income | Commuter approval |
| Tough grading | Academic rating | Retention |
| All-night library | Scholar draw, a softer finals dip | A bigger library load |
| Hiring freeze | Lower Instruction need | Academic rating |
| Naming rights | Income | Approval |
| Tuition freeze pledge | Approval | Price levers lock for a year |
| Deferred Rush | Less academic drag | Fall approval |
| Chapter Grade Standard | Less academic drag | Chapter membership |

### 12.4 Events

All sit inside the tone guide (section 16).

| Event | Risk factor shown first | Damage |
|---|---|---|
| Recruiting scandal, two steps | High Athletics overfunding, a win-at-all-costs coach trait | Athletic rating, a fine |
| Faculty walkout threat | Instruction underfunded | Temporary academic penalty |
| Dorm flood | A Rundown dorm | Repair timer on one building |
| Field storming | Thin safety coverage at the stadium | Goalposts, a repair bill |
| Mascot theft | Rivalry week, thin safety coverage | Approval until it is recovered |
| Parking uprising | Parking shortage | Approval |
| Grade inflation exposé | Tough grading off, weak Instruction | Academic rating |
| A booster's suspicious gift of a boat | A big donor deal accepted earlier | A choice between cash and reputation |
| Professor feuds with the marching band | Academic lots inside the stadium's noise | Approval, a noise ruling |
| A rival's prank | Rivalry week | A statue wears the wrong colours for a day |

### 12.5 The newspaper

Each edition has a headline for the largest change, three to five stories, the student poll, scores, a "decisions waiting" box and a "closing soon" box. Yearly features: the admissions story with the top driver per tier and applicants per seat, the rankings-day movers, the awards. Flavour stories are each tied to a real stat: clubs that formed, the Dorm Cup winner, named town businesses, landmark superstitions.

---

## 13. Students, walkers and personalities

### 13.1 Decisions

| Decision | Why |
|---|---|
| Students are cohorts in the sim; walkers are a sampled readout | Catch-up stays fast |
| Tapping a walker opens a student card with a thought | RollerCoaster Tycoon's guest thoughts are the best feedback device in tycoon games |
| Each walker and card is built from four attributes: archetype, quirk, major, class year | Content is written per attribute, never per combination, so about 50 archetypes and 12 quirks give tens of thousands of distinct students |
| The mix is a readout, not decoration | Each archetype's share is computed from real campus state, so the crowd itself is feedback. Test 4 |
| Cohort-level only | Nothing here may slow catch-up |
| Each archetype has a thought pool tied to a real stat, gathering places, a visual tell, and a small aggregate effect where it makes sense | The player can read the campus by looking at it, and the crowd nudges the campus back a little |
| Eighteen archetypes and six quirks ship in v1; the rest arrive as content updates | Adding one is data, not code |
| A handful of named regulars in every entering class | Followable students give the campus faces |
| Non-student characters as flavour | More voices for the same stats |
| Jokes aim at types and institutions and never demean a student | Tone guide |

### 13.2 How the mix is computed

No per-student state is stored. For each cohort:

```
weight[a] = base[a] * classYearCurve[a][classYear] * stateDriver[a](campus) * eventModifier[a](calendar)
mix       = weights normalised to sum to 1
```

The state drivers read real campus state: the funding sliders, zone balance, Greek Row size, team results, walk times, finals week and active policies. A walker's archetype is drawn from its cohort's mix using a seed derived from the walker's id, so the same walker stays the same student until its cohort's mix changes materially.

### 13.3 Transitions at cohort level

Transitions are class-year curves and event modifiers, not per-student memory.

| Transition | Rule |
|---|---|
| Lost Freshman ages out | A large share of a new freshman cohort at intake [T], falling through the first year, zero from sophomore year |
| Homesick fades | Out-of-state freshmen only, strongest in the first term, gone by the second year. Lower when approval and Student Life coverage are high |
| Pledge becomes Greek Loyalist | New chapter members read as Pledge for one term after rush, then as Greek Loyalist |
| Finals push many into Stressed-Out | During each finals window a share of every cohort [T] reads as Stressed-Out, drawn least from Slacker and Party Animal. It reverts afterward |
| Game days swell Superfan | Doubled on home game days and after big wins |
| A tuition hike swells Broke Student | For one term after a price step up |
| Super Senior grows | Seniors only, rising when the graduation rate is low or Academic seats are the bottleneck |
| Attention Seeker follows the mood | Rises whenever approval has moved sharply, in either direction |

### 13.4 The eighteen for v1

The list grew from fifteen to eighteen rather than swapping three out, so every campus stat keeps an archetype that reflects it. Party Animal, Charmer and Attention Seeker are the additions.

| Archetype | Reads | Gathers at | Visual tell | Small effect |
|---|---|---|---|---|
| Lost Freshman | Intake size, walk time | Wandering paths, wrong buildings | A map held upside down | None |
| Homesick | Out-of-state share, first-term retention, Health Center coverage | Dorm steps | A care package | None |
| Commuter | In-state share, parking | Parking lots | Car keys | None |
| Broke Student | Price levers | Free-food events | An empty wallet | None |
| Scholar | Scholar tier, academic standing, library | The library | A tower of books | A slight lift to the academic rating |
| Stressed-Out | Instruction funding, finals, library load | Library and Academic lots | Coffee in both hands | None |
| Slacker | Weak academic rating, academic drag | Quads | Asleep on the grass | A slight drag on the academic rating |
| Superfan | Athletic standing, attendance, traditions | The stadium | A foam finger | Slightly higher attendance |
| Varsity Athlete | Recruiting, eligibility, Athletics funding | Stadium and practice paths | A letter jacket | None |
| Greek Loyalist | Chapter membership and standing | Chapter houses | Letters on a shirt | None |
| Pledge | Rush week | Chapter porches | Carrying everyone's things | None |
| Social Butterfly | Student Life coverage, approval | Student Life lots | Waving at everyone | Slightly better retention |
| Resident Advisor | Housing crowding, Rundown buildings, Facilities | Dorm entrances | A clipboard | Slightly less mischief in dorms |
| Super Senior | Graduation rate, the Academic bottleneck | Everywhere, unhurried | A cap from three years ago | None |
| Class Clown | Campus Safety coverage, mischief | Near statues | A traffic cone | Slightly more prank petitions |
| Party Animal | Student Life coverage, Greek Row size | Student Life lots by evening, a bench by morning | A party hat, still on | Slightly more Student Life income, a slight drag on the academic rating |
| Charmer | Campus beauty: green space and average Housing desirability | Quads and the lake | A single flower, a slow stroll | None |
| Attention Seeker | How fast approval is moving | Wherever the biggest crowd is | Filming themselves | Approval swings a little faster |

**Six quirks for v1**, each with a visible behaviour and a stat it echoes:

| Quirk | Behaviour | Echoes |
|---|---|---|
| Night owl | Appears at night | Quiet Hours |
| Always late | Runs | Walk time |
| Always hungry | Lingers at dining lots | Student Life coverage |
| Caffeine-powered | Lingers at cafés, more in finals | Finals |
| Skateboards everywhere | Moves fast on paths | The path network |
| Feeds the squirrels | Idles in quads | Green space |

**Thought selection:** if the archetype's linked stat is notable, the card shows a line from the archetype's pool about that stat. Otherwise it shows the campus's top complaint from the poll. Either way the joke sits on top and the real number sits underneath.

**Small effects** are capped [T], computed at cohort level from how far a share sits from its baseline, and applied from the previous day's mix so they cannot loop. No effect is ever the only cause of anything.

**The full catalogue** of about fifty archetypes and twelve quirks, as supplied by the owner, is content for later updates.

### 13.5 Named regulars

A handful of students in every entering class [T] are named and followable for four years. They are stored in the save with a name and the four attributes, follow the same transition rules, and are quoted in the newspaper. They graduate into the alumni pool and sometimes into the hall of fame.

### 13.6 Non-student characters

Flavour walkers with small thought pools, each tied to a stat.

| Character | Voices |
|---|---|
| Professor | Instruction funding, class size |
| Coach | Team rating |
| Campus safety officer | Coverage, mischief |
| Booster | Donations and deals |
| Tour-group parents | The applicant forecast and campus desirability |
| A townie who hates game day | Stadium noise, the town edge |
| The mascot | Approval, game day |
| A campus squirrel | Green space |

### 13.7 Tone for personalities

Jokes aim at types and institutions and never demean a student. The Party Animal carries no alcohol reference: they are always coming from a party and sleep through morning class. The Charmer stays at harmless flirting. Homesick, Stressed-Out, Heartbroken and Broke Student stay comic and never imply a crisis.

---

## 14. Identity: Greek Row, traditions and flavour

### 14.1 Greek Row

| Decision | Why |
|---|---|
| A Housing brush variant, capped at medium density, with fewer beds than a dorm | Its value is approval, retention and giving, not capacity |
| Chapter names are one or two Greek letters plus a clearly non-Greek joke word, such as Kappa Llama | A blocklist cannot be complete, because thousands of real chapters exist. These names cannot collide by construction. The blocklist stays as a second line |
| It reads emitters as Student Life does, gets a bonus beside other chapters, ignores noise, and emits noise | The Row lands on the loud land near the stadium that Housing rejects. Test 1 |
| Rush week moves students from dorm beds into chapters, shown inside the Housing bar | No fourth demand bar |
| Each chapter is Good, on Warning, or on Probation | Prank risk is visible first: an overfull house or thin safety coverage |
| Philanthropy events offset the downside | A reason to say yes to chapter petitions |
| Two policies: Deferred Rush and Chapter Grade Standard | Each trades something for less academic drag |
| Unlocks in the Growth era | It suits a campus that has a town edge and a stadium to put it near |
| Pranks and rivalries only. No alcohol | Tone guide |

| Upside | Downside |
|---|---|
| Approval | Noise that Housing and Academic dislike |
| Retention | A drag on the academic rating, scaled by the Greek share of enrollment |
| Higher alumni giving | Prank incidents in the inbox |

Greek Row is the biggest identity item. It is the last thing cut (section 20).

### 14.2 Traditions

| Decision | Why |
|---|---|
| Four slots: the first at the first Year-End, then one per era | A tradition early, and more as the school ages |
| The player picks from about eight | Choice gives each campus its own character |
| Keeping one never needs a tap | Each has a standing condition the player must not cut. It is checked on its day each year |
| Strength grows with the streak | The reward for consistency, with diminishing returns |
| The card shows "at risk" when the condition is failing | Test 4 |
| Breaking one costs approval and giving, scaled by the streak, which then resets | A real cost for cutting the thing it depends on |
| Streaks appear in the record book | Traditions are the v1 form of the heritage bonus |

| Tradition | Its day | Standing condition | Lifts |
|---|---|---|---|
| Rivalry bonfire | Eve of the rivalry game | An open quad kept clear inside Campus Safety coverage | Approval, an edge in the rivalry game |
| Fight song | Every home game | Student Life at full funding, which keeps the marching band | Attendance, approval |
| Lucky statue | Finals nights | The statue stays standing and on a path | A softer finals dip, retention |
| Rivalry trophy | The rivalry game | Always met; a bonus while the school holds the trophy | Donations |
| Homecoming parade | Homecoming | An unbroken path from the town edge to the stadium | The donation spike |
| Victory bell | After home wins | The bell tower stays standing | Approval after wins |
| Senior walk | Commencement | The gate stays, with a path through the main quad | The graduating class's alumni affinity |
| Midnight breakfast | Finals nights | Student Life at full funding | Approval during finals |

### 14.3 Flavour that is nearly free

| Item | Form |
|---|---|
| Commencement speaker | One annual inbox item |
| Spring concert | One ordinary inbox item |
| Clubs that form on their own | Newspaper stories tied to Student Life surplus |
| Dorm rivalries | The Dorm Cup, won by the highest-desirability hall |
| Named town-edge businesses | Names in stories and petitions |
| Landmark superstitions | Text on reward-building cards |
| Marching band | A walker formation on game day |
| Named buildings | Every grown building gets a name |

---

## 15. Milestones, rewards, the late game and legacy

### 15.1 Decisions

| Decision | Why |
|---|---|
| Two ladders, size and prestige, of eight rungs each | The size-versus-selectivity choice is the game's best strategic tension |
| The big-name, huge-enrollment school is the default path and the one the tutorial steers toward | Small and selective is the alternate strategy |
| Four eras shared by both ladders. Reaching an era on either ladder unlocks the shared content | Neither strategy is locked out of density, land or policies |
| Rungs and unlocks are permanent; standing can fall | Test 5 lives in the standing |
| Size rungs land at intakes; prestige rungs land on rankings day | Each ladder has its moment |
| Three reward classes | Free reward buildings, paid ceiling landmarks with checklists, prestige landmarks |
| The late game is renewable goals | Section 15.4 |
| A legacy screen with four tabs | Timeline, record book, trophy case, hall of fame |

### 15.2 Eras

All thresholds are tuning targets.

| Era | Size ladder | Prestige ladder | Shared unlocks |
|---|---|---|---|
| Founding | Start | Start | Low density, Housing and Academic, quads, parking, Campus Safety, Library. Student Life at the first size rung. First tradition slot at the first Year-End |
| Growth | 6,000 students | Top 125 | Medium density, Greek Row, Health Center, Shuttle, more land, more policies, a tradition slot |
| Flagship | 15,000 students | Top 75 | High density, more land, more policies, a tradition slot |
| Legacy | 30,000 students | Top 25 | Prestige landmarks, the last land, a tradition slot |

Rungs [T]: size at 500, 2,000, 6,000, 10,000, 15,000, 22,000, 30,000 and 40,000 students. Prestige at Top 175, 150, 125, 100, 75, 50, 25 and 10.

Pacing targets [T]: Growth around week 5, Flagship around week 12, Legacy around week 20. A perfect player should not top both ladders before about six real months.

### 15.3 Rewards

| Class | Rules |
|---|---|
| Reward buildings | One is free at each rung, such as the bell tower or the president's mansion. They wait in the build menu and never expire. They emit desirability |
| Ceiling landmarks | Paid. Each lifts one tier's applicant ceiling and shows its requirement checklist. Starting set: a Welcome Center for out-of-state, an Honors College for scholars, a Commuter Hub for in-state. TV deals also lift out-of-state |
| Prestige landmarks | Our arcologies. Legacy era, a huge footprint, a multi-day build, one campus-wide effect. Three in v1, one per rating: a Grand Library, a Hall of Champions, a Founders' Commons |

### 15.4 The late game

What keeps check-ins interesting once the map is full:

| Source | How |
|---|---|
| Two rebuild waves | Each new density tier lets the campus be upzoned and rebuilt over real weeks |
| The stadium pushes back | Each tier widens its noise, forcing rezoning nearby |
| Prestige landmarks need room | A full map forces choices about what to clear |
| Demand shifts | As the applicant mix changes, lots need rezoning |
| The double | Holding the top of both ladders at once. Growth lowers selectivity, so it is hard |
| Yearly awards | About ten, including comic booby prizes such as Worst Parking in the Nation |
| Board goals | Each summer, pick one of three goals built from the campus's weakest areas. Reward only, no penalty |
| Hall of fame | Star players, coaches and notable alumni. Alumni return as donors and sometimes as coaching candidates |
| Endowment | Section 9.5 |
| The seasons never end | Football, rankings, the rivalry series |

The map alone will not carry the late game forever. The roadmap (section 20) extends it.

### 15.5 The legacy screen

| Tab | Holds |
|---|---|
| Timeline | One card per year, from the Year-End report |
| Record book | All-time bests, the rivalry series, tradition streaks |
| Trophy case | Titles, bowls, awards, rungs reached |
| Hall of fame | Coaches, star players, notable alumni |

---

## 16. Tone guide and age rating

This section is written before any inbox or newspaper content.

### 16.1 Voice

Light and satirical, like SimCity 2000's newspaper: funny and useful at once.

1. **The joke sits on top and the number sits underneath.** Every item carries real information.
2. **Jokes aim at institutions, never at students.** Administration, boosters, parking, bureaucracy and rival schools are fair game.
3. **Events harm buildings, budgets and pride, never people.**
4. Scandals and incidents stay in comic territory: mascot theft, a booster's suspicious gift of a boat, a parking uprising, a professor's feud with the marching band, grade inflation, a rival's prank.
5. Nothing depicts or implies serious real-world harm to students.
6. **No alcohol, tobacco or drug references anywhere.** Not as policy flavour, not in art, not in names.
7. No betting or gambling storylines.
8. No insult humour. The satire may have bite, but not at a person's expense.

### 16.2 Vocabulary

| Say | Not |
|---|---|
| Quiet Hours | Dry campus |
| Field storming | Riot |
| Mischief | Crime |
| Tailgate, with grills and tents | Any drink |
| Most Spirited Campus | Party school |

Student archetypes that touch feelings, such as Homesick, Stressed-Out, Heartbroken and Broke Student, stay comic and never imply a crisis. A Party Animal's parties are pizza and music.

### 16.3 Age rating

Apple's current tiers are 4+, 9+, 13+, 16+ and 18+, set by a content questionnaire.

| What the content includes | Resulting rating |
|---|---|
| Any alcohol, tobacco or drug reference, even infrequent | 13+ |
| Simulated gambling | 13+ |
| Cartoon violence | 9+ |
| Crude or insult-based humour | 9+ |
| None of the above | 4+ |

**Target: 4+, without flattening the satire. 9+ is acceptable if the humour needs bite. 13+ is not.** The table was read through a summary of Apple's page on 2026-11-11, so the questionnaire must be rechecked at submission. Later features that could raise the rating: social features, shared names, unrestricted web access.

---

## 17. Technical foundation

### 17.1 Stack

Phaser 3, TypeScript and Vite. Capacitor wraps the game for iOS. The app shell was brought forward to 2026-11-11 so the first playable can be tested through TestFlight (section 17.8). The first playable is also a home-screen web app. Touch-first: pan, pinch-zoom, tap to select, drag to place.

### 17.2 Structure

```
campus-tycoon/
  DESIGN.md  CLAUDE.md  CREDITS.md
  art/source/                               downloaded packs, not committed
  index.html  package.json  vite.config.ts  tsconfig.json
  public/
    manifest.webmanifest  icons/
    assets/manifest.json  assets/atlas.*    sprites in use, packed, swappable by manifest edit
  scripts/simulate.ts                       npm run simulate
  src/
    main.ts                                 boot: load save, advance to now, start Phaser and the UI
    app/                                    platform glue: clock, store, persistence, lifecycle, notifications
    sim/                                    pure TypeScript, zero engine imports
      advance.ts  actions.ts  rng.ts  calendar.ts  timers.ts  save.ts  newGame.ts  selectors.ts  types.ts
      systems/                              one file per system in sections 5 to 15
      config/                               every tuning number, one file per system
      content/                              inbox items, policies, traditions, archetypes, name parts, recaps
    game/                                   Phaser scenes and rendering
    ui/                                     HTML overlay screens
  tests/
```

### 17.3 Rules

1. **Sim purity.** Nothing under `src/sim` imports Phaser, Capacitor, the DOM, or anything from `src/game`, `src/ui` or `src/app`. It is unit-tested with Vitest.
2. **Wall-clock time.** Sim progress never depends on frame ticks. Nothing under `src/sim` calls `Date.now()`, `Math.random()` or `performance.now()`. Time arrives as arguments and randomness comes from the seeded generator in the state.
3. **Config-driven tuning.** Every number marked [T] lives in `src/sim/config`. Logic files contain no tuning literals.
4. **Content is data.** Inbox items, policies, traditions, archetypes and names live in `src/sim/content`.
5. **Versioned saves.** Every save carries a version and passes through migrations on load.
6. **Stored, not regenerated.** The map layout, the national field, all generated names and the named regulars are in the save.
7. **One way in.** The UI reads through selectors and changes state only by dispatching actions.

### 17.4 advance()

```ts
advance(state: GameState, from: number, to: number): { state: GameState; log: LogEntry[]; info: AdvanceInfo }
```

`from` must equal `state.clock.lastSimulatedAt`. Ticks are scheduled by `state.clock.nextTickAt`, which lives in the state, so the result is identical whether the span is advanced in one call or a thousand.

```
1. If to < state.clock.lastSimulatedAt: return the state untouched, with info.clockWentBack.
2. due = number of tick times in (lastSimulatedAt, to], starting from nextTickAt, one per real minute.
3. If due exceeds 30 days of ticks: skip whole weeks until it does not. Record info.weeksSkipped.
4. Clone the state once. Run tick() due times on the clone:
       tick += 1; nextTickAt += one minute
       fire timers due now            construction done, game quarters, waitlist close, deadlines
       fire calendar events due now   intakes, kickoffs, rankings day, Year-End
       every 15 ticks                 forecast bars, growth evaluation, waitlist fill, service load
       every 60 ticks                 approval drift, Rundown flags, desirability refresh if dirty
       at the daily anchor            bailout check, inbox arrivals, edition boundary
       accrue income and spending for one minute
5. Set lastSimulatedAt = to. Return the clone, the log, and info.
```

The app calls `advance` on open, on resume, and about once a second while open. Every player action first advances to now, then applies a pure reducer, then saves.

**Randomness.** A small seeded generator whose state is stored in the save. Each system draws from its own stream, so adding a draw in one system never shifts another. Rendering uses hashes of ids, never the sim's streams.

**Performance.** Thirty days is 43,200 ticks. Per-tick work is a timer peek and an accrual. Growth picks from per-zone candidate lists that are kept sorted as desirability changes, so no pass walks every lot. Desirability is recomputed only around cells that changed. Target: 30 days of catch-up in under one second on a desktop [T]. Because the sim is pure, it can move to a worker if a phone misses its target.

### 17.5 State and saves

Top-level shape of the state:

```
version, seed, rng streams
clock        tick, nextTickAt, lastSimulatedAt, anchor, year start, founding day length, shift charge
school       name, colors, mascot
map          layout, parcels owned, paths, lots (zone, density, stage, building, flags), buildings
cohorts      class year x tier: size, Greek members
admissions   pools, forecast, last intake result, waitlist
ratings      academic, athletic, approval
money        cash, endowment, levers, sliders and their trailing averages, year accumulators
services     buildings, levels, loads
athletics    coach, classes, season, stadium, deals, records
field        200 schools: names, pedigree, ratings, arcs, last ranks
inbox        open items, cooldowns, annual section
policies     active set, locks
traditions   slots, streaks
greek        chapters: name, colors, standing
milestones   rungs, era, rewards banked, awards, board goal
regulars     the named cast
history      one Year-End report per year, records, trophies, hall of fame
settings     notifications, wake time
timers       sorted by due tick
```

Saves are versioned JSON behind one persistence interface. On the web that is IndexedDB, and the app requests persistent storage so the browser does not evict it. On iOS it is the Capacitor Filesystem: two files in the app's Library folder, which the system never clears and which is part of the phone's backup. Settings will use Capacitor Preferences once the game has settings. The previous save is kept as a backup. The save is written after every meaningful action and when the app is backgrounded. From the first playable on, settings has export-save and import-save buttons, so progress can be backed up and moved to another device.

### 17.6 The simulate script

`npm run simulate` runs the pure sim headless and prints one row per game year: enrollment by tier, cash, the three ratings, average stage, record, applicants, bailouts.

| Profile | Behaviour |
|---|---|
| Absent | No input. One advance per 30 days |
| Casual | Two check-ins a day. Answers the inbox, zones the bottleneck when cash allows, keeps sliders at full funding |
| Optimizer | A check-in every two hours [T]. Greedy best action |

Options: years to run, with 20 as the default; a list of map seeds; a mature-campus fixture.

Assertions agreed in the discussion. The script exits non-zero when one fails.

| Assertion | From |
|---|---|
| One advance call and a thousand small ones give identical state and log | Determinism |
| 30 days of catch-up runs inside its time target | Catch-up |
| A backward clock advances nothing and does not crash | Clock guard |
| Absent profile, from a new campus and from a mature one: average stage ends within one tier of its peak; enrollment, cash and ratings level off; the campus still functions after five untouched years | Neglect-safe, decay brake |
| No lot loses more than one stage in a year or falls below its floor | Decay brake |
| Maxing all five sliders loses to a specialized split on both ladders | Overfunding |
| The optimizer does not top both ladders before about six real months | Long arc |
| A clear favourite wins about three games in four | Football |
| Casual profile: every check-in has something to review, about three new decisions arrive a day, and a typical gap funds a purchase | Check-in contract |
| No annual decision window is shorter than 48 hours | Summer rule |
| Mid-game budget shares sit near their targets on each ladder | Budget |
| All of the above hold across map seeds | Map variety |

### 17.7 Dev tools, notifications, art

- **Dev time-skip panel**: +1 hour, +1 day, +1 year. It shifts the app's clock; the sim is unaware. Dev builds always show it. TestFlight builds carry it behind a hidden switch that is off by default: seven taps on the version line in the Menu. The web build and any App Store release build do not contain it.
- **Notifications**, iOS app only: at most three a day, player-toggleable. Candidates: an annual decision closing in twelve hours, a decision expiring, construction finished, a game result, the Year-End report.
- **Art:** real sprites from the first playable on, never coloured boxes. The pack is chosen by comparison and the owner's pick (section 21). Source packs live in `art/source`, which is not committed, and the sprites in use are copied to `public/assets` and packed into an atlas. One manifest maps each zone, stage and variant to a sprite, its anchor point and its footprint, so swapping art is a manifest edit and never a code change. Missing art falls back to a labelled placeholder. Path tiles are chosen automatically from neighbouring cells. Buildings have two or three variants per stage, and a build-site sprite shows while a timer runs. Depth sorting is correct as the camera pans. `CREDITS.md` lists each pack and its licence. No public-domain stadium model has been found yet. The repository is public, so it holds only public-domain art. A paid pack lives in a private repository, and a build that is given a read-only token downloads it and uses it in place of the built-in art. A build without the token uses the built-in art, so a fresh clone always builds and runs.

### 17.8 Distribution

Set up on 2026-11-11 at the owner's request, outside the layers.

| Piece | Decision |
|---|---|
| Source | A public GitHub repository, for viewing only. All rights reserved, no open-source licence. Secrets, signing files, personal paths and paid art never enter it |
| Web | Cloudflare Pages. A push to `main` builds and deploys. `npm run deploy` does the same from the PC |
| Offline and updates | The web build has a service worker written at build time. Its cache is named after a hash of the build, and each build is kept and served whole. A new build downloads in the background, then the HUD shows "A new version is ready" with an Update button. The player picks the moment. Closing the app also switches to the new build |
| iOS | Capacitor. The app carries its own copy of the game and never loads it from the website. It has no service worker, because its files ship inside the app and a second cache could only serve stale ones. A new app version is a new TestFlight build |
| iOS builds | Codemagic, with manual signing. A tag that starts with `v` builds, signs and uploads to TestFlight. The build number is one above the newest TestFlight build. The version comes from `package.json` |
| App identity | Bundle id `com.goallearner.campustycoon`. iPhone only and portrait only for now. No extra capabilities |
| Secrets | Only in Cloudflare and Codemagic settings. The list is in `CLAUDE.md` |

---

## 18. Build plan

Eight layers, each ending in something playable on the owner's phone. **Work stops at the end of every layer for the owner to play it. The next layer does not start without the owner's go-ahead.**

A "stand-in" is a temporary simplification that a later layer replaces.

### Layer 0: First playable

Defined precisely in section 19.

- **Built 2026-11-11.** 86 tests pass, the simulate script passes its six assertions, and the checks below were run in the browser at phone size, apart from the home-screen install, which waits on the owner's choice of host.
- **Acceptance checks:** installs to the home screen. Zoned lots rise within minutes. The first class arrives within fifteen minutes. The Bottleneck tag names the scarce zone, and fixing it during the waitlist admits more students. After a night away, the away list shows what grew and what was earned. A lot stalled for low desirability grows after a quad is placed. Setting the phone clock backward does nothing harmful.
- **Simulate must assert:** determinism; the catch-up time target; the clock guard; the absent profile still functions after five years; the casual profile's enrollment grows over its first years.

### Layer 1: Football and calendar

- **Contents:** the anchored whole-day week, founding day and scrimmage, anchor shift. The national field with drift. Conference, ten-game season, title game, bowls, poll. Team rating, coach, recruiting pitch, signing day, spring game, rivalry. Five-tier stadium, ticket price, rented field, noise radius. Live games with a score ticker. TV deals. Football profit-and-loss page. A basic Year-End report. A plain "annual decisions" list with deadlines and defaults.
- **Stand-ins:** Athletics funding fixed at full. Football lifts the single applicant pool. No crowds or band yet.
- **Acceptance checks:** intakes and day games land in waking hours. A morning visit finds overnight results. A live game can be watched. A season of sell-outs earns a tier. Missing a weekend applies one-year defaults.
- **Simulate must assert:** the favourite win rate; ten games per team per season and consistent standings; no annual window under 48 hours; the field's average does not drift; determinism still holds.

### Layer 2: Tiers and money levers

- **Contents:** Student Life zone. Three density tiers, upzoning, rectangle fill, Preserve. Decay with its brake. Density economics. Three applicant tiers, tier breakdown, emergent selectivity. Three price levers. Five sliders with overfunding. Approval. Alumni and donations. The budget screen. Bailout. Land purchase.
- **Stand-ins:** tiers and land unlock at bare enrollment thresholds. Ceilings are constants. Medium density has no safety gate yet.
- **Acceptance checks:** a price change shows its forecast and bills from the next intake. An overbuilt zone shows red on the budget and turns Rundown. A week away does not flatten the campus. Football's draw is visible in out-of-state applicants.
- **Simulate must assert:** both absent-profile runs settle; the stage-loss limits; the overfunding rule; budget shares near targets; the bailout never ends a game.

### Layer 3: Services and overlays

- **Contents:** full desirability with five inputs read per zone. Lake, town edge, highway and seeded map variety. Campus Safety, Health Center, Library, Parking, Shuttle. Shrinking circles and density gates. The four overlays and the automatic overlay while placing.
- **Acceptance checks:** every stalled lot shows a cause that the matching overlay confirms. Housing near the stadium stalls and Student Life there thrives. A circle visibly shrinks when Student Services is cut. Two new games give two different maps.
- **Simulate must assert:** every earlier assertion across at least ten seeds; no seed places a feature on the starter campus; the casual profile never has a stall with no cause.

### Layer 4: Advisors and newspaper

- **Contents:** four advisors with top-issue lines. The inbox with its four kinds and the annual section. Policies. Events. The newspaper with poll, admissions story and movers. Walkers and student cards with basic thoughts. Game-day crowds and tailgates. The first thirty content items, written under the tone guide.
- **Acceptance checks:** each check-in opens on a newspaper. Each advisor's line matches what the overlays show. Ignored items resolve to their marked default. Every disaster story names what would have reduced it.
- **Simulate must assert:** the check-in contract for the casual profile; the inbox cap; every item has a default; no content item breaks the tone guide's banned-word list.

### Layer 5: Milestones

- **Contents:** two ladders, four eras, replacing the stand-ins. Reward buildings, ceiling landmarks, three prestige landmarks. Rankings day. Yearly awards. Board goals. Hall of fame. Endowment. The legacy screen.
- **Acceptance checks:** every locked item shows its checklist. A rung is reached on each ladder. Standing falls in a bad year while unlocks stay.
- **Simulate must assert:** the optimizer's six-month target; the era pacing targets; a prestige-only strategy reaches every era; the endowment cannot be used to farm bailouts.

### Layer 6: Identity

- **Contents:** Greek Row with rush, chapter standing and its two policies. Traditions. Homecoming, finals, commencement speaker, spring concert. The flavour items. Marching band. Layered personalities with eighteen archetypes and six quirks. Named regulars and non-student characters. Content to about sixty-five items.
- **Acceptance checks:** the Row settles near the stadium. A tradition shows "at risk" before it breaks. The crowd visibly changes during finals and on game day. A student card's thought matches a real stat.
- **Simulate must assert:** no generated chapter or school name matches the blocklists; archetype mixes always sum to one; an absent player keeps traditions whose conditions still stand; all earlier assertions.

### Layer 7: Polish

- **Contents:** seasonal palettes. The rest of the iOS app (the shell and TestFlight builds were brought forward, section 17.8): real icon and launch artwork, iPad if wanted, a release build without the tester tools. Notifications. The tutorial pass over the first three check-ins. The age-rating questionnaire. A full balance pass. Save migration tests. Performance on a real phone.
- **Acceptance checks:** installs from TestFlight. A save from the web build loads in the app. Notifications respect the daily limit and the toggle.
- **Simulate must assert:** everything, across seeds, on the final numbers.

---

## 19. First playable

The smallest thing that proves the core loop is fun: zone, grow, intake, bottleneck, fix.

### 19.1 Features

| Area | In the first playable |
|---|---|
| Engine | Wall-clock `advance`, catch-up with the 30-day cap, the clock guard, saves, the dev time-skip panel |
| Calendar | A game opens fifteen minutes before the first fall intake. Fall intake, spring intake, waitlist window, yearly promotion and graduation |
| Map | One fixed map. The starting land only |
| Zoning | Paths. Drag a row with a live cost preview. Housing and Academic |
| Growth | Two stages, automatic, with timed rebuilds and the old building serving |
| Demand | One applicant pool. Two forecast bars. The Bottleneck tag and the turned-away count. Tapping a bar or the tag says exactly how many lots of which kind would seat the students who are waiting, or the next class, with the cost |
| HUD wording | The HUD leads with what is happening now ("Fall semester in session"), then what the player can do ("310 waiting: add Academic seats to admit them"). The countdown to the next class is a smaller second line. Changed on 2026-11-11 after the owner's first session, when the countdown read as a wait before play could start |
| Desirability | Quads and walk time only. The lot inspector names one stall cause |
| Money | Flat tuition, zoning and path costs, upkeep. The HUD shows cash and net income per real hour |
| Feedback | A plain list of what happened while away |
| Identity | A school name |
| Art | Real sprites for everything on the map: ground, paths chosen from their neighbours, quads, trees, and Housing and Academic buildings at both stages with two or three variants each. A build-site sprite during timers. One manifest, an atlas, correct depth sorting |
| Saves | IndexedDB with persistent storage. Export-save and import-save buttons |

### 19.2 Deliberately missing

Football and everything in athletics. Student Life. Applicant tiers. Medium and high density. Decay. Services and gates. Overlays. Advisors, inbox, policies, events, the newspaper. Milestones and rewards. Land purchase. Map features and variety. The waking-hours anchor, so the week is anchored to the install moment for now. Walkers. Notifications. The iOS app.

### 19.3 Installing it on a home screen

There are two ways, and neither costs anything.

**Over home Wi-Fi, today.** On the PC, run `npm run phone` in the project folder and note the Network address it prints. On the iPhone, open that address in Safari, tap Share, then Add to Home Screen. It works while the PC is on and that command is running. It cannot open with no connection, because browsers only allow that over a secure address.

**From Cloudflare Pages, for real use.** A push to `main` publishes the web build (section 17.8). Then:

1. On the iPhone, open the address in Safari.
2. Tap Share, then Add to Home Screen.
3. Launch it from the icon. It opens full screen, like an app, and works with no connection after the first launch.

It includes a web app manifest, an icon, and a service worker so it opens without a connection and offers each new build with an Update button. The save lives in the browser's storage for that home-screen app. The app asks the browser to keep it, and the export-save button backs it up or moves it to another device. During development the same build can also be opened from the PC over home Wi-Fi.

---

## 20. Later roadmap and cut order

### 20.1 Later roadmap

| Area | Item |
|---|---|
| Map | Satellite campuses, as SimCity 4's regions. Fully procedural maps |
| Growth | Lot merging, two-by-one then two-by-two. A heritage bonus for preserved old buildings |
| Zoning | A Research zone and partnerships. Per-district policies |
| Demand | Graduate, international and transfer students. Honors housing |
| Services | Drawn shuttle routes |
| Money | Bonds. Endowed chairs for named star faculty |
| Athletics | Basketball as the spring sport. A playoff bracket. Modular stadium expansions. Conference realignment |
| Calendar | A shared calendar for all players. Spring break as an empty-campus build window |
| Advisors | Advisors with loyalty, hired and fired |
| Goals | A reset that founds a new campus with legacy bonuses |
| Students | The rest of the archetype and quirk catalogue, as content updates |

### 20.2 Cut order if v1 slips

1. Shuttle
2. Board goals
3. Alumni-return events
4. Greek Row, last

Before any system is cut, the inbox cadence drops from three items a day to two.

---

## 21. Open questions

Settled on 2026-11-11 and no longer open: the personalities addition (section 13), save storage (IndexedDB on the web with persistent storage and export and import), the one-minute tick, the 30-day cap that drops whole weeks, the first playable anchoring its week to the install moment, and hosting (section 17.8: a public repository, Cloudflare Pages, and TestFlight through Codemagic).

1. **Art pack.** Five packs were compared on 2026-11-11 and the top two were test-rendered side by side. The first playable uses Kenney's public-domain isometric tiles, because they are free, complete and clean to ship. Penzilla's Giant City Builder, at $10, is the recommended upgrade: it has more charm and real campus buildings. The owner decides. Swapping is a recipe and manifest edit.
2. **App Store name.** "Campus Tycoon" is the first choice. Backups if it is taken: "Campus Tycoon: Idle University", then "Quad Tycoon".
3. **Map size.** Twenty-five parcels may be more land than the capacity numbers ever need. Settled with the simulate script in layer 2.
4. **Stall-cause order** when several apply. Proceeding with: no demand, density cap, safety, health, desirability.
5. **Final lists** still to be written under the tone guide: fourteen policies, sixteen reward buildings, ten awards, Board goal templates, the three prestige landmarks' effects.
6. **Stadium art.** No public-domain stadium model was found, only attribution-licensed ones. Blender is not installed on the dev PC.
7. **Founding numbers.** The founding class size and the first size rung must let the first rung land by the third check-in.
8. **Daylight saving.** The anchor is stored in UTC, so it moves an hour in local time twice a year until the player shifts it.
9. **Game title.** "Campus Tycoon" is a working title.

### First-playable stand-ins

Simplifications the first playable uses until a later layer replaces them. All are in config.

| Stand-in | Replaced in |
|---|---|
| One applicant pool, drawn by word of mouth and average campus desirability | Layer 2, by the three tiers |
| One bed need for every student [T] | Layer 2 |
| Flat tuition per student [T] | Layer 2, by the price levers |
| Flat retention [T] | Layer 2, by approval |
| A plain state grant when cash would go below zero, with no penalty | Layer 2, by the bailout |
| A flat running cost per student [T] | Layer 2, by the five funding sliders |
| Growth is re-evaluated by walking every lot | Layer 2 or 3, by sorted candidate lists, when maps grow |
| The week is anchored to the install moment | Layer 1, by the waking-hours anchor |

---

## 22. Tuning targets

Every number below is expected to change. All live in `src/sim/config`.

| Area | Target | Starting value |
|---|---|---|
| Calendar | Anchor offset after wake time | 2 hours |
| Calendar | Game slots after the anchor | +2 h, +8 h, +14 h, +20 h |
| Calendar | Waitlist window | 9 hours |
| Calendar | Spring intake size | About a fifth of fall |
| Calendar | Finals window | About 10 hours |
| Calendar | Shortest founding day that still has a scrimmage | 5 hours |
| Map | Full map and parcels | 80 by 80 cells, 25 parcels of 16 by 16 |
| Map | Starting land | 4 parcels |
| Map | Parcels ownable by era | 4, 10, 17, 25 |
| Map | Path reach | Edge-adjacent |
| Growth | Capacities, rebuild times, desirability thresholds | The table in 6.2 |
| Growth | Growth evaluation interval | 15 minutes |
| Decay | Rundown capacity loss | A quarter |
| Decay | Desirability margin and duration before Rundown | 8 points, one day |
| Decay | Rundown time before a year-end stage loss | 2 real days |
| Demand | Share of in-state students needing a bed | About a third |
| Demand | All pool, draw and yield coefficients | To be set |
| Demand | Founding class size | To be set with the first rung |
| First playable | Stand-in pool, bed need, flat tuition, flat retention | To be set in layer 0 |
| Desirability | Radii, weights, the 8-minute walk limit | The table in 8.2 |
| Services | Base radii, capacities, funding curve | To be set |
| Money | Price steps for the three levers | To be set from the budget shares |
| Money | Slider range and overfunding cost curve | About 50% to 120% |
| Money | Bailout penalty, freeze length | To be set |
| Money | Endowment yield | Small, to be set |
| Money | Budget shares for both ladders | The tables in 9.4 |
| Athletics | Rating weights, home edge, the win-odds scale | Favourite by 10 wins about 75% |
| Athletics | Sell-out line for earning a tier | 95% of seats |
| Athletics | Stadium seats, costs, build times, noise radii, ticket steps | To be set |
| Athletics | Odds of landing a chased star | To be set |
| Field | Size | 200 schools |
| Field | Pull, yearly shock, arc odds and length, pedigree drift | To be set |
| Inbox | Content count at launch | About 65 items |
| Milestones | Size rungs | 500, 2,000, 6,000, 10,000, 15,000, 22,000, 30,000, 40,000 |
| Milestones | Prestige rungs | Top 175, 150, 125, 100, 75, 50, 25, 10 |
| Milestones | Era pacing | Weeks 5, 12, 20 |
| Milestones | Soonest a perfect player tops both ladders | About six real months |
| Traditions | Streak cap and the cost of breaking one | To be set |
| Students | Lost Freshman share at intake, finals Stressed-Out share | To be set |
| Students | Named regulars per entering class, number of walkers, cap on small archetype effects | A handful per class; the rest to be set |
| Greek Row | Beds per stage, target share of enrollment | The table in 6.2; share to be set |
| Simulate | Optimizer check-in interval | 2 hours |
| Performance | 30 days of catch-up | Under one second on a desktop |
