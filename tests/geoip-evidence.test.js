import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeoIpEvidence } from '../assets/geoip-evidence.js';

test('provider evidence shows which field differs', () => {
  const view = buildGeoIpEvidence({
    ip:'31.76.17.233', countryCode:'DE', country:'Germany', region:'Hesse', city:'Neu-Isenburg',
    agreement:{available:3,total:3,countryState:'disagree',locationState:'disagree'},
    sources:[
      {status:'complete',source:{id:'a',label:'A'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Neu-Isenburg',timezone:'Europe/Berlin',latencyMs:100},
      {status:'complete',source:{id:'b',label:'B'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt am Main',timezone:'Europe/Berlin',latencyMs:120},
      {status:'complete',source:{id:'c',label:'C'},countryCode:'RU',country:'Russia',region:'Moscow',city:'Moscow',timezone:'Europe/Moscow',latencyMs:140}
    ]
  });
  assert.equal(view.responded, 3);
  assert.equal(view.total, 3);
  assert.equal(view.countryState, 'disagree');
  assert.equal(view.locationState, 'disagree');
  assert.equal(view.rows[0].countryRelation, 'selected');
  assert.equal(view.rows[0].locationRelation, 'selected');
  assert.equal(view.rows[1].countryRelation, 'selected');
  assert.equal(view.rows[1].locationRelation, 'differs');
  assert.equal(view.rows[2].countryRelation, 'differs');
  assert.equal(view.rows[2].locationRelation, 'differs');
});

test('unavailable provider is unavailable, not disagreement', () => {
  const view = buildGeoIpEvidence({
    ip:'203.0.113.10',countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt',
    agreement:{available:1,total:2,countryState:'single-source',locationState:'single-source'},
    sources:[
      {status:'complete',source:{id:'a',label:'A'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt'},
      {status:'unavailable',source:{id:'b',label:'B'},error:'Location unavailable.'}
    ]
  });
  assert.equal(view.rows[1].status, 'unavailable');
  assert.equal(view.rows[1].countryRelation, 'unavailable');
  assert.equal(view.rows[1].locationRelation, 'unavailable');
});

test('missing provider field is missing instead of a disagreement', () => {
  const view = buildGeoIpEvidence({
    ip:'203.0.113.10',countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt',
    agreement:{available:2,total:2,countryState:'single-source',locationState:'single-source'},
    sources:[
      {status:'complete',source:{id:'a',label:'A'},countryCode:'DE',country:'Germany',region:'Hesse',city:'Frankfurt'},
      {status:'complete',source:{id:'b',label:'B'},countryCode:null,country:null,region:null,city:null,asn:'AS64500'}
    ]
  });
  assert.equal(view.rows[1].countryRelation, 'missing');
  assert.equal(view.rows[1].locationRelation, 'missing');
});
