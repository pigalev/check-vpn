# mDNS and Country Flag Rendering Fix

## Root cause

The country flag is currently generated as a Unicode regional-indicator sequence. On Windows, Chrome/Edge may render this sequence as the letters `DE` instead of a flag glyph, which is exactly what is visible in the current UI. The GeoIP data itself is correct; the rendering method is unreliable on this platform.

The WebRTC local candidate is also technically correct but visually overemphasizes the random mDNS hostname instead of the useful meaning: the browser hid the real local IP.

## Design

### Country flag

Render a small real flag image next to the country name using the already known two-letter country code. Keep the full country name in text. If the flag image fails to load or the country code is missing/invalid, hide the image and keep the text unchanged.

The flag must be small, inline, and responsive. It must not affect diagnostic logic or GeoIP behavior.

### mDNS local candidate

For an mDNS host candidate, render the primary value as:

`Hidden by browser`

Then render the actual `.local` hostname below as a secondary technical value, for example:

`92890873-7517-4e99-9f6c-f3c134bf10a0.local`

Keep the existing metadata and explanatory note that the local address is hidden by browser mDNS protection.

Numeric private local IPs, if a browser exposes them, continue to render normally as the primary value.

## Responsive behavior

The flag and location text must stay within the existing detail row and wrap cleanly on narrow phones. The mDNS technical hostname must use `overflow-wrap: anywhere` and never create horizontal page scrolling.

## Testing

Add/adjust tests so country-code normalization remains covered and DOM-facing flag URL generation can be tested as a pure helper. Existing WebRTC candidate parsing/classification tests remain unchanged. Run the full `npm run check` workflow before integration.