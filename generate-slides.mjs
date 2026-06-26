#!/usr/bin/env node
// generate-slides.mjs — package a slide-based lesson as a SCORM 1.2 zip.
//
//   node generate-slides.mjs <slide-spec.json> [out-dir]
//
// Produces:  <out-dir>/<slug>/        (unzipped, open scormcontent/index.html via file://)
//            <out-dir>/<slug>.zip     (upload to an LMS)
//
// Unlike the Rise generator, this uses our OWN player (template/scormcontent/
// player.js): a fixed frame with Prev/Next + an "N / Total" counter, the same on
// every slide and every lesson. We just serialize the spec into the player and
// copy the SCORM driver shell around it. See SKILL.md for the spec format.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(__dirname, "template");

function die(m) { console.error("ERROR: " + m); process.exit(1); }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lesson"; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function cp(s, d) { fs.cpSync(s, d, { recursive: true }); }

// ---- theme (visual template) -----------------------------------------------
// A theme re-skins the player: palette + font roles + radius + surface tints +
// decorative vocabulary. It does NOT touch the layout/type-scale (which is tuned
// to fit the fixed frame). Themes live in template/themes/index.json with their
// woff2 in template/themefonts/ — built by build-themes.mjs from the bold pack.
function relLum(hex) {
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return 1;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function loadThemes() {
  const p = path.join(TEMPLATE, "themes", "index.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}
function buildTheme(slug) {
  const empty = { fontFaces: "", themeCss: "", fontFiles: [], accent: null };
  if (!slug) return empty;
  const themes = loadThemes();
  const t = themes[slug];
  if (!t) die(`unknown template "${slug}". available: ${Object.keys(themes).sort().join(", ")}`);
  const manPath = path.join(TEMPLATE, "themefonts", "manifest.json");
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, "utf8")) : {};

  // @font-face for each bundled (family, weight) the theme uses; collect files.
  const faces = [];
  const files = new Set();
  for (const role of ["display", "body", "mono"]) {
    const f = t.fonts && t.fonts[role];
    if (!f || !f.google) continue;
    for (const w of f.weights || []) {
      const file = man[f.family + "|" + w];
      if (!file) continue;
      faces.push(`@font-face{font-family:'${f.family}';src:url('fonts/${file}') format('woff2');font-weight:${w};font-display:swap;}`);
      files.add(file);
    }
  }

  const c = t.colors || {};
  // text on accent fills must contrast with the ACCENT, not reuse the theme ink
  // (a dark theme's ink is light, which would vanish on a light accent).
  const onAccent = relLum(c.accent) > 0.55 ? "#15130f" : "#ffffff";
  const stack = (role, fb) => { const f = t.fonts && t.fonts[role]; return f ? (f.stack || `'${f.family}', ${fb}`) : null; };
  const vars = [
    c.accent && `--accent:${c.accent};`, c.ink && `--ink:${c.ink};`, c.bg && `--bg:${c.bg};`,
    c.paper && `--paper:${c.paper};`, c.line && `--line:${c.line};`, c.muted && `--muted:${c.muted};`,
    stack("display", "system-ui,sans-serif") && `--display:${stack("display", "system-ui,sans-serif")};`,
    stack("body", "system-ui,sans-serif") && `--body:${stack("body", "system-ui,sans-serif")};`,
    stack("mono", "ui-monospace,monospace") && `--mono:${stack("mono", "ui-monospace,monospace")};`,
    `--on-accent:${onAccent};`, t.radius && `--r:${t.radius};`,
  ].filter(Boolean).join("");

  // A theme's real visual identity lives in a hand-authored skin that recreates
  // its design.md's decorative + component vocabulary (backgrounds, borders,
  // bullets, cards, chrome). The generic floating shapes are always hidden for a
  // template — each skin paints its own background.
  const skinPath = path.join(TEMPLATE, "themes", "skins", slug + ".css");
  const skin = fs.existsSync(skinPath) ? fs.readFileSync(skinPath, "utf8") : "";
  const themeCss = `:root{${vars}}\n.deco{display:none !important;}\n${skin}`;

  return { fontFaces: faces.join("\n"), themeCss, fontFiles: [...files], accent: c.accent || null };
}

const specPath = process.argv[2];
// `--list-templates` prints the available visual templates and exits.
if (specPath === "--list-templates") {
  const themes = loadThemes();
  const names = Object.keys(themes).sort();
  if (!names.length) die("no templates built yet — run build-themes.mjs");
  for (const n of names) console.log(`${n.padEnd(20)} ${themes[n].scheme.padEnd(6)} ${themes[n].tagline || ""}`);
  process.exit(0);
}
const outDir = path.resolve(process.argv[3] || path.join(process.cwd(), "dist"));
if (!specPath) die("usage: node generate-slides.mjs <slide-spec.json> [out-dir]   (or --list-templates)");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const specDir = path.dirname(path.resolve(specPath));
if (!spec.title) die("spec.title is required");
if (!Array.isArray(spec.slides) || !spec.slides.length) die("spec.slides must be a non-empty array");

// Resolve the visual template/theme (optional). spec.color, if given, always
// wins over the theme's accent; otherwise the theme's accent drives the deck.
const theme = buildTheme(spec.template);
const accent = spec.color || theme.accent || "#008181";

// ---- collect + repath referenced assets (src/poster/images[].src) ----------
const assetMap = new Map(); // abs -> assets/<folder>/<file>
let folderN = 0;
function pack(rel) {
  if (!rel || /^https?:\/\//.test(rel)) return rel;
  const abs = path.isAbsolute(rel) ? rel : path.join(specDir, rel);
  if (!fs.existsSync(abs)) die(`asset not found: ${rel} (resolved ${abs})`);
  if (!assetMap.has(abs)) assetMap.set(abs, `assets/a${folderN++}_${path.basename(abs)}`);
  return assetMap.get(abs);
}
function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk);
  if (node && typeof node === "object") {
    for (const k of ["src", "poster"]) if (typeof node[k] === "string") node[k] = pack(node[k]);
    for (const v of Object.values(node)) walk(v);
  }
}
walk(spec.slides);

