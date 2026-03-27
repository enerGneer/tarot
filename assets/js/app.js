// app.js
const IMG_BASE = 'assets/images/';
const DRAW_COUNT = 3;
const DECK_ROWS = 6;
const CARD_W = 50; // card width (px)
const CARD_H = 75; // card height (px)

let allCards = [];
let spreads = [];
let selectedCards = []; // array of card objects, max 3
let currentSpread = null;
let shuffledDeck = [];
let deckResizeObserver = null;

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const [cardsData, spreadsData] = await Promise.all([
    fetch('assets/js/data/cards.json').then(r => r.json()),
    fetch('assets/js/data/spreads.json').then(r => r.json()),
  ]);
  allCards = cardsData;
  spreads = spreadsData;

  const params = new URLSearchParams(location.search);
  if (params.has('cards')) {
    showResultView(params);
  } else {
    showDrawingView();
  }

  document.body.classList.add('js-ready');
}

// ── Drawing View ──────────────────────────────────────────────────────────────

function showDrawingView() {
  document.getElementById('result-view').classList.add('is-hidden');
  document.getElementById('drawing-view').classList.remove('is-hidden');

  selectedCards = [];
  shuffledDeck = shuffle([...allCards]);

  // Populate spread select
  const spreadSelect = document.getElementById('spread-select');
  spreadSelect.innerHTML = '<option value="">배열 선택</option>';
  spreads.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    spreadSelect.appendChild(opt);
  });
  spreadSelect.value = '';
  currentSpread = null;

  spreadSelect.onchange = () => {
    currentSpread = spreads.find(s => s.id === spreadSelect.value) || null;
    updatePositionSlots();
  };

  // Question textarea auto-resize
  const qInput = document.getElementById('question-input');
  qInput.value = '';
  qInput.style.height = 'auto';
  qInput.oninput = () => {
    qInput.style.height = 'auto';
    qInput.style.height = qInput.scrollHeight + 'px';
  };

  // Build deck with ResizeObserver
  const deckEl = document.getElementById('card-deck');
  if (deckResizeObserver) deckResizeObserver.disconnect();

  let roTimer = null;
  deckResizeObserver = new ResizeObserver(() => {
    clearTimeout(roTimer);
    roTimer = setTimeout(() => buildDeck(deckEl), 50);
  });
  deckResizeObserver.observe(deckEl);

  updatePositionSlots();
  updateDrawBtn();
}

function updatePositionSlots() {
  const slotsEl = document.getElementById('position-slots');
  if (currentSpread) {
    slotsEl.classList.remove('is-hidden');
    slotsEl.innerHTML = currentSpread.positions
      .map((pos, i) => `<span class="p-slot-label">${i + 1}. ${pos}</span>`)
      .join('');
  } else {
    slotsEl.classList.add('is-hidden');
    slotsEl.innerHTML = '';
  }
}

function buildDeck(container) {
  const selectedSet = new Set(selectedCards.map(c => c.id));
  container.innerHTML = '';

  const containerWidth = container.clientWidth;
  if (containerWidth === 0) return;

  const cardWidth = CARD_W;
  const cardHeight = CARD_H;
  const minVisible = 8;
  const total = shuffledDeck.length;

  // Responsive target rows: mobile 7, tablet/PC 4
  const vw = window.innerWidth;
  const targetRows = vw <= 480 ? 7 : 4;

  // Max cards that physically fit in one row
  const maxPerRow = Math.min(
    total,
    Math.floor((containerWidth - cardWidth) / minVisible) + 1
  );

  // C-method: start with target rows, ensure perRow doesn't exceed maxPerRow
  let totalRows = targetRows;
  let perRow = Math.ceil(total / totalRows);

  while (perRow > maxPerRow && totalRows < total) {
    totalRows++;
    perRow = Math.ceil(total / totalRows);
  }

  // Floor the visible strip so total row width never exceeds containerWidth
  const visibleW = Math.floor((containerWidth - cardWidth) / (perRow - 1));
  const overlap = cardWidth - visibleW;

  for (let row = 0; row < totalRows; row++) {
    const start = row * perRow;
    const end = Math.min(start + perRow, total);
    if (start >= total) break;

    const rowEl = document.createElement('div');
    rowEl.className = 'p-deck-row';
    rowEl.style.animationDelay = (row * 80) + 'ms';

    for (let i = start; i < end; i++) {
      const card = shuffledDeck[i];
      const el = document.createElement('button');
      el.className = 'p-card-back';
      el.type = 'button';
      el.dataset.id = card.id;
      el.style.width = cardWidth + 'px';
      el.style.height = cardHeight + 'px';

      if (i < end - 1) {
        el.style.marginRight = -overlap + 'px';
      }

      if (selectedSet.has(card.id)) {
        el.classList.add('is-selected');
        el.disabled = true;
      }

      el.addEventListener('click', () => handleCardClick(card, el));
      rowEl.appendChild(el);
    }

    container.appendChild(rowEl);
  }
}

function handleCardClick(card, el) {
  if (selectedCards.length >= DRAW_COUNT) return;
  if (selectedCards.some(c => c.id === card.id)) return;

  selectedCards.push(card);
  el.classList.add('is-selected');
  el.disabled = true;

  updateDrawBtn();
}

