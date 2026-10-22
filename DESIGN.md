# SAQR — design

**Concept.** You are a peregrine over the Asir escarpment at the last hour of light: the valley
curves ahead, the sun sits in it, and the only way to score is to let the mountain lift you —
ride the thermals, stoop for speed, and thread the rock towers without touching one.

**Palette**
| role | hex | note |
|---|---|---|
| zenith | `#241d3a` | deep indigo-violet overhead |
| mid sky | `#7d4a5e` | mauve band above the sun |
| horizon | `#ffb683` | saffron (fog colour too) |
| sun | `#ffefd2` | HDR disc, blooms |
| rock shadow | `#3a2b33` | cold side of every cliff |
| rock lit | `#a9785c` | sun-grazed faces |
| juniper | `#46543a` | the green Asir slopes |
| ink | `#f8efe3` | HUD text |
| accent | `#ffb454` | thermals, score, the one hot colour |

One accent only: saffron. Cool lilac `#8fa6c9` exists solely as fill light, never as UI.

**Type.** Tanker (display, wordmark + numbers) / Satoshi (UI + HUD labels). Reem Kufi for the
small Arabic "صقر" — the game is named in Arabic first, English second.

**Motion character.** Gliding inertia: long eased arcs, nothing snaps. The camera lags ~90 ms
behind the bird and rolls 20 % of its bank, so the horizon stays level while the world tips.

**Signature moment.** The stoop: wings tuck into an arrow, the camera pulls back, FOV kicks
+12°, the wind roars — then a flare into a thermal where lit motes spiral past and the valley
opens up. Dive → lift → score is the whole game in three seconds.

**Avoid.** (1) purple-to-blue "AI" gradient skies, (2) flat-shaded low-poly mountains, (3) bloom
soup / lens flares everywhere. Depth comes from aerial perspective and rim light, not glow.

**Differs from the last two.** Afterlight was a cool teal night glider with tap gates; Vesper was
a static editorial site. This is warm ochre/indigo, holds, drag-to-fly and vertical thermals.