// ---- collect icon references (bundled offline, used-only) -------------------
// Icons come from the vendored Lucide set (template/icons/lucide-icons.json).
// Authors reference them two ways: an "icon"/"name" field on icon-bearing blocks,
// or inline anywhere HTML is allowed via <i data-icon="rocket"></i>. We scan the
// spec for both and ship ONLY the referenced icons, so packages stay small.
const ICONS_ALL = JSON.parse(fs.readFileSync(path.join(TEMPLATE, "icons", "lucide-icons.json"), "utf8"));
const usedIcons = new Set();
const missingIcons = new Set();
function noteIcon(name) {
  if (typeof name !== "string" || !name) return;
  if (Object.prototype.hasOwnProperty.call(ICONS_ALL, name)) usedIcons.add(name);
  else missingIcons.add(name);
}
function scanIcons(node) {
  if (Array.isArray(node)) return node.forEach(scanIcons);
  if (node && typeof node === "object") {
    if (node.type === "icon" && typeof node.name === "string") noteIcon(node.name);
    if (typeof node.icon === "string") noteIcon(node.icon);
    return Object.values(node).forEach(scanIcons);
  }
  if (typeof node === "string") {
    let m; const re = /data-icon=["']([^"']+)["']/g;
    while ((m = re.exec(node))) noteIcon(m[1]);
  }
}
scanIcons(spec.slides);

// ---- write package ---------------------------------------------------------
const slug = slugify(spec.slug || spec.title);
const pkg = path.join(outDir, slug);
fs.rmSync(pkg, { recursive: true, force: true });
fs.mkdirSync(path.join(pkg, "scormcontent", "assets"), { recursive: true });

