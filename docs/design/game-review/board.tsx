import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame } from '../../../src/game/engine';
import { viewForPlayer } from '../../../src/game/views';
import { CARDS } from '../../../src/game/catalog';
import type { CardDefId, PlayerId, VisibleCard } from '../../../src/game/types';
import { CardFace } from '../../../src/ui/CardFace';
import { publicAsset } from '../../../src/ui/assets';
import './board.css';

type Scene = 'main' | 'trap' | 'ougi' | 'notice' | 'connection';
type Motion = 'attack' | 'soul' | '';
interface Comment { id:string; option:string; actor:string; scene:Scene; target:string; region:string; x:number; y:number; }
interface Preview { option:'a'|'b'|'c'; actor:'mine'|'opponent'; scene:Scene; tooltip:boolean; commentMode:boolean; comments:Comment[]; replay:number; motion:Motion; reduced:boolean; selectedComment?:string; }
const initial:Preview = { option:'a', actor:'mine', scene:'main', tooltip:false, commentMode:false, comments:[], replay:0, motion:'', reduced:false };
const requested=new URLSearchParams(location.search);
if(['a','b','c'].includes(requested.get('option')??''))initial.option=requested.get('option') as Preview['option'];
if(requested.get('scene')&&['main','trap','ougi','notice','connection'].includes(requested.get('scene')!))initial.scene=requested.get('scene') as Scene;
if(requested.get('actor')==='opponent')initial.actor='opponent';
const send = (message:object) => parent.postMessage(message,location.origin);
const fixture = createGame({ seed:42, names:['Alex','Poli'], startingPlayer:0 });
for (const p of fixture.players) { p.deck.push(...p.hand); p.hand=[]; }
function place(def:CardDefId,owner:PlayerId,zone:'field'|'hand'|'graveyard'|'trap',souls=0) {
  const card=Object.values(fixture.cards).find(c=>c.owner===owner&&c.def===def)!;
  fixture.players[owner].deck=fixture.players[owner].deck.filter(id=>id!==card.id);
  if(zone==='trap') fixture.players[owner].trap=card.id; else fixture.players[owner][zone].push(card.id);
  card.souls=souls; fixture.supply-=souls;
}
place('yuki-onna',0,'field',1); place('nekomata',0,'field'); place('kappa',1,'field'); place('tengu',1,'field');
place('ougi',0,'trap'); place('hamaya',1,'trap'); place('rokurokubi',1,'graveyard');
for(const id of ['karakasa-kozo','sake','kozuchi','jufu','zashiki-warashi'] as const) place(id,0,'hand');
for(const id of ['sake','jufu','boseki'] as const) place(id,1,'hand');
const base=viewForPlayer(fixture,0);
function Icon({name}:{name:'undo'|'history'|'settings'|'arrow'|'check'|'close'|'wifi'}) {
  const paths={undo:'m9 5-5 5 5 5M4 10h9a6 6 0 0 1 0 12',history:'M4 7h16M4 12h16M4 17h10',settings:'M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2M16 8l2-2',arrow:'M5 12h14m-5-5 5 5-5 5',check:'m5 12 4 4 10-10',close:'m6 6 12 12M6 18 18 6',wifi:'M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0M12 20h.01'};
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
function Soul(){return <img className="soul-icon" src={publicAsset('icons/soul.svg')} alt="soul"/>;}
function Modal({label,onClose,children}:{label:string;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="modal" aria-label={label} onClose={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><button className="close icon-button" aria-label={`Close ${label}`} onClick={onClose}><Icon name="close"/></button>{children}</dialog>;
}
function App(){
  const [preview,setPreview]=useState<Preview>(initial),[donor,setDonor]=useState<string>(),[transfer,setTransfer]=useState<{from:string;to:string}>();
  const [inspected,setInspected]=useState<VisibleCard>(),[hovered,setHovered]=useState<VisibleCard>(),[shift,setShift]=useState(false);
  const [historyOpen,setHistoryOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false);
  const [stage,setStage]=useState<'idle'|'attack'|'death'|'done'|'soul'>('idle'),[receipt,setReceipt]=useState('Alex evoked a soul onto Yuki-onna.'),[pins,setPins]=useState<{comment:Comment;x:number;y:number;number:number}[]>([]);
  const root=useRef<HTMLDivElement>(null),timers=useRef<number[]>([]),[travel,setTravel]=useState({x:0,y:0});
  const mine=preview.actor==='mine',reduced=preview.reduced;
  const opponent=base.players[1],you=base.players[0],own=you.field,enemy=opponent.field;
  const dead=stage==='done'&&preview.motion==='attack',damaged=(stage==='death'||dead)&&preview.motion==='attack';
  const souled=stage==='soul'&&preview.motion==='soul';
  function live(card:VisibleCard):VisibleCard {
    let souls=card.souls+(souled&&card.id===own[0].id?1:0)+(transfer?.to===card.id?1:0)-(transfer?.from===card.id?1:0);
    return {...card,souls,attack:card.definition.atk+souls*(card.def==='kappa'?2:1)};
  }
  const shown=preview.tooltip?own[0]:inspected??(shift?hovered:undefined);
  const trap=preview.scene==='trap',ougi=preview.scene==='ougi',offline=preview.scene==='connection',exhausted=preview.scene==='notice';
  const actions=exhausted?0:stage==='idle'?2:1;
  const actor=mine?'You':'Poli';
  const status=offline?'Connection lost':trap?mine?'Your trap response':'Poli is choosing a trap':ougi?mine?'You choose for Ougi':'Poli is resolving Ougi':mine?'Your turn':'Poli’s turn';
  const task=offline?'Your position is saved. Reconnect to continue.':trap?mine?'Activate Ougi?':'Waiting for Poli to respond.':ougi?mine?transfer?'Soul transferred':donor?'Choose the recipient':'Choose a soul donor':'Waiting for a soul transfer.':mine?exhausted?'No actions left':`${actions} actions left`:'Waiting for Poli’s move';
  const context=trap||ougi?`Turn 3 belongs to ${mine?'Poli':'Alex'}`:offline?'Moves are paused':'Turn 3';
  function clearTimers(){timers.current.forEach(window.clearTimeout);timers.current=[];}
  useEffect(()=>{
    const receive=(e:MessageEvent)=>{
      if(e.origin!==location.origin||e.source!==parent)return;
      if(e.data?.type==='review:state')setPreview(e.data);
      if(parent!==window)return;
      if(e.data?.type==='review:actor'&&['mine','opponent'].includes(e.data.actor))setPreview(p=>({...p,actor:e.data.actor,motion:''}));
      if(e.data?.type==='review:scene'&&['main','trap','ougi','notice','connection'].includes(e.data.scene))setPreview(p=>({...p,scene:e.data.scene,motion:''}));
      if(e.data?.type==='review:tooltip'&&typeof e.data.show==='boolean')setPreview(p=>({...p,tooltip:e.data.show}));
    };
    const down=(e:KeyboardEvent)=>{if(e.key==='Shift')setShift(true);}; const up=(e:KeyboardEvent)=>{if(e.key==='Shift')setShift(false);};
    window.addEventListener('message',receive);window.addEventListener('keydown',down);window.addEventListener('keyup',up);send({type:'review:ready'});
    return()=>{clearTimers();window.removeEventListener('message',receive);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
  },[]);
  useEffect(()=>{setDonor(undefined);setInspected(undefined);if(preview.scene==='ougi')setTransfer(undefined);},[preview.scene]);
  useEffect(()=>{setDonor(undefined);setTransfer(undefined);setInspected(undefined);setStage('idle');setReceipt('Alex evoked a soul onto Yuki-onna.');},[preview.actor,preview.option]);
  useEffect(()=>{
    clearTimers();setStage('idle');setTransfer(undefined);
    if(!preview.motion)return;
    if(preview.motion==='soul'){
      setStage('soul');setReceipt('Yuki-onna gained 1 soul. Attack 4 → 5.');return;
    }
    const from=document.querySelector('[data-motion-card="attacker"]')?.getBoundingClientRect(),to=document.querySelector('[data-motion-card="defender"]')?.getBoundingClientRect();
    if(from&&to)setTravel({x:(to.left+to.width/2-from.left-from.width/2)*.65,y:(to.top+to.height/2-from.top-from.height/2)*.65});
    if(reduced||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setStage('done');setReceipt('Yuki-onna defeated Kappa. Poli lost 2 health.');return;}
    setStage('attack');setReceipt('Yuki-onna attacks Kappa.');
    timers.current.push(window.setTimeout(()=>{setStage('death');setReceipt('Kappa is defeated. Poli lost 2 health.');},550));
    timers.current.push(window.setTimeout(()=>{setStage('done');setReceipt('Yuki-onna defeated Kappa. Poli lost 2 health.');},800));
    return clearTimers;
  },[preview.replay,preview.motion,preview.option,preview.actor,reduced]);
  useLayoutEffect(()=>{
    function measure(){setPins(preview.comments.map((comment,index)=>({comment,number:index+1})).filter(p=>p.comment.option===preview.option&&p.comment.actor===preview.actor&&p.comment.scene===preview.scene).flatMap(p=>{const el=Array.from(document.querySelectorAll(`[data-review="${CSS.escape(p.comment.target)}"]`)).find(el=>el.getBoundingClientRect().width>0);if(!el)return[];const r=el.getBoundingClientRect();return[{...p,x:r.left+r.width*p.comment.x,y:r.top+r.height*p.comment.y}];}));}
    const observer=new ResizeObserver(measure);if(root.current)observer.observe(root.current);measure();window.addEventListener('resize',measure);return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[preview,shown?.id,donor,stage]);
  function choose(card:VisibleCard){
    if(ougi&&mine&&card.zone==='field'){
      if(transfer)return;
      if(!donor&&live(card).souls>0)setDonor(card.id);
      else if(donor&&donor!==card.id&&live(card).souls<card.definition.cap){setTransfer({from:donor,to:card.id});setReceipt(`Ougi moved a soul to ${card.definition.name}.`);setDonor(undefined);}
      return;
    }setInspected(card);
  }
  function card(card:VisibleCard,hand=false){
    const available=ougi&&mine&&!transfer&&card.zone==='field'&&(donor?donor!==card.id&&live(card).souls<card.definition.cap:live(card).souls>0);
    const isAttacker=card.id===own[0].id,isDefender=card.id===enemy[0].id;
    return <button key={card.id} className={`card ${hand?'hand-card':''} ${available?'available':''} ${donor===card.id?'chosen':''} ${isAttacker&&stage==='attack'?'attacking':''} ${isDefender&&stage==='death'?'dying':''} ${isDefender&&dead?'removed':''} ${isAttacker&&souled?'soul-added':''}`} data-review={`card:${card.id}`} data-region={card.definition.name} data-motion-card={isAttacker?'attacker':isDefender?'defender':undefined} style={{'--attack-x':`${travel.x}px`,'--attack-y':`${travel.y}px`} as CSSProperties} onClick={()=>choose(card)} onPointerEnter={()=>setHovered(card)} onPointerLeave={()=>setHovered(undefined)} aria-label={`${card.definition.name}${hand?'':`, ${live(card).attack} attack, ${live(card).souls} souls`}${available?', available target':''}`} aria-pressed={donor===card.id} disabled={isDefender&&dead}>
      <CardFace card={live(card)}/>{hand&&<span className="hand-name">{card.definition.name}</span>}{available&&<span className="target-tag">{donor?'Receive':'Donate'}</span>}{donor===card.id&&<span className="target-tag"><Icon name="check"/> Donor</span>}
    </button>;
  }
  function piles(seat:PlayerId){
    const p=base.players[seat],revealed=seat===0&&(ougi||!!transfer),grave=revealed?'ougi':seat===1&&dead?enemy[0].def:p.graveyard.at(-1)?.def;
    const graveCount=p.graveyard.length+(revealed||seat===1&&dead?1:0);
    return <div className="piles" data-review={`piles:${seat}`} data-region={seat?'Opponent piles':'Your piles'}><div className="pile"><img src={publicAsset(`cards/${seat?'back-ochre':'back'}.svg`)} alt=""/><span><b>{p.deckCount}</b> Deck</span></div><button className="pile" onClick={()=>setInspected(revealed?{...own[0],def:'ougi',definition:CARDS.ougi,zone:'graveyard'}:seat===1&&dead?enemy[0]:p.graveyard.at(-1))} disabled={!grave} aria-label={`${p.name} graveyard, ${graveCount} cards`}>{grave?<img src={publicAsset(`cards/${grave}.png`)} alt=""/>:<span className="empty-card"/>}<span><b>{graveCount}</b> Graveyard</span></button><button disabled={revealed} className={`pile trap ${trap&&mine&&seat===0?'trap-ready':''}`} onClick={()=>seat===0?setInspected({...own[0],def:'ougi',definition:CARDS.ougi,zone:'trap'}):setReceipt('Poli’s trap stays hidden.')} aria-label={seat?'Poli’s hidden trap':revealed?'Your empty trap':'Your Ougi trap'}>{revealed?<span className="empty-card">×</span>:<img src={publicAsset(`cards/${seat?'back-ochre.svg':'ougi.png'}`)} alt=""/>}<span>Trap</span></button></div>;
  }
  function player(seat:PlayerId){return <div className={`player player-${seat}`} data-review={`player:${seat}`} data-region={seat?'Opponent health':'Your health'}><span className="player-name">{seat?'Poli':'Alex'}{seat===0&&<small>You</small>}</span><span className="health" aria-label={`${seat?'Poli':'Alex'}, ${seat&&damaged?13:15} health`}><span aria-hidden="true">♥</span>{seat&&damaged?13:15}</span>{seat===1&&damaged&&<span className="damage-receipt">−2</span>}</div>;}
  const decision=<section className={`decision ${mine?'your-decision':'their-decision'}`} data-review="decision" data-region="Current decision and controls" aria-label="Current decision"><div className="task-copy" role="status"><span className="decision-label">{status}</span><strong>{task}</strong>{ougi&&mine&&!transfer?<span className="steps"><span className={!donor?'current':''}>1 Donor</span><Icon name="arrow"/><span className={donor?'current':''}>2 Recipient</span></span>:trap?<span className="task-help">{mine?'Move 1 soul before the attack resolves.':'The attack is paused.'}</span>:<span className="task-help">{ougi&&transfer?'Both cards are updated. Continue when ready.':mine&&exhausted?'End your turn when you’re ready.':!mine?'You can still inspect any visible card.':'Play, attack or evoke a soul.'}</span>}</div><div className="action-buttons"><button className="undo" aria-label="Undo" onClick={()=>{clearTimers();setStage('idle');setTransfer(undefined);setDonor(undefined);setReceipt('Last action undone.');send({type:'review:actor',actor:'mine'});}} disabled={offline}><Icon name="undo"/></button>{offline?<button className="primary" onClick={()=>send({type:'review:scene',scene:'main'})}>Reconnect</button>:mine&&trap?<><button className="secondary" onClick={()=>send({type:'review:scene',scene:'main'})}>Keep hidden</button><button className="primary" onClick={()=>send({type:'review:scene',scene:'ougi'})}>Activate Ougi</button></>:mine&&ougi?transfer?<button className="primary" onClick={()=>send({type:'review:scene',scene:'main'})}>Continue</button>:<button className="secondary" onClick={()=>setDonor(undefined)}>Clear choice</button>:mine?<button className={`end-turn ${exhausted?'primary':'secondary'}`} onClick={()=>send({type:'review:actor',actor:'opponent'})}>End turn</button>:<span className="waiting"><Icon name="history"/> No response needed</span>}</div></section>;
  const history=<div className="history-content" data-review="history" data-region="History and last event"><h2>History</h2><section className="last-event" aria-live="polite"><span>Latest</span><p>{receipt}</p></section><h3>Turn 3: Alex</h3><p>Evoked a soul onto <button className="text-link" onClick={()=>setInspected(own[0])}>Yuki-onna</button>.</p><p>Summoned <button className="text-link" onClick={()=>setInspected(own[1])}>Nekomata</button>.</p><h3>Turn 2: Poli</h3><p>Set a spell trap.</p><p>Summoned <button className="text-link" onClick={()=>setInspected(enemy[0])}>Kappa</button>.</p></div>;
  function commentAt(e:React.MouseEvent){
    if(!preview.commentMode)return;const el=(e.target as Element).closest<HTMLElement>('[data-review]');if(!el||el.closest('.comment-pin'))return;e.preventDefault();e.stopPropagation();const r=el.getBoundingClientRect();send({type:'review:target',target:el.dataset.review,region:el.dataset.region??el.dataset.review,x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))});
  }
  const detailContent=shown&&<div className="card-details" data-review="tooltip" data-region="Card details"><img src={publicAsset(`cards/${shown.def}.png`)} alt={`${shown.definition.name} card`}/><div><span className="card-type">{shown.definition.kind==='spell'?'Spell · can be set as a trap':`${shown.definition.effectType} yokai`}</span><h2>{shown.definition.name}</h2><p lang="ja">{shown.definition.japanese}</p><p className="rule">{shown.definition.text}</p>{shown.definition.effectType==='possession'&&<p className="rule-note">Active while this yokai has a soul.</p>}</div></div>;
  return <div ref={root} className={`concept option-${preview.option} ${mine?'mine':'opponent'} scene-${preview.scene} ${reduced?'reduced':''} ${preview.commentMode?'comment-mode':''}`} onClickCapture={commentAt}>
    <header className="game-header" data-review="toolbar" data-region="Toolbar"><a className="wordmark" href="#" onClick={e=>e.preventDefault()}>Yokai <span>1504</span></a><span className="round">Turn 3</span><span className="supply">Supply <b>{base.supply-(souled?1:0)}</b><Soul/></span><button className="mobile-history icon-button" aria-label="Open history" onClick={()=>setHistoryOpen(true)}><Icon name="history"/></button><button className="icon-button" aria-label="Open settings" onClick={()=>setSettingsOpen(true)}><Icon name="settings"/></button></header>
    <div className="status-line" data-review="status" data-region="Who acts now" role="status"><span className="actor-mark" aria-hidden="true">{offline?'!':mine?'↓':'↑'}</span><strong>{status}</strong><span>{context}</span>{preview.option==='c'&&<b className="budget">{mine&&!trap&&!ougi?`${actions} actions`:mine?'Your response':'Waiting'}</b>}</div>
    <main className="game-layout"><div className="playmat" data-review="table" data-region="Table and atmosphere"><div className="turn-atmosphere" key={`${preview.actor}-${preview.option}-${preview.replay}`} aria-hidden="true"/>
      <div className="far-edge" data-review="opponent-hand" data-region="Opponent hand">{player(1)}<div className="hidden-hand" aria-label="Poli, 3 hidden cards">{[0,1,2].map(i=><img key={i} src={publicAsset('cards/back-ochre.svg')} alt=""/>)}</div>{preview.option==='c'&&<div className="mobile-own-score">{player(0)}</div>}<span className="far-note">{!mine?'Deciding now':'Opponent'}</span></div>
      <section className="half opponent-half" data-review="opponent-field" data-region="Opponent field">{piles(1)}<div className="field">{enemy.map(c=>card(c))}<span className="unoccupied" aria-label="Empty yokai position"/></div></section>
      <div className="center-divider" data-review="divider" data-region="Center and attack information"><span/>{trap||ougi?<b>Attack paused</b>:preview.option==='c'?<b>{stage==='attack'?'Attack 4 → 2':'Battlefield'}</b>:<i/>}<span/></div>
      <section className="half your-half" data-review="your-field" data-region="Your field"><div className="field">{own.map(c=>card(c))}<span className="unoccupied" aria-label="Empty yokai position"/></div>{piles(0)}</section>
      <div className="near-edge" data-review="your-hand" data-region="Your hand"><div className="player-dock">{player(0)}{preview.option==='a'&&<div className="desktop-local-decision">{decision}</div>}</div><div className="visible-hand" tabIndex={0} aria-label="Your hand, 5 cards">{you.hand?.map(c=>card(c,true))}</div></div>
    </div><aside className="side-rail"><div className="rail-current" data-review="rail-status" data-region="Current actor"><span>{context}</span><h1>{status}</h1></div>{preview.option!=='a'&&<div className="desktop-rail-decision">{decision}</div>}{history}<p className="rail-hint">Tap a card to inspect.<br/>Shift + hover also works.</p></aside></main>
    <div className="mobile-decision">{decision}</div><button className="mobile-receipt" onClick={()=>setHistoryOpen(true)} data-review="last-event" data-region="Last event shortcut"><Icon name="history"/><span>{receipt}</span></button>
    {shown&&(preview.tooltip||inspected?<Modal key={shown.id} label={`${shown.definition.name} details`} onClose={()=>{setInspected(undefined);setShift(false);send({type:'review:tooltip',show:false});}}>{detailContent}</Modal>:<div className="hover-details" role="tooltip" aria-label={`${shown.definition.name} details`}>{detailContent}</div>)}
    {historyOpen&&<Modal label="History" onClose={()=>setHistoryOpen(false)}>{history}</Modal>}
    {settingsOpen&&<Modal label="Settings" onClose={()=>setSettingsOpen(false)}><h2>Display</h2><label className="motion-setting"><input type="checkbox" checked={reduced} onChange={e=>{setPreview(p=>({...p,reduced:e.target.checked}));send({type:'review:reduced',reduced:e.target.checked});}}/> Reduce motion</label><p>Animation results stay visible in history. Your system’s reduced-motion preference is also respected.</p><p className="prototype-note">Design prototype. No live game is running.</p></Modal>}
    {preview.commentMode&&<><div className="comment-instruction">Нажмите на часть макета</div>{pins.map(p=><button key={p.comment.id} className={`comment-pin ${preview.selectedComment===p.comment.id?'focused':''}`} style={{left:p.x,top:p.y}} aria-label={`Read comment ${p.number}`} onClick={()=>send({type:'review:comment',id:p.comment.id})}>{p.number}</button>)}</>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
