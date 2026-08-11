import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAddressFamilies } from '../assets/network-assessment.js';

test('no-consensus HTTP family cannot create a WebRTC mismatch finding', () => {
  const findings = assessAddressFamilies({
    ipv4:{ family:4, status:'partial', confidence:'no-consensus', address:null, observedAddresses:['203.0.113.1','203.0.113.2'] },
    ipv6:{ family:6, status:'unavailable', confidence:'unavailable', address:null },
    webrtc:{ status:'complete', publicAddresses:['203.0.113.2'] }
  });
  assert.equal(findings.some((finding) => finding.id === 'webrtc-public-mismatch'), false);
});

test('cross-family metadata comparison requires authoritative addresses for both families', () => {
  const findings = assessAddressFamilies({
    ipv4:{ family:4, status:'complete', confidence:'strong', address:'203.0.113.1', geo:{countryCode:'DE',asn:'AS1',org:'A'} },
    ipv6:{ family:6, status:'partial', confidence:'no-consensus', address:null, geo:{countryCode:'US',asn:'AS2',org:'B'} },
    webrtc:{ status:'complete', publicAddresses:[] }
  });
  assert.equal(findings.some((finding) => ['possible-ipv6-bypass','ip-family-network-difference'].includes(finding.id)), false);
});
