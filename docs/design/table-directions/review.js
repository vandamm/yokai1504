const $ = selector => document.querySelector(selector);
const board = $('#board'), panel = $('#comments-panel'), composer = $('#composer');
const options = { a: 'Бумага и тушь', b: 'Ночной лак', c: 'Графический коврик', d: 'Настоящий стол' };
const state = { option: 'a', actor: 'mine', scene: 'main', device: innerWidth < 700 ? 'phone' : 'desktop', tooltip: false, commentMode: false, replay: 0, motion: '', reduced: false };
const requestedOption=new URLSearchParams(location.search).get('option');
if(options[requestedOption])state.option=requestedOption;
let feedback = { preference: null, comments: [] }, pending, selectedComment;
const api = '/api/table-directions';
function status(message, error = false) { $('#save-status').textContent = message; $('#save-status').classList.toggle('error', error); }
async function request(action) {
  const response = await fetch(api, action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) } : undefined);
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Comments could not be saved.');
  feedback = data; renderComments(); send(); return data;
}
function send() { board.contentWindow?.postMessage({ type: 'review:state', ...state, comments: feedback.comments, selectedComment }, location.origin); }
function sizeFrame() {
  const width = state.device === 'phone' ? 360 : 1120, height = state.device === 'phone' ? 720 : 660;
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
  $('#comment-mode').textContent = state.commentMode ? 'Закончить комментарии' : 'Комментировать';
  $('#prefer').textContent = `Выбрать ${state.option.toUpperCase()}`;
  $('#preview-caption').textContent = `${options[state.option]} · ${state.actor === 'mine' ? 'Вы решаете' : 'Решает соперник'} · ${state.device === 'phone' ? 'Телефон' : 'Десктоп'}`;
  $('#open-preview').href=`./board.html?option=${state.option}&scene=${state.scene}&actor=${state.actor}`; renderDirection(); sizeFrame(); send();
}
for (const kind of ['option', 'actor', 'device']) document.querySelectorAll(`[data-${kind}]`).forEach(button => button.addEventListener('click', () => { state[kind] = button.dataset[kind]; if(kind==='actor')state.scene='main'; state.motion = ''; update(); }));
$('#scene').addEventListener('change', event => { state.scene = event.target.value; state.actor='mine'; state.motion = ''; update(); });
$('#tooltip-toggle').addEventListener('click', () => { state.tooltip = !state.tooltip; update(); });
$('#replay-effect').addEventListener('click', () => { state.motion = ''; state.replay++; send(); });
$('#comment-mode').addEventListener('click', () => { state.commentMode = !state.commentMode; update(); status(state.commentMode ? 'Нажмите на часть макета для комментария.' : 'Комментарии сохраняются локально.'); });
$('#prefer').addEventListener('click', async () => { try { await request({ type: 'preference', option: state.option }); status(`Вариант ${state.option.toUpperCase()} выбран.`); } catch (error) { status(error.message, true); } });
$('#comments-toggle').addEventListener('click', () => { panel.hidden = !panel.hidden; });
$('#comments-close').addEventListener('click', () => { panel.hidden = true; });
for (const id of ['#composer-close', '#comment-cancel']) $(id).addEventListener('click', () => composer.close());
function openComposer(target) {
  pending = { ...target, option: state.option, actor: state.actor, scene: state.scene };
  $('#composer-title').textContent = target.region;
  $('#comment-context').textContent = `Option ${state.option.toUpperCase()} · ${state.actor === 'mine' ? 'Вы решаете' : 'Решает соперник'} · ${$('#scene').selectedOptions[0].text}`;
  $('#comment-note').value = ''; $('#comment-error').textContent = ''; composer.showModal(); $('#comment-note').focus();
}
$('#comment-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#comment-save').disabled = true;
  try { await request({ type: 'add', comment: { ...pending, note: $('#comment-note').value } }); composer.close(); status('Комментарий сохранён. Можно добавить ещё или сменить вариант.'); }
  catch (error) { $('#comment-error').textContent = error.message; }
  finally { $('#comment-save').disabled = false; }
});
function renderComments() {
  $('#comment-count').textContent = feedback.comments.length;
  $('#preference-note').textContent = feedback.preference ? `Выбран вариант ${feedback.preference.toUpperCase()} · ${options[feedback.preference]}` : 'Предпочтение ещё не сохранено.';
  const list = $('#comments-list'); list.replaceChildren();
  if (!feedback.comments.length) { const p = document.createElement('p'); p.className = 'empty-comments'; p.textContent = 'Комментариев пока нет. Нажмите «Комментировать» и выберите часть макета.'; list.append(p); }
  for (const [index, comment] of feedback.comments.entries()) {
    const article = document.createElement('article'); article.className = 'comment';
    const context = document.createElement('p'); context.className = 'comment-context'; context.textContent = `Option ${comment.option.toUpperCase()} · ${comment.actor === 'mine' ? 'Вы решаете' : 'Решает соперник'} · ${comment.scene}`;
    const title = document.createElement('h3'); title.textContent = `${index + 1}. ${comment.region}`;
    const note = document.createElement('p'); note.textContent = comment.note;
    const actions = document.createElement('div'); actions.className = 'comment-actions';
    const show = document.createElement('button'); show.type = 'button'; show.textContent = 'Показать на макете';
    show.addEventListener('click', () => { Object.assign(state, { option: comment.option, actor: comment.actor, scene: comment.scene, tooltip: comment.target.startsWith('tooltip'), commentMode: true }); selectedComment = comment.id; panel.hidden = true; update(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = 'Удалить'; remove.setAttribute('aria-label', `Remove comment ${index + 1}`);
    remove.addEventListener('click', async () => { try { await request({ type: 'delete', id: comment.id }); status('Комментарий удалён.'); } catch (error) { status(error.message, true); } });
    actions.append(show, remove); article.append(context, title, note, actions); list.append(article);
  }
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== board.contentWindow) return;
  const message = event.data;
  if (message?.type === 'review:ready') send();
  if (message?.type === 'review:scene' && ['main', 'play', 'attack', 'soul', 'trap', 'effect', 'return'].includes(message.scene)) { state.scene = message.scene; state.motion = ''; update(); }
  if (message?.type === 'review:actor' && ['mine', 'opponent'].includes(message.actor)) { state.actor = message.actor; state.scene='main'; state.motion = ''; update(); }
  if (message?.type === 'review:tooltip' && typeof message.show === 'boolean') { state.tooltip = message.show; update(); }
  if (message?.type === 'review:reduced' && typeof message.reduced === 'boolean') { state.reduced=message.reduced; update(); }
  if (message?.type === 'review:target' && state.commentMode) openComposer(message);
  if (message?.type === 'review:comment') { panel.hidden = false; status('Комментарий выбран.'); }
});
board.addEventListener('load', send); window.addEventListener('resize', sizeFrame);


const directions = {
 a: ['Бумага и тушь', 'Светлый бумажный стол, индиго и волны Ink tide. Карты ощущаются настоящими предметами: лёгкие тени, мягкий свет и спокойная типографика.', 'Самый тихий вариант: близок к физической настольной игре.', 'Текстуру нужно держать слабой, чтобы она не спорила с рисунками карт.'],
 b: ['Ночной лак', 'Глубокий сливовый лак, тёплая латунь и светлые числовые отметки. Белые края карт заметнее на тёмной поверхности.', 'Самая насыщенная атмосфера: вечерний игровой стол.', 'Тёмная тема требует отдельной проверки при ярком освещении телефона.'],
 d: ['Настоящий стол', 'Матовая белая поверхность, бирюзовый и охристый картон, стопки карт и белые жетоны душ. На десктопе здоровье показано дорожками с овальными маркерами, как на фотографиях игры.', 'Узнаваемые физические компоненты вместо декоративной темы. Минимум цифровых элементов управления.', 'На телефоне дорожки сжаты в плитки с крупным числом. Карты соперника оставлены читаемыми с вашей стороны.'],
 c: ['Графический коврик', 'Плоский светлый коврик, кобальт, чёткие смещённые тени и контрастные сигнальные детали. Больше современного печатного дизайна.', 'Самое заметное состояние и самое смелое оформление.', 'Жёсткие акценты могут казаться менее уютными, чем бумага или лак.']
};
function renderDirection() {
 const [title,description,strength,tradeoff] = directions[state.option];
 $('#direction-sources').hidden=state.option!=='d';
 $('#direction-title').textContent=title; $('#direction-description').textContent=description;
 $('#direction-strength').textContent=strength; $('#direction-tradeoff').textContent=tradeoff;
 $('#reduce-motion').setAttribute('aria-pressed',String(state.reduced));
}
for (const button of document.querySelectorAll('[data-motion]')) button.addEventListener('click',()=>{state.scene='main';state.actor='mine';state.motion=button.dataset.motion;state.replay++;update();});
$('#reduce-motion').addEventListener('click',()=>{state.reduced=!state.reduced;update();});

update(); request().catch(error => status(error.message, true));
