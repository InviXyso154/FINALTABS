import { PARAMS } from './params.js';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for',
  'from', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this',
  'to', 'was', 'were', 'with', 'you', 'your', 'i', 'we', 'they', 'he', 'she',
  'ang', 'ng', 'sa', 'na', 'at', 'ay', 'mga', 'ito', 'iyon', 'para', 'kung',
  'ako', 'ikaw', 'ka', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'may', 'pag',
  'dahil', 'hindi', 'isang', 'mga',
  'what', 'how', 'does', 'did', 'do', 'which', 'when', 'where', 'who', 'why',
  'has', 'have', 'had', 'can', 'will', 'not', 'about', 'between', 'only',
  'through', 'there', 'their', 'into', 'than', 'then'
]);

const fields = metadata => [
  metadata?.title,
  metadata?.description,
  metadata?.keywords,
  ...(Array.isArray(metadata?.headings) ? metadata.headings : [])
].filter(value => typeof value === 'string' && value.trim());

export function tokenize(text = '') {
  return explainTokens(text).filter(entry => entry.kept).map(entry => entry.stemmed);
}

export function pageText(metadata = {}) {
  const title = typeof metadata.title === 'string' ? metadata.title : '';
  return [title, title, ...fields({ ...metadata, title: undefined })].join(' ');
}

const explainToken = rawValue => {
  const raw = String(rawValue).toLowerCase();
  if (!raw) return { raw, kept: false, reason: 'empty', stemmed: '' };
  if (!/^[a-z0-9]+$/.test(raw)) return { raw, kept: false, reason: 'not-alphanumeric', stemmed: '' };
  if (raw.length < 3) return { raw, kept: false, reason: 'too-short', stemmed: '' };
  if (/^\d+$/.test(raw)) return { raw, kept: false, reason: 'pure-number', stemmed: '' };
  if (STOPWORDS.has(raw)) return { raw, kept: false, reason: 'stopword', stemmed: '' };
  let stemmed = raw;
  if (stemmed.length > 5 && stemmed.endsWith('ing')) stemmed = stemmed.slice(0, -3);
  else if (stemmed.length > 4 && stemmed.endsWith('ed')) stemmed = stemmed.slice(0, -2);
  else if (stemmed.endsWith('sses') && stemmed.length > 5) stemmed = stemmed.slice(0, -2);
  else if (
    stemmed.length > 4 &&
    stemmed.endsWith('s') &&
    !stemmed.endsWith('ss') &&
    !stemmed.endsWith('us') &&
    !stemmed.endsWith('is')
  ) stemmed = stemmed.slice(0, -1);
  if (stemmed.length < 3) return { raw, kept: false, reason: 'stem-too-short', stemmed };
  return { raw, kept: true, reason: 'kept', stemmed };
};

export function explainTokens(text = '') {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(explainToken)
    .filter(entry => entry.raw);
}

const normalize = vector => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude ? vector.map(value => value / magnitude) : vector.map(() => 0);
};

const vectorForTokens = (tokens, vocabulary, idf) => {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return normalize(vocabulary.map((term, index) => (counts.get(term) || 0) * idf[index]));
};

const pageVectorWithOffTopic = (tokens, vocabulary, idf) => {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const maxIdf = idf.length ? Math.max(...idf) : 1;
  const weights = [];
  const offTopicTerms = [];
  let pageMagnitudeSquared = 0;
  for (const [term, count] of counts) {
    const deckIndex = vocabulary.indexOf(term);
    if (deckIndex >= 0) {
      weights[deckIndex] = (weights[deckIndex] || 0) + count * idf[deckIndex];
    } else {
      offTopicTerms.push(term);
      pageMagnitudeSquared += (count * maxIdf) ** 2;
    }
  }
  for (let index = 0; index < vocabulary.length; index += 1) {
    const weight = weights[index] || 0;
    pageMagnitudeSquared += weight ** 2;
  }
  return {
    vector: vocabulary.map((_, index) => weights[index] || 0),
    pageMagnitude: Math.sqrt(pageMagnitudeSquared),
    offTopicTerms: [...new Set(offTopicTerms)].sort()
  };
};

export function buildDeckModel(cards = [], deckMeta = {}) {
  const cardList = Array.isArray(cards) ? cards : [];
  const documents = cardList.map(card => tokenize(`${card?.front || ''} ${card?.back || ''}`));
  const metaText = [deckMeta.description, deckMeta.keywords].filter(Boolean).join(' ');
  if (metaText) documents.push(tokenize(metaText));
  const termSet = new Set(documents.flat());
  const vocabulary = [...termSet].sort();
  const documentCount = Math.max(1, documents.length);
  const idf = vocabulary.map(term => {
    const df = documents.reduce((count, document) => count + (document.includes(term) ? 1 : 0), 0);
    return Math.log((documentCount + 1) / (df + 1)) + 1;
  });
  const cardVectors = documents.slice(0, cardList.length).map(tokens => vectorForTokens(tokens, vocabulary, idf));
  const allVectors = [...cardVectors];
  if (metaText) allVectors.push(vectorForTokens(documents[documents.length - 1], vocabulary, idf));
  const mean = vocabulary.map((_, index) => allVectors.length
    ? allVectors.reduce((sum, vector) => sum + vector[index], 0) / allVectors.length
    : 0);
  return {
    deckId: deckMeta.id || deckMeta.deckId || null,
    vocabulary,
    idf,
    vector: normalize(mean),
    cardVectors,
    cardIds: cardList.map(card => card.id || null)
  };
}

