// Basic checks for index.html: it must parse as HTML, and every inline
// <script> must be syntactically valid JavaScript. Future checks go beside this.
//   node scripts/check-index.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
let failed = false;
const fail = (m) => { console.error("FAIL " + m); failed = true; };

if (!/^\s*<!doctype html>/i.test(html)) fail("index.html does not start with <!DOCTYPE html>");

// Tag balance for the elements that matter most to a hand-edited single file.
for (const tag of ["html", "head", "body", "script", "style"]) {
  const open = (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) || []).length;
  const close = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;
  if (open !== close) fail(`<${tag}> opened ${open}x but closed ${close}x`);
}

const dir = mkdtempSync(join(tmpdir(), "idx-"));
let i = 0, checked = 0;
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  i++;
  const attrs = m[1];
  if (/\bsrc\s*=/i.test(attrs) || !m[2].trim()) continue;      // external or empty
  const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1];
  if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type)) continue; // data blocks
  const file = join(dir, `script-${i}.${type === "module" ? "mjs" : "js"}`);
  writeFileSync(file, m[2]);
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  checked++;
  if (r.status !== 0) fail(`inline <script> #${i} has a syntax error:\n${r.stderr}`);
}
if (checked === 0) fail("no inline <script> found to check");

// ---- Security checks (2026-11: Quick Picks injection, javascript: links, CSP, SRI) ----

// Returns the source of `function <name>(...) { ... }` by brace matching, or null.
function functionBody(src, name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  if (!m) return null;
  const open = src.indexOf("{", src.indexOf(")", m.index));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(m.index, i + 1);
  }
  return null;
}

// Quick Picks (Receipt Category Quick Picks) are SharePoint list values. These
// renderers must write them as text. Fail if one assigns innerHTML from a template
// that interpolates a list field (label/icon/glCode/Title/Icon/GLCode/Category...)
// without an escape function around it.
const QUICK_PICK_RENDERERS = ["renderReceiptCategories", "renderReceiptOtherResults", "renderReceiptSelectedChip", "fillCategoryTile"];
const LIST_FIELD = /\b(label|icon|glCode|Title|Icon|GLCode|Category|category)\b/;
const ESCAPED = /^(?:reEsc|reconEsc|escapeHtml|escHtml)\(/;
for (const name of QUICK_PICK_RENDERERS) {
  const body = functionBody(html, name);
  if (!body) { fail(`Quick Picks renderer ${name}() not found - update scripts/check-index.mjs if it was renamed`); continue; }
  for (const stmt of body.matchAll(/\.innerHTML\s*\+?=\s*([^;]*(?:`[^`]*`[^;]*)*);/g)) {
    for (const ex of stmt[1].matchAll(/\$\{([^}]*)\}/g)) {
      const inner = ex[1].trim();
      if (LIST_FIELD.test(inner) && !ESCAPED.test(inner)) {
        fail(`${name}() assigns innerHTML with an unescaped list field \${${inner}} - use textContent or an escape function`);
      }
    }
  }
}

// href values built from list data must go through safeHttpsUrl (no javascript: links).
for (const m of html.matchAll(/href="\$\{reconEsc\((?!safeHttpsUrl\()[^"]*"/g)) {
  fail(`href built from list data without safeHttpsUrl(): ${m[0].slice(0, 80)}`);
}

// Content-Security-Policy: present, and every https origin the page names is allowed by it.
const cspTag = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
if (!cspTag) {
  console.warn("note: index.html has no Content-Security-Policy <meta> (removed 2026-11-11 after it broke sign-in in the home-screen app; to return as a tested, server-set header)");
} else {
  const csp = cspTag[1];
  if (/default-src\s+(?!'none')/.test(csp)) fail("CSP default-src must be 'none'");
  if (/script-src[^;]*https?:(?!\/\/alcdn\.msauth\.net)/.test(csp)) fail("CSP script-src names an origin other than the MSAL CDN");
  const body = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const o of new Set([...body.matchAll(/https:\/\/[a-z0-9.-]+/gi)].map((m) => m[0].toLowerCase()))) {
    if (!csp.toLowerCase().includes(o)) fail(`page names ${o} but the CSP does not allow it`);
  }
}

// SRI on the MSAL script, and the pinned version must stay pinned.
const msal = /<script\b[^>]*src="https:\/\/alcdn\.msauth\.net\/browser\/(\d+\.\d+\.\d+)\/[^"]*"[^>]*>/i.exec(html);
if (!msal) fail("MSAL <script> from alcdn.msauth.net/browser/<exact version>/ not found");
else if (!/integrity="sha384-[A-Za-z0-9+/=]+"/.test(msal[0]) || !/crossorigin="anonymous"/.test(msal[0])) {
  console.warn("note: MSAL <script> has no integrity attribute (removed 2026-11-11 with the CSP; see above)");
}

if (failed) process.exit(1);
console.log(`index.html OK (${checked} inline script(s) syntax-checked)`);
