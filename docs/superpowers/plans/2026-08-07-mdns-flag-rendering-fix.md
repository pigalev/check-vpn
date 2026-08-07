# mDNS and Flag Rendering Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render country flags reliably on Windows browsers and make mDNS-protected local WebRTC addresses understandable without hiding the technical value.

**Architecture:** Replace the Unicode-emoji flag presentation with a small flag image derived from the existing ISO country code, while keeping the country name as text and falling back cleanly if the image fails. For mDNS host candidates, keep the underlying `.local` hostname in the report but render `Hidden by browser` as the primary value and move the technical hostname into a secondary line.

**Tech Stack:** Plain JavaScript ES modules, DOM APIs, CSS, Node.js 22 built-in tests, GitHub Actions.

## Global Constraints

- Keep the page dependency-free at runtime except for existing external diagnostic APIs and a lightweight flag image endpoint.
- Country name text must remain visible even if the flag image cannot load.
- Do not change GeoIP lookup logic or its data model.
- Do not change WebRTC candidate collection or JSON output.
- Preserve responsive behavior and prevent horizontal scrolling on phones.
- mDNS candidates must still expose their technical `.local` hostname somewhere in the UI.

---

### Task 1: Add deterministic flag-image URL helper

**Files:**
- Modify: `assets/country.js`
- Modify: `tests/country.test.js`

**Interfaces:**
- Existing: `countryCodeToFlag(code)` remains available for backward compatibility/tests.
- Produces: `countryCodeToFlagUrl(code): string`.

- [ ] **Step 1: Write failing tests**

Add tests that expect:

```js
assert.equal(countryCodeToFlagUrl('DE'), 'https://flagcdn.com/24x18/de.png');
assert.equal(countryCodeToFlagUrl('de'), 'https://flagcdn.com/24x18/de.png');
assert.equal(countryCodeToFlagUrl('D'), '');
assert.equal(countryCodeToFlagUrl(null), '');
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/country.test.js`

Expected: FAIL because `countryCodeToFlagUrl` does not exist.

- [ ] **Step 3: Implement the URL helper**

Add:

```js
export function countryCodeToFlagUrl(code) {
  if (typeof code !== 'string') return '';
  const normalized = code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) return '';
  return `https://flagcdn.com/24x18/${normalized}.png`;
}
```

- [ ] **Step 4: Re-run focused tests**

Run: `node --test tests/country.test.js`

Expected: all country tests pass.

---

### Task 2: Render image flags with text fallback

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/styles.css`

**Interfaces:**
- Consumes: `countryCodeToFlagUrl(code)`.
- Produces: a location value composed of optional `<img class="country-flag">` plus the existing country/location text.

- [ ] **Step 1: Import the URL helper and allow detail rows to accept DOM nodes**

Update `addDetailList()` so the row value may be either a string or a Node. If it is a Node, append it to `.detail-value`; otherwise keep `textContent` behavior.

- [ ] **Step 2: Add `buildLocationContent(geo)`**

The helper should create a span containing:

- `<img>` when `countryCodeToFlagUrl()` returns a URL;
- the existing formatted location string as text;
- `alt=""` and `aria-hidden="true"` on the decorative image;
- an `error` handler that removes the image if it cannot load.

- [ ] **Step 3: Use the DOM location content in `renderIp()`**

Replace the current plain location string row with the new location node. GeoIP failure behavior stays unchanged.

- [ ] **Step 4: Add flag styling**

Add CSS roughly equivalent to:

```css
.location-value { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.country-flag { width: 20px; height: 15px; object-fit: cover; border-radius: 2px; flex: 0 0 auto; }
```

Ensure the text can wrap on narrow screens.

---

### Task 3: Make mDNS local candidates human-readable

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/styles.css`

**Interfaces:**
- Existing `describeCandidate(candidate)` remains unchanged.
- Rendering rule: when `candidate.classification === 'mdns'`, primary value is `Hidden by browser`; technical `.local` address is shown in a secondary line.

- [ ] **Step 1: Change candidate rendering only for mDNS**

For mDNS candidates render:

```text
LOCAL INTERFACE
Hidden by browser
9289....local
host · Address hidden · UDP · mDNS protected
Local address hidden by browser (mDNS).
```

For every other candidate, keep the current address rendering unchanged.

- [ ] **Step 2: Add secondary technical-address styling**

Use a compact muted monospace style with `overflow-wrap: anywhere` so long hostnames do not cause mobile overflow.

- [ ] **Step 3: Preserve accessibility and data fidelity**

Do not remove the actual hostname from the DOM or JSON report.

---

### Task 4: Regression verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 2: Run static validation/build**

Run: `npm run check`

Expected: tests, static validation, and `_site` build all succeed.

- [ ] **Step 3: Verify CI on the feature branch**

Wait for the `Test` workflow for the final commit and confirm `conclusion: success` before integration.

- [ ] **Step 4: Present integration options**

Use the finishing-development-branch workflow and do not merge into `main` without user choice.