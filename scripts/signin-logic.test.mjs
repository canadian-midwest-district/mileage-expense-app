// Tests the pure sign-in decision logic extracted from index.html (between the
// <signin-logic> markers). No browser, no credentials.  node --test scripts/
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = /\/\/ <signin-logic>[\s\S]*?\n([\s\S]*?)\/\/ <\/signin-logic>/.exec(html);
assert.ok(m, "signin-logic block not found");
const ctx = vm.createContext({});
vm.runInContext(m[1] + "\nthis.api = { isPopupClassError, isUserCancelled, shouldSkipPopup, normalizeRedirectUri };", ctx);
const { isPopupClassError, isUserCancelled, shouldSkipPopup, normalizeRedirectUri } = ctx.api;

test("pop-up class errors trigger the redirect fallback", () => {
  for (const code of ["popup_window_error", "empty_window_error", "monitor_window_timeout"]) {
    assert.equal(isPopupClassError({ errorCode: code }), true, code);
    assert.equal(isPopupClassError(new Error(code + ": Error opening popup window.")), true, code + " via message");
  }
});
test("user_cancelled and unrelated errors do NOT trigger it", () => {
  assert.equal(isPopupClassError({ errorCode: "user_cancelled" }), false);
  assert.equal(isUserCancelled({ errorCode: "user_cancelled" }), true);
  assert.equal(isPopupClassError({ errorCode: "interaction_in_progress" }), false);
  assert.equal(isPopupClassError(new Error("network")), false);
  assert.equal(isPopupClassError(null), false);
  assert.equal(isPopupClassError(undefined), false);
});

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_WEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
test("standalone display mode skips the pop-up", () => {
  assert.equal(shouldSkipPopup({ navigatorStandalone: true, userAgent: IPHONE_SAFARI }), true);
  assert.equal(shouldSkipPopup({ displayModeStandalone: true, userAgent: "x" }), true);
});
test("in-app browsers and web views skip the pop-up", () => {
  assert.equal(shouldSkipPopup({ userAgent: IPHONE_WEBVIEW }), true);
  assert.equal(shouldSkipPopup({ userAgent: IPHONE_SAFARI + " Outlook-iOS/4.2" }), true);
  assert.equal(shouldSkipPopup({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" }), true);
  assert.equal(shouldSkipPopup({ userAgent: "Mozilla/5.0 (Macintosh) Teams/1.7 Chrome/124" }), true);
});
test("ordinary browsers keep the pop-up first", () => {
  assert.equal(shouldSkipPopup({ navigatorStandalone: false, displayModeStandalone: false, userAgent: IPHONE_SAFARI }), false);
  assert.equal(shouldSkipPopup({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" }), false);
  assert.equal(shouldSkipPopup({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1" }), false);
  assert.equal(shouldSkipPopup(), false);
});
test("redirect URI is always a registered one", () => {
  assert.equal(normalizeRedirectUri("https://travel.canadianmidwest.ca", "/"), "https://travel.canadianmidwest.ca/");
  assert.equal(normalizeRedirectUri("https://travel.canadianmidwest.ca", "/index.html"), "https://travel.canadianmidwest.ca/");
  assert.equal(normalizeRedirectUri("https://expenses.canadianmidwest.ca", "/index.html"), "https://expenses.canadianmidwest.ca/");
  assert.equal(normalizeRedirectUri("https://expenses.canadianmidwest.ca", "/"), "https://expenses.canadianmidwest.ca/");
  // another host's path (e.g. the SharePoint-hosted copy) is left alone
  assert.equal(normalizeRedirectUri("https://x.sharepoint.com", "/sites/a/page.aspx"), "https://x.sharepoint.com/sites/a/page.aspx");
});
