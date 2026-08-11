import test from 'node:test';
import assert from 'node:assert/strict';
import { assessResults } from '../assets/assessment.js';

const completeIp = (family, address) => ({
  status:'complete', confidence:'strong', family, address,
  agreement:{ agree:true, available:3, total:3, selectedVotes:3, winningShare:1 }, error:null
});

const unavailable6 = { status:'unavailable', confidence:'unavailable', family:6, address:null, agreement:{agree:true}, error:null };

test('reports protected when WebRTC matches authoritative HTTP addresses', () => {
  const result = assessResults({
    ipv4: completeIp(4, '203.0.113.10'), ipv6: unavailable6,
    webrtc: { status:'complete', publicAddresses:['203.0.113.10'], candidates:[], error:null }
  });
  assert.equal(result.status, 'protected');
  assert.equal(result.findings.length, 0);
});

test('reports leak when WebRTC exposes a different public address', () => {
  const result = assessResults({
    ipv4: completeIp(4, '203.0.113.10'), ipv6: unavailable6,
    webrtc: { status:'complete', publicAddresses:['198.51.100.25'], candidates:[], error:null }
  });
  assert.equal(result.status, 'leak');
  assert.equal(result.findings.some((finding) => finding.id === 'webrtc-public-mismatch'), true);
});

test('strong 4-1 consensus is not Review merely because one provider differs', () => {
  const ipv4 = {
    ...completeIp(4, '203.0.113.10'),
    agreement:{ agree:false, available:5,total:5,counts:{'203.0.113.10':4,'203.0.113.11':1},selectedVotes:4,winningShare:0.8 }
  };
  const result = assessResults({
    ipv4, ipv6: unavailable6,
    webrtc:{ status:'complete', publicAddresses:['203.0.113.10'], candidates:[] }
  });
  assert.equal(result.status, 'protected');
  assert.equal(result.findings.some((finding) => finding.id === 'ipv4-source-disagreement'), false);
});

test('no-consensus HTTP family cannot make WebRTC public IP a mismatch leak', () => {
  const result = assessResults({
    ipv4:{ status:'partial', confidence:'no-consensus', family:4, address:null, observedAddresses:['203.0.113.10','198.51.100.25'], agreement:{agree:false,available:2,total:2} },
    ipv6: unavailable6,
    webrtc:{ status:'complete', publicAddresses:['198.51.100.25'], candidates:[] }
  });
  assert.notEqual(result.status, 'leak');
  assert.equal(result.findings.some((finding) => finding.id === 'webrtc-public-mismatch'), false);
  assert.equal(result.findings.some((finding) => finding.id === 'ipv4-no-consensus'), true);
});

test('no-consensus with no authoritative HTTP family is never Protected', () => {
  const result = assessResults({
    ipv4:{ status:'partial', confidence:'no-consensus', family:4, address:null, agreement:{agree:false,available:3,total:3} },
    ipv6: unavailable6,
    webrtc:{ status:'complete', publicAddresses:[], candidates:[] }
  });
  assert.ok(['review','incomplete'].includes(result.status));
});

test('reserve use alone does not create a finding', () => {
  const ipv4 = { ...completeIp(4, '203.0.113.10'), reserve:{used:true,sources:[]} };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:{status:'complete',publicAddresses:['203.0.113.10'],candidates:[]} });
  assert.equal(result.status, 'protected');
  assert.equal(result.findings.length, 0);
});

test('qualifies incomplete results', () => {
  const result = assessResults({
    ipv4:{ status:'unavailable',confidence:'unavailable',family:4,address:null,error:null },
    ipv6:unavailable6,
    webrtc:{ status:'unavailable',publicAddresses:[],candidates:[],error:null }
  });
  assert.equal(result.status, 'incomplete');
});

test('guided known-real finding forces top-level leak', () => {
  const result = assessResults({
    ipv4:completeIp(4, '77.110.1.1'), ipv6:unavailable6,
    webrtc:{status:'complete',publicAddresses:['77.110.1.1'],candidates:[],error:null},
    guidedFindings:[{id:'guided-real-ip',severity:'leak',category:'guided',summary:'Known real IP exposed',details:'95.25.1.2',sources:['guided-test']}]
  });
  assert.equal(result.status, 'leak');
  assert.equal(result.findings.some((finding) => finding.id === 'guided-real-ip'), true);
});
