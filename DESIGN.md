# Campus Tycoon: Design

Working title. Written 2026-11-11 from the design discussion between the owner and Claude.

**Status: Layer 0, the first playable, is built and the owner has played it. A feedback pass is under way on top of it.** The owner approved the look on 2026-11-11. Play stop 1 of the pass is built and waiting for him to play: the Build menu and its buildings, Happiness, and the three metrics pieces (section 18). Stops 2 and 3 are not started. Nothing from Layer 1 has been started. Building goes one layer at a time (section 18). Distribution was set up early, on 2026-11-11, outside the layers: a public repository, the web build on Cloudflare Pages, and the iOS app for TestFlight (section 17.8).

How to read this document:

- **[T]** marks a tuning target: a number we expect to change during balancing. Every one lives in a config file and is listed again in section 22.
- Numbers without the mark are structural decisions.
- Each decision carries a short "why" so later sessions do not reopen settled questions.
- Section 21 lists what is still open.
- Section 23 is the master building catalog: every kind of facility a complete campus has, and the layer it lands in.
- Section 24 is the success metrics: the student pipeline, the Scorecard and the ranking weights.
- Section 25 is off-campus neighbourhoods, roads and parking.
- Section 26 is the art to fix before release.
- Section 27 is Stress, which ships with the calendar in layer 1.
- Section 28 is time of day and weather, also for layer 1.
- Section 29 is Grounds: litter, bins, seating and maintenance workers. Accepted by the owner on 2026-11-11 as play stop 4. Not built: it waits until he has played stop 3 and said go.
- Section 30 is more food places and more Academics buildings. Accepted by the owner on 2026-11-11 as the second half of play stop 4. Not built: it waits until he has played stop 3 and said go.
- Section 31 is money: payroll and visible costs. Discussed and proposed on 2026-11-11 as play stop 5. It waits for the owner's go-ahead.
- Section 32 is the people on campus: four class years from the first day, and professors, staff and visitors who can be tapped. Asked for on 2026-11-11. The first half is built with the money stop. The second is the next small stop.
- Section 33 is life and sound: bigger crowds and traffic now, and a proposed Life and sound stop for small scenes, ambient motion and audio. Asked for on 2026-11-11.

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

