#!/usr/bin/env node
/* build-themes.mjs — turn the bold-template-pack design systems into themes.
 *
 *   node build-themes.mjs <path-to-bold-template-pack> [--fonts]
 *
 * Reads every templates/<slug>/design.md, extracts its palette + typography +
 * radius from the YAML frontmatter, maps them onto the slide player's role
 * variables, and writes:
 *
 *   template/themes/index.json   — one theme record per template, consumed by
 *                                  generate-slides.mjs at package time.
 *
 * With --fonts it also resolves every Google-Font (family, weight) the themes
 * reference, downloads the woff2 once into template/themefonts/, and records a
 * font manifest so the generator can bundle ONLY a chosen theme's fonts offline.
 *
 * Design note: themes change palette + typography + surfaces + radius + deco —
 * NOT the layout or type scale. The base layout in index.html.tmpl is tuned so
 * a slide fits the fixed frame without scrolling; we keep that and re-skin it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK = path.resolve(process.argv[2] || "");
const WANT_FONTS = process.argv.includes("--fonts");
if (!PACK || !fs.existsSync(path.join(PACK, "templates"))) {
  console.error("usage: node build-themes.mjs <path-to-bold-template-pack> [--fonts]");
  process.exit(1);
}
const TEMPLATES_DIR = path.join(PACK, "templates");
const OUT_DIR = path.join(__dirname, "template", "themes");
const FONT_DIR = path.join(__dirname, "template", "themefonts");

// ---- minimal frontmatter reader -------------------------------------------
// The design.md frontmatter is 2-space-indented YAML-ish. We don't need a full
// YAML parser — just colors (flat key:"#hex"), typography (token -> {fontFamily…})
// canvas.background, and any borderRadius hints in components.
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : "";
}
function indent(line) { return line.match(/^( *)/)[1].length; }
function unquote(v) {
  v = v.trim();
  if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}
// Parse a nested block under `key:` at the given parent indent into a JS object
// of {childKey: {prop: value}} (two levels) OR {childKey: value} (one level).
function blockLines(fmLines, headerIdx) {
  const base = indent(fmLines[headerIdx]);
  const out = [];
  for (let i = headerIdx + 1; i < fmLines.length; i++) {
    const ln = fmLines[i];
    if (ln.trim() === "") continue;
    if (indent(ln) <= base) break;
    out.push(ln);
  }
  return out;
}
function parseFlatMap(lines) {
  const o = {};
  for (const ln of lines) {
    const m = ln.match(/^\s*([A-Za-z0-9_-]+):\s*(.+)$/);
    if (m) o[m[1]] = unquote(m[2]);
  }
  return o;
}
function parseTypography(lines) {
  // token lines at the shallowest indent; their props nested deeper.
  const o = {};
  const tokenIndent = Math.min(...lines.filter((l) => l.trim()).map(indent));
  let cur = null;
  for (const ln of lines) {
    if (!ln.trim()) continue;
    if (indent(ln) === tokenIndent) {
      const m = ln.match(/^\s*([A-Za-z0-9_-]+):\s*$/);
      if (m) { cur = m[1]; o[cur] = {}; }
      else cur = null;
    } else if (cur) {
      const m = ln.match(/^\s*([A-Za-z0-9_-]+):\s*(.+)$/);
      if (m) o[cur][m[1]] = unquote(m[2]);
    }
  }
  return o;
}

function extract(md) {
  const fm = frontmatter(md);
  const lines = fm.split("\n");
  const res = { colors: {}, typography: {}, canvasBg: null, radius: null };
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^([A-Za-z0-9_-]+):\s*$/);
    if (!head) continue;
    if (head[1] === "colors") res.colors = parseFlatMap(blockLines(lines, i));
    else if (head[1] === "typography") res.typography = parseTypography(blockLines(lines, i));
    else if (head[1] === "canvas") {
      const cv = parseFlatMap(blockLines(lines, i));
      res.canvasBg = cv.background || cv.bg || null;
    } else if (head[1] === "components") {
      // scan for the first concrete borderRadius value among component defs
      for (const ln of blockLines(lines, i)) {
        const m = ln.match(/borderRadius:\s*(.+)$/);
        if (m) { const v = unquote(m[1]); if (!res.radius && /\d/.test(v)) res.radius = v; }
      }
    }
  }
  return res;
}

// ---- color helpers --------------------------------------------------------
function resolveColorRef(v, colors) {
  // values can be "{colors.red}" refs or raw hex
  const m = String(v).match(/\{colors\.([A-Za-z0-9_-]+)\}/);
  if (m) return colors[m[1]] || null;
  return /^#|^rgb|^hsl/.test(String(v).trim()) ? String(v).trim() : null;
}
function toHex(c) {
  if (!c) return null;
  c = c.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : null;
}
function lum(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function sat(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === 0) return 0;
  return (mx - mn) / mx;
}

// ---- role mapping ---------------------------------------------------------
// Names are matched as whole tokens of the color key (split on non-alnum), so
// "ink" matches "ink-deep" but not "pink-light".
const BG_NAMES = ["bg", "background", "canvas", "base", "ground", "void", "backdrop", "stage"];
const INK_NAMES = ["ink", "text", "dark", "black", "charcoal", "graphite", "foreground", "fg"];
const SURFACE_NAMES = ["surface", "card", "panel", "paper", "light", "offwhite", "cream", "tint", "soft", "alt", "2", "3"];
function keyTokens(k) { return k.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
function nameHit(k, names) { const tk = keyTokens(k); return names.some((n) => tk.includes(n)); }

function allHex(colors) {
  const o = {};
  for (const k of Object.keys(colors)) { const hx = toHex(colors[k]); if (hx) o[k] = hx; }
  return o;
}
function rgb(hex) { let h = hex.replace("#", ""); if (h.length === 3) h = h.split("").map((x) => x + x).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function dist(a, b) { const x = rgb(a), y = rgb(b); return Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0)) / 255; }
function mix(hex, withHex, amt) {
  const a = rgb(hex), b = rgb(withHex);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amt));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
function pickExact(colors, names) {
  for (const n of names) for (const k of Object.keys(colors)) if (k.toLowerCase() === n) return colors[k];
  return null;
}
function pickContains(colors, names, exclude = []) {
  // first color whose key contains any name, not in exclude
  for (const k of Object.keys(colors)) {
    const kl = k.toLowerCase();
    if (names.some((n) => kl.includes(n)) && !exclude.includes(colors[k])) return colors[k];
  }
  return null;
}
// vividness: saturated AND in a usable mid-luminance band (penalize near-black / near-white)
function vividness(hex) { const l = lum(hex); const band = Math.max(0, 1 - Math.abs(l - 0.55) * 1.15); return sat(hex) * band; }

function mapRoles(slug, scheme, ex) {
  const colors = allHex(ex.colors);
  const entries = Object.entries(colors); // [name,hex]
  const dark = scheme === "dark";

  // ---- background: canvas ref -> named bg -> scheme-extreme luminance
  let bg = toHex(resolveColorRef(ex.canvasBg, colors)) || pickExact(colors, BG_NAMES);
  if (!bg) {
    const sorted = entries.slice().sort((a, b) => lum(a[1]) - lum(b[1]));
    bg = dark ? sorted[0][1] : sorted[sorted.length - 1][1];
  }

  // ---- ink: prefer ink/text-named neutrals (not bg-prefixed) that contrast
  // strongly with bg; pick the most extreme + least-saturated to avoid a colored
  // "ink" like coral-dark. Fall back to the max luminance-distance color.
  const notBgKey = (k) => !nameHit(k, ["bg", "background", "surface", "paper", "canvas", "card"]);
  const inkCands = entries.filter(([k]) => notBgKey(k) && nameHit(k, INK_NAMES)).map((e) => e[1]);
  const inkRank = (h) => (dark ? -(lum(h)) : lum(h)) + sat(h) * 0.2; // lower = better
  let ink = inkCands.slice().sort((a, b) => inkRank(a) - inkRank(b))[0];
  if (!ink || Math.abs(lum(ink) - lum(bg)) < 0.3) {
    ink = entries.map((e) => e[1]).sort((a, b) => Math.abs(lum(b) - lum(bg)) - Math.abs(lum(a) - lum(bg)))[0];
  }

  // ---- accent: honor a named accent/primary/brand color first; else the most
  // vivid color clearly distinct from bg; else fall back to ink.
  const ACCENT_NAMES = ["accent", "primary", "brand", "cta", "highlight", "pop", "signal"];
  let accent = null;
  for (const [k, h] of entries) {
    const tk = keyTokens(k);
    if (ACCENT_NAMES.some((n) => tk.includes(n)) && !tk.some((t) => /^(light|medium|soft|faint|muted|tint|text|ink|fg|body|foreground|heading)$/.test(t)) && h !== bg && dist(h, bg) >= 0.12) { accent = h; break; }
  }
  if (!accent) {
    const vivid = entries.map((e) => e[1])
      .filter((h) => h !== bg && sat(h) >= 0.22 && dist(h, bg) >= 0.22)
      .sort((a, b) => vividness(b) - vividness(a));
    accent = vivid[0] || ink;
  }

  // ---- paper (card surface): named surface near bg luminance, else subtle tint
  let paper = null;
  for (const k of Object.keys(colors)) {
    if (nameHit(k, SURFACE_NAMES)) {
      const hx = colors[k];
      if (hx !== bg && hx !== accent && Math.abs(lum(hx) - lum(bg)) <= 0.22) { paper = hx; break; }
    }
  }
  if (!paper) paper = dark ? mix(bg, "#ffffff", 0.08) : mix(bg, "#000000", 0.035);

  const line = dark ? mix(bg, "#ffffff", 0.18) : mix(bg, "#000000", 0.12);
  const muted = mix(ink, bg, 0.42);

  return { scheme, bg, ink, accent, paper, line, muted, palette: colors };
}

// ---- font mapping ---------------------------------------------------------
function firstFamily(stack) {
  // "'Shrikhand', cursive" -> Shrikhand ; drop fallbacks + quotes
  const first = String(stack).split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  return first;
}
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "system-ui", "ui-monospace", "-apple-system"]);
function isGoogleFamily(name) {
  return name && !GENERIC.has(name.toLowerCase()) &&
    // skip obvious system fallbacks that aren't on Google Fonts
    !/^(segoe ui|ms sans serif|helvetica|arial|georgia|tahoma|geneva|verdana|menlo|consolas|courier new|sf mono|garamond|source serif pro)$/i.test(name);
}
// Display faces that are unusable for running body text (all-caps / ultra-heavy
// / pixel). If one of these lands in the body slot we swap in any readable face.
const UNREADABLE_BODY = new Set(["bebas neue", "press start 2p", "alfa slab one", "stardos stencil", "bowlby one", "big shoulders display", "archivo black", "shrikhand", "tektur"].map((s) => s.toLowerCase()));
// Token-name priority lists (matched as whole tokens). First hit wins.
const DISPLAY_PRIORITY = ["hero-title", "hero", "display", "display-statement", "section-header", "section-headline", "headline", "title", "section", "cover", "jumbo-feature", "stat-big"];
const BODY_PRIORITY = ["body", "body-card", "paragraph", "para", "prose", "copy", "text", "lead", "cite", "sub"];
const MONO_PRIORITY = ["mono", "label", "eyebrow", "kicker", "tag", "counter", "code", "caption", "chrome", "link", "bullet"];

function wrap(props) {
  return props && props.fontFamily
    ? { family: firstFamily(props.fontFamily), weight: parseInt(props.fontWeight, 10) || null, stack: props.fontFamily, isMono: /mono/i.test(props.fontFamily) }
    : null;
}
function pickFonts(typography) {
  const tokens = Object.entries(typography).filter(([, p]) => p.fontFamily);
  const byExact = (name) => { const t = tokens.find(([k]) => k.toLowerCase() === name); return t ? wrap(t[1]) : null; };
  const byToken = (name) => { const t = tokens.find(([k]) => keyTokens(k).includes(name)); return t ? wrap(t[1]) : null; };
  const pickPriority = (list) => { for (const n of list) { const a = byExact(n) || byToken(n); if (a) return a; } return null; };

  const display = pickPriority(DISPLAY_PRIORITY);
  let body = pickPriority(BODY_PRIORITY);
  // mono: prefer a token whose stack is actually monospace
  let mono = (tokens.map(([, p]) => wrap(p)).find((w) => w && w.isMono)) || pickPriority(MONO_PRIORITY);

  const anyReadable = tokens.map(([, p]) => wrap(p)).find((w) => w && !UNREADABLE_BODY.has(w.family.toLowerCase()));
  const fallback = wrap(tokens[0] && tokens[0][1]);
  body = body || display || fallback;
  // never leave an all-caps/pixel display face as the body face if a readable one exists
  if (body && UNREADABLE_BODY.has(body.family.toLowerCase()) && anyReadable) body = anyReadable;

  return { display: display || body || fallback, body, mono: mono || null };
}

// collect representative weights for a role family from all tokens using it
function weightsFor(typography, family) {
  const ws = new Set();
  for (const props of Object.values(typography)) {
    if (props.fontFamily && firstFamily(props.fontFamily) === family) {
      const w = parseInt(props.fontWeight, 10);
      if (w) ws.add(w);
    }
  }
  return ws.size ? [...ws].sort((a, b) => a - b) : [400, 700];
}

// ---- deco style heuristic --------------------------------------------------
function decoStyle(meta) {
  const mood = (meta.mood || []).join(" ").toLowerCase();
  const tone = (meta.tone || []).join(" ").toLowerCase();
  const tags = mood + " " + tone + " " + (meta.formality || "");
  if (/(editorial|minimal|formal|professional|elegant|refined|serious|corporate|legal|clean)/.test(tags)) return "none";
  if (/(playful|fun|energetic|cute|whimsical|friendly|warm)/.test(tags)) return "shapes";
  if (/(retro|pixel|arcade|cyber|neon|tech|brutal|raw|grid)/.test(tags)) return "grid";
  return "soft"; // a single understated accent shape
}

// ---------------------------------------------------------------------------
const index = JSON.parse(fs.readFileSync(path.join(PACK, "selection-index.json"), "utf8"));
const themes = {};
const fontJobs = new Map(); // "Family|weight" -> {family, weight}

for (const t of index.templates) {
  const dmPath = path.join(TEMPLATES_DIR, t.slug, "design.md");
  if (!fs.existsSync(dmPath)) { console.warn("skip (no design.md): " + t.slug); continue; }
  const ex = extract(fs.readFileSync(dmPath, "utf8"));
  const roles = mapRoles(t.slug, t.scheme || "light", ex);
  const fonts = pickFonts(ex.typography);

  // radius: explicit hint, else infer from mood (square for bold/editorial/retro)
  let radius = ex.radius;
  if (!radius) {
    const sq = decoStyle(t) === "grid" || /editorial|bold|brutal|poster|stencil|mono/.test((t.mood || []).join(" ") + t.slug);
    radius = sq ? "4px" : "18px";
  }
  // normalize radius like "22px" / "0px"
  radius = String(radius).match(/[\d.]+px|0/) ? String(radius).match(/[\d.]+px|0/)[0] : "16px";

  const fontSpec = {};
  for (const role of ["display", "body", "mono"]) {
    const f = fonts[role];
    if (!f) continue;
    const google = isGoogleFamily(f.family);
    fontSpec[role] = { family: f.family, stack: f.stack, google, weights: google ? weightsFor(ex.typography, f.family) : [] };
    if (google) for (const w of fontSpec[role].weights) fontJobs.set(f.family + "|" + w, { family: f.family, weight: w });
  }

  themes[t.slug] = {
    name: t.name,
    tagline: t.tagline,
    scheme: roles.scheme,
    mood: t.mood,
    density: t.density,
    formality: t.formality,
    colors: { bg: roles.bg, ink: roles.ink, accent: roles.accent, paper: roles.paper, line: roles.line, muted: roles.muted },
    palette: roles.palette,
    radius,
    deco: decoStyle(t),
    fonts: fontSpec,
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(themes, null, 2));
console.log("✓ wrote " + Object.keys(themes).length + " themes -> template/themes/index.json");
console.log("  unique google font (family,weight) pairs: " + fontJobs.size);

// dump font jobs for the fetcher step / inspection
fs.writeFileSync(path.join(OUT_DIR, "_fontjobs.json"), JSON.stringify([...fontJobs.values()], null, 2));

if (WANT_FONTS) {
  await fetchFonts([...fontJobs.values()]);
}

// ---- font fetcher (Google Fonts -> woff2, offline) ------------------------
async function fetchFonts(jobs) {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const manifest = {};
  // group weights per family for fewer requests
  const byFamily = new Map();
  for (const j of jobs) { if (!byFamily.has(j.family)) byFamily.set(j.family, new Set()); byFamily.get(j.family).add(j.weight); }
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
  const slugOf = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  async function getCss(family, weights) {
    const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weights.join(";")}&display=swap`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    return r.ok ? r.text() : null;
  }
  async function saveFromCss(family, css, wset) {
    // css2 returns one @font-face per (weight, subset). Pick the LATIN subset
    // (unicode-range starts at U+0000-00FF) so the bundled woff2 has ASCII
    // glyphs; falling back to the last block only if no latin block is present.
    const got = [];
    const byW = {}; // weight -> { latin, any }
    for (const b of css.split("@font-face").slice(1)) {
      const wm = b.match(/font-weight:\s*(\d+)/);
      const um = b.match(/url\((https:\/\/[^)]+\.woff2)\)/);
      if (!wm || !um) continue;
      const w = parseInt(wm[1], 10);
      if (!wset.has(w)) continue;
      const ur = (b.match(/unicode-range:\s*([^;]+);/i) || [])[1] || "";
      byW[w] = byW[w] || { latin: null, any: null };
      if (/^\s*u\+0000-00ff/i.test(ur) || !ur) byW[w].latin = byW[w].latin || um[1];
      byW[w].any = um[1];
    }
    for (const wStr of Object.keys(byW)) {
      const w = parseInt(wStr, 10);
      if (manifest[family + "|" + w]) continue;
      const url = byW[w].latin || byW[w].any;
      const file = `${slugOf(family)}-${w}.woff2`;
      const dst = path.join(FONT_DIR, file);
      if (!fs.existsSync(dst)) {
        try { const fr = await fetch(url, { headers: { "User-Agent": UA } }); fs.writeFileSync(dst, Buffer.from(await fr.arrayBuffer())); }
        catch { continue; }
      }
      manifest[family + "|" + w] = file; got.push(w);
    }
    return got;
  }
  for (const [family, wset] of byFamily) {
    const weights = [...wset].sort((a, b) => a - b);
    let css = null;
    try { css = await getCss(family, weights); } catch { /* network */ }
    if (css) await saveFromCss(family, css, wset);
    // per-weight fallback for any weight the combined request rejected/omitted
    for (const w of weights) {
      if (manifest[family + "|" + w]) continue;
      try { const c = await getCss(family, [w]); if (c) await saveFromCss(family, c, new Set([w])); }
      catch { /* skip */ }
    }
    const have = weights.filter((w) => manifest[family + "|" + w]);
    console.log(have.length ? `  ✓ ${family} [${have.join(", ")}]` : `  ⚠ ${family}: no weights fetched`);
  }
  fs.writeFileSync(path.join(FONT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("✓ fonts -> template/themefonts/ (" + Object.keys(manifest).length + " files)");
}
