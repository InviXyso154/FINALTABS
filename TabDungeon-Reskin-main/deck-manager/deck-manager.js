import { createCard, loadStudyState, saveStudyState, STORAGE_KEY } from '../state/study-state.js';
import { createButton, createInput } from '../dom.js';
import { isDue } from '../core/scheduler.js';
import { removeExposureVisitsForDeck } from '../core/exposure.js';
import {
  DECK_COLOR_OPTIONS,
  DECK_ICON_OPTIONS,
  deleteArchivedDeck,
  getDeckColor,
  getDeckIcon,
  groupCardsByDeck,
  isDeckArchived
} from '../state/deck-utils.js';

const CARD_PAGE_SIZE = 25;
const DECK_PAGE_SIZE = 50;
let state;
let expandedDeckId = null;
let deckPage = 0;
const cardPageByDeck = new Map();

function createSelect(options, value, label) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  options.forEach(optionData => {
    const option = document.createElement('option');
    option.value = optionData.value;
    option.textContent = optionData.label;
    select.appendChild(option);
  });
  select.value = value;
  return select;
}

function getDeckStats(now) {
  const cardsByDeck = groupCardsByDeck(state.cards || []);
  const latestReviewByDeck = new Map();
  const deckByCardId = new Map();
  const dueByDeck = new Map();

  for (const [deckId, cards] of cardsByDeck) {
    dueByDeck.set(deckId, cards.filter(card => isDue(card, now)).length);
    for (const card of cards) deckByCardId.set(card.id, deckId);
  }
  for (const entry of state.history || []) {
    const deckId = deckByCardId.get(entry.cardId);
    const reviewedAt = Date.parse(entry.reviewedAt);
    if (!deckId || !Number.isFinite(reviewedAt)) continue;
    if (reviewedAt > (latestReviewByDeck.get(deckId) || 0)) {
      latestReviewByDeck.set(deckId, reviewedAt);
    }
  }
  return { cardsByDeck, dueByDeck, latestReviewByDeck };
}

