import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIpProviderEvidence } from '../assets/provider-evidence.js';

test('different successful public IP is labeled differs', () => {
  const view = buildIpProviderEvidence({
    address:'128.71.33.91',
    agreement:{ available:3,total:3,agree:false,counts:{'128.71.33.91':2,'128.71.35.12':1} },
    sources:[
      {id:'a',label:'ipify',status:'complete',address:'128.71.33.91',latencyMs:182},
      {id:'b',label:'IPPubblico',status:'complete',address:'128.71.33.91',latencyMs:241},
      {id:'c',label:'ipwho.is',status:'complete',address:'128.71.35.12',latencyMs:390}
    ]
  });
  assert.equal(view.selectedVotes, 2);
  assert.equal(view.majority, true);
  assert.equal(view.differentValues, 1);
  assert.equal(view.sources[2].relation, 'differs');
  assert.equal(view.sources[2].address, '128.71.35.12');
});

test('unavailable provider is not disagreement', () => {
  const view = buildIpProviderEvidence({
    address:'128.71.33.91',
    agreement:{ available:2,total:3,agree:true,counts:{'128.71.33.91':2} },
    sources:[
      {id:'a',label:'ipify',status:'complete',address:'128.71.33.91',latencyMs:182},
      {id:'b',label:'IPPubblico',status:'complete',address:'128.71.33.91',latencyMs:241},
      {id:'c',label:'ipwho.is',status:'unavailable',address:null,latencyMs:6001,error:'Request timed out'}
    ]
  });
  assert.equal(view.sources[2].relation, 'unavailable');
  assert.equal(view.differentValues, 0);
  assert.match(view.summary, /2 of 2 successful sources agree/i);
});

test('tie explicitly says there was no majority and retains alternative', () => {
  const view = buildIpProviderEvidence({
    address:'203.0.113.1',
    agreement:{ available:2,total:3,agree:false,counts:{'203.0.113.1':1,'203.0.113.2':1} },
    sources:[
      {id:'a',label:'A',status:'complete',address:'203.0.113.1',latencyMs:100},
      {id:'b',label:'B',status:'complete',address:'203.0.113.2',latencyMs:120},
      {id:'c',label:'C',status:'unavailable',address:null,latencyMs:6000,error:'timeout'}
    ]
  });
  assert.equal(view.tied, true);
  assert.equal(view.majority, false);
  assert.match(view.summary, /No majority/i);
  assert.equal(view.sources.find((row) => row.address === '203.0.113.2').relation, 'differs');
});

test('all successful sources agreeing reports selected consensus cleanly', () => {
  const view = buildIpProviderEvidence({
    address:'203.0.113.4',
    agreement:{ available:3,total:3,agree:true,counts:{'203.0.113.4':3} },
    sources:[
      {id:'a',label:'A',status:'complete',address:'203.0.113.4',latencyMs:100},
      {id:'b',label:'B',status:'complete',address:'203.0.113.4',latencyMs:120},
      {id:'c',label:'C',status:'complete',address:'203.0.113.4',latencyMs:140}
    ]
  });
  assert.equal(view.selectedVotes, 3);
  assert.equal(view.differentValues, 0);
  assert.match(view.summary, /3 of 3 successful sources agree/i);
});