cp(path.join(TEMPLATE, "scormdriver"), path.join(pkg, "scormdriver"));
cp(path.join(TEMPLATE, "scormcontent", "player.js"), path.join(pkg, "scormcontent", "player.js"));
cp(path.join(TEMPLATE, "scormcontent", "fonts"), path.join(pkg, "scormcontent", "fonts"));
// bundle only the selected theme's woff2 alongside the default fonts (offline)
for (const file of theme.fontFiles) {
  cp(path.join(TEMPLATE, "themefonts", file), path.join(pkg, "scormcontent", "fonts", file));
}
for (const f of fs.readdirSync(TEMPLATE)) if (f.endsWith(".xsd")) cp(path.join(TEMPLATE, f), path.join(pkg, f));

for (const [abs, key] of assetMap) {
  const dst = path.join(pkg, "scormcontent", key);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(abs, dst);
}

// Ship a tiny icons.js with only the referenced Lucide icons (name -> inner SVG).
const iconSubset = {};
for (const n of usedIcons) iconSubset[n] = ICONS_ALL[n];
fs.writeFileSync(
  path.join(pkg, "scormcontent", "icons.js"),
  "/* Lucide icons (ISC) — bundled subset for this lesson. */\nwindow.__ICONS__=" + JSON.stringify(iconSubset) + ";\n"
);
if (missingIcons.size) console.warn("⚠ unknown icon name(s) ignored: " + [...missingIcons].join(", "));

// player.js sets --accent inline from LESSON.color, which would beat the injected
// theme/skin CSS. So only pass color when the USER set one explicitly; for a
// template (no user color) let the injected :root + skin own --accent (a skin may
// legitimately override it, e.g. when the design's true accent differs).
const lessonColor = spec.color || (spec.template ? "" : accent);
const lessonJson = JSON.stringify({ title: spec.title, color: lessonColor, slides: spec.slides });
let html = fs.readFileSync(path.join(TEMPLATE, "scormcontent", "index.html.tmpl"), "utf8");
html = html
  .replace("__LESSON_TITLE__", esc(spec.title))
  .replace("__ACCENT__", accent)
  .replace("__FONT_FACES__", theme.fontFaces)
  .replace("__THEME_CSS__", theme.themeCss)
  // JSON sits inside a <script type=application/json> — only </script> needs neutralizing
  .replace("__LESSON_JSON__", lessonJson.replace(/<\//g, "<\\/"));
fs.writeFileSync(path.join(pkg, "scormcontent", "index.html"), html);

fs.writeFileSync(path.join(pkg, "imsmanifest.xml"), manifest(pkg, spec.title));
fs.writeFileSync(path.join(pkg, "metadata.xml"), metadata(spec.title, spec.description || ""));

const zip = path.join(outDir, slug + ".zip");
fs.rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-q", "-X", zip, "."], { cwd: pkg });

console.log("✓ package dir : " + pkg);
console.log("✓ scorm zip   : " + zip);
console.log("✓ preview     : file://" + path.join(pkg, "scormcontent", "index.html"));
console.log("  slides      : " + spec.slides.length + " | assets: " + assetMap.size + " | icons: " + usedIcons.size +
  (spec.template ? " | template: " + spec.template : ""));

// ---- helpers ---------------------------------------------------------------
function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}
function manifest(pkg, title) {
  const files = listFiles(pkg).filter((f) => f !== "imsmanifest.xml").map((f) => `      <file href="${f}" />`).join("\n");
  const id = "SLIDE_" + slug.replace(/-/g, "_");
  return `<?xml version="1.0" ?>
<manifest identifier="${id}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion><adlcp:location>metadata.xml</adlcp:location></metadata>
  <organizations default="slide_lesson">
    <organization identifier="slide_lesson">
      <title>${esc(title)}</title>
      <item identifier="i1" identifierref="r1" isvisible="true">
        <title>${esc(title)}</title>
        <adlcp:datafromlms>datafromlms</adlcp:datafromlms>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="scormdriver/indexAPI.html">
${files}
    </resource>
  </resources>
</manifest>
`;
}
function metadata(title, desc) {
  return `<?xml version="1.0" encoding="utf-8"?>
<lom xmlns="http://ltsc.ieee.org/xsd/LOM"><general><title><string language="en">${esc(title)}</string></title><description><string language="en">${esc(desc)}</string></description></general><technical><format>text/html</format></technical></lom>
`;
}
