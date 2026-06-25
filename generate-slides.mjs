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

const specPath = process.argv[2];
const outDir = path.resolve(process.argv[3] || path.join(process.cwd(), "dist"));
if (!specPath) die("usage: node generate-slides.mjs <slide-spec.json> [out-dir]");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const specDir = path.dirname(path.resolve(specPath));
if (!spec.title) die("spec.title is required");
if (!Array.isArray(spec.slides) || !spec.slides.length) die("spec.slides must be a non-empty array");

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

// ---- write package ---------------------------------------------------------
const slug = slugify(spec.slug || spec.title);
const pkg = path.join(outDir, slug);
fs.rmSync(pkg, { recursive: true, force: true });
fs.mkdirSync(path.join(pkg, "scormcontent", "assets"), { recursive: true });

cp(path.join(TEMPLATE, "scormdriver"), path.join(pkg, "scormdriver"));
cp(path.join(TEMPLATE, "scormcontent", "player.js"), path.join(pkg, "scormcontent", "player.js"));
cp(path.join(TEMPLATE, "scormcontent", "fonts"), path.join(pkg, "scormcontent", "fonts"));
for (const f of fs.readdirSync(TEMPLATE)) if (f.endsWith(".xsd")) cp(path.join(TEMPLATE, f), path.join(pkg, f));

for (const [abs, key] of assetMap) {
  const dst = path.join(pkg, "scormcontent", key);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(abs, dst);
}

const lessonJson = JSON.stringify({ title: spec.title, color: spec.color || "#008181", slides: spec.slides });
let html = fs.readFileSync(path.join(TEMPLATE, "scormcontent", "index.html.tmpl"), "utf8");
html = html
  .replace("__LESSON_TITLE__", esc(spec.title))
  .replace("__ACCENT__", (spec.color || "#008181"))
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
console.log("  slides      : " + spec.slides.length + " | assets: " + assetMap.size);

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