function updateDrawBtn() {
  const btn = document.getElementById('draw-btn');
  const remaining = DRAW_COUNT - selectedCards.length;

  if (remaining > 0) {
    btn.disabled = true;
    btn.classList.remove('is-active');
    btn.innerHTML = `남은 카드 <span class="c-count-badge">${remaining}</span>`;
    btn.onclick = null;
  } else {
    btn.disabled = false;
    btn.classList.add('is-active');
    btn.textContent = '결과 보기';
    btn.onclick = goToResult;
  }
}

function goToResult() {
  const question = document.getElementById('question-input').value.trim();
  const cardIds = selectedCards.map(c => c.id).join(',');
  const params = new URLSearchParams();
  if (question) params.set('q', question);
  params.set('cards', cardIds);
  if (currentSpread) params.set('spread', currentSpread.id);

  history.pushState({}, '', '?' + params.toString());
  showResultView(params);
}

// ── Result View ───────────────────────────────────────────────────────────────

function showResultView(params) {
  document.getElementById('drawing-view').classList.add('is-hidden');
  document.getElementById('result-view').classList.remove('is-hidden');
  window.scrollTo(0, 0);

  const question = params.get('q') || '';
  const cardIds = (params.get('cards') || '').split(',').map(Number);
  const spreadId = params.get('spread') || '';
  const spread = spreads.find(s => s.id === spreadId) || null;
  const cards = cardIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);

  // Render cards
  const resultCardsEl = document.getElementById('result-cards');
  resultCardsEl.innerHTML = '';
  cards.forEach((card, i) => {
    const col = document.createElement('div');
    col.className = 'p-result-card';

    if (spread) {
      const label = document.createElement('div');
      label.className = 'p-result-card__label';
      label.textContent = spread.positions[i];
      col.appendChild(label);
    }

    const imgWrap = document.createElement('div');
    imgWrap.className = 'p-result-card__img';

    const img = document.createElement('img');
    img.src = IMG_BASE + card.image;
    img.alt = card.name;
    imgWrap.appendChild(img);

    const name = document.createElement('div');
    name.className = 'p-result-card__name';
    name.textContent = card.name;

    col.appendChild(imgWrap);
    col.appendChild(name);
    resultCardsEl.appendChild(col);
  });

  // Copy text
  const copyText = buildCopyText(cards, question, spread);
  document.getElementById('copy-text').textContent = copyText;

  const copyBtn = document.getElementById('copy-btn');
  copyBtn.textContent = '복사하기';
  copyBtn.onclick = () => copyToClipboard(copyText, copyBtn);

  // Back button
  document.getElementById('back-btn').onclick = () => {
    if (history.length > 1) {
      history.back();
    } else {
      history.replaceState({}, '', location.pathname);
      selectedCards = [];
      showDrawingView();
    }
  };
}

function getPromptSuffix(hasSpread) {
  const cardGuide = hasSpread
    ? '2. 카드별 해석 — 각 카드를 배열 위치의 맥락과 연결하여, 키워드 → 현재 상황에의 적용 → 핵심 메시지 순서로 설명해 주세요.'
    : '2. 카드별 해석 — 각 카드의 키워드 → 현재 상황에의 적용 → 핵심 메시지 순서로 설명해 주세요.';

  return [
    '---',
    '당신은 타로 마스터입니다.',
    '위 카드 조합을 해석해 주세요.',
    '단정적인 표현은 피하고, 흐름 중심으로 부드럽게 서술해 주세요.',
    '',
    '1. 종합 해석 — 카드를 개별적으로 나열하기보다, 카드 간의 관계와 흐름을 중심으로 유기적인 종합 해석을 먼저 제시해 주세요.',
    cardGuide,
    '3. 조언 — 질문자가 취할 수 있는 구체적인 행동이나 마음가짐을 제안해 주세요.',
    '4. 부정적 카드가 포함된 경우 — 그 원인을 짚고, 대안과 회피 전략을 함께 제시해 주세요. 필요하다면 추가 카드를 뽑아볼 것을 제안해 주세요.',
  ].join('\n');
}

function buildCopyText(cards, question, spread) {
  const lines = [];
  if (question) lines.push(`질문 : ${question}`);
  if (spread) lines.push(`스프레드 : ${spread.name}`);
  cards.forEach((card, i) => {
    if (spread) {
      lines.push(`${i + 1}. ${spread.positions[i]} : ${card.name}`);
    } else {
      lines.push(`${i + 1}. ${card.name}`);
    }
  });
  lines.push('');
  lines.push(getPromptSuffix(!!spread));
  return lines.join('\n');
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API unavailable — silent fail (HTTPS context required)
  }
  btn.textContent = '복사완료';
  if (window.innerWidth > 480) showToast();
  setTimeout(() => { btn.textContent = '복사하기'; }, 3000);
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.classList.remove('is-hide');
  toast.classList.add('is-show');
  setTimeout(() => {
    toast.classList.replace('is-show', 'is-hide');
  }, 2000);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  if (params.has('cards')) {
    showResultView(params);
  } else {
    selectedCards = [];
    showDrawingView();
  }
});