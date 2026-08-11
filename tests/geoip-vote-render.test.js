import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.className = ''; this._text = ''; }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent ?? '').join(''); }
  append(...nodes) { this.children.push(...nodes); }
}

globalThis.document = { createElement:(tagName) => new Element(tagName) };
const { renderGeoIpEvidence } = await import('../assets/geoip-evidence-render.js');

const result = {
  status:'complete',ip:'31.76.17.233',countryCode:'DE',country:'Germany',timezone:'Europe/Berlin',
  agreement:{available:5,total:5,countryState:'disagree',locationState:'disagree'},
  votes:{
    country:{state:'majority',usable:4,counts:[{key:'code:de',label:'Germany',votes:3},{key:'code:gb',label:'United Kingdom',votes:1}],winnerKey:'code:de',winnerLabel:'Germany',winnerVotes:3,winnerShare:.75,outliers:[{key:'code:gb',label:'United Kingdom',votes:1}]},
    location:{state:'unresolved',usable:4,counts:[{key:'a',label:'Neu-Isenburg, Hesse',votes:1},{key:'b',label:'Frankfurt am Main, Hessen',votes:1},{key:'c',label:'Frankfurt Innenstadt, Hesse',votes:1},{key:'d',label:'Whitehaven, Cumbria',votes:1}],winnerKey:null,winnerLabel:null,winnerVotes:0,winnerShare:.25,outliers:[]},
    timezone:{state:'majority',usable:4,counts:[{key:'berlin',label:'Europe/Berlin',votes:3},{key:'london',label:'Europe/London',votes:1}],winnerKey:'berlin',winnerLabel:'Europe/Berlin',winnerVotes:3,winnerShare:.75,outliers:[{key:'london',label:'Europe/London',votes:1}]}
  },
  sources:[
    {status:'complete',source:{id:'a',label:'ipapi.co'},countryCode:'DE',country:'Germany',city:'Neu-Isenburg',region:'Hesse',timezone:'Europe/Berlin',latencyMs:100},
    {status:'complete',source:{id:'b',label:'ipwho.is'},countryCode:'DE',country:'Germany',city:'Frankfurt am Main',region:'Hessen',timezone:'Europe/Berlin',latencyMs:110},
    {status:'complete',source:{id:'c',label:'FreeIPAPI'},countryCode:'DE',country:'Germany',city:'Frankfurt Innenstadt',region:'Hesse',timezone:'Europe/Berlin',latencyMs:120},
    {status:'complete',source:{id:'d',label:'ipapi.is'},countryCode:null,country:null,city:null,region:null,timezone:null,latencyMs:130},
    {status:'complete',source:{id:'e',label:'Sypex Geo RU'},countryCode:'GB',country:'United Kingdom',city:'Whitehaven',region:'Cumbria',timezone:'Europe/London',latencyMs:140}
  ]
};

test('Advanced GeoIP shows reached, usable counts and full vote distributions', () => {
  const parent = new Element('div');
  const section = renderGeoIpEvidence(parent, result);
  const text = section.textContent;
  assert.match(text, /Providers reached5\/5/);
  assert.match(text, /Usable country data4\/5/);
  assert.match(text, /Usable location data4\/5/);
  assert.match(text, /Country stateMajority/);
  assert.match(text, /Country voteGermany 3\/4 · United Kingdom 1\/4/);
  assert.match(text, /Location stateUnresolved/);
  assert.match(text, /Timezone voteEurope\/Berlin 3\/4 · Europe\/London 1\/4/);
});
