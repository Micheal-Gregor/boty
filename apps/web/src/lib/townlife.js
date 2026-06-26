// The Story of Maple Hollow — a hidden "townlife" deck that narrates the town's 200-year history
// across the fiscal year. 12 vignettes per season (48 total); each NEW game secretly shuffles every
// season's 12 and deals 6, played one per round in order — so players see a different cut of the
// story every game, no repeats within a game, and never learn it was a deck.
//
// Round → season → slot mapping is the engine's own seasonFor(): 4 seasons × 6 rounds; the round's
// roundInSeason (1–6) indexes the 6 dealt cards. Art lives at art/townlife/<season>/<id>.{png,mp4};
// the flavor here is the caption shown with it. (Spring is the founding — render those B&W/sepia.)

export const TOWNLIFE = {
  // SPRING — The Founding (1824–1867). Sepia / black-and-white pioneer Americana.
  spring: [
    { id: "the_hollow",        flavor: "Before it had a name, it had a shape: a sheltered fold in the hills where a cold creek ran fast enough to turn a wheel." },
    { id: "hollis_dam",        flavor: "1824 — a millwright named Hollis dammed the creek and raised the first sawmill. A man who could cut other men's timber never wanted for neighbors." },
    { id: "the_sugaring",      flavor: "Each late winter the whole settlement tapped the maples and boiled the sap in the snow — the sugaring, the oldest tradition the town still keeps." },
    { id: "the_fair_split",    flavor: "They argued over the fair split of the sugar money before they had a town to spend it in. That argument, the old-timers said, was the true founding." },
    { id: "the_grange",        flavor: "A town becomes a town when it builds what it can't carry away. The Grange came first — half co-op, half church social, where a man's word and his ledger weighed the same." },
    { id: "svensons_yard",     flavor: "Svenson opened a lumber yard below the mill and never once delivered a board he hadn't been paid for — a habit his great-grandchildren inherited." },
    { id: "the_blacksmith",    flavor: "The trades arrived quietly. A blacksmith to shoe horses and mend iron — the welders and mechanics would trace their craft to his forge." },
    { id: "indispensable",     flavor: "From the start the Hollow ran on the people who fixed what it couldn't live without — and the uneasy truth that being indispensable and being paid were two different things." },
    { id: "the_rail_spur",     flavor: "1867 — the rail spur reached the valley. Suddenly Hollis lumber could go to market, and the world could come to the Hollow." },
    { id: "first_hollow_bank", flavor: "First Hollow Bank opened under a cautious, decent man named Folsom, who lent against character as much as collateral." },
    { id: "the_charter",       flavor: "In the spring of 1867 the settlement filed its charter: Maple Hollow, Est. 1867 — the date still cut into the lintel over the hardware store." },
    { id: "courthouse_square", flavor: "The county raised a Courthouse and Town Hall on the square — which is how the Crabtrees got into politics and never left." },
  ],
  // SUMMER — The Golden Age (1870s–1920s). Warm color, bustling, the postcard town.
  summer: [
    { id: "the_whistle",         flavor: "The Hollis Mill ran three shifts and its whistle set the rhythm of every day in the Hollow." },
    { id: "main_street_rises",   flavor: "Money moved and Main Street rose to meet it: Hollow Hardware, the creamery, the barbershop — and a diner the town would one day know simply as Dot's." },
    { id: "the_opera_house",     flavor: "The merchants, prosperous and a little vain, built an Opera House grander than the Hollow strictly needed — and were proud of it for a hundred years." },
    { id: "the_grange_hall",     flavor: "The Grange Hall became the town's living room — vendor fairs, harvest dances, and heated meetings all under the same tin ceiling." },
    { id: "wiring_the_hollow",   flavor: "As the town wired itself for electric light, the trades multiplied — electricians, the men who climbed the new poles." },
    { id: "plumbing_the_hollow", flavor: "And plumbed itself for running water — pipefitters and plumbers crawling the new trenches beneath Main Street." },
    { id: "the_county_fair",     flavor: "The County Fair drew the whole region — prize hogs, pie tables, a Ferris wheel against the summer sky." },
    { id: "the_vale_vineyard",   flavor: "Out on the ridge the Vales planted a vineyard and put on airs — and the Hollow has half-resented, half-admired them ever since." },
    { id: "the_bbb_founded",     flavor: "Tired of being cheated by drummers and undercut by sharps, the merchants founded the Better Business Bureau to police fair dealing among themselves." },
    { id: "business_of_the_year",flavor: "Every winter the Bureau hung a ribbon on the shop that had done the year proudest. They called it Business of the Year. The first winner was a wheelwright." },
    { id: "the_odd_fellows",     flavor: "The Odd Fellows raised their lodge hall, and the fraternal orders gave the prosperous town its pomp and its secrets." },
    { id: "the_pettigrews_lose", flavor: "The first losers, naturally, were the Pettigrews — who have been trying to win that ribbon ever since." },
  ],
  // FALL — The Tough Times (1930s–2000s). Muted, autumnal, somber but resilient.
  fall: [
    { id: "the_country_falls",   flavor: "Then the country fell, and the Hollow learned what it was made of. The mill cut to a single shift." },
    { id: "folsom_at_the_window",flavor: "The bank came within a bad week of closing — until a Folsom stood at the teller's window and lent his own savings to keep the doors open. People are still polite to the Folsoms." },
    { id: "you_cannot_eat_paper",flavor: "You cannot eat a stock certificate. But you can eat what the Brambles grow, and keep the lights on if the electrician runs you credit." },
    { id: "two_wars",            flavor: "Two wars took the young men. Some came home in uniform and traded it for coveralls." },
    { id: "old_vern_builds",     flavor: "That GI generation — Old Vern Tucker chief among them — built the postwar Hollow with their own hands." },
    { id: "the_fire_hall",       flavor: "A proper Fire Hall went up, and the Boons have answered its bell ever since." },
    { id: "profit_is_opinion",   flavor: "The lean years taught the hardest lesson: a business can look healthy on paper and still die for want of cash in the drawer. Profit is an opinion; cash is a fact." },
    { id: "the_whistle_stops",   flavor: "Every mill town has the year the whistle stops. The Hollis Mill went quiet for good, its great rooms left to the pigeons." },
    { id: "the_depot_silenced",  flavor: "The rail depot followed the mill into silence, and the young people followed the rail out of town." },
    { id: "main_street_dims",    flavor: "Storefronts went dark one by one; the Opera House was boarded, the County Fair shrank to a midway and a raffle." },
    { id: "the_pettigrews_rise", flavor: "Into the vacuum stepped the Pettigrew brothers, who understood a desperate town pays a man who shows up — whether or not he does it right." },
    { id: "dot_keeps_it_lit",    flavor: "But the Hollow didn't die. Dot kept the diner lit and the coffee hot and the gossip flowing — because a town that still gathers somewhere is still a town." },
  ],
  // WINTER — The Revival (2010s–today). Cozy, modern, hopeful renewal; the living cast.
  winter: [
    { id: "the_idea",            flavor: "What the Hollow was waiting for was an idea — and it came from the Bureau: rebuild the most of the town, one honest job at a time." },
    { id: "eunice_vale",         flavor: "Under its sharp-eyed chair Eunice Vale, the Bureau made Business of the Year a public contest — and herself the keeper of the ribbon." },
    { id: "the_ribbon_reborn",   flavor: "The trades, she argued, were not what was left of Maple Hollow. The trades were how it would come back." },
    { id: "odd_fellows_reborn",  flavor: "The Odd Fellows hall is rewired and rented out for weddings now — its ruin made useful again." },
    { id: "the_mill_retrofit",   flavor: "The old Hollis Mill is being retrofitted into a warehouse — steel and pipe and big money — its ruin made useful again." },
    { id: "chief_boons_firehouse",flavor: "The town raised a new firehouse for Chief Boon, and the Boons keep their long watch." },
    { id: "the_office_tower",    flavor: "There is talk — financed and dangerous — of fitting out the Hollow's first three-story office tower." },
    { id: "the_developer",       flavor: "Outside money has noticed: a smooth, impatient Developer who builds big and pays slow." },
    { id: "the_newcomer",        flavor: "And a quiet Newcomer who bought the long-empty Vance place and keeps to himself — about whom the diner has not yet made up its mind." },
    { id: "dots_diner_today",    flavor: "Dot's is still the warm beating heart of Main Street — her good word worth more than the bank's." },
    { id: "main_street_louder",  flavor: "The mill whistle is silent, but Main Street is louder than it's been in a generation — trucks and ladders and the music of a town fixing itself up." },
    { id: "mind_the_ledger",     flavor: "Two hundred years on, the argument is the same one they had over the sugaring snow: who did the work, who gets paid, and who did the town proudest this year." },
  ],
};

// The dealt playlist for the current game: { spring: [6], summer: [6], fall: [6], winter: [6] }.
let playlist = null;

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Secretly deal a new story for this game: 6 of each season's 12, in shuffled order. */
export function dealTownlife() {
  playlist = {};
  for (const [season, cards] of Object.entries(TOWNLIFE)) playlist[season] = shuffled(cards).slice(0, 6);
}

/** The vignette for a given round: { id: "<season>/<id>", flavor } or null. roundInSeason is 1–6. */
export function townlifeForRound(seasonName, roundInSeason) {
  const season = (seasonName ?? "Spring").toLowerCase();
  const list = playlist?.[season];
  if (!list || !list.length) return null;
  const e = list[((roundInSeason ?? 1) - 1) % list.length];
  return e ? { id: `${season}/${e.id}`, flavor: e.flavor } : null;
}
