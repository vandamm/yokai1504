import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

// Use an existing Playwright install; this smoke adds no project dependency.
const playwright = process.env.AI_PLAYWRIGHT_MODULE;
if (!playwright) throw new Error('Set AI_PLAYWRIGHT_MODULE to an installed Playwright index.mjs.');
const { chromium } = await import(pathToFileURL(playwright).href);
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, clearScreen: false });
let browser;
const failures = [];
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, ...(process.env.AI_CHROME_EXECUTABLE ? { executablePath: process.env.AI_CHROME_EXECUTABLE } : {}) });
  const { createGame, applyCommand } = await server.ssrLoadModule('/src/game/engine.ts');
  const key = 'yokai-1504.local-match.v1';
  const saved = state => ({ schemaVersion: 1, catalogVersion: 1, matchId: 'browser-smoke', revision: 0, aiPlayer: 1, openHands: false, state, checkpoints: [], receipts: [], audit: [] });
  const move = (state, definition, owner, zone) => {
    const card = Object.values(state.cards).find(card => card.owner === owner && card.def === definition);
    for (const player of state.players) {
      for (const from of ['deck', 'hand', 'field', 'graveyard']) player[from] = player[from].filter(id => id !== card.id);
      if (player.trap === card.id) player.trap = null;
    }
    if (zone === 'trap') state.players[owner].trap = card.id;
    else state.players[owner][zone].push(card.id);
    return card.id;
  };
  async function open(viewport, fixture, failFirst = false, holdFirst = false, reducedMotion = 'reduce', scripted = false) {
    const context = await browser.newContext({ viewport, reducedMotion });
    await context.addInitScript(({ key, fixture, failFirst, holdFirst, scripted }) => {
      if (fixture && !sessionStorage.getItem('ai-smoke-fixture-installed')) {
        localStorage.setItem(key, JSON.stringify(fixture));
        sessionStorage.setItem('ai-smoke-fixture-installed', 'yes');
      }
      window.aiInputs = []; window.aiOutputs = []; window.aiTerminations = 0;
      window.aiTimes = []; window.animationEvents = []; window.deathMarkers = [];
      for (const type of ['animationstart', 'animationend']) document.addEventListener(type, event => {
        if (event.target.classList?.contains('playback-piece')) window.animationEvents.push({ type, name: event.animationName, at: performance.now(), duration: getComputedStyle(event.target).animationDuration });
      });
      new MutationObserver(() => {
        const skull = document.querySelector('.playback-death-marker .combat-skull');
        if (skull && !window.deathMarkers.length) window.deathMarkers.push({ at: performance.now(), ratio: parseFloat(getComputedStyle(skull).width) / skull.parentElement.clientWidth });
      }).observe(document, { subtree: true, childList: true });
      let first = failFirst && !sessionStorage.getItem('ai-smoke-failed');
      let held = holdFirst;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); this.addEventListener('message', event => window.aiOutputs.push(event.data)); }
        postMessage(data, ...args) {
          window.aiInputs.push(structuredClone(data));
          window.aiTimes.push(performance.now());
          if (scripted) {
            const own = data.players[1], enemy = data.players[0];
            const command = data.phase === 'turnEnd' ? { type: 'endTurn' }
              : !own.field.length ? { type: 'play', cardId: own.hand.find(card => card.def === 'kappa').id }
              : data.actionsUsed < 2 ? { type: 'evoke', cardId: own.field[0].id }
              : { type: 'attack', attacker: own.field[0].id, target: enemy.field[0]?.id ?? null };
            queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: { command } })));
            return;
          }
          if (held) {
            held = false;
            window.aiReleaseHeld = () => this.dispatchEvent(new MessageEvent('message', { data: { command: { type: 'endTurn' } } }));
            return;
          }
          if (first) {
            first = false; sessionStorage.setItem('ai-smoke-failed', 'yes');
            setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { error: 'Forced smoke-test failure' } })), 0);
          } else super.postMessage(data, ...args);
        }
        terminate() { window.aiTerminations++; super.terminate(); }
      };
    }, { key, fixture, failFirst, holdFirst, scripted });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(origin);
    await page.locator('.loading-screen').waitFor({ state: 'detached' });
    if (fixture) await page.locator('.table-surface').waitFor();
    if (await page.locator('.match-sign-layer').isVisible()) await page.mouse.click(8, 8);
    return { context, page };
  }
  async function waitHuman(page) {
    await page.waitForFunction(key => { const game = JSON.parse(localStorage.getItem(key) || 'null'); return game && game.state.decisionPlayer === 0 && game.state.phase === 'main' && game.state.turnPlayer === 0; }, key, { timeout: 45_000 });
    await page.locator('.table-surface').waitFor();
    await page.waitForFunction(() => !document.body.textContent.includes('AI is thinking…') && !document.querySelector('.playback-layer'));
    if (await page.locator('.match-sign-layer').isVisible()) await page.mouse.click(8, 8);
    assert.equal(await page.locator('.lower-seat [data-field-seat]').getAttribute('data-field-seat'), '0');
    assert.equal(await page.locator('.top-hand .table-card').count(), 0);
  }
  async function privacy(page) {
    const inputs = await page.evaluate(() => window.aiInputs);
    assert.ok(inputs.length > 0, 'No worker requests observed');
    for (const view of inputs) {
      assert.equal(view.players[0].hand, null);
      assert.ok(Array.isArray(view.players[1].hand));
      assert.equal('cards' in view, false);
      for (const player of view.players) assert.equal('deck' in player, false);
      if (view.players[0].trap) assert.deepEqual(view.players[0].trap, { hidden: true });
    }
    return inputs;
  }
  async function geometry(page) {
    const result = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, table: document.querySelector('.table-surface').getBoundingClientRect().toJSON(), lower: document.querySelector('.bottom-hand').getBoundingClientRect().toJSON(), upper: document.querySelector('.top-hand').getBoundingClientRect().toJSON() }));
    assert.ok(result.scrollWidth <= result.width + 1, `Horizontal overflow: ${JSON.stringify(result)}`);
    assert.ok(result.table.left >= -1 && result.table.right <= result.width + 1);
    assert.ok(result.lower.top > result.upper.top);
    return result;
  }

  const results = [];
  const instantState = createGame({ seed: 91, startingPlayer: 1, names: ['Human', 'Yokai AI'] });
  for (const player of instantState.players) {
    player.deck = []; player.hand = []; player.field = []; player.graveyard = []; player.trap = null;
  }
  for (const card of Object.values(instantState.cards)) {
    card.souls = 0; card.summonedTurn = 0; instantState.players[card.owner].deck.push(card.id);
  }
  Object.assign(instantState, { turn: 3, turnPlayer: 1, decisionPlayer: 1, actionsUsed: 0, supply: 11, history: [] });
  const instantKappa = move(instantState, 'kappa', 1, 'hand');
  const instantNekomata = move(instantState, 'nekomata', 0, 'field');
  const instant = await open({ width: 390, height: 844 }, saved(instantState), false, false, 'no-preference', true);
  await instant.page.locator('.playback-move').waitFor();
  assert.equal(await instant.page.locator('.top-hand .hand-back').count(), 0, 'Played card remained in enemy hand during travel');
  await instant.page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).state.turn === 4, key, { timeout: 30_000 });
  await waitHuman(instant.page);
  await instant.page.locator('.playback-layer').waitFor({ state: 'detached' });
  const timing = await instant.page.evaluate(() => ({ inputs: window.aiInputs, times: window.aiTimes, animations: window.animationEvents, skulls: window.deathMarkers }));
  assert.equal(timing.inputs.length, 3);
  assert.ok(timing.times[1] - timing.times[0] >= 2050, 'Instant AI skipped the full summon animation');
  assert.ok(timing.times[2] - timing.times[1] >= 700, 'Instant AI skipped visible soul arrival');
  const travels = timing.animations.filter(event => event.name === 'card-travel');
  assert.ok(travels.filter(event => event.type === 'animationend').length >= 2, 'Summon or draw animation was cut off');
  assert.ok(travels.some(event => event.duration === '1.1s') && travels.some(event => event.duration === '1.65s'));
  assert.ok(timing.animations.some(event => event.name === 'damage-rise' && event.type === 'animationend' && event.duration === '1.875s'), 'Damage animation did not finish');
  assert.ok(timing.skulls.length && Math.abs(timing.skulls[0].ratio - 0.8) < 0.02, 'Death skull was not reduced to80%');
  await privacy(instant.page);
  results.push({ instantAiFullPlayback: true, commandIntervalsMs: timing.times.slice(1).map((time, index) => Math.round(time - timing.times[index])), normalTravelMs: 1650, fullDamageMs: 1875, deathSkullRatio: timing.skulls[0].ratio });
  await instant.context.close();

  const forecastState = structuredClone(instantState);
  forecastState.turnPlayer = 0; forecastState.decisionPlayer = 0;
  move(forecastState, 'kappa', 1, 'field');
  const forecast = await open({ width: 390, height: 844 }, saved(forecastState));
  const forecastAttacker = forecast.page.locator(`[data-card-id="${instantNekomata}"]`);
  const from = await forecastAttacker.boundingBox();
  const to = await forecast.page.locator(`[data-card-id="${instantKappa}"]`).boundingBox();
  await forecast.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await forecast.page.mouse.down();
  await forecast.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await forecast.page.locator('.combat-doomed .combat-skull').waitFor();
  const forecastRatio = await forecast.page.locator('.combat-doomed .combat-skull').evaluate(skull => parseFloat(getComputedStyle(skull).width) / skull.parentElement.clientWidth);
  assert.ok(Math.abs(forecastRatio - 1.066667) < 0.02, 'Forecast skull was not reduced by1.5');
  results.push({ forecastSkullRatio: forecastRatio });
  await forecast.page.keyboard.press('Escape'); await forecast.page.mouse.up();
  await forecast.context.close();
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const soul = await open(viewport, saved(forecastState), false, false, 'no-preference');
    const add = soul.page.getByRole('button', { name: 'Evoke soul onto Nekomata', exact: true });
    const cue = await add.locator('.soul-add-token').evaluate(el => ({ animation: getComputedStyle(el).animationName, width: el.parentElement.clientWidth, height: el.parentElement.clientHeight }));
    assert.equal(cue.animation, 'soul-ready'); assert.ok(cue.width >= 44 && cue.height >= 44);
    await add.click();
    await soul.page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).state.cards[id].souls === 1, { key, id: instantNekomata });
    assert.equal(await soul.page.locator('dialog[open]').count(), 0, 'Invoking a soul opened card info');
    if (viewport.width >= 700) {
      const positions = await soul.page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { health: rect('[data-health-seat="0"]'), field: rect('.lower-seat .field'), hand: rect('.bottom-hand') };
      });
      assert.ok(positions.health.top >= positions.field.bottom, `Health overlaps field: ${JSON.stringify(positions)}`);
      assert.ok(positions.health.bottom <= positions.hand.top, `Health overlaps hand: ${JSON.stringify(positions)}`);
      assert.ok(Math.abs((positions.health.left + positions.health.right) / 2 - viewport.width / 2) < 2);
    }
    await add.click();
    await soul.page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).state.actionsUsed === 2, key);
    assert.equal(await soul.page.locator('.add-soul').count(), 0, 'Soul cue remains with actions exhausted');
    results.push({ viewport, directSoulWithoutInspector: true, legalSoulCue: true, healthBetweenHandAndField: viewport.width >= 700 });
    await soul.context.close();
  }

  const manual = await open({ width: 1280, height: 800 }, { ...saved(forecastState), aiPlayer: undefined, openHands: true });
  await manual.page.reload();
  await manual.page.locator('.match-sign').waitFor();
  await manual.page.locator('.match-sign-layer').waitFor({ state: 'detached', timeout: 3000 });
  const manualFrom = await manual.page.locator(`[data-card-id="${instantNekomata}"]`).boundingBox();
  const manualTo = await manual.page.locator(`[data-card-id="${instantKappa}"]`).boundingBox();
  await manual.page.mouse.move(manualFrom.x + manualFrom.width / 2, manualFrom.y + manualFrom.height / 2);
  await manual.page.mouse.down(); await manual.page.mouse.move(manualTo.x + manualTo.width / 2, manualTo.y + manualTo.height / 2, { steps: 12 }); await manual.page.mouse.up();
  await manual.page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).state.turn === 4, key, { timeout: 15_000 });
  await manual.page.locator('.playback-layer').waitFor({ state: 'detached' });
  if (await manual.page.locator('.match-sign-layer').isVisible()) await manual.page.mouse.click(8, 8);
  await manual.page.getByRole('button', { name: 'Undo', exact: true }).click();
  await manual.page.waitForFunction(key => { const state = JSON.parse(localStorage.getItem(key)).state; return state.turn === 3 && state.phase === 'main'; }, key);
  results.push({ humanBattleAutoEnds: true, undoReturnsBeforeBattle: true });
  await manual.context.close();

  const handoffState = structuredClone(forecastState);
  handoffState.turnPlayer = 1; handoffState.decisionPlayer = 1; handoffState.actionsUsed = 2;
  handoffState.cards[instantKappa].souls = 2; handoffState.supply -= 2;
  move(handoffState, 'jufu', 0, 'trap');
  const handoff = await open({ width: 390, height: 844 }, saved(handoffState), false, false, 'no-preference', true);
  await handoff.page.locator('.playback-attack-declaration').waitFor();
  assert.equal(await handoff.page.getByRole('button', { name: 'Activate trap', exact: true }).count(), 0);
  await handoff.page.getByRole('button', { name: 'Activate trap', exact: true }).click();
  await handoff.page.locator(`[data-card-id="${instantKappa}"]`).click();
  await handoff.page.getByRole('button', { name: 'Resolve Jufu', exact: true }).click();
  await waitHuman(handoff.page);
  assert.equal(await handoff.page.evaluate(key => JSON.parse(localStorage.getItem(key)).state.turn, key), 4);
  await privacy(handoff.page);
  results.push({ enemyAttackBeforeTrapPrompt: true, humanTrapAutomaticallyReturnsHumanTurn: true });
  await handoff.context.close();

  for (const winner of [0, 1]) {
    const finished = structuredClone(forecastState);
    finished.phase = 'finished'; finished.result = { winner, reason: 'health reached zero' }; finished.players[1 - winner].health = 0;
    const result = await open({ width: 390, height: 844 }, saved(finished));
    await result.page.reload();
    await result.page.locator('.result-sign strong').waitFor();
    assert.equal(await result.page.locator('.result-sign strong').innerText(), winner === 0 ? 'You win' : 'You lose');
    const rect = await result.page.locator('.match-sign').boundingBox();
    assert.ok(Math.abs(rect.x + rect.width / 2 - 195) < 2);
    await result.page.mouse.click(8, 8);
    assert.equal(await result.page.locator('.match-sign-layer').count(), 0);
    await result.context.close();
  }
  results.push({ centeredWinAndLossSignsDismissible: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { context, page } = await open(viewport);
    await page.getByRole('button', { name: 'Play AI', exact: true }).click();
    await waitHuman(page);
    await page.getByRole('button', { name: 'End turn', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).revision >= 2, key);
    await waitHuman(page);
    const input = await privacy(page);
    assert.ok(input.length >= 2, 'AI did not make multiple automatic decisions');
    const beforeUndo = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.waitForFunction(({ key, revision }) => JSON.parse(localStorage.getItem(key)).revision > revision, { key, revision: beforeUndo.revision });
    const undone = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(undone.state.decisionPlayer, 0);
    assert.ok(undone.state.turn < beforeUndo.state.turn);
    await page.reload();
    await waitHuman(page);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key), undone.state);
    results.push({ viewport, aiDecisions: input.length, geometry: await geometry(page), undoAndReload: true });
    await context.close();
  }

  let trapState = createGame({ seed: 42, startingPlayer: 0, names: ['Human', 'Yokai AI'] });
  trapState.turn = 3;
  const attacker = move(trapState, 'nurikabe', 0, 'field');
  trapState.cards[attacker].summonedTurn = 1;
  const defender = move(trapState, 'kappa', 1, 'field');
  move(trapState, 'sake', 1, 'trap');
  trapState = applyCommand(trapState, 0, { type: 'attack', attacker, target: defender });
  assert.equal(trapState.phase, 'trap');
  const trap = await open({ width: 390, height: 844 }, saved(trapState), true, false, 'no-preference');
  await trap.page.getByRole('button', { name: 'Retry AI move' }).waitFor();
  assert.match(await trap.page.getByRole('alert').innerText(), /Forced smoke-test failure/);
  await trap.page.getByRole('button', { name: 'Retry AI move' }).click();
  await trap.page.locator('.playback-reveal').waitFor();
  await trap.page.waitForTimeout(850);
  const revealA = await trap.page.locator('.playback-reveal').boundingBox();
  await trap.page.waitForTimeout(550);
  const revealB = await trap.page.locator('.playback-reveal').boundingBox();
  assert.ok(revealA.width >= 200 && Math.abs(revealA.x + revealA.width / 2 - 195) < 2);
  assert.ok(Math.abs(revealA.x - revealB.x) < 2 && Math.abs(revealA.y - revealB.y) < 2, 'Trap did not hold at center');
  assert.equal(await trap.page.locator('.playback-impact').count(), 0, 'Combat preceded the trap reveal');
  await waitHuman(trap.page);
  const trapInputs = await privacy(trap.page);
  assert.ok(trapInputs.some(view => view.phase === 'trap'));
  assert.ok(trapInputs.some(view => view.phase === 'effect'), 'AI did not continue from its trap to its effect choice');
  const trapCommands = await trap.page.evaluate(key => JSON.parse(localStorage.getItem(key)).audit.filter(event => event.kind === 'command').map(event => event.command), key);
  assert.deepEqual(trapCommands[0], { type: 'respond', activate: true });
  assert.equal(trapCommands[1].type, 'choose');
  assert.equal(trapCommands[2].type, 'endTurn');
  results.push({ trapAndEffectContinuation: true, trapEnlargedAtCenterThenGrave: true, errorAndRetry: true, privateWorkerRequests: trapInputs.length });
  await trap.context.close();

  const stale = await open({ width: 1280, height: 800 }, saved(createGame({ seed: 42, startingPlayer: 1 })), false, true);
  await stale.page.waitForFunction(() => window.aiInputs.length === 1);
  await stale.page.getByRole('button', { name: 'Open history and menu' }).click();
  await stale.page.getByRole('button', { name: 'Table menu', exact: true }).click();
  await stale.page.getByRole('button', { name: 'New game', exact: true }).click();
  await stale.page.getByRole('button', { name: 'Set up new game', exact: true }).click();
  await stale.page.getByRole('button', { name: 'Play AI', exact: true }).click();
  await stale.page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).matchId !== 'browser-smoke', key);
  await stale.page.evaluate(() => window.aiReleaseHeld());
  await waitHuman(stale.page);
  assert.ok(await stale.page.evaluate(() => window.aiTerminations >= 1));
  assert.equal(await stale.page.getByRole('alert').count(), 0);
  results.push({ staleReplyAfterNewGameIgnored: true, terminatedWorkers: await stale.page.evaluate(() => window.aiTerminations) });
  await stale.context.close();
  assert.deepEqual(failures, [], 'Browser page errors');
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
