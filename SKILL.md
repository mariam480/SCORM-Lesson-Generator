---
name: run-slide-lesson-generator
description: Generate an educational lesson in SLIDE format as a SCORM 1.2 package — a fixed (non-scrolling) frame with Back/Next buttons and an "N / Total" slide counter, consistent across every slide and lesson. Use when asked to build, create, generate, author, package, run, preview, or screenshot a slide-based / presentation-style / paginated lesson (NOT the scrollable Rise format). Each slide is a composed layout (title + visuals + text + optional interaction) and supports text, lists, images, icons (bundled Lucide set, offline), audio/video, accordion, tabs, flashcards, drag-to-sort, timeline, code, and graded knowledge-check quizzes.
---

# Slide Lesson Generator

Builds **one lesson as a deck of slides** in a SCORM 1.2 package, using a
**custom player**:

- a **fixed frame** — slides never scroll; content is laid out to fit the frame
- **two buttons** (`‹ Back` / `Next ›`, the last slide says `Finish`)
- an **`N / Total` slide counter** + a top progress bar
- **identical chrome on every slide and every lesson** — guaranteed by the player

The author writes a JSON slide spec; the player renders all components, so the
frame stays consistent no matter what's on a slide.

> The skill ships with **no example lesson**. You build each lesson in **your own
> folder** with **your own assets**, and the generator writes the package **beside
> your spec** — nothing is ever created inside the skill.

## Authoring rules — read first (most important section)

This skill's job is to **render the lesson the user describes**, not to invent one.
The block types and interactions below are a **palette you reach into when the
user's content calls for it** — not a checklist to fill on every lesson.

**Fidelity to the user's input is the top priority:**

1. **If the user gives you slide content, render it as given.** Same wording, same
   order, same number of slides, same emphasis. Don't paraphrase, reorder,
   compress, "improve," or split their slides unless they ask or the content
   physically won't fit the frame (then split and say so).
2. **Do not auto-inject interactions.** Knowledge checks, flashcards, sorting,
   tabs, accordions, timelines, quizzes — **none of these are added by default.**
   Add one only when (a) the user asks for it, or (b) their own content is clearly
   that shape (e.g. they wrote a real question with answers → a knowledgeCheck; a
   set of term/definition pairs → flashcards). When in doubt, leave it out.
3. **Never end a lesson with a quiz "because lessons have quizzes."** A lesson with
   no graded check is completely valid. Only build a knowledge check when the user
   wants to assess something specific.
4. **Don't invent content.** No made-up facts, examples, statistics, characters,
   or filler slides to pad length. If the user's material is short, the lesson is
   short.
5. **Build *upon* the context, don't replace it.** "Understand the context and
   build the lesson on it" means: use their topic, their tone, their structure as
   the spine, and only enrich where it genuinely helps (a relevant image, a clean
   list, a divider between parts) — not by swapping in a generic template.
6. **Vary form to match meaning, not for variety's sake.** Reaching for a different
   component on every slide is what makes lessons feel like a "forced random test."
   Plain, well-laid-out text slides are the default and are good.

If the user hasn't specified something (a layout, an image, whether to add a
check), prefer the **simplest faithful rendering** and ask rather than guess when
it materially changes the lesson.

`SKILL_DIR` below = wherever this skill folder lives on your machine
(`…/run-slide-lesson-generator`). The driver is `SKILL_DIR/generate-slides.mjs`.

## Prerequisites

- **Node 18+** (zero dependencies). Verified on Node v24.
- **Google Chrome / Chromium** — only for the optional verify/screenshot step.
- **`zip`** on PATH (preinstalled on macOS/Linux).

## Make a lesson (main path)

1. Make a folder for the lesson and put its media in an `assets/` subfolder:

   ```bash
   mkdir -p ~/Lessons/my-lesson/assets
   # copy your images / audio / video into ~/Lessons/my-lesson/assets/
   ```

2. Create `lesson.json` in that folder (see **Spec format** below).

3. From inside the folder, run the generator with output `.` (the current folder):

   ```bash
   cd ~/Lessons/my-lesson
   node "/path/to/run-slide-lesson-generator/generate-slides.mjs" lesson.json .
   ```

It prints the package dir, the `.zip` to upload to your LMS, and a `file://`
preview URL — all written **into your lesson folder** next to `lesson.json`.
`src`/`poster` paths in the spec are resolved relative to the spec file, so keep
them like `assets/cover.jpg`.

### Spec format

