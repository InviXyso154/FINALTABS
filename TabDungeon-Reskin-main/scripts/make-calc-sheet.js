import fs from 'node:fs';
import { buildDeckModel, explainRelevance } from '../core/relevance.js';
import { calculateReview } from '../core/scheduler.js';
import { PARAMS } from '../core/params.js';

const deck = buildDeckModel([
  { id: 'tree-1', front: 'Binary tree traversal', back: 'Nodes edges recursion depth first search' },
  { id: 'graph-1', front: 'Graph algorithms', back: 'Vertices edges breadth first search' }
], {
  id: 'data-structures',
  keywords: 'data structures algorithms computer science'
});

const metadata = {
  title: 'Binary tree traversal',
  description: 'Learn data structures with nodes edges and depth first search',
  headings: ['Algorithms']
};
const relevance = explainRelevance(metadata, deck, PARAMS);
const now = Date.UTC(2026, 11, 24);
const card = {
  interval: 10,
  baseInterval: 10,
  repetitions: 3,
  easeFactor: 2.5,
  exposureCredit: 0.5,
  lapses: 0
};
const scheduling = calculateReview(card, 4, {
  now,
  deck: { examDate: now + 10 * 86400000 },
  params: PARAMS
});

const termRows = relevance.rows.map(row =>
  `| ${row.term} | ${row.pageTf} | ${row.idf.toFixed(6)} | ${row.pageWeight.toFixed(6)} | ${row.deckWeight.toFixed(6)} | ${row.contribution.toFixed(6)} |`
).join('\n');

const traceRows = scheduling.trace.map(step =>
  `| ${step.id} | ${step.label} | ${step.formula} | ${JSON.stringify(step.inputs)} | ${JSON.stringify(step.result)} |`
).join('\n');

const sheet = `# Calculation Sheet

## Relevance worked example

- Formula: \`${relevance.formula}\`
- Dot product: ${relevance.dot.toFixed(6)}
- Page norm: ${relevance.pageNorm.toFixed(6)}
- Deck norm: ${relevance.deckNorm.toFixed(6)}
- Cosine: ${relevance.cosine.toFixed(6)}
- Label: ${relevance.label}
- Thresholds: T_HI=${relevance.thresholds.T_HI} (provisional), T_LO=${relevance.thresholds.T_LO} (provisional)

### Term table

| Term | Page TF | IDF | Page weight | Deck weight | Contribution |
|---|---:|---:|---:|---:|---:|
${termRows}

### Substitution

\`cos = ${relevance.dot.toFixed(6)} / (${relevance.pageNorm.toFixed(6)} × ${relevance.deckNorm.toFixed(6)}) = ${relevance.cosine.toFixed(6)}\`

## Scheduler worked example

- Exposure credit: 0.5
- Quality: 4
- Repetitions before review: 3
- Base interval before review: 10

| Step | Label | Formula | Inputs | Result |
|---|---|---|---|---|
${traceRows}

- Final interval: ${scheduling.interval.toFixed(6)} days

These numbers are generated directly from \`explainRelevance\` and \`calculateReview\`.
`;

const output = new URL('../docs/CALCULATION_SHEET.md', import.meta.url);
fs.writeFileSync(output, sheet, 'utf8');
console.log(`Wrote ${output.pathname}`);
