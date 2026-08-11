import test from 'node:test';
import assert from 'node:assert/strict';
import { runGeoIpConsensus } from '../assets/geoip.js';
import { buildGeoIpEvidence } from '../assets/geoip-evidence.js';

const providers = [
  {id:'coded',label:'Coded',kind:'ipapi',urlTemplate:'https://coded.example/{ip}'},
  {id:'named',label:'Named',kind:'ipapi',urlTemplate:'https://named.example/{ip}'}
];

test('country code plus matching country name is agreement, not a false disagreement', async () => {
  const fetchImpl = async (url) => ({
    ok:true,
    json:async()=> url.includes('coded.example')
      ? {country_code:'DE',country_name:'Germany',region:'Hesse',city:'Frankfurt'}
      : {country_name:'Germany',region:'Hesse',city:'Frankfurt'}
  });
  const result = await runGeoIpConsensus({ip:'203.0.113.10',providers,timeoutMs:100,fetchImpl});
  assert.equal(result.agreement.countryState,'agree');
  assert.equal(result.agreement.countryAgree,true);
});

test('Advanced evidence maps a matching country name to the selected country code', () => {
  const view = buildGeoIpEvidence({
    ip:'203.0.113.10',countryCode:'DE',country:'Germany',city:'Frankfurt',region:'Hesse',
    agreement:{available:2,total:2,countryState:'agree',locationState:'agree'},
    sources:[
      {status:'complete',source:{id:'coded',label:'Coded'},countryCode:'DE',country:'Germany',city:'Frankfurt',region:'Hesse'},
      {status:'complete',source:{id:'named',label:'Named'},countryCode:null,country:'Germany',city:'Frankfurt',region:'Hesse'}
    ]
  });
  assert.equal(view.rows[0].countryRelation,'selected');
  assert.equal(view.rows[1].countryRelation,'selected');
});