function render() {
  const container = document.getElementById('manager-decks');
  const view = document.getElementById('deck-view').value;
  const query = document.getElementById('deck-search').value.trim().toLocaleLowerCase();
  const sortBy = document.getElementById('deck-sort').value;
  const now = Date.now();
  const stats = getDeckStats(now);
  const decks = (state.decks || [])
    .filter(deck => isDeckArchived(deck) === (view === 'archived'))
    .filter(deck => !query || `${deck.name} ${deck.description || ''} ${deck.keywords || ''}`.toLocaleLowerCase().includes(query));

  decks.sort((a, b) => {
    if (sortBy === 'due') {
      return (stats.dueByDeck.get(b.id) || 0) - (stats.dueByDeck.get(a.id) || 0) ||
        a.name.localeCompare(b.name);
    }
    if (sortBy === 'recent') {
      return (stats.latestReviewByDeck.get(b.id) || 0) - (stats.latestReviewByDeck.get(a.id) || 0) ||
        a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });

  container.textContent = '';
  const maxPage = Math.max(0, Math.ceil(decks.length / DECK_PAGE_SIZE) - 1);
  deckPage = Math.min(deckPage, maxPage);
  if (decks.length === 0) {
    deckPage = 0;
    const empty = document.createElement('p');
    empty.className = 'manager-empty';
    empty.textContent = query
      ? 'No decks match this search.'
      : view === 'archived'
        ? 'No archived decks.'
        : 'No active decks yet. Create a deck above to get started.';
    container.appendChild(empty);
    return;
  }

  const visibleDecks = decks.slice(deckPage * DECK_PAGE_SIZE, (deckPage + 1) * DECK_PAGE_SIZE);
  visibleDecks.forEach(deck => {
    const section = renderDeck(deck, stats);
    section.open = expandedDeckId === deck.id;
    container.appendChild(section);
    if (section.open) renderDeckContents(deck, section.querySelector('.manager-deck-content'), stats);
  });
  if (decks.length > DECK_PAGE_SIZE) renderDeckPagination(container, decks.length, maxPage);
}

function renderDeckPagination(container, total, maxPage) {
  const pagination = document.createElement('div');
  pagination.className = 'manager-pagination';
  const previous = createButton('Previous decks');
  const next = createButton('Next decks');
  previous.disabled = deckPage === 0;
  next.disabled = deckPage === maxPage;
  const summary = document.createElement('span');
  summary.textContent = `Decks ${deckPage * DECK_PAGE_SIZE + 1}–${Math.min((deckPage + 1) * DECK_PAGE_SIZE, total)} of ${total}`;
  previous.addEventListener('click', () => {
    deckPage = Math.max(0, deckPage - 1);
    expandedDeckId = null;
    render();
  });
  next.addEventListener('click', () => {
    deckPage = Math.min(maxPage, deckPage + 1);
    expandedDeckId = null;
    render();
  });
  pagination.append(previous, summary, next);
  container.appendChild(pagination);
}

function renderDeck(deck, stats) {
  const section = document.createElement('details');
  section.className = 'manager-deck';
  section.dataset.deckId = deck.id;
  section.dataset.color = getDeckColor(deck);

  const summary = document.createElement('summary');
  summary.className = 'manager-deck-summary';
  const icon = document.createElement('span');
  icon.className = 'manager-deck-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = getDeckIcon(deck).glyph;
  const title = document.createElement('strong');
  title.className = 'manager-deck-title';
  title.textContent = deck.name;
  const count = document.createElement('span');
  const cards = stats.cardsByDeck.get(deck.id) || [];
  const dueCount = stats.dueByDeck.get(deck.id) || 0;
  count.className = 'manager-deck-count';
  count.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'} · ${dueCount} due`;
  const status = document.createElement('span');
  status.className = 'manager-deck-status';
  status.textContent = isDeckArchived(deck) ? 'Archived' : 'Active';
  summary.append(icon, title, count, status);

  const content = document.createElement('div');
  content.className = 'manager-deck-content';
  section.append(summary, content);
  section.addEventListener('toggle', () => {
    if (!section.open) {
      if (expandedDeckId === deck.id) expandedDeckId = null;
      return;
    }
    expandedDeckId = deck.id;
    document.querySelectorAll('.manager-deck[open]').forEach(openDeck => {
      if (openDeck !== section) openDeck.open = false;
    });
    if (!content.dataset.rendered) renderDeckContents(deck, content, stats);
  });
  return section;
}

function renderDeckContents(deck, content, stats) {
  content.textContent = '';
  content.dataset.rendered = 'true';

  const name = createInput(deck.name, 'Deck topic');
  const description = createInput(deck.description || '', 'Short description');
  const keywords = createInput(deck.keywords || '', 'Keywords (comma-separated)');
  const exam = createInput('', 'Exam date', 'date');
  exam.value = deck.examDate ? new Date(deck.examDate).toISOString().slice(0, 10) : '';
  const color = createSelect(DECK_COLOR_OPTIONS, getDeckColor(deck), 'Deck color');
  const icon = createSelect(
    DECK_ICON_OPTIONS.map(option => ({ value: option.value, label: `${option.label} ${option.glyph}` })),
    getDeckIcon(deck).value,
    'Deck icon'
  );
  const fields = document.createElement('div');
  fields.className = 'manager-deck-fields';
  fields.append(
    labeledField('Name', name),
    labeledField('Description', description),
    labeledField('Keywords', keywords),
    labeledField('Exam date', exam),
    labeledField('Color', color),
    labeledField('Icon', icon)
  );

  const saveDeck = createButton('Save deck');
  const resetDueDates = createButton('Reset due dates', 'danger');
  const archiveAction = createButton(isDeckArchived(deck) ? 'Restore deck' : 'Archive deck');
  const actions = document.createElement('div');
  actions.className = 'manager-deck-actions';
  actions.append(saveDeck, resetDueDates, archiveAction);
  saveDeck.addEventListener('click', async () => {
    if (!name.value.trim()) return setStatus('Deck name cannot be empty.');
    deck.name = name.value.trim();
    deck.description = description.value.trim();
    deck.keywords = keywords.value.trim();
    deck.examDate = exam.value ? new Date(`${exam.value}T23:59:59.999`).getTime() : null;
    deck.color = color.value;
    deck.icon = icon.value;
    if (!await persistState()) return;
    setStatus('Deck saved.');
    render();
  });

  resetDueDates.addEventListener('click', async () => {
    if (!confirm(`Reset the review dates for every card in "${deck.name}"?`)) return;
    (stats.cardsByDeck.get(deck.id) || []).forEach(card => { card.dueAt = 0; });
    if (!await persistState()) return;
    setStatus('Due dates reset.');
    render();
  });

  archiveAction.addEventListener('click', async () => {
    if (isDeckArchived(deck)) {
      delete deck.archivedAt;
      if (!await persistState()) return;
      document.getElementById('deck-view').value = 'active';
      expandedDeckId = deck.id;
      setStatus('Deck restored. Its saved review schedule is unchanged.');
      render();
      return;
    }
    if (!confirm(`Archive "${deck.name}"? It will be hidden from studying until restored.`)) return;
    deck.archivedAt = Date.now();
    if (!await persistState()) return;
    expandedDeckId = null;
    setStatus('Deck archived. Its cards and schedule were preserved.');
    render();
  });

  if (isDeckArchived(deck)) {
    const deleteDeck = createButton('Delete permanently', 'danger');
    deleteDeck.addEventListener('click', async () => {
      if (!confirm(`Permanently delete "${deck.name}" and all ${stats.cardsByDeck.get(deck.id)?.length || 0} of its cards? This cannot be undone.`)) return;
      const nextState = deleteArchivedDeck(state, deck.id);
      if (!nextState) return setStatus('Only archived decks can be permanently deleted.');
      state = nextState;
      if (expandedDeckId === deck.id) expandedDeckId = null;
      if (!await persistState({ deletedDeckId: deck.id })) return;
      setStatus('Archived deck and its cards permanently deleted.');
      render();
    });
    actions.appendChild(deleteDeck);
  }

  const meta = document.createElement('p');
  meta.className = 'manager-deck-meta';
  const mode = deck.examDate ? 'deadline mode' : 'retention mode';
  const archived = isDeckArchived(deck) ? ' · Review paused while archived' : '';
  meta.textContent = `${(stats.cardsByDeck.get(deck.id) || []).length} card${(stats.cardsByDeck.get(deck.id) || []).length === 1 ? '' : 's'} · ${mode}${archived}`;

  content.append(fields, actions, meta);
  renderCardPage(deck, content, stats.cardsByDeck.get(deck.id) || []);
}

function labeledField(labelText, input) {
  const label = document.createElement('label');
  label.className = 'manager-field';
  label.append(document.createTextNode(labelText), input);
  return label;
}

function renderCardPage(deck, content, cards) {
  const maxPage = Math.max(0, Math.ceil(cards.length / CARD_PAGE_SIZE) - 1);
  const page = Math.min(cardPageByDeck.get(deck.id) || 0, maxPage);
  cardPageByDeck.set(deck.id, page);
  const start = page * CARD_PAGE_SIZE;
  const cardGrid = document.createElement('div');
  cardGrid.className = 'manager-cards';
  cards.slice(start, start + CARD_PAGE_SIZE).forEach(card => cardGrid.appendChild(renderCard(card)));
  content.appendChild(cardGrid);

  if (cards.length > CARD_PAGE_SIZE) {
    const pagination = document.createElement('div');
    pagination.className = 'manager-pagination';
    const previous = createButton('Previous');
    const next = createButton('Next');
    previous.disabled = page === 0;
    next.disabled = page === maxPage;
    const summary = document.createElement('span');
    summary.textContent = `Cards ${start + 1}–${Math.min(start + CARD_PAGE_SIZE, cards.length)} of ${cards.length}`;
    previous.addEventListener('click', () => {
      cardPageByDeck.set(deck.id, page - 1);
      rerenderExpandedDeck(deck.id);
    });
    next.addEventListener('click', () => {
      cardPageByDeck.set(deck.id, page + 1);
      rerenderExpandedDeck(deck.id);
    });
    pagination.append(previous, summary, next);
    content.appendChild(pagination);
  }

  const newFront = createInput('', 'New question');
  const newBack = createInput('', 'New answer');
  const addCard = createButton('+ Add card');
  addCard.addEventListener('click', async () => {
    if (!newFront.value.trim() || !newBack.value.trim()) return setStatus('Add both a question and answer.');
    state.cards.push(createCard({
      id: `card-${Date.now()}`,
      deckId: deck.id,
      front: newFront.value.trim(),
      back: newBack.value.trim()
    }));
    cardPageByDeck.set(deck.id, Math.floor((cards.length) / CARD_PAGE_SIZE));
    if (!await persistState()) return;
    setStatus('Card added.');
    render();
  });
  const addRow = document.createElement('div');
  addRow.className = 'new-manager-card';
  addRow.append(newFront, newBack, addCard);
  content.appendChild(addRow);
}

function rerenderExpandedDeck(deckId) {
  const details = [...document.querySelectorAll('.manager-deck')].find(item => item.dataset.deckId === deckId);
  if (details) {
    const deck = state.decks.find(item => item.id === deckId);
    const content = details.querySelector('.manager-deck-content');
    const stats = getDeckStats(Date.now());
    if (deck) renderDeckContents(deck, content, stats);
  }
}

function renderCard(card) {
  const article = document.createElement('article');
  article.className = 'manager-card';
  const front = document.createElement('textarea');
  front.value = card.front;
  front.placeholder = 'Question';
  front.setAttribute('aria-label', 'Question');
  const back = document.createElement('textarea');
  back.value = card.back;
  back.placeholder = 'Answer';
  back.setAttribute('aria-label', 'Answer');
  const saveCard = createButton('Save card');
  const deleteCard = createButton('Delete card', 'danger');
  saveCard.addEventListener('click', async () => {
    if (!front.value.trim() || !back.value.trim()) return setStatus('A card needs a question and answer.');
    card.front = front.value.trim();
    card.back = back.value.trim();
    if (!await persistState()) return;
    setStatus('Card saved.');
  });
  deleteCard.addEventListener('click', async () => {
    state.cards = state.cards.filter(item => item.id !== card.id);
    if (!await persistState()) return;
    setStatus('Card deleted.');
    render();
  });
  const actions = document.createElement('div');
  actions.className = 'manager-card-actions';
  actions.append(saveCard, deleteCard);
  article.append(front, back, actions);
  return article;
}

function setStatus(message) {
  document.getElementById('manager-status').textContent = message;
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

async function updateStorageUsage() {
  const output = document.getElementById('storage-usage');
  const storage = globalThis.chrome?.storage?.local;
  if (!storage?.getBytesInUse) {
    output.textContent = 'Local storage usage is available in Chrome.';
    return;
  }
  try {
    const bytes = await storage.getBytesInUse(null);
    const quota = Number(storage.QUOTA_BYTES);
    if (!Number.isFinite(quota) || quota <= 0) {
      output.textContent = `Local storage used: ${formatBytes(bytes)}. Quota unavailable.`;
      return;
    }
    const percentage = bytes / quota;
    output.textContent = `Local storage used: ${formatBytes(bytes)} of ${formatBytes(quota)}${percentage >= 0.8 ? ' · nearing the storage limit' : ''}`;
  } catch (error) {
    output.textContent = 'Could not read local storage usage.';
    console.error('Failed to read local storage usage:', error);
  }
}

async function persistState({ deletedDeckId = null } = {}) {
  const storage = globalThis.chrome?.storage?.local;
  try {
    if (deletedDeckId && storage?.get && storage?.set) {
      const stored = await storage.get('exposureVisits');
      await storage.set({
        [STORAGE_KEY]: state,
        exposureVisits: removeExposureVisitsForDeck(stored.exposureVisits, deletedDeckId),
        relevanceDeckModels: [],
        relevanceDeckModelsSignature: ''
      });
    } else {
      await saveStudyState(state);
    }
    await updateStorageUsage();
    await notifyStudyStateChanged();
    return true;
  } catch (error) {
    console.error('Failed to save deck changes:', error);
    try {
      state = await loadStudyState();
    } catch (reloadError) {
      console.error('Failed to reload study state after a save error:', reloadError);
      setStatus(`Could not save changes: ${error.message}`);
      return false;
    }
    setStatus(`Could not save changes: ${error.message}`);
    render();
    return false;
  }
}

async function notifyStudyStateChanged() {
  const runtimeApi = globalThis.chrome?.runtime;
  if (!runtimeApi?.sendMessage) return;
  try {
    await runtimeApi.sendMessage({ action: 'studyStateChanged' });
  } catch (error) {
    console.warn('Could not notify the side panel about deck changes:', error.message);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  state = await loadStudyState();
  render();
  await updateStorageUsage();
  document.getElementById('deck-view').addEventListener('change', () => {
    deckPage = 0;
    expandedDeckId = null;
    render();
  });
  document.getElementById('deck-sort').addEventListener('change', () => {
    deckPage = 0;
    render();
  });
  document.getElementById('deck-search').addEventListener('input', () => {
    deckPage = 0;
    render();
  });
  document.getElementById('add-deck').addEventListener('click', async () => {
    const field = document.getElementById('new-deck-name');
    if (!field.value.trim()) return setStatus('Enter a topic for the new deck.');
    const id = `deck-${Date.now()}`;
    state.decks.push({
      id,
      name: field.value.trim(),
      description: '',
      keywords: '',
      color: DECK_COLOR_OPTIONS[0].value,
      icon: DECK_ICON_OPTIONS[0].value,
      examDate: null
    });
    field.value = '';
    document.getElementById('deck-view').value = 'active';
    deckPage = 0;
    expandedDeckId = id;
    if (!await persistState()) return;
    setStatus('Deck created.');
    render();
  });
  document.getElementById('back-to-sidepanel').addEventListener('click', () => window.close());
});
