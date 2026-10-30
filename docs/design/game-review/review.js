const $ = selector => document.querySelector(selector);
const board = $('#board'), panel = $('#comments-panel'), composer = $('#composer');
const options = { a: 'Бумажный стол', b: 'Ночная сцена', c: 'Чёткий ход' };
const state = { option: 'a', actor: 'mine', scene: 'main', device: innerWidth < 700 ? 'phone' : 'desktop', tooltip: false, commentMode: false, replay: 0, motion: '', reduced: false };
let feedback = { preference: null, comments: [] }, pending, selectedComment;
const api = '/api/game-design-review';
function status(message, error = false) { $('#save-status').textContent = message; $('#save-status').classList.toggle('error', error); }
async function request(action) {
  const response = await fetch(api, action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) } : undefined);
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Comments could not be saved.');
  feedback = data; renderComments(); send(); return data;
}
function send() { board.contentWindow?.postMessage({ type: 'review:state', ...state, comments: feedback.comments, selectedComment }, location.origin); }
function sizeFrame() {
  const width = state.device === 'phone' ? 390 : 1280, height = state.device === 'phone' ? 844 : 820;
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
for (const kind of ['option', 'actor', 'device']) document.querySelectorAll(`[data-${kind}]`).forEach(button => button.addEventListener('click', () => { state[kind] = button.dataset[kind]; state.motion = ''; update(); }));
$('#scene').addEventListener('change', event => { state.scene = event.target.value; state.motion = ''; update(); });
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
  if (message?.type === 'review:scene' && ['main', 'trap', 'ougi', 'notice', 'connection'].includes(message.scene)) { state.scene = message.scene; state.motion = ''; update(); }
  if (message?.type === 'review:actor' && ['mine', 'opponent'].includes(message.actor)) { state.actor = message.actor; state.motion = ''; update(); }
  if (message?.type === 'review:tooltip' && typeof message.show === 'boolean') { state.tooltip = message.show; update(); }
  if (message?.type === 'review:reduced' && typeof message.reduced === 'boolean') { state.reduced=message.reduced; update(); }
  if (message?.type === 'review:target' && state.commentMode) openComposer(message);
  if (message?.type === 'review:comment') { panel.hidden = false; status('Комментарий выбран.'); }
});
board.addEventListener('load', send); window.addEventListener('resize', sizeFrame);


const directions = {
 a: ['Бумажный стол', 'Один непрерывный светлый стол. Ink tide мягко обозначает активную половину, здоровье и решения собраны у игрока. Карты остаются главным содержимым.', 'Больше ощущения настоящей настольной игры. Минимум постоянного интерфейса.', 'Сложное решение занимает больше места возле руки. Узор нужно держать тихим.'],
 b: ['Ночная сцена', 'Сине-серый стол отделяет яркие карты. Рука лежит на нижнем краю, а решения получают собственную полку справа; на телефоне — под рукой.', 'Карты выразительнее, вопрос ловушки и кнопки особенно заметны.', 'Тёмная среда на любителя; мелкие элементы карт требуют отдельной проверки контраста.'],
 c: ['Чёткий ход', 'Постоянная строка состояния и отдельное место для решения. Последнее событие выделено в истории. Во время Ougi видны шаги «донор → получатель».', 'Проще вернуться в асинхронную партию и понять, что произошло и чего ждут от вас.', 'Больше постоянного интерфейса, меньше ощущения свободного физического стола.']
};
function renderDirection() {
 const [title,description,strength,tradeoff] = directions[state.option];
 $('#direction-title').textContent=title; $('#direction-description').textContent=description;
 $('#direction-strength').textContent=strength; $('#direction-tradeoff').textContent=tradeoff;
 $('#reduce-motion').setAttribute('aria-pressed',String(state.reduced));
}
for (const button of document.querySelectorAll('[data-motion]')) button.addEventListener('click',()=>{state.scene='main';state.actor='mine';state.motion=button.dataset.motion;state.replay++;update();});
$('#reduce-motion').addEventListener('click',()=>{state.reduced=!state.reduced;update();});

update(); request().catch(error => status(error.message, true));
