# Where art goes

Drop a file and it appears — no code change. **Still:** `.webp .png .jpg .svg` · **Animation:** `.mp4 .webm` (its first frame is the still). One file per slot is enough; add both only for things that animate. Missing files show a labeled placeholder. See [../../../../ASSET-PLAN.md](../../../../ASSET-PLAN.md) for counts.

```
art/
├── townlife/            ← turn-start "town comes alive" (animated). A POOL: any filenames.
│   ├── spring/             a random one shows each Spring round
│   ├── summer/             (drop into the season folder; flat townlife/ also works)
│   ├── fall/
│   └── winter/
│
├── town/                ← Main Street backdrop, per season. File name = mainst
│   ├── spring/mainst.*
│   ├── summer/mainst.*
│   ├── fall/mainst.*
│   └── winter/mainst.*
│
├── card/                ← one image per Fortune card: card/<id>.*  (e.g. card/diner_trouble.webp)
│                          THE TOWNSFOLK & PLACES LIVE HERE — Dot on card/diner_trouble,
│                          the Mayor on card/reelection_drive + card/civic_*, the inspector on
│                          card/code_violation / osha_writeup / surprise_inspection. (id list in ASSET-PLAN.md)
│
├── crew/                ← tradesperson portraits. A POOL: any filenames (01.webp, hank.webp…),
│                          assigned to workers automatically. ~20 covers a table.
│
├── townsfolk/           ← the 12 named NPCs (animations). One file per character, named by slug —
│                          plays as an intro before a card that character is behind. Slugs:
│                          crabtree, grit, folsom, dot, svenson, hettrick, tolliver, vale,
│                          ramsey, developer, boon, newcomer  (e.g. townsfolk/dot.mp4)
│
├── shop/                ← shop exterior, per trade × building
│   ├── mechanic/           garage.*  shop.*  warehouse.*
│   ├── plumber/            (same three in every trade folder)
│   ├── electrician/
│   ├── pipefitter/
│   ├── welder/
│   └── hvac/
│
├── equipment/           ← POOLS (any filenames; each rig gets a stable random one)
│   ├── basic/              generic basic gear — drop your 10 here (01.webp …)
│   └── pro/
│       ├── mechanic/       pro gear for mechanics — drop your 6 here
│       ├── plumber/        (one folder per trade; same idea)
│       ├── electrician/
│       ├── pipefitter/
│       ├── welder/
│       └── hvac/
│                           (a single equipment/basic.* or equipment/pro/<trade>.* still works;
│                            equipment/pro.* is a last-resort fallback for an unfilled trade)
│
└── season/              ← OPTIONAL fallback round-intro art (spring.* …) used only if townlife/ is empty
```

**Slugs (must match exactly, lowercase):**
- trades: `mechanic plumber electrician pipefitter welder hvac`
- buildings: `garage shop warehouse`
- seasons: `spring summer fall winter`
