import fs from 'node:fs';
import { runSimulation } from '../core/simulation-model.js';

const learnerCount = Math.max(1, Number(process.argv[2]) || 500);
const outputPath = new URL('../docs/simulation-results.csv', import.meta.url);
const boosts = [0, 0.1, 0.2, 0.3];
const profiles = ['low', 'medium', 'high'];
const variants = ['standard', 'exposure-one-sided', 'exposure-two-sided'];
const rows = [];

for (const boost of boosts) {
  for (const profile of profiles) {
    for (const variant of variants) {
      for (const deadline of [false, true]) {
        const result = runSimulation({
          seed: 123456,
          learners: learnerCount,
          horizon: 60,
          boost,
          profile,
          variant,
          deadline,
          examDay: 60
        });
        rows.push({
          learners: learnerCount,
          horizon: result.horizon,
          boost,
          profile,
          variant,
          deadline: deadline ? 'true' : 'false',
          reviewsPerCard: result.reviewsPerCard.toFixed(6),
          meanRecallAtReview: result.meanRecallAtReview.toFixed(6),
          lapses: result.lapses.toFixed(6),
          predictedRecallOnExamDay: result.predictedRecallOnExamDay.toFixed(6)
        });
      }
    }
  }
}

const headers = ['learners', 'horizon', 'boost', 'profile', 'variant', 'deadline', 'reviewsPerCard', 'meanRecallAtReview', 'lapses', 'predictedRecallOnExamDay'];
const csv = [
  headers.join(','),
  ...rows.map(row => headers.map(header => row[header]).join(','))
].join('\n');
fs.mkdirSync(new URL('../docs', import.meta.url), { recursive: true });
fs.writeFileSync(outputPath, `${csv}\n`, 'utf8');

console.log(`N learners: ${learnerCount}; horizon: 60 days`);
console.table(rows.map(row => ({
  boost: row.boost,
  profile: row.profile,
  variant: row.variant,
  deadline: row.deadline,
  reviews: row.reviewsPerCard,
  recall: row.meanRecallAtReview,
  lapses: row.lapses,
  examRecall: row.predictedRecallOnExamDay
})));
console.log(`Wrote ${outputPath.pathname}`);
