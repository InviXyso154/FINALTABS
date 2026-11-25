import { buildDeckModel, explainRelevance, isScorableUrl } from '../core/relevance.js';
import { PARAMS } from '../core/params.js';
import { calculateExposureCreditIncrement } from '../core/exposure.js';
import { calculateReview, compareToStandard } from '../core/scheduler.js';
import { runSimulation } from '../core/simulation-model.js';

const SAMPLE_DECKS = [
  {
    id: 'javascript',
    name: 'JavaScript fundamentals',
    description: 'Programming variables functions arrays objects',
    cards: [
      { id: 'js-1', front: 'What is a JavaScript variable?', back: 'A named value that can change.' },
      { id: 'js-2', front: 'How do functions work?', back: 'Functions define reusable operations.' }
    ]
  },
  {
    id: 'datastructures',
    name: 'Data structures',
    description: 'Binary trees graphs nodes edges algorithms',
    cards: [
      { id: 'ds-1', front: 'What is binary tree traversal?', back: 'Visiting nodes using in-order, pre-order, or post-order.' },
      { id: 'ds-2', front: 'What are graph vertices?', back: 'Points connected by edges.' }
    ]
  },
  {
    id: 'history',
    name: 'Philippine history',
    description: 'Philippine independence revolution historical periods',
    cards: [
      { id: 'ph-1', front: 'What was the Philippine Revolution?', back: 'A movement for independence from Spanish rule.' }
    ]
  }
];

const state = {
  reportMarkdown: '',
  reportRows: [],
  decks: SAMPLE_DECKS.map(deck => ({
    ...deck,
    model: buildDeckModel(deck.cards, deck)
  }))
};

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#39;', "'": '&#039;'
}[character]));

