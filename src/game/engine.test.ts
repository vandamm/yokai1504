import { describe, expect, it } from 'vitest';
import { applyCommand, attackOf, canActivate, createGame, RuleError } from './engine';
import { CARDS, DECK } from './catalog';
import type { CardDefId, GameCommand, GameState, PlayerId } from './types';

function fixture(): GameState {
  const s = createGame({seed: 23, startingPlayer: 0});
  s.turn = 3; s.turnPlayer = 0; s.decisionPlayer = 0; s.phase = 'main'; s.actionsUsed = 0;
  s.supply = 11; s.history = []; s.pending = null;
  for (const p of s.players) { p.health = 15; p.deck = []; p.hand = []; p.field = []; p.graveyard = []; p.trap = null; }
  for (const c of Object.values(s.cards)) { c.souls = 0; c.summonedTurn = 0; s.players[c.owner].deck.push(c.id); }
  return s;
}
function put(s: GameState, def: CardDefId, owner: PlayerId, zone: 'hand'|'field'|'graveyard'|'trap' = 'field', souls = 0, controller = owner) {
  const c = Object.values(s.cards).find(c => c.owner === owner && c.def === def)!;
  for (const p of s.players) { for (const z of ['deck','hand','field','graveyard'] as const) p[z] = p[z].filter(id => id !== c.id); if (p.trap === c.id) p.trap = null; }
  if (zone === 'trap') s.players[controller].trap = c.id; else s.players[controller][zone].push(c.id);
  s.supply += c.souls - souls; c.souls = souls; return c.id;
}
function act(s: GameState, command: GameCommand, actor = s.decisionPlayer) { return applyCommand(s, actor, command); }
function cast(s: GameState, def: CardDefId, targets: string[] = [], allocations?: {cardId:string;count:number}[]) {
  const id = put(s, def, 0, 'hand'); const next = act(s, {type:'play',cardId:id});
  return next.phase === 'effect' ? act(next,{type:'choose',targets,allocations}) : next;
}
function invariant(s: GameState) {
  const all = s.players.flatMap(p => [...p.deck,...p.hand,...p.field,...p.graveyard,...(p.trap ? [p.trap] : [])]);
  expect(all.length).toBe(30); expect(new Set(all).size).toBe(30);
  expect(s.supply + Object.values(s.cards).reduce((n,c) => n+c.souls,0)).toBe(11);
  for (const p of s.players) { expect(p.field.length).toBeLessThanOrEqual(3); for (const id of p.field) expect(s.cards[id].souls).toBeLessThanOrEqual(CARDS[s.cards[id].def].cap); }
}

