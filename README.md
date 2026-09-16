# Scribe — marketing site

Static marketing site for **Scribe**, the macOS app that records meetings, writes them
up, and reads every call against what the project has already agreed.

No build step, no dependencies, no framework. Open `index.html` in a browser, or serve
the folder with any static server.

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

---

## Structure

```
scribe-web/
├── index.html              Home — the full story, every section
├── features.html           Deep dive on the four pillars
├── pricing.html            Plans, comparison table, FAQ
├── integrations.html       Searchable integrations grid
├── about.html              Why the product exists
├── contact.html            Contact form (front-end only — see "Contact form")
├── privacy.html            Privacy policy
├── terms.html              Terms of service
├── 404.html                Not-found page
├── README.md
└── assets/
    ├── css/
    │   ├── base.css        Design tokens, fonts, reset, typography, layout, reveal
    │   ├── components.css  Buttons, nav, footer, cards, accordion, tabs, marquees, forms
    │   ├── sections.css    Page-level compositions (hero, stack, pricing, …)
    │   └── responsive.css  Breakpoint overrides — loaded last so it always wins
    ├── js/
    │   ├── data.js         ← EDITABLE CONTENT: logos, testimonials, integrations
    │   ├── main.js         Renders the three lists above into the page
    │   ├── reveal.js       Scroll reveals, word-by-word headings, count-up numbers
    │   ├── stack.js        Depth cue for the stacking cards in "Why Scribe"
    │   ├── context-scene.js  The pinned "Project context" canvas scene
    │   └── ui.js           Nav, mobile menu, tabs, accordion, price switch, filter, form
    ├── fonts/              Self-hosted Onest + Source Serif 4 (woff2, latin subset)
    └── img/
        ├── app/            Product screenshots, captured from the Scribe prototype
        ├── bg/             Painted backdrops that sit behind the screenshots
        └── favicon.svg
```

The CSS files are loaded in that order on every page and each has one job, so a change
almost always belongs in exactly one of them.

---

## Editing content

**Logos, testimonials and integrations** live in `assets/js/data.js` as three arrays.
Change the values and the logo strip, the testimonial columns and the integrations grid
all update — no HTML to touch.

> The names, quotes, roles and statistics shipped here are **placeholders**. Replace
> them with real ones, or delete them; invented testimonials attributed to people who do
> not exist should not go live.

**Everything else** — headlines, body copy, pricing, FAQ answers, legal text — is
written directly in the HTML, so it is indexable and readable without JavaScript.

**Prices**: each amount carries `data-monthly` and `data-yearly` attributes. The
monthly/yearly switch swaps between them; edit the attributes, not the text node.

**Navigation and footer** are repeated in each HTML file (there is no templating step).
If you change a link, change it everywhere — `grep -l 'href="pricing.html"' *.html`
finds them.

---

## Design system

| Token | Value | Used for |
| --- | --- | --- |
| `--bg` | `#FBFAF6` | the page |
| `--surface` | `#F4F2EC` | cards, bands |
| `--surface-2` | `#ECE9E0` | tabs, wells |
| `--ink` | `#1C1A15` | headlines, primary text |
| `--ink-2` | `#56524A` | body copy, the muted half of a heading |
| `--ink-3` | `#8C887E` | labels, meta |
| `--accent` | `#0548CF` | the app's Ocean blue, used sparingly |
| `--maxw` | `1200px` | content width |

Headings use a serif at weight 300 with tight negative tracking; everything else is
Onest. Two-tone headings are one dark line and one muted line — the muted half is
wrapped in `<span class="soft">`.

### Fonts

- **Onest** (UI) is self-hosted in `assets/fonts/`.
- **Sentient** (display serif) is loaded from the Fontshare CDN in each page's `<head>`.
  If it cannot be reached, the self-hosted **Source Serif 4** takes over; its `@font-face`
  carries `size-adjust: 98%` so the swap does not reflow a headline.

