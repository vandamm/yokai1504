import { CARDS, DECK } from './catalog';
import type { Attack, CardInstance, GameCommand, GameState, PlayerId, PlayerState, SetupOptions } from './types';

type Source = 'cast' | 'trap' | 'release';
export class RuleError extends Error {
  constructor(message: string) { super(message); this.name = 'RuleError'; }
}
const other = (player: PlayerId): PlayerId => player === 0 ? 1 : 0;
function requireRule(condition: unknown, message: string): asserts condition { if (!condition) throw new RuleError(message); }
function card(state: GameState, id: string): CardInstance {
  requireRule(typeof id === 'string' && Object.hasOwn(state.cards,id), 'Choose a valid card.');
  return state.cards[id];
}
function controller(state: GameState, id: string): PlayerId | null {
  for (const player of [0,1] as const) if (state.players[player].field.includes(id)) return player;
  return null;
}
const field = (state: GameState): string[] => state.players.flatMap(player => player.field);
function immune(state: GameState, id: string): boolean { const c=card(state,id); return c.def==='zashiki-warashi' && c.souls>0; }
function spellTargets(state: GameState): string[] { return field(state).filter(id => !immune(state,id)); }
function strongest(state: GameState): string[] {
  const ids=field(state), max=Math.max(...ids.map(id => attackOf(state,id)));
  return ids.filter(id => attackOf(state,id)===max && !immune(state,id));
}
export function attackOf(state: GameState, id: string): number {
  const c=card(state,id), def=CARDS[c.def];
  return def.atk + c.souls * (c.def==='kappa' ? 2 : 1);
}
function hasTargets(state: GameState, id: string, actor: PlayerId): boolean {
  switch(card(state,id).def) {
    case 'sake': case 'jufu': case 'kozuchi': return true;
    case 'boseki': return state.players[actor].field.length<3 && state.players.some(p => p.graveyard.some(id => CARDS[card(state,id).def].kind==='yokai'));
    case 'ougi': {
      const ids=spellTargets(state);
      return ids.some(from => card(state,from).souls>0 && ids.some(to => to!==from && card(state,to).souls<CARDS[card(state,to).def].cap));
    }
    case 'hamaya': return strongest(state).length>0;
    case 'karakasa-kozo': return state.players.some(p => p.trap!==null);
    case 'nekomata': return state.players[other(actor)].field.length>0;
    default: return false;
  }
}
export function canResolvePendingEffect(state: GameState): boolean {
  if(state.phase!=='effect' || state.pending?.kind!=='effect' || state.result) return false;
  const {cardId,actor}=state.pending;
  return Object.hasOwn(state.cards,cardId) && state.cards[cardId].def!=='kozuchi' && hasTargets(state,cardId,actor);
}
export function canActivate(state: GameState, id: string, source: Source): boolean {
  if(state.result || !Object.hasOwn(state.cards,id)) return false;
  const c=state.cards[id], actor=state.decisionPlayer, p=state.players[actor];
  if(source==='release') {
    if(state.phase!=='main' || actor!==state.turnPlayer || !p.field.includes(id) || c.souls<1 || CARDS[c.def].effectType!=='release') return false;
  } else {
    if(CARDS[c.def].kind!=='spell') return false;
    if(source==='cast') {
      if(state.phase!=='main' || actor!==state.turnPlayer || state.actionsUsed>=2 || (!p.hand.includes(id) && p.trap!==id)) return false;
    } else if(source==='trap') {
      if(state.phase!=='trap' || state.pending?.kind!=='trap' || p.trap!==id) return false;
    } else return false;
  }
  return hasTargets(state,id,actor);
}
function damage(state: GameState, player: PlayerId, amount: number, reason: string): void {
  if(state.result) return;
  state.players[player].health=Math.max(0,state.players[player].health-amount);
  state.history.push(`${state.players[player].name} takes ${amount} damage (${reason}).`);
  if(state.players[player].health===0) {
    const winner=other(player); state.result={winner,reason:'health reached zero'}; state.phase='finished'; state.pending=null; state.decisionPlayer=state.turnPlayer;
    state.history.push(`${state.players[winner].name} wins.`);
  }
}
function draw(state: GameState, player: PlayerId): void {
  if(state.result) return;
  const id=state.players[player].deck.shift();
  if(id) { state.players[player].hand.push(id); state.history.push(`${state.players[player].name} draws a card.`); }
  else damage(state,other(player),1,`${state.players[player].name} could not draw`);
}
function beginMain(state: GameState): void {
  state.phase='main'; state.pending=null; state.decisionPlayer=state.turnPlayer; state.actionsUsed=0;
  state.history.push(`Turn ${state.turn}: ${state.players[state.turnPlayer].name}.`);
  for(const id of [...state.players[state.turnPlayer].field]) {
    if(card(state,id).def==='tengu') damage(state,state.turnPlayer,1,'Tengu');
    if(state.result) return;
  }
  draw(state,state.turnPlayer);
}
function endTurn(state: GameState): void {
  if(state.result) return;
  state.turnPlayer=other(state.turnPlayer); state.turn+=1; beginMain(state);
}
function detach(state: GameState, id: string): void {
  for(const p of state.players) {
    for(const zone of ['hand','field','graveyard','deck'] as const) p[zone]=p[zone].filter(value => value!==id);
    if(p.trap===id) p.trap=null;
  }
}
function toGrave(state: GameState, id: string): void {
  const c=card(state,id); detach(state,id); state.supply+=c.souls; c.souls=0;
  state.players[c.owner].graveyard.push(id);
}
function destroy(state: GameState, id: string): void {
  if(controller(state,id)===null) return;
  state.history.push(`${CARDS[card(state,id).def].name} is destroyed.`); toGrave(state,id);
}
function summon(state: GameState, id: string, actor: PlayerId): void {
  detach(state,id); const c=card(state,id); c.summonedTurn=state.turn; state.players[actor].field.push(id);
  state.history.push(`${state.players[actor].name} summons ${CARDS[c.def].name}.`);
}
function battleDefeat(state: GameState, id: string): boolean {
  const c=card(state,id);
  if(c.def==='yuki-onna' && c.souls>0) {
    c.souls-=1; state.supply+=1; state.history.push('Yuki-onna returns a soul to survive battle.'); return false;
  }
  destroy(state,id); return true;
}
function awaitTurnEnd(state: GameState): void {
  if (state.result) return;
  state.phase='turnEnd'; state.pending=null;
}
function resolveAttack(state: GameState, attack: Attack): void {
  state.pending=null;
  if(state.result) return;
  const attackerController=controller(state,attack.attacker);
  if(attackerController!==state.turnPlayer) { state.history.push('The declared attack is cancelled.'); awaitTurnEnd(state); return; }
  const defender=other(attackerController);
  let target=attack.target;
  if(target===null && state.players[defender].field.length>0) target=state.players[defender].field[0];
  if(target!==null && controller(state,target)!==defender) { state.history.push('The declared attack is cancelled.'); awaitTurnEnd(state); return; }
  if(target===null) {
    damage(state,defender,attackOf(state,attack.attacker),'direct attack'); awaitTurnEnd(state); return;
  }
  const a=card(state,attack.attacker), b=card(state,target), aAttack=attackOf(state,a.id), bAttack=attackOf(state,b.id);
  // Possession is sampled after trap resolution; these triggers survive the originating yokai's battle destruction.
  const aChochin=a.def==='chochin-kozo' && a.souls>0, bChochin=b.def==='chochin-kozo' && b.souls>0;
  const aRokuro=a.def==='rokurokubi' && a.souls>0, bRokuro=b.def==='rokurokubi' && b.souls>0;
  const aDestroyed=aAttack<=bAttack ? battleDefeat(state,a.id) : false;
  const bDestroyed=bAttack<=aAttack ? battleDefeat(state,b.id) : false;
  if(aAttack>bAttack) damage(state,defender,aAttack-bAttack,'battle');
  if(bAttack>aAttack) damage(state,attackerController,bAttack-aAttack,'battle');
  if(state.result) return;
  if(aRokuro && bDestroyed) { state.history.push('Rokurokubi draws for battle destruction.'); draw(state,attackerController); }
  if(state.result) return;
  if(bRokuro && aDestroyed) { state.history.push('Rokurokubi draws for battle destruction.'); draw(state,defender); }
  if(state.result) return;
  if(aChochin) destroy(state,b.id);
  if(bChochin) destroy(state,a.id);
  awaitTurnEnd(state);
}
function finishEffect(state: GameState, attack: Attack|null): void {
  state.pending=null;
  if(state.result) return;
  if(attack) resolveAttack(state,attack);
  else { state.phase='main'; state.decisionPlayer=state.turnPlayer; }
}
function beginEffect(state: GameState, id: string, actor: PlayerId, source: Source, attack: Attack|null): void {
  const c=card(state,id);
  if(source==='release') { c.souls-=1; state.supply+=1; state.history.push(`${state.players[actor].name} releases a soul from ${CARDS[c.def].name}.`); }
  else { toGrave(state,id); state.history.push(`${state.players[actor].name} ${source==='trap'?'reveals':'casts'} ${CARDS[c.def].name}.`); }
  if(c.def==='kozuchi') { draw(state,actor); draw(state,actor); finishEffect(state,attack); return; }
  state.phase='effect'; state.decisionPlayer=actor; state.pending={kind:'effect',actor,cardId:id,source,attack};
}
function choose(state: GameState, command: Extract<GameCommand,{type:'choose'}>): void {
  requireRule(state.phase==='effect' && state.pending?.kind==='effect','There is no effect choice to make.');
  const pending=state.pending, actor=pending.actor, def=card(state,pending.cardId).def;
  const targets=command.targets??[], allocations=command.allocations??[];
  requireRule(Array.isArray(targets) && targets.every(id => typeof id==='string') && new Set(targets).size===targets.length,'Choose each target at most once.');
  requireRule(Array.isArray(allocations),'Choose valid soul allocations.');
  if(def==='sake') {
    requireRule(targets.length===0,'Sake uses soul allocations.');
    const ids=new Set<string>(); let total=0;
    for(const allocation of allocations) {
      requireRule(allocation && typeof allocation.cardId==='string' && Number.isInteger(allocation.count) && allocation.count>0,'Allocate a positive whole number of souls.');
      const {cardId:id,count}=allocation, c=card(state,id);
      requireRule(!ids.has(id),'Allocate to each yokai only once.'); ids.add(id);
      requireRule(controller(state,id)!==null && !immune(state,id),'Choose a yokai that spells can affect.');
      requireRule(c.souls+count<=CARDS[c.def].cap,'That yokai cannot hold that many souls.'); total+=count;
    }
    requireRule(total<=3 && total<=state.supply,'Distribute no more than three available souls.');
    for(const {cardId:id,count} of allocations) card(state,id).souls+=count;
    state.supply-=total; state.history.push(`Sake distributes ${total} souls.`);
  } else {
    requireRule(allocations.length===0,'This effect uses target cards.');
    switch(def) {
      case 'jufu':
        requireRule(targets.length<=2,'Choose up to two yokai.');
        for(const id of targets) requireRule(controller(state,id)!==null && card(state,id).souls>0 && !immune(state,id),'Choose a soul-equipped yokai that spells can affect.');
        for(const id of targets) destroy(state,id);
        break;
      case 'boseki': {
        requireRule(targets.length===1 && state.players[actor].field.length<3,'Choose one yokai and leave room on your field.'); const id=targets[0];
        requireRule(state.players.some(p => p.graveyard.includes(id)) && CARDS[card(state,id).def].kind==='yokai','Choose a yokai from either graveyard.');
        summon(state,id,actor); break;
      }
      case 'ougi': {
        requireRule(targets.length===2,'Choose the soul source, then a different destination.'); const [from,to]=targets;
        requireRule(targets.every(id=>controller(state,id)!==null && !immune(state,id)),'Choose two yokai that spells can affect.');
        const a=card(state,from), b=card(state,to);
        requireRule(a.souls>0 && b.souls<CARDS[b.def].cap,'The source needs a soul and the destination needs room.');
        a.souls-=1; b.souls+=1; state.history.push(`Ougi moves a soul from ${CARDS[a.def].name} to ${CARDS[b.def].name}.`); break;
      }
      case 'hamaya':
        requireRule(targets.length===1 && strongest(state).includes(targets[0]),'Choose one of the highest ATK yokai that spells can affect.'); destroy(state,targets[0]); break;
      case 'karakasa-kozo': {
        const selected=targets[0], id=selected==='trap:0' ? state.players[0].trap : selected==='trap:1' ? state.players[1].trap : selected;
        requireRule(targets.length===1 && id && state.players.some(p=>p.trap===id),'Choose one set spell trap.');
        state.history.push(`Karakasa-kozo destroys ${CARDS[card(state,id).def].name}.`); toGrave(state,id); break;
      }
      case 'nekomata': {
        requireRule(targets.length===1 && state.players[other(actor)].field.includes(targets[0]),"Choose one opponent's yokai.");
        const yours=state.players[actor].field, theirs=state.players[other(actor)].field;
        const ownIndex=yours.indexOf(pending.cardId), enemyIndex=theirs.indexOf(targets[0]); requireRule(ownIndex>=0,'The releasing yokai must remain on your field.');
        yours[ownIndex]=targets[0]; theirs[enemyIndex]=pending.cardId; state.history.push(`Nekomata exchanges control with ${CARDS[card(state,targets[0]).def].name}.`); break;
      }
      default: throw new RuleError('This card has no pending choice.');
    }
  }
  finishEffect(state,pending.attack);
}
export function createGame(options: SetupOptions): GameState {
  requireRule(options && Number.isInteger(options.seed) && Number.isFinite(options.seed),'Use a finite integer shuffle seed.');
  requireRule(options.startingPlayer===undefined || options.startingPlayer===0 || options.startingPlayer===1,'Choose a valid starting player.');
  const names=options.names??['Player 1','Player 2'];
  requireRule(Array.isArray(names) && names.length===2 && names.every(name=>typeof name==='string' && name.trim().length>0),'Supply two player names.');
  let seed=options.seed>>>0;
  const random=()=>{ seed=(seed+0x6D2B79F5)>>>0; let value=Math.imul(seed^(seed>>>15),1|seed); value^=value+Math.imul(value^(value>>>7),61|value); return ((value^(value>>>14))>>>0)/4294967296; };
  const shuffle=<T>(values: T[]): T[]=>{ const result=[...values]; for(let i=result.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; } return result; };
  const starter=options.startingPlayer??(random()<0.5 ? 0 : 1);
  const newPlayer=(player:PlayerId):PlayerState=>({name:names[player].trim(),health:15,deck:[],hand:[],field:[],graveyard:[],trap:null});
  const state: GameState={rulesVersion:1,turn:1,turnPlayer:starter,decisionPlayer:starter,phase:'main',actionsUsed:0,supply:11,cards:{},players:[newPlayer(0),newPlayer(1)],pending:null,result:null,history:['Both players prepare a fifteen-card deck and draw four cards.']};
  for(const owner of [0,1] as const) {
    // Randomize the definition-to-instance mapping as well as deck order: opaque IDs never disclose a hidden definition.
    const defs=shuffle(DECK), ids=defs.map((def,index)=>{const id=`p${owner}-c${index}`; state.cards[id]={id,def,owner,souls:0,summonedTurn:0}; return id;});
    state.players[owner].deck=shuffle(ids); state.players[owner].hand=state.players[owner].deck.splice(0,4);
  }
  beginMain(state); return state;
}
export function applyCommand(state: GameState, actor: PlayerId, command: GameCommand, recordedTrapResponse = false): GameState {
  requireRule(actor===0 || actor===1,'Choose a valid player.');
  requireRule(state.phase!=='finished' && !state.result,'The game has finished.');
  requireRule(actor===state.decisionPlayer,'The other player must make this decision.');
  requireRule(command && typeof command==='object' && typeof command.type==='string','Choose a valid action.');
  const next=structuredClone(state), player=next.players[actor];
  if(command.type==='respond') {
    requireRule(next.phase==='trap' && next.pending?.kind==='trap','There is no trap response to make.');
    requireRule(typeof command.activate==='boolean','Choose activate or decline.');
    const attack:Attack={attacker:next.pending.attacker,target:next.pending.target};
    if(command.activate) { requireRule(player.trap && canActivate(next,player.trap,'trap'),'This trap has no legal activation.'); beginEffect(next,player.trap,actor,'trap',attack); }
    else { next.history.push(`${player.name} declines to activate a trap.`); resolveAttack(next,attack); }
    return next;
  }
  if(command.type==='choose') { choose(next,command); return next; }
  if(next.phase==='turnEnd') { requireRule(command.type==='endTurn','The attack is complete. End the turn after reviewing the result.'); endTurn(next); return next; }
  requireRule(next.phase==='main' && actor===next.turnPlayer,'Finish the pending decision first.');
  switch(command.type) {
    case 'play': {
      const c=card(next,command.cardId);
      requireRule(player.hand.includes(c.id) || player.trap===c.id,'Choose a card in your hand or your set spell.');
      requireRule(next.actionsUsed<2,'You have used both play/evoke actions.');
      if(CARDS[c.def].kind==='yokai') { requireRule(player.hand.includes(c.id) && player.field.length<3,'Your field can hold at most three yokai.'); next.actionsUsed+=1; summon(next,c.id,actor); }
      else { requireRule(canActivate(next,c.id,'cast'),'This spell has no legal activation.'); next.actionsUsed+=1; beginEffect(next,c.id,actor,'cast',null); }
      break;
    }
    case 'evoke': {
      const c=card(next,command.cardId); requireRule(player.field.includes(c.id),'Choose a yokai on your field.');
      requireRule(next.actionsUsed<2,'You have used both play/evoke actions.'); requireRule(next.supply>0,'No shared souls remain.'); requireRule(c.souls<CARDS[c.def].cap,'That yokai is at its soul cap.');
      c.souls+=1; next.supply-=1; next.actionsUsed+=1; next.history.push(`${player.name} evokes a soul onto ${CARDS[c.def].name}.`); break;
    }
    case 'release':
      requireRule(canActivate(next,command.cardId,'release'),'Choose a soul-equipped release yokai with a legal target.'); beginEffect(next,command.cardId,actor,'release',null); break;
    case 'setTrap': {
      const c=card(next,command.cardId); requireRule(player.hand.includes(c.id) && CARDS[c.def].kind==='spell','Choose a spell from your hand.'); requireRule(player.trap===null,'You already have a set trap.');
      detach(next,c.id); player.trap=c.id; next.history.push(`${player.name} sets a spell trap.`); break;
    }
    case 'attack': {
      requireRule(player.field.includes(command.attacker),'Choose an attacker from your field.'); requireRule(next.turn>1,'The starting player cannot battle on the first turn.');
      requireRule(!player.field.some(id=>card(next,id).def==='nurikabe' && card(next,id).summonedTurn===next.turn),'Nurikabe prevents your yokai from attacking this summon turn.');
      const enemy=next.players[other(actor)]; requireRule(enemy.field.length>0 ? typeof command.target==='string' && enemy.field.includes(command.target) : command.target===null,'Choose an opposing yokai, or attack directly when its field is empty.');
      const attack={attacker:command.attacker,target:command.target};
      next.history.push(`${player.name} attacks with ${CARDS[card(next,attack.attacker).def].name}${attack.target ? ` against ${CARDS[card(next,attack.target).def].name}` : ' directly'}.`);
      if(enemy.trap) {
        next.phase='trap'; next.decisionPlayer=other(actor); next.pending={kind:'trap',actor:other(actor),...attack};
        // Recorded games may include the older pause for an unusable trap.
        if(recordedTrapResponse || canActivate(next,enemy.trap,'trap')) break;
        next.decisionPlayer=actor;
      }
      resolveAttack(next,attack);
      break;
    }
    case 'endTurn': endTurn(next); break;
    default: throw new RuleError('Choose a valid action.');
  }
  return next;
}
