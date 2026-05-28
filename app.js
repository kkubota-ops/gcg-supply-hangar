const STORAGE_KEY = 'gcg_hangar_v1';

const state = {
  decks: {},
  currentDeckId: null,
  owned: {},      // { [cardName]: count }
  prices: {},     // { [cardName]: price }
  statuses: {},   // { [cardName]: 'soon'|'later'|'considering' }
  stores: {},     // { [cardName]: storeName }
  storeList: [],  // registered store names
  purchased: {},  // { [cardName]: countAdded }
  activeTab: 'deck',
  activeFilter: 'all',
  activeStoreFilter: 'all',
  lastMissing: [],
};

// ---- ユーティリティ ----

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yen(n) {
  return '¥' + Number(n).toLocaleString('ja-JP');
}

// ---- ストレージ ----

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      decks: state.decks,
      currentDeckId: state.currentDeckId,
      owned: state.owned,
      prices: state.prices,
      statuses: state.statuses,
      stores: state.stores,
      storeList: state.storeList,
      purchased: state.purchased,
      activeTab: state.activeTab,
      activeFilter: state.activeFilter,
      activeStoreFilter: state.activeStoreFilter,
    }));
  } catch (_) {}
}

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.decks             = d.decks             || {};
    state.currentDeckId     = d.currentDeckId     || null;
    state.owned             = d.owned             || {};
    state.prices            = d.prices            || {};
    state.statuses          = d.statuses          || {};
    state.stores            = d.stores            || {};
    state.storeList         = d.storeList         || [];
    state.purchased         = d.purchased         || {};
    state.activeTab         = d.activeTab         || 'deck';
    state.activeFilter      = d.activeFilter      || 'all';
    state.activeStoreFilter = d.activeStoreFilter || 'all';
    return true;
  } catch (_) { return false; }
}

// ---- デッキ操作 ----

function currentDeck() {
  return state.decks[state.currentDeckId] || null;
}

function createDeck(name) {
  const id = genId();
  state.decks[id] = { name: name || '新規デッキ', cards: [] };
  state.currentDeckId = id;
  state.lastMissing = [];
  save();
  renderDeckBar();
  renderDeckList();
  renderOwnedList();
  if (state.activeTab === 'required') renderRequiredList();
}

function switchDeck(id) {
  if (!state.decks[id]) return;
  state.currentDeckId = id;
  state.lastMissing = [];
  save();
  renderDeckBar();
  renderDeckList();
  renderOwnedList();
  if (state.activeTab === 'required') calcAndRenderRequired();
}

function deleteDeck(id) {
  const d = state.decks[id];
  if (!d || !confirm(`「${d.name}」を削除しますか？`)) return;
  delete state.decks[id];
  const ids = Object.keys(state.decks);
  if (ids.length === 0) {
    createDeck('デッキ1');
  } else {
    switchDeck(ids[0]);
  }
}

// ---- カード操作 ----

function addDeckCard(name) {
  const n = name.trim();
  if (!n) return;
  const deck = currentDeck();
  if (!deck) return;
  const ex = deck.cards.find(c => c.name === n);
  if (ex) {
    ex.count++;
  } else {
    deck.cards.push({ name: n, count: 1 });
    if (state.owned[n] === undefined) state.owned[n] = 0;
  }
  save();
  renderDeckList();
  renderOwnedList();
}

function removeDeckCard(idx) {
  const deck = currentDeck();
  if (!deck) return;
  deck.cards.splice(idx, 1);
  save();
  renderDeckList();
  renderOwnedList();
}

function changeDeckCount(idx, delta) {
  const deck = currentDeck();
  if (!deck || !deck.cards[idx]) return;
  deck.cards[idx].count = Math.max(1, deck.cards[idx].count + delta);
  save();
  renderDeckList();
}

function moveCard(idx, dir) {
  const deck = currentDeck();
  if (!deck) return;
  const to = idx + dir;
  if (to < 0 || to >= deck.cards.length) return;
  [deck.cards[idx], deck.cards[to]] = [deck.cards[to], deck.cards[idx]];
  save();
  renderDeckList();
  renderOwnedList();
}

function changeOwnedCount(cardName, delta) {
  state.owned[cardName] = Math.max(0, (state.owned[cardName] ?? 0) + delta);
  save();
  renderOwnedList();
}

// ---- 店舗リスト操作 ----

function addStore(name) {
  const n = name.trim();
  if (!n || state.storeList.includes(n)) return;
  state.storeList.push(n);
  save();
  renderStoreFilter();
  if (state.activeTab === 'required') renderRequiredList();
}