describe('setup and core commands', () => {
  it('contains all fifteen cards and deterministic independent shuffle/deal with initial draw', () => {
    const s = createGame({seed:7, names:['Ada','Bob'], startingPlayer:1});
    expect(DECK).toHaveLength(15); expect(new Set(DECK).size).toBe(15); expect(Object.keys(CARDS)).toHaveLength(15);
    expect(s).toEqual(createGame({seed:7,names:['Ada','Bob'],startingPlayer:1}));
    expect(s.players.map(p => p.hand.length)).toEqual([4,5]); expect(s.players.map(p => p.deck.length)).toEqual([11,10]);
    expect(s.players.map(p => p.health)).toEqual([15,15]); expect(s.turn).toBe(1); expect(s.decisionPlayer).toBe(1);
    expect(s.players[0].deck.map(id => s.cards[id].def)).not.toEqual(s.players[1].deck.map(id => s.cards[id].def)); invariant(s);
  });
  it('chooses both starting seats deterministically from seeds when no starter is supplied', () => {
    const starters=new Set(Array.from({length:20},(_,seed)=>createGame({seed}).turnPlayer));
    expect([...starters].sort()).toEqual([0,1]);
    expect(createGame({seed:2,startingPlayer:0}).turnPlayer).toBe(0);
    expect(createGame({seed:2,startingPlayer:1}).turnPlayer).toBe(1);
  });
  it('rejects malformed setup', () => { expect(() => createGame({seed:NaN})).toThrow(RuleError); });
  it('plays and evokes with shared two-action budget, caps and no input mutation', () => {
    const s = fixture(), id = put(s,'kappa',0,'hand'); const before = structuredClone(s);
    let n = act(s,{type:'play',cardId:id}); expect(s).toEqual(before); expect(n.actionsUsed).toBe(1);
    n = act(n,{type:'evoke',cardId:id}); expect(n.actionsUsed).toBe(2); expect(attackOf(n,id)).toBe(4); expect(n.supply).toBe(10);
    expect(() => act(n,{type:'evoke',cardId:id})).toThrow(RuleError); invariant(n);
  });
  it('enforces field cap, soul cap, shared supply and actor/phase ownership', () => {
    const s = fixture(); put(s,'kappa',0); put(s,'tengu',0); put(s,'nurikabe',0);
    const id=put(s,'yuki-onna',0,'hand'); expect(() => act(s,{type:'play',cardId:id})).toThrow();
    const capped=put(s,'nurikabe',0,'field',1); expect(() => act(s,{type:'evoke',cardId:capped})).toThrow();
    s.supply=0; expect(() => act(s,{type:'evoke',cardId:s.players[0].field[0]})).toThrow();
    expect(() => act(s,{type:'endTurn'},1)).toThrow();
  });
  it('sets exactly one spell without spending an action and cannot replace it', () => {
    const s=fixture(), id=put(s,'sake',0,'hand'), other=put(s,'jufu',0,'hand');
    const n=act(s,{type:'setTrap',cardId:id}); expect(n.actionsUsed).toBe(0); expect(n.players[0].trap).toBe(id);
    expect(() => act(n,{type:'setTrap',cardId:other})).toThrow(); invariant(n);
  });
  it('casts a previously set spell with an action', () => {
    const s=fixture(), id=put(s,'kozuchi',0,'trap'); const count=s.players[0].hand.length;
    const n=act(s,{type:'play',cardId:id}); expect(n.players[0].trap).toBe(null); expect(n.actionsUsed).toBe(1); expect(n.players[0].hand).toHaveLength(count+2); invariant(n);
  });
  it('first player cannot battle on first turn; a main turn always draws once', () => {
    const s=createGame({seed:1}); const id=put(s,'kappa',s.turnPlayer);
    expect(() => act(s,{type:'attack',attacker:id,target:null})).toThrow();
    const next=act(s,{type:'endTurn'}); expect(next.turn).toBe(2); expect(next.players[next.turnPlayer].hand).toHaveLength(5); invariant(next);
  });
  it('empty deck draws damage the opponent and stop immediately at lethal', () => {
    const s=fixture(); s.players[1].graveyard.push(...s.players[1].deck); s.players[1].deck=[]; s.players[0].health=1;
    const n=act(s,{type:'endTurn'}); expect(n.result?.winner).toBe(1); expect(n.phase).toBe('finished'); expect(n.players[0].health).toBe(0); invariant(n);
  });
  it('invalid commands never mutate canonical input or reveal hidden card names', () => {
    const s=fixture(); const before=structuredClone(s); const hidden=s.players[1].deck[0];
    expect(() => act(s,{type:'play',cardId:hidden})).toThrow(RuleError); expect(s).toEqual(before);
    try { act(s,{type:'play',cardId:hidden}); } catch(e) { expect(String(e)).not.toContain(CARDS[s.cards[hidden].def].name); }
    expect(() => act(s,{type:'choose',targets:[]})).toThrow(); expect(() => act(s,{type:'nope'} as unknown as GameCommand)).toThrow();
  });
});

