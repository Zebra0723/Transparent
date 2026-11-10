# transparent

A showcase site for **transparent tech mods**: clear-shell consoles, crystal keyboards, glass-back phones, and anything else that puts the circuitry on display.

The site is designed like a museum catalogue of see-through objects. Every mod is an "exhibit" with a catalogue number (T-001, T-002, …) and a spec sheet. Behind the glass panels, a clear circuit board with hairline copper traces is generated on load. Signal pulses run along the traces, LEDs blink, and a clearer patch follows your cursor. The **X-ray** toggle removes the frost entirely.

**Typography:** [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) for display headings, [Geist](https://fonts.google.com/specimen/Geist) for body text, and [Geist Mono](https://fonts.google.com/specimen/Geist+Mono) for labels and data.

## Features

- **Mod gallery**: search, category filters, sorting, likes, and a detail view with a photo carousel, parts list, build steps and comments
- **Add / edit mods**: drag-and-drop, click or paste photos (auto-resized, first photo is the cover), difficulty, build time, parts, steps, tags, link, and a live card preview
- **Idea lab**: pitch ideas, upvote them, cycle their status (open → building → built), and use **Build this** to turn an idea into a mod (the idea is then linked to the build)
- **Your data**: everything is stored locally in IndexedDB, with JSON export/import (photos included) and a reset to the sample data
- Light and dark glass themes, responsive layout, keyboard support, and reduced-motion support

## Run it

It's a static site with no build step. Serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. It can also be deployed as-is to GitHub Pages, Netlify, etc.

## Structure

```
index.html        markup for all views
css/style.css     glass design system and layout
js/internals.js   animated circuit-board background
js/store.js       IndexedDB wrapper
js/seed.js        sample mods/ideas and generated device illustrations
js/app.js         routing, rendering, forms, likes, votes, backup
```
