# Pokémon JP runtime assets

Immutable asset snapshot for ポケモン-バトルMVU-無印2.5. This repository contains public runtime files only; no character prompts, worldbooks, user data or account configuration.

Release: `v2026.09.23.1`. Card UI stays inline. Dependencies and fonts are served from the tagged repository; scripts use the host-injected Vue instance. Music and online music search have been removed.

## Sources and licenses

See `manifest.json` for every original URL/version and SHA-256. Licenses and original notices are under `licenses/`. Pokémon imagery remains property of Nintendo / Creatures / GAME FREAK / The Pokémon Company. Upstream software licenses do not transfer ownership of that imagery. Showdown normal/shiny front animations were captured from the public asset directory on 2026-09-23 UTC; no BW/PMD asset sets are included.

## Local changes

Relative ESM/CSS imports; host Vue bridge for Pinia; Japanese MVU button events; JSON5 parsing without code evaluation; protected variable paths and failed-move handling; escaped notification messages; immutable sprite catalog and owned unknown-image fallback. `runtime/assets.js` and `runtime/unknown.svg` are released under CC0-1.0. All upstream files retain their original licenses.