To drop the CDN entirely, remove the two Fontshare `<link>` tags and the site falls back
to Source Serif 4 permanently. To self-host Sentient instead, download it from
[fontshare.com/fonts/sentient](https://www.fontshare.com/fonts/sentient), put the woff2
files in `assets/fonts/`, and add `@font-face` rules named `Sentient` in `base.css`.

---

## Animation

Everything is opt-in through data attributes, handled by `reveal.js`:

| Attribute | Effect |
| --- | --- |
| `data-reveal` | the element settles up into place when it first enters view |
| `data-reveal="soft"` | the same, gentler — for large media |
| `data-reveal="group"` | its direct children settle in sequence |
| `data-reveal-step="90"` | milliseconds between children in a group |
| `data-reveal-delay="160"` | delay before this element starts |
| `data-split` | a display heading arrives one word at a time |
| `data-count="92"` | counts up to 92 the first time it is seen (`-suffix`, `-decimals`, `-prefix`, `-duration`) |

`prefers-reduced-motion: reduce` disables all of it, and a `no-js` class on `<html>`
(removed by an inline script) means nothing stays hidden if JavaScript fails.

### The pinned context scene

The **Project context** section on the home page is one `<canvas>` and one particle
system, pinned for five viewports of scroll. The rail (`.ctx__rail`, 520vh) supplies the
scroll distance; the pin (`.ctx__pin`, 100vh sticky) is what you see. Scroll position is
reduced to a single 0–1 value in `context-scene.js`, and every visual property is a curve
read off it, so the five stages are one continuous transformation:

| Progress | Stage | What happens |
| --- | --- | --- |
| 0.00 | Everything you've said | labelled pills, each led by a coloured insight dot |
| 0.19 | Signals | the pill contracts back into that same dot, which resizes |
| 0.38 | Relationships | a live nearest-neighbour mesh knits the whole cloud |
| 0.57 | Context | a Scribe screen surfaces inside the cloud |
| 0.76 | Useful output | the cloud funnels into a cone behind the screen, which ends fully opaque |

**The motion model.** Every particle orbits one shared vertical axis at its own radius,
height, tilt, flatness and speed — a tornado seen slightly from above, so no two paths
are alike. Each orbit's starting angle is *solved* from the particle's stage-one grid
position (`solveOrbits`), which means at `accum = 0` the vortex **is** the grid layout:
when the spin starts, nothing moves to somewhere new. `sin(theta)` doubles as depth and
drives size, opacity, and whether a particle draws in front of or behind the screen.

**The pill and the dot are the same object.** A particle's `(x, y)` is always its dot;
the pill is drawn extending to the right of it and contracts back into it, with the label
clipped away as it closes. The dot's colour says what kind of thing was said — and that
is the dot you follow all the way to the end:

| Colour | Kind |
| --- | --- |
| green `#0A7548` | a decision — something settled |
| blue `#1570EF` | a question — asked and still open |
| amber `#B45309` | a task — someone owes something |
| orange `#C2410C` | a risk — conflicts, discrepancies, blockers |
| grey `#969186` | a plain detail |

Only a handful of unlabelled dots are ever added, and they fade in during *stage three*
rather than stage two, so the pill-to-dot beat reads as a transformation of what was
already there rather than a new population arriving.

**The mesh** is recomputed every frame: each dot reaches for its three nearest
neighbours, so the field reads as one point cloud and reorganises as it turns. The
single nearest neighbour is always joined however far away it is, so no dot is ever
orphaned; the second and third are held to a radius.

**The funnel.** From 0.64 the cloud blends out of its free orbit and into an explicit
cone — a mouth just below the copy, a tip behind the middle of the screen — while the
spin accelerates and the screen drops slightly to open room above it. Particles reaching
the tip fade out rather than piling up, and anything that would cover the screen fades
only where it overlaps it, so the cone's mouth survives while its body disappears behind.

The heading never moves; only the caption under it changes. The five dots below the
caption are a progress cue for a pinned section — delete `.ctx__ticks` from `index.html`
and the `ticks` handling in `context-scene.js` if you'd rather not have it.

Tuning lives in two places: the stage curves at the top of `frame()` (widen a window to
slow a stage down, move its start to re-order the beats) and the geometry in `place()`
and `cardRect()`. `STAGE_AT` holds the caption thresholds and should stay roughly aligned
with those curves. The composition is deliberately held to the middle of the screen —
`bandW` in `layout()` sets that width.

Under `prefers-reduced-motion: reduce` the section un-pins, the rail collapses, the canvas
draws one composed frame of where the scene ends up, and the five captions render as the
sequence they describe.

### The stacking cards

The "Why Scribe" section is the pattern from the reference design. Each panel is
`position: sticky; top: 0` and one viewport tall, inside a single tall parent — so panel
*n+1* rises and comes to rest exactly over panel *n*. That part is pure CSS.

`stack.js` adds only the depth cue: as the next card approaches, the one underneath
scales down slightly and dims, so the pile reads as cards on top of each other. Below
900px the CSS flattens the stack into ordinary cards and the script stands down.

---

## Images

Product screenshots in `assets/img/app/` were captured from the Scribe prototype at 2×
and saved as WebP. The painted backdrops in `assets/img/bg/` are generated abstracts, not
photographs, so there is nothing to license.

The pattern throughout is a `.shot`: a backdrop filling the frame with the app screenshot
inset from its top-left corner and running wider than the frame, so it crops on the right
and bottom. The crop is controlled per section by the `width` on `.shot__fg` — raise it to
zoom in, lower it to show more of the window.

---

## Contact form

`contact.html` validates in the browser and shows a confirmation. It does **not** submit
anywhere. To make it live, give the `<form>` an `action` and `method` pointing at your
endpoint and remove the `preventDefault()` branch in `initForm()` in `assets/js/ui.js`.

---

## Browser support

Current Chrome, Safari, Firefox and Edge. Uses CSS nesting-free plain CSS, custom
properties, `aspect-ratio`, `color-mix()`, `:focus-visible` and `IntersectionObserver` —
all widely available. Images are WebP.
