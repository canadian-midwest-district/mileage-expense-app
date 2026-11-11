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

if (failed) process.exit(1);
console.log(`index.html OK (${checked} inline script(s) syntax-checked)`);
