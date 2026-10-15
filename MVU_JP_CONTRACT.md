# Japanese MVU settings contract, 2026-10-16

Canonical update values: `主AI追従出力` / `追加モデル解析`. Account settings, worldbook overrides, script comparisons, controls and action identities use the same Japanese protocol. Legacy Chinese and Japanese inputs remain readable. Japanese writes use `mvu_jp_settings`; Rinne preserves its main-only private namespace. Unknown fields and false/zero preferences are retained.

Maintained MVU source: `source/MagVarUpdate`. The upstream version is unchanged; rebuild uses the included package lock and webpack configuration. External imports retain the previously released vendored dependency bytes. The full application integration and per-card audit live in the private dev_astraea project.

Deployment uses an immutable compact tag with a parent pointing to the reviewed source commit. Existing unrelated card assets keep their prior pins. This release includes 86 runtime/license files (1310716 bytes).

Recovered MVU source provenance: upstream MagicalAstrogy/MagVarUpdate commit `caada1e4f14d73175f14ba718d6dd42247c7424e`, matched to this card's shipped runtime.
