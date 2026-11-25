import { performance } from 'node:perf_hooks';
import { buildDeckModel, classifyAgainstDecks } from '../core/relevance.js';
import { countDueCards } from '../core/scheduler.js';
import { getActiveDecks, groupCardsByDeck } from '../state/deck-utils.js';
import { createCard } from '../state/study-state.js';

const deckCounts = [10, 50, 100, 250, 500, 1000];
const cardsPerDeck = Number(process.argv[2] || 20);
const textMultiplier = Number(process.argv[3] || 1);
const sampleCount = 5;

if (!Number.isInteger(cardsPerDeck) || cardsPerDeck < 1 || cardsPerDeck > 200) {
  throw new RangeError('cards-per-deck must be an integer from 1 to 200.');
}
if (!Number.isInteger(textMultiplier) || textMultiplier < 1 || textMultiplier > 20) {
  throw new RangeError('text-multiplier must be an integer from 1 to 20.');
}

function createDataset(deckCount) {
  const decks = Array.from({ length: deckCount }, (_, index) => ({
    id: `deck-${index}`,
    name: `Topic ${index}`,
    description: 'software engineering architecture memory retention',
    keywords: 'design algorithms evaluation',
    color: 'forest',
    icon: 'book',
    examDate: null
  }));
  const cards = [];
  for (const [index, deck] of decks.entries()) {
    for (let cardIndex = 0; cardIndex < cardsPerDeck; cardIndex += 1) {
      cards.push(createCard({
        id: `${deck.id}-card-${cardIndex}`,
        deckId: deck.id,
        front: `${deck.name} software architecture design concept ${cardIndex} `.repeat(textMultiplier),
        back: 'Algorithms and systems for software engineering evaluation.'.repeat(textMultiplier),
        dueAt: (cardIndex + index) % 3 === 0 ? 0 : Number.MAX_SAFE_INTEGER
      }));
    }
  }
  return { decks, cards, history: [] };
}

function measure(operation) {
  operation();
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }
  samples.sort((a, b) => a - b);
  return {
    median: Number(samples[Math.floor(samples.length / 2)].toFixed(2)),
    max: Number(samples[samples.length - 1].toFixed(2))
  };
}

const results = [];
for (const deckCount of deckCounts) {
  const state = createDataset(deckCount);
  let models = [];
  const modelBuild = measure(() => {
    const grouped = groupCardsByDeck(state.cards);
    models = getActiveDecks(state).map(deck => buildDeckModel(grouped.get(deck.id) || [], deck));
  });
  const dueCount = measure(() => countDueCards(state.cards, Date.now()));
  const summaryPreparation = measure(() => {
    const activeDecks = getActiveDecks(state);
    const grouped = groupCardsByDeck(state.cards);
    return activeDecks.map(deck => ({
      id: deck.id,
      cardCount: (grouped.get(deck.id) || []).length
    }));
  });
  const classification = measure(() => classifyAgainstDecks({
    title: 'Topic 0 software architecture design',
    description: 'Algorithms and software engineering evaluation',
    headings: ['Memory retention and systems']
  }, models));

  results.push({
    decks: deckCount,
    cards: state.cards.length,
    cardsPerDeck,
    modelBuildMedianMs: modelBuild.median,
    modelBuildMaxMs: modelBuild.max,
    listPreparationMedianMs: summaryPreparation.median,
    dueCountMedianMs: dueCount.median,
    classifyOnePageMedianMs: classification.median,
    classifyOnePageMaxMs: classification.max,
    studyStateBytes: Buffer.byteLength(JSON.stringify(state))
  });
}

console.log(`Node ${process.version}; ${cardsPerDeck} cards/deck; text multiplier ${textMultiplier}; ${sampleCount} measured runs after warm-up.`);
console.table(results);
console.log('This measures synthetic model, matching, due-count, and list-preparation work in Node; it does not measure Chrome UI rendering or establish a universal capacity limit.');
