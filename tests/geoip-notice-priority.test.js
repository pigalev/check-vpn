import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectionView } from '../assets/dashboard-view.js';

test('location disagreement outranks a single-source country notice in the connection hero', () => {
  const ipv4 = {
    family:4,
    status:'complete',
    confidence:'strong',
    address:'203.0.113.10',
    ipFinal:true,
    geoFinal:true,
    agreement:{available:4,total:5,selectedVotes:4,counts:{'203.0.113.10':4}},
    primary:{available:4,total:5},
    reserve:{used:false,sources:[]},
    geo:{
      status:'complete',
      countryCode:'DE',
      country:'Germany',
      city:'Frankfurt',
      region:'Hesse',
      agreement:{available:2,total:3,countryState:'single-source',locationState:'disagree'},
      sources:[
        {status:'complete',countryCode:'DE',country:'Germany',city:'Frankfurt',region:'Hesse'},
        {status:'complete',countryCode:null,country:null,city:'Neu-Isenburg',region:'Hesse'}
      ]
    }
  };
  const ipv6 = {family:6,status:'unavailable',confidence:'unavailable',address:null,ipFinal:true,geoFinal:true};
  const view = buildConnectionView({ipv4,ipv6,assessment:{status:'protected'}});
  assert.equal(view.primary.geoNotice.code, 'GEO_LOCATION_DISAGREEMENT');
  assert.equal(view.primary.geoNotice.severity, 'info');
});