function internalRelevance(metadata, deckModel, params = PARAMS, options = {}) {
  const textTokens = explainTokens(pageText(metadata));
  const pageTokens = textTokens.filter(entry => entry.kept).map(entry => entry.stemmed);
  const minPageTokens = params.MIN_PAGE_TOKENS ?? PARAMS.MIN_PAGE_TOKENS;
  const vocabulary = Array.isArray(deckModel?.vocabulary) ? deckModel.vocabulary : [];
  const idf = Array.isArray(deckModel?.idf) ? deckModel.idf : [];
  const deckVector = Array.isArray(deckModel?.vector) ? deckModel.vector : [];
  if (!deckModel || pageTokens.length < minPageTokens) {
    return {
      tokens: textTokens,
      deckVocabularySize: vocabulary.length,
      rows: [],
      offTopicTerms: [],
      pageNorm: 0,
      deckNorm: 0,
      dot: 0,
      cosine: 0,
      thresholds: { T_HI: params.T_HI ?? PARAMS.T_HI, T_LO: params.T_LO ?? PARAMS.T_LO },
      label: 'uncertain',
      matchedTerms: [],
      formula: 'cos = (A.B)/(|A||B|)'
    };
  }
  const deckMagnitude = Math.sqrt(deckVector.reduce((sum, value) => sum + value * value, 0));
  let pageVector;
  let pageMagnitude;
  let offTopicTerms = [];
  if (options.normalizeOffTopic === false) {
    pageVector = vectorForTokens(pageTokens, vocabulary, idf);
    pageMagnitude = Math.sqrt(pageVector.reduce((sum, value) => sum + value * value, 0));
  } else {
    const withOffTopic = pageVectorWithOffTopic(pageTokens, vocabulary, idf);
    pageVector = withOffTopic.vector;
    pageMagnitude = withOffTopic.pageMagnitude;
    offTopicTerms = withOffTopic.offTopicTerms;
  }
  const dot = pageVector.reduce((sum, value, index) => sum + value * (deckVector[index] || 0), 0);
  const rawScore = pageMagnitude && deckMagnitude ? dot / (pageMagnitude * deckMagnitude) : 0;
  const cosine = Math.max(0, Math.min(1, Number.isFinite(rawScore) ? rawScore : 0));
  const hi = params.T_HI ?? PARAMS.T_HI;
  const lo = params.T_LO ?? PARAMS.T_LO;
  const label = cosine >= hi ? 'related' : cosine <= lo ? 'unrelated' : 'uncertain';
  const counts = new Map();
  for (const term of pageTokens) counts.set(term, (counts.get(term) || 0) + 1);
  const rows = vocabulary.map((term, index) => {
    const pageTf = counts.get(term) || 0;
    const termIdf = idf[index] || 0;
    const tfidfWeight = pageTf * termIdf;
    const pageWeight = pageVector[index] || 0;
    const deckWeight = deckVector[index] || 0;
    return {
      term,
      pageTf,
      idf: termIdf,
      tfidfWeight,
      pageWeight,
      deckWeight,
      contribution: pageWeight * deckWeight
    };
  }).filter(row => row.pageTf > 0 || row.deckWeight > 0)
    .sort((a, b) => b.contribution - a.contribution);
  const matchedTerms = rows.filter(row => row.contribution > 0).slice(0, 5).map(row => row.term);
  return {
    tokens: textTokens,
    deckVocabularySize: vocabulary.length,
    rows,
    offTopicTerms,
    pageNorm: pageMagnitude,
    deckNorm: deckMagnitude,
    dot,
    cosine,
    thresholds: { T_HI: hi, T_LO: lo },
    label,
    matchedTerms,
    formula: 'cos = (A.B)/(|A||B|)'
  };
}

export function explainRelevance(metadata, deckModel, params = PARAMS, options = {}) {
  return internalRelevance(metadata, deckModel, params, options);
}

export function scoreRelevance(metadata, deckModel, params = PARAMS, options = {}) {
  const explanation = internalRelevance(metadata, deckModel, params, options);
  return {
    score: explanation.cosine,
    label: explanation.label,
    matchedTerms: explanation.matchedTerms
  };
}

export function classifyAgainstDecks(metadata, deckModels = []) {
  if (!Array.isArray(deckModels) || deckModels.length === 0) return null;
  return deckModels.map(model => ({
    deckId: model.deckId,
    ...scoreRelevance(metadata, model)
  })).sort((a, b) => b.score - a.score)[0];
}

export function scoreCardLevel(metadata, deckModel) {
  const pageTokens = tokenize(pageText(metadata));
  if (!deckModel?.cardVectors?.length || pageTokens.length < PARAMS.MIN_PAGE_TOKENS) return [];
  const pageVector = vectorForTokens(pageTokens, deckModel.vocabulary, deckModel.idf);
  return deckModel.cardVectors.map((vector, index) => ({
    cardId: deckModel.cardIds[index],
    score: Math.max(0, Math.min(1, pageVector.reduce((sum, value, i) => sum + value * (vector[i] || 0), 0)))
  })).sort((a, b) => b.score - a.score).slice(0, 3);
}

export function isScorableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const value = url.toLowerCase();
  return !value.startsWith('chrome://') && !value.startsWith('chrome-extension://') &&
    !value.startsWith('about:') && !value.startsWith('file://') &&
    !/^https?:\/\/newtab(?:\.|\/|$)/.test(value);
}

export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return '';
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid)$/i.test(key)) parsed.searchParams.delete(key);
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return '';
  }
}
