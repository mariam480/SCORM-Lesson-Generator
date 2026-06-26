# SCORM Lesson Generator (Slide format)

A Claude Code **skill** that generates an educational lesson in **SLIDE format** as a
**SCORM 1.2 package** — a fixed (non-scrolling) frame with `‹ Back` / `Next ›` buttons,
an `N / Total` slide counter, and a top progress bar that stay identical on every slide
and across every lesson.

The author writes a JSON slide spec; a custom player renders all components, so the
frame stays consistent no matter what's on a slide. Supported slide components include
text, lists, images, icons (the bundled offline [Lucide](https://lucide.dev) set),
audio/video, accordion, tabs, flashcards, drag-to-sort, timeline, code, and graded
knowledge-check quizzes.

**34 visual templates.** Set `"template": "<slug>"` in the spec to re-skin a lesson
with one of 34 distinct designs (palette, fonts, surfaces, decorative vocabulary) —
e.g. `bold-poster`, `blue-professional`, `8-bit-orbit`, `pink-script`. Each template's
fonts are bundled offline as woff2, so packages stay self-contained. The layout,
navigation, and SCORM behavior are identical across templates; only the look changes.
List them with `node generate-slides.mjs --list-templates`.

## Contents

- **`SKILL.md`** — the skill definition and full authoring guide (spec format, components, examples).
- **`generate-slides.mjs`** — the zero-dependency Node generator that builds the SCORM package.
- **`build-themes.mjs`** — maintenance script that derives the 34 templates (palette/fonts) from the bold-template-pack design systems and bundles their fonts offline.
- **`template/`** — the SCORM runtime: `scormdriver/` (SCORM 1.2 driver), `scormcontent/` player, the IMS/ADL XSD schemas, `icons/` (the vendored Lucide icon set), `themes/` (the 34 template definitions + per-theme skins), and `themefonts/` (the offline woff2 fonts they use).

## Prerequisites

- **Node 18+** (zero dependencies; verified on Node 24)
- **`zip`** on PATH (preinstalled on macOS/Linux)
- **Google Chrome / Chromium** — only for the optional verify/screenshot step

## Quick start

```bash
mkdir -p ~/Lessons/my-lesson/assets
# copy your images / audio / video into ~/Lessons/my-lesson/assets/
# create lesson.json (see SKILL.md → Spec format)

cd ~/Lessons/my-lesson
node /path/to/run-slide-lesson-generator/generate-slides.mjs lesson.json .
```

The generator writes the package, the `.zip` to upload to your LMS, and a `file://`
preview URL — all next to your `lesson.json`. Nothing is ever written inside the skill.

See **[SKILL.md](SKILL.md)** for the complete authoring guide.
# SCORM-Lesson-Generator