describe('spells and release effects', () => {
  it('Sake distributes up to three souls across both fields without actions beyond casting', () => {
    const s=fixture(), a=put(s,'kappa',0), b=put(s,'tengu',1);
    const n=cast(s,'sake',[],[{cardId:a,count:2},{cardId:b,count:1}]); expect(n.cards[a].souls).toBe(2); expect(n.cards[b].souls).toBe(1); expect(n.actionsUsed).toBe(1); invariant(n);
  });
  it('Sake and Jufu allow zero targets, reject duplicate allocations and over-cap choices', () => {
    const s=fixture(), id=put(s,'nurikabe',0); const spell=put(s,'sake',0,'hand'); const n=act(s,{type:'play',cardId:spell});
    expect(() => act(n,{type:'choose',allocations:[{cardId:id,count:2}]})).toThrow();
    expect(() => act(n,{type:'choose',allocations:[{cardId:id,count:1},{cardId:id,count:1}]})).toThrow();
    expect(act(n,{type:'choose',allocations:[]}).phase).toBe('main'); expect(cast(fixture(),'jufu').phase).toBe('main');
  });
  it('Kozuchi automatically draws twice, including each missed draw damage', () => {
    const s=fixture(); s.players[0].graveyard.push(...s.players[0].deck); s.players[0].deck=[];
    const n=cast(s,'kozuchi'); expect(n.players[1].health).toBe(13); expect(n.pending).toBe(null); expect(n.phase).toBe('main'); invariant(n);
  });
  it('Jufu destroys up to two soul-equipped yokai and returns souls together', () => {
    const s=fixture(), a=put(s,'kappa',0,'field',1), b=put(s,'tengu',1,'field',2);
    const n=cast(s,'jufu',[a,b]); expect(n.players[0].graveyard).toContain(a); expect(n.players[1].graveyard).toContain(b); expect(n.supply).toBe(11); invariant(n);
  });
  it('Boseki revives from either graveyard under caster control with zero souls', () => {
    const s=fixture(), id=put(s,'tengu',1,'graveyard'); const n=cast(s,'boseki',[id]);
    expect(n.players[0].field).toContain(id); expect(n.cards[id].owner).toBe(1); expect(n.cards[id].souls).toBe(0); expect(n.cards[id].summonedTurn).toBe(3); invariant(n);
  });
  it('Boseki requires a yokai and field capacity before activation', () => {
    const s=fixture(), spell=put(s,'boseki',0,'hand'); expect(canActivate(s,spell,'cast')).toBe(false); expect(() => act(s,{type:'play',cardId:spell})).toThrow();
    put(s,'tengu',1,'graveyard'); put(s,'kappa',0); put(s,'nurikabe',0); put(s,'yuki-onna',0); expect(canActivate(s,spell,'cast')).toBe(false);
  });
  it('Ougi moves exactly one soul across fields and respects destination cap', () => {
    const s=fixture(), a=put(s,'kappa',1,'field',2), b=put(s,'nurikabe',0);
    const n=cast(s,'ougi',[a,b]); expect(n.cards[a].souls).toBe(1); expect(n.cards[b].souls).toBe(1); invariant(n);
    expect(canActivate(n,put(n,'ougi',1,'trap'),'trap')).toBe(false);
  });
  it('Ougi exact effect cannot activate without distinct eligible endpoints', () => {
    const s=fixture(), a=put(s,'kappa',0,'field',1), spell=put(s,'ougi',0,'hand');
    expect(canActivate(s,spell,'cast')).toBe(false); put(s,'tengu',1); const n=act(s,{type:'play',cardId:spell}); expect(() => act(n,{type:'choose',targets:[a,a]})).toThrow();
  });
  it('Hamaya chooses only among highest ATK, including own yokai and ties', () => {
    const s=fixture(), a=put(s,'nurikabe',0), b=put(s,'tengu',1), spell=put(s,'hamaya',0,'hand');
    const n=act(s,{type:'play',cardId:spell}); expect(() => act(n,{type:'choose',targets:[b]})).toThrow(); expect(act(n,{type:'choose',targets:[a]}).players[0].graveyard).toContain(a);
    const t=fixture(), c=put(t,'kappa',0,'field',1), d=put(t,'tengu',1); expect(attackOf(t,c)).toBe(4); expect(cast(t,'hamaya',[d]).players[1].graveyard).toContain(d);
  });
  it('possessed Zashiki-warashi and its souls are immune to every targeted spell', () => {
    const s=fixture(), z=put(s,'zashiki-warashi',1,'field',2), k=put(s,'kappa',0,'field',1);
    for (const [def,targets,allocations] of [ ['jufu',[z],undefined], ['hamaya',[z],undefined], ['ougi',[z,k],undefined], ['ougi',[k,z],undefined], ['sake',[],[{cardId:z,count:1}]] ] as [CardDefId,string[],{cardId:string;count:number}[]|undefined][]) {
      const t=structuredClone(s), id=put(t,def,0,'hand'); if(canActivate(t,id,'cast')) expect(() => act(act(t,{type:'play',cardId:id}),{type:'choose',targets,allocations})).toThrow();
    }
    const t=fixture(), unpossessed=put(t,'zashiki-warashi',1); expect(cast(t,'hamaya',[unpossessed]).players[1].graveyard).toContain(unpossessed);
  });
  it('Karakasa releases one soul to destroy either set spell without spending an action', () => {
    const s=fixture(), a=put(s,'karakasa-kozo',0,'field',1), trap=put(s,'sake',1,'trap');
    let n=act(s,{type:'release',cardId:a}); expect(n.cards[a].souls).toBe(0); n=act(n,{type:'choose',targets:[trap]}); expect(n.players[1].trap).toBe(null); expect(n.actionsUsed).toBe(0); invariant(n);
  });
  it('Karakasa can target a concealed trap through its public seat token', () => {
    const s=fixture(), a=put(s,'karakasa-kozo',0,'field',1), trap=put(s,'sake',1,'trap');
    const n=act(act(s,{type:'release',cardId:a}),{type:'choose',targets:['trap:1']});
    expect(n.players[1].trap).toBe(null); expect(n.players[1].graveyard).toContain(trap); invariant(n);
  });
  it('release exact effects require a target before paying and Nekomata exchanges souls/control', () => {
    const s=fixture(), neko=put(s,'nekomata',0,'field',2); expect(() => act(s,{type:'release',cardId:neko})).toThrow(); expect(s.cards[neko].souls).toBe(2);
    const foe=put(s,'zashiki-warashi',1,'field',1); const n=act(act(s,{type:'release',cardId:neko}),{type:'choose',targets:[foe]});
    expect(n.players[0].field).toContain(foe); expect(n.players[1].field).toContain(neko); expect(n.cards[foe].souls).toBe(1); expect(n.cards[neko].souls).toBe(1); invariant(n);
  });
});