// ---- 描画 ----

function renderDeckBar() {
  const deck = currentDeck();
  document.getElementById('deck-name-field').value = deck ? deck.name : '';
  const sel = document.getElementById('deck-select');
  const entries = Object.entries(state.decks);
  sel.innerHTML = entries.length === 0
    ? '<option value="">— デッキなし —</option>'
    : entries.map(([id, d]) =>
        `<option value="${id}" ${id === state.currentDeckId ? 'selected' : ''}>${esc(d.name || '(名前なし)')}</option>`
      ).join('');
}

function renderDeckList() {
  const el = document.getElementById('deck-list');
  const deck = currentDeck();
  const cards = deck ? deck.cards : [];
  if (!cards.length) {
    el.innerHTML = '<div class="empty-hint">[ NO CARDS LOADED ]</div>';
    return;
  }
  el.innerHTML = cards.map((c, i) => `
    <div class="card-row">
      <div class="order-col">
        <button class="btn-order" data-action="move-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-order" data-action="move-dn" data-idx="${i}" ${i === cards.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
      <span class="card-row-name" title="${esc(c.name)}">${esc(c.name)}</span>
      <div class="count-ctrl">
        <button class="btn-icon" data-action="deck-dec" data-idx="${i}">−</button>
        <span class="count-num">${c.count}</span>
        <button class="btn-icon" data-action="deck-inc" data-idx="${i}">＋</button>
      </div>
      <button class="btn-icon del" data-action="deck-del" data-idx="${i}" title="削除">✕</button>
    </div>
  `).join('');
}

function renderOwnedList() {
  const el = document.getElementById('owned-list');
  const deck = currentDeck();
  const cards = deck ? deck.cards : [];
  if (!cards.length) {
    el.innerHTML = '<div class="empty-hint">[ デッキにカードを追加してください ]</div>';
    return;
  }
  el.innerHTML = cards.map(c => `
    <div class="card-row">
      <span class="card-row-name" title="${esc(c.name)}">${esc(c.name)}</span>
      <div class="count-ctrl">
        <button class="btn-icon" data-action="owned-dec" data-name="${esc(c.name)}">−</button>
        <span class="count-num">${state.owned[c.name] ?? 0}</span>
        <button class="btn-icon" data-action="owned-inc" data-name="${esc(c.name)}">＋</button>
      </div>
    </div>
  `).join('');
}

function calcAndRenderRequired() {
  const deck = currentDeck();
  if (!deck) {
    state.lastMissing = [];
  } else {
    // デッキ順を維持しながら不足カードを計算
    state.lastMissing = deck.cards
      .map(({ name, count: req }) => ({
        name,
        required: req,
        owned: state.owned[name] ?? 0,
        missing: Math.max(req - (state.owned[name] ?? 0), 0),
      }))
      .filter(c => c.missing > 0 || state.purchased[c.name] !== undefined);
  }
  renderRequiredList();
}

