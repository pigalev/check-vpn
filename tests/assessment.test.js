import test from 'node:test';
import assert from 'node:assert/strict';
import { assessResults } from '../assets/assessment.js';

const completeIp = (family, address) => ({
  status:'complete', confidence:'strong', family, address,
  agreement:{ agree:true, available:3, total:3, selectedVotes:3, winningShare:1 }, error:null
});

const unavailable6 = { status:'unavailable', confidence:'unavailable', family:6, address:null, agreement:{agree:true}, error:null };
const rtc = (address = null) => ({ status:'complete', publicAddresses:address ? [address] : [], candidates:[], error:null });

test('reports protected when WebRTC matches authoritative HTTP addresses', () => {
  const result = assessResults({ ipv4:completeIp(4,'203.0.113.10'), ipv6:unavailable6, webrtc:rtc('203.0.113.10') });
  assert.equal(result.status, 'protected');
  assert.equal(result.findings.length, 0);
});

test('reports leak when WebRTC exposes a different public address', () => {
  const result = assessResults({ ipv4:completeIp(4,'203.0.113.10'), ipv6:unavailable6, webrtc:rtc('198.51.100.25') });
  assert.equal(result.status, 'leak');
  assert.equal(result.findings.some((finding) => finding.id === 'webrtc-public-mismatch'), true);
});

test('strong 4-1 consensus is not Review merely because one provider differs', () => {
  const ipv4 = { ...completeIp(4,'203.0.113.10'), agreement:{agree:false,available:5,total:5,counts:{'203.0.113.10':4,'203.0.113.11':1},selectedVotes:4,winningShare:0.8} };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('203.0.113.10') });
  assert.equal(result.status, 'protected');
  assert.equal(result.findings.some((finding) => finding.id === 'ipv4-source-disagreement'), false);
});

test('no-consensus HTTP family cannot make WebRTC public IP a mismatch leak', () => {
  const result = assessResults({
    ipv4:{status:'partial',confidence:'no-consensus',family:4,address:null,observedAddresses:['203.0.113.10','198.51.100.25'],agreement:{agree:false,available:2,total:2}},
    ipv6:unavailable6, webrtc:rtc('198.51.100.25')
  });
  assert.notEqual(result.status, 'leak');
  assert.equal(result.findings.some((finding) => finding.id === 'webrtc-public-mismatch'), false);
  assert.equal(result.findings.some((finding) => finding.id === 'ipv4-no-consensus'), true);
});

test('no-consensus with no authoritative HTTP family is never Protected', () => {
  const result = assessResults({ ipv4:{status:'partial',confidence:'no-consensus',family:4,address:null,agreement:{agree:false,available:3,total:3}}, ipv6:unavailable6, webrtc:rtc() });
  assert.ok(['review','incomplete'].includes(result.status));
});

test('reserve use alone does not create a finding', () => {
  const ipv4 = { ...completeIp(4,'203.0.113.10'), reserve:{used:true,sources:[]} };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('203.0.113.10') });
  assert.equal(result.status, 'protected');
  assert.equal(result.findings.length, 0);
});

test('GeoIP unavailable does not create country disagreement Review', () => {
  const ipv4 = { ...completeIp(4,'94.25.174.96'), geo:{status:'unavailable',agreement:{countryState:'unavailable',countryAgree:null}} };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('94.25.174.96') });
  assert.equal(result.findings.some((finding) => finding.id === 'ipv4-geo-country-disagreement'), false);
  assert.equal(result.status, 'protected');
});

test('single GeoIP country does not create disagreement Review', () => {
  const ipv4 = { ...completeIp(4,'94.25.174.96'), geo:{status:'partial',countryCode:'RU',country:'Russia',agreement:{countryState:'single-source',countryAgree:null}} };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('94.25.174.96') });
  assert.equal(result.findings.some((finding) => finding.id === 'ipv4-geo-country-disagreement'), false);
  assert.equal(result.status, 'protected');
});

test('actual GeoIP country disagreement still creates Review', () => {
  const ipv4 = { ...completeIp(4,'94.25.174.96'), geo:{status:'partial',countryCode:'RU',country:'Russia',agreement:{countryState:'disagree',countryAgree:false}} };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('94.25.174.96') });
  assert.equal(result.findings.some((finding) => finding.id === 'ipv4-geo-country-disagreement'), true);
  assert.equal(result.status, 'review');
});

test('same country but different location stays Protected with info reason', () => {
  const ipv4 = {
    ...completeIp(4,'203.0.113.10'),
    geo:{
      status:'complete', countryCode:'DE', country:'Germany', city:'Neu-Isenburg', region:'Hesse',
      agreement:{countryState:'agree',locationState:'disagree'},
      sources:[
        {status:'complete',country:'Germany',countryCode:'DE',city:'Neu-Isenburg',region:'Hesse'},
        {status:'complete',country:'Germany',countryCode:'DE',city:'Frankfurt am Main',region:'Hesse'}
      ]
    }
  };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('203.0.113.10') });
  assert.equal(result.status, 'protected');
  const info = result.findings.find((item) => item.code === 'GEO_LOCATION_DISAGREEMENT');
  assert.equal(info?.severity, 'info');
  assert.match(info?.details ?? '', /Neu-Isenburg/);
  assert.match(info?.details ?? '', /Frankfurt/);
});

test('country disagreement is Review with a stable reason code and evidence', () => {
  const ipv4 = {
    ...completeIp(4,'203.0.113.10'),
    geo:{
      status:'complete', countryCode:'DE', country:'Germany', city:'Neu-Isenburg', region:'Hesse',
      agreement:{countryState:'disagree',locationState:'disagree'},
      sources:[
        {status:'complete',country:'Germany',countryCode:'DE',city:'Neu-Isenburg',region:'Hesse'},
        {status:'complete',country:'Russia',countryCode:'RU',city:'Moscow',region:'Moscow'}
      ]
    }
  };
  const result = assessResults({ ipv4, ipv6:unavailable6, webrtc:rtc('203.0.113.10') });
  assert.equal(result.status, 'review');
  const finding = result.findings.find((item) => item.code === 'GEO_COUNTRY_DISAGREEMENT');
  assert.ok(finding);
  assert.match(finding.details, /Germany/);
  assert.match(finding.details, /Russia/);
});

test('qualifies incomplete results', () => {
  const result = assessResults({ ipv4:{status:'unavailable',confidence:'unavailable',family:4,address:null,error:null}, ipv6:unavailable6, webrtc:{status:'unavailable',publicAddresses:[],candidates:[],error:null} });
  assert.equal(result.status, 'incomplete');
});

test('guided known-real finding forces top-level leak', () => {
  const result = assessResults({
    ipv4:completeIp(4,'77.110.1.1'), ipv6:unavailable6, webrtc:rtc('77.110.1.1'),
    guidedFindings:[{id:'guided-real-ip',severity:'leak',category:'guided',summary:'Known real IP exposed',details:'95.25.1.2',sources:['guided-test']}]
  });
  assert.equal(result.status, 'leak');
  assert.equal(result.findings.some((finding) => finding.id === 'guided-real-ip'), true);
});
