import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIpProviderEvidence } from '../assets/provider-evidence.js';

function baseResult(overrides = {}) {
  return {
    family:4,
    confidence:'strong',
    address:'128.71.33.91',
    agreement:{ available:5,total:5,agree:false,counts:{'128.71.33.91':4,'128.71.35.12':1},selectedVotes:4,winningShare:0.8 },
    primary:{ available:5,total:5,sources:[] },
    reserve:{ used:false,sources:[{id:'reserve',group:'ippubblico',label:'IPPubblico',tier:'reserve',status:'not-needed',address:null,latencyMs:0,error:'Consensus already guaranteed',attempts:[]}] },
    sources:[],
    ...overrides
  };
}

test('strong majority reports one differing group without counting it unavailable', () => {
  const primary = [
    {id:'a',group:'a',label:'ipify',tier:'primary',status:'complete',address:'128.71.33.91',latencyMs:182,attempts:[]},
    {id:'b',group:'b',label:'ident.me',tier:'primary',status:'complete',address:'128.71.33.91',latencyMs:241,attempts:[]},
    {id:'c',group:'c',label:'SeeIP',tier:'primary',status:'complete',address:'128.71.33.91',latencyMs:260,attempts:[]},
    {id:'d',group:'d',label:'icanhazip',tier:'primary',status:'complete',address:'128.71.33.91',latencyMs:300,attempts:[]},
    {id:'e',group:'e',label:'IP.SB',tier:'primary',status:'complete',address:'128.71.35.12',latencyMs:390,attempts:[]}
  ];
  const result = baseResult({ primary:{available:5,total:5,sources:primary}, sources:[...primary, ...baseResult().reserve.sources] });
  const view = buildIpProviderEvidence(result);
  assert.equal(view.confidence, 'strong');
  assert.equal(view.primary.rows[4].relation, 'differs');
  assert.equal(view.primary.rows.filter((row) => row.relation === 'unavailable').length, 0);
  assert.match(view.summary, /Strong consensus/);
});

test('early-aborted group is not-needed with an explicit reason and no fake latency', () => {
  const reserve = {id:'reserve',group:'ippubblico',label:'IPPubblico',tier:'reserve',status:'not-needed',address:null,latencyMs:0,error:'Consensus already guaranteed',attempts:[]};
  const view = buildIpProviderEvidence(baseResult({ reserve:{used:false,sources:[reserve]}, sources:[reserve] }));
  const row = view.reserve.rows[0];
  assert.equal(view.reserve.used, false);
  assert.equal(row.relation, 'not-needed');
  assert.equal(row.error, 'Consensus already guaranteed');
  assert.equal(row.latencyMs, null);
  assert.equal(view.successful, 5);
  assert.equal(view.total, 5);
});

test('reserve used shows its address and relation', () => {
  const reserve = {id:'reserve',group:'ippubblico',label:'IPPubblico',tier:'reserve',status:'complete',address:'128.71.33.91',latencyMs:440,attempts:[]};
  const view = buildIpProviderEvidence(baseResult({
    agreement:{ available:6,total:6,agree:false,counts:{'128.71.33.91':4,'128.71.35.12':2},selectedVotes:4,winningShare:4/6 },
    reserve:{used:true,sources:[reserve]}, sources:[reserve]
  }));
  assert.equal(view.reserve.used, true);
  assert.equal(view.reserve.rows[0].relation, 'agrees');
  assert.match(view.summary, /reserve used/i);
});

test('ident fallback preserves primary failure and mirror success attempts', () => {
  const ident = {
    id:'ident4',group:'ident',label:'ident.me',tier:'primary',status:'complete',address:'128.71.33.91',latencyMs:420,endpointId:'ident-mirror',
    attempts:[
      {endpointId:'ident-primary',status:'unavailable',address:null,latencyMs:200,error:'offline'},
      {endpointId:'ident-mirror',status:'complete',address:'128.71.33.91',latencyMs:220,error:null}
    ]
  };
  const view = buildIpProviderEvidence(baseResult({ primary:{available:1,total:1,sources:[ident]}, sources:[ident] }));
  assert.equal(view.primary.rows[0].attempts.length, 2);
  assert.equal(view.primary.rows[0].endpointId, 'ident-mirror');
});

test('no-consensus has no selected address and successful rows are observed, not fake agrees/differs', () => {
  const primary = [
    {id:'a',group:'a',label:'A',tier:'primary',status:'complete',address:'203.0.113.1',latencyMs:100,attempts:[]},
    {id:'b',group:'b',label:'B',tier:'primary',status:'complete',address:'203.0.113.2',latencyMs:120,attempts:[]}
  ];
  const result = baseResult({
    confidence:'no-consensus', address:null,
    agreement:{available:2,total:2,agree:false,counts:{'203.0.113.1':1,'203.0.113.2':1},selectedVotes:1,winningShare:0.5},
    primary:{available:2,total:2,sources:primary}, reserve:{used:false,sources:[]}, sources:primary
  });
  const view = buildIpProviderEvidence(result);
  assert.equal(view.selectedAddress, null);
  assert.match(view.summary, /No consensus/);
  assert.deepEqual(view.primary.rows.map((row) => row.relation), ['observed','observed']);
});

test('unavailable group is not disagreement', () => {
  const source = {id:'a',group:'a',label:'A',tier:'primary',status:'unavailable',address:null,latencyMs:3201,error:'Fetch is aborted',attempts:[]};
  const result = baseResult({
    confidence:'partial', address:'128.71.33.91', agreement:{available:2,total:3,agree:true,counts:{'128.71.33.91':2},selectedVotes:2,winningShare:1},
    primary:{available:2,total:3,sources:[source]}, sources:[source]
  });
  const view = buildIpProviderEvidence(result);
  assert.equal(view.primary.rows[0].relation, 'unavailable');
  assert.equal(view.differentValues, 0);
});