describe('combat and timing', () => {
  it('resolves attacker victory, damage and waits for explicit turn completion', () => {
    const s=fixture(), a=put(s,'tengu',0,'field',1), b=put(s,'kappa',1);
    const n=act(s,{type:'attack',attacker:a,target:b}); expect(n.players[1].health).toBe(12); expect(n.players[1].graveyard).toContain(b); expect(n.turnPlayer).toBe(0); expect(n.phase).toBe('turnEnd'); expect(n.turn).toBe(3); invariant(n);
  });
  it('resolves defender victory against current controller and sends stolen cards to original owner', () => {
    const s=fixture(), a=put(s,'kappa',1,'field',0,0), b=put(s,'nurikabe',1);
    const n=act(s,{type:'attack',attacker:a,target:b}); expect(n.players[0].health).toBe(12); expect(n.players[1].graveyard).toContain(a); expect(n.players[0].graveyard).not.toContain(a); invariant(n);
  });
  it('tied battle destroys both with no damage', () => {
    const s=fixture(), a=put(s,'kappa',0), b=put(s,'zashiki-warashi',1); const n=act(s,{type:'attack',attacker:a,target:b});
    expect(n.players[0].graveyard).toContain(a); expect(n.players[1].graveyard).toContain(b); expect(n.players.map(p=>p.health)).toEqual([15,15]); invariant(n);
  });
  it('direct damage is attack value and requires no enemy yokai', () => {
    const s=fixture(), a=put(s,'kappa',0,'field',2); const n=act(s,{type:'attack',attacker:a,target:null}); expect(n.players[1].health).toBe(9);
    put(s,'tengu',1); expect(() => act(s,{type:'attack',attacker:a,target:null})).toThrow();
  });
  it('skips an unusable trap and resolves battle without revealing it', () => {
    const s=fixture(), a=put(s,'kappa',0), trap=put(s,'boseki',1,'trap');
    const n=act(s,{type:'attack',attacker:a,target:null});
    expect(n.phase).toBe('turnEnd'); expect(n.pending).toBeNull();
    expect(n.players[1].trap).toBe(trap); expect(n.players[1].health).toBe(13); invariant(n);
  });
  it('persists spell choice and attack continuation, then cancels attack if attacker destroyed', () => {
    const s=fixture(), a=put(s,'tengu',0), trap=put(s,'hamaya',1,'trap');
    const response=act(act(s,{type:'attack',attacker:a,target:null}),{type:'respond',activate:true}); expect(response.phase).toBe('effect'); expect(response.pending?.kind==='effect' && response.pending.attack?.attacker).toBe(a);
    const restored=JSON.parse(JSON.stringify(response)) as GameState, n=act(restored,{type:'choose',targets:[a]});
    expect(n.players[0].graveyard).toContain(a); expect(n.players[1].health).toBe(15); expect(n.turnPlayer).toBe(0); expect(n.phase).toBe('turnEnd'); expect(n.players[1].graveyard).toContain(trap); invariant(n);
  });
  it('Boseki trap redirects a direct attack to the revived defender', () => {
    const s=fixture(), a=put(s,'tengu',0), b=put(s,'kappa',1,'graveyard'); put(s,'boseki',1,'trap');
    const n=act(act(act(s,{type:'attack',attacker:a,target:null}),{type:'respond',activate:true}),{type:'choose',targets:[b]});
    expect(n.players[1].health).toBe(13); expect(n.players[1].graveyard).toContain(b); invariant(n);
  });
  it('removing declared defender cancels attack instead of retargeting', () => {
    const s=fixture(), a=put(s,'kappa',0), b=put(s,'nurikabe',1); put(s,'hamaya',1,'trap');
    const n=act(act(act(s,{type:'attack',attacker:a,target:b}),{type:'respond',activate:true}),{type:'choose',targets:[b]}); expect(n.players[1].health).toBe(15); expect(n.turnPlayer).toBe(0); expect(n.phase).toBe('turnEnd');
  });
  it('Kozuchi trap resolves automatically then completes the attack', () => {
    const s=fixture(), a=put(s,'tengu',0); put(s,'kozuchi',1,'trap'); const n=act(act(s,{type:'attack',attacker:a,target:null}),{type:'respond',activate:true});
    expect(n.phase).toBe('turnEnd'); expect(n.players[1].hand).toHaveLength(2); expect(n.players[1].health).toBe(11); invariant(n);
  });
  it('lethal empty draws during a trap finish with no pending private decision', () => {
    const s=fixture(), a=put(s,'kappa',0); put(s,'kozuchi',1,'trap');
    s.players[1].graveyard.push(...s.players[1].deck); s.players[1].deck=[]; s.players[0].health=1;
    const n=act(act(s,{type:'attack',attacker:a,target:null}),{type:'respond',activate:true});
    expect(n.phase).toBe('finished'); expect(n.result?.winner).toBe(1); expect(n.pending).toBe(null); expect(n.decisionPlayer).toBe(n.turnPlayer); invariant(n);
  });
  it('Yuki-onna spends a soul to survive defeat, while battle damage remains', () => {
    const s=fixture(), a=put(s,'nurikabe',0,'field',1), b=put(s,'yuki-onna',1,'field',1); const n=act(s,{type:'attack',attacker:a,target:b});
    expect(n.players[1].field).toContain(b); expect(n.cards[b].souls).toBe(0); expect(n.players[1].health).toBe(13); invariant(n);
  });
  it('Yuki-onna survives a tied battle but does not resist spell or Chochin destruction', () => {
    const s=fixture(), a=put(s,'tengu',0), b=put(s,'yuki-onna',1,'field',1); const n=act(s,{type:'attack',attacker:a,target:b});
    expect(n.players[1].field).toContain(b); expect(n.players[0].graveyard).toContain(a); expect(n.cards[b].souls).toBe(0);
    const t=fixture(), y=put(t,'yuki-onna',1,'field',1); expect(cast(t,'jufu',[y]).players[1].graveyard).toContain(y);
  });
  it('possessed Chochin destroys its battle opponent after dying, including Yuki', () => {
    const s=fixture(), a=put(s,'chochin-kozo',0,'field',1), b=put(s,'yuki-onna',1,'field',2); const n=act(s,{type:'attack',attacker:a,target:b});
    expect(n.players[0].graveyard).toContain(a); expect(n.players[1].graveyard).toContain(b); expect(n.players[0].health).toBe(13); invariant(n);
  });
  it('Rokurokubi draws before delayed Chochin destruction, only for actual battle destruction', () => {
    const s=fixture(), a=put(s,'rokurokubi',0,'field',1), b=put(s,'chochin-kozo',1,'field',1); const n=act(s,{type:'attack',attacker:a,target:b});
    expect(n.players[0].hand).toHaveLength(1); expect(n.players[0].graveyard).toContain(a); invariant(n);
    const t=fixture(), r=put(t,'rokurokubi',0,'field',2), y=put(t,'yuki-onna',1,'field',1); expect(act(t,{type:'attack',attacker:r,target:y}).players[0].hand).toHaveLength(0);
  });
  it('tied possessed Rokurokubi draws when its opposing yokai is destroyed', () => {
    const s=fixture(), a=put(s,'rokurokubi',0,'field',1), b=put(s,'tengu',1); const n=act(s,{type:'attack',attacker:a,target:b});
    expect(n.players[0].hand).toHaveLength(1); expect(n.players[0].graveyard).toContain(a); expect(n.players[1].graveyard).toContain(b); invariant(n);
  });
  it('Ougi trap removing Chochin possession disables delayed destruction', () => {
    const s=fixture(), a=put(s,'tengu',0), b=put(s,'chochin-kozo',1,'field',1); put(s,'ougi',1,'trap');
    const n=act(act(act(s,{type:'attack',attacker:a,target:b}),{type:'respond',activate:true}),{type:'choose',targets:[b,a]}); expect(n.players[0].field).toContain(a); expect(n.players[1].graveyard).toContain(b); invariant(n);
  });
  it('Tengu damages current controller before draw, including lethal', () => {
    const s=fixture(); put(s,'tengu',0,'field',0,1); s.players[1].health=1; const before=s.players[1].hand.length;
    const n=act(s,{type:'endTurn'}); expect(n.result?.winner).toBe(0); expect(n.players[1].hand).toHaveLength(before); expect(n.history.at(-1)).toContain('wins'); invariant(n);
  });
  it('Nurikabe forbids all controller attacks only while on field in its summon turn', () => {
    const s=fixture(), nuri=put(s,'nurikabe',0,'hand'), a=put(s,'kappa',0); const n=act(s,{type:'play',cardId:nuri});
    expect(() => act(n,{type:'attack',attacker:a,target:null})).toThrow(); n.players[0].field=n.players[0].field.filter(x=>x!==nuri); n.players[0].graveyard.push(nuri);
    expect(act(n,{type:'attack',attacker:a,target:null}).players[1].health).toBe(13);
  });
  it('lethal combat stops without opponent main phase or Tengu damage', () => {
    const s=fixture(), a=put(s,'tengu',0); s.players[1].health=3; const n=act(s,{type:'attack',attacker:a,target:null});
    expect(n.phase).toBe('finished'); expect(n.turn).toBe(3); expect(n.result?.winner).toBe(0); expect(() => act(n,{type:'endTurn'})).toThrow(); invariant(n);
  });
  it('full deterministic matches preserve all cards/souls and terminate with empty-deck damage', () => {
    for(let seed=0;seed<30;seed++) { let a=createGame({seed}), b=createGame({seed}); for(let i=0;i<60 && !a.result;i++){a=act(a,{type:'endTurn'}); b=act(b,{type:'endTurn'}); invariant(a); expect(a).toEqual(b);} expect(a.phase).toBe('finished'); }
  });
});


