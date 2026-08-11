import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConnectionView,
  buildLeakView,
  buildPrivacyView,
  buildAdvancedRowView
} from '../assets/dashboard-view.js';

const ip4 = {
  family: 4,
  status: 'complete',
  confidence: 'strong',
  address: '128.71.33.91',
  ipFinal: true,
  geoFinal: true,
  agreement: { available: 4, total: 5, agree: true, selectedVotes: 4, counts: { '128.71.33.91': 4 } },
  primary: { available: 4, total: 5, sources: [] },
  reserve: { used: false, sources: [] },
  geo: {
    status: 'complete', countryCode: 'RU', country: 'Russia', city: 'Krasnodar',
    asn: 'AS3216', org: 'VimpelCom', agreement: { available: 3, total: 4, countryState:'agree', locationState:'agree' }, differences: []
  }
};

const noIp6 = { family:6, status:'unavailable', address:null, ipFinal:true, geoFinal:true };

test('connection view makes IPv4 primary and legacy unavailable IPv6 one compact row', () => {
  const view = buildConnectionView({ ipv4:ip4, ipv6:noIp6, assessment:{status:'protected'} });
  assert.equal(view.primary.family, 4);
  assert.equal(view.primary.address, '128.71.33.91');
  assert.match(view.primary.sourceText, /^Strong consensus/);
  assert.equal(view.secondary.family, 6);
  assert.equal(view.secondary.state, 'not-detected');
  assert.equal(view.verdict, 'protected');
});

test('IPv6 becomes primary when IPv4 is unavailable', () => {
  const ipv6 = {
    family:6,status:'complete',confidence:'partial',address:'2a00:1450::1',ipFinal:true,geoFinal:true,
    agreement:{available:2,total:3,agree:true,selectedVotes:2}, primary:{available:2,total:3}, reserve:{used:true,sources:[{status:'unavailable'}]},
    geo:{status:'complete',country:'Germany',city:'Frankfurt'}
  };
  const view = buildConnectionView({ ipv4:{family:4,address:null,ipFinal:true,confidence:'unavailable'}, ipv6 });
  assert.equal(view.primary.family, 6);
  assert.equal(view.primary.address, '2a00:1450::1');
  assert.match(view.primary.sourceText, /^Partial/);
});

test('no-consensus is explicit and never looks like Not detected', () => {
  const view = buildConnectionView({
    ipv4:{family:4,status:'partial',confidence:'no-consensus',address:null,ipFinal:true,observedAddresses:['203.0.113.1','203.0.113.2']},
    ipv6:{family:6,status:'unavailable',confidence:'unavailable',address:null,ipFinal:true}
  });
  assert.equal(view.primary.state, 'no-consensus');
  assert.equal(view.primary.sourceText, 'No consensus · review source details');
  assert.equal(view.secondary.state, 'unavailable');
  assert.equal(view.secondary.sourceText, 'Unavailable · no source confirmed this family');
});

test('provisional address stays visible with checking states', () => {
  const view = buildConnectionView({ ipv4:{family:4,address:'128.71.33.91',ipFinal:false,geoPending:true,geo:null}, ipv6:{family:6,address:null,ipFinal:false} });
  assert.equal(view.primary.state, 'detected');
  assert.equal(view.primary.sourceText, 'Checking…');
  assert.equal(view.primary.locationState, 'locating');
});

test('usable GeoIP remains visible when country evidence disagrees', () => {
  const disputed = {
    ...ip4,
    geo:{
      status:'partial', countryCode:'RU', country:'Russia', city:'Moscow', region:'Moscow',
      agreement:{available:3,total:5,countryState:'disagree',locationState:'disagree',countryAgree:false,locationAgree:false}
    }
  };
  const view = buildConnectionView({ ipv4:disputed, ipv6:noIp6 });
  assert.equal(view.primary.locationState, 'available');
  assert.equal(view.primary.locationDisagreement, true);
  assert.equal(view.primary.location.countryCode, 'RU');
  assert.equal(view.primary.location.country, 'Russia');
});

test('GeoIP unavailable is explicit instead of silently missing', () => {
  const unavailableGeo = { ...ip4, geo:{status:'unavailable',countryCode:null,country:null,city:null,region:null,agreement:{countryState:'unavailable'}} };
  const view = buildConnectionView({ ipv4:unavailableGeo, ipv6:noIp6 });
  assert.equal(view.primary.locationState, 'unavailable');
  assert.equal(view.primary.location, null);
  assert.equal(view.primary.locationDisagreement, false);
});

test('healthy WebRTC creates compact no-mismatch leak view', () => {
  const view = buildLeakView({
    ipv4:ip4, ipv6:noIp6,
    webrtc:{status:'complete',publicAddresses:['128.71.33.91'],candidates:[{address:'host.local',classification:'mdns',type:'host',protocol:'udp'}],summary:{host:1,srflx:0,relay:0,ipv4:0,ipv6:0,udp:1,tcp:0}}
  });
  assert.equal(view.publicMismatch, false);
  assert.equal(view.status, 'clear');
  assert.equal(view.mdnsProtection, true);
});

test('WebRTC public mismatch exposes the mismatching address in summary', () => {
  const view = buildLeakView({ ipv4:ip4, ipv6:noIp6, webrtc:{status:'complete',publicAddresses:['203.0.113.8'],candidates:[{address:'203.0.113.8',classification:'public',type:'srflx',protocol:'udp'}],summary:{}} });
  assert.equal(view.publicMismatch, true);
  assert.deepEqual(view.mismatchAddresses, ['203.0.113.8']);
});

test('WebRTC does not call mismatch when HTTP has no authoritative consensus', () => {
  const view = buildLeakView({ ipv4:{family:4,confidence:'no-consensus',address:null}, ipv6:{family:6,confidence:'unavailable',address:null}, webrtc:{status:'complete',publicAddresses:['203.0.113.8'],candidates:[],summary:{}} });
  assert.equal(view.publicMismatch, false);
  assert.equal(view.status, 'unavailable');
});

test('privacy view represents timezone mismatch once and moves routine fields to details', () => {
  const view = buildPrivacyView({ browser:{timezone:'Europe/Moscow',languages:['en-US','en','ru'],platform:'Win32',secureContext:true,gpc:null,doNotTrack:null}, privacy:{ipTimezones:['Europe/Berlin'],timezoneMatch:false} });
  assert.equal(view.status, 'review');
  assert.equal(view.summaryRows.filter((row) => row.id === 'timezone').length, 1);
  assert.ok(view.detailRows.some((row) => row.id === 'platform'));
});

test('unavailable advanced row is one concise state', () => {
  const view = buildAdvancedRowView({id:'tls',title:'TLS fingerprint',result:{status:'unavailable',error:'TLS reflector unavailable.'}});
  assert.equal(view.statusLabel, 'Unavailable');
  assert.equal(view.expandable, false);
});

test('successful advanced row is expandable and keeps its compact summary', () => {
  const view = buildAdvancedRowView({id:'tls',title:'TLS fingerprint',result:{status:'complete'},summary:'TLS 1.3 · JA4 available'});
  assert.equal(view.statusLabel, 'Complete');
  assert.equal(view.expandable, true);
  assert.equal(view.summary, 'TLS 1.3 · JA4 available');
});
