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
  address: '128.71.33.91',
  ipFinal: true,
  geoFinal: true,
  agreement: { available: 3, total: 3, agree: true },
  geo: {
    status: 'complete', countryCode: 'RU', country: 'Russia', city: 'Krasnodar',
    asn: 'AS3216', org: 'VimpelCom', agreement: { available: 3, total: 4 }, differences: []
  }
};

const noIp6 = {
  family: 6,
  status: 'unavailable',
  address: null,
  ipFinal: true,
  geoFinal: true
};

test('connection view makes IPv4 primary and unavailable IPv6 one compact row', () => {
  const view = buildConnectionView({ ipv4: ip4, ipv6: noIp6, assessment: { status: 'protected' } });
  assert.equal(view.primary.family, 4);
  assert.equal(view.primary.address, '128.71.33.91');
  assert.equal(view.secondary.family, 6);
  assert.equal(view.secondary.state, 'not-detected');
  assert.equal(view.secondary.address, null);
  assert.equal(view.verdict, 'protected');
});

test('IPv6 becomes primary when IPv4 is unavailable', () => {
  const ipv6 = {
    family: 6, status: 'complete', address: '2a00:1450::1', ipFinal: true, geoFinal: true,
    agreement: { available: 2, total: 3, agree: true },
    geo: { status: 'complete', country: 'Germany', city: 'Frankfurt' }
  };
  const view = buildConnectionView({ ipv4: { family:4, address:null, ipFinal:true }, ipv6 });
  assert.equal(view.primary.family, 6);
  assert.equal(view.primary.address, '2a00:1450::1');
});

test('both public families absent produce a compact unavailable hero state', () => {
  const view = buildConnectionView({
    ipv4: { family:4, address:null, ipFinal:true },
    ipv6: { family:6, address:null, ipFinal:true }
  });
  assert.equal(view.primary.address, null);
  assert.equal(view.primary.state, 'not-detected');
  assert.equal(view.secondary.state, 'not-detected');
});

test('provisional address stays visible with checking states', () => {
  const view = buildConnectionView({
    ipv4: { family:4, address:'128.71.33.91', ipFinal:false, geoPending:true, geo:null },
    ipv6: { family:6, address:null, ipFinal:false }
  });
  assert.equal(view.primary.state, 'detected');
  assert.equal(view.primary.sourceText, 'Checking…');
  assert.equal(view.primary.locationState, 'locating');
});

test('healthy WebRTC creates compact no-mismatch leak view', () => {
  const view = buildLeakView({
    ipv4: ip4,
    ipv6: noIp6,
    webrtc: {
      status:'complete',
      publicAddresses:['128.71.33.91'],
      candidates:[{ address:'host.local', classification:'mdns', type:'host', protocol:'udp' }],
      summary:{ host:1, srflx:0, relay:0, ipv4:0, ipv6:0, udp:1, tcp:0 }
    }
  });
  assert.equal(view.publicMismatch, false);
  assert.equal(view.status, 'clear');
  assert.equal(view.mdnsProtection, true);
});

test('WebRTC public mismatch exposes the mismatching address in summary', () => {
  const view = buildLeakView({
    ipv4: ip4,
    ipv6: noIp6,
    webrtc: {
      status:'complete',
      publicAddresses:['203.0.113.8'],
      candidates:[{ address:'203.0.113.8', classification:'public', type:'srflx', protocol:'udp' }],
      summary:{ host:0, srflx:1, relay:0, ipv4:1, ipv6:0, udp:1, tcp:0 }
    }
  });
  assert.equal(view.publicMismatch, true);
  assert.deepEqual(view.mismatchAddresses, ['203.0.113.8']);
});

test('privacy view represents timezone mismatch once and moves routine fields to details', () => {
  const view = buildPrivacyView({
    browser:{ timezone:'Europe/Moscow', languages:['en-US','en','ru'], platform:'Win32', secureContext:true, gpc:null, doNotTrack:null },
    privacy:{ ipTimezones:['Europe/Berlin'], timezoneMatch:false }
  });
  assert.equal(view.status, 'review');
  assert.equal(view.summaryRows.filter((row) => row.id === 'timezone').length, 1);
  assert.ok(view.detailRows.some((row) => row.id === 'platform'));
  assert.ok(!view.summaryRows.some((row) => row.id === 'platform'));
});

test('unavailable advanced row is one concise state', () => {
  const view = buildAdvancedRowView({
    id:'tls', title:'TLS fingerprint',
    result:{ status:'unavailable', error:'TLS reflector unavailable.' }
  });
  assert.equal(view.statusLabel, 'Unavailable');
  assert.equal(view.expandable, false);
  assert.equal(view.fields.length, 0);
});

test('successful advanced row is expandable and keeps its compact summary', () => {
  const view = buildAdvancedRowView({
    id:'tls', title:'TLS fingerprint',
    result:{ status:'complete', observedIp:'198.51.100.4', tlsVersion:'TLS 1.3', ja3Hash:'abc', ja4:'def' },
    summary:'TLS 1.3 · JA4 available'
  });
  assert.equal(view.statusLabel, 'Complete');
  assert.equal(view.expandable, true);
  assert.equal(view.summary, 'TLS 1.3 · JA4 available');
});