```jsonc
{
  "title": "My Lesson",                  // required — shown in the title bar
  "description": "…",                    // optional
  "color": "#008181",                    // optional — accent; overrides the template accent
  "template": "bold-poster",             // optional — a visual design (see Visual templates)
  "slug": "my-lesson",                   // optional — output folder/zip name
  "slides": [                             // required — one entry per slide
    {
      "layout": "cover",                  // optional: "cover" | "section" | "split" | "default"
      "eyebrow": "Lesson",                // optional pill label above the title
      "title": "Slide title",             // optional
      "imageSide": "right",               // optional, split layout: "right" (default) | "left"
      "number": "01",                     // optional, "section" layout only (defaults to slide #)
      "blocks": [ /* composed layout, top to bottom */
        { "type": "image", "src": "assets/cover.jpg", "caption": "…" },
        { "type": "paragraph", "text": "…" }
      ]
    }
  ]
}
```

Copy-paste starter (save as `lesson.json`, then add your own slides). Note it's
**all plain content** — no quiz by default. Add a `knowledgeCheck` only if you
actually want to assess something (see *Authoring rules*):

```json
{
  "title": "My Lesson",
  "slides": [
    { "title": "Welcome", "blocks": [
      { "type": "paragraph", "text": "Introduce the lesson here." }
    ] },
    { "title": "Key idea", "blocks": [
      { "type": "statement", "text": "The one thing to remember." }
    ] }
  ]
}
```

A slide is a **composed layout**: stack as many `blocks` as you want; they render
top-to-bottom.

**Slide layouts** (set `layout`, or rely on the defaults):
- `cover` — big display title + framed hero image on the right; a `paragraph`
  becomes the subtitle. Auto-applied to slide 1.
- `section` — full-bleed divider with a giant `number` + title. Use between parts.
- `split` — **text on one side, image on the other, side by side** (no scrolling).
  Set `imageSide` to `"left"` or `"right"` (default). **Auto-applied** to any
  `default` slide that has both an image and text, so a slide with an `image`
  block + text blocks renders them next to each other instead of stacking.
- `default` — eyebrow pill + bold heading, then the blocks. Auto-applied to the rest.

**Design system** (the *default* look when no `template` is set): warm
cream stage with decorative geometric shapes (their color cycles per slide),
bundled **Poppins** (display) + **Inter** (body) fonts under
`template/scormcontent/fonts/`, the bundled **Lucide** icon set (see Icons below),
brand-accent pills/buttons, `statement` rendered
as a color block, images framed with an offset accent shape, and cards/shadows on
quizzes, accordions, tabs, and flashcards. Accent = `color` (default brand #008181).
Set a `template` to swap this for one of 34 distinct designs — see **Visual
templates** below.

### Visual templates (34 designs, offline)

By default every lesson uses the cream design above. To make a lesson **look
different**, set `"template": "<slug>"` in the spec. Each template is a
**hand-authored skin that recreates a specific design system's whole visual
identity** — its own background/texture (CRT scanlines, graph-paper grid, paper
grain, glow, window chrome…), eyebrow/label style, list-bullet glyph, card/panel
treatment, button style, borders, radius, and signature decorative marks — read
from that design's spec. e.g. `retro-windows` renders every slide as a Win95
window; `8-bit-orbit` is a navy CRT with a cyan grid + pixel shadows; `bold-poster`
is tilted Shrikhand with red em-dash bullets. The generic floating shapes only
appear on the default (no-template) look — never on a template.

The fixed-frame layout, navigation chrome, block renderers, and SCORM behavior
stay identical across all of them: a lesson renders the same *structurally* in any
template; only the visual identity changes.

- **List them:** `node generate-slides.mjs --list-templates` (prints each slug,
  light/dark scheme, and a one-line tagline). A few examples: `bold-poster`
  (editorial Shrikhand + red), `blue-professional` (cobalt on cream),
  `8-bit-orbit` (neon arcade on navy), `pink-script` (black + serif + magenta),
  `daisy-days` (rounded playful), `editorial-tri-tone`, `monochrome`, `studio`.
- **Fonts are bundled offline.** Each template's web fonts (Shrikhand, Bebas Neue,
  Space Grotesk, …) are vendored as woff2; the generator copies **only the chosen
  template's fonts** into the package, so it stays small and works with no
  internet inside an LMS — same guarantee as the default.
- **`color` still wins.** If you also set `color`, it overrides the template's
  accent; otherwise the template's own accent drives the deck.
- **What a template does *not* change:** the type scale and layout are tuned so a
  slide fits the frame without scrolling — templates intentionally don't alter
  that. If content overflows, split the slide (same rule as the default).
- **Scope:** a template is per-lesson (one design for the whole deck), set once in
  the spec. Pick one that matches the lesson's tone; don't switch designs
  per-slide.

