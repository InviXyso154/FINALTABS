# TabDungeon

TabDungeon is a Chrome MV3 flashcard study helper for topic-based decks and spaced review. It tracks active-page relevance locally and gives capped exposure credit toward the next successful SM-2 review. The review interface includes a lightweight pixel-art presentation, but it is not a blocking game or productivity judge.

## Load the unpacked extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository folder.
5. Open the Chrome side panel and select TabDungeon.

## Commands

Run these from the repository root:

- `npm test` - run the Node test suite.
- `npm run evaluate` - evaluate the relevance classifier against the sample dataset.
- `npm run batch-sim` - run 500 learners across simulation variants and write `docs/simulation-results.csv`.
- `npm run calc-sheet` - generate `docs/CALCULATION_SHEET.md` from real relevance and scheduler functions.
- `npm run benchmark:decks` - benchmark synthetic deck-model building, classification, due counts, and list preparation.
- `npm run batch-sim -- 20` - run a small batch with a custom learner count.
- `npm run benchmark:decks -- 50 2` - benchmark with 50 cards per deck and twice the sample text.

The Deck Manager displays current Chrome local-storage usage and paginates large deck/card lists. The deck benchmark reports local Node timings and serialized study-state size for increasing deck counts. It is a repeatable comparison tool, not a universal capacity guarantee; Chrome side-panel rendering and real-device responsiveness still need to be measured separately.

Decks support editable descriptions, keywords, exam dates, color presets, and icons. Active decks can be searched and sorted; archived decks retain their cards and schedules for restoration. Permanent deletion is only available from the archived view.

Open `simulation/simulation.html` through the Chrome extension or as a local file. The page uses sample/in-memory data and does not read or write the real study state.

## What is algorithmic vs machine learning

- **SM-2 scheduling** is a deterministic scheduling algorithm.
- **TF-IDF cosine relevance** is an information-retrieval similarity method.
- **Naive Bayes (`core/relevance-model.js`)** is a small offline classifier for evaluation. It is not used by the Chrome extension at runtime.
- **Threshold values** are currently marked as provisional and tuned with the available labeled sample. They are not a claim of validated memory or learning benefit.

The simulation is feasibility evidence only. It encodes assumptions and should not be interpreted as proof that exposure improves retention. The `BOOST` parameter is a hypothesis to test.

## Algorithm overview

- Page text is tokenized and compared with a TF-IDF deck model using cosine similarity.
- Exposure credit accumulates over a continuous related-page stay and is capped per card and by the configured credit parameters.
- Exam dates can cap the final review interval.
- `card.baseInterval` preserves the plain SM-2 chain; `card.interval` stores the final adjusted interval.

## Reports

- `docs/CALCULATION_SHEET.md` - generated worked examples.
- `docs/simulation-results.csv` - batch simulation output.
- `docs/ALGORITHM_CHANGELOG.md` - before/after algorithm changes.

## Gemini Guide

The optional Gemini Guide uses a locally stored API key. The key is sent with the `x-goog-api-key` header and is not included in the request URL. Core study and simulation functions remain local and do not require the API.
