export type PlayerId = 0 | 1;
export type CardDefId = 'karakasa-kozo' | 'kappa' | 'nekomata' | 'zashiki-warashi' | 'chochin-kozo' | 'rokurokubi' | 'yuki-onna' | 'tengu' | 'nurikabe' | 'sake' | 'kozuchi' | 'jufu' | 'boseki' | 'ougi' | 'hamaya';
export interface CardDefinition { id: CardDefId; name: string; japanese: string; kind: 'yokai' | 'spell'; atk: number; cap: number; effectType: 'passive' | 'possession' | 'release' | 'spell'; text: string; }
export interface CardInstance { id: string; def: CardDefId; owner: PlayerId; souls: number; summonedTurn: number; }
export interface PlayerState { name: string; health: number; deck: string[]; hand: string[]; field: string[]; graveyard: string[]; trap: string | null; }
export interface Attack { attacker: string; target: string | null; }
export type Pending = ({kind:'trap'; actor:PlayerId} & Attack) | {kind:'effect'; actor:PlayerId; cardId:string; source:'cast'|'trap'|'release'; attack:Attack|null};
export interface GameState { rulesVersion:1; turn:number; turnPlayer:PlayerId; decisionPlayer:PlayerId; phase:'main'|'trap'|'effect'|'finished'; actionsUsed:number; supply:number; cards:Record<string,CardInstance>; players:[PlayerState,PlayerState]; pending:Pending|null; result:{winner:PlayerId|null;reason:string}|null; history:string[]; }
export type GameCommand = {type:'play';cardId:string} | {type:'evoke';cardId:string} | {type:'release';cardId:string} | {type:'setTrap';cardId:string} | ({type:'attack'} & Attack) | {type:'respond';activate:boolean} | {type:'choose';targets?:string[];allocations?:{cardId:string;count:number}[]} | {type:'endTurn'};
export interface SetupOptions { seed:number; names?:[string,string]; startingPlayer?:PlayerId; }
export interface VisibleCard extends CardInstance { definition:CardDefinition; attack:number; controller:PlayerId; zone:'hand'|'field'|'graveyard'|'trap'; }
export interface PlayerView { id:PlayerId; name:string; health:number; deckCount:number; handCount:number; hand:VisibleCard[]|null; field:VisibleCard[]; graveyard:VisibleCard[]; trap:VisibleCard|{hidden:true}|null; }
export interface GameView { rulesVersion:1; turn:number; turnPlayer:PlayerId; decisionPlayer:PlayerId; phase:GameState['phase']; actionsUsed:number; supply:number; players:[PlayerView,PlayerView]; pending:Pending|null; result:GameState['result']; history:string[]; }