Each template = a row in `template/themes/index.json` (palette + font tokens, auto-
derived) **plus** a hand-authored skin at `template/themes/skins/<slug>.css` (the
visual identity). Fonts live in `template/themefonts/`. See **Regenerating
templates** at the end.

**Motion** (baked into the player, automatic — nothing to author): on every slide
the blocks **stagger in** (fade + lift, spring easing, cascading top-to-bottom);
cover art and section numbers **scale in**; the decorative shapes **float/bob**
continuously for a living background. All of it respects
`prefers-reduced-motion` (motion off for users who ask for it). The cascade
replays each time a slide is shown, so navigating forward/back re-animates.

### Block types (all rendered by the player — verified)

These are **available** components, not required ones. Most slides need only
`heading`/`paragraph`/`list`/`image`. The interactive types (`accordion`, `tabs`,
`flashcards`, `sorting`, `timeline`, `knowledgeCheck`) are **opt-in** — use them
only when the user asks or their content is genuinely that shape (see *Authoring
rules* above).

| `type` | Fields |
|---|---|
| `heading`, `subheading` | `heading` (or `text`) |
| `paragraph`, `statement`, `note` | `text` (HTML allowed) |
| `quote` | `text`, `attribution` |
| `list` | `style`: `bulleted` \| `numbered` \| `checkbox`; `items: [html, …]` |
| `divider` | — |
| `icon` | `name` (Lucide name); `label`, `size` (px or CSS), `color`, `align: "left"`, `plain: true` |
| `iconList` | `items: [{icon, title, text}]`; `columns: 2` for a two-up grid |
| `image` | `src`, `alt`, `caption` |
| `gallery` | `images: [{src, alt}]` (2–3 col grid) |
| `audio`, `video` | `src` (+ `poster` for video) |
| `code` | `code`, `language` |
| `button` | `label`, `url`, `icon` (optional leading Lucide icon) |
| `accordion`, `tabs` | `items: [{title, text}]` |
| `flashcards` | `cards: [{front, back}]` (click to flip, in-card carousel) |
| `sorting` | `piles: [name, …]`, `cards: [{text, pile}]` (drag-and-drop, self-grades) |
| `timeline` | `events: [{date, title, text}]` |
| `knowledgeCheck` | `kind`: `multipleChoice` \| `multipleResponse` \| `fillBlank`; `question`; `answers: [{text, correct, feedback}]` (or `answer` for fillBlank) |

Knowledge-check results are tallied and reported to the LMS as a score on the
last slide (see SCORM below). An unknown `type` renders an inline notice instead
of breaking the slide.

### Icons (bundled Lucide set — works offline)

The skill ships the full **[Lucide](https://lucide.dev)** icon set (1,737 icons,
ISC license) vendored under `template/icons/`. Icons are inline SVG that inherit
the surrounding text **color** and **size** (`stroke="currentColor"`, sized to
`1em`). The generator bundles **only the icons a lesson actually references** into
a tiny `scormcontent/icons.js`, so packages stay small and need **no internet** —
they render the same over `file://` and inside an LMS.

Three ways to use an icon (reference it by its Lucide name, e.g. `rocket`,
`graduation-cap`, `lightbulb`):

- **Inline, anywhere HTML is allowed** (paragraphs, list items, headings, quotes,
  statements, tabs, accordions, flashcards) — drop `<i data-icon="rocket"></i>`
  into the text. It flows with the words and takes their color/size.
  ```json
  { "type": "paragraph", "text": "Ready for liftoff <i data-icon=\"rocket\"></i>" }
  ```
- **`icon` block** — a standalone, centered icon in a tinted rounded badge with an
  optional `label`. Add `"plain": true` for the bare glyph (no badge),
  `"align": "left"` to lay the label beside it, or `size`/`color` to override.
  ```json
  { "type": "icon", "name": "lightbulb", "label": "Key idea" }
  ```
- **`iconList` block** — icon + title + text rows (a feature/benefit list); set
  `"columns": 2` for a two-up grid.
  ```json
  { "type": "iconList", "columns": 2, "items": [
    { "icon": "brain", "title": "Think", "text": "Reason it through." },
    { "icon": "target", "title": "Aim", "text": "Set a clear goal." }
  ] }
  ```

`button` also takes an optional leading `icon`.