describe('trap casting requirements at attack declaration', () => {
  it.each(['boseki', 'ougi', 'hamaya'] as const)('skips an unusable %s trap without exposing or spending it', def => {
    const s=fixture();
    const a=put(s,'zashiki-warashi',0,'field',1);
    const b=put(s,'zashiki-warashi',1,'field',1);
    if(def==='boseki') { put(s,'kappa',1); put(s,'tengu',1); put(s,'nurikabe',0,'graveyard'); }
    const trap=put(s,def,1,'trap');
    const n=act(s,{type:'attack',attacker:a,target:b});
    expect(n.phase).toBe('turnEnd'); expect(n.pending).toBeNull();
    expect(n.players[1].trap).toBe(trap);
    expect(n.history.join(' ')).not.toContain(CARDS[def].name);
    expect(n.history.join(' ')).not.toContain('declines'); invariant(n);
  });
  it.each(['boseki', 'ougi', 'hamaya', 'sake', 'jufu', 'kozuchi'] as const)('offers a legal %s trap', def => {
    const s=fixture(), a=put(s,'kappa',0,'field',1), b=put(s,'tengu',1);
    put(s,'nurikabe',1,'graveyard'); put(s,def,1,'trap');
    const n=act(s,{type:'attack',attacker:a,target:b});
    expect(n.phase).toBe('trap'); expect(n.decisionPlayer).toBe(1);
    expect(canActivate(n,n.players[1].trap!,'trap')).toBe(true); invariant(n);
  });
});