**Once a day is the slowest rhythm the game supports.** The game is built for one to two visits a day (the owner's rule, 2026-11-11; it was two or more before). Every system must help meet these targets.

| Part | Target |
|---|---|
| Review | A newspaper edition greets each check-in after an hour or more away. After a day away it leads with the three or four things that matter most and collapses the rest |
| Decide | About three new inbox decisions a day, at most four routine items open. A routine item stays open at least 36 hours. An annual decision stays open 48 to 72 hours |
| Build | Income tuned so one day away funds at least one meaningful purchase, and a week funds one big project |
| Never missed | Nothing that matters opens and closes entirely between two visits a day apart. Any window the player can act in lasts at least 36 hours (`MIN_WINDOW_TICKS`), so someone who looks in every 24 hours always gets a visit inside it with half a day left |
| Never waiting | Construction and upgrades start and finish by themselves. Game days, rankings and intakes happen on time and wait in the away summary |
| Catch-up | The game catches up from the last saved moment whenever it opens, on the web and on iOS |
| Notifications | iOS only. At most two a day by default: a decision about to expire, and a headline result. The player can change the number or turn them off |

Section 4.9 lists every timer against this contract.

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
| City rating | Kept | Academic standing, athletic standing, student happiness |
| Data maps | Kept, reduced | Four overlays (8) |
| Neighbor deals | Folded in | TV and donor deals in the inbox (10, 12) |
| Power, water and other networks | Cut, with one exception | They were chores, and they fail while the player is away. Roads came back on 2026-11-11 as a second network with one rule and no failure state (section 25.3) |
| Traffic simulation | Cut, and it stays cut | Walk time to class survives as a desirability input. Cars are for show, like walkers (section 25.3) |
| Terrain, pollution, garbage | Cut, with one exception | Stadium and parking noise, plus three fixed map features. Garbage came back on 2026-11-11 as litter with a ceiling and no failure state, on the conditions in section 29.10 |
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
| 1 | Fall | Fall intake, waitlist opens | Two home games in the evening, two away overnight. Rush week begins |
| 2 | Fall | Rush results | Three home games by day, Homecoming in the afternoon. Two away overnight. The rivalry kicks off 28 minutes before day 3 |
| 3 | Fall | Recruiting pitch opens, as the rivalry plays its last quarter | Conference title game late in the morning, if earned. Finals in the afternoon. A bowl in the evening, if earned. Winter break overnight |
| 4 | Spring | Spring intake, waitlist opens | The top bowl, if earned, kicks off 28 minutes before this anchor. Commencement speaker choice opens |
| 5 | Spring | Rankings day and signing day | Spring game in the evening. Coach and stadium decisions open. Finals overnight |
| 6 | Graduation | Commencement, donation drive | Seniors leave the roster. TV deal and Board goal open |
| 7 | Summer | Year-End report, decay verdicts | Annual decisions close at the next fall anchor |

Game slots: football plays on the Saturdays of the calendar, which come round every 3 hours 18 minutes in the fall. Section 4.8 has the schedule. A morning visit still finds two overnight results. The earlier four fixed slots a day (anchor +2 h, +8 h, +14 h, +20 h) were dropped on 2026-11-11, because ten games on them ran to mid-December.

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
| Finals | The afternoon of day 3 and the night that ends day 5, about three hours each, from the calendar's own dates | The library's circle shrinks under load and happiness dips |
| Spring concert | Day 5 | An ordinary inbox item: pick an act |
| Seasonal palettes | Across the week | Autumn, first snow, thaw, bloom, summer. Tints and particles in v1 |

### 4.6 First-week pacing

A weekly intake alone would make a new player wait seven days to learn whether zoning worked. Three rules fix that:

| Rule | Effect |
|---|---|
| Open on move-in day | A new game starts fifteen minutes before the first fall intake |
| Waitlist window | After every intake, turned-away applicants wait 36 hours [T]. Capacity that opens in that window fills at once. It was nine hours until 2026-11-11: someone who looks in once a day could miss all nine |
| Spring intake | A second class each year, about a fifth the size of fall [T] |

The demand bars are forecasts of the next intake, so they react within minutes of zoning. The player learns at once and gets paid at the intake.

### 4.7 The first three check-ins

| Check-in | Review | Decide | Build |
|---|---|---|---|
| Session one, ten minutes | Admitted students with no beds or seats | School name, colors, mascot, wake time | Housing and Academic lots, which rise in two minutes. The class moves in and the waitlist fills what is added next |
| That evening | Newspaper: the founding scrimmage, lots that grew a stage, the waitlist closed with a count lost | First advisor decision | A quad or a Campus Safety office. The desirability overlay appears |
| Next morning | Overnight income, first results, first size rung | Where the reward building goes | Student Life zoning unlocks. The spring forecast sets the next goal |

With one visit a day the second check-in below comes the next day and the third the day after. Nothing in the table is lost by that: the waitlist is still open, and the scrimmage, the growth and the first results wait in the away summary.

### 4.8 The calendar year

Asked for by the owner on 2026-11-11, from a real university's published academic calendar. Its structure and dates are used, never its name. One game year is still one real week of whole-day phases.

**Built now:** the date on the HUD ("Mon, Aug 24") beside the phase, and the whole calendar as data in `src/sim/config/academicCalendar.ts`, so another year's calendar is a change to that file. **Everything else here lands in layer 1.**

| Decision | Why |
|---|---|
| The sim shows a calendar date that moves steadily with the wall clock, about two game days to a real hour | The week gains a year's worth of landmarks |
| The date is read from one fixed point at each change of phase, with the days between spread evenly: the fall intake is Aug 19, the spring intake is Jan 19, commencement is May 13, the summer term starts May 26. **The date runs at a steady rate inside each phase, and there is never a fixed point inside one** (the owner's rule, 2026-11-11) | Each intake and report stays at its anchor hour and lands on its real date. A date that speeds up and slows down inside a semester reads as broken |
| Fall and winter break fill days 1 to 3 (Aug 19 to Jan 18). Spring fills days 4 and 5 (Jan 19 to May 12). Graduation is day 6 (May 13 to May 25). Summer is day 7 (May 26 to Aug 18) | The owner's mapping, changed in two places. He put Jan 1 at the start of day 4, which would date the spring intake eighteen days before the semester starts. And he ended day 6 on May 21, which would make the date jump four days |
| Every game year shows the same dates on the same weekdays | One calendar, stored as data |
| Events are data: a name, a kind and a date or a span | Nothing about a holiday is written in code |
| A week of midterms is added at the middle of each semester | The reference calendar lists none, and Stress (section 27) needs it |
| The school's rescheduled holidays and its satellite-campus entry are left out | The owner's instruction |
| The away summary groups what happened by date | "Sep 7: Labor Day." A once-a-day player misses most events live |

**What each kind of event does.**

| Kind | Effect |
|---|---|
| One-day holiday | Campus closed: few walkers, no classes. Flavour only |
| Break: Thanksgiving, winter, spring | Most students leave and the campus is visibly quiet. Student Life income dips. Happiness lifts and Stress drops (section 27). Build timers are untouched |
| Midterms and finals | Stress peaks. The library and coffee stands fill. Happiness dips |
| Summer term | About 15% of students stay on campus [T], with income to match. Annual decisions and the Year-End report as designed |
| First day of classes | A busy-paths moment and a newspaper line |

**How long each lasts in real time.** One game day is about 28 real minutes in fall, 25 in spring, 111 on graduation day and 17 in summer.

| Event | Game days | Real time | Seen by a once-a-day player? |
|---|---|---|---|
| Labor Day, Veterans Day, New Year's Day, MLK Day | 1 | 28 minutes | No. Away summary only |
| Juneteenth, Independence Day | 1 | 17 minutes | No. Away summary only |
| Midterm week, fall and spring | 5 | 2 h 21 min and 2 h 06 min | Rarely. Away summary |
| Thanksgiving break | 5 | 2 h 21 min | Rarely. Away summary |
| Spring break | 5 | 2 h 06 min | Rarely. Away summary |
| Fall finals | 7 | 3 h 18 min | Rarely. Away summary, with the exam report of section 27 |
| Spring finals | 7 | 2 h 57 min, ending at the day-6 anchor | Its end, on a morning visit |
| Winter break | 31 | 14 h 35 min, ending at the day-4 anchor | Yes |
| Commencement | 4 | 7 h 23 min from the day-6 anchor | Yes |
| Summer term | 85 | 24 hours | Yes |

Everything in the first six rows must leave a line in the away summary, because most players will never be looking when it happens.

**What has to move.** Checked against section 4.3.

| Beat | In the design today | On the real calendar | Proposal |
|---|---|---|---|
| Rivalry game | Day 3, the evening game | Thanksgiving weekend, Nov 28 | Sat, Nov 28, which an even date line puts 28 minutes before the day-3 anchor. The game kicks off then, and its last quarter plays as day 3 begins. It is a morning game now, not an evening one |
| Conference title game | Day 4 | Early December | Sat, Dec 5: day 3, anchor + 2 h 49 min |
| Bowl | Day 4, after the title game | Late December to mid-January | An ordinary bowl is Sat, Dec 26: day 3, anchor + 12 h 42 min, in the evening. The top bowl is Mon, Jan 18, kicking off 28 minutes before the day-4 anchor, so the national title is settled as the spring class arrives |
| Fall finals | Overnight at the end of day 3, about ten hours | Dec 12 to 18 | Day 3, anchor + 6 h 07 min to + 9 h 25 min: an afternoon. Winter break follows, overnight |
| Spring finals | Overnight at the end of day 5, about ten hours | May 6 to 12 | Stays overnight at the end of day 5, but about three hours |
| Signing day | Day-5 anchor | Early February, which is day 4 at about anchor + 6 h | Stays on day 5. Moving it would cut the recruiting pitch window below the 48 hours every annual decision is promised |
| Rankings day | Day-5 anchor | September, for the best-known national ranking | Stays on day 5. The prestige ladder needs its own day and an anchor-hour reveal. Its date reads mid-March |
| Commencement | Day-6 anchor | May 13 | No move |
| Year-End report | Day-7 anchor | The summer term starts May 26 | No move |
| Homecoming, spring game | Day 2 afternoon, day 5 evening | Late October, early April | No move |

**Settled on 2026-11-11.** The owner accepted both changes to his mapping, moving the title game and the bowl into day 3, and leaving signing day and rankings day on day 5. He first accepted a fixed point that pinned the rivalry game to Nov 28, then reversed it the same day when he saw it moved late-November dates by up to 18 days: **the date runs evenly, and football fits its games into the calendar.** The table of real times above is right again.

**Football on the even calendar.** Ten games do not fit by Thanksgiving weekend on four slots a day: the eighth slot is anchor + 44 h and Thanksgiving Saturday is anchor + 47 h 32 min. The choice made: keep ten games and tighten the spacing. Every game is played on a Saturday of the calendar, and in the fall a Saturday comes round every 3 hours 18 minutes. The season uses ten of the thirteen Saturdays from Sep 5 to Nov 28, with three bye weeks. The byes are placed so home games still fall in waking hours and away games overnight, taking the player's day to start two hours before the anchor and last sixteen hours [T].

| Game | Date | Real time | Where |
|---|---|---|---|
| 1 | Sat, Sep 5 | Day 1, anchor + 8 h 00 | Home opener, evening |
| 2 | Sat, Sep 12 | Day 1, anchor + 11 h 18 | Home, evening |
| 3 | Sat, Sep 19 | Day 1, anchor + 14 h 35 | Away, overnight |
| 4 | Sat, Sep 26 | Day 1, anchor + 17 h 53 | Away, overnight |
| Bye | Sat, Oct 3 | | |
| 5 | Sat, Oct 10 | Day 2, anchor + 0 h 28 | Home, morning |
| Bye | Sat, Oct 17 | | |
| 6 | Sat, Oct 24 | Day 2, anchor + 7 h 04 | Home, Homecoming, afternoon |
| 7 | Sat, Oct 31 | Day 2, anchor + 10 h 21 | Home, evening |
| Bye | Sat, Nov 7 | | |
| 8 | Sat, Nov 14 | Day 2, anchor + 16 h 56 | Away, overnight |
| 9 | Sat, Nov 21 | Day 2, anchor + 20 h 14 | Away, overnight |
| 10 | Sat, Nov 28 | Day 2, anchor + 23 h 32 | The rivalry. Home in odd years, away in even |

What this keeps: ten games, five or six at home, two overnight results every morning, Homecoming on a late-October afternoon, and the top bar reading "Sat" at every kickoff. What it costs: the home games bunch into one evening and one day, a live game of forty minutes now spans a Saturday and half of Sunday on the top bar, and the rivalry is a morning game. The rivalry cannot be an evening game on an even calendar, because Thanksgiving weekend falls where real day 2 ends. Game dates are data beside the calendar, so a change is a change to that list.

### 4.9 Every timer, against one visit a day

The audit the owner asked for on 2026-11-11. The test is a player who looks in once every 24 hours at a fixed time: nothing that matters may open and close between two of their visits.

| Timer | State | Was | Now | Why |
|---|---|---|---|---|
| Waitlist window after an intake | Built | 9 hours | 36 hours | A daily visitor could miss all nine. At exactly 24 they could arrive in its last minute, with no time for what they build to open |
| Routine inbox item | Designed | At least 1 day | At least 36 hours | The owner's number |
| Annual decisions (4.4) | Designed | 48 to 72 hours | 48 to 72 hours | Two visits are certain |
| Notice before an annual decision closes | Designed | 12 hours | 12 hours | It is one of the two daily notifications |
| Spring concert pick | Designed | An inbox item on day 5 | Opens at the day-4 anchor, 36 hours ahead | It was the one routine item tied to a same-day event |
| Scandals that run in two steps | Designed | Not set | Each step is its own inbox item, so at least 36 hours each | Same rule |
| Deficit, before the state steps in (9.5) | Designed | At the next daily check, which could be minutes away | 36 hours of warning first, in the away summary and as a notification | Otherwise a daily player could be rescued, with the penalty, without ever seeing the warning |
| Rundown warning before a stage is lost (6.5) | Designed | At least 2 real days, and only at year-end | No change | Two visits are certain |
| Lot construction and rebuilds | Built | 2 and 10 minutes, starting and finishing by themselves | No change | Never waits for a tap |
| Hand-placed buildings | Built | Open at once | No change | Never waits for a tap |
| Stadium upgrade | Designed | Builds in the off-season once approved | No change. Approval is an annual decision of 72 hours | Never waits for a second tap |
| Growth check | Built | Every 15 minutes | No change | No player action |
| Undo for a full refund (9.6) | Built | 1 minute | No change | A guard against a slip inside one visit. After it the refund is half, with no further deadline |
| Incident, help on the way | Built | 2 minutes plus half a minute a cell | No change | Decided by coverage. Nothing to tap |
| Incident, nobody coming | Built | Passes after 45 minutes | No change | Nothing to tap. The away summary names the building that would have handled it |
| Intakes, semester end, graduation, year end | Built | On the anchor hour | No change | They wait in the away summary |
| Football games | Designed | Four fixed slots a day, 40 minutes live | Calendar Saturdays (4.8), 40 minutes live | Results wait in the away summary. Watching live is a bonus |
| Rankings day, signing day | Designed | Day-5 anchor | No change | They wait in the away summary |
| Finals | Designed | About 10 hours | About 3 hours, from the calendar | No player action. The exam report waits |
| Policy lock | Designed | Until the next intake | No change | Not a deadline |
| Reward buildings | Designed | Never expire | No change | |
| Catch-up limit | Built | 30 days | No change | |
| Notifications a day, iOS | Designed | At most 3 | At most 2 by default, adjustable | The owner's number |

**Also assumed more than one or two visits a day,** and now reads differently:

- The first three check-ins (4.7) were session one, that evening and the next morning. With one visit a day they are three days.
- "A morning visit finds two overnight results and later visits find one each" (4.3). A daily visitor finds the whole day's results at once, which is what the collapsed away summary is for.
- Live games as appointment viewing (10.2), and home games placed in waking hours. Both are a bonus for a second visit, never something a daily player loses by missing.
- Income was tuned for a 12-hour gap (the casual test player). The once-a-day test player has to be able to spend a day's income in one visit, or cash piles up.
- The inbox cap of four open routine items with about three arriving a day: a daily visitor meets three or four at once. That is the top of what a few minutes can hold, and the cadence should drop to two a day if it reads as homework.

**Built for the once-a-day player on 2026-11-11:** the once-a-day test player and its check in the simulate script (17.6); tests that a force close in the middle of construction, reopened after an hour, a day and seven days, gives exactly the game that never closed (`tests/reopen.test.ts`); and the away list saved with the game until it is read (17.5). **Still to build:** the away summary's layout for a 24-hour gap, and the notifications.


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
| No bike lanes | They would be a second tool for the one walk-time number. The shuttle is that tool |
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
| Each zone has its own job | Housing sets beds and earns room fees. Academic sets seats and produces prestige. Student Life drives happiness and retention and earns from foot traffic |
| Three demand bars that can go negative | Up is shortage, down is surplus. Surplus is the overbuilding warning |
| The tightest zone carries a Bottleneck tag and the count of qualified applicants turned away. Tapping it gives the number of lots that would fix it | The same number reads as lost income on the size ladder and as selectivity on the prestige ladder |
| Three applicant tiers that share buildings | They make the two ladders mechanically different without SimCity 4's wealth-specific lots |
| Recruited athletes are recruiting classes inside athletics | A few hundred people cannot move a zone bar, and star recruits are louder there |
| Selectivity is emergent: applicants per seat | A school that does not expand while demand is high becomes selective on its own |
| Selectivity is shown as an acceptance rate, and yield is worked out at each intake | The terms a player already knows. To fill a class the school must make more offers than it has places, so a better yield makes it more selective at the same size. Section 24 |
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
draw[inState]  = priceEffect(inStateTuition) * mild(academicStanding)
draw[outState] = priceEffect(outStateTuition) * strong(athleticStanding, academicStanding)
yield[tier]    = baseYield[tier] * campusLook * affordability[tier] * condition    (section 24.1)
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
5. offers[tier]    = admitted[tier] / yield[tier]
   acceptanceRate  = total offers / total pool
```

The waitlist reruns step 2 for the turned-away students whenever capacity opens during the window. The spring intake runs the same steps on a smaller pool.

Happiness no longer pulls on applications. It keeps students once they are here (retention), and the look of the campus wins the yes (yield): one cause feeds one stage (section 24.2).

```
bar[zone] = (capacity wanted for the next intake - capacity open) / capacity open
```

### 7.4 Students

Students are simulated as cohorts by class year and tier, never as individuals. Retention is applied at each semester's end and falls with low happiness. Seniors graduate on day 6 and join an alumni pool that grows forever and drives donations. Walkers, student cards and personalities are a readout of the cohorts (section 13). Each entering class also keeps a short record of how many came, stayed, finished on time, finished late and left, and students who do not finish in four years stay on as fifth and sixth years (section 24.8).

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
| No happiness overlay | Happiness is campus-wide. The newspaper poll covers it |

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
| Housing lots next door, as noise by a place of study | 0 | - (mild, adjacent only) | 0 | 0 |
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

Two rules were added on 2026-11-11 so the model campus in section 23.4 pays off. Academic lots mildly dislike Housing directly next door, which keeps the core academic and settles dorms one block out. A parking lot beside the highway holds more cars [T], which pulls parking to the perimeter.

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
| Parking | None | Spaces for locals who drive in. It holds cars only when a road links it to a town street or the highway (section 25.3). An eyesore, a parking structure less so. Holds more cars beside the highway |

Campus Safety handles mischief, not crime (section 16).

### 8.4 Overlays

| Overlay | Shows |
|---|---|
| Growth | Each lot coloured by its stall cause, plus Rundown risk |
| Desirability | A zone picker, the score, the top pluses and minuses, walk minutes on housing |
| Coverage | A service picker, each circle, and a ghost outline of its full size |
| Money | Each lot's net income per real hour |
| Cleanliness | Dirty spots, full bins, broken things and worker coverage (section 29.6). Built on 2026-11-11 with play stop 4a. It opens from "Show cleanliness" on the Happiness panel and stays until Done |
| Parking | Car parks and roads a car from the town can reach in green, those it cannot in red, and College Avenue, which every road has to reach, in blue. Built on 2026-11-11 with the stop 3 fixes. It has no button of its own yet. **When the overlays button is built it gets its own entry there, alongside Growth, Desirability, Coverage and Money (the owner, 2026-11-11).** Until then it shows while a road is being laid, while a car park is being placed or is selected, and from "Show car parks" in the room plan, where it stays until Done |

---

## 9. Money

### 9.1 Decisions

| Decision | Why |
|---|---|
| Three price levers: in-state tuition, out-of-state tuition, scholarship budget | SimCity 4's tax rate per wealth level |
| Five steps per lever, with the forecast shown before commit | Legible and thumb-friendly |
| A new price bills from the next intake | Stops raising tuition after move-in and dropping it before admissions |
| A hike hits student happiness at once | Enrolled students react now, and the money follows later |
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
| Alumni donations | Alumni pool times affinity times alumni success (section 24.1). A big school has many small donors, a selective one fewer and richer |
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
| Student Life | Happiness and retention fall | Happiness and retention |
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

**Proposed on 2026-11-11 with section 31, accepted by the owner the same day, and built as play stop 5: the same spending, shown by what it buys.** Football, tiers and scholarships are not built, so the lines that are carry the spending between them: 31.10 gives the shares measured. The slider totals above move by a point or two. Facilities gives up two points to make room for insurance and marketing, which had no line. Payroll with benefits comes to 59% of spending on the size ladder and 58% on the prestige ladder.

| Spending, as a share of income | Funded by | Size ladder | Prestige ladder |
|---|---|---|---|
| **Payroll** | | **50%** | **52%** |
| Faculty pay | Instruction | 22% | 27% |
| Staff pay | Student Services | 8% | 7.5% |
| Safety and medical staff | Student Services | 1.5% | 1.5% |
| Maintenance workers | Their count on each yard | 2% | 2% |
| Coaches and athletics staff | Athletics | 5% | 2% |
| Benefits, 30% on top of all pay | None | 11.5% | 12% |
| **Buildings and utilities** | | **14.5%** | **13.5%** |
| Utilities | None. Bills are paid in full | 6% | 5.5% |
| Upkeep and repairs | Facilities | 8.5% | 8% |
| **Scholarships** | The scholarship lever | **4%** | **12%** |
| **Other** | | **16.5%** | **12.5%** |
| Teaching supplies and the library | Instruction | 4% | 5% |
| Student programs and events | Student Life | 3% | 3% |
| Athletics operations | Athletics | 6.5% | 2.5% |
| Recruiting and marketing | Its own five steps | 1.5% | 1% |
| Insurance and legal | None | 1.5% | 1% |
| **Left for projects** | | **15%** | **10%** |


### 9.5 Deficits and the endowment

When cash would go below zero at the daily check:

```
1. The endowment covers the shortfall first.
2. If cash is still negative, the state covers it: the academic rating takes a hit that grows with
   each repeat, new zoning and placement freeze for a while, and every slider is capped at 100%.
3. The game never ends.
```

Cash paid into the endowment cannot be withdrawn. It earns a small permanent income [T]. Because a deficit draws on it before the state steps in, nobody can hoard and take a bailout. **Built in its plain form with play stop 5 (31.10):** paid in from the Money panel, 2% a game year [T], and a shortfall draws on it before the state does. The bailout itself, with its penalties, is still layer 2.

### 9.6 Clearing and refunds

Decided by the owner on 2026-11-11, after play stop 1. Built.

| Decision | Why |
|---|---|
| Clearing within a minute of building gives the whole price back | An undo. A misplaced building is not a punishment. A tick is a minute, so the player always has at least one full minute |
| After that, clearing gives half the price back | Changing your mind costs something, but not everything |
| Hand-placed buildings, paths, quads, trees and zoned lots all follow it | One rule |
| Clearing is free, and nothing is cleared until a prompt has shown what comes back | The owner asked to see the refund first |
| What the campus began with gives nothing back | It was never paid for. Without this the starter paths, quad and dining hall are free money |
| A build that leaned on what was cleared stops | Otherwise a quad or a dining hall could be placed, used to start a row of dorms growing, and taken straight back for a full refund |
| The undo ends early if a class arrived or a semester ended while the thing stood | Otherwise recreation or quads could be put up for the minute that sets the class size or retention, then taken back for free |

Still open, and reported to the owner:

| Gap | Size | How it closes |
|---|---|---|
| Build, let lots finish growing, sell for half | Half price for growth that then stays, because nothing decays yet | Decay in layer 2 takes back a stage the lot no longer earns. No new rule needed |
| Sell a full dorm and keep its students | Closed on 2026-11-11 | Students with no bed leave at the end of the semester. Built in play stop 2 |
| A refund is half of today's price, not of the price paid | Matters only if prices are retuned upward | Store the price paid, if it ever matters |

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
| Ten regular-season games, each on a Saturday of the calendar, from Sep 5 to the rivalry on Thanksgiving Saturday (4.8) | Twelve would leave no bye weeks to keep home games in waking hours. Nine would leave no result waiting in the morning |
| Home games take the Saturdays that fall in waking hours; away games take the ones overnight | The player can watch game day, and wakes to results |
| Twelve-team conference in two divisions: one opener, five division games, four crossovers | Gives a title game between division winners |
| Tiered bowls, the top bowl being the national title | A postseason without a bracket. The playoff bracket is later |
| Team rating from four visible inputs | Head coach, roster talent, stadium tier, Athletics funding. Every loss recap names the biggest gap |
| Roster talent is the average of the last four signing classes | Each class matters for four years, so investment pays off slowly |
| One pitch choice per signing class | Safe class, or chase a star who may sign elsewhere. Recruit-by-recruit is too active for an idle game |
| The coach has one rating and one trait | Hired or renewed in summer |
| Five stadium tiers, each earned by a season of near sell-outs | Test 2 applied to the stadium |
| A ticket price lever in five steps | Cheap tickets fill seats and earn the next tier. Dear tickets earn more now |
| Stadium work starts only in the off-season, on a plot of 2 by 3 cells reserved from the start | The old stadium serves until the new tier opens. Tiers one to three stand on four of the six cells with the practice field on the other two; tiers four and five fill the plot. Agreed 2026-11-11 |
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
| The player's academic rating is the visible weighted sum of section 24.4 | The owner's rule: the ranking is computed from the metrics, with weights the player can read |
| The other 199 schools keep one academic rating each. For Year-End grades each also stores one fixed offset per pipeline stage, made once | "B+ in retention" is then a real position among 200, at no cost in catch-up. Stored, never regenerated |

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
| Dean of Students | Housing, Student Life, happiness, safety, Greek Row | "38 housing lots stalled by stadium noise" |

### 12.3 Starting policy list

Final wording follows the tone guide.

| Policy | Helps | Costs |
|---|---|---|
| Quiet Hours | Less mischief | Happiness and Student Life income |
| Need-blind admissions | In-state and scholar applicants | Scholarship spending |
| Athlete tutoring | Fewer eligibility crises | Instruction budget |
| Freshman live-on rule | Full dorms and room fees | Happiness and commuter applicants |
| Night games | TV money | Longer noise hours near the stadium |
| Free student section | Attendance and happiness | Ticket income |
| Parking fees | Income | Commuter happiness |
| Tough grading | Academic rating | Retention |
| Reading days before finals | Lower exam Stress (section 27) | A little teaching time, so a slightly lower academic score that semester |
| All-night library | Scholar draw, a softer finals dip | A bigger library load |
| Hiring freeze | Lower Instruction need | Academic rating |
| Naming rights | Income | Happiness |
| Tuition freeze pledge | Happiness | Price levers lock for a year |
| Deferred Rush | Less academic drag | Fall happiness |
| Chapter Grade Standard | Less academic drag | Chapter membership |

### 12.4 Events

All sit inside the tone guide (section 16).

| Event | Risk factor shown first | Damage |
|---|---|---|
| Recruiting scandal, two steps | High Athletics overfunding, a win-at-all-costs coach trait | Athletic rating, a fine |
| Faculty walkout threat | Instruction underfunded | Temporary academic penalty |
| Dorm flood | A Rundown dorm | Repair timer on one building |
| Field storming | Thin safety coverage at the stadium | Goalposts, a repair bill |
| Mascot theft | Rivalry week, thin safety coverage | Happiness until it is recovered |
| Parking uprising | Parking shortage | Happiness |
| Grade inflation exposé | Tough grading off, weak Instruction | Academic rating |
| A booster's suspicious gift of a boat | A big donor deal accepted earlier | A choice between cash and reputation |
| Professor feuds with the marching band | Academic lots inside the stadium's noise | Happiness, a noise ruling |
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
| Homesick fades | Out-of-state freshmen only, strongest in the first term, gone by the second year. Lower when happiness and Student Life coverage are high |
| Pledge becomes Greek Loyalist | New chapter members read as Pledge for one term after rush, then as Greek Loyalist |
| Finals push many into Stressed-Out | During each finals window a share of every cohort [T] reads as Stressed-Out, drawn least from Slacker and Party Animal. It reverts afterward |
| Game days swell Superfan | Doubled on home game days and after big wins |
| A tuition hike swells Broke Student | For one term after a price step up |
| Super Senior grows | Seniors only, rising when the graduation rate is low or Academic seats are the bottleneck |
| Attention Seeker follows the mood | Rises whenever happiness has moved sharply, in either direction |

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
| Social Butterfly | Student Life coverage, happiness | Student Life lots | Waving at everyone | Slightly better retention |
| Resident Advisor | Housing crowding, Rundown buildings, Facilities | Dorm entrances | A clipboard | Slightly less mischief in dorms |
| Super Senior | Graduation rate, the Academic bottleneck | Everywhere, unhurried | A cap from three years ago | None |
| Class Clown | Campus Safety coverage, mischief | Near statues | A traffic cone | Slightly more prank petitions |
| Party Animal | Student Life coverage, Greek Row size | Student Life lots by evening, a bench by morning | A party hat, still on | Slightly more Student Life income, a slight drag on the academic rating |
| Charmer | Campus beauty: green space and average Housing desirability | Quads and the lake | A single flower, a slow stroll | None |
| Attention Seeker | How fast happiness is moving | Wherever the biggest crowd is | Filming themselves | Happiness swings a little faster |

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
| The mascot | Happiness, game day |
| A campus squirrel | Green space |

On 2026-11-11 the owner asked for more of these, each with a card. Section 32 has the full list and the rules. The coach, the mascot and the squirrel above stay for their own layers.

### 13.7 Tone for personalities

Jokes aim at types and institutions and never demean a student. The Party Animal carries no alcohol reference: they are always coming from a party and sleep through morning class. The Charmer stays at harmless flirting. Homesick, Stressed-Out, Heartbroken and Broke Student stay comic and never imply a crisis.

### 13.8 The student card, simple version

Brought forward into the feedback pass on 2026-11-11 at the owner's request. Built: `src/sim/systems/students.ts`, `src/sim/config/students.ts`, `src/ui/studentCard.ts`.

| Decision | Why |
|---|---|
| Tapping a walking student opens a card with exactly six lines: who, doing now, GPA, club, relationship, happiness | RollerCoaster Tycoon's guest card, cut to what fits a phone. It began as five lines; the owner added Relationship and changed grades to GPA on 2026-11-11 |
| No per-student simulation. A student is a seeded identity: the game's seed, the year their class entered, and their place in that class | The same student shows the same name, major, quirk, club, look and dorm every time. Nothing is saved and catch-up never runs it |
| Every other line is read from live numbers while the card is open | A card can never disagree with the campus. Class year comes from the cohorts, grades from the teaching side of campus, happiness from the causes of happiness where the student lives |
| Happiness on a card is the campus Happiness number, read at one student's spot. One number, never two | The owner's rule. Campus Happiness, when it is built, is the average of the same function over where students live |
| The happiness line is a face and the single biggest reason, phrased as a thought. Tapping it glides the map to the building it is about and selects it | Test 4. The joke on top, the number underneath, the fix one tap away |
| A content student names the biggest plus. Anyone else names what would help most | The reason always points at something the player can change |
| Every walker is one of the enrolled students, and only goes home to their own dorm | "Doing now" matches the map, and a thought about "my dorm" is about the dorm they walk into |
| One Follow button | The camera stays on the student until they go indoors or the player drags the map |
| Clubs are names only, weighted by major, nature and quirk | No club mechanics |
| GPA is on a 4.0 scale to one decimal | It sits around the campus average, a little lower in the first year and higher by the last, with Scholars above and Slackers below. 1.5 is the floor: nobody on a card is failing |
| Relationship is one of six statuses: single and looking, happily single, in a happy relationship, in an unhappy relationship, happy long-distance, struggling long-distance | A little story to follow. Whether a student is single, with someone or with someone far away follows their own seeded story and can change only at an intake. Nothing is stored: the story is replayed from the semester they arrived |
| Which side of a status a student is on leans with the campus's social life | The part the player can change. Half are on the happy side when social life is middling, and it moves that share by up to a fifth either way [T]. Someone single and looking says "nowhere to meet people" when it is thin |
| The status moves that one student's happiness by a few points [T], shown as a note on its own line, and is never the reason on the Happiness line | The reason must stay something the player can act on. The points are the same size up and down and natures lean only toward a kind, never a side, so across the campus they cancel. Only social life moves the average. Tests hold both |
| The status is the whole of it: never who, never why. It shows on the card only and is never a campus stat | Tone guide, and the rating in 16.3 |
| The first line also says "Lives in a dorm" or "Lives off campus" | Asked for with the neighbourhoods of section 21, item 11. It reads the share who need no bed today, and the neighbourhood a student lives in once those exist |
| First names are ones anyone can carry, and surnames are built from two invented halves | A name never clashes with a walker's look, and no card can carry a real person's full name |

| Line | Reads now | Replaced or widened by |
|---|---|---|
| Happiness | Four causes of equal weight at the dorm: walk to class, green space, food & fun (dining in reach and things to do in reach, averaged), and safety & health (Medical Center and Campus Safety coverage, read together). A commuter reads the last three around two lecture halls. The thought names the weakest part of the cause, so it is always something to build | Noise joins green space as "Surroundings" when it is built. Layer 3's overlays become the jump target where one fits |
| GPA | The campus average follows how pleasant the Academic lots are and how full the seats are [T]. A student sits around it by seed, class year and nature | The academic score of section 24 |
| Social life | Quad cells and recreation buildings per student. Recreation was swapped in with play stop 1 | Student Life spots and events join the count as each is built |
| Archetype | A lasting nature by seed, from the fourteen archetypes whose stat exists today. Lost Freshman and Homesick fade over the first year. Super Senior grows when Academic seats capped the last class | The state-driven mix of 13.2 and all eighteen, in layer 6 |
| Quirk | The six of 13.4, as a label | Their visible behaviours, in layer 6 |
| Thought | A short pool per cause | The archetype pools of 13.4, in layer 4 |
| Staff | Before the first class arrives the walkers are staff and have no card | Non-student characters, 13.6 |

Named regulars and their four-year story stay in layer 6, as designed in 13.5.

**Standing instruction from the owner, 2026-11-11:** as each real system arrives, its stand-in on the card is swapped for it, and the owner is told at the time. Done with play stop 1: dining and recreation as causes of happiness, and recreation in the social-life count. Done with play stop 2: safety as a cause of happiness, regrouped the same day into four causes at full weight (24.2). The swaps still owed: noise as a cause of happiness; the academic score for grades; and the four remaining personalities (Superfan, Varsity Athlete, Greek Loyalist, Pledge) with football and Greek Row. Student Life spots, recreation and events also join the social-life count behind the relationship line. Hopeless Romantic and Heartbroken join the relationship odds when they ship. The face drawn in code stays.

---

## 14. Identity: Greek Row, traditions and flavour

### 14.1 Greek Row

| Decision | Why |
|---|---|
| A Housing brush variant, capped at medium density, with fewer beds than a dorm | Its value is happiness, retention and giving, not capacity |
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
| Happiness | Noise that Housing and Academic dislike |
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
| Breaking one costs happiness and giving, scaled by the streak, which then resets | A real cost for cutting the thing it depends on |
| Streaks appear in the record book | Traditions are the v1 form of the heritage bonus |

| Tradition | Its day | Standing condition | Lifts |
|---|---|---|---|
| Rivalry bonfire | Eve of the rivalry game | An open quad kept clear inside Campus Safety coverage | Happiness, an edge in the rivalry game |
| Fight song | Every home game | Student Life at full funding, which keeps the marching band | Attendance, happiness |
| Lucky statue | Finals nights | The statue stays standing and on a path | A softer finals dip, retention |
| Rivalry trophy | The rivalry game | Always met; a bonus while the school holds the trophy | Donations |
| Homecoming parade | Homecoming | An unbroken path from the town edge to the stadium | The donation spike |
| Victory bell | After home wins | The bell tower stays standing | Happiness after wins |
| Senior walk | Commencement | The gate stays, with a path through the main quad | The graduating class's alumni affinity |
| Midnight breakfast | Finals nights | Student Life at full funding | Happiness during finals |

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
3. **Events harm buildings, budgets and pride, never people,** with one exception the owner made on 2026-11-11: minor, comic injuries, such as a stubbed toe at the courts. Nothing serious, nothing graphic, nobody dies, and every one resolves. Campus Safety handles mischief and pranks, not crime.
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
| Happiness | Approval, satisfaction |

**Happiness is the one word for how students feel about the school, everywhere on screen:** the HUD, the student card, the Build menu cards, the Scorecard, the inbox and the newspaper. The owner retired "approval" from the interface on 2026-11-11. It is one number with one name. The code still calls that number `approval`, and that name never reaches the player. A test (`tests/wording.test.ts`) fails if on-screen text says approval.

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

The relationship line on the student card (13.8) was checked against this table on 2026-11-11. It is a status and nothing more, with no detail, no partner and no storyline, and none of the rows above describes it. The target stays 4+. It goes on the list to recheck against Apple's questionnaire at submission.

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
       every 60 ticks                 happiness drift, Rundown flags, desirability refresh if dirty
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
ratings      academic, athletic, happiness
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

**The away list is saved with the game** (2026-11-11). It is kept beside the state in the same file, so the two can never disagree, and it stays until the player taps "Back to campus". If the app is closed first it is still there next time, with anything newer added to it. An exported backup does not carry it.

**Backups on the web** (2026-11-11). The app asks the browser for persistent storage when a game is founded and again every time one is loaded. The Menu shows a gentle reminder to export a backup when the browser has not agreed, or when the last export, or the founding of the game if there has been none, is more than five days old. The iOS app never shows it: its files are not the browser's to clear. On an iPhone or iPad, a browser tab also shows one tip, once, on a return visit: to add the game to the Home Screen, because Safari keeps the saves of Home Screen games. It never shows in the iOS app or when the game is already running from the Home Screen.

| Browser | Without a grant | How a grant is given |
|---|---|---|
| Safari on iPhone, iPad and Mac, and other iPhone and iPad browsers, which use the same engine | A save written by the page can be deleted after seven days in which the player did not open the game. A game added to the Home Screen is exempt | By the browser's own judgement, such as being opened from the Home Screen. No prompt |
| Chrome and Edge | Deleted only when the device is short of space, least recently used sites first | By the browser's own judgement from how much the site is used. No prompt |
| Firefox | Deleted only when the device is short of space | The player is asked |
| A private or incognito window, in any browser | Gone when the window closes | Never |

Checked on 2026-11-11 against MDN's page on storage quotas and eviction, and WebKit's pages on storage policy and tracking prevention.

### 17.6 The simulate script

`npm run simulate` runs the pure sim headless and prints one row per game year: enrollment by tier, cash, the three ratings, average stage, record, applicants, bailouts.

| Profile | Behaviour |
|---|---|
| Absent | No input. One advance per 30 days |
| Daily | One check-in a day, the slowest rhythm the game supports. The casual player looking in half as often and buying twice as much in a visit |
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
| Daily profile: reaches each era no worse than about one and a half times slower than the casual profile, and never needs the bailout for a missed deadline alone. Built on 2026-11-11 against campus size and the plain grant, until eras and the bailout exist | Check-in contract |
| No annual decision window is shorter than 48 hours | Summer rule |
| Mid-game budget shares sit near their targets on each ladder | Budget |
| All of the above hold across map seeds | Map variety |

### 17.7 Dev tools, notifications, art

- **Dev time-skip panel**: +1 hour, +1 day, +1 year. It shifts the app's clock; the sim is unaware. Dev builds always show it. TestFlight builds carry it behind a hidden switch that is off by default: seven taps on the version line in the Menu. The web build and any App Store release build do not contain it.
- **Notifications**, iOS app only: at most two a day by default, and the player can change the number or turn them off. Two kinds: a decision about to expire, and a headline result. It was three a day, with construction and the Year-End report among the candidates, until the owner set this on 2026-11-11.
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
- **Feedback pass, 2026-11-11.** The owner approved the look, so the pass is being built in three play stops, with a stop for him to play after each. **Stop 1, built:** the Build button and menu; twelve hand-placed buildings (library, dining hall, coffee stand, campus store, gym, track, pool, courts, recreation field, and ponds in three sizes); a starter dining hall and the Administration building on new campuses; Happiness with its causes on the HUD; retention that follows it; the record of every entering class; the acceptance rate on the room plan. Save version 3. Also built earlier in the pass: walking students, trees, laid-out quads and the student card (13.8). **Stop 2, built:** Medical Center and Campus Safety with fixed circles; incidents (comic injuries where students play, mischief where dorms are full) with an icon, a line, and a responder who walks from the nearest covering building; uncovered ones linger, cost a little safety and pass; Safety as a cause of Happiness; students with no bed leave at the end of the semester; test players who use the Build menu, with three new simulate checks. Save version 5. **Stop 2 fixes, built at the owner's request:** calendar dates run evenly again, with football fitted to them (4.8); Happiness regrouped into four causes at full weight (24.2); the waitlist window lengthened from nine hours to 36, with the audit of every timer against one visit a day (4.9); a once-a-day test player. **Stop 3, built:** the town and its neighbourhoods, locals who walk or drive, roads and crossings, the parking lot and parking structure, room fees, two fields of land for sale, cars, and the save upgrade (25.6); the day and night light, street lamps, the walker schedule and the night guard (28.4); a one-time Home Screen tip on iPhone and iPad browsers (17.5). Save version 6. **Stop 3 fixes, built after the owner played it:** a barrier badge over a car park with no road and the Parking overlay (8.4); the three fixes for a bed shortage with their numbers (25.2); a Done button for the road tool; the town confirmed east of campus. **Stop 4a, built:** Grounds (29.14): litter, bins, benches, picnic tables, the Facilities Yard and its workers, breakage and repairs, Grounds as a cause of Happiness, and the Cleanliness overlay. Save version 7. **Stop 4a fixes, built (29.15):** a yard reaches twelve cells, workers mend a broken bin first, breakage reads the students near the spot, and a broken street lamp explains itself on a tap. Save version 8. **Stop 5, Money, built (31.10, 29.16, 32.1):** payroll and every other cost as its own line, the Money panel, recruiting and marketing, the plain endowment, a seven-day phase-in for older saves, a yard that reaches sixteen cells with six workers, a card for anything broken, and a campus that opens with all four class years. Save version 9. **Stop 4b, waiting for the owner's word:** more food places and Academics buildings (section 30). **After stop 1, built at the owner's request:** refunds on clearing with a prompt (9.6), a "Build a dining hall here" shortcut on a dorm held back for want of dining, a one-time note of new rules on older saves, and the date on the HUD. Save version 4. From here each play stop is built on its own branch and merged only when it is finished and its tests pass. **Stop 4, designed and waiting for the owner's go-ahead:** Grounds, which is litter, bins, seating and maintenance workers (section 29). It lands after stop 3 and before layer 1. Stop 4 was accepted on 2026-11-11 and does not start until the owner has played stop 3. Section 30 proposes adding ten kinds of food and three Academics buildings to it. Section 30 was accepted the same day: stop 4 plays in two halves, Grounds first and then food and Academics. Section 31 proposes a play stop 5, Money, after both halves of stop 4 and before layer 1. It waits for the owner's go-ahead. The owner gave the go-ahead for the money stop the same day, to be built before the second half of stop 4, with the yard changes of 29.15 and the four class years of section 32. A small People stop (section 32) follows it.
- **Acceptance checks:** installs to the home screen. Zoned lots rise within minutes. The first class arrives within fifteen minutes. The Bottleneck tag names the scarce zone, and fixing it during the waitlist admits more students. After a night away, the away list shows what grew and what was earned. A lot stalled for low desirability grows after a quad is placed. Setting the phone clock backward does nothing harmful.
- **Simulate must assert:** determinism; the catch-up time target; the clock guard; the absent profile still functions after five years; the casual profile's enrollment grows over its first years.

### Layer 1: Football and calendar

- **Contents:** the anchored whole-day week, founding day and scrimmage, anchor shift. The national field with drift. Conference, ten-game season, title game, bowls, poll. Team rating, coach, recruiting pitch, signing day, spring game, rivalry. Five-tier stadium, ticket price, rented field, noise radius. Live games with a score ticker. TV deals. Football profit-and-loss page. A basic Year-End report. A plain "annual decisions" list with deadlines and defaults.
- **Calendar and Stress (sections 4.8 and 27):** the dated events of the academic year with their effects, the away summary grouped by date, midterm weeks, Stress for students and faculty with its exam reports, the reading-days policy, and the proposed moves to the football calendar once the owner answers them. The HUD date and the calendar data are already built.
- **Metrics (24.7):** the Scorecard page, first version. Athletic prestige. A first academic rank from the inputs that exist. Grades on the Year-End report.
- **Stand-ins:** Athletics funding fixed at full. Football lifts the single applicant pool. No crowds or band yet.
- **Acceptance checks:** intakes and day games land in waking hours. A morning visit finds overnight results. A live game can be watched. A season of sell-outs earns a tier. Missing a weekend applies one-year defaults.
- **Simulate must assert:** the favourite win rate; ten games per team per season and consistent standings; no annual window under 48 hours; the field's average does not drift; determinism still holds.

### Layer 2: Tiers and money levers

- **Contents:** Student Life zone. Three density tiers, upzoning, rectangle fill, Preserve. Decay with its brake. Density economics. Three applicant tiers, tier breakdown, emergent selectivity. Three price levers. Five sliders with overfunding. Happiness. Alumni and donations. The budget screen. Bailout. Land purchase.
- **Metrics (24.7):** computed yield, affordability, class size, graduation rate with its forecast, fifth and sixth years, alumni success with job placement, donations by success, facilities condition, the full ranking weights.
- **Stand-ins:** tiers and land unlock at bare enrollment thresholds. Ceilings are constants. Medium density has no safety gate yet.
- **Acceptance checks:** a price change shows its forecast and bills from the next intake. An overbuilt zone shows red on the budget and turns Rundown. A week away does not flatten the campus. Football's draw is visible in out-of-state applicants.
- **Simulate must assert:** both absent-profile runs settle; the stage-loss limits; the overfunding rule; budget shares near targets; the bailout never ends a game.

### Layer 3: Services and overlays

- **Contents:** full desirability with five inputs read per zone. Lake, town edge, highway and seeded map variety. Campus Safety, Health Center, Library, Parking, Shuttle. Shrinking circles and density gates. The four overlays and the automatic overlay while placing.
- **Acceptance checks:** every stalled lot shows a cause that the matching overlay confirms. Housing near the stadium stalls and Student Life there thrives. A circle visibly shrinks when Student Services is cut. Two new games give two different maps.
- **Simulate must assert:** every earlier assertion across at least ten seeds; no seed places a feature on the starter campus; the casual profile never has a stall with no cause.

### Layer 4: Advisors and newspaper

- **Contents:** four advisors with top-issue lines. The inbox with its four kinds and the annual section. Policies. Events. The newspaper with poll, admissions story and movers. Walkers and student cards with basic thoughts. Game-day crowds and tailgates. The first thirty content items, written under the tone guide.
- **Metrics (24.7):** the advisors and the newspaper read their top issues from the same limiting-factor helper as the Scorecard.
- **Acceptance checks:** each check-in opens on a newspaper. Each advisor's line matches what the overlays show. Ignored items resolve to their marked default. Every disaster story names what would have reduced it.
- **Simulate must assert:** the check-in contract for the casual profile; the inbox cap; every item has a default; no content item breaks the tone guide's banned-word list.

### Layer 5: Milestones

- **Contents:** two ladders, four eras, replacing the stand-ins. Reward buildings, ceiling landmarks, three prestige landmarks. Rankings day. Yearly awards. Board goals. Hall of fame. Endowment. The legacy screen.
- **Metrics (24.7):** the Year-End report graded on all seven stages. Endowment per student.
- **Acceptance checks:** every locked item shows its checklist. A rung is reached on each ladder. Standing falls in a bad year while unlocks stay.
- **Simulate must assert:** the optimizer's six-month target; the era pacing targets; a prestige-only strategy reaches every era; the endowment cannot be used to farm bailouts.

### Layer 6: Identity

- **Contents:** Greek Row with rush, chapter standing and its two policies. Traditions. Homecoming, finals, commencement speaker, spring concert. The flavour items. Marching band. Layered personalities with eighteen archetypes and six quirks. Named regulars and non-student characters. Content to about sixty-five items.
- **Metrics (24.7):** town relations.
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
| Desirability | Quads, trees and walk time only. The lot inspector names one stall cause |
| Trees | A Tree tool with a picker of six kinds. A tree sits on one cell, costs $6,000 [T] and lifts nearby lots about a third as much as a quad cell [T]. Added on 2026-11-11 after the owner's first session |
| Quads | A quad is a clean lawn. What stands on each cell follows from its place in the quad: trees at corners and ends, benches along edges, flowers in the middle, a showpiece on a quad of one cell. No scatter |
| Walking students | A sample of the students walks the paths between housing, classes and quads. The number in view grows with enrollment and with how much of the campus is on screen. Students who get a place while the player watches walk in from the edge of campus under a "+24 moving in" note. It is for show only: nothing is saved, the sim never runs it, and catch-up does not pay for it. Brought forward from the polish layer on 2026-11-11 |
| Student card | Tapping a walking student opens five lines: who they are, what they are doing, their grades, their club, and a face with the one biggest reason for their happiness. Tapping the reason glides to the building it is about. A Follow button keeps the camera on them. Nothing is stored per student (section 13.8). Added on 2026-11-11 at the owner's request |
| Build menu | A Build button opens a menu of hand-placed buildings by category, each card with its sprite, cost, footprint, upkeep and one line on what it does. Picking one and tapping the map shows it faded in place, its footprint green or red, and its reach in blue, with Place and Cancel. Tapping a placed building says what it is doing now. The Clear tool removes it. Added in play stop 1 of the feedback pass |
| Happiness | One number on the HUD with a face. Tapping it lists its causes across the campus, names the biggest gap and what to build, and says how many students stay each semester at that happiness. Retention follows it. Added in play stop 1 |
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
5. **Final lists** still to be written under the tone guide: fourteen policies, sixteen reward buildings, ten awards, Board goal templates, the three prestige landmarks' effects. Section 23 supplies candidates for the reward buildings.
6. **Stadium art.** Settled for building, open for release. All five tiers have a sprite: one is the pack's, two and three are made from its own stand, four and five are a CC-BY 3D bowl rendered in the pack's colours, outline and camera (`tools/render/model.html`). The owner judged the rendered bowl good enough to build football with, and it is to be replaced by drawn art before release. He is asking Penzilla for a quote himself. Nothing is ordered.
7. **Founding numbers.** The founding class size and the first size rung must let the first rung land by the third check-in.
8. **Daylight saving.** The anchor is stored in UTC, so it moves an hour in local time twice a year until the player shifts it.
9. **Game title.** "Campus Tycoon" is a working title.
10. **One word for how students feel.** Settled on 2026-11-11: the word on screen is Happiness, everywhere (section 16.2).
11. **Off-campus neighbourhoods.** Settled on 2026-11-11, with a road tool added by the owner. Section 25.

### First-playable stand-ins

Simplifications the first playable uses until a later layer replaces them. All are in config.

| Stand-in | Replaced in |
|---|---|
| One applicant pool, drawn by word of mouth and average campus desirability | Layer 2, by the three tiers |
| One bed need for every student [T] | Layer 2 |
| Flat tuition per student [T] | Layer 2, by the price levers |
| Flat retention [T] | Layer 2, by happiness |
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
| Calendar | Football dates | Ten of the thirteen Saturdays from Sep 5 to Nov 28 (4.8) |
| Calendar | Waitlist window, and the shortest any window may be | 36 hours |
| Calendar | Spring intake size | About a fifth of fall |
| Calendar | Finals window | About 3 hours, from the calendar |
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
| Desirability | Tree price and a tree's share of a quad cell's lift | $6,000 and 0.34 |
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
| Students | Student card: nature weights, Lost Freshman and Homesick shares, Super Senior share, club match weights, grade floor, span and spread, mood steps | The values in `src/sim/config/students.ts` |
| Metrics | Ranking weights: graduation, class size, alumni success, reputation, retention, selectivity, money per student | 25, 15, 15, 15, 10, 10, 10 |
| Metrics | How far one stage can swing the next | To be set, and bounded |
| Students | Relationship: kinds at entry, share that stays each intake, the social swing, points of happiness, students per social spot | 55/12/33, 0.6, 0.4, 4, 40 |
| Town | Share of each class who are locals | About four in ten |
| Town | Neighbourhoods at the start, house plots in each, students per house | 3, about 12, 4 |
| Town | Walking range from a neighbourhood gate to the nearest Academic lot | 10 minutes |
| Money | Tuition and room fee | $8,200 a student and $3,000 an occupied bed |
| Roads | Cost a cell, upkeep a cell, the desirability a road takes from a lot beside it | $3,000, $150 a year, 3 points |
| Parking | Cars in a surface lot, cars in a structure, their costs and penalties | 20 on two cells for $20K, 6 points off a lot beside it; 100 on four cells for $160K, 3 points off |
| Town | Locals in a class, students a house plot, plots a neighbourhood, the longest walk from town | Four in ten, 10, 9 to 14, 12 minutes |
| Land | The map, and the fields for sale | 42 by 48 cells; two fields of 16 by 16 at $250K and $400K |
| Greek Row | Beds per stage, target share of enrollment | The table in 6.2; share to be set |
| Simulate | Optimizer check-in interval | 2 hours |
| Performance | 30 days of catch-up | Under one second on a desktop |

---

## 23. Master building catalog

Written 2026-11-11. The owner supplied a printed map of a real Division I campus as a checklist of what a complete university contains. The map is copyrighted. It lives in `art/reference`, which is git-ignored, and it is never committed. It is used only as a list of building types and a guide to layout. No real name, logo, mascot or team from it appears anywhere in the game, and no layout is traced from it. Every name in the game is invented.

**Status: accepted by the owner on 2026-11-11**, with the mapping changes in 23.3, both layout fixes in 23.4 and the four additions in 23.5. Bike lanes are cut. The table is the plan for where each type lands. Nothing in it is built yet: the mechanics of this pass wait for the owner to approve the look.

### 23.1 The rule that keeps it readable

The map shows 54 kinds of facility. Fifty-odd rules would fail design tests 4 and 8. So there are ten effect families, and every building type is a look, a size or a landmark inside one of them. A type never gets a rule of its own. The Build menu is grouped by family.

| Family | What it covers |
|---|---|
| Seats | Academic halls. A department is a look, not a rule |
| Beds | Residence halls, apartments, towers, housing over shops, and Greek Row as the variant already designed |
| Places | Student Life lots: shops and venues. Their food moved to the Build menu on 2026-11-11 (section 30) |
| Dining | Every food place feeds the lots around it: the dining commons, the coffee stand, and the eight food places of section 30. They differ in size, cost and reach, never in rule |
| Happiness | Gym, pool, courts, fields, track, theatre and amphitheatre raise happiness near them |
| Academic lift | The library, the computer lab and the science lab (section 30), and later the Grand Library |
| Coverage | Medical Center, Campus Safety, Facilities yard and Shuttle each cover a circle |
| Access | Parking and the transit station decide how many students can commute |
| Landmarks | Reward, ceiling and prestige landmarks. Each emits desirability or lifts one ceiling |
| Venues | The stadium, and later the arena and varsity fields, each tied to a sport that exists |

### 23.2 The catalog

Layers are the build layers in section 18. "This pass" is the feedback pass on Layer 0. Sprites are named by their file in the Penzilla packs. "From parts" means made from pack pieces with edits that are listed in the credits.

**Academic**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Academic hall | Zone lot | Seats | 1 x 1, merging to 2 x 2 | 0. Merging is on the later roadmap | Plain blocks at one cell. School, College and University at four cells | Drawn |
| Department identity: Engineering, Sciences, Arts and Letters, Business, Education, Music, Fine Arts, Health Sciences | Skin on an Academic hall | None of its own. The skin follows the mix of student majors and feeds student cards and newspaper stories | Same lot | 4 | An emblem on the hall from pack props: anvil, bottle, book, coins, scroll, lute, statue, herbs | From parts |
| Library | Hand-placed | Lifts nearby Academic lots and draws scholars | 2 x 2 | This pass, full version in 3 | Public_Library | Drawn |
| Computer lab | Hand-placed | Lifts Academic lots within four cells: the library's rule at a smaller size. From layer 1 it counts as study space against exam Stress (section 30.3) | 2 x 1 | Play stop 4 | Workplace_Electrician_OneFloor | Drawn |
| Study center | Hand-placed | Tutoring. A better GPA on the cards of students in reach, as a stand-in. From layer 2 it is a cause of the graduation rate | 2 x 1 | Play stop 4, full version in 2 | A plain hall with the pack's book as its sign | From parts |
| Makerspace | Hand-placed | Things to do and social life within five cells: the recreation rule | 2 x 1 | Play stop 4 | Shop_Tools_OneFloor | Drawn |
| Science lab | Hand-placed | Lifts Academic lots like the library and draws scholars. It waits for tiers, because before them it is only a second library | 2 x 2 | 2 | A plain two-floor building with the pack's bottle as its sign | From parts |
| Research lab | Zone lot of the later Research zone | Research income and prestige | 2 x 2 | Later | Industrial and Workplace buildings | Drawn |
| Observatory | Reward landmark | Emits desirability | 1 x 1 | 5 | None | No sprite |
| Continuing education centre | Flavour | None. It belongs with transfer and graduate students on the later roadmap | None | Later | Hotel_OneFloor | Drawn |

**Housing**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Residence hall | Zone lot, low and medium density | Beds | 1 x 1, merging to 2 x 1 and 2 x 2 | 0. Density tiers in 2 | Apartment blocks in six colours and nine sizes | Drawn |
| Apartment complex | Skin at medium density | Beds, the same rule | 2 x 2 | 2 | Apartment 2 x 2 with Garden_Pool | Drawn |
| Residence tower | Zone lot, high density | Beds | 2 x 2 | 2 | Apartment floors stacked higher | From parts |
| Housing over shops | Skin, when dense Housing touches Student Life | Beds, the same rule | 2 x 1 | 2 | Shop two-floor buildings | Drawn |
| Chapter house on Greek Row | Housing brush variant | Happiness, retention and giving, with noise | 1 x 1 | 6 | House_Type in eight colours, with a banner | From parts |

**Dining and shops**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Dining commons | Hand-placed | Feeds Housing in its radius. Stage 2 Housing needs a food place in reach | 2 x 1 | This pass | Restaurant_Sandwich. Nine more restaurants are spare. The bar is not used | Drawn |
| Coffee stand or market | Hand-placed, small | Feeds Housing in a small radius | 1 x 1 | This pass | StreetStand_Coffee | Drawn |
| Food truck | Hand-placed, small | Feeds a small radius. Clearing it always returns its whole price, so moving it is free | 1 x 1 | Play stop 4 | Truck_Groceries. It is a box truck with no serving hatch | Drawn |
| Taco stand | Hand-placed | Feeds a small radius | 2 x 1 | Play stop 4 | Restaurant_Mexican as drawn, with its patio | Drawn |
| Pizza place | Hand-placed | Feeds a small radius | 2 x 1 | Play stop 4 | Restaurant_Pizza as drawn, with its patio | Drawn |
| Smoothie and juice bar | Hand-placed, small | Feeds a small radius. Earns double beside recreation | 1 x 1 | Play stop 4 | StreetStand_Icecream | Drawn |
| Convenience store | Hand-placed, small | Feeds a very small radius | 1 x 1 | Play stop 4 | StreetStand_NewsPaper | Drawn |
| Burger grill | Hand-placed | Feeds a medium radius | 2 x 1 | Play stop 4 | Restaurant_Burger | Drawn |
| Late-night diner | Hand-placed | Feeds a medium radius | 2 x 1 | Play stop 4 | Restaurant_Breakfast | Drawn |
| Food court | Hand-placed | Feeds a wide radius and counts as three kinds of food | 2 x 2 | Play stop 4 | Groceries_Market, the open-air market | Drawn |
| Campus store or bookstore | Hand-placed | Earns from foot traffic | 2 x 1 | This pass | Shop_Kiosk. A book prop makes it a bookstore | Drawn |
| Retail plaza | Zone lot of Student Life | Places, and foot-traffic income | 1 x 1 and 2 x 1 | 2 | Eleven shop kinds and the flower stand. The market, the ice-cream stand and the newspaper stand went to the food places above | Drawn |
| Faculty club | Reward landmark | Emits desirability | 2 x 1 | 5 | Cafe | Drawn |

**Student life and culture**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Student union | Reward landmark that opens the Student Life zone | Unlocks Student Life and emits desirability | 2 x 2 | 2 | Groceries_Mall. It reads as a mall | Drawn |
| Theatre | Hand-placed | Raises happiness and hosts the spring concert | 2 x 2 | 6 | Leasure_Theater | Drawn |
| Recital hall | Skin of the theatre | The same | 2 x 1 | 6 | Shop_Music_TwoFloors | Drawn |
| Amphitheatre | Hand-placed | Calendar moments held there lift happiness more | 2 x 2 | 6 | None. A stage prop exists | No sprite |
| Art gallery | Reward landmark | Emits desirability | 2 x 2 | 5 | Leasure_Museum | Drawn |
| Resource centre, one type with several looks | Hand-placed | Raises retention a little, with falling returns | 1 x 1 | 2 | House_Type | Drawn |
| Children's centre | Reward landmark | Emits desirability | 2 x 2 | 5 | Education_School, with its swings | Drawn |

**Recreation**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Gym | Hand-placed | Raises happiness | 2 x 1 | This pass | Plain hall with a dumbbell on its sign | From parts |
| Aquatics pool | Hand-placed | Raises happiness nearby | 2 x 1 | This pass | Pool | Drawn |
| Outdoor courts | Hand-placed | Raises happiness nearby. Students play there | 1 x 2 | This pass | Court cut from the tennis stadium. No basketball court exists | From parts |
| Recreation field | Hand-placed | Raises happiness nearby. Students play there | 2 x 2 | This pass | Soccer pitch with its stands cut off | From parts |
| Track and field | Hand-placed | Raises happiness for nearby Housing. Lifts Athletics later | 2 x 2 | This pass | Stadium_Athletics | Drawn |

**Health, safety and upkeep**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Medical Center | Hand-placed service | Treats injuries in its circle. Later gates high density and lifts retention | 2 x 2 | This pass, full version in 3 | Doctor_Office, EmergencyRoom and Hospital: three sizes | Drawn |
| Campus Safety | Hand-placed service | Handles mischief in its circle. Later gates medium density | 2 x 2 | This pass, full version in 3 | Emergency_PoliceStation | Drawn |
| Facilities yard | Hand-placed service | Holds maintenance workers, who clear litter, empty bins and fix broken things in its circle. From layer 2 they also slow decay there (section 29.4) | 2 x 1 | Play stop 4 | Workplace_Handyman | Drawn |
| Central plant | Reward landmark | Lowers upkeep a little. An eyesore | 2 x 2 | 5 | Industrial_PowerPlant and WaterPlant | Drawn |
| Central receiving | Flavour | None. Crates and a truck beside the store | None | 7 | PostOffice, shipping containers, trucks | Drawn |
| Campus station, radio and television | Reward landmark | Emits desirability and gives the newspaper a voice | 2 x 1 | 5 | RadioStation and TeleTower | Drawn |

**Administration and landmarks**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Administration building | Starter landmark, not placeable | Emits desirability. Later it opens the budget | 2 x 2 | This pass | Public_Townhall | Drawn |
| Student services | Flavour | None. It is part of Administration | None | None | Workplace buildings | Drawn |
| Welcome Center | Ceiling landmark, already designed | Lifts the out-of-state ceiling | 2 x 2 | 5 | Hotel_OneFloor | Drawn |
| Alumni centre | Reward landmark | Lifts alumni giving | 2 x 1 | 5 | Hotel_TwoFloors or WorkSpace_Bank | Drawn |
| Bell tower | Reward landmark | Emits desirability. Home of the Victory Bell tradition | 1 x 1 | 5 | Medieval stone tower, or the church with its spire | Drawn |
| Historic cottage and garden | Reward landmark | Emits desirability | 1 x 1 | 5 | Medieval FarmHouse with a pond | Drawn |
| Grand Library, Hall of Champions, Founders' Commons | Prestige landmarks, already designed | One campus-wide effect each | Large | 5 | None | No sprite |

**Athletics**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Football stadium | Venue with five tiers, as designed | As designed | 2 x 3, reserved from the start | 1 | Stadium_FootballAmerican for tier one. Tiers two and three made from its own stand. Four and five are a rendered 3D bowl until drawn art is commissioned | From parts, then a stand-in |
| Athletics headquarters | Flavour landmark that arrives with stadium tier two | Opens the Athletic Director's page | 2 x 2 | 1 | A Workplace building with a trophy on its sign | From parts |
| Practice fields | Flavour, drawn beside the stadium | None of its own | None | 1 | Soccer pitch with its stands cut off | From parts |
| Basketball arena | Venue | Needs basketball, which is on the later roadmap | 2 x 2 or larger | Later | None | No sprite |
| Baseball stadium, softball field, tennis centre | Varsity venues | Need their sport. They wait for spring sports, and are not placed early as prestige venues (23.8) | 2 x 2 | Later | Stadium_Baseball, Stadium_Cricket recoloured, Stadium_Tennis | Drawn |
| Tennis courts | Hand-placed | Raises happiness nearby, as the track does. Students play there | 2 x 2 | The pass after football | Stadium_Tennis without its roof | Drawn |
| Ball field | Hand-placed | Raises happiness nearby, as the track does. Students play there | 2 x 2 | The pass after football | Stadium_Baseball without its roof | Drawn |

**Access and transport**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Parking lot | Hand-placed | Fewer beds needed. Neighbours like it less | 1 x 1, 2 x 1, 2 x 2 | This pass | Carpark in three sizes, one with a gate | Drawn |
| Parking structure | Hand-placed | Several times the cars of a surface lot on a similar footprint, at a much higher price and a smaller desirability penalty. Needs road access | 2 x 2 | Third play stop of the feedback pass | None. A model of plain blocks, rendered, until one is commissioned | Stand-in |
| Road | Laid by dragging, a second network beside paths | Gives parking its road access. Lots beside it like it a little less | 1 x 1 | Third play stop | Road_Tile1 to 9, mirrored to make all sixteen joins. The crossing is made from the pack's own lane marks | Drawn, crossing from parts |
| Town house and town street | Not placeable. They belong to the town | Homes for locals (section 25) | 1 x 1 | Third play stop | House_Type1 to 20 in eight colours, three garden pieces, the road tiles | Drawn |
| Shuttle stop | Hand-placed service | Cuts walk time between stops | 1 x 1 | 3. First to be cut if scope slips | BusStop | Drawn |
| Transit station | Ceiling landmark: the Commuter Hub, already designed | Lifts the in-state ceiling. Must touch the highway or the town edge | 2 x 2 | 5 | MetroStation or Public_Trainstation | Drawn |
| Bike lane and bike parking | Cut | It would be a second tool for walk time beside the shuttle | None | Not planned | None | No sprite |
| Kiosks, pay stations, drop-off zones | Flavour, placed automatically | None | None | 7 | SignMap, signs, ATM, mailbox | Drawn |

**Grounds**

| Type | Kind | One main effect | Footprint | Layer | Sprite | Art |
|---|---|---|---|---|---|---|
| Quad, trees, ponds and the lake | Hand-placed | They share one green-space input and its cap | Any | This pass | Done | Drawn |
| Central walk | A strip of quad along the main path | Green space | Any | This pass | Lawn, trees and benches | Drawn |
| Trash bin | Hand-placed, one cell | Catches litter within three cells (section 29) | 1 x 1 | Play stop 4 | TrashCan, with TrashCanLarge for full and a TrashBag beside it for overflowing | Drawn |
| Bench | Hand-placed, one cell | Seating within three cells | 1 x 1 | Play stop 4 | Bench, from the older pack, as the quads use | Drawn |
| Picnic table | Hand-placed, one cell | Seating, and social life beside dining or Academic lots | 1 x 1 | Play stop 4 | TableSet in four colours. It is a table and chairs, not a picnic table | Drawn |
| Lamp post | Not placed. Play stop 3 sets them along paths and roads | None. It can be broken and fixed | None | Play stop 3 | StreetLampOn, StreetLampOff and StreetLampGlow | Drawn |

### 23.3 Where the expected mapping was changed

| The expectation | What the catalog does instead, and why |
|---|---|
| Departments tied to majors | Keep the tie, but only as a look. If each major needed its own seats there would be eight demand bars, which fails test 1 and breaks the rule in 7.1 that one population has three needs. A hall takes the emblem of whichever major is most short of a home when it is built. Nothing else changes. |
| Housing over shops | Not a new lot type. A dense Housing lot that touches Student Life shows shops on its ground floor. Same beds, same rule. |
| Twenty hand-placed buildings | Too many to each do something different. Seven of them become the reward landmarks the design already owes: section 21 lists sixteen reward buildings still to be written, and the map supplies them. The rest join an existing family. |
| Athletics venues | The arena, baseball stadium, softball field and tennis centre wait for their sport, by the same rule the owner set for the stadium: no venue that does nothing. The pool, courts, fields and track work now as recreation. Practice fields and the athletics headquarters are scenery attached to football, because the team rating already has four visible inputs and a fifth would blur every loss recap. |
| Back of house | The Facilities yard gets the one mechanic: buildings near it run down more slowly, which ties to the Facilities slider. The central plant and the campus station are reward landmarks. Central receiving is scenery. None of them gates density: Campus Safety and the Medical Center already hold the two gates. |
| Transport | The transit station is the Commuter Hub ceiling landmark that section 15.3 already has. Shuttle stops stay as designed. Bike lanes should be cut: they would be a second tool for the one walk-time number. |
| Each new Academics building with two effects and a favourite major (the owner's list of 2026-11-11) | One effect each, taken from a rule that exists or is already designed. The second effect arrives with its own system, and a major stays a look until departments are real in layer 4 (section 30.3) |
| Food that grows by itself in the Student Life zone | Food is hand-placed from play stop 4, ten kinds of it. The Student Life zone of layer 2 keeps shops and venues |

### 23.4 Layout: the model campus

The starter campus and the advisors' tips follow this shape: an academic core on a central walk with the library and the union, housing clusters one block out with their own dining, athletics on one side, and parking and transit on the perimeter by the highway. The starter campus becomes: the Administration building at the head of a short central walk, three Academic lots along it, three Housing lots a block away with a dining commons, and a parking lot at the end of the path nearest the map edge.

| Part of the model | Do the desirability rules in 8.2 reward it? |
|---|---|
| Academic core around a central walk, with the library | Yes. Academic lots like each other, the library lifts them strongly, and a walk built as a strip of quad counts as green space. |
| Student union between classes and housing | Yes. Student Life likes foot traffic from both. |
| Housing clusters with their own dining | Yes, once dining has a radius. |
| Athletics district on one side | Yes. Stadium noise pushes Housing and Academic away and pulls Student Life and Greek Row in. |
| Housing at the edges | **No.** Housing likes Academic lots and pays a walk penalty, so the rules pull dorms into the core. Fix, accepted: Academic lots dislike Housing next door a little, as quiet study. Then the core stays academic and housing settles one block out. |
| Parking and transit on the perimeter by the highway | **Only by default.** Nothing dislikes parking there, but nothing rewards it. Fix, accepted: a parking lot beside the highway holds more cars, and the transit station must touch the highway or the town edge. |
| A central walkway | **Not by itself.** A path gives nothing. Proposed fix: none needed if the walk is laid as a quad strip, which the starter campus will do. |

### 23.5 What belongs in the current pass

Four additions are cheap because the sprite is drawn and the rule already exists in this pass. The owner accepted all four.

| Addition | Why it is cheap |
|---|---|
| Aquatics pool | A second look for the recreation rule. The sprite is drawn |
| Recreation field | The same rule again, and somewhere for walkers to play |
| Coffee stand | The dining rule with a small radius, for a housing cluster too small for a commons |
| Administration building | No rule. It anchors the starter campus and later opens the budget |

### 23.6 Art gaps

Of 54 types, 39 are drawn in the Penzilla packs, 8 can be made from pack parts, and 7 have no sprite. A type with no sprite does not ship: the art rule allows no stand-ins.

| How to fill | Types | Rough count |
|---|---|---|
| Made from pack parts, no cost, edits listed in the credits | Department emblems, residence tower, chapter-house banners, gym, outdoor courts, recreation field, practice fields, athletics headquarters, stadium tiers two and three | 8 types, about 20 sprites, plus stadium tiers two and three |
| Commissioned from Penzilla in the same style. Their site was read as about $6 for a small item, and large ones need a quote | Stadium tiers four and five, basketball arena, basketball court, amphitheatre, parking structure, observatory, three prestige landmarks | About 10 sprites |
| A 3D model rendered to a sprite with drawn outlines. Free, but it will not match the pack exactly | The same ten, as the fallback if a commission is refused or too dear | About 10 sprites |
| Not needed: cut | Bike lane and bike parking | 2 sprites |

The first gap that blocked a layer was the stadium: Layer 1 needs five tiers and the pack draws one. It is filled for building: tiers two and three from pack parts, four and five by the rendered stand-in, which is replaced before release. The public repository's Kenney fallback has no sprite for any hand-placed type. It will get about ten shared stand-ins rendered from Kenney's public-domain 3D kits, one per family.

### 23.7 Design tests

| Test | Risk and guard |
|---|---|
| Readable cause and effect, tests 4 and 8 | 54 types cannot each have a rule. Section 23.1 is the guard. |
| Interdependence, test 1 | Departments must stay a look. Per-major seats would let one zone be solved alone. |
| No building that does nothing | Venues wait for their sport. Every reward landmark emits desirability, so none is inert. |
| Caps as puzzles, test 3 | No new density gate. Two gates with two named buildings is the limit. |
| Neglect-safe | Twenty hand-placed buildings each carry upkeep. The simulate script must assert that an absent campus with a full Build menu still pays its way. |
| Cheap catch-up | Every radius, coverage and lift is worked out when the player acts, never during a tick. |
| Scale, test 7 | Four-cell buildings fill the 32 by 32 starting land fast. Land purchase in Layer 2 has to arrive before most of this catalog does. |

### 23.8 Venues are not placed early

The owner asked on 2026-11-11 whether the basketball arena, baseball stadium, softball field and tennis centre could be placed early as prestige venues with a simple desirability or happiness effect, then gain their real role when the sport arrives. Decided:

| Idea | Decision | Why |
|---|---|---|
| A venue placed early as a prestige building | No. They stay Later | It is the stadium that does nothing with a different effect painted on: it promises a team that does not exist. And when the sport arrives it starts making noise and drawing crowds, so a building placed beside dorms as an amenity turns into one that hurts them. A rule must not change under the player |
| Tennis courts and a ball field as plain recreation | Yes, in the pass after football | The name matches what it does today. They are two more looks in the Happiness family, with the track's effect. All happiness buildings share one cap, as green space does |
| Later, when the sport exists | Making a court or field the varsity home is a choice the player is offered | Never something that happens to them |
| Basketball arena | Later either way | No sprite, and an indoor arena cannot pass as recreation |

---

## 24. Success metrics: the student pipeline

Proposed by the owner and agreed on 2026-11-11. He accepted the defaults recorded in 24.9 and may still amend them after reading the full discussion. Nothing in this section is built except where 24.7 says "this pass".

### 24.1 The spine

Seven stages. Each feeds the next, and the last feeds the first.

```
applications -> acceptance rate -> yield -> retention -> graduation rate -> alumni success -> donations
      ^                                                                                           |
      +------------------------------- reputation <-----------------------------------------------+
```

| Stage | Rule | Its causes | Before this section |
|---|---|---|---|
| Applications | The pool per tier, section 7.3 | Academic standing, athletic standing, price, recruiting and marketing. Marketing took the place of the tier's ceiling on 2026-11-11 (31.3): a ceiling is the wall the others push against, not something the player does. Built with play stop 5 | Existed |
| Acceptance rate | Offers divided by applications. Offers are admitted students divided by yield | Room on campus, the size of the pool, yield | Existed upside down as applicants per seat |
| Yield | The share of offers that enrol, per tier, worked out at each intake | How the campus looks (average Housing desirability), cost after aid, facilities condition | A fixed number per tier |
| Retention | The share of each class that returns, applied each semester | Happiness, safety and health coverage, policies, living on campus | Existed, flat in the first playable |
| Graduation rate | Per entering class: the share who finish in four years, and in six | How selective the class was, class size, room in class | Named once, defined nowhere |
| Alumni success | One score per graduating class, fixed on the day it graduates | The school's academic score that year, on-time graduation, job placement | New |
| Donations | Alumni times affinity times success | The number of alumni, affinity (happiness while enrolled, traditions, football), success | Existed without success |
| The loop | Alumni success and donations feed academic standing, which draws applications | | Standing already drew applications |

One lap of the loop takes four to six real weeks, because a game year is a real week. That makes it the long arc (test 6), not a runaway.

### 24.2 Three rules

They exist because seven stages, eight supporting metrics and four HUD numbers would otherwise bury cause and effect (test 4).

1. **One screen, seven rows.** A supporting metric never gets its own row. It appears as the "why" under a stage.
2. **At most four named causes per number. Each cause is something the player can do, and each cause feeds one stage.** Reputation brings applicants. The campus wins the yes. Happiness keeps them. Teaching graduates them. No cause counts twice. Happiness has four, all at full weight, since the owner's instruction of 2026-11-11: **Walk to class, Green space, Food & fun, Safety & health.** For one day it had five, with safety at half weight. Merging Medical Center and Campus Safety coverage could not make four by itself, because they were already one cause; so dining and things to do were also gathered into one, Food & fun, the way Stress gathers six drivers into four causes (section 27). A cause is the average of its parts. The panel and every student thought name the weakest part, so the advice is still one thing to build. Noise will join Green space as "Surroundings", and the count stays at four. In play stop 4 Green space is renamed Grounds and gathers green space, cleanliness and seating (section 29.5). The count stays at four.
3. **Slow numbers show a forecast.** Graduation rate, alumni success and donations move weeks after their causes. Each shows "on today's conditions" beside the real figure. The forecast moves the day the player acts, and the real figure arrives later and proves it.

A fourth rule comes from the idle constraints: every stage can swing the next only by a bounded amount [T], so neglect drifts to mediocre and never spirals. Everything here is a few numbers per class, worked out at intakes, semester ends and year end, so catch-up cost is nothing.

### 24.3 Supporting metrics

| Metric | What it is | Shown under | New work |
|---|---|---|---|
| Student-to-faculty ratio | The face of the Instruction slider: funding against enrollment | Graduation rate, as class size | A readout |
| Affordability | Net price after aid against the national middle | Yield | A readout of the price levers |
| Job placement | The share of the newest class with a job | Alumni success. It is the measured half of that score, not a separate number | New, small |
| Campus safety | The share of incidents handled | Retention | Falls out of the coverage and incidents work |
| Facilities condition | The share of buildings in good repair | Yield | A readout of Rundown and the Facilities slider |
| Endowment | Section 9.5, shown per student, where growth dilutes it | Donations, and the ranking | A readout |
| Town relations | Noise and crowds at the town edge lower it, shops facing the town raise it, and it sets the price of the next land purchase | Its own line on the Year-End report | A new system. It must keep both a lever and a consequence |
| Research output | Arrives with the Research zone and takes a share of the ranking then | The ranking | Later roadmap |

### 24.4 The ranking, with visible weights

The player's academic rating is this sum, and the player can read it. All weights are tuning targets.

| Input | Weight | Comes from |
|---|---|---|
| Graduation rate, six-year | 25% | Stage 5 |
| Class size | 15% | The student-to-faculty ratio |
| Alumni success | 15% | Stage 6 |
| Reputation | 15% | A slow average of the school's own past score, plus events |
| First-year retention | 10% | Stage 4 |
| Selectivity | 10% | The acceptance rate, stage 2 |
| Money per student | 10% | Instruction spending and endowment per head |

Every older rule that says "the academic rating takes a hit" now names its input. A bailout hits Reputation. A hiring freeze hits Class size. Tough grading raises Reputation and lowers Retention. Greek Row's drag and the Slacker and Scholar effects move Reputation a little. Sections 9, 12, 13 and 14 are reworded to match when layer 2 builds this. Before an input exists, its weight is shared among the ones that do. Reputation is slow on purpose: it stops the rank from jumping.

### 24.5 Three levels of display

| Level | Shows | Notes |
|---|---|---|
| HUD | Cash, students, and a chip each for academic prestige, athletic prestige and happiness | A chip appears when its system exists: happiness in the feedback pass, the other two in layer 1. The student count stays, because it is the score on the size ladder |
| Scorecard | The funnel: seven rows, each with its number, a trend arrow and its one biggest limiting factor. Tapping a row opens its causes | One helper works out the biggest limiting factor for any number. The Bottleneck panel, the Scorecard, the advisors and the newspaper all read from it |
| Year-End report | Each stage graded against the national field | Section 11 holds how the other schools are graded |

### 24.6 The two ladders

| | Metrics |
|---|---|
| Drive the size ladder | Applications, yield, retention, and room: beds, seats and places |
| Drive the prestige ladder | Graduation rate, class size, alumni success, reputation, selectivity, money per student |
| Help both | Retention, yield, happiness, safety, facilities condition. Never a wrong move, so they are the easy early wins |
| Create the tension | Acceptance rate and class size. Every extra student admitted from the same pool raises the acceptance rate. Every extra student worsens the ratio unless Instruction grows with them, and above full funding that cost climbs steeply. Money per student is a quieter third |

How selective a class was sets how prepared it is, and that is one of the causes of its graduation rate. Growing by admitting deeper therefore shows as a lower forecast graduation rate the same day. This is what makes "the double" of section 15.4 hard.

### 24.7 Where each piece lands

| Piece | Layer | Why there |
|---|---|---|
| The class record of 24.8 | This pass | History cannot be rebuilt later |
| Retention shown with its cause | This pass | The recreation and dining buildings act through it |
| Acceptance rate shown at each intake | This pass | The number is already computed |
| Campus safety score, happiness chip on the HUD | This pass, arriving with coverage and happiness | |
| Scorecard, first version. Athletic prestige. A first academic rank. Year-End grades | 1 | The national field arrives here |
| Computed yield, affordability, class size, graduation rate with its forecast, fifth and sixth years, alumni success with job placement, donations by success, facilities condition, the full weights | 2 | Tiers, levers, sliders, happiness, alumni and donations are already layer 2 |
| Limiting factors feed the advisors and the newspaper | 4 | |
| Year-End graded on all seven stages. Endowment per student | 5 | |
| Town relations | 6 | It needs Greek Row, game-day crowds and the parade to react to |
| Research output | Later roadmap | |

The three "this pass" pieces wait, with the rest of the pass's rules, for the owner's approval of the look.

### 24.8 The class record

```
classRecord[entryYear] = { entered, enrolled, finishedOnTime, finishedLate, left }

fourYearRate = finishedOnTime / entered
sixYearRate  = (finishedOnTime + finishedLate) / entered
forecast     = product of this year's class-to-class retention * the on-time share on today's conditions
```

One record per entering class, kept for good in `history`. Students who do not finish in four years stay as fifth and sixth years and keep using a bed and a seat, which is the cost of a crowded Academic zone. Those who have not finished after six years leave. The headline graduation rate is the six-year one, with on-time as the detail.

### 24.9 Decisions

Accepted by the owner on 2026-11-11 as the defaults:

1. The three rules of 24.2.
2. The word on screen is Happiness. The owner changed this default on 2026-11-11 (section 16.2).
3. The student count stays on the HUD beside the three ratings.
4. The weights of 24.4, as tuning targets.
5. The headline graduation rate is six-year, with on-time as the detail.
6. Job placement folds into alumni success.
7. Selectivity sets how prepared a class is, which feeds its graduation rate.
8. Town relations waits for layer 6.
9. The three cheap pieces join the feedback pass.

---

## 25. Off-campus neighbourhoods, roads and parking

Asked for by the owner on 2026-11-11 as item 8 of the feedback pass, and settled the same day. **Built the same day as play stop 3** (`?demo=stop3` shows it). 25.1 to 25.5 are the decisions. 25.6 is what was built, and where it differs.

### 25.1 Decisions

| Decision | Why |
|---|---|
| Not every student lives in a dorm. Locals live in houses in the town, outside the campus land | It replaces the flat share of students who needed no bed, which was free and had no cause |
| Only locals live in town: about four in ten of each class [T]. From layer 2 they are the in-state commuters of section 7.2. Out-of-state students and scholars always need a bed | Without this the town is an endless free dorm. The most that can skip a bed is the local share |
| Each neighbourhood has a fixed number of house plots. Houses fill in over real hours as locals enrol, and stop when the plots are full | Growth the player can see and cannot farm. The town is capped, so Housing matters more as the school grows |
| A local comes if they can reach campus. From a neighbourhood joined by a path and within walking range of an Academic lot, they walk and need no bed and no parking. Otherwise they drive and need a parking space with road access | One rule for how they arrive |
| A local with no way in needs a bed instead | Every student needs somewhere to live |
| Off-campus students pay tuition and no room fees. Dorm students pay both. Room fees arrive with neighbourhoods | In the first playable's numbers a commuter netted more than a dorm student, because of bed upkeep. Starting numbers [T]: tuition $8,200 a student and $3,000 an occupied bed, which leaves income unchanged at the start |
| Living on campus is the fourth cause of retention, from layer 2 | Commuters leave a little more often, drivers a little more than walkers |
| The freshman live-on rule stays a policy (12.3), off at the start | On, first-year locals live in a dorm too: full dorms and room fees, at a cost in happiness and local applicants |
| Tapping a neighbourhood shows who lives there, who walks, who drives and what would let more walk | Test 3 |
| The student card says "Lives in a dorm" or "Lives off campus", and names the street once neighbourhoods exist | The owner's request. The first half is built |
| Town relations, landlords and buying neighbourhood land are later | The owner's list |
| Land purchase arrives at this stop, brought forward from layer 2 | The owner's decision of 2026-11-11. Roads, car parks and a town band all use land on a 32 by 32 map, which is the scale cost noted in 25.5 |

### 25.2 The Housing bar and the bottleneck

Neither changes shape. The bar counts beds and the bottleneck is Housing or Academic.

```
locals wanted   = localShare * students expected
drive-in places = min(places in neighbourhoods out of walking range, parking spaces with road access)
off campus      = min(locals wanted, walk-in places + drive-in places)
beds wanted     = students expected - off campus
```

When Housing is the bottleneck, tapping the bar offers up to three fixes with numbers: Housing lots, a path to a named street, or parking spaces. Founding day is unchanged: the starter campus's 36 beds take 36 students and 24 locals walk in from the first neighbourhood.

**Built on 2026-11-11** (`housingFixes` in `src/sim/systems/plan.ts`). The room plan lists "Three ways to find N beds", and every number is worked out by the simulation:

| Fix | Its numbers |
|---|---|
| Housing lots | How many new lots cover every missing bed, the beds each opens with, and the cost |
| A path to a named street | The street nobody walks from yet that would bring in the most locals. The path cells and the walk in minutes are for the straightest path from the nearest walk already on campus, so they read "about". The locals it brings in are those with no place in town today, up to the places the street has |
| Parking spaces | One space for each local who could drive in from a street too far to walk, the Parking lots that hold them, and the cost |

A street that is already joined but too long a walk is left out, because a path will not fix it. A fix that would bring nobody in is left out. Each fix stands alone: its "fewer beds" is what the simulation then wants if only that fix is made, and a test holds that.

### 25.3 Roads

The owner overrode the proposal of no road tool. Traffic simulation stays cut.

| Decision | Why |
|---|---|
| Roads are a second network, separate from paths, laid by dragging. Students walk on paths. Cars drive on roads | The owner wants streets he can lay |
| Pieces are chosen from their neighbours: straights, corners, junctions and ends, as paths are | No piece is picked by hand |
| Where a road meets a path there is a crossing, and both networks pass through that cell | A road must not cut the campus in two for walkers |
| Town streets belong to the town and appear with the neighbourhoods. The player's roads join them, or the highway, at the edge of the land | The town is not the player's to edit |
| **One rule only: a parking lot or structure holds cars when a road links it to a town street or the highway. Without that it holds none and shows the stall cause "no road access"** | Roads never become a need of every building. That was the chore SimCity made of them |
| Cars are for show, like walkers. Their number follows how many locals drive and the time of day. They leave driveways, follow streets and roads to a parking space, and leave later. Parked cars fill a lot in proportion to its use. No congestion, and nothing in catch-up | The traffic cut stands |
| Housing and Academic lots mildly dislike a road beside them, as part of the noise input | A walkable core with roads at the edges becomes the natural layout, which is the model campus of 23.4 |
| A road costs money a cell and a little upkeep [T] | A choice, not free |
| The parking structure holds several times a surface lot on a similar footprint, costs much more, and has a smaller desirability penalty | Land is the scarce thing late on |

### 25.4 Migrating a save

Saves are versioned and upgraded one step at a time by pure functions (17.5). This stop is one more step, written so that a player who opens an old save loses nothing and is surprised by nothing.

1. **The map grows, and nothing moves.** The town is a band of new columns beyond the east edge of the land, and the fields for sale are new rows to its south. Every cell keeps its x and y, so every building and timer is where it was. The row-by-row indexes do change, because the map is wider, and the upgrade rebuilds them. Nothing the player built can be in the way, because the new ground did not exist. (This point first said the indexes were kept. That held only for a band of rows.)
2. **The town is made once and stored.** Neighbourhoods, plots, street names and streets are generated from the save's own seed by hashing, without drawing from any random stream, so the same save always upgrades to the same town and other systems' streams are untouched.
3. **Money is unchanged at the moment of the upgrade.** Under the old rule six in ten students held a bed. Tuition and the room fee are set so that six in ten paying both equals the old flat tuition.
4. **Beds are unchanged.** The old rule asked for beds for six in ten. The new rule asks for beds for the students who are not locals: the same six in ten.
5. **Nobody enrolled is turned out.** Locals already enrolled keep coming until they graduate, whether or not a path or a parking space reaches them yet. The new rule binds new classes only. This follows the house rule that growing must never punish the player.
6. **The player is told once.** The first load shows one line in the away list: the town now stands beside campus, locals in new classes need a path or parking, and current students are unaffected.
7. **Tests.** A fixture save from before the upgrade is kept in `tests/fixtures`. It must load with the same enrollment, cash, yearly income and buildings, every old cell at the same x and y, a town in the new rows, and the same result when upgraded twice.

The highway does not exist on the map until layer 3. Until then a road counts when it reaches a town street.

### 25.5 Design tests

| Test | Verdict |
|---|---|
| The cut on networks | **Holds, on one condition.** Networks were cut because they were chores that failed while the player was away. A road cannot break, clog or run out, and it is needed by parking alone. If any later feature makes roads a need of ordinary buildings, it reopens the cut and must be argued again |
| 1. Interdependence | Stronger. Where Academic sits decides who can walk. Roads beside lots cost desirability, so roads and the core pull apart |
| 3. Caps as puzzles | Passes. "No road access" is a named stall with a one-step fix. Each neighbourhood names why more cannot come |
| 4. Legible feedback | At risk in one place: two networks that look alike on a phone. Roads are dark asphalt with lane marks and paths are pale paving, and the crossing shows where they share a cell. The look review must confirm they read apart at a glance |
| 7. Scale | A cost. Roads and car parks use land on a 32 by 32 map. Land purchase in layer 2 has to follow soon |
| Noise | Brings one piece of layer 3 forward. Desirability reads only green space and walk time today, so "a road beside the lot" is the first noise the lot inspector names |
| Size of the stop | The largest of the three. Neighbourhoods, the locals rule, room fees, the road tool, two kinds of parking, cars, a new stall cause and a save upgrade arrive together because none of them means anything alone |
| Neglect-safe and cheap catch-up | Passes. Town houses never decay and cost nothing. Who walks and who drives is worked out when the player builds and at each intake |

### 25.6 As built

| Piece | Built |
|---|---|
| The map | 42 cells wide by 48 tall. The starting land is the same 32 by 32. The town is the ten columns east of it, for the full height. Two fields of 16 by 16 lie south of the starting land |
| The town | "College Avenue" runs down the campus edge. Eight side streets run east from it, each a neighbourhood with 9 to 14 house plots. A plot stands for 10 local students [T]. About 900 places in all, so the town fills as the school grows |
| Locals | Four in ten of every class. A neighbourhood walks when a path meets College Avenue within two rows of its side street and the walk to class is 12 minutes or less [T]. From any other it drives, one parking space each |
| A local's place | Decided when they enrol and kept until they graduate. Clearing the path or car park later strands nobody, and the next class finds fewer places. Each class year's count is stored |
| Parking | Parking lot: 2 by 1, $20K, 20 cars. Parking structure: 2 by 2, $160K, 100 cars. Either holds cars only when a road joins it to a street, or it touches the avenue itself |
| Roads | $3,000 a cell and $150 a year. A road over a path, or a path over a road, makes a crossing that both use. Reached from a Road card in the Build menu, because the tool bar is full |
| Noise | A lot loses 3 points of desirability for a road or street beside it, 6 for a parking lot within a cell and 3 for a structure |
| Money | Tuition $8,200 a student and a room fee of $3,000 for each occupied bed |
| Land | Tap a field to see its price and buy it: $250K and $400K. Nothing can be built on a field before it is bought, and the town can never be changed |
| On screen | Houses stand on as many plots as there are locals living there. Cars drive between those houses and the car parks a road reaches, more in the morning and evening. Tapping a house or side street shows who lives there, whether they walk or drive, and what would let more come |
| Old saves | Upgraded as 25.4 says, with one line in the away list |
| A car park with no road | The pack's lowered barrier floats over it, big enough to read at normal zoom, until a road reaches it. Tapping the barrier opens its panel. The Parking overlay (8.4) shows it in red |
| The road tool | Picked from the Build menu. It stays in hand until Done is tapped, on a bar that says what the colours mean |

**Where it differs from the decisions above, and what is rough.**

- The town is east of the campus. The first sketch put it below. The owner played it on the east and confirmed that on 2026-11-11, so east is the design.
- Houses appear when a class arrives, not over real hours.
- Land purchase is two fields. The full map of 25 parcels (5.2) waits, because growing the map again means another upgrade step.
- Cars pass through one another and turn on the spot. There is no highway.
- Town relations, landlords and the freshman live-on policy are not built.

---

## 26. Art to fix before release

Asked for by the owner on 2026-11-11, when he approved the look "for now". These are the sprites that were assembled or rendered here instead of drawn by the pack's artist. He accepted them as stand-ins only. Every sprite is named in the art manifest and built from one line of the recipe, so each fix is art-only: replace the picture or the recipe line and run the art build. No code changes.

| Sprite | What it is today | Planned fix |
|---|---|---|
| Parking structure, `build.garage` | A model of plain blocks, rendered. The owner called it ugly | Penzilla commission, 2 x 2. Or a bought low-poly model, rendered properly |
| Stadium tier four, `stadium.4` | A free CC-BY 3D bowl, rendered. The owner called it ugly | Penzilla commission, 2 x 3. Or a bought low-poly model, rendered properly |
| Stadium tier five, `stadium.5` | Tier four stretched taller. It is not its own design | Penzilla commission, 2 x 3, drawn as a distinct stadium |
| Stadium tiers two and three, `stadium.2` and `stadium.3` | The pack's stadium with its own stand copied, raised and mirrored | Penzilla commission, with tiers four and five, so the five read as one family |
| Crossing, `road.cross.5` and `road.cross.10` | The straight road piece with its lane mark enlarged and repeated across it. Made bolder on 2026-11-11 so it reads at normal phone zoom | Penzilla commission: one tile |
| Outdoor courts, `build.courts` | A tennis court cut from the tennis stadium. It is not a basketball court | Penzilla commission, 2 x 2 |
| Gym, `build.gym` | A plain hall with a dumbbell icon on its sign. The icon pack asks a small payment for commercial use, which has not been made | Penzilla commission. Or pay for the icon and keep it. Not to ship as it is |
| Recreation field, `build.field` | The soccer stadium with its stand, booth and banner cut away | Penzilla commission, 2 x 2, or keep if it passes a second look |
| Lake, `pond.large` | Laid from nine shore tiles. Two are mirrored and the middle is two half tiles joined. The sliver of earth at its two side corners was a fault in the drawing order, not in the art, and was fixed on 2026-11-11 | Penzilla commission of the two missing shore pieces and a plain water tile |
| First-aid icon, `icon.injury` | The pharmacy sign, cropped, with its cross recoloured green | Penzilla commission: one icon |
| Bin, filling up, `grounds.bin.full` | The pack's wire basket heaped with rubbish, a different bin from the lidded can that shows it empty | Penzilla commission: one bin in three states |
| Bin, full, `grounds.bin.over` | That wire basket with one of the pack's rubbish bags beside it, put together here | The same commission |
| Anything broken, `grounds.cone` | The thing as it is, with the pack's traffic cone beside it. A broken lamp is the unlit lamp with the cone | Penzilla commission: a broken version of each |
| Picnic table, `grounds.table` | The pack's table with four chairs | Penzilla commission: a picnic table |
| Grounds worker, `grounds.broom` and `grounds.cart` | The pack's construction worker, with its broom or cart drawn beside him. No figure holds anything | Penzilla commission: a worker holding a broom |
| Students at a bench or table | A standing student beside it. Every figure only stands and walks | Penzilla commission: seated figures |
| Art for builds without the art key | No sprite for any hand-placed building: a plain building or a lawn stands in. The walking people are rendered from Kenney's 3D characters | Render Kenney's public-domain kits properly, one stand-in for each building family |
| App icon and launch screen | Placeholders made by a script | Real artwork, in layer 7 |

Edits that are kept and need no fix: the red cross on the Medical Center recoloured green, the grass tile brightened for lawns and its rim painted over so tiles join, and road pieces and cars mirrored to face every way. The face on the student card is drawn in code, and the owner approved it.

**Planned for play stop 4.** None of these exists yet. The owner accepted all of them on 2026-11-11 and turned one down: the pizza place and the taco stand are not cut down to one cell. They stay two cells wide with their patios, as drawn. Each moves into the table above in the piece of work that builds it.

| Thing | The stand-in | Planned fix |
|---|---|---|
| Food truck | The pack's box truck with an apple on its side. It has no serving hatch | Penzilla commission: a truck with a hatch and an awning |
| Smoothie and juice bar | The ice-cream stand as it is | A juice sign, as a small commission |
| Computer lab | The electrician's workshop as it is. Its sign is a plug, not a screen | A screen sign, or keep if it reads well in play |
| Study center | A plain hall with the pack's book as its sign | Penzilla commission, 2 x 1 |
| Science lab, when layer 2 builds it | A plain two-floor building with the pack's bottle as its sign | Penzilla commission, 2 x 2 |

Any sprite assembled or rendered from now on is added to this table in the same piece of work.

---

## 27. Stress

Asked for by the owner on 2026-11-11 as an addition to the calendar. It ships with the calendar in layer 1. Nothing here is built.

### 27.1 Decisions

| Decision | Why |
|---|---|
| One new number for students, Stress, from 0 to 100. It is a row on the Happiness panel and a small meter on the student card's Happiness line. It is not on the HUD | The owner's instruction. The HUD stays at four numbers |
| The calendar sets its season: it rises toward midterms, peaks in finals week, drops sharply at each break and sits low through summer | The year gets a pulse the player can feel |
| The campus sets how hard the season lands, through four named causes: class crowding, teaching (Instruction funding), places to unwind (recreation, quads and ponds), and support (library capacity and Medical Center coverage) | The owner listed six drivers. They are grouped into four so the rule of section 24.2 holds. The first two raise Stress and the last two lower it |
| Stress is worked out from the date and the campus when it is needed, and at each exam period. Nothing accumulates except one average per semester | It cannot spiral or stay pinned: when the season eases, so does Stress. Catch-up cost is a handful of evaluations a year |
| High Stress lowers Happiness and nudges GPA down. A semester of sustained high Stress lowers retention a little | The owner's effects, all small and capped [T] |
| A campus with good relief gets through finals with a small dip. A campus without it gets a big one | The reason to build for it |
| Breaks lift Happiness: Thanksgiving, winter, spring and summer each give a lift that fades when classes resume. The first day back has a small dip | The owner's rule |
| Faculty Stress is one more value, from the same calendar (peaking at finals and at the dates grades are due) and from class size. High faculty Stress lowers Instruction quality a little for that period | No per-person staff. It is shown with its cause on the Provost's page |
| The away summary reports each exam period: how high Stress peaked, its main cause, and what would have eased it | Exam weeks last two or three real hours, so most players only ever see the report |
| One new policy, reading days before finals, trades a little teaching time for lower exam Stress | Section 12.3 |
| On screen the number is always called Stress. "Anxiety" appears only as ordinary exam nerves in a student's thought. Nothing clinical, nothing depicting serious distress, and every spike ends when exams end | Tone guide. The rating target of 16.3 holds: none of its rows covers this. Recheck at submission |

```
season   = the calendar's curve for today's date, 0.1 on a break to 1.0 in finals week
pressure = share of the two raising causes, 0 to 1
relief   = share of the two easing causes, 0 to 1
stress   = 100 * season * (0.55 + 0.45 * pressure) * (1 - 0.5 * relief)
```

At finals the worst campus reads 100 and the best about 28. All of these numbers are tuning targets.

### 27.2 Students, cards and walkers

| Item | Rule |
|---|---|
| Thoughts | They follow the calendar: exam worries in midterms and finals, excitement before a break, relief after finals |
| Archetypes | Stressed-Out and Overachiever spike hardest, Slacker barely moves, and All-Nighter appears in numbers during finals as a passing phase, like Lost Freshman |
| Walkers | During exams the library and coffee stands visibly fill. During breaks the campus is quiet. For show, as walkers always are |

### 27.3 Tests

The simulate script must assert that Stress never stays at its maximum past the end of an exam period, that it returns to a low value at every break across five years on every profile, and that a once-a-day player's away summary carries an exam report for each semester even when the exam week passed between visits.

### 27.4 Points raised with the owner

The owner accepted the proposal on all five points on 2026-11-11, unless he says otherwise after reading them.

| Point | Proposal |
|---|---|
| Happiness would have five inputs: its four causes and Stress | Show the calendar's effect as one signed line on the Happiness panel, "This week": the exam dip or the break lift. Four causes the player can build for, and the season |
| Recreation and green space would count twice: once for Happiness directly, once through Stress | Their relief only matters at the exam peaks, and the whole effect of Stress on Happiness is capped at about ten points |
| Two of the four causes do not exist in layer 1 | Instruction funding arrives in layer 2 and library capacity in layer 3. Until then teaching reads as neutral, and support reads library presence and Medical Center coverage |
| Overachiever and All-Nighter are not among the eighteen archetypes of 13.4 | Scholar takes the Overachiever's part until the fuller list ships. All-Nighter is added as a nineteenth, a finals-only phase |
| The Provost's page arrives in layer 4 | Until then faculty Stress appears in the exam report in the away summary |

---

## 28. Time of day and weather

Asked for by the owner on 2026-11-11, for the football and calendar layer. Both are simple and mostly visual. Nothing here is built.

### 28.1 Time of day

| Decision | Why |
|---|---|
| Time of day follows the player's real local clock, in four periods with smooth changes between them: morning, afternoon, evening and night. The in-game date keeps advancing with the game's own time | A game day passes in about half a real hour, which is too fast for a day and a night |
| It is presentation only: lighting, how many walkers there are and where they go, and the student card's "Doing now". No rule of the simulation reads the local clock | Catch-up, saves and tests stay exact. A changed time zone or a wrong device clock changes only what the campus looks like |
| Breaks, finals and game days from the calendar layer on top of the period | One picture, two inputs |

| Period | Walkers and lighting |
|---|---|
| Morning | Rush hour: many walkers hurrying from Housing to Academic lots, a busy coffee stand and dining hall |
| Afternoon | A steady mix of class, library, dining and recreation |
| Evening | Dining, the gym and recreation, clubs, Greek Row when it exists, and students heading to jobs in town. Few going to class |
| Night | Quiet. A few walkers to night classes and the library. Lit windows, street lights along paths and roads, a darker tint |

**The one problem with the split.** A player who only ever opens the game at night would always find a dark, quiet campus, which is the emptiness the walkers were added to cure. Two guards: night keeps a floor of walkers and its lit windows, so it reads as cosy and not as empty, and a setting shows the campus in daylight whatever the hour. Nothing else conflicts: football kicks off at real times already, so day games and night games match the light.

### 28.2 Weather

| Decision | Why |
|---|---|
| Weather follows the season of the in-game date, in one temperate climate: a mild fall with some wind and rain, a cold winter with occasional snow, a rainy spring, and a hot summer with occasional heat waves | The year becomes visible |
| It comes in spells of a few real hours. Each spell is chosen from the game's seed and its place in the calendar, with no stored state | Catch-up stays exact, and the away summary can say what the weather was |
| Effects on Happiness are small: a small lift on a sunny day, a small dip in rain, snow or a heat wave, a few points at most [T] | No season may dominate the year |
| Indoor buildings in reach soften the dip: library, dining and gym now, the union later | The part the player can act on |
| Weather shows on the Happiness panel only while it is active, with its relief, on the same seasonal line as the exam dip and the break lift of section 27 | One line for everything the calendar and the sky do |
| In bad weather walkers favour indoor places, outdoor recreation and quads lose their pull for the day, and umbrellas or coats appear | Behaviour that can be seen |
| Weather never touches construction timers, income or deadlines | It is flavour with a small feeling attached |
| No storm damages a building. Disasters keep their own design | Weather and night stay cosy and light |

### 28.3 Visuals and art

Rain, snow and heat shimmer are light particle effects. Paths look wet and the ground takes a snow tint. A setting reduces all of it for older phones.

Checked in the owner's packs on 2026-11-11:

| Wanted | In the packs |
|---|---|
| Street lights | Yes: a street lamp drawn off, on and with its glow, a smaller lamp, and strings of lights |
| Car lights | Yes: headlight animation sheets for both car shapes |
| Lit windows | No. No building has a night version or a window overlay |
| Umbrellas and coats on walkers | Not found. There is an umbrella stand as a prop |
| Snow on the ground | Not found as tiles. A tint would be used |

Lit windows would have to be made here, as an overlay cut from each building's own windows. When that is built it goes on the list in section 26.

### 28.4 Schedule

**Moved by the owner on 2026-11-11.** The cheap parts go into play stop 3, with roads and neighbourhoods:

| In stop 3 | Detail |
|---|---|
| Day and night tint | Follows the player's local clock, in the four periods of 28.1, changing smoothly. Display only |
| Street lamps | The pack's lamps along paths and roads, lit in the evening and at night |
| Walker schedule by period | Morning rush from Housing to Academic lots; a steady afternoon; evening at dining, the gym and clubs; a quiet night |
| The guard for night-only players | A minimum number of walkers at night, and a setting that shows daylight at any hour |

Lit windows, umbrellas, coats and snow wait, because their art has to be made. Weather, and everything in 28.2, stays in layer 1 with the calendar.

**Built with play stop 3 on 2026-11-11.**

| Piece | Built |
|---|---|
| The light | One colour multiplied over the map, blended between ten points of the day: plain from 11 to 16, warm toward evening, blue and at most six tenths strong at night, so the campus stays readable. Read from the device's clock once a second |
| Street lamps | The pack's lamp on every fourth cell of path and every fifth of road or street. Lit from early evening until after dawn. Its glow is the pack's own picture of the lit lamp, added as light over the night |
| Walkers | Against a steady afternoon: a third more in the morning and nearly all heading to class, a fifth fewer in the evening and heading to dining, the gym and home, and three tenths at night |
| The night guard | Never fewer than four walkers in view at any hour, and a Menu switch, "Daylight at any hour" |
| Cars | Busiest in the morning, heading in, and in the evening, heading home |
| The student card | "Doing now" reads by period: hurrying to class in the morning, an evening or night class later, asleep in the dorm at night |

`&hour=22` on a dev page shows any hour. Nothing here is simulation, and nothing is saved but the switch.

---

## 29. Grounds: litter, bins, seating and maintenance workers

Asked for by the owner on 2026-11-11, adapted from RollerCoaster Tycoon's handymen and Two Point Campus's janitors for an idle game. **Accepted by the owner the same day, with every proposal of 29.13. Built on 2026-11-11 as play stop 4a: 29.14 says what was built and what is rough.** It is play stop 4 of the feedback pass (29.12), and it does not start until he has played stop 3 and given the go-ahead.

### 29.1 The loop

Students drop litter where they eat and play. Bins catch most of it. Workers from a Facilities Yard empty the bins, sweep up what missed, and fix what gets broken. A dirty spot costs a little Happiness and invites more mess, up to a ceiling.

### 29.2 Litter

| Decision | Why |
|---|---|
| Litter comes from **mess spots**: every food place (the dining hall, the coffee stand and the eight of section 30), the campus store and every recreation building. Later the stadium and its tailgates on a home game day (layer 1), and Student Life lots (layer 2) | The owner's list. A short list of places is something the player can answer. Litter everywhere would be a chore |
| A spot's litter follows the students in its reach, times a strength for its kind: coffee stand and dining hall high, store medium, recreation low [T] | It is worked out from the simulation's own count of who uses each building, never from the walkers on screen |
| A thin, even amount also falls along every busy path. Alone it never takes a spot below about 85% clean [T] | Paths look lived in. Bins are never needed everywhere |
| Each spot keeps one number: the litter lying around it, from nothing up to a ceiling | The ceiling is what stops a spiral |
| A bin catches about 85% of the litter dropped within three cells of it [T]. It fills. A full bin overflows: it catches nothing until it is emptied | The owner's rule |
| Dirt invites dirt: the dirtiest spot draws up to half again as much litter [T] | "Invite more mess", with a limit |
| Student types tilt it lightly, by a tenth at most [T]: a campus heavy in Slackers and Party Animals litters more, and a Resident Advisor now and then empties a full bin on the way past | The owner's request. It reads the mix of types the campus already has, so there is no per-student simulation |
| It is worked out every 20 minutes, on the beat incidents already use: a few sums for each spot, bin and yard | Thirty days of catch-up is about half a million sums. The one-second target holds |
| Nothing here ever stops a building working, holds back growth, or waits for a tap | The conditions in 29.10 |

On the map, litter is small pieces on the paths around a spot, more of them as its number rises. A full bin shows heaped. An overflowing bin has bags beside it.

### 29.3 Things to place: the Grounds shelf

A new shelf in the Build menu. Each thing is one cell and cheap, and dragging lays a row, as with trees.

| Thing | Cost [T] | What it does |
|---|---|---|
| Trash bin | $1,500 | Catches litter within three cells. Workers empty it |
| Bench | $2,500 | Somewhere to sit. Counts as seating for the lots within three cells |
| Picnic table | $4,000 | Seating too. Where a dining building or an Academic lot is within three cells it also adds to social life, and from layer 1 it takes a little off Stress there (section 27) |

| Decision | Why |
|---|---|
| None of them has upkeep. Wages are the running cost of grounds | One cost to watch, not two |
| A quad's own benches count as seating | A campus that already has quads does not start from nothing |
| A new campus starts with two bins beside its dining hall, and no yard | The first full bin is the lesson, and it points at the Facilities Yard |
| **Lamp posts are not placed by hand.** Play stop 3 puts them along paths and roads by itself, and they stay that way. They can still be broken and fixed like everything else here | The owner listed lamps "if not already added". A lamp can have no rule of its own, because the simulation never reads the time of day. Say so if hand-placed lamps are wanted anyway |
| Walkers use the seats by time of day: coffee on a bench in the morning, lunch at the tables, studying outside in the afternoon, talking in the evening, empty at night | For show, like the rest of the walker schedule (28.4). The student card's "Doing now" says it |

### 29.4 The Facilities Yard and its workers

| Decision | Why |
|---|---|
| The Facilities Yard becomes a real building: 2 by 1, about $60,000, covering a circle of sixteen cells [T]. It was eight, like the Medical Center, then twelve (29.15), and sixteen since play stop 5 (29.16) | The owner's instruction |
| The yard's card has a plus and a minus. It holds up to six workers [T], four until play stop 5 (29.16), and opens with one | "A simple + / - count up to a cap per yard" |
| Each worker costs a wage of $48,000 a game year [T], with benefits on top like all pay. It was $6,000 until play stop 5 (29.16). Hiring and letting go are instant and free | Set once and left alone. It suits one visit a day |
| Workers do everything inside the circle by themselves, in this order: mend a broken bin (added in 29.15), empty the fullest bins, sweep the dirtiest spot, fix whatever else is broken | Prevention first. No patrol areas, no job lists and no mowing, which were RollerCoaster Tycoon's most hated chores |
| One worker keeps about two busy spots clean [T]. More workers clear faster. Too few and litter builds to its ceiling | The owner's rule |
| The card says "Keeping up" or "Understaffed: hire 2 more", from the same sums | One line that names the fix |
| A spot inside two circles is served by the nearer yard | No double counting |
| Workers are seen walking out from the yard with a cart or a broom. They are for show: what gets cleaned is decided by the sums | The same rule as walkers, cars and responders |
| Wages sit under Facilities on the budget screen when that screen exists (layer 2). Until then they show on the yard's card and inside the hourly figure on the top bar | The budget screen is not built yet |
| **The yard's old rule is absorbed.** From layer 2, a building inside a staffed yard's circle takes longer to turn Rundown and recovers sooner, and more so while the yard is keeping up. The flat "runs down more slowly" is dropped | One building, one idea: workers look after what is near them |
| The Facilities slider of layer 2 scales how much each worker gets done | The same treatment every other service gets from its slider |

### 29.5 Consequences

| Decision | Why |
|---|---|
| **Green space is renamed Grounds.** It gathers green space, cleanliness and seating, and Happiness keeps four causes: Walk to class, Grounds, Food & fun, Safety & health | The owner's proposal, and the best split found. Putting cleanliness under Safety & health was weighed and dropped: that cause would then need three buildings, and the fix for litter is grounds work |
| Inside Grounds the parts do not count the same: green space half, cleanliness three tenths, seating two tenths [T] | A bench must not weigh as much as a quad. Until now the parts of a cause counted equally, so this adds weights |
| Noise joins Grounds when it is built, not a cause of its own | It was to join Green space. The count still stays at four |
| A campus with no bins and no workers settles at about 30% clean [T], which costs about five points of Happiness, and stays there | "A neglected campus gets messy and loses some Happiness, then levels off" |
| Where litter is above seven tenths of its ceiling, something within reach may get broken: a bench, a table, a bin or a lamp. At most one thing a day at each spot [T] | "Very dirty areas lead to mischief" |
| It is more likely where the students nearby are unhappy, and a quarter as likely inside a Campus Safety circle [T] | The owner's rule, and the security guards of RollerCoaster Tycoon |
| A broken thing stops working until it is fixed, and that is its whole cost: a broken bin catches nothing, a broken bench seats nobody, a broken lamp is dark | One consequence, already understood |
| Workers in range fix it without being asked, in about half an hour of one worker's time [T]. Out of range it stays broken, and tapping it says "Outside worker coverage" | Nothing is ever rebuilt by hand |
| It cannot spiral. There are three ceilings: the litter at a spot, the things that can break (no more than were placed), and the share of Happiness that Grounds holds | The owner's rule, by construction |

### 29.6 Feedback

| Decision | Why |
|---|---|
| A Cleanliness overlay: paths tinted by litter, full bins and broken things marked, and each yard's circle. It opens from the Grounds row of the Happiness panel | The owner's request. It is the first of the overlays of section 8.4 to be built |
| Tapping litter, a full bin or a broken thing names one fix: "No bin within reach", "Outside worker coverage", or "Yard understaffed: hire 2 more" | Test 3 |
| New student thoughts, good and bad: "So much trash by the dining hall." "Love eating lunch out here." | The owner's examples. Each names something to act on |
| The away summary gives grounds one line: the messiest spot and its fix, how many bins overflowed, what was repaired. It leads the list only when cleanliness is what is holding Happiness back | The 24-hour summary shows three or four things first (2.3) |
| No notification | Two a day are for decisions and headlines |

### 29.7 Old saves

One more upgrade step, written so that nothing is lost and nothing surprises.

1. No bins, benches, tables or yards are added. Nothing is charged.
2. Litter starts at nothing and does not build for the first 36 hours after the upgrade. That is the shortest window the check-in contract allows (2.3), so the player reads about litter before any Happiness is lost to it.
3. Quads count as seating from the first moment, so Grounds opens close to where Green space stood.
4. The away list says once: students now drop litter where they eat and play, bins catch it, and workers from a Facilities Yard clear it.

### 29.8 Art

Checked in the owner's packs on 2026-11-11.

| Wanted | In the packs | Gap, and the plan |
|---|---|---|
| Bin, empty | Yes: a lidded can and a small bin | |
| Bin, full | Yes: a wire basket heaped with rubbish | It is a different bin from the lidded can. One bin drawn in three states is a commission |
| Bin, overflowing | No single picture. Two rubbish bags exist | The full bin with a bag beside it: two real pictures, nothing assembled |
| Bin, bench and table, broken | None | The thing with the pack's traffic cone beside it, as building sites already use. Drawn broken versions are a commission |
| Bench | Yes: the wooden bench the quads use, and a padded seat | |
| Picnic table | No true picnic table. A table with four chairs in four colours | The table and chairs stand in. A picnic table is a commission |
| Litter pieces | Yes: five small pieces, such as a cup, a wrapper and an apple core, and two bags | |
| Facilities Yard | Yes: a handyman's workshop in two heights, wheeled bins in five colours, a large container, and a recycling depot | |
| Worker | Yes: a walking worker in a hard hat | |
| Worker with a broom or cart | A broom and two carts exist as separate things. No figure holds anything, because the figures have no hands | The broom or cart is drawn beside the worker. A worker drawn holding a broom is a commission |
| Students sitting, eating, studying | None. Every figure only stands and walks | A student stands at the bench or table. Seated figures are a commission |
| Lamp, dark | Yes: the street lamp drawn unlit | |

Anything assembled or stood in when this is built goes on the list in section 26 in the same piece of work.

### 29.9 Tone and rating

Litter is paper cups, wrappers and apple cores. There is no vomit, nothing gross, no smells and no pests. Breakage is told as a joke and is mischief, never crime: "A bench has lost an argument with a skateboard." Nobody is caught or punished; a worker fixes it. Nothing here changes an answer on the age-rating form, so the target of 4+ holds (16.3).

### 29.10 Design tests

| Test | Verdict |
|---|---|
| The cut on garbage (section 3) | **Reopened, and it holds on conditions.** SimCity's garbage was a network with a capacity that failed out of sight and choked growth. This is local to a spot, always visible, has a ceiling, mends itself where there is staff, and touches Happiness only. The conditions: litter never stops a building working and never holds back growth, and staffing stays one number per yard. A later feature that breaks either reopens the cut and must be argued again |
| The chores RollerCoaster Tycoon was hated for | **The real risk.** A bin on every other cell would be homework on a phone. Guards: mess spots are few, one bin serves a spot, a yard serves a district, the game names where each is missing, and the simulate script counts what a mid-sized campus needs. The target is about one bin for each food or fun building and one yard for every six to eight of them [T] |
| 1. Interdependence | Stronger. Food and fun now bring a cost that grounds answer, Campus Safety deters breakage, and unhappy students break more |
| 3. Caps as puzzles, 4. Legible feedback | Passes. Every mess names one of three fixes, and the overlay shows all of them at once |
| 5. Edge of chaos | Adds a live tension that grows with enrollment and never needs a deadline |
| Neglect-safe and cheap catch-up | Passes. An untended campus loses about five points and stops there. The sums are a handful per spot every 20 minutes |
| Once a day (2.3) | Passes. Nothing opens and closes, nothing waits for a tap, and old saves get 36 hours before litter counts |
| Four causes (24.2) | Passes. Grounds replaces Green space |
| Size of the stop | Middling. About the size of stop 2 for the rules, plus walkers and workers to draw. It can be played in two halves if wanted: bins, litter, the yard and workers first, then seating and breakage |

### 29.11 Tests and simulate checks

- A full bin catches nothing, and an emptied one catches again.
- Twice the workers clear a spot in half the time. Too few and it sits at its ceiling.
- A broken thing is fixed inside a circle with no tap, and stays broken outside one.
- Breakage is rarer inside a Campus Safety circle and where the students who use the spot are happy.
- One advance equals many small ones, and thirty days of catch-up stays inside its target.
- Simulate: a campus with no bins and no workers gets messy, loses a few points of Happiness, and is the same at year five as at year twenty.
- Simulate: a well-staffed campus stays above 90% clean and has nothing left broken after a day.
- Simulate: the casual player's wages stay a small share of income [T], and the count of bins and yards it needed stays inside the target of 29.10.
- No line of litter or breakage text breaks the tone guide's word list.

### 29.12 Where it lands

**Two halves (the owner's decision, 2026-11-11).** Stop 4 plays as Grounds first, then the food and Academics of section 30, with a stop for him to play between. Neither half starts until he has played stop 3 and given the go-ahead.

**Play stop 4 of the feedback pass: after stop 3, before the football and calendar layer.** The owner expected this, and it is right for three reasons. It uses stop 3's lamps and walker schedule. It must exist before game days, so that layer 1 only has to add the stadium and tailgates as mess spots. And it needs nothing from later layers to be worth playing.

What it leaves switched off until its layer arrives:

| Piece | Waits for |
|---|---|
| Litter from home game days | Layer 1, football |
| The picnic table's effect on Stress | Layer 1, Stress |
| Wages on the budget screen, the Facilities slider, slower decay near a yard | Layer 2 |

### 29.13 Points raised with the owner

The owner accepted every proposal in this table on 2026-11-11, and asked for each stand-in to be put on the list in section 26.

| Point | What is proposed |
|---|---|
| This reopens a cut. Garbage was cut from SimCity's list | Bring it back on the two conditions of 29.10 |
| Bins everywhere would be a chore | Few mess spots, one bin a spot, and a count checked by the simulate script |
| Lamp posts as a Grounds item | Leave them automatic from stop 3, breakable and fixable, with no rule of their own |
| How much each part of Grounds counts | Green space half, cleanliness three tenths, seating two tenths |
| There is no budget screen yet for wages | Show them on the yard's card and in the hourly figure until layer 2 |
| A new campus | Two bins by the dining hall and no yard, so the first full bin teaches the system |
| Old saves | No litter for the first 36 hours, and one line in the away list |
| No picture of a broken thing, a picnic table, a seated student or a worker holding a broom | Stand-ins from real pictures now (29.8), and four small commissions for the Penzilla request |

### 29.14 As built

Play stop 4a, 2026-11-11. Everything in 29.2 to 29.7 is built except what is listed as rough below. `src/sim/config/grounds.ts` holds the numbers and `src/sim/systems/grounds.ts` the rules. Save version 7.

| Piece | Built |
|---|---|
| Mess spots | The dining hall, the coffee stand, the campus store and every recreation building. Strengths 1, 1, 0.6 and 0.35 |
| How busy a spot is | The students who use it are its share of the campus's lots: lots within its reach over all lots, times enrollment. It is as busy as it gets at 250 students [T] |
| Litter | A busy food place drops 4 at each 20-minute check, up to a ceiling of 100, where the spot is 30% clean. A spot at its ceiling draws half again as much |
| Bins | Catch 85% within three cells and hold 40. A full bin catches nothing. Shown as the can, then heaped, then with a bag beside it |
| Paths | Lots outside a staffed yard's circle are never above 85% clean. Inside one the paths are swept |
| The yard | 2 by 1, $60,000, a circle of sixteen cells (eight at first, twelve in 29.15, sixteen in 29.16), one worker to start and six at most, $48,000 a year each with benefits on top. Its card has a minus and a plus |
| A worker | Clears 2.2 at each check: a broken bin first (29.15), then bins more than half full, fullest first, then the dirtiest spot, then what is broken, then the other bins. That is about two busy places with bins, or half of one without |
| What a yard says | "Keeping up", or "Understaffed: hire 2 more", from the work its places ask for against what its workers can do. The work counts the litter already lying there and anything broken: a yard is keeping up only if its circle would be clean within about a day. A yard with all four workers and a backlog says "Full crew, catching up". It asks for another yard only when more falls at each check than four workers clear, which no amount of waiting fixes |
| Seating | Benches and picnic tables within three cells, and quad cells. A broken one seats nobody. A table near a dining building or an Academic lot adds two spots to social life |
| Grounds | The cause that was Green space. Green space counts half, cleanliness three tenths and seating two tenths. The part with the most to gain is the one the panel names |
| Breakage | Above seven tenths of the ceiling, about one chance in 25 at each check where the students who use the spot are middling happy (29.15), a quarter of that inside a Campus Safety circle, and at most one thing a day at a spot. A bin, bench, table or street lamp within four cells |
| Repairs | A worker in range fixes it in about half an hour of work, with no tap. Out of range it stays broken and its panel says "Outside worker coverage" |
| Placing | Trash bin, Bench and Picnic table are cards on a Grounds shelf that hand over to a drag tool, with a bar and a Done button. The yard is placed like any building |
| Feedback | A place's panel gives its cleanliness and its one fix. Tapping litter opens the place it came from. The Cleanliness overlay opens from the Happiness panel. Four new student thoughts each way. One line in the away list, first only when cleanliness is the biggest gap |
| Old saves | Nothing added, nothing charged, no litter for 36 hours, and one line in the away list |
| A new campus | Two bins beside the dining hall and no yard |
| On screen | Litter pieces on the paths around a place, more as it rises, and the odd piece on unswept paths. Up to two workers walk out from each staffed yard to what most needs them, with a broom or a cart beside them. A cone stands by anything broken. Students stop at benches and tables, and the card says what they are doing there by time of day |

**Rough, or not as designed.**

- The tilt from student types, and the Resident Advisor who empties a full bin in passing, are not built. The mix of types does not yet differ from one campus to another, so there is nothing for them to read.
- Fixed in 29.15: breakage now reads the students near the spot, not the whole campus.
- Fixed in 29.15: tapping a broken street lamp opens a panel.
- Workers walk in straight lines, as the responders of stop 2 do.
- Students stand at a bench or table. Nobody in the pack can sit.
- The picnic table's effect on Stress and litter from game days wait for layer 1. Wages on a budget screen and the Facilities slider wait for layer 2.

**Simulate checks added:** an untended campus gets messy, loses a few points, and is the same at year five as at year twenty; a well-staffed campus stays above 90% clean with nothing left broken after a day; a place with a bin and a yard that is keeping up stays above 90% clean, with nothing near it left broken after a day; the casual player's grounds stay a small job (bins no more than one and a half for each place, wages under 5% of income).

**One target is missed.** 29.10 hoped for one yard for every six to eight places. At play stop 4a the casual test player needed one for about every two. Most of that was a fault in the rules, since fixed, and the owner widened the circle to twelve cells. It now needs one for about every four. 29.15 has the numbers and what would close the rest of the gap.

### 29.15 Fixes after play stop 4a

2026-11-11, from the owner's notes on 4a. Save version 8.

**The yard reaches twelve cells.** The owner's decision. An old save works out again which yard looks after what, so a place nine to twelve cells from a yard gains its workers on loading.

**Yards for each place that drops litter.** The casual test player, twenty years, three seeds, 24 to 30 places:

| Reach | Most workers in a yard | Yards | Places to a yard |
|---|---|---|---|
| 8 cells | 4 | 8 to 10 | 2.5 to 3.3 |
| **12 cells, as built** | **4** | **6 to 7** | **3.7 to 4.2** |
| 16 cells | 4 | 5 to 7 | 4.0 to 4.8 |
| 12 cells | 6 | 5 to 6 | 4.3 to 5.4 |
| 16 cells | 6 | 4 | 6.5 to 7.5 |

Twelve does not reach the target of six to eight, and no reach does while a yard holds four workers. The campus's places ask for 15 to 18 workers between them, so four to a yard means five yards at the very least, and a wider circle only puts more places under a crew that is already full. **Proposed to the owner: sixteen cells and up to six workers in a yard, which gives one yard for about seven places.** Not built. Twelve and four stand until he says.

**A fault found on the way, and fixed.** The "one yard for every two places" reported at 4a was mostly this. Workers swept before they mended, and a place with a broken bin drops all its litter on the ground: four at each check, against the 2.2 one worker clears. So a place that had been left for a few hours before a yard reached it was never swept clean, its bin was never mended, and its yard asked for another yard for ever. **A broken bin is now mended before anything else.** A yard also counts a broken bin it is about to mend as a bin when it works out how many hands it needs. With that fixed, eight cells itself gives one yard for about three places.

**Breakage reads the students near the spot.** It read the whole campus's Happiness at the end of the last semester. It now reads today's Happiness of the open dorms and lecture halls within the spot's own reach, each counted by how many it holds: the number their student cards show. The whole campus's number stands in only where nobody lives or studies in reach yet. Reading it for fifty buildings is dear, so the dice are looked at first: most rolls cannot break anything however unhappy the students are, some break something however happy they are, and only the rolls in between read it. Thirty days of catch-up on a large campus nobody tends went from about 0.3 seconds to about 0.4.

**A broken street lamp explains itself.** Tapping its post, or the cell it stands on, opens a panel with three things:

| It says | From |
|---|---|
| What broke it: "A stray frisbee hit it, after litter piled up around the Dining hall" | Kept with the lamp when it breaks: the place whose litter led to it, and which of the lamp's two stories it was. A lamp broken before this was kept names the nearest place that drops litter |
| Whether a yard covers it: "A Facilities Yard covers it", "No Facilities Yard reaches it, so it stays dark. Build one within 12 cells", or "The Facilities Yard over it has no workers" | The yard whose circle the lamp stands in |
| When: "a worker should have it fixed in about 40 minutes" | The grounds are run forward on a copy, check by check, until the lamp is fixed. It is the game's own rules, so the time it gives is the time it takes if nothing else changes. Past three days it says the workers will not get to it for days, with the yard's own line on how many to hire |

The panel closes with "A worker fixed the street lamp" when that happens while it is open. A broken lamp whose path is cleared is forgotten.

**The test players** now give a new place its bin on the same visit, and put a second yard at the far end of an overloaded one's circle so the two share its places.

**Simulate check added:** a campus whose workers were all let go gets filthy and has bins broken, and comes back above 90% clean within five days of hiring what each yard asks for, with nothing new built. It takes that long because a filthy place draws half again as much litter, and a yard holds four workers. The check on a well-staffed place now lets the player look in once after the fall class arrives, because a yard staffed for summer is short of hands that evening. The check on the casual player's grounds now asks for at least three places to a yard.

**For the money work (the owner, 2026-11-11).** Workers' wages are about 0.2% of the casual player's income, too little to notice. When payroll gets its own lines (section 31), the wage is set again so that workers are a real cost and still an affordable one, in line with the other staff. Noted in 31.6.

### 29.16 With the money stop

Play stop 5, 2026-11-11. The owner accepted the proposal of 29.15 and asked for one more panel. Save version 9.

| Change | What was built |
|---|---|
| Reach and crew | A yard reaches sixteen cells and holds six workers. An older save works out again which yard looks after what |
| Places to a yard | The casual test player, twenty years, three campuses: 5.8, 6.5 and 6.5 places to a yard. The target of six to eight is met. The simulate check asks for at least five |
| A broken bin, bench or table | Its card says what a broken street lamp's does (29.15): what broke it, whether a yard covers it, and when it will be fixed. What broke it is kept with the thing from now on. One broken before that names the nearest place that drops litter |
| The wage | $48,000 a game year, up from $6,000, with benefits of 30% on top: $62,400 a worker. The yard's card and its Build menu card say so. In line with staff at $42,000 and faculty at $58,000 |
| Deep litter clears faster | A worker clears half again as much at a place at its ceiling, the same measure by which that place draws more. And what a filthy place draws more of lands on the ground, not in its bins. So a crew that can keep its places clean can always win them back |

**Why deep litter clears faster.** With six workers and a wider circle a yard looks after eight places or more. Left to rot, they asked for more than a full crew could ever clear, though the same crew could keep them clean: the game said "build another yard" for a campus that needed only time. The rule of 29.2, that dirt invites dirt, stays. It no longer makes a trap. A campus with no workers for six days is back above 90% clean within five days of hiring again, with nothing new built, and the simulate script holds it to that.

**The wage against the target.** The table under 9.4 gives maintenance workers 2% of income. At a wage in line with other staff they come to about 1.2 to 1.9% with benefits in mid-game and about 1% on a mature campus, because the count of places that drop litter grows more slowly than enrollment. Reaching 2% on a mature campus would take a wage of about $100,000, more than a member of faculty. The owner's words were "a real but affordable cost, in line with the other staff", so the wage follows the staff and the share is reported as it falls.

---

## 30. More food places and more Academics buildings

Asked for by the owner on 2026-11-11, to be built with Grounds in play stop 4. **Accepted by him the same day, with every proposal of 30.7 but one: the pizza place and the taco stand stay two cells wide with their patios and are not cut down. Not built.** It is the second half of stop 4, after Grounds, and neither half starts until he has played stop 3 and said go.

### 30.1 The rule they keep

The catalog has one rule above all: a building type is a look and a size inside a family, never a rule of its own (23.1). The owner asked for the same thing here: one clear effect per building. So every food place is the dining rule, and every Academics building takes a rule that exists or is already designed. Food gains two small rules, variety and income, and both have a ceiling.

### 30.2 Food

Every food place does the one thing the dining hall does: it feeds the lots in its reach. That is the food half of Food & fun, and it lets Housing grow past its first stage.

| Place | Size | Cost [T] | Reach [T] | What sets it apart |
|---|---|---|---|---|
| Food truck | 1 x 1 | $8,000 | 2 cells | Clearing it always gives the whole price back, so moving it is free |
| Convenience store | 1 x 1 | $9,000 | 2 cells | The cheapest fixed food. Snacks, open late |
| Taco stand | 2 x 1 | $10,000 | 3 cells | The cheap lunch spot. Two cells for the price of a stall |
| Smoothie and juice bar | 1 x 1 | $10,000 | 3 cells | Earns double with a recreation building within two cells |
| Coffee stand, built | 1 x 1 | $12,000 | 3 cells | |
| Pizza place | 2 x 1 | $14,000 | 3 cells | Busiest in the evening and at night |
| Burger grill | 2 x 1 | $30,000 | 5 cells | Busy at lunch |
| Late-night diner | 2 x 1 | $36,000 | 5 cells | Busiest at night, and in finals week from layer 1 |
| Dining hall, built | 2 x 1 | $45,000 | 6 cells | |
| Food court | 2 x 2 | $140,000 | 7 cells | Counts as three kinds of food |

| Decision | Why |
|---|---|
| "When it is busy" is seen, not counted. The hour of the day changes where walkers queue and eat. It never changes what a place feeds or earns | The simulation never reads the time of day (28.1). If it did, the same campus would score differently for a morning player and a night player, and catch-up would stop being exact. Finals week is a date in the game, so the diner's finals crowd can follow it, still for show |
| **Variety.** A lot with three or more different kinds of food in reach gets one tenth added to its Food & fun, never past full [T]. The food court counts as three kinds | The owner's bonus. It cannot outweigh another cause: it lives inside one cause, which is a quarter of Happiness, so it is worth at most two and a half points, and a fourth kind adds nothing |
| **Income.** Each student in reach of food is worth about $30 a year [T], shared equally among the food places that reach them | "A little income from foot traffic, like the campus store." Sharing is the ceiling: a second stall beside the first halves what each earns, so stalls cannot be stacked for money |
| Every food place has upkeep, about a twelfth of its price a year [T] | Overbuilding costs something |
| Any food place in reach lets Housing grow past its first stage | One rule for all ten. A cheap stall reaches very few lots, which is its price |
| Every food place is a mess spot (29.2). Stalls beside each other share the bins within three cells | More food means more litter. The guard against bin chores still holds, because a cluster shares its bins |
| Walkers queue at food places, and eat at the picnic tables near them | For show. It uses stop 3's walker schedule and the Grounds seats |
| Student thoughts name a favourite, from the kinds in reach: "Taco Tuesday is the only reason I go to class." | The owner's example |

### 30.3 Academics

| Building | Size, cost [T] | Its one effect in play stop 4 | What it gains when its system arrives |
|---|---|---|---|
| Computer lab | 2 x 1, $30,000 | Lifts Academic lots within four cells. The library's rule at a smaller size | Layer 1: it counts as study space, which eases exam Stress. Layer 4: Engineering and Computer Science students name it |
| Makerspace | 2 x 1, $28,000 | Things to do and social life within five cells. The recreation rule | Layer 4: a lift for Engineering and the Arts |
| Study center | 2 x 1, $35,000 | Tutoring: a better GPA on the cards of students within six cells. A stand-in | Layer 2: tutoring in reach becomes a cause of the graduation rate, and GPA follows the academic score |
| Science lab | 2 x 2, about $80,000 | **Not in stop 4** | Layer 2: lifts Academic lots like the library and draws scholars. Layer 4: the science departments |

| Decision | Why |
|---|---|
| Each building has one effect. The owner's list gave most of them two, and a favourite major | His own rule, and the catalog's. The second effect is not lost: it arrives with its system |
| The computer lab's Stress relief is not a second rule. The library family already counts as study space in the Stress design (27.1), and the computer lab is a member of that family | One family, one behaviour |
| Majors stay a look. "Engineering students benefit most" shows on cards, in thoughts and in the newspaper, and changes no number until departments are real in layer 4 | A major has never had a number of its own (23.1, 23.3). Giving it one here would make eight kinds of student to build for |
| Lifts from the library family do not add up. The best one in reach counts | As built. A computer lab is for the lecture halls the library does not reach |
| The study center changes only student cards until layer 2 | GPA is a stand-in today and nothing reads it. The owner offered this stand-in himself. Its menu card says so |
| The science lab waits for layer 2 | Its point is drawing scholars, who arrive with tiers. Before that it would be a second library with nothing to set it apart, and its sign has to be made from parts |

### 30.4 Art

Checked in the owner's packs on 2026-11-11. Every restaurant in the pack carries a large sign on its roof, which is what makes it read at phone zoom.

| Wanted | In the packs | Gap, and the stand-in |
|---|---|---|
| Burger grill | Yes: a burger restaurant, two cells wide, a burger on its roof | |
| Late-night diner | Yes: a breakfast restaurant with bacon and an egg on its roof | |
| Food court | Yes: an open-air market of stalls and umbrellas, two cells by two | |
| Pizza place | Yes: a pizza restaurant with a slice on its roof, two cells wide with a patio | Used as drawn. The owner chose this on 2026-11-11: the patio reads as outdoor seating and nothing is cropped |
| Taco stand | Yes: a Mexican restaurant with nachos on its roof, two cells wide with a patio. No stall | Used as drawn, for the same reason |
| Smoothie and juice bar | An ice-cream stand, one cell, with a cone for its sign | The ice-cream stand as it is |
| Convenience store | A newspaper kiosk, one cell | The kiosk as it is |
| Food truck | Box trucks only. One has an apple on its side. None has a serving hatch | The apple truck as it is |
| Computer lab | An electrician's workshop with a plug on its sign | As it is. It reads as power more than computers |
| Makerspace | Yes: a tool shop with a wrench on its sign | |
| Study center | None | A plain hall with the pack's book as its sign |
| Science lab | None. The museum is already the art gallery | A plain two-floor building with the pack's bottle as its sign, when layer 2 builds it |

Nine more restaurants are spare for later: ramen, chicken, sushi, cake, grill, salad, Chinese, French and Indian. The bar stays unused. The market, the ice-cream stand and the newspaper stand had been set aside for the Student Life zone, which keeps its eleven shops.

The stand-ins are on the list in section 26, with the fix for each.

### 30.5 What goes where

| When | What |
|---|---|
| Play stop 4, with Grounds | All eight food places, variety, shared income, the free move for the truck, favourite-food thoughts, queues. The computer lab, the makerspace, and the study center with its stand-in |
| Layer 1, football and calendar | The computer lab eases exam Stress. The diner's finals crowd |
| Layer 2, tiers and money | The science lab. The study center's effect on graduation. Scholars drawn by the lab family |
| Layer 4 | Everything that depends on majors |

Every piece placed in stop 4 is a look of a rule that exists, so the rules are cheap. The cost is art, tuning and tests: eleven sprites to prepare, none of them cut. **Stop 4 plays in two halves (the owner's decision, 2026-11-11): Grounds first, then food and Academics, with a stop for him to play between them.**

### 30.6 Design tests

| Test | Verdict |
|---|---|
| One rule per family (23.1) | Holds. Eight looks of the dining rule, two of the library rule and one of the recreation rule. One new effect in all: tutoring |
| Nothing to farm | Holds. Food income is shared among the places that reach a student, variety stops at three kinds, and every place has upkeep |
| Four causes (24.2) | Holds. Variety lives inside Food & fun |
| Exact catch-up | Holds, because the time of day is seen and never counted |
| The chore risk of litter (29.10) | Watched. Ten kinds of food mean more mess spots. A cluster of stalls shares its bins, and the simulate count of bins and yards applies to a campus with food variety |
| The Student Life zone of layer 2 | Changed. Its food moves to the Build menu, and the zone keeps shops and venues. It should be looked at again when layer 2 is planned |
| Tone | Holds. No bar. The diner serves coffee and breakfast at all hours |

### 30.7 Points raised with the owner

The owner accepted every proposal in this table on 2026-11-11, with one choice of his own: the pizza place and the taco stand are 2 x 1 with their patios, not cut down. That leaves the food truck, the convenience store, the smoothie bar and the coffee stand as the one-cell food.

| Point | What is proposed |
|---|---|
| The pizza place and the taco stand were asked for at one cell. The pack draws both two cells wide | Cut the patio away as a stand-in, on the art list. Or make them 2 x 1 and use the art as drawn |
| "When they're busy" | Seen on the map, never counted in the numbers |
| The variety bonus | One tenth of Food & fun at three kinds, never past full |
| Food income | About $30 a student a year, shared among the places in reach |
| Two effects on most Academics buildings | One each now. The second arrives with its system |
| "Engineering students benefit most" | Flavour until departments are real in layer 4 |
| The study center | Built with its GPA stand-in, which changes cards only, and its menu card says so |
| The science lab | Wait for layer 2 |
| The Student Life zone | Loses its food to the Build menu |
| The size of stop 4 | One stop, or two halves with a play between them |

---

## 31. Money: payroll and visible costs

Asked for by the owner on 2026-11-11: "make costs visible and realistic. Discuss first, then propose where it lands." **Discussed and proposed here. Accepted by the owner on 2026-11-11, with every proposal of 31.9, and built the same day as play stop 5: 31.10 says what was built, what the rebalance moved and what is rough.**

### 31.1 Where money stands today

| | |
|---|---|
| Built | Tuition of $8,200 a student and $3,000 an occupied bed come in. Each building's upkeep goes out, with one flat running cost of $6,500 a student that stands in for everything else |
| Designed for layer 2 | Five funding sliders, three price levers, scholarships, the bailout, the endowment and the budget screen (section 9) |
| The gap | The game has costs, and the player cannot see what any of them is for |

### 31.2 What duplicates what

Most of the request is already in the design under another name. Nothing below is built twice.

| Asked for | Already designed | What is new |
|---|---|---|
| Faculty pay, from enrollment and a class-size target, with the Instruction slider setting pay | The Instruction slider. Its face is already the student-to-faculty ratio (24.3), and "faculty are folded into the Instruction slider" (9.1) | A headcount and a pay figure the player can read. The rule is the same |
| Staff, tied to the Student Services slider | The Student Services slider | A headcount |
| Maintenance workers | Grounds (29.4) | Nothing. They get their line |
| Campus Safety and Medical Center staff, shown on the buildings | Each building's upkeep | Upkeep there is split into staff pay and utilities |
| Coaches and athletics staff | The Athletics slider, which "includes the coach" | A line, in layer 1 |
| Benefits | Nothing | A new line with no lever |
| Utilities | Building upkeep, under Facilities | Split from repairs. Bills cannot be underfunded |
| Insurance and legal | Nothing | A new small line with no lever |
| Recruiting and marketing | Nothing. Applications already has four causes (24.1) | A new lever. See 31.3 |
| Scholarships | The scholarship lever, layer 2 | Nothing |
| Debt payments | Bonds are on the later roadmap | No line until bonds exist |
| A simple Money panel | "Tapping it opens the budget screen" (9.1), layer 2 | Its first version, mostly read-only |
| No taxes | None were designed | Nothing |

### 31.3 Discussion

**1. Seeing costs and raising costs are two jobs.** Naming the lines changes nothing in the balance and is cheap: today's flat $6,500 is simply shown as the things it pays for. Raising costs is a rebalance of the whole game. The first can be done exactly. The second has to be done against the test players.

**2. Costs cannot cure "cash piles up with nothing to buy". Only something to buy can.** A campus that grows must run a surplus, and once the map is full a surplus piles up however high costs go. Late in a long run the surplus is about 28% of income today (the twice-a-day test player in year 10), against a design target of 15% (9.4). Realistic costs bring it to the target. The pile-up itself ends only with a purchase that never runs out, and the design already has one: the endowment (9.5). The proposal is to bring forward its plain form: pay cash in from the Money panel, never out, for a small permanent income [T], shown as the legacy number.

**3. Recruiting and marketing would be a fifth cause of Applications.** Section 24.1 lists four and section 24.2 allows four. The proposal: it takes the place of "the tier's ceiling" in that list, because a ceiling is the wall the other causes push against and not something the player does. It is five steps, like a price lever, with each step adding less than the one before.

**4. Realistic pay breaks the scale of small buildings.** If a professor is paid like a professor, a Medical Center cannot run on $9,000 a year. The proposal: Safety and Medical staff pay follows the students in each building's circle, and the flat cost per student shrinks by the same amount. The total is re-based, not stacked.

**5. Lines with no lever are honest and they are noise.** Benefits, utilities and insurance cannot be changed by the player. On a phone they belong inside their group, seen on a tap, never on the first screen.

### 31.4 The lines

| Line | How it is worked out | Its lever, and when |
|---|---|---|
| **Payroll** | | |
| Faculty | Students divided by the class-size target of 20 [T], times pay | Layer 2: the Instruction slider sets pay. Paid less, faculty drift away over the year, classes swell and the academic score falls. Until then pay is full and class size sits on its target |
| Staff: admissions, advisors, administration, IT, dining | One for every 40 students [T], times pay | Layer 2: the Student Services slider |
| Safety and medical staff | By the students in each building's circle. Shown on the building's card | The same slider |
| Maintenance workers | Workers hired, times the wage (29.4) | The plus and minus on each yard |
| Coaches and athletics staff | Layer 1 | The Athletics slider. The head coach is hired by name |
| Benefits | 30% on top of all pay [T] | None |
| **Buildings and utilities** | | |
| Utilities | A cost for each building by its size. Labs, the pool and the stadium use more | None. Bills are paid in full, whatever the Facilities slider says |
| Upkeep and repairs | Today's upkeep number for each building, and each cell of road | Layer 2: the Facilities slider. Underfunded, buildings turn Rundown |
| **Scholarships** | Layer 2 | The scholarship lever |
| **Other** | | |
| Teaching supplies and the library | By student | The Instruction slider |
| Student programs and events | By student | The Student Life slider |
| Recruiting and marketing | Five steps. A step costs more on a bigger campus and lifts applications by 5, 9, 12 and 14% [T] | Its own, from play stop 5 |
| Insurance and legal | By student, small | None |
| Debt payments | None until bonds exist | |

Nobody is hired one by one except the head coach, and the count of maintenance workers on each yard. Every other headcount follows from the size of the campus and is there to be read.

### 31.5 The Money panel

| Decision | Why |
|---|---|
| It opens from the cash figure on the top bar. The top bar keeps showing net income an hour | The owner's instruction, and where section 9.1 already put the budget screen |
| Two lists for the game year: income and spending. Spending is grouped as Payroll, Buildings and utilities, Scholarships, and Other, largest first, each with its total and its share | The owner's layout |
| Tapping a group opens its lines, each with the count behind it: "42 faculty at $50,000" | A cost the player can check against the campus |
| One sentence leads the panel: how much of every $100 is kept | The one number that says whether the campus is healthy |
| It is read-only, apart from the marketing steps and paying into the endowment | Sliders and price levers join the same screen in layer 2 |
| While new costs are phasing in, it says which day of seven this is and where the total will settle | No surprise |

### 31.6 Balance

| Decision | Why |
|---|---|
| The targets of section 9.4 are restated by what the money buys. Payroll with benefits is 59% of spending on the size ladder and 58% on the prestige ladder | "Roughly half or more, as at real universities." The old shares already implied it; now it is visible |
| Until football, tiers and scholarships exist their lines are empty, so the lines that do exist carry the 85% between them: about 55 points of payroll, 17 of buildings and utilities and 13 of other [T] | Otherwise the surplus would grow, not shrink |
| About 15 of every 100 dollars is left for projects in mid-game | The existing target. It is what "a well-run campus must still grow" means in numbers |
| Every cost follows the size of the campus. There is no fixed overhead | A small or untended campus is never crushed |
| **Old saves: new costs phase in over one game year.** Each raised or new cost starts where it stood on the day of the upgrade and climbs in seven daily steps. The away summary says so on each of them | The owner's rule. A game year is a real week, so a daily player sees every step |
| New campuses pay full costs from the first day, with the opening cash and first weeks re-tuned against the test players | Nothing to phase |
| The endowment, in its plain form, gives late cash somewhere to go | 31.3, point 2 |
| **Maintenance workers are paid more (the owner, 2026-11-11, after play stop 4a).** At $6,000 a game year each, their wages are about 0.2% of the casual player's income, too little to notice. The wage is set again with the other staff, so that workers are a real cost and still an affordable one. The simulate check on that wage bill (29.11) is re-tuned with it | The owner's note. See 29.15 |

Simulate checks to add:

- Payroll is at least half of spending on a mature campus.
- The mid-game margin sits between 10 and 20%.
- The casual and once-a-day players still reach each campus size within a year of today's pace.
- No test player holds more cash than a year of its own spending at any year's reading, with the players paying into the endowment once nothing else is worth buying.
- A mature save from before the upgrade needs no rescue at any point in its seven days of phase-in.
- An untouched campus still nets a surplus after five years.

### 31.7 Where it lands

**Play stop 5, Money: after both halves of stop 4 and before the football layer.** Grounds brings wages and food brings income, so the rebalance is done once, after them. Football then adds its lines to a panel that already exists. It is the spending half of layer 2 brought forward at full funding. Layer 2 adds the controls to the same screen.

| When | What |
|---|---|
| Play stop 5 | The Money panel. Faculty, staff, safety and medical staff, workers, benefits, utilities, upkeep, supplies, programs, insurance. The marketing steps. The plain endowment. The phase-in. The rebalance and its checks |
| Layer 1 | Coaches and athletics staff, athletics operations, ticket and TV income |
| Layer 2 | The five sliders, which set pay and funding. Price levers, tiers, state funding, scholarships, the bailout with its 36 hours of warning |
| Later | Debt payments, with bonds |

One piece could come sooner if wanted: the read-only panel alone, in the first half of stop 4, so that maintenance wages have a line from the day they exist.

### 31.8 Design tests

| Test | Verdict |
|---|---|
| 4. Legible feedback | Stronger. Every dollar spent has a name and a count behind it |
| Simple screens | Holds, if groups come first and lines only on a tap |
| Four causes (24.2) | Holds, if marketing takes the place of the tier's ceiling among the causes of Applications |
| Once a day (2.3) | Holds. Nothing here has a window. The phase-in takes seven days and is announced on each |
| Neglect-safe | Holds. Costs follow size, so an untended campus keeps a surplus. The simulate script checks it |
| Cheap catch-up | Holds. Yearly rates are worked out only when something changes, as now |
| Nothing to farm | Holds. Marketing gives less with each step, and the endowment's income is small and cannot be withdrawn |
| Toy first (8) | At risk if costs are tuned to realism before fun. The margin target, not a real university's books, decides the numbers |

### 31.9 Points raised with the owner

| Point | What is proposed |
|---|---|
| Costs alone will not stop cash piling up | Bring the plain endowment forward as the purchase that never runs out |
| Marketing is a fifth cause of Applications | It replaces "the tier's ceiling" in that list |
| Realistic pay against small buildings | Safety and Medical pay follows the students in the circle, and the flat cost per student shrinks to match |
| Lines with no lever | Inside their group, on a tap |
| Dining staff under Student Services | As asked. Student Life's slider keeps programs and events |
| Benefits | 30% of all pay, one line |
| Class-size target | 20 students to one member of faculty |
| The phase-in | Seven daily steps over one game year, each in the away summary |
| When | Play stop 5, after stop 4. Or the read-only panel alone in the first half of stop 4 |

### 31.10 As built

Play stop 5, 2026-11-11. `src/sim/systems/budget.ts` works out every line, `src/sim/config/money.ts` holds the numbers, and `moneyView` in `src/ui/buildUi.ts` turns them into the panel's words. Save version 9.

| Line | Built [T] |
|---|---|
| Faculty | One for every 20 students, to the nearest whole person, at $58,000 |
| Staff | One for every 40 students, at $42,000 |
| Safety and medical staff | One for every 800 students in the building's circle, never fewer than one, at $42,000. A student is in a circle by the lots in it, as a litter place counts its users (29.14). The building's card shows "Staff of 3: $163,800 a year with benefits" |
| Maintenance workers | The count on each yard, at $48,000 (29.16) |
| Benefits | 30% on top of all four |
| Utilities | A dorm $5,500 or $13,000 by stage, a lecture hall $7,500 or $17,000. A hand-placed building $1,500 a cell, an open court or field $400 a cell, the pool $9,000. Ponds, bins and seats nothing |
| Upkeep and repairs | The numbers of before, for each building and each cell of road |
| Supplies, programs, insurance | $650, $500 and $220 a student |
| Recruiting and marketing | Off, then four steps at $60, $120, $180 and $240 a student, lifting applications by 5, 9, 12 and 14% |
| The flat $6,500 a student | Gone. The lines above replace it |
| The endowment | Paid in from the Money panel in sums of a tenth or a quarter of the cash in hand. 2% a game year. Never paid out, except that a shortfall draws on it before the state does (9.5) |

**The panel.** The cash figure on the top bar opens it. One sentence leads: "You keep $15 of every $100 that comes in." Then income, then spending as Payroll, Buildings and utilities, and Other, largest first, each with its share. A tap opens a group to its lines, each with the count behind it. Scholarships has no group until it has a line. Marketing has a minus and a plus. The endowment has its two sums and "It never comes back out." A building's Build menu card says what it will cost to run before it is bought: "Runs at $15K a year, plus staff from $55K".

**Older saves.** Costs start at exactly what the save paid the day before and climb to the lines above in seven steps, one at each day's start. Each step puts one line in the away list: "Running costs rose a step, 3 of 7: $61M a year now, and about $72M once all 7 are in." The panel says the same while it lasts. Marketing is the player's own choice and is paid in full from the day it is turned on. A campus made new pays the lines in full from its first day.

**The rebalance, against the test players.** Twenty game years each.

| Measure | Before | After |
|---|---|---|
| Kept of every $100, years 3 to 8 | About 28 | 14 to 19 |
| Payroll with benefits, of all spending | Not shown | 55 to 58% |
| Sizes reached, casual and once-a-day players | 500 in year 2, 1,000 in year 3, 2,000 in year 4, 4,000 in year 6, 8,000 in year 11 | The same years. Enrollment at each year's reading is within 6% for the casual player and within 16% for the once-a-day one |
| Cash in hand at the end | $350M and rising | Under half a year of spending, with about $200M in the endowment |
| An untouched campus | Nets $211K a year | Nets $110K a year: 12 of every $100 |
| A mature save from before, seven days of phase-in | | Spending goes from $55M to $72M a year. No rescue, and cash never under $26M |

**What had to move.**

- **Word of mouth, from 0.9 to 1.0** fall applicants for each student on campus. A campus now opens with all four class years (32.1), so about a quarter of the founders graduate each spring from the first year on. With nothing else changed the third year's class was a fifth smaller. This puts the first three years back to within a few points of where they were.
- **Opening cash did not move.** It is still $400,000. What had to change was the order the test players buy in. With staff to pay from the day a building opens, a player who puts up a Medical Center and a Campus Safety office before anyone has moved in runs the first days at break-even, and half the founding class gives up waiting. The test players now house a class that is waiting before they buy services, as the top bar tells a person to. **This is the one early trap the new costs make,** and the Build menu card now carries the running cost so a person can see it coming.
- **The fastest test player,** which spends every dollar on lots the moment it has one, ends up with half its dorms outside any Campus Safety circle. The casual and once-a-day players cover every dorm. The two coverage checks now read the casual player's campus.

**Simulate checks added,** all six of 31.6: payroll is at least half of spending on a mature campus; the mid-game margin sits between 10 and 20%; both players reach each size within a year of the pace before; nobody holds more cash than a year of spending at any reading; a mature save from before needs no rescue while costs phase in; an untouched campus still nets a surplus after five years.

**Rough, or not as designed.**

- **Maintenance workers come to less than the 2% in the table of 9.4.** 29.16 says why. The wage was set by "in line with the other staff".
- **The margin drifts above 20 late.** A mature campus keeps 19 to 22 of every $100 once its endowment is large, because the endowment's income counts. Mid-game is on target.
- **Safety and medical staff come to about 2% of income** against 1.5% in the table, because the test players overlap their circles.
- Scholarships, coaches, athletics and debt have no lines yet. The five sliders and the bailout are still layer 2.
- A count is the nearest whole person, so the pay of a tiny campus is lumpy: one more student can add a member of faculty.
- Paying into the endowment is one tap and cannot be undone. The sums offered are never more than a quarter of the cash in hand.

---

## 32. People on campus

Asked for by the owner on 2026-11-11, in two parts. He asked whether it was cheap enough to fold into the money stop. **The first part is, and is being built with it. The second is the next small stop, after money.**

### 32.1 Four class years from the first day

Folded into the money stop, because it moves the balance of the first years and the rebalance of section 31 should be done once.

| Decision | Why |
|---|---|
| A new campus's founding class is spread over all four years: 27% freshmen, 26% sophomores, 25% juniors and 22% seniors [T] | The owner's rule: "roughly even, slightly fewer seniors" |
| It covers everyone admitted from the founding class, at move-in and off its waitlist. Every later class arrives as freshmen | One founding body |
| The total and the money on day one are exactly what they were | His rule. Income follows the count of students, not their year |
| Seniors graduate at the first commencement, so alumni start in year one | His rule. Donations and the legacy numbers get a three-year head start |
| The founding upper classes carry entry years of 0, -1 and -2 in the class records and on their cards. They are left out of graduation rates | They did not start here, so they say nothing about how well the school graduates its own |
| The first three years grow more slowly than before, because a quarter of the founders now leave each spring. It is measured with the test players and re-tuned inside the money rebalance | The one place this does shift the balance. Day one is unchanged; years one to three are not |
| **Old saves:** at the next fall intake, after classes move up, a save younger than four years has its continuing students spread again so that no year is empty. Nobody is removed, off-campus counts and income are unchanged, the class records move with the students, and the away list says so once | The owner's own proposal, kept. Its one cost: some student cards change who they are that day, because a card is made from a class and a number. That already happens to every class at every intake |
| The card's first line shows the right year, and types follow it as designed: Lost Freshman in year one only, Super Senior at the end | Nothing new. The rules of 13.3 read the class year |

### 32.2 People who are not students

The next small stop. It extends the flavour walkers of 13.6 into people the player can tap, each with a card in the style of the student card.

| Rule | Why |
|---|---|
| Nobody is simulated. A card is made when it is opened, from the save's seed and the campus's own numbers, as a student card is | The owner's rule, and the house rule for walkers. Nothing is saved and catch-up never sees them |
| Every card ends on one line tied to a real number, and tapping that line goes to what it is about | The rule of the student card: something the player can act on |
| How many are on screen follows the size of the campus and the time of day: more staff by day, mostly students at night, visitors at weekends and on game days | The owner's rule. The hour comes from the player's clock and changes only who is seen (28.1). Weekends come from the date in the game |
| Students stay most of the crowd. No more than about a quarter of the people on screen are anyone else [T] | His rule |
| Professors and staff on screen follow the payroll counts of section 31 | The reason this comes after the money stop: the counts are real by then |

| Who | Seen as | Card | The line tied to a number |
|---|---|---|---|
| Professor | The pack's teacher, in a mortarboard | Name, department, and what they are doing: teaching in a named hall, office hours, marking in the library | Class size. Later, Instruction funding (layer 2) and faculty Stress (layer 1) |
| Advisor | The waiter, in a bow tie | Role and what they are doing | Students to each member of staff |
| Admissions guide | The bellhop, in a red cap, leading a tour with a pennant | Role and what they are doing | The acceptance rate, or the size of the next class |
| Dining worker | The chef | Which food place, and what they are doing | The students that place feeds |
| Campus store clerk | The bus driver's figure, in a cap | The store, and what they are doing | Who passes its door and what it earns |
| Maintenance worker | The worker in a hard hat, with a broom or cart beside him. Already on the map | Their yard and the job in hand: emptying a bin, sweeping a named place, mending a bench | Whether the yard is keeping up, in the yard's own words |
| Campus Safety officer | The police figure. Already on the map | Their building, and the call they are on or "on patrol" | Incidents handled and missed |
| Medic | The nurse. Already on the map | Their building and the call they are on | The same |
| Tour-group parents | Two townsfolk behind the guide | One line | The applicant forecast and how the campus looks. "Lovely quad. Where would she sleep?" when beds are short |
| A booster | The figure in a top hat | One line | The alumni count now. Donations and deals when they exist |
| A townie | A figure in a trucker cap | One line | How many locals from their street are enrolled, or the road beside their house |
| A delivery driver | The mail carrier with boxes, and the mail truck on roads | One line | How many food places and stores they supply |

### 32.3 Art

Checked in the owner's packs on 2026-11-11. The people pack has a ready-made figure for most roles, each with a hat that reads at phone zoom.

| Wanted | In the packs | Gap, and the stand-in |
|---|---|---|
| Professor | Yes: the teacher, in a mortarboard | |
| Dining worker | Yes: the chef | |
| Officer, medic, maintenance worker | Yes, and already used | |
| Booster | Yes: a figure in a top hat | |
| Delivery driver | Yes: a mail carrier, a mail truck, and stacks of boxes | |
| Tour flag | A red pennant on a pole | It is drawn beside the guide. No figure holds anything, because the figures have no hands |
| Advisor, admissions guide, store clerk | No figures of their own | The waiter, the bellhop and the bus driver, who each wear something distinct |
| Lanyards | None, and too small to see at this size | A hat or uniform is the tell |
| Parents who look older than students | None. Every figure is the same build | Two looks kept for visitors alone |
| Townie | A figure in a trucker cap among the sixteen plain ones | That look is kept for townies alone |

Nothing here has to be assembled. If a stand-in looks wrong in play, a drawn advisor and a guide holding a flag join the Penzilla request.

### 32.4 Where it lands

| When | What |
|---|---|
| The money stop | Four class years (32.1). The faculty and staff counts that this stop reads |
| The People stop, small, next after money | The cards and walkers of 32.2, with visitors at weekends |
| Layer 1 | Visitors on game days. The coach and the mascot. Faculty Stress on the professor's card |
| Layer 2 | Instruction funding on the professor's card. The booster's line about donations and deals |

The People stop changes no rule and no number. It needs no rebalance, which is why it does not have to ride with the money stop, and why the money stop is not held up by it.

### 32.5 Tests

- A card for the same person is the same every time it is opened, and differs between saves.
- Every card's last line quotes a number the simulation reports at that moment.
- No card line breaks the tone guide's word list.
- Opening cards, and the people on screen, change nothing in the saved game.
- Non-students stay under their share of the crowd at every time of day.

---

## 33. Life and sound

Asked for by the owner on 2026-11-11: "give the campus more life and soul. All visual and audio only, never touching the numbers, deterministic where it matters, and cheap on a phone." He split it himself: three items go with the fixes being built now, and three need a place. **This section records the split and proposes the place. The Life and sound stop is not started and waits for his word.**

### 33.1 The split

| Item | What | When |
|---|---|---|
| 1 | More people: walker counts raised and scaled by enrollment, zoom and time of day, with a Crowd density setting of Low, Normal and High | Now, with the fixes after the money stop |
| 2 | Commuters walking in from town and home again, cars from driveways to parking spaces and back, cars waiting at crossings, a shuttle bus, delivery trucks | Now |
| 6 | A frame budget, pooled sprites, and crowd density that drops by itself when frames fall | Now |
| 3 | Small scenes that come and go | The Life and sound stop |
| 4 | Ambient motion | The Life and sound stop |
| 5 | Sound | The Life and sound stop |

### 33.2 Where the Life and sound stop fits

**Proposed: its own stop, the last one before football.** The order would be: the fixes now, the People stop, the second half of stop 4 (food and Academics), Life and sound, then layer 1.

| Reason | |
|---|---|
| It leans on what comes before it | The tour group and its pennant come with the People stop. The busker stands by a food place and queues form at them, which is stop 4b. Study groups sit at Grounds's picnic tables |
| Football needs it | Game days are the loudest and busiest thing in the game. If scenes, crowds and sound exist first, layer 1 only has to add tailgates and the stadium crowd |
| It changes no rule and no number | It needs no rebalance and can be played for feel alone |

What it leaves for layer 1: tailgates, the stadium crowd, rain and its sound, and scenes that follow the season.

### 33.3 Rules for all of it

| Rule | Why |
|---|---|
| For show only. Nothing here is saved, nothing changes a number, and nothing runs in catch-up | The owner's rule |
| The hour comes from the player's clock and the weekday and season from the date in the game. Neither is ever counted (28.1) | The same rule as day and night |
| Every visible thing is a real sprite. Motion may be made in code on a real sprite, and spray, ripples and rain may be light particles, as weather's already are (28.3). Nothing is drawn to stand in for a missing figure | The art rule |
| One setting reduces effects, one sets crowd density, and two set volume | Old phones, and players who want quiet |

### 33.4 Small scenes

Checked in the owner's packs on 2026-11-11. The figures only stand and walk, and hold nothing, which decides most of this table.

| Scene | With the art there is | Gap |
|---|---|---|
| Study groups at picnic tables | Yes: figures standing at the Grounds tables | Seated figures |
| Club tables with signs | Yes: the pack's tables, its sandwich-board sign and a tent, set out together | |
| A tour group behind a guide with a flag | Yes, from the People stop: the pennant is drawn beside the guide | A guide holding it |
| Move-in day, families with boxes | Yes: stacks of boxes, cars and trucks by the dorms | |
| Pickup games on a quad | Partly: figures can run about | A ball and a frisbee |
| People lying on the grass | No | A lying figure |
| Someone walking a dog | No | A dog |
| A busker by the coffee stand | No | A figure with an instrument |
| Tailgates on game day | Yes: tents and tables. Layer 1 | A grill |

The scenes with no art are left out until it exists. They are not faked.

### 33.5 Ambient motion

| Wanted | In the packs | How |
|---|---|---|
| Wheels turning and headlights | Yes: animation sheets for cars, the bus and trucks | The pack's own frames |
| A fan and a windmill | Yes: animation sheets | The pack's own frames, where such a building stands |
| Trees swaying, a pennant moving | No animation | A gentle sway made in code on the real sprite |
| Pond and fountain ripples, sprinklers on lawns in the morning | No animation. A fountain exists as a still picture, and no sprinkler head | Light particles, as rain will be. The sprinkler has spray and no head until one is drawn |
| Birds and the campus squirrel | None | Left out until drawn |
| Lights coming on in windows at dusk | None, as found in 28.3 | Left out until window art is made. Street lamps already light |

### 33.6 Sound

| Decision | Why |
|---|---|
| Sound follows what is on screen and how far the view is zoomed: footsteps and chatter grow with the walkers in view, traffic is heard near roads, birds by day and crickets at night | The owner's design. It is worked out from what is drawn, so it costs almost nothing |
| A bell chimes on the hour of the player's own clock. Soft sounds for taps. Light music under it all | His list |
| Rain, the stadium crowd and anything tied to weather or game days arrive with layer 1 | Their systems are not built |
| Two volumes in Settings, music and sound. Both start low | His instruction |
| Silent means silent | His instruction. In the iPhone app the sound is set to follow the ring switch. In a browser tab the phone decides, and it is not the same on every phone, so this is on the list to try on a real iPhone |
| No sound plays until the first tap | Browsers do not allow it |
| Short loops, compressed, a few megabytes in all, and never more than a handful playing at once | Cheap on a phone, and a small download |
| Only licensed or public-domain sound, every one listed in CREDITS.md | His rule |

**What is free, from a first look on 2026-11-11.** The choosing is done when the stop is built, and every licence is read on its own page then.

| Need | Free | Notes |
|---|---|---|
| Taps and menus | Kenney's Interface Sounds (100 files) and UI Audio (50), public domain | No credit required. Credited anyway |
| Short tunes for a result or a reward | Kenney's Music Jingles (85), public domain | |
| Background music | Blippy Bits, public domain, pay what you want. Gentle Exploration, free with credit | Free music is the weakest part. It may not suit the game |
| Birds, crickets, chatter, footsteps, traffic, a bell | Nothing found as one free public-domain pack. Kenney has no ambience | Single public-domain recordings exist on Freesound and OpenGameArt and are picked one by one |

**What might be worth buying.** Prices as listed on 2026-11-11, to be confirmed before any purchase. Nothing is bought without the owner's word.

| Thing | Price seen | Why |
|---|---|---|
| One cosy music pack: the Cozy Casual series, or the Cozy Gaming Music Asset Pack | About $12 to $16 a pack | Loopable, licensed for commercial games. The single purchase most likely to be worth it |
| Plucky Plucks music pack | About $30 | The same, dearer |
| Cozy Adventure Lo Fi pack | About $2 | Five loops. Cheap enough to try |
| An ambience pack, such as the Environment Sounds Pack | Not seen | Rain, birds, crickets, city and crowd in one licence, if picking single free recordings proves slow |

The recommendation is to start with free sound only, and buy at most one music pack if the free music does not fit.

### 33.7 Design tests

| Test | Verdict |
|---|---|
| Exact catch-up | Holds. Nothing here is counted or saved |
| Cheap on a phone | The risk. Crowds, cars, particles and sound all cost frames. The frame budget and the automatic drop in density built with the fixes are the guard, and each later piece is measured against them |
| The art rule | Holds, because scenes with no art are left out, not faked |
| Simple screens | Three settings are added: crowd density, music volume and sound volume. Reduce effects already exists in the design (28.3) |
| Tone | Holds. Music without words, a bell, birds. Nothing loud by default |

### 33.8 Art to ask for

For the Penzilla request, in the order they would add most: seated and lying figures, a ball and a frisbee, a dog, birds and a squirrel, a figure with an instrument, a guide holding a flag, a sprinkler head, a grill, and lit windows.
