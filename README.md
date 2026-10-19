# ADE 2026 by night

An unofficial, free fan map and guide for Amsterdam Dance Event 2026 (21 to 25 October).

- **Map:** https://radtech-solutions.github.io/ade-2026/ shows every Amsterdam building at night with ADE venues glowing. Filter by day, time of day and free entry, and search artists, venues, genres and districts.
- **Guide:** https://radtech-solutions.github.io/ade-2026/guide/ lists every event day by day, with the free ones marked and five suggested routes.

Not affiliated with or endorsed by Amsterdam Dance Event. Event data comes from the public ADE program, pulled 19 October 2026. Always check the official event page before you go.

## Credits

- 3D city model, tile format and tile worker: [Amsterdam, building by building](https://github.com/alexbarakov/amsterdam-by-building) by Alex Barakov, MIT licence (see `LICENSE-amsterdam-by-building.txt`).
- Building data: [3D BAG](https://3dbag.nl) by TU Delft (CC BY 4.0); BAG, BGT and AHN (CC0); Gemeente Amsterdam open data.
- Geocoding: PDOK Locatieserver. Districts: Gemeente Amsterdam stadsdelen.
- Rendering: [three.js](https://threejs.org) (MIT).
- Fonts: Archivo, JetBrains Mono and Newsreader (SIL Open Font License), self-hosted.

## How it works

A static site with no backend and no tracking. The building tiles ship as gzip files and are decoded in the browser. Venues are matched to the building at their address, and all filtering and search run on the device.

Built with love by [RadTech](https://radtech.nl).
