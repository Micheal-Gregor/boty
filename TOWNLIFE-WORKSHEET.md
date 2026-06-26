# Townlife Worksheet — The Story of Maple Hollow (48 vignettes)

The hidden "story deck." Each new game secretly shuffles every season's **12** cards and deals **6**,
played one per round in order — so players see a different cut of the 200-year story each game, no
repeats, and never learn it's a deck. 4 seasons × 6 rounds = the 24-round year.

**Where the art goes:** `apps/web/src/assets/art/townlife/<season>/<id>.{png,mp4}`
(e.g. `townlife/spring/the_sugaring.png`). The caption (flavor) is already wired in
`apps/web/src/lib/townlife.js` and shows automatically under the image at round start — you only
generate the **image**. `.mp4` works (first frame = still).

**Square** format (matches the round popup). Per-season look:
- **Spring — The Founding (1824–1867):** black-and-white / sepia, pioneer Americana.
- **Summer — The Golden Age (1870s–1920s):** warm, saturated color; bustling postcard town.
- **Fall — The Tough Times (1930s–2000s):** muted, autumnal, overcast; somber but dignified.
- **Winter — The Revival (2010s–today):** cozy modern; snow, warm interior light, hopeful.

---

## 🌱 SPRING — The Founding *(B&W / sepia)*

| id (`townlife/spring/…`) | caption (already wired) | graphic direction |
|---|---|---|
| `the_hollow` | Before it had a name, it had a shape… a creek fast enough to turn a wheel. | A misty, untouched maple valley; a fast cold creek; no buildings yet. Wide landscape. |
| `hollis_dam` | 1824 — Hollis dammed the creek and raised the first sawmill. | **Construction:** men raising a timber sawmill beside a freshly-dammed creek, mud and fresh-cut logs. |
| `the_sugaring` | …tapped the maples and boiled the sap in the snow — the sugaring. | Figures around steaming sap kettles in snowy maple woods at dusk; lanterns, buckets on trees. |
| `the_fair_split` | They argued over the fair split before they had a town to spend it in. | Settlers in heated-but-friendly debate around an open ledger by lantern light; the "true founding." |
| `the_grange` | The Grange came first — half co-op, half church social. | **Construction:** raising a timber-frame Grange lodge; a barn-raising crowd. |
| `svensons_yard` | Svenson never once delivered a board he hadn't been paid for. | A tidy early lumber yard, neatly stacked boards, a proud aproned proprietor at the gate. |
| `the_blacksmith` | A blacksmith to mend iron — the welders and mechanics trace their craft to his forge. | A blacksmith at a glowing forge, hammer raised, sparks, a horse waiting to be shod. |
| `indispensable` | …being indispensable and being paid were two different things. | A weary tradesman tipping his hat outside a humble shop, an unpaid IOU slip in his hand. |
| `the_rail_spur` | 1867 — the rail spur reached the valley. | **Big moment:** a steam locomotive arriving at a brand-new depot; townsfolk gathered, hats in the air. |
| `first_hollow_bank` | First Hollow Bank opened under a cautious, decent man named Folsom. | A modest new brick bank; a kindly banker at the barred teller window. |
| `the_charter` | Spring 1867 — Maple Hollow, Est. 1867, cut into the lintel over the hardware store. | Townsfolk gathered as the carved "EST. 1867" lintel is set; bunting, celebration. |
| `courthouse_square` | The county raised a Courthouse and Town Hall — how the Crabtrees got into politics. | **Construction:** raising the courthouse cupola on the town square; scaffolding, flag. |

## ☀️ SUMMER — The Golden Age *(warm color)*

| id (`townlife/summer/…`) | caption | graphic direction |
|---|---|---|
| `the_whistle` | The Hollis Mill ran three shifts; its whistle set the rhythm of every day. | The mill at full steam, whistle blowing, workers streaming through the gate at dawn. |
| `main_street_rises` | Hollow Hardware, the creamery, the barbershop — and a diner the town would call Dot's. | A bustling Main Street: striped awnings, horse carts, shoppers, a sunny prosperous bustle. |
| `the_opera_house` | …an Opera House grander than the Hollow strictly needed. | An ornate opera-house façade, gaslights, an opening-night crowd in their finery. |
| `the_grange_hall` | The Grange Hall became the town's living room. | A lively dance/fair inside a tin-ceilinged hall; bunting, fiddlers, long tables. |
| `wiring_the_hollow` | …electricians, the men who climbed the new poles. | Linemen on fresh poles stringing wire; the first electric streetlights glowing at dusk. |
| `plumbing_the_hollow` | …pipefitters and plumbers crawling the new trenches beneath Main Street. | An open trench down Main Street, pipefitters laying water mains, curious onlookers. |
| `the_county_fair` | The County Fair drew the whole region. | A vibrant fair: Ferris wheel against the sky, prize hogs, pie tables, ribbons, crowds. |
| `the_vale_vineyard` | Out on the ridge the Vales planted a vineyard and put on airs. | A sun-drenched ridge vineyard, a fine house, a well-dressed family surveying their rows. |
| `the_bbb_founded` | …founded the Better Business Bureau to police fair dealing among themselves. | Merchants signing the BBB charter around a table; a handshake; a polished brass plaque. |
| `business_of_the_year` | …a ribbon on the shop that did the year proudest. The first winner was a wheelwright. | A proud wheelwright receiving a blue ribbon outside his shop; townsfolk applauding. |
| `the_odd_fellows` | The Odd Fellows raised their lodge hall. | A handsome fraternal lodge hall; members in regalia posed on the steps. |
| `the_pettigrews_lose` | The first losers, naturally, were the Pettigrews. | Two sour brothers watching the ribbon ceremony from the edge of the crowd, arms crossed. |

