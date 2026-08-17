import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectionView } from '../assets/dashboard-view.js';

const noIp6 = { family:6, status:'unavailable', address:null, ipFinal:true, geoFinal:true };

function strongIpv4(reserve) {
  return {
    family:4,
    status:'complete',
    confidence:'strong',
    address:'203.0.113.10',
    ipFinal:true,
    geoFinal:true,
    agreement:{
      available:4,
      total:5,
      agree:true,
      selectedVotes:4,
      counts:{'203.0.113.10':4}
    },
    primary:{available:4,total:5,sources:[]},
    reserve,
    geo:null
  };
}

test('Strong main summary shows only successful vote consensus', () => {
  const view = buildConnectionView({
    ipv4:strongIpv4({attempted:false,contributed:false,notNeeded:true,used:false,sources:[]}),
    ipv6:noIp6
  });
  assert.equal(view.primary.sourceText, 'Strong consensus · 4/4 agree');
});

test('Strong main summary hides failed reserve attempt', () => {
  const view = buildConnectionView({
    ipv4:strongIpv4({attempted:true,contributed:false,notNeeded:false,used:true,sources:[{status:'unavailable'}]}),
    ipv6:noIp6
  });
  assert.equal(view.primary.sourceText, 'Strong consensus · 4/4 agree');
});

test('Strong main summary mentions reserve only when it contributed', () => {
  const view = buildConnectionView({
    ipv4:strongIpv4({attempted:true,contributed:true,notNeeded:false,used:true,sources:[{status:'complete',address:'203.0.113.10'}]}),
    ipv6:noIp6
  });
  assert.equal(view.primary.sourceText, 'Strong consensus · 4/4 agree · reserve contributed');
});
