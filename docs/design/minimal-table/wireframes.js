const $=s=>document.querySelector(s);
const state={device:'phone',scene:'main',commenting:false};
let comments=[],pending;
const names={a:'Centered table · full field'};
const moments={main:'At rest',play:'Drag a spell',attack:'Attack',soul:'Souls',trap:'Trap response',effect:'Ougi targets',return:'Return later'};
const button=(text,extra='')=>`<span class="wbutton ${extra}">${text}</span>`;
const region=(id,title,html,cls='')=>`<div class="${cls}" data-region="${id}" data-label="${title}">${html}</div>`;
const card=(name,stats='',extra='')=>`<div class="wc ${extra}"><strong>${name}</strong>${stats?`<small>${stats}</small>`:''}</div>`;
const backs=region('opponent-hand','Opponent hand: mirrored fan of card backs','<i class="back"></i><i class="back"></i><i class="back"></i>','opponent-cards');
function header(){return '';}
function unit(id,name,stats){
 const selected=(id==='yuki'&&['attack','soul','effect'].includes(state.scene))||(['neko','tengu'].includes(id)&&state.scene==='trap');
 const target=(id==='kappa'&&['attack','effect'].includes(state.scene));
 const hidden=id==='yuki'&&state.scene==='attack';
 const extra=id==='yuki'&&state.scene==='soul'?region('action-area','Add a soul: appears only for the selected eligible yokai','+ soul','soul-add'):'';
 const soul=id==='yuki'?'<span class="soul-origin"></span>':'';
 return region(`card:${id}`,`${name}: direct card interaction`,`${card(name,stats,`${selected?'selected ':''}${target?'target':''}`)}${soul}${extra}`,`card-position ${hidden?'origin-empty':''}`);
}
function life(near=false){
 const response=['trap','effect'].includes(state.scene);
 const caption=near?(response?'Your response':'Your turn'):'Poli';
 const dots=near&&!response?'<div class="action-dots" aria-label="2 actions left"><i></i><i></i></div>':'';
 return region(near?'health-near':'health-far',near?'Your health: actions horizontally to its right':'Opponent health: mirrored between hand and field',`<div class="life"><strong><small>♥</small> 15</strong>${dots}<span class="player-caption">${caption}</span></div>`,near?'health-near':'health-far');
}
function seatStatus(near=false){
 const response=['trap','effect'].includes(state.scene),owner=near?'Your':'Opponent';
 const piles=region(near?'your-piles':'enemy-piles',`${owner} deck and graveyard at the left screen edge`,'<i class="pile-object"><span class="object-label">Deck</span></i><i class="pile-object empty"><span class="object-label">Graveyard</span></i>','seat-piles');
 const trap=region(near?'trap':'enemy-trap',`${owner} trap at the right screen edge`,`<i class="pile-object trap-card"><span class="trap-symbol">${near?(response?'Ougi':'×'):'?'}</span><span class="object-label">Trap</span></i>`,'seat-trap');
 return region(near?'your-seat':'opponent-seat',`${owner} seat: piles, health, trap`,`${piles}${life(near)}${trap}`,`seat-status ${near?'seat-near':'seat-far'}`);
}
function menu(){return `<span class="menu-symbol">☰${state.scene==='return'?'<i class="new-count">2</i>':''}</span>`;}
function hand(){
 const cards=[['Sake','sake'],['Kozuchi','kozuchi'],['Karakasa','karakasa']].filter(([,id])=>!(state.scene==='play'&&id==='sake'));
 return region('hand','Your hand: fan of cards, drag to act; hold to inspect',cards.map(([name,id])=>region(`hand:${id}`,`${name} in hand`,card(name),'card-position')).join(''),'hand-objects');
}
function path(model){
 const wide=state.device==='desktop',w=wide?1120:360,h=wide?660:720;
 let d;
 if(state.scene==='attack')d=wide?'M424 300 Q420 267 424 238':'M123 335 Q90 300 68 263';
 if(state.scene==='trap')d=wide?'M560 314 L560 340':'M180 329 L180 385';
 if(state.scene==='effect')d=wide?'M456 355 Q470 300 424 238':'M98 401 Q125 355 68 263';
 if(!d)return '';
 const x=state.scene==='trap'?(wide?560:180):(wide?424:68),y=state.scene==='trap'?(wide?342:387):(wide?236:261);
 const tip=state.scene==='trap'?`${x-5},${y-9} ${x},${y} ${x+5},${y-9}`:`${x-5},${y+9} ${x},${y} ${x+5},${y+9}`;
 return `<svg class="drag-path" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/><polygon points="${tip}"/></svg>`;
}
function board(model){
 const response=['trap','effect'].includes(state.scene);
 const far=`<div class="edge-far">${backs}<div class="corner-tools">${region('menu','Compact menu: rules, history and settings',menu())}</div></div>`;
 const enemy=region('enemy-field','Enemy cards: drag or click to target',`${unit('kappa','Kappa','2 ATK')}${unit('tengu','Tengu','4 ATK')}${unit('rokuro','Rokurokubi','3 ATK')}`,'zone enemy');
 const yours=region('your-field','Your field: also the shared play destination for yokai and spells',`${unit('yuki','Yuki-onna','4 ATK · 1 soul')}${unit('neko','Nekomata','3 ATK')}${unit('zashiki','Zashiki-warashi','2 ATK')}`,'zone yours');
 const supply=region('supply','Supply: 10 souls at the left end of the divider','<span class="supply-object">10<i></i></span>','divider-supply');
 const utilities=region('undo','End turn on the divider; separate Undo hit area beside it',`${!response?'<span class="undo-icon">↶</span>':''}${button('End turn',response?'disabled':'')}`,'divider-utilities');
 const drops=state.scene==='play'?region('play-destination','Appears only while dragging: drop onto your whole field to play','<span>Play</span>','drop-field')+region('trap-destination','Drop the same spell here to set it','Set trap','drop-trap'):'';
 const dragged=state.scene==='play'||state.scene==='attack'?region('action-area','The lifted card replaces its original; no duplicate remains',card(state.scene==='play'?'Sake':'Yuki-onna',state.scene==='play'?'Spell':'4 ATK · 1 soul')+'<i class="finger"></i>','ghost-card'):'';
 const choice=state.scene==='trap'?region('action-area','Only required decision UI; stays until answered',`<strong>Use Ougi?</strong><div class="button-row">${button('Activate','primary')}${button('Keep hidden')}</div>`,'floating-choice'):'';
 const cue=state.scene==='effect'?region('action-area','Ougi: tap a donor yokai and then a recipient on the existing field','Donor → recipient','effect-cue'):'';
 return region('table','Board-first layout; no command menu or permanent history',`<div class="active-side"></div>${far}${enemy}<div class="middle-rule"></div>${yours}${seatStatus(false)}${seatStatus(true)}${hand()}${supply}${utilities}${drops}${dragged}${path(model)}${choice}${cue}`,`minimal-screen layout-${model} state-${state.scene}`);
}
const a=()=>board('a');
const descriptions={a:'Three yokai on each side. Health stays centered; piles and traps move to the screen edges. Supply and turn controls share the divider.'};
const commonFlows={main:'Select an object → legal destinations appear → drag/drop or click the destination',play:'Spell → your field to play / trap position to set → effect targets on the same field',attack:'Yokai → enemy card or exposed player health → resolve → update values in place',soul:'Select an eligible yokai → small + soul appears beside it → soul fills its slot',trap:'Attack pauses → Activate / Keep hidden beside the trap → resume only after the decision',effect:'Tap the donor yokai → tap the recipient yokai → visible transfer → resume battle',return:'Live table immediately → small unread-history cue → recent events only if opened'};
const flows={a:commonFlows};
const commonNotes={play:'Destinations exist only during selection or drag. No Play / Set action sheet, separate spell area or second placement animation.',attack:'No Attack button or confirmation screen. Selecting a target commits. Undo is separate; releasing over empty space or tapping away cancels.',soul:'This control belongs to the selected card, not a command bar. A filled soul is the source for a release ability when one is available.',trap:'This is one of the few moments that needs explicit buttons. No timer, full-screen takeover, or auto-ended turn.',effect:'The field stays visible. Donor and recipient are yokai on the table; there are no separate card lists or step screens.',return:'No welcome screen, forced recap or permanent journal. Changed state is already on the live table; history is available from the menu.'};
const annotations={a:{...commonNotes,main:'The field is shown at its full capacity: three cards per player. Supply is on the left end of the divider; End turn and Undo on the right. The health values and fans remain mirrored.'}};
function render(){
 $('#wireframes').className=`wireframes ${state.device} ${state.commenting?'commenting':''}`;
 $('#wireframes').innerHTML=['a'].map(option=>`<article class="concept" data-option="${option}"><div class="concept-heading"><h2>${option.toUpperCase()} · ${names[option]}</h2><p>${state.device==='desktop'?'Larger deck, graveyard and trap. Your health and actions sit in the lower-left corner; the field keeps three cards per side.':descriptions[option]}</p></div><div class="frame-wrap"><div class="frame">${header(option)}<div class="wf-body">${({a})[option]()}</div></div></div><p class="flow-line"><strong>${moments[state.scene]}</strong>${flows[option][state.scene]}</p><p class="annotation">${state.device==='desktop'&&state.scene==='main'?'Full fields stay centered. Larger piles and traps remain at the edges; your health and actions occupy the lower-left corner.':annotations[option][state.scene]}</p></article>`).join('');
 for(const kind of ['device','scene'])document.querySelectorAll(`[data-${kind}]`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[kind]===state[kind])));
 $('#comment-mode').setAttribute('aria-pressed',String(state.commenting));$('#comment-mode').textContent=state.commenting?'Stop commenting':'Pin a comment';
 fit();
}
function fit(){
 for(const article of document.querySelectorAll('.concept')){
  const frame=article.querySelector('.frame'),wrap=article.querySelector('.frame-wrap');
  const width=state.device==='phone'?360:1120,height=state.device==='phone'?720:660,scale=Math.min(1,article.clientWidth/width);
  wrap.style.width=`${width*scale}px`;wrap.style.height=`${height*scale}px`;frame.style.transform=`scale(${scale})`;
  frame.querySelectorAll('.comment-pin').forEach(p=>p.remove());
  comments.forEach((c,i)=>{
   if(c.option!==article.dataset.option||c.scene!==state.scene||!c.target.startsWith(`${state.device}:`))return;
   const el=frame.querySelector(`[data-region="${CSS.escape(c.target.split(':').slice(1).join(':'))}"]`);if(!el)return;
   const rect=el.getBoundingClientRect(),root=frame.getBoundingClientRect(),pin=document.createElement('button');
   pin.className='comment-pin';pin.textContent=i+1;pin.setAttribute('aria-label',`Read comment ${i+1}`);pin.style.left=`${(rect.left-root.left+rect.width*c.x)/scale}px`;pin.style.top=`${(rect.top-root.top+rect.height*c.y)/scale}px`;pin.addEventListener('click',()=>{$('#comments-panel').hidden=false;});frame.append(pin);
  });
 }
}
for(const kind of ['device','scene'])document.querySelectorAll(`[data-${kind}]`).forEach(b=>b.addEventListener('click',()=>{state[kind]=b.dataset[kind];render();}));
$('#comment-mode').addEventListener('click',()=>{state.commenting=!state.commenting;render();});
$('#wireframes').addEventListener('click',event=>{
 if(!state.commenting||event.target.closest('.comment-pin'))return;
 const el=event.target.closest('[data-region]'),article=el?.closest('.concept');if(!el||!article)return;
 const r=el.getBoundingClientRect();pending={option:article.dataset.option,actor:'mine',scene:state.scene,target:`${state.device}:${el.dataset.region}`,region:el.dataset.label||el.dataset.region,x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))};
 $('#composer-title').textContent=pending.region;$('#comment-context').textContent=`${names[pending.option]} · ${state.device} · ${moments[state.scene]}`;$('#comment-note').value='';$('#comment-error').textContent='';$('#composer').showModal();$('#comment-note').focus();
});
$('#comments-toggle').addEventListener('click',()=>{$('#comments-panel').hidden=!$('#comments-panel').hidden;});$('#comments-close').addEventListener('click',()=>{$('#comments-panel').hidden=true;});$('#comment-cancel').addEventListener('click',()=>$('#composer').close());
function status(text,error=false){$('#save-status').textContent=text;$('#save-status').classList.toggle('error',error);}
async function request(action){const response=await fetch('/api/minimal-table',action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)}:undefined);const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save comment.');comments=data.comments;renderComments();fit();}
$('#comment-form').addEventListener('submit',async event=>{event.preventDefault();$('#comment-save').disabled=true;try{await request({type:'add',comment:{...pending,note:$('#comment-note').value}});$('#composer').close();status('Comment saved locally.');}catch(error){$('#comment-error').textContent=error.message;}finally{$('#comment-save').disabled=false;}});
function renderComments(){
 $('#comment-count').textContent=comments.length;const list=$('#comments-list');list.replaceChildren();
 if(!comments.length){const p=document.createElement('p');p.textContent='Pin a comment on any region of a wireframe.';list.append(p);}
 comments.forEach((c,i)=>{const item=document.createElement('article');item.className='comment';const context=document.createElement('small');context.textContent=`${names[c.option]} · ${c.target.split(':')[0]} · ${moments[c.scene]}`;const title=document.createElement('h3');title.textContent=`${i+1}. ${c.region}`;const note=document.createElement('p');note.textContent=c.note;const row=document.createElement('div');row.className='button-row';const show=document.createElement('button');show.textContent='Show wireframe';show.onclick=()=>{state.device=c.target.split(':')[0];state.scene=c.scene;state.commenting=true;render();$('#comments-panel').hidden=true;document.querySelector(`[data-option="${c.option}"]`).scrollIntoView({block:'center',behavior:'instant'});};const remove=document.createElement('button');remove.textContent='Remove';remove.setAttribute('aria-label',`Remove comment ${i+1}`);remove.onclick=async()=>{try{await request({type:'delete',id:c.id});status('Comment removed.');}catch(error){status(error.message,true);}};row.append(show,remove);item.append(context,title,note,row);list.append(item);});
}
new ResizeObserver(fit).observe($('#wireframes'));render();request().catch(error=>status(error.message,true));
