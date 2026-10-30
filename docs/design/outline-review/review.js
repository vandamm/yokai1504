const $ = selector => document.querySelector(selector);
const board = $('#board'), panel = $('#comments-panel'), composer = $('#composer');
const options = { a: 'Spotlight', b: 'Spirit mist', c: 'Ink tide' };
const state = { option: 'c', actor: 'mine', scene: 'main', device: innerWidth < 700 ? 'phone' : 'desktop', tooltip: false, commentMode: false, replay: 0 };
let feedback = { preference: null, comments: [] }, pending, selectedComment;
const api = '/api/design-review';
function status(message, error = false) { $('#save-status').textContent = message; $('#save-status').classList.toggle('error', error); }
async function request(action) {
  const response = await fetch(api, action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) } : undefined);
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Comments could not be saved.');
  feedback = data; renderComments(); send(); return data;
}
function send() { board.contentWindow?.postMessage({ type: 'review:state', ...state, comments: feedback.comments, selectedComment }, location.origin); }
function sizeFrame() {
  const width = state.device === 'phone' ? 390 : 1440, height = state.device === 'phone' ? 844 : 820;
  const available = $('#preview-stage').clientWidth - 6, scale = Math.min(1, available / width);
  Object.assign(board.style, { width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` });
  Object.assign($('#frame-wrap').style, { width: `${width * scale}px`, height: `${height * scale}px` });
}
function update() {
  for (const kind of ['option', 'actor', 'device']) document.querySelectorAll(`[data-${kind}]`).forEach(button => {
    const active = button.dataset[kind] === state[kind]; button.setAttribute('aria-pressed', String(active)); button.classList.toggle('selected', active);
  });
  $('#scene').value = state.scene;
  $('#tooltip-toggle').setAttribute('aria-pressed', String(state.tooltip));
  $('#comment-mode').setAttribute('aria-pressed', String(state.commentMode));
  $('#comment-mode').textContent = state.commentMode ? 'Stop commenting' : 'Add comment';
  $('#prefer').textContent = `Prefer option ${state.option.toUpperCase()}`;
  $('#preview-caption').textContent = `${options[state.option]} · ${state.actor === 'mine' ? 'Your move' : 'Opponent’s move'} · ${state.device === 'phone' ? 'Phone' : 'Desktop'}`;
  sizeFrame(); send();
}
for (const kind of ['option', 'actor', 'device']) document.querySelectorAll(`[data-${kind}]`).forEach(button => button.addEventListener('click', () => { state[kind] = button.dataset[kind]; update(); }));
$('#scene').addEventListener('change', event => { state.scene = event.target.value; update(); });
$('#tooltip-toggle').addEventListener('click', () => { state.tooltip = !state.tooltip; update(); });
$('#replay-effect').addEventListener('click', () => { state.replay++; send(); });
$('#comment-mode').addEventListener('click', () => { state.commentMode = !state.commentMode; update(); status(state.commentMode ? 'Click a part of the mockup to comment on it.' : 'Comments save locally for review.'); });
$('#prefer').addEventListener('click', async () => { try { await request({ type: 'preference', option: state.option }); status(`Preferred option ${state.option.toUpperCase()} saved.`); } catch (error) { status(error.message, true); } });
$('#comments-toggle').addEventListener('click', () => { panel.hidden = !panel.hidden; });
$('#comments-close').addEventListener('click', () => { panel.hidden = true; });
for (const id of ['#composer-close', '#comment-cancel']) $(id).addEventListener('click', () => composer.close());
function openComposer(target) {
  pending = { ...target, option: state.option, actor: state.actor, scene: state.scene };
  $('#composer-title').textContent = target.region;
  $('#comment-context').textContent = `Option ${state.option.toUpperCase()} · ${state.actor === 'mine' ? 'Your move' : 'Opponent’s move'} · ${$('#scene').selectedOptions[0].text}`;
  $('#comment-note').value = ''; $('#comment-error').textContent = ''; composer.showModal(); $('#comment-note').focus();
}
$('#comment-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#comment-save').disabled = true;
  try { await request({ type: 'add', comment: { ...pending, note: $('#comment-note').value } }); composer.close(); status('Comment saved. You can add another, or switch options.'); }
  catch (error) { $('#comment-error').textContent = error.message; }
  finally { $('#comment-save').disabled = false; }
});
function renderComments() {
  $('#comment-count').textContent = feedback.comments.length;
  $('#preference-note').textContent = feedback.preference ? `Preferred: option ${feedback.preference.toUpperCase()} · ${options[feedback.preference]}` : 'No preferred option saved yet.';
  const list = $('#comments-list'); list.replaceChildren();
  if (!feedback.comments.length) { const p = document.createElement('p'); p.className = 'empty-comments'; p.textContent = 'No comments yet. Use Add comment, then click any part of the mockup.'; list.append(p); }
  for (const [index, comment] of feedback.comments.entries()) {
    const article = document.createElement('article'); article.className = 'comment';
    const context = document.createElement('p'); context.className = 'comment-context'; context.textContent = `Option ${comment.option.toUpperCase()} · ${comment.actor === 'mine' ? 'Your move' : 'Opponent’s move'} · ${comment.scene}`;
    const title = document.createElement('h3'); title.textContent = `${index + 1}. ${comment.region}`;
    const note = document.createElement('p'); note.textContent = comment.note;
    const actions = document.createElement('div'); actions.className = 'comment-actions';
    const show = document.createElement('button'); show.type = 'button'; show.textContent = 'Show on mockup';
    show.addEventListener('click', () => { Object.assign(state, { option: comment.option, actor: comment.actor, scene: comment.scene, tooltip: comment.target.startsWith('tooltip'), commentMode: true }); selectedComment = comment.id; panel.hidden = true; update(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove comment ${index + 1}`);
    remove.addEventListener('click', async () => { try { await request({ type: 'delete', id: comment.id }); status('Comment removed.'); } catch (error) { status(error.message, true); } });
    actions.append(show, remove); article.append(context, title, note, actions); list.append(article);
  }
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== board.contentWindow) return;
  const message = event.data;
  if (message?.type === 'review:ready') send();
  if (message?.type === 'review:scene' && ['main', 'trap', 'ougi', 'notice', 'connection'].includes(message.scene)) { state.scene = message.scene; update(); }
  if (message?.type === 'review:actor' && ['mine', 'opponent'].includes(message.actor)) { state.actor = message.actor; update(); }
  if (message?.type === 'review:tooltip' && typeof message.show === 'boolean') { state.tooltip = message.show; update(); }
  if (message?.type === 'review:target' && state.commentMode) openComposer(message);
  if (message?.type === 'review:comment') { panel.hidden = false; status('Comment selected.'); }
});
board.addEventListener('load', send); window.addEventListener('resize', sizeFrame);
update(); request().catch(error => status(error.message, true));
