<script>
  import { backToMenu } from "../lib/store.js";
  import Shell from "./Shell.svelte";

  const eras = [
    { yr: "before 1825 – 1830s", title: "The Hollow Before the Town", text: "A sheltered fold in the hills where a cold creek ran fast enough to turn a wheel, and the sugar maples grew thick. The millwright Hollis dammed the creek in 1824, and where he built, others followed. Each late winter the settlement tapped the maples in the snow — the sugaring — and argued over the fair split of the profit. That argument, the old-timers said, was the true founding." },
    { yr: "1830s – 1860s", title: "Roots Put Down", text: "The Grange came first, then a chapel, then Svenson's lumber yard — which never delivered a board it hadn't been paid for. The trades arrived quietly: a blacksmith, a pump-and-well man, a tinsmith. Indispensable, all of them — and never quite paid on time." },
    { yr: "1867", title: "The Town Named", text: "The rail spur reached the valley; First Hollow Bank opened under a Folsom who lent against character; the county raised a courthouse and town hall. The settlement filed its charter — Maple Hollow, Est. 1867." },
    { yr: "1870s – 1920s", title: "The Bright Years", text: "The Hollis Mill ran three shifts and Main Street rose to meet the money. The merchants built an Opera House grander than the town needed, and founded the Better Business Bureau to police fair dealing — and to hang a ribbon each winter on the shop that did the year proudest. Business of the Year." },
    { yr: "1930s – 1970s", title: "The Long Test", text: "The country fell. A Folsom kept the bank open with his own savings. The farms and trades carried the Hollow through two wars and taught it its hardest lesson: profit is an opinion; cash is a fact." },
    { yr: "1980s – 2000s", title: "The Lean Decades", text: "The mill whistle stopped for good. Storefronts went dark and the young followed the rail out of town. The Pettigrews bid low and cut every corner — but Dot kept the diner lit, and the Hollow held on out of pure stubbornness." },
    { yr: "2010s – today", title: "The Turn", text: "The Bureau dusted off the old ribbon and made it a contest: rebuild the town one honest job at a time. The mill is becoming a warehouse, the firehouse is new, and Main Street is louder than it's been in a generation. The Hollow is open for business. It always was." },
  ];
  const cast = [
    ["Mayor Crabtree", "runs the square; wants his legacy built and isn't fussy how"],
    ["Dwight Folsom", "the banker — lends safe, calls shaky loans, owed a century of deference"],
    ["Dot", "the diner, the gossip; her good word is worth more than the bank's"],
    ["Eunice Vale", "Bureau chair and architect of the revival; keeper of the ribbon"],
    ["Old Man Hettrick", "old money, parting with none of it; disputes every bill on principle"],
    ["Chief Boon", "the firehouse — when he says now, he means it"],
    ["The Pettigrew brothers", "the rivals, still bidding low and chasing the ribbon"],
  ];
</script>

<Shell bg="bbb_review" label="The story of Maple Hollow">
  <div class="page">
    <button class="back" onclick={backToMenu}>← Menu</button>
    <h1>The Story of Maple Hollow</h1>
    <p class="sub">Two hundred years, in seven chapters.</p>
    {#each eras as e}
      <section class="era">
        <p class="yr">{e.yr}</p>
        <h2>{e.title}</h2>
        <p>{e.text}</p>
      </section>
    {/each}
    <section class="era">
      <h2>The town today — who's who</h2>
      <ul class="cast">
        {#each cast as [name, blurb]}<li><strong>{name}</strong> — {blurb}</li>{/each}
      </ul>
    </section>
    <p class="closer">Two hundred years on, the argument is the same one they had over the sugaring snow: who did the work, who gets paid, and who did the town proudest this year. <em>Welcome to Maple Hollow. Mind the ledger.</em></p>
  </div>
</Shell>

<style>
  .page { background: rgba(16,18,24,0.72); border: 1px solid var(--line, #2a2f3a); border-radius: 14px; padding: 22px 24px; }
  .back { background: none; border: 1px solid var(--line, #2a2f3a); color: var(--muted, #9aa0aa); border-radius: 8px; padding: 6px 12px; cursor: pointer; margin-bottom: 12px; }
  .back:hover { color: var(--accent, #e0b341); border-color: var(--accent, #e0b341); }
  h1 { margin: 0 0 2px; }
  .sub { color: var(--muted, #9aa0aa); margin: 0 0 18px; }
  .era { margin: 0 0 18px; }
  .yr { color: var(--accent, #e0b341); font-size: 0.8rem; letter-spacing: 0.04em; text-transform: uppercase; margin: 0; }
  .era h2 { margin: 2px 0 6px; }
  .era p { color: #cdd2da; line-height: 1.55; margin: 0; }
  .cast { margin: 6px 0 0; padding-left: 18px; color: #cdd2da; line-height: 1.7; }
  .closer { color: #cdd2da; line-height: 1.6; border-top: 1px solid var(--line, #2a2f3a); padding-top: 14px; margin-top: 6px; }
</style>
