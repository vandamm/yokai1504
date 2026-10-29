// Design study only: sample positions and interactions never submit match commands.
const tabletopBaseRender = render;
const tableCardMeta = {
  kappa: { base: 2, capacity: 3, color: '#ab525e' },
  'chochin-kozo': { base: 2, capacity: 2, color: '#579d95' },
  'yuki-onna': { base: 3, capacity: 2, color: '#324d88' },
  'karakasa-kozo': { base: 1, capacity: 3, color: '#7c9554' },
  nekomata: { base: 3, capacity: 3, color: '#d95d47' },
  rokurokubi: { base: 3, capacity: 3, color: '#9f8bbf' },
};
const soulIcons = count => `<span class="soul-icons" role="img" aria-label="${count} ${count === 1 ? 'soul' : 'souls'}">${'<span class="soul-icon" aria-hidden="true"></span>'.repeat(count)}</span>`;
const pile = (image, count, label) => `<span class="card-pile" aria-hidden="true"><img src="/cards/${image}" alt=""><b class="pile-count">${count}</b></span><span class="pile-caption">${label}</span>`;

function arrangeAsTabletop() {
  const phone = document.querySelector('#phone');
  phone.classList.add('tabletop');
  const table = phone.querySelector('.table');
  if (!table) return;
  table.querySelectorAll('.field .table-card').forEach(card => {
    const id = card.dataset.card;
    const meta = tableCardMeta[id];
    const count = Number(card.querySelector('.soul').textContent);
    const attack = Number(card.querySelector('.stats b').textContent);
    const added = allocations[id] || 0;
    const image = card.querySelector('img');
    const face = document.createElement('span');
    face.className = 'card-face';
    face.style.setProperty('--card-color', meta.color);
    face.append(image);
    face.insertAdjacentHTML('beforeend', `<span class="live-attack ${attack !== meta.base ? 'modified' : ''}" aria-hidden="true">${attack}</span><span class="soul-slots" aria-hidden="true">${Array.from({ length: meta.capacity }, (_, index) => `<span class="soul-slot ${index < count ? 'filled' : index < count + added ? 'pending' : ''}"></span>`).join('')}</span>`);
    card.replaceChildren(face);
    card.setAttribute('aria-label', `${card.getAttribute('aria-label')}, ${attack} attack${attack !== meta.base ? `, base ${meta.base}` : ''}, ${count} of ${meta.capacity} souls${added ? `, adding ${added}` : ''}`);
    card.title = `${names[id]} · ${attack} ATK · ${count}/${meta.capacity} souls`;
  });
  const pool = table.querySelector('.resource');
  const supply = Number(pool.querySelector('strong').textContent);
  phone.querySelector('.match-nav strong').insertAdjacentHTML('afterend', `<span class="toolbar-supply" aria-label="Supply, ${supply} souls"><span>Supply</span><b>${supply}</b><span class="soul-icon" aria-hidden="true"></span></span>`);
  pool.className = 'table-divider';
  pool.innerHTML = '<span aria-hidden="true"></span>';
  pool.setAttribute('aria-hidden', 'true');
  if (state === 'sake') {
    const total = Object.values(allocations).reduce((a, b) => a + b, 0);
    phone.querySelector('.instruction strong').innerHTML = `Sake · ${soulIcons(total)} / ${soulIcons(3)}`;
    const place = phone.querySelector('[data-do="confirm"]');
    place.innerHTML = `Place ${soulIcons(total)}`;
    place.setAttribute('aria-label', `Place ${total} souls`);
  }
  const seats = [...table.querySelectorAll('.seat')];
  const lowerActorIsOne = state === 'trap' || (state === 'sake' && responseActor);
  const upperHand = lowerActorIsOne ? hand : ['hamaya', 'ougi', 'boseki', 'kozuchi'];
  const summaries = seats.map(seat => seat.querySelector('.seat-summary'));
  seats.forEach((seat, index) => {
    seat.querySelector('.other-hand')?.remove();
    const summary = summaries[index];
    const owner = summary.querySelector('strong').textContent;
    const health = summary.querySelector('.health');
    const life = health.textContent.replace(/\D/g, '');
    health.innerHTML = `<span aria-hidden="true">♥</span><b>${life}</b>`;
    health.setAttribute('aria-label', `${owner}, ${life} health`);
    const deck = summary.querySelector('.seat-counters > span');
    const grave = summary.querySelector('[data-do="grave"]');
    const piles = document.createElement('div');
    piles.className = 'rear-piles';
    if (deck) {
      const count = Number(deck.textContent.replace(/\D/g, ''));
      deck.className = 'table-deck';
      deck.innerHTML = pile(owner === 'Player 1' ? 'back.svg' : 'back-ochre.svg', count, 'Deck');
      deck.setAttribute('aria-label', `${owner}, deck ${count} cards`);
      piles.append(deck);
    }
    if (grave) {
      const count = Number(grave.textContent.replace(/\D/g, ''));
      grave.className = 'table-graveyard';
      grave.innerHTML = pile(owner === 'Player 1' ? 'jufu.png' : 'tengu.png', count, 'Graveyard');
      grave.setAttribute('aria-label', `${owner}, graveyard ${count} cards`);
      piles.append(grave);
    }
    seat.append(piles);
    const trap = seat.querySelector('.table-trap');
    if (trap) {
      const empty = trap.textContent.includes('none');
      trap.classList.toggle('is-empty', empty);
      trap.innerHTML = empty ? '<span class="empty-trap-card" aria-hidden="true">×</span><span class="pile-caption">Trap</span>' : '<img src="/cards/sake.png" alt=""><span class="pile-caption">Trap</span>';
      trap.setAttribute('aria-label', `${owner}, ${empty ? 'empty trap slot' : 'trap Sake'}`);
      if (empty) trap.removeAttribute('data-do');
      seat.append(trap);
    }
    seat.classList.add(index === 0 ? 'upper-seat' : 'lower-seat');
  });
  const upper = document.createElement('section');
  upper.className = `top-hand ${otherHand ? 'expanded' : ''}`;
  upper.setAttribute('aria-label', 'Opponent hand at the far edge');
  upper.append(summaries[0]);
  upper.insertAdjacentHTML('beforeend', handRow(upperHand, 'other-hand'));
  table.before(upper);
  const lower = phone.querySelector('.hand');
  lower.classList.add('bottom-hand');
  lower.setAttribute('aria-label', 'Your hand at the near edge');
  lower.querySelector('.hand-heading')?.replaceWith(summaries[1]);
}
render = function () { tabletopBaseRender(); arrangeAsTabletop(); };
render();
