import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './engine';
import { viewForLocalTesting, viewForPlayer } from './views';

describe('privacy projections',()=>{
  it('normal view exposes only own hand and own trap, and no deck order or generator',()=>{
    let s=createGame({seed:234,startingPlayer:0}); const spell=s.players[0].hand.find(id=>s.cards[id].def==='sake');
    // A stable hidden identity must not contain its shared card definition.
    for(const c of Object.values(s.cards)) expect(c.id).not.toContain(c.def);
    if(spell) s=applyCommand(s,0,{type:'setTrap',cardId:spell});
    const v=viewForPlayer(s,1); expect(v.players[0].hand).toBe(null); expect(v.players[1].hand).toHaveLength(4);
    expect(v.players[0].trap).toEqual(spell ? {hidden:true} : null);
    expect(v.players[0]).not.toHaveProperty('deck'); expect(v).not.toHaveProperty('cards'); expect(v).not.toHaveProperty('seed');
    const json=JSON.stringify(v); for(const id of [...s.players[0].hand,...s.players[0].deck]) expect(json).not.toContain(`"${id}"`);
  });
  it('explicit local testing reveals both hands but still hides both decks and does not mutate state',()=>{
    const s=createGame({seed:45,startingPlayer:0}); const before=structuredClone(s), v=viewForLocalTesting(s);
    expect(v.players.map(p=>p.hand?.length)).toEqual([5,4]); expect(v.players[0]).not.toHaveProperty('deck'); expect(v.players[1]).not.toHaveProperty('deck'); expect(s).toEqual(before);
  });
  it('projected structures cannot mutate canonical cards, history, pending, or results',()=>{
    const s=createGame({seed:2}), v=viewForPlayer(s,0); v.players[0].hand![0].souls=99; v.history.push('private');
    expect(Object.values(s.cards).every(c=>c.souls===0)).toBe(true); expect(s.history).not.toContain('private');
  });
  it('draw and trap history never contain hidden identities or card names',()=>{
    let s=createGame({seed:3}); const player=s.turnPlayer, spell=s.players[player].hand.find(id=>['sake','kozuchi','jufu','boseki','ougi','hamaya'].includes(s.cards[id].def));
    if(spell) s=applyCommand(s,player,{type:'setTrap',cardId:spell});
    const text=s.history.join(' '); for(const p of s.players) for(const id of [...p.hand,...p.deck,...(p.trap?[p.trap]:[])]) {expect(text).not.toContain(id); expect(text).not.toContain(s.cards[id].def);}
  });
});
