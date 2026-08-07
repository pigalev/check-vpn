# Responsive WebRTC and Country Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WebRTC result card use desktop space efficiently while remaining phone-friendly, and prepend country flag emoji to GeoIP location text when a valid two-letter country code is available.

**Architecture:** Keep the existing single WebRTC card and introduce an inner responsive grid: ICE candidates on the left, HTTP-vs-WebRTC comparison on the right. Add a pure country-code-to-flag helper and reuse the existing GeoIP country code without any new network requests or dependencies.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Node.js 22 built-in `node:test`, GitHub Actions, GitHub Pages.

## Global Constraints

- Mobile usability is the priority.
- No horizontal page scrolling at phone widths.
- Long IPv6 addresses, mDNS hostnames, and user-agent strings must wrap inside cards.
- WebRTC remains one full-width result card on desktop.
- WebRTC inner content uses two columns on wider screens and one column on narrow screens.
- Country flags are derived from the existing ISO alpha-2 code in JavaScript.
- No new API, image asset, CDN, package, or external dependency.
- If country code is absent/invalid, location text renders normally without a flag.
- Existing IP detection, GeoIP provider behavior, WebRTC collection, assessment logic, and JSON schema remain unchanged.

---

### Task 1: Add tested country flag conversion

**Files:**
- Create: `assets/country.js`
- Create: `tests/country.test.js`
- Modify: `scripts/validate-static.mjs`

**Interfaces:**
- Produces: `countryCodeToFlag(code): string`.

- [ ] **Step 1: Write failing tests**

Create `tests/country.test.js` with assertions for `DE -> 🇩🇪`, lowercase normalization, empty/null input, and invalid strings returning `''`.

- [ ] **Step 2: Run focused test**

Run: `node --test tests/country.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement helper**

Create `assets/country.js`:

```js
export function countryCodeToFlag(code) {
  if (typeof code !== 'string') return '';
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return '';
  return [...normalized]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('');
}
```

- [ ] **Step 4: Add module to static validation**

Include `assets/country.js` in the required-file list.

- [ ] **Step 5: Run focused tests again**

Run: `node --test tests/country.test.js`

Expected: PASS.

---

### Task 2: Add flags to location rendering and restructure WebRTC DOM

**Files:**
- Modify: `assets/app.js`

**Interfaces:**
- Consumes: `countryCodeToFlag()` from `assets/country.js`.

- [ ] **Step 1: Import flag helper**

Add:

```js
import { countryCodeToFlag } from './country.js';
```

- [ ] **Step 2: Prefix location with flag when available**

Update location formatting so `DE` yields `🇩🇪 Germany · Frankfurt am Main, Hesse`, while missing/invalid country codes keep the existing text unchanged.

- [ ] **Step 3: Wrap WebRTC sections in an inner grid**

Inside `renderWebRtc()`, create a wrapper such as:

```html
<div class="webrtc-layout">
  <div class="webrtc-candidates">...</div>
  <div class="webrtc-comparison">...</div>
</div>
```

Move the existing candidate list into the left section and the existing HTTP-vs-WebRTC block into the right section. Do not change the data or assessment message.

- [ ] **Step 4: Keep error copy outside or above the grid**

If WebRTC returns an error, ensure it remains visible before the detailed sections.

---

### Task 3: Make WebRTC compact on desktop and safe on phones

**Files:**
- Modify: `assets/styles.css`

- [ ] **Step 1: Add overflow-safe defaults**

Ensure `.result-card`, `.card-body`, `.candidate-address`, `.detail-value`, and WebRTC columns use `min-width: 0` and wrapping rules where needed.

- [ ] **Step 2: Add desktop/tablet inner grid**

At a suitable breakpoint (around 760px), use:

```css
.webrtc-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  gap: 24px;
  align-items: start;
}
```

Give the comparison column a subtle left divider/padding on wider screens.

- [ ] **Step 3: Collapse to one column on phones**

Below the breakpoint:

```css
.webrtc-layout { display: grid; grid-template-columns: 1fr; gap: 0; }
.webrtc-comparison { border-left: 0; padding-left: 0; margin-top: 8px; }
```

Keep candidates first and comparison second.

- [ ] **Step 4: Tighten narrow-screen spacing**

Reduce page/card padding modestly for small screens while keeping touch targets and readability intact.

- [ ] **Step 5: Prevent horizontal overflow**

Use `overflow-wrap: anywhere` for long technical values; do not use fixed column widths that can force the viewport wider.

---

### Task 4: Verify regression and responsive behavior

**Files:**
- Verify: all project files.

- [ ] **Step 1: Run automated suite**

Run: `npm run check`

Expected: exit code 0, all tests and static validation pass, `_site` builds successfully.

- [ ] **Step 2: Check desktop layout manually**

At desktop width verify the WebRTC card uses two inner columns and is materially shorter than before.

- [ ] **Step 3: Check phone layout manually**

At roughly 360–430px width verify one-column reading order, no horizontal page scroll, long mDNS/IPv6 strings wrap, and buttons/cards fit the viewport.

- [ ] **Step 4: Check flag fallbacks**

Verify a valid GeoIP country code shows a flag and missing/invalid codes do not show broken placeholders.

- [ ] **Step 5: Commit and prepare integration**

Commit the feature branch, verify CI, then offer integration into `main`.