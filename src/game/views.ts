import { CARDS } from './catalog';
import { attackOf, RuleError } from './engine';
import type { GameState, GameView, PlayerId, PlayerView, VisibleCard } from './types';

function project(state:GameState, viewer:PlayerId|null):GameView {
  const visible=(id:string,controller:PlayerId,zone:VisibleCard['zone']):VisibleCard=>({
    ...state.cards[id], definition:{...CARDS[state.cards[id].def]}, attack:attackOf(state,id), controller, zone,
  });
  const players=state.players.map((p,id)=>{
    const player=id as PlayerId, privateVisible=viewer===null || viewer===player;
    return {id:player,name:p.name,health:p.health,deckCount:p.deck.length,handCount:p.hand.length,
      hand:privateVisible ? p.hand.map(id=>visible(id,player,'hand')) : null,
      field:p.field.map(id=>visible(id,player,'field')),
      graveyard:p.graveyard.map(id=>visible(id,player,'graveyard')),
      trap:p.trap ? (privateVisible ? visible(p.trap,player,'trap') : {hidden:true as const}) : null,
    } satisfies PlayerView;
  }) as [PlayerView,PlayerView];
  return {rulesVersion:1,turn:state.turn,turnPlayer:state.turnPlayer,decisionPlayer:state.decisionPlayer,phase:state.phase,actionsUsed:state.actionsUsed,supply:state.supply,players,pending:structuredClone(state.pending),result:structuredClone(state.result),history:[...state.history]};
}
export function viewForPlayer(state:GameState,player:PlayerId):GameView {
  if(player!==0 && player!==1) throw new RuleError('Choose a valid player.');
  return project(state,player);
}
export function viewForLocalTesting(state:GameState):GameView { return project(state,null); }