function table(headers, rows) {
  return `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row =>
    `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  ).join('')}</tbody></table>`;
}

function switchTab(name) {
  document.querySelectorAll('.simulation-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === name);
  });
  document.querySelectorAll('.simulation-view').forEach(view => {
    const active = view.id === `${name}-view`;
    view.hidden = !active;
    view.classList.toggle('active', active);
  });
}

function renderDeckOptions() {
  const select = $('relevance-deck');
  select.textContent = '';
  state.decks.forEach(deck => {
    const option = document.createElement('option');
    option.value = deck.id;
    option.textContent = deck.name;
    select.appendChild(option);
  });
  select.value = 'javascript';
}

async function tabMetadata(tabId) {
  if (!globalThis.chrome?.scripting) return {};
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
        headings: [...document.querySelectorAll('h1, h2, h3')].slice(0, 10).map(node => node.textContent?.trim()).filter(Boolean)
      })
    });
    return results[0]?.result || {};
  } catch {
    return {};
  }
}

async function includeCurrentTabs() {
  if (!$('include-tabs').checked || !globalThis.chrome?.tabs) return;
  const tabs = await chrome.tabs.query({});
  const candidates = tabs.filter(tab => tab.url && isScorableUrl(tab.url)).slice(0, 10);
  const list = $('visit-list');
  list.textContent = '';
  if (!candidates.length) {
    list.textContent = 'No eligible open tabs.';
    return;
  }
  for (const tab of candidates) {
    const metadata = await tabMetadata(tab.id);
    const row = document.createElement('div');
    row.className = 'visit-row';
    row.innerHTML = `<span>${escapeHtml(metadata.title || tab.title || tab.url)}</span><button type="button">Use page</button>`;
    row.querySelector('button').addEventListener('click', () => {
      $('page-title').value = metadata.title || tab.title || tab.url;
      $('page-description').value = metadata.description || '';
      $('status').textContent = 'Open-tab metadata copied to the relevance inputs.';
    });
    list.appendChild(row);
  }
}

function setReport(markdown, rows) {
  state.reportMarkdown = markdown;
  state.reportRows = rows;
  $('calculation-report').textContent = markdown;
}

function runRelevance() {
  const deck = state.decks.find(item => item.id === $('relevance-deck').value);
  const metadata = {
    title: $('page-title').value,
    description: $('page-description').value
  };
  const dwellSeconds = Math.max(0, Number($('relevance-dwell').value) || 0);
  const explanation = explainRelevance(metadata, deck.model, PARAMS);
  const dwellMs = dwellSeconds * 1000;
  const eligible = dwellMs >= PARAMS.MIN_DWELL * 1000 && explanation.label === 'related';
  const credit = eligible
    ? calculateExposureCreditIncrement({
      previousDwellMs: 0,
      totalDwellMs: dwellMs,
      score: explanation.cosine,
      params: PARAMS
    })
    : 0;
  const tokenRows = explanation.tokens.map(token =>
    [token.raw, token.kept ? 'yes' : 'no', token.reason, token.stemmed || '—']
  );
  const termRows = explanation.rows.map(row =>
    [row.term, row.pageTf, row.idf.toFixed(6), row.pageWeight.toFixed(6), row.deckWeight.toFixed(6), row.contribution.toFixed(6)]
  );
  $('relevance-results').innerHTML = [
    `<p><strong>Label:</strong> ${escapeHtml(explanation.label)} &nbsp; <strong>Cosine:</strong> ${explanation.cosine.toFixed(6)}</p>`,
    `<p><strong>Formula:</strong> ${escapeHtml(explanation.formula)} &nbsp; dot=${explanation.dot.toFixed(6)}, |A|=${explanation.pageNorm.toFixed(6)}, |B|=${explanation.deckNorm.toFixed(6)}</p>`,
    `<p><strong>Substitution:</strong> cos = ${explanation.dot.toFixed(6)} / (${explanation.pageNorm.toFixed(6)} × ${explanation.deckNorm.toFixed(6)}) = ${explanation.cosine.toFixed(6)}</p>`,
    `<p><strong>Thresholds:</strong> T_HI=${explanation.thresholds.T_HI}, T_LO=${explanation.thresholds.T_LO}; provisional values.</p>`,
    `<h3>Token trace</h3>${table(['Raw', 'Kept', 'Reason', 'Stemmed'], tokenRows)}`,
    `<h3>Term table</h3>${table(['Term', 'Page TF', 'IDF', 'Page weight', 'Deck weight', 'Contribution'], termRows)}`,
    `<p><strong>Credit eligibility:</strong> dwell=${dwellSeconds}s, minimum=${PARAMS.MIN_DWELL}s, related=${explanation.label === 'related' ? 'yes' : 'no'}.</p>`,
    `<p><strong>Credit:</strong> w = ${PARAMS.LAMBDA} × ${explanation.cosine.toFixed(6)} × min(${dwellSeconds}/${PARAMS.T_FULL}, 1) = ${credit.toFixed(6)}</p>`
  ].join('');
  const rows = [
    ['section', 'deck', 'cosine', 'label', 'dwell_seconds', 'credit'],
    ['relevance', deck.name, explanation.cosine.toFixed(6), explanation.label, dwellSeconds, credit.toFixed(6)]
  ];
  setReport([
    '# TabDungeon relevance calculation',
    '',
    `Deck: ${deck.name}`,
    `Cosine: ${explanation.cosine.toFixed(6)}`,
    `Formula: cos = ${explanation.dot.toFixed(6)} / (${explanation.pageNorm.toFixed(6)} × ${explanation.deckNorm.toFixed(6)}) = ${explanation.cosine.toFixed(6)}`,
    `Label: ${explanation.label}`,
    `Thresholds: T_HI=${explanation.thresholds.T_HI} (provisional), T_LO=${explanation.thresholds.T_LO} (provisional)`,
    `Credit: w = ${PARAMS.LAMBDA} × ${explanation.cosine.toFixed(6)} × min(${dwellSeconds}/${PARAMS.T_FULL},1) = ${credit.toFixed(6)}`
  ].join('\n'), rows);
  $('status').textContent = 'Relevance calculation complete.';
}

function runScheduler() {
  const todayInput = $('sched-today').value;
  const examInput = $('sched-exam').value;
  const today = todayInput ? new Date(`${todayInput}T00:00:00`).getTime() : 0;
  const examDate = examInput ? new Date(`${examInput}T23:59:59`).getTime() : null;
  const card = {
    interval: Number($('sched-base').value) || 0,
    baseInterval: Number($('sched-base').value) || 0,
    repetitions: Number($('sched-repetitions').value) || 0,
    easeFactor: Number($('sched-ease').value) || 2.5,
    exposureCredit: Number($('sched-credit').value) || 0,
    lapses: 0
  };
  const quality = Number($('sched-quality').value);
  const context = { now: today, deck: examDate ? { examDate } : {}, params: PARAMS };
  const adjusted = calculateReview(card, quality, context);
  const standard = compareToStandard(card, quality, context);
  const rows = adjusted.trace.map(step =>
    [step.id, step.label, step.formula, JSON.stringify(step.inputs), JSON.stringify(step.result), JSON.stringify(standard.trace.find(item => item.id === step.id)?.result ?? '—')]
  );
  $('scheduler-results').innerHTML =
    `<p><strong>Adjusted final interval:</strong> ${adjusted.interval.toFixed(6)} days &nbsp; <strong>Standard:</strong> ${standard.interval.toFixed(6)} days</p>` +
    table(['ID', 'Step', 'Formula', 'Inputs', 'Adjusted result', 'Standard result'], rows);
  const reportRows = [
    ['section', 'step', 'formula', 'adjusted_result', 'standard_result'],
    ...adjusted.trace.map(step => [
      'scheduler',
      step.id,
      step.formula,
      JSON.stringify(step.result),
      JSON.stringify(standard.trace.find(item => item.id === step.id)?.result ?? '')
    ])
  ];
  setReport([
    '# TabDungeon scheduler calculation',
    '',
    `Adjusted final interval: ${adjusted.interval.toFixed(6)} days`,
    `Standard final interval: ${standard.interval.toFixed(6)} days`,
    '',
    ...adjusted.trace.map(step => `## ${step.label}\n${step.formula}\nInputs: ${JSON.stringify(step.inputs)}\nResult: ${JSON.stringify(step.result)}`)
  ].join('\n'), reportRows);
  $('status').textContent = 'Scheduler calculation complete.';
}

