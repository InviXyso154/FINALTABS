import { PARAMS } from '../core/params.js';
import { calculateReview, isDue } from '../core/scheduler.js';
import { loadStudyState, saveStudyState } from '../state/study-state.js';
import {
  getActiveDecks,
  getActiveCards,
  getDeckColor,
  getDeckIcon,
  groupCardsByDeck,
  isDeckArchived
} from '../state/deck-utils.js';

const DECK_PAGE_SIZE = 20;

export function setupCards($, runtime, gameController) {
  let state;
  let activeCard;
  let testSession = null;
  let deckPage = 0;
  const expandedDeckIds = new Set();

  function safeGameCall(method, ...args) {
    try {
      return gameController?.[method]?.(...args);
    } catch (error) {
      console.error(`Game ${method} failed:`, error);
      return undefined;
    }
  }

  async function safeGameReview(event) {
    try {
      await gameController?.onReview?.(event);
    } catch (error) {
      console.error('Game review effect failed:', error);
    }
  }

  $('open-deck-manager').addEventListener('click', () => {
    const extensionUrl = globalThis.chrome?.runtime?.getURL('deck-manager/deck-manager.html');
    if (extensionUrl) {
      runtime.send({ action: 'openDeckManager' });
    } else {
      window.open('deck-manager/deck-manager.html', '_blank', 'noopener');
    }
  });

  function renderDeckSummary(deck, cards) {
    const row = document.createElement('details');
    row.className = 'deck-row';
    row.dataset.color = getDeckColor(deck);
    row.open = expandedDeckIds.has(deck.id);
    row.addEventListener('toggle', () => {
      if (row.open) expandedDeckIds.add(deck.id);
      else expandedDeckIds.delete(deck.id);
    });
    const summary = document.createElement('summary');
    summary.className = 'deck-row-summary';
    const icon = document.createElement('span');
    icon.className = 'deck-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = getDeckIcon(deck).glyph;
    const name = document.createElement('strong');
    name.className = 'deck-name';
    name.textContent = deck.name;
    const count = document.createElement('span');
    count.className = 'deck-card-count';
    const dueCount = cards.filter(card => isDue(card, Date.now())).length;
    count.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'} · ${dueCount} due`;
    summary.append(icon, name, count);
    const details = document.createElement('div');
    details.className = 'deck-row-details';
    if (deck.description) {
      const description = document.createElement('p');
      description.className = 'deck-description';
      description.textContent = deck.description;
      details.appendChild(description);
    }
    const dueLabel = document.createElement('span');
    const examTimestamp = Number(deck.examDate) || 0;
    const examInDays = examTimestamp
      ? Math.ceil((examTimestamp - Date.now()) / 86400000)
      : null;
    dueLabel.textContent = examInDays !== null
      ? `Exam date · ${examInDays >= 0 ? `in ${examInDays} day${examInDays === 1 ? '' : 's'}` : `${Math.abs(examInDays)} day${examInDays === -1 ? '' : 's'} ago`}`
      : 'Exam date';
    const dueInput = document.createElement('input');
    dueInput.type = 'date';
    dueInput.className = 'deck-due-input';
    dueInput.setAttribute('aria-label', `Exam date for ${deck.name}`);
    dueInput.value = examTimestamp ? new Date(examTimestamp).toISOString().slice(0, 10) : '';
    dueInput.addEventListener('change', async () => {
      deck.examDate = dueInput.value ? new Date(`${dueInput.value}T23:59:59.999`).getTime() : null;
      if (!await persistStudyState()) return;
      $('deck-editor-status').textContent = 'Exam date updated.';
      renderDeckList();
    });
    const examRow = document.createElement('label');
    examRow.className = 'deck-exam-row';
    examRow.append(dueLabel, dueInput);
    details.appendChild(examRow);
    row.append(summary, details);
    return row;
  }

  function renderDeckList() {
    if (!state) return;
    const search = $('deck-search').value.trim().toLocaleLowerCase();
    const activeCards = getActiveCards(state);
    const cardsByDeck = groupCardsByDeck(activeCards);
    const decks = getActiveDecks(state)
      .filter(deck => !search || `${deck.name} ${deck.description || ''} ${deck.keywords || ''}`.toLocaleLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));
    const list = $('deck-list');
    list.textContent = '';
    const maxPage = Math.max(0, Math.ceil(decks.length / DECK_PAGE_SIZE) - 1);
    deckPage = Math.min(deckPage, maxPage);
    const visibleDecks = decks.slice(deckPage * DECK_PAGE_SIZE, (deckPage + 1) * DECK_PAGE_SIZE);
    for (const deck of visibleDecks) {
      list.appendChild(renderDeckSummary(deck, cardsByDeck.get(deck.id) || []));
    }
    if (decks.length === 0) {
      const empty = document.createElement('small');
      empty.className = 'deck-list-empty';
      empty.textContent = search ? 'No matching active decks.' : 'No active decks yet.';
      list.appendChild(empty);
    }
    const pagination = $('deck-pagination');
    pagination.hidden = decks.length <= DECK_PAGE_SIZE;
    $('deck-page-previous').disabled = deckPage === 0;
    $('deck-page-next').disabled = deckPage === maxPage;
    $('deck-page-status').textContent = decks.length
      ? `Decks ${deckPage * DECK_PAGE_SIZE + 1}–${Math.min((deckPage + 1) * DECK_PAGE_SIZE, decks.length)} of ${decks.length}`
      : '';
  }

  function render(skipGame = false) {
    const now = Date.now();
    const dueCards = getActiveCards(state)
      .filter(card => isDue(card, now))
      .sort((a, b) => a.dueAt - b.dueAt);
    activeCard = null;
    $('review-actions').hidden = true;
    $('card-response').disabled = false;
    $('submit-card-answer').disabled = false;
    $('card-response').value = '';
    renderDeckList();
    $('answer-card').hidden = true;
    $('empty-card-state').hidden = dueCards.length > 0;
    $('test-card-controls').hidden = true;
    $('due-card-state').hidden = dueCards.length === 0;
    $('test-deck-select').textContent = '';
    $('due-deck-select').textContent = '';
    if (dueCards.length === 0) {
      $('review-status').textContent = '';
      if (!skipGame) safeGameCall('showEmpty', dueCards.length);
      return;
    }
    const dueDecks = getActiveDecks(state).filter(deck => dueCards.some(card => card.deckId === deck.id));
    dueDecks.forEach(deck => {
      const option = document.createElement('option');
      option.value = deck.id;
      option.textContent = deck.name;
      $('due-deck-select').appendChild(option);
    });
    $('review-status').textContent = 'Choose a deck to answer a due card.';
    if (!skipGame) safeGameCall('showEmpty', dueCards.length);
  }

  async function persistStudyState() {
    try {
      await saveStudyState(state);
      return true;
    } catch (error) {
      console.error('Failed to save study state:', error);
      try {
        state = await loadStudyState();
        render();
      } catch (reloadError) {
        console.error('Failed to reload study state after a save error:', reloadError);
      }
      $('deck-editor-status').textContent = `Could not save changes: ${error.message}`;
      return false;
    }
  }

  function showCard(card, label, skipGame = false, dueCardCount = 0) {
    if (!card) return;
    activeCard = card;
    $('empty-card-state').hidden = true;
    $('test-card-controls').hidden = true;
    $('due-card-state').hidden = true;
    $('answer-card').hidden = false;
    $('review-actions').hidden = true;
    $('card-response').disabled = false;
    $('submit-card-answer').disabled = false;
    $('card-response').value = '';
    $('card-question').textContent = activeCard.front;
    $('card-answer').textContent = activeCard.back;
    $('card-answer').hidden = true;
    $('review-status').textContent = label;
    const deck = state.decks.find(item => item.id === activeCard.deckId);
    safeGameCall(skipGame ? 'queueReview' : 'showReview', activeCard, deck, dueCardCount);
  }

  function startDeckTest() {
    const deck = state.decks.find(item => item.id === $('test-deck-select').value);
    const cards = getActiveCards(state).filter(item => item.deckId === deck?.id);
    if (!deck || isDeckArchived(deck) || cards.length === 0) return;
    testSession = { deckId: deck.id, cardIds: cards.map(card => card.id), index: 0 };
    showCard(cards[0], `${deck.name} · Practice test (1/${cards.length})`);
  }

  function showDueCard() {
    const deck = state.decks.find(item => item.id === $('due-deck-select').value);
    const now = Date.now();
    const dueCards = getActiveCards(state).filter(item => isDue(item, now));
    const card = dueCards
      .filter(item => item.deckId === deck?.id)
      .sort((a, b) => a.dueAt - b.dueAt)[0];
    showCard(card, `${deck?.name || 'Deck'} · Due review`, false, dueCards.length);
  }

  async function review(quality) {
    if (!activeCard) return;
    const deck = state.decks.find(item => item.id === activeCard.deckId);
    const now = Date.now();
    const activeCardsBeforeReview = getActiveCards(state);
    const dueBeforeReview = activeCardsBeforeReview.filter(card => card.deckId === activeCard.deckId && isDue(card, now)).length;
    const tierCard = { ...activeCard };
    const updated = calculateReview(activeCard, quality, { now, deck, params: PARAMS });
    state.cards = state.cards.map(card => card.id === activeCard.id ? updated : card);
    state.history.push({ cardId: activeCard.id, quality, reviewedAt: new Date().toISOString(), schedule: updated.schedule });
    if (!await persistStudyState()) return;
    const activeCardsAfterReview = getActiveCards(state);
    const dueCardsRemaining = activeCardsAfterReview.filter(card => isDue(card, now)).length;
    const repeatCard = Number(quality) === 1;
    const deckFinished = testSession
      ? !repeatCard && testSession.index >= testSession.cardIds.length - 1
      : activeCardsAfterReview.filter(card => card.deckId === activeCard.deckId && isDue(card, now)).length === 0;
    const gameEvent = {
      cardId: activeCard.id,
      deckId: activeCard.deckId,
      card: tierCard,
      deck,
      quality,
      dueRemainingInDeck: activeCardsAfterReview.filter(card => card.deckId === activeCard.deckId && isDue(card, now)).length,
      dailyDueCount: dueBeforeReview,
      exposureCredit: activeCard.exposureCredit || 0,
      deckFinished,
      now
    };
    async function finishReview() {
      $('answer-card').hidden = true;
      $('review-actions').hidden = true;
      $('review-status').textContent = 'Review complete.';
      await safeGameReview(gameEvent);
      render(true);
      safeGameCall('showEmpty', dueCardsRemaining);
    }

    if (testSession) {
      if (repeatCard) {
        showCard(updated, `${deck?.name || 'Deck'} · Practice test (repeat)`, true, dueCardsRemaining);
        await safeGameReview(gameEvent);
        return;
      }
      testSession.index += 1;
      const nextCard = state.cards.find(card => card.id === testSession.cardIds[testSession.index]);
      if (nextCard) {
        showCard(nextCard, `${deck?.name || 'Deck'} · Practice test (${testSession.index + 1}/${testSession.cardIds.length})`, true);
        await safeGameReview(gameEvent);
        return;
      } else {
        testSession = null;
        await finishReview();
        return;
      }
    } else {
      if (repeatCard) {
        showCard(updated, `${deck?.name || 'Deck'} · Again`, true, 1);
        await safeGameReview(gameEvent);
        return;
      }
    }
    await finishReview();
  }

  $('submit-card-answer').addEventListener('click', () => {
    const response = $('card-response').value.trim();
    if (!response) {
      $('review-status').textContent = 'Write an answer before finishing the card.';
      $('card-response').focus();
      return;
    }
    $('card-response').disabled = true;
    $('submit-card-answer').disabled = true;
    $('card-answer').hidden = false;
    $('review-actions').hidden = false;
    $('review-status').textContent = 'Answer submitted. How well did you recall it?';
  });
  document.querySelectorAll('.quality-button').forEach(button => button.addEventListener('click', () => review(Number(button.dataset.quality))));
  $('show-test-options').addEventListener('click', () => {
    const select = $('test-deck-select');
    select.textContent = '';
    const cardsByDeck = groupCardsByDeck(getActiveCards(state));
    getActiveDecks(state)
      .filter(deck => (cardsByDeck.get(deck.id) || []).length > 0)
      .forEach(deck => {
        const option = document.createElement('option');
        option.value = deck.id;
        option.textContent = deck.name;
        select.appendChild(option);
      });
    $('start-deck-test').disabled = select.options.length === 0;
    $('empty-card-state').hidden = true;
    $('test-card-controls').hidden = false;
  });
  $('start-deck-test').addEventListener('click', startDeckTest);
  $('show-due-card').addEventListener('click', showDueCard);
  $('deck-search').addEventListener('input', () => {
    deckPage = 0;
    renderDeckList();
  });
  $('deck-page-previous').addEventListener('click', () => {
    deckPage = Math.max(0, deckPage - 1);
    renderDeckList();
  });
  $('deck-page-next').addEventListener('click', () => {
    deckPage += 1;
    renderDeckList();
  });
  $('add-deck').addEventListener('click', async () => {
    const name = $('new-deck-name').value.trim();
    if (!name) {
      $('deck-editor-status').textContent = 'Enter a topic for the new deck.';
      return;
    }
    state.decks.push({
      id: `deck-${Date.now()}`,
      name,
      description: '',
      keywords: '',
      color: 'forest',
      icon: 'book',
      examDate: null
    });
    deckPage = 0;
    $('new-deck-name').value = '';
    if (!await persistStudyState()) return;
    $('deck-editor-status').textContent = 'Deck added.';
    render();
  });

  return {
    async load() {
      state = await loadStudyState();
      render();
    },
    async refresh() {
      state = await loadStudyState();
      const activeDeckIds = new Set(getActiveDecks(state).map(deck => deck.id));
      const cardStillActive = activeCard &&
        activeDeckIds.has(activeCard.deckId) &&
        state.cards.some(card => card.id === activeCard.id);
      if (activeCard && !cardStillActive) {
        activeCard = null;
        testSession = null;
        render();
      } else if (activeCard) {
        renderDeckList();
      } else {
        render();
      }
    },
    getState: () => state
  };
}
