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
├── shop/                ← shop exterior, per trade × building
│   ├── mechanic/           garage.*  shop.*  warehouse.*
│   ├── plumber/            (same three in every trade folder)
│   ├── electrician/
│   ├── pipefitter/
│   ├── welder/
│   └── hvac/
│
├── equipment/           ← basic.*  (generic basic gear)
│   └── pro/                pro gear specialised per trade: pro/mechanic.* … pro/hvac.*
│                           (a plain equipment/pro.* is the fallback if a trade is missing)
│
└── season/              ← OPTIONAL fallback round-intro art (spring.* …) used only if townlife/ is empty
```

**Slugs (must match exactly, lowercase):**
- trades: `mechanic plumber electrician pipefitter welder hvac`
- buildings: `garage shop warehouse`
- seasons: `spring summer fall winter`