## 🍂 FALL — The Tough Times *(muted / overcast)*

| id (`townlife/fall/…`) | caption | graphic direction |
|---|---|---|
| `the_country_falls` | Then the country fell… the mill cut to a single shift. | The mill in half-light, most windows dark, a thin trickle of workers; grey sky. |
| `folsom_at_the_window` | …a Folsom lent his own savings to keep the bank's doors open. | A banker calming an anxious crowd at the teller window; lamplight, quiet resolve. |
| `you_cannot_eat_paper` | …you can eat what the Brambles grow, and keep the lights on if the electrician runs you credit. | A farm family and a tradesman sharing a lean supper; a credit ledger on the table. |
| `two_wars` | Some came home in uniform and traded it for coveralls. | A young veteran hanging his uniform jacket on a peg beside a set of work coveralls. |
| `old_vern_builds` | …Old Vern Tucker chief among them — built the postwar Hollow with their hands. | Postwar workers framing new homes; a young, strong Vern with a hammer, sleeves rolled. |
| `the_fire_hall` | A proper Fire Hall went up, and the Boons have answered its bell ever since. | A 1950s fire hall; the first Chief Boon and crew posed by a gleaming engine. |
| `profit_is_opinion` | …Profit is an opinion; cash is a fact. | A shopkeeper at a desk staring at fat ledgers and an empty cash drawer; bare bulb. |
| `the_whistle_stops` | The Hollis Mill went quiet for good, its great rooms left to the pigeons. | The silent mill: broken windows, shafts of light, pigeons, weeds through the floor. |
| `the_depot_silenced` | The young people followed the rail out of town. | An abandoned depot; a last train pulling away; a young person with a suitcase, looking back. |
| `main_street_dims` | Storefronts went dark one by one; the Opera House was boarded. | A dim Main Street at dusk; FOR LEASE signs; the boarded, sagging opera house. |
| `the_pettigrews_rise` | …a desperate town pays a man who shows up, whether or not he does it right. | The Pettigrews' cheap trucks on a job, corners visibly cut; better tradesmen watching, grim. |
| `dot_keeps_it_lit` | Dot kept the diner lit and the coffee hot — a town that still gathers is still a town. | Dot's Diner glowing warm on a dark, empty street; a few loyal regulars at the counter. |

## ❄️ WINTER — The Revival *(cozy modern / snow)*

| id (`townlife/winter/…`) | caption | graphic direction |
|---|---|---|
| `the_idea` | …rebuild the most of the town, one honest job at a time. | A lit Grange-hall meeting; Eunice Vale presenting the revived contest; snow falling outside. |
| `eunice_vale` | …Eunice Vale, keeper of the ribbon. | A confident portrait-scene: Eunice Vale, vineyard heiress turned civic leader, holding the ribbon. |
| `the_ribbon_reborn` | The trades were how it would come back. | A fresh "Business of the Year" banner strung over a snowy, busy Main Street. |
| `odd_fellows_reborn` | The Odd Fellows hall is rewired and rented for weddings now. | A string-lit wedding in the restored lodge hall; warm light, new fixtures, happy crowd. |
| `the_mill_retrofit` | The old Hollis Mill is being retrofitted into a warehouse — steel and pipe and big money. | The mill shell scaffolded; welders and pipefitters at work; sparks bright against snow. |
| `chief_boons_firehouse` | The town raised a new firehouse for Chief Boon. | A gleaming modern firehouse at dusk; Chief Boon and the engine; snow on the apron. |
| `the_office_tower` | …talk, financed and dangerous, of the Hollow's first three-story office tower. | A steel tower frame rising over Main Street; a crane; an ambitious blueprint unrolled. |
| `the_developer` | …a smooth, impatient Developer who builds big and pays slow. | A sharp-suited developer with blueprints at a snowy site; a checkbook he's slow to open. |
| `the_newcomer` | …a quiet Newcomer at the old Vance place; the diner hasn't made up its mind. | A lone silhouette at the lit window of the old Vance house; snow falling; curtains half-drawn; mysterious. |
| `dots_diner_today` | Dot's is still the warm beating heart of Main Street. | Dot's Diner today, full and glowing; Dot pouring coffee; frost on the window, snow outside. |
| `main_street_louder` | …Main Street is louder than it's been in a generation. | A snowy Main Street packed with work trucks and ladders; lit shops; the bustle of a town fixing itself. |
| `mind_the_ledger` | …who did the work, who gets paid, and who did the town proudest this year. | The BBB gala / ribbon night: the whole modern cast gathered; the ledger and the ribbon on the table. *(A bookend to spring's `the_fair_split`.)* |
