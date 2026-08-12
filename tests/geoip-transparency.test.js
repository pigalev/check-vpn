import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeoIpEvidence } from '../assets/geoip-evidence.js';
import { buildConnectionView } from '../assets/dashboard-view.js';

function vote(state, usable, counts, winnerLabel = null, winnerVotes = 0) {
  return {
    state,
    usable,
    counts,
    winnerKey: winnerLabel ? `key:${winnerLabel}` : null,
    winnerLabel,
    winnerVotes,
    winnerShare: usable ? winnerVotes / usable : 0,
    outliers: winnerLabel ? counts.filter((item) => item.label !== winnerLabel) : counts
  };
}

function geoFixture() {
  return {
    status:'complete', ip:'31.76.17.233', countryCode:'DE', country:'Germany', region:null, city:null, timezone:'Europe/Berlin',
    agreement:{available:5,total:5,countryState:'disagree',locationState:'disagree'},
    votes:{
      country:vote('majority',4,[
        {key:'code:de',label:'Germany',votes:3},
        {key:'code:gb',label:'United Kingdom',votes:1}
      ],'Germany',3),
      location:vote('unresolved',4,[
        {key:'a',label:'Neu-Isenburg, Hesse',votes:1},
        {key:'b',label:'Frankfurt am Main, Hessen',votes:1},
        {key:'c',label:'Frankfurt am Main (Innenstadt I), Hesse',votes:1},
        {key:'d',label:'Whitehaven, Cumbria',votes:1}
      ]),
      timezone:vote('majority',4,[
        {key:'europe/berlin',label:'Europe/Berlin',votes:3},
        {key:'europe/london',label:'Europe/London',votes:1}
      ],'Europe/Berlin',3)
    },
    sources:[
      {status:'complete',source:{id:'a',label:'ipapi.co'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Neu-Isenburg',timezone:'Europe/Berlin',latencyMs:100},
      {status:'complete',source:{id:'b',label:'ipwho.is'},countryCode:'DE',country:'Germany',region:'Hessen',city:'Frankfurt am Main',timezone:'Europe/Berlin',latencyMs:120},
      {status:'complete',source:{id:'c',label:'FreeIPAPI'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt am Main (Innenstadt I)',timezone:'Europe/Berlin',latencyMs:140},
      {status:'complete',source:{id:'d',label:'ipapi.is'},countryCode:null,country:null,region:null,city:null,timezone:null,latencyMs:160},
      {status:'complete',source:{id:'e',label:'Sypex Geo RU'},countryCode:'GB',country:'United Kingdom',region:'Cumbria',city:'Whitehaven',timezone:'Europe/London',latencyMs:180}
    ]
  };
}

test('GeoIP evidence separates reached providers from usable field votes', () => {
  const view = buildGeoIpEvidence(geoFixture());
  assert.equal(view.reached, 5);
  assert.equal(view.total, 5);
  assert.equal(view.usableCountry, 4);
  assert.equal(view.usableLocation, 4);
  assert.equal(view.usableTimezone, 4);
  assert.equal(view.countryVote.state, 'majority');
  assert.equal(view.locationVote.state, 'unresolved');
  assert.equal(view.countryVote.winnerVotes, 3);
});

test('connection hero explains country majority quantitatively while remaining Review', () => {
  const ipv4 = {
    family:4,status:'complete',confidence:'strong',address:'31.76.17.233',ipFinal:true,geoFinal:true,
    agreement:{available:4,total:4,selectedVotes:4,counts:{'31.76.17.233':4}},
    primary:{available:4,total:5,sources:[]},reserve:{attempted:true,contributed:false,notNeeded:false,used:true,sources:[]},
    geo:geoFixture()
  };
  const view = buildConnectionView({ ipv4, ipv6:{family:6,address:null,ipFinal:true,confidence:'unavailable'}, assessment:{status:'review'} });
  assert.equal(view.primary.geoNotice.code, 'GEO_COUNTRY_DISAGREEMENT');
  assert.equal(view.primary.geoNotice.severity, 'review');
  assert.equal(view.primary.geoNotice.shortSummary, 'GeoIP majority: Germany 3/4 · 1 provider differs');
  assert.equal(view.verdict, 'review');
});

test('location-only unresolved evidence is informational and says unresolved', () => {
  const geo = geoFixture();
  geo.countryCode = 'DE';
  geo.country = 'Germany';
  geo.agreement.countryState = 'agree';
  geo.votes.country = vote('agree',4,[{key:'code:de',label:'Germany',votes:4}],'Germany',4);
  const ipv4 = {
    family:4,status:'complete',confidence:'strong',address:'31.76.17.233',ipFinal:true,geoFinal:true,
    agreement:{available:4,total:4,selectedVotes:4},primary:{available:4,total:5},reserve:{attempted:false,contributed:false,notNeeded:true,sources:[]},geo
  };
  const view = buildConnectionView({ ipv4, ipv6:{family:6,address:null,ipFinal:true}, assessment:{status:'protected'} });
  assert.equal(view.primary.geoNotice.code, 'GEO_LOCATION_DISAGREEMENT');
  assert.equal(view.primary.geoNotice.severity, 'info');
  assert.equal(view.primary.geoNotice.shortSummary, 'GeoIP location unresolved');
  assert.equal(view.verdict, 'protected');
});
