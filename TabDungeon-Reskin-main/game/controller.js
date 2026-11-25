import { applyReview, levelFromXp } from './game-rules.js';
import { loadGameState, saveGameState } from './game-state.js';
import { renderArena } from './arena.js';

export function createGameController($) {
  let gameState;
  let arena;
  let effectsEnabled = true;
  let reduceMotion = false;
  let ambientEnabled = true;

  function renderHeader() {
    if (!gameState) return;
    const level = levelFromXp(gameState.xp);
    const nextLevelXp = level * level * 50;
    const previousLevelXp = (level - 1) * (level - 1) * 50;
    const progress = nextLevelXp === previousLevelXp
      ? 0
      : ((gameState.xp - previousLevelXp) / (nextLevelXp - previousLevelXp)) * 100;
    $('game-level').textContent = `Level ${level}`;
    $('game-xp-bar').style.width = `${Math.max(0, Math.min(100, progress))}%`;
    $('game-streak').textContent = `Streak ${gameState.streak.current}`;
  }

  function renderVisibility() {
    const header = $('game-header-strip');
    const arena = $('review-arena');
    const log = $('adventure-log');
    if (header) header.hidden = !effectsEnabled;
    if (arena) arena.hidden = !effectsEnabled;
    if (log) log.hidden = !effectsEnabled;
  }

  function renderContext(card, deck, dueCardCount = 0) {
    if (!gameState) return;
    arena?.hero.destroy();
    arena?.monster?.destroy();
    arena = renderArena($('review-arena'), {
      card,
      deck,
      gameState,
      effectsEnabled,
      reduceMotion,
      ambientEnabled,
      dueCardCount
    });
  }

  return {
    async load() {
      gameState = await loadGameState();
      renderHeader();
    },
    setOptions(options = {}) {
      if (typeof options.effectsEnabled === 'boolean') effectsEnabled = options.effectsEnabled;
      if (typeof options.reduceMotion === 'boolean') reduceMotion = options.reduceMotion;
      if (typeof options.ambientEnabled === 'boolean') ambientEnabled = options.ambientEnabled;
      renderVisibility();
      arena?.setAmbientEnabled?.(ambientEnabled);
    },
    showReview(card, deck, dueCardCount = 0) {
      renderContext(card, deck, dueCardCount);
    },
    queueReview(card, deck, dueCardCount = 0) {
      if (arena?.setNextCard) arena.setNextCard(card, deck, dueCardCount);
      else renderContext(card, deck, dueCardCount);
    },
    showEmpty(dueCardCount = 0) {
      renderContext(null, null, dueCardCount);
    },
    async onReview(event) {
      if (!gameState) await this.load();
      const result = applyReview(gameState, event, event.now);
      gameState = result.state;
      await saveGameState(gameState);
      renderHeader();
      if (!arena) renderContext(event.card, event.deck);
      const effects = event.deckFinished
        ? [...result.effects, { type: 'deckFinished' }]
        : result.effects;
      return arena.playEffects(effects, event);
    }
  };
}
