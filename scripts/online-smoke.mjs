import assert from 'node:assert/strict';
import { createServer } from 'vite';

const base = process.env.ONLINE_TEST_URL || 'http://127.0.0.1:8787';
const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
try {
  const ui = await vite.ssrLoadModule('/src/ui/interaction.ts');
  const request = async (path, token, body, expected = 200, attempt = 0) => {
    const response = await fetch(`${base}/api/matches${path}`, { method: body ? 'POST' : 'GET', headers: { ...(base.startsWith('http:') ? { 'CF-Connecting-IP': '192.0.2.123' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
    if (response.status === 429 && attempt < 3) { await new Promise(resolve => setTimeout(resolve, 60_000)); return request(path, token, body, expected, attempt + 1); }
    assert(response.headers.get('Content-Type')?.includes('application/json'), `Expected JSON from ${path || '/'}; received HTTP ${response.status} ${response.headers.get('Content-Type')}`);
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  };
  const credential = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('');
  const host = await request('', null, { name: 'Online QA host', matchId: crypto.randomUUID(), token: credential(), invite: credential() }, 201);
  const room = `/${host.matchId}`;
  const guest = await request(`${room}/join`, null, { name: 'Online QA guest', invite: host.invite, token: credential() });
  const tokens = [host.token, guest.token];
  await request(room, 'incorrect-token', undefined, 401);
  await request(`${room}/join`, null, { name: 'Uninvited', invite: host.invite, token: credential() }, 401);
  const read = seat => request(room, tokens[seat]);
  let views = await Promise.all([read(0), read(1)]);
  const privacy = pair => {
    for (const seat of [0, 1]) {
      assert.equal(pair[seat].viewer, seat);
      assert.equal(pair[seat].view.players[1 - seat].hand, null);
      for (const card of pair[1 - seat].view.players[1 - seat].hand ?? []) assert(!JSON.stringify(pair[seat]).includes(`"${card.id}"`), 'opponent hand identity leaked');
    }
  };
  privacy(views);
  await request(`${room}/replay`, tokens[0], undefined, 409);
  const initial = views[0].view;
  const actor = initial.decisionPlayer;
  const action = { commandId: crypto.randomUUID(), expectedRevision: views[actor].revision, command: { type: 'endTurn' } };
  await Promise.all([request(`${room}/commands`, tokens[actor], action), request(`${room}/commands`, tokens[actor], action)]);
  views = await Promise.all([read(0), read(1)]);
  assert.equal(views[0].view.turn, initial.turn + 1, 'a retry ran twice');
  await request(`${room}/commands`, tokens[actor], { ...action, commandId: crypto.randomUUID() }, 409);
  const send = async (seat, command) => {
    const current = await read(seat);
    return request(`${room}/commands`, tokens[seat], { commandId: crypto.randomUUID(), expectedRevision: current.revision, command });
  };
  await send(actor, { type: 'requestUndo' });
  await send(1 - actor, { type: 'acceptUndo' });
  views = await Promise.all([read(0), read(1)]);
  assert.equal(views[0].view.turn, initial.turn);
  assert(views[0].revision > action.expectedRevision, 'undo revisions must be monotonic');
  let steps = 0;
  while (!views[0].view.result && steps++ < 400) {
    const seat = views[0].view.decisionPlayer, view = views[seat].view;
    let command;
    if (view.phase === 'main') {
      const me = view.players[seat], enemy = view.players[1 - seat];
      const attacker = [...me.field].sort((a,b) => b.attack - a.attack).find(card => !ui.actionUnavailableReason(view,card,'attack'));
      const play = me.hand.find(card => !ui.actionUnavailableReason(view,card,'play'));
      const evoke = me.field.find(card => !ui.actionUnavailableReason(view,card,'evoke'));
      command = play ? { type: 'play', cardId: play.id } : evoke ? { type: 'evoke', cardId: evoke.id } : attacker ? { type: 'attack', attacker: attacker.id, target: [...enemy.field].sort((a,b) => a.attack-b.attack)[0]?.id ?? null } : { type: 'endTurn' };
    } else if (view.phase === 'turnEnd') command = { type: 'endTurn' };
    else if (view.phase === 'trap') {
      const trap = view.players[seat].trap;
      command = { type: 'respond', activate: !!trap && !('hidden' in trap) && !ui.effectUnavailableReason(view,trap) };
    } else {
      const source = ui.effectSource(view);
      let draft = ui.emptyDraft();
      if (source.def !== 'sake') {
        const first = ui.decisionCandidates(view,draft);
        const id = first.cards[0]?.id ?? (first.hiddenTrapSeats.length ? `trap:${first.hiddenTrapSeats[0]}` : undefined);
        if (id) draft = ui.updateDraft(draft,{type:'toggleTarget',id,maximum:first.maximum,ordered:source.def==='ougi'});
        if (source.def === 'ougi') {
          const recipient = ui.decisionCandidates(view,draft).cards.find(c => c.id !== id);
          assert(recipient); draft = ui.updateDraft(draft,{type:'toggleTarget',id:recipient.id,maximum:2,ordered:true});
        }
      }
      assert(ui.canConfirmEffect(view,draft), `no legal effect path for ${source.def}`);
      command = ui.effectCommand(view,draft);
    }
    await send(seat, command);
    views = await Promise.all([read(0),read(1)]); privacy(views);
  }
  assert(views[0].view.result,'match failed to finish');
  const file = await request(`${room}/replay`,tokens[0]);
  const { LocalSession } = await vite.ssrLoadModule('/src/session/local.ts');
  let saved;
  const imported = await new LocalSession({getItem:()=>saved??null,setItem:(_key,value)=>{saved=value;}},()=>crypto.randomUUID()).importReplay(JSON.stringify(file));
  assert.deepEqual(imported.view.result,views[0].view.result);
  console.log(`Online HTTP smoke passed: two private seats, one-use invite, retry/stale checks, agreed undo, ${steps} actions to victory, validated replay.`);
} finally { await vite.close(); }
