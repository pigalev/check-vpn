import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this._text = '';
  }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent ?? '').join(''); }
  append(...nodes) { this.children.push(...nodes); }
}

globalThis.document = { createElement:(tagName) => new Element(tagName) };

const { renderGeoIpEvidence } = await import('../assets/geoip-evidence-render.js');

function disputedGeo() {
  return {
    ip:'31.76.17.233', countryCode:'DE', country:'Germany', region:'Hesse', city:'Neu-Isenburg',
    agreement:{available:3,total:4,countryState:'disagree',locationState:'disagree'},
    sources:[
      {status:'complete',source:{id:'a',label:'ipapi.co'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Neu-Isenburg',timezone:'Europe/Berlin',asn:'AS1',org:'A Net',latencyMs:100},
      {status:'complete',source:{id:'b',label:'ipwho.is'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt',timezone:'Europe/Berlin',latencyMs:120},
      {status:'complete',source:{id:'c',label:'Sypex Geo RU'},countryCode:'RU',country:'Russia',region:'Moscow',city:'Moscow',timezone:'Europe/Moscow',latencyMs:140},
      {status:'unavailable',source:{id:'d',label:'FreeIPAPI'},error:'Location unavailable.',latencyMs:6000}
    ]
  };
}

test('GeoIP renderer exposes provider-by-provider disagreement evidence', () => {
  const parent = new Element('div');
  const section = renderGeoIpEvidence(parent, disputedGeo());
  assert.ok(section);
  const text = section.textContent;
  assert.match(text, /GeoIP sources/);
  assert.match(text, /Country stateDisagree/);
  assert.match(text, /Location stateDisagree/);
  assert.match(text, /ipapi\.co[\s\S]*Germany[\s\S]*Neu-Isenburg[\s\S]*Europe\/Berlin/);
  assert.match(text, /Sypex Geo RU[\s\S]*Russia[\s\S]*Moscow[\s\S]*Europe\/Moscow/);
});

test('unavailable provider is labeled unavailable rather than differs', () => {
  const parent = new Element('div');
  const section = renderGeoIpEvidence(parent, disputedGeo());
  const unavailable = section.children
    .flatMap((child) => child.children ?? [])
    .find((child) => child.className?.includes('geoip-source-unavailable'));
  assert.ok(unavailable);
  assert.match(unavailable.textContent, /FreeIPAPI/);
  assert.match(unavailable.textContent, /Unavailable/i);
  assert.doesNotMatch(unavailable.textContent, /differs/i);
});
