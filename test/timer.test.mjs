import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,current,change,MINUTE} from '../public/timer.mjs';

test('hourly sync at 8:10 PM shows 40 minutes, at 8:55 shows 5-minute break',()=>{
  for(const [iso,phase,minutes] of [['2026-10-23T20:10:00-04:00','focus',40],['2026-10-23T20:50:00-04:00','break',10],['2026-10-23T20:55:00-04:00','break',5],['2026-10-23T21:00:00-04:00','focus',50]]){
    const s=change(initialState(),{type:'sync'},Date.parse(iso));assert.equal(s.phase,phase);assert.equal(s.remaining,minutes*MINUTE);
  }
});
test('winter, midnight and both daylight saving transitions remain aligned',()=>{
  for(const iso of ['2026-01-01T00:00:00-05:00','2026-03-08T03:00:00-04:00','2026-11-01T01:00:00-04:00','2026-11-01T01:00:00-05:00']){
    const s=current({...initialState(),mode:'hourly'},Date.parse(iso));assert.equal(s.phase,'focus');assert.equal(s.remaining,50*MINUTE);
  }
});
test('hourly transitions happen at millisecond boundaries',()=>{
  const start=Date.parse('2026-10-23T20:49:59.999-04:00');const state=change(initialState(),{type:'sync'},start);
  assert.equal(current(state,start).remaining,1);assert.equal(current(state,start+1).phase,'break');
  assert.equal(current(state,start+600001).phase,'focus');
});
test('pause preserves remaining time and leaves hourly mode; resume uses that time',()=>{
  const now=Date.parse('2026-10-23T20:10:00-04:00');let s=change(initialState(),{type:'sync'},now);
  s=change(s,{type:'pause'},now);assert.equal(s.mode,'custom');assert.equal(current(s,now+MINUTE).remaining,40*MINUTE);
  s=change(s,{type:'start'},now+MINUTE);assert.equal(s.endsAt,now+41*MINUTE);
});
test('custom cycles catch up after a long absence and apply new durations',()=>{
  let s=change(initialState(),{type:'start'},0);
  assert.equal(current(s,50*MINUTE).phase,'break');assert.equal(current(s,60*MINUTE).remaining,50*MINUTE);
  assert.equal(current(s,1000*60*MINUTE+55*MINUTE).remaining,5*MINUTE);
  s=change(s,{type:'durations',focus:25,rest:5},10*MINUTE);assert.equal(s.endsAt,35*MINUTE);
  for(const value of [0,-1,1.5,181,'25',null])assert.throws(()=>change(s,{type:'durations',focus:value,rest:5},0));
});