function renderRequiredList() {
  const el = document.getElementById('req-list');
  const filter = state.activeFilter;

  const rows = state.lastMissing.filter(({ name }) => {
    if (filter !== 'all') {
      if (state.purchased[name] === undefined && state.statuses[name] !== filter) return false;
    }
    if (state.activeStoreFilter !== 'all') {
      if ((state.stores[name] || '') !== state.activeStoreFilter) return false;
    }
    return true;
  });

  if (!rows.length) {
    el.innerHTML = `<div class="no-result">[ ${filter === 'all' ? 'NO SUPPLY REQUIRED' : 'NO MATCHING RECORDS'} ]</div>`;
    document.getElementById('total-bar').style.display = 'none';
    return;
  }

  let total = 0;
  let hasPrices = false;

  el.innerHTML = rows.map(({ name, required }) => {
    const owned   = state.owned[name] ?? 0;
    const missing = Math.max(required - owned, 0);
    const bought  = state.purchased[name] !== undefined;
    const price   = state.prices[name] ?? '';
    const sub     = price !== '' ? price * missing : 0;
    if (price !== '') { total += sub; hasPrices = true; }
    const status  = state.statuses[name] || '';
    const sCls    = status ? ` s-${status}` : '';
    const store   = state.stores[name] || '';

    return `
      <div class="req-card${bought ? ' purchased' : ''}" data-card="${esc(name)}">
        <div class="req-card-head">
          <span class="req-card-name" title="${esc(name)}">${esc(name)}</span>
          ${bought
            ? '<span class="req-badge ok">購入済み ✓</span>'
            : `<span class="req-badge miss">不足 ${missing} 枚</span>`}
        </div>
        <div class="req-stats">
          <span>必要 <strong>${required}</strong></span>
          <span>所持 <strong>${owned}</strong></span>
          <span>不足 <strong>${missing}</strong></span>
        </div>
        <div class="req-controls">
          <span style="font-size:0.75rem;color:var(--muted)">単価</span>
          <input type="number" class="price-input" data-name="${esc(name)}"
                 value="${price}" min="0" placeholder="0">
          <span class="subtotal" data-card="${esc(name)}">${price !== '' ? yen(sub) : '—'}</span>
          <select class="status-select${sCls}" data-name="${esc(name)}">
            <option value=""  ${!status           ? 'selected' : ''}>— STATUS —</option>
            <option value="soon"        ${status === 'soon'        ? 'selected' : ''}>すぐ買う</option>
            <option value="later"       ${status === 'later'       ? 'selected' : ''}>後回し</option>
            <option value="considering" ${status === 'considering' ? 'selected' : ''}>検討中</option>
          </select>
          <select class="store-select${store ? ' has-store' : ''}" data-name="${esc(name)}">
            <option value="">— 店名選択 —</option>
            ${state.storeList.map(s => `<option value="${esc(s)}"${store === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
          <div class="purchased-ctrl">
            ${bought
              ? `<button class="btn-revert" data-name="${esc(name)}">↩ 取消</button>`
              : `<label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                   <input type="checkbox" class="purchased-check"
                          data-name="${esc(name)}" data-missing="${missing}">
                   購入済み
                 </label>`}
          </div>
        </div>
      </div>`;
  }).join('');

  const totalBar = document.getElementById('total-bar');
  if (hasPrices) {
    document.getElementById('total-amount').textContent = yen(total);
    totalBar.style.display = 'flex';
  } else {
    totalBar.style.display = 'none';
  }
}

function renderStoreFilter() {
  const bar = document.getElementById('store-filter-bar');
  if (!bar) return;
  bar.innerHTML = [
    `<button class="filter-btn${state.activeStoreFilter === 'all' ? ' active' : ''}" data-store-filter="all">ALL</button>`,
    ...state.storeList.map(s =>
      `<button class="filter-btn${state.activeStoreFilter === s ? ' active' : ''}" data-store-filter="${esc(s)}">${esc(s)}</button>`
    ),
  ].join('');
}

function updateSubtotals() {
  let total = 0;
  let hasPrices = false;

  document.querySelectorAll('.req-card').forEach(card => {
    const name = card.dataset.card;
    const entry = state.lastMissing.find(c => c.name === name);
    if (!entry) return;
    const owned   = state.owned[name] ?? 0;
    const missing = Math.max(entry.required - owned, 0);
    const price   = state.prices[name] ?? null;
    const sub     = price !== null ? price * missing : 0;
    if (price !== null) { total += sub; hasPrices = true; }
    const lbl = card.querySelector('.subtotal');
    if (lbl) lbl.textContent = price !== null ? yen(sub) : '—';
  });

  const totalBar = document.getElementById('total-bar');
  if (hasPrices) {
    document.getElementById('total-amount').textContent = yen(total);
    totalBar.style.display = 'flex';
  } else {
    totalBar.style.display = 'none';
  }
}

// ---- タブ切り替え ----

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById(`tab-${tab}`).classList.add('active');
  if (tab === 'required') calcAndRenderRequired();
  save();
}

// ---- イベント登録 ----

// タブ切り替え
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// デッキ名（デバウンス保存）
let nameTimer;
document.getElementById('deck-name-field').addEventListener('input', e => {
  const d = currentDeck();
  if (!d) return;
  d.name = e.target.value;
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => { save(); renderDeckBar(); }, 400);
});

// デッキ切り替え
document.getElementById('deck-select').addEventListener('change', e => {
  if (e.target.value) switchDeck(e.target.value);
});

// 新規デッキ
document.getElementById('new-deck-btn').addEventListener('click', () => {
  const name = prompt('新しいデッキ名を入力してください', '新規デッキ');
  if (name !== null) createDeck(name.trim() || '新規デッキ');
});

// デッキ削除
document.getElementById('del-deck-btn').addEventListener('click', () => {
  deleteDeck(state.currentDeckId);
});

// カード追加
function handleAddCard() {
  const inp = document.getElementById('card-input');
  addDeckCard(inp.value);
  inp.value = '';
  inp.focus();
}
document.getElementById('card-add-btn').addEventListener('click', handleAddCard);
document.getElementById('card-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAddCard();
});

// カードリスト操作（イベント委任）
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, idx, name } = btn.dataset;
  const i = parseInt(idx, 10);
  switch (action) {
    case 'deck-inc':  changeDeckCount(i, 1);     break;
    case 'deck-dec':  changeDeckCount(i, -1);    break;
    case 'deck-del':  removeDeckCard(i);         break;
    case 'move-up':   moveCard(i, -1);           break;
    case 'move-dn':   moveCard(i, 1);            break;
    case 'owned-inc': changeOwnedCount(name, 1); break;
    case 'owned-dec': changeOwnedCount(name, -1); break;
  }
});

// 必要カードリストのイベント（price / status / purchase）
const reqList = document.getElementById('req-list');

reqList.addEventListener('input', e => {
  if (e.target.matches('.price-input')) {
    const name = e.target.dataset.name;
    const v = parseInt(e.target.value, 10);
    if (e.target.value === '' || isNaN(v) || v < 0) delete state.prices[name];
    else state.prices[name] = v;
    save();
    updateSubtotals();
  }
});

reqList.addEventListener('change', e => {
  if (e.target.matches('.status-select')) {
    const name = e.target.dataset.name;
    if (e.target.value) state.statuses[name] = e.target.value;
    else delete state.statuses[name];
    e.target.className = `status-select${e.target.value ? ` s-${e.target.value}` : ''}`;
    save();
    return;
  }
  if (e.target.matches('.store-select')) {
    const name = e.target.dataset.name;
    const v = e.target.value;
    if (v) { state.stores[name] = v; e.target.classList.add('has-store'); }
    else   { delete state.stores[name]; e.target.classList.remove('has-store'); }
    save();
    return;
  }
  if (e.target.matches('.purchased-check')) {
    const name    = e.target.dataset.name;
    const missing = parseInt(e.target.dataset.missing, 10);
    if (missing > 0) {
      state.purchased[name] = missing;
      state.owned[name] = (state.owned[name] ?? 0) + missing;
    }
    save();
    renderOwnedList();
    renderRequiredList();
  }
});

reqList.addEventListener('click', e => {
  const btn = e.target.closest('.btn-revert');
  if (!btn) return;
  const name  = btn.dataset.name;
  const added = state.purchased[name] ?? 0;
  delete state.purchased[name];
  state.owned[name] = Math.max(0, (state.owned[name] ?? 0) - added);
  save();
  renderOwnedList();
  renderRequiredList();
});

// フィルターバー (ステータス)
document.querySelector('.filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  state.activeFilter = btn.dataset.filter;
  document.querySelectorAll('.filter-btn[data-filter]').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === state.activeFilter)
  );
  renderRequiredList();
  save();
});

// 店舗追加
function handleAddStore() {
  const inp = document.getElementById('store-name-input');
  addStore(inp.value);
  inp.value = '';
  inp.focus();
}
document.getElementById('store-add-btn').addEventListener('click', handleAddStore);
document.getElementById('store-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAddStore();
});

// 店舗フィルターバー
document.getElementById('store-filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('[data-store-filter]');
  if (!btn) return;
  state.activeStoreFilter = btn.dataset.storeFilter;
  renderStoreFilter();
  renderRequiredList();
  save();
});

// ---- 初期化 ----

function init() {
  const ok = loadStorage();

  // 旧データ移行: stores の値を storeList に取り込む
  Object.values(state.stores).forEach(s => {
    if (s && !state.storeList.includes(s)) state.storeList.push(s);
  });

  if (!ok || Object.keys(state.decks).length === 0) {
    // 初回起動: デフォルトデッキを作成してデッキ登録タブを表示
    const id = genId();
    state.decks[id] = { name: 'デッキ1', cards: [] };
    state.currentDeckId = id;
    save();
    renderDeckBar();
    renderDeckList();
    renderOwnedList();
    renderStoreFilter();
  } else {
    if (!state.currentDeckId || !state.decks[state.currentDeckId])
      state.currentDeckId = Object.keys(state.decks)[0];
    renderDeckBar();
    renderDeckList();
    renderOwnedList();
    renderStoreFilter();
    // 保存されていたタブを復元
    const savedTab = state.activeTab || 'deck';
    document.querySelectorAll('.tab-screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === savedTab)
    );
    document.getElementById(`tab-${savedTab}`).classList.add('active');
    // フィルターボタンの状態復元
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b =>
      b.classList.toggle('active', b.dataset.filter === state.activeFilter)
    );
    if (savedTab === 'required') calcAndRenderRequired();
  }
}

init();