function runCompare() {
  const boost = Number($('compare-boost').value);
  const profile = $('compare-profile').value;
  const horizon = Number($('compare-horizon').value) || 60;
  const seed = Number($('compare-seed').value) || 123456;
  const variants = [
    ['standard', false],
    ['exposure-one-sided', false],
    ['exposure-two-sided', false],
    ['standard', true],
    ['exposure-one-sided', true],
    ['exposure-two-sided', true]
  ];
  const metrics = variants.map(([variant, deadline]) => runSimulation({
    seed,
    learners: 1,
    horizon,
    boost,
    profile,
    variant,
    deadline,
    examDay: horizon
  }));
  $('compare-results').innerHTML = table(
    ['Variant', 'Deadline', 'Reviews/card', 'Mean recall', 'Lapses', 'Predicted exam recall'],
    metrics.map(metric => [
      metric.variant,
      metric.deadline ? 'yes' : 'no',
      metric.reviewsPerCard.toFixed(3),
      metric.meanRecallAtReview.toFixed(6),
      metric.lapses.toFixed(3),
      metric.predictedRecallOnExamDay.toFixed(6)
    ])
  );
  const rows = [
    ['variant', 'deadline', 'reviews_per_card', 'mean_recall', 'lapses', 'predicted_exam_recall'],
    ...metrics.map(metric => [
      metric.variant,
      metric.deadline ? 'true' : 'false',
      metric.reviewsPerCard.toFixed(6),
      metric.meanRecallAtReview.toFixed(6),
      metric.lapses.toFixed(6),
      metric.predictedRecallOnExamDay.toFixed(6)
    ])
  ];
  setReport([
    '# TabDungeon simulation comparison',
    '',
    'Simulation encodes assumptions; feasibility evidence only.',
    `BOOST=${boost}; exposure profile=${profile}; horizon=${horizon} days; seed=${seed}.`,
    '',
    ...metrics.map(metric =>
      `${metric.variant}; deadline=${metric.deadline ? 'yes' : 'no'}; reviews/card=${metric.reviewsPerCard.toFixed(3)}; mean recall=${metric.meanRecallAtReview.toFixed(6)}; lapses=${metric.lapses.toFixed(3)}; exam recall=${metric.predictedRecallOnExamDay.toFixed(6)}`
    )
  ].join('\n'), rows);
  $('status').textContent = 'Comparison complete.';
}

function downloadCsv() {
  if (!state.reportRows.length) {
    $('status').textContent = 'Run a calculation before downloading CSV.';
    return;
  }
  const csv = state.reportRows.map(row => row.map(value => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'tabdungeon-calculation.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll('.simulation-tab').forEach(button =>
  button.addEventListener('click', () => switchTab(button.dataset.tab))
);
$('include-tabs').addEventListener('change', () => includeCurrentTabs().catch(error => {
  $('status').textContent = `Could not read open tabs: ${error.message}`;
}));
$('run-relevance').addEventListener('click', runRelevance);
$('run-scheduler').addEventListener('click', runScheduler);
$('run-compare').addEventListener('click', runCompare);
$('copy-report').addEventListener('click', async () => {
  await navigator.clipboard.writeText(state.reportMarkdown);
  $('status').textContent = 'Calculation report copied.';
});
$('download-csv').addEventListener('click', downloadCsv);

renderDeckOptions();