**Finding a name:** browse [lucide.dev/icons](https://lucide.dev/icons), or search
the bundled `template/icons/lucide-tags.json` (maps each name to keywords, e.g.
`graduation-cap` → school, university, learn, study). An unknown name is **skipped
silently** (the generator prints a `⚠ unknown icon name(s)` warning) — it never
breaks the slide.

## Preview / verify it renders

Open the preview URL the generator printed in any browser — it runs standalone
over `file://`, no LMS or server needed. Jump to a specific slide with `#sN`
(e.g. `…/index.html#s3`).

To screenshot a slide headlessly (the player supports `#sN` deep-links):

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="file://$HOME/Lessons/my-lesson/my-lesson/scormcontent/index.html"
for s in 1 2 3; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=4000 \
    --window-size=1000,720 --screenshot="/tmp/slide-$s.png" "$BASE#s$s"
done
```

(`my-lesson/my-lesson/…` = the `slug` folder created inside your lesson folder.)
Headless screenshots can't click, so to test a quiz/flashcard/sort interaction,
just open the preview URL in a real browser.

## SCORM behavior

- Launches via `scormdriver/indexAPI.html` (the same proven Rustici driver the
  Rise export uses). The player calls the driver's helpers
  (`SetReachedEnd`, `SetScore`, `SetPassed`/`SetFailed`, `CommitData`, `Finish`)
  guarded by `typeof` checks, so it also runs over `file://` with no LMS.
- **Completion** fires when the learner reaches the last slide.
- **Score**: each knowledge-check counts once; `correct / total` is sent on the
  last slide; ≥ 50% is reported as passed.

## Gotchas

- **Renders over `file://` directly** — no server needed. `scormcontent/index.html`
  is a self-contained player; just open it (or `#s3` for slide 3).
- **Headless screenshots can't click**, so use `#sN` to jump to a slide. To check
  a quiz/flashcard/sort interaction, open the preview URL in a real browser.
- **One slide = one `slides[]` entry.** The counter is `slides.length`; it is the
  slide count, not the block count.
- **HTML in text fields is rendered as-is** (`<strong>`, `<em>`, emoji). Don't
  paste untrusted HTML.
- **Slides never scroll by design** — content is laid out to fit the frame. An
  image + text slide auto-renders as a `split` (side-by-side) layout. If a slide
  still has too much content to fit, **split it into two slides** rather than
  cramming it — overflow is clipped, not scrolled.
- **Unknown `type`** shows an inline "Unknown component" note rather than blanking
  the slide (the player try/catches every block).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ERROR: asset not found: <path>` | `src`/`poster` resolve relative to the **spec file**. Fix the path. |
| `ERROR: spec.slides must be a non-empty array` | Add at least one slide. |
| Blank slide / "Unknown component" note | Check the block `type` against the table above. |
| Buttons/counter missing | You opened a raw block, not `scormcontent/index.html`. Open the player page. |
| `Chrome/Chromium not found` | Set `CHROME=/path/to/chrome` before the screenshot step. |

## How it works (1 paragraph)

`generate-slides.mjs` serializes `{title, color, slides}` into a `<script type=
"application/json">` inside
[template/scormcontent/index.html.tmpl](.claude/skills/run-slide-lesson-generator/template/scormcontent/index.html.tmpl),
copies
[player.js](.claude/skills/run-slide-lesson-generator/template/scormcontent/player.js)
(the fixed-frame UI + all block renderers + SCORM calls), the bundled `fonts/`,
and the `scormdriver/` shell, repaths/copies referenced assets, writes an
`icons.js` holding just the Lucide icons the lesson references, writes the SCORM
`imsmanifest.xml`, and zips. When a `template` is set it also injects that theme's
`@font-face` rules, a `:root` palette/font override, **and the theme's hand-authored
skin** (`template/themes/skins/<slug>.css`) into the page, hides the default deco,
and copies the theme's woff2. The frame, navigation, and block renderers live
entirely in `player.js`, which is why every generated lesson **behaves** the same;
the skin changes only how it **looks**.

## Regenerating templates (maintenance)

The 34 templates are derived from the **bold-template-pack** design systems
(`templates/<slug>/design.md`). `build-themes.mjs` parses each one's palette +
typography, maps them onto the player's role variables, and downloads the
required Google Fonts as woff2 for offline use:

```bash
# from the skill folder, pointing at the bold-template-pack
node build-themes.mjs /path/to/bold-template-pack --fonts
```

This writes `template/themes/index.json` (theme tokens) and
`template/themefonts/` (deduped woff2 + `manifest.json`). Omit `--fonts` to
re-derive tokens only (no network).

The **visual identity** of each template is NOT auto-generated — it lives in a
hand-authored skin at `template/themes/skins/<slug>.css`, written by reading that
template's `design.md` and recreating its real decorative + component vocabulary
against the player's class contract. A skin may even override `--accent` /
`--on-accent` in its own `:root` when the design's true primary color differs from
the auto-picked one. To add a new template: add its tokens (run `build-themes.mjs`)
and author a matching skin file. Normal lesson generation just reads the committed
output — you only run this to add/refresh templates.
