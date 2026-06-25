---
name: run-slide-lesson-generator
description: Generate an educational lesson in SLIDE format as a SCORM 1.2 package — a fixed (non-scrolling) frame with Back/Next buttons and an "N / Total" slide counter, consistent across every slide and lesson. Use when asked to build, create, generate, author, package, run, preview, or screenshot a slide-based / presentation-style / paginated lesson (NOT the scrollable Rise format). Each slide is a composed layout (title + visuals + text + optional interaction) and supports text, lists, images, audio/video, accordion, tabs, flashcards, drag-to-sort, timeline, code, and graded knowledge-check quizzes.
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
  "color": "#008181",                    // optional — accent; defaults to the brand color
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

Copy-paste starter (save as `lesson.json`, then add your own slides):

```json
{
  "title": "My Lesson",
  "slides": [
    { "title": "Welcome", "blocks": [
      { "type": "paragraph", "text": "Introduce the lesson here." }
    ] },
    { "title": "Key idea", "blocks": [
      { "type": "statement", "text": "The one thing to remember." }
    ] },
    { "eyebrow": "Quick check", "title": "Check understanding", "blocks": [
      { "type": "knowledgeCheck", "kind": "multipleChoice", "question": "Pick the right answer.",
        "answers": [ { "text": "Right", "correct": true }, { "text": "Wrong", "correct": false } ] }
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

**Design system** (baked into the player, consistent across all lessons): warm
cream stage with decorative geometric shapes (their color cycles per slide),
bundled **Poppins** (display) + **Inter** (body) fonts under
`template/scormcontent/fonts/`, brand-accent pills/buttons, `statement` rendered
as a color block, images framed with an offset accent shape, and cards/shadows on
quizzes, accordions, tabs, and flashcards. Accent = `color` (default brand #008181).

### Block types (all rendered by the player — verified)

| `type` | Fields |
|---|---|
| `heading`, `subheading` | `heading` (or `text`) |
| `paragraph`, `statement`, `note` | `text` (HTML allowed) |
| `quote` | `text`, `attribution` |
| `list` | `style`: `bulleted` \| `numbered` \| `checkbox`; `items: [html, …]` |
| `divider` | — |
| `image` | `src`, `alt`, `caption` |
| `gallery` | `images: [{src, alt}]` (2–3 col grid) |
| `audio`, `video` | `src` (+ `poster` for video) |
| `code` | `code`, `language` |
| `button` | `label`, `url` |
| `accordion`, `tabs` | `items: [{title, text}]` |
| `flashcards` | `cards: [{front, back}]` (click to flip, in-card carousel) |
| `sorting` | `piles: [name, …]`, `cards: [{text, pile}]` (drag-and-drop, self-grades) |
| `timeline` | `events: [{date, title, text}]` |
| `knowledgeCheck` | `kind`: `multipleChoice` \| `multipleResponse` \| `fillBlank`; `question`; `answers: [{text, correct, feedback}]` (or `answer` for fillBlank) |

Knowledge-check results are tallied and reported to the LMS as a score on the
last slide (see SCORM below). An unknown `type` renders an inline notice instead
of breaking the slide.

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
and the `scormdriver/` shell, repaths/copies referenced assets, writes the SCORM
`imsmanifest.xml`, and zips. The frame and navigation live entirely in `player.js`, which is why every
generated lesson looks and behaves the same.
