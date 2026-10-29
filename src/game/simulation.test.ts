import { describe, expect, test } from 'vitest';
import { createGame, applyCommand } from './engine';
import { CARDS } from './catalog';
import { viewForPlayer } from './views';
import type { GameCommand, GameState } from './types';

function candidates(s:GameState):GameCommand[] {
  const actor=s.decisionPlayer, own=s.players[actor], other=s.players[actor===0?1:0];
  const fields=s.players.flatMap(p=>p.field);
  if(s.phase==='trap') return [{type:'respond',activate:true},{type:'respond',activate:false}];
  if(s.phase==='effect' && s.pending?.kind==='effect') {
    const def=s.cards[s.pending.cardId].def;
    if(def==='sake') return [...fields.map(cardId=>({type:'choose' as const,allocations:[{cardId,count:1}]})),{type:'choose',allocations:[]}];
    if(def==='ougi') return fields.flatMap(a=>fields.filter(b=>a!==b).map(b=>({type:'choose' as const,targets:[a,b]})));
    const ids=def==='boseki'?s.players.flatMap(p=>p.graveyard):def==='karakasa-kozo'?s.players.flatMap(p=>p.trap?[p.trap]:[]):fields;
    const out:GameCommand[]=ids.map(id=>({type:'choose',targets:[id]}));
    if(def==='jufu') { for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) out.push({type:'choose',targets:[ids[i],ids[j]]}); out.push({type:'choose',targets:[]}); }
    return out;
  }
  const out:GameCommand[]=[];
  for(const cardId of own.hand) {
    out.push({type:'play',cardId});
    if(CARDS[s.cards[cardId].def].kind==='spell') out.push({type:'setTrap',cardId});
  }
  if(own.trap) out.push({type:'play',cardId:own.trap});
  for(const cardId of own.field) {
    out.push({type:'evoke',cardId},{type:'release',cardId});
    for(const target of other.field.length?other.field:[null]) out.push({type:'attack',attacker:cardId,target});
  }
  out.push({type:'endTurn'});
  return out;
}

function invariant(s:GameState) {
  const zones=s.players.flatMap(p=>[...p.deck,...p.hand,...p.field,...p.graveyard,...(p.trap?[p.trap]:[])]);
  expect(zones).toHaveLength(30);
  expect(new Set(zones).size).toBe(30);
  expect(Object.keys(s.cards).sort()).toEqual([...zones].sort());
  expect(s.supply+Object.values(s.cards).reduce((n,c)=>n+c.souls,0)).toBe(11);
  for(const p of s.players) { expect(p.field.length).toBeLessThanOrEqual(3); expect(p.health).toBeGreaterThanOrEqual(0); }
  for(const c of Object.values(s.cards)) {
    expect(c.souls).toBeGreaterThanOrEqual(0);
    expect(c.souls).toBeLessThanOrEqual(CARDS[c.def].cap);
    if(!s.players.some(p=>p.field.includes(c.id))) expect(c.souls).toBe(0);
  }
  const v=viewForPlayer(s,s.decisionPlayer);
  expect(v.players[s.decisionPlayer===0?1:0].hand).toBeNull();
  expect(JSON.stringify(v)).not.toContain('"deck":');
}

describe('complete match simulations',()=>{
  test.each(Array.from({length:24},(_,i)=>i+1))('seed %i finishes legally and replays exactly',seed=>{
    let state=createGame({seed,startingPlayer:(seed%2) as 0|1});
    const initial=structuredClone(state), commands:GameCommand[]=[];
    let random=seed;
    for(let step=0;!state.result && step<500;step++) {
      invariant(state);
      const before=JSON.stringify(state);
      const options=candidates(state).flatMap(command=>{
        try { return [{command,next:applyCommand(state,state.decisionPlayer,command)}]; } catch { return []; }
      });
      expect(JSON.stringify(state)).toBe(before);
      expect(options.length,`stuck at ${state.phase} ${JSON.stringify(state.pending)}`).toBeGreaterThan(0);
      random=(Math.imul(random,1664525)+1013904223)>>>0;
      const selected=options[random%options.length];
      commands.push(selected.command); state=selected.next;
    }
    expect(state.result).not.toBeNull(); invariant(state);
    let replay=initial;
    for(const command of commands) replay=applyCommand(replay,replay.decisionPlayer,command);
    expect(replay).toEqual(state);
  });
});
