// TabDungeon - Background Service Worker
// Handles tab monitoring, domain classification, and AI Guide API calls

import {
  buildDeckModel,
  classifyAgainstDecks,
  isScorableUrl,
  normalizeUrl,
  scoreRelevance
} from '../core/relevance.js';
import { PARAMS, clamp } from '../core/params.js';
import { countDueCards } from '../core/scheduler.js';
import {
  accumulateExposureVisit,
  advanceTrackingState,
  createTrackingState,
  isTrackingEligible,
  pruneExposureVisits
} from '../core/exposure.js';
import { getActiveCards, getActiveDecks, groupCardsByDeck } from '../state/deck-utils.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
const MODEL = 'gemini-3.5-flash-lite';
const TRACKING_STORAGE_KEY = 'tabDungeonActiveExposure';
const MAX_TRACKING_ELAPSED_MS = 5 * 60 * 1000;

// Study-helper system prompt. Only use information explicitly provided in context.
// Do not make up statistics, numbers, or facts not given to you.
const SYSTEM_PROMPT = `You are the TabDungeon AI Guide, a concise study assistant for a flashcard-based learning app.
Help the user understand flashcard study schedules, exam deadlines, review recall, and effective study planning.

PERSONALITY AND VOICE:
- Speak clearly, calmly, and encouragingly.
- Be practical; avoid fantasy roleplay and claims of proven memory benefits.
- Keep general answers concise unless the user asks for detail.

IMPORTANT CONSTRAINTS:
- ONLY use information explicitly provided in the context or messages.
- Do NOT make up, guess, or hallucinate statistics, numbers, or facts.
- If you do not have information, clearly say that.
- Do not claim the user spent time on a page unless explicitly provided.
- Do not invent features or capabilities.
- Do NOT volunteer session statistics unless the user asks.

You can discuss:
- Deck topics, card recall, review ratings, due cards, and exam dates.
- Study planning and general learning strategies.
- How to use TabDungeon features mentioned in the current context.

Do NOT:
- Frame TabDungeon as a game quest or productivity RPG.
- Make claims that exposure or flashcard timing is proven to improve memory.
- Make up browsing habits or study outcomes.
- Bring up time spent on sites unprompted`;

// Track active tab timing
let activeTabId = null;
let focusedWindowId = chrome.windows?.WINDOW_ID_NONE || -1;
let idleState = 'active';
let activePage = null;
const countedTabIds = new Set();
let deckModelCache = null;
let deckModelSignature = '';

async function getDeckModels(studyState = null) {
  const state = studyState || (await chrome.storage.local.get('studyState')).studyState || { decks: [], cards: [] };
  const activeDecks = getActiveDecks(state);
  const activeCards = getActiveCards(state);
  const signature = JSON.stringify({
    decks: activeDecks.map(deck => ({
      id: deck.id,
      name: deck.name,
      description: deck.description,
      keywords: deck.keywords,
      examDate: deck.examDate
    })),
    cards: activeCards.map(card => ({
      id: card.id,
      deckId: card.deckId,
      front: card.front,
      back: card.back
    }))
  });
  if (deckModelCache && deckModelSignature === signature) return deckModelCache;
  const stored = await chrome.storage.local.get(['relevanceDeckModels', 'relevanceDeckModelsSignature']);
  if (stored.relevanceDeckModelsSignature === signature && Array.isArray(stored.relevanceDeckModels)) {
    deckModelCache = stored.relevanceDeckModels;
    deckModelSignature = signature;
    return deckModelCache;
  }
  const cardsByDeck = groupCardsByDeck(activeCards);
  deckModelCache = activeDecks.map(deck => buildDeckModel(
    cardsByDeck.get(deck.id) || [],
    { ...deck, description: deck.description, keywords: deck.keywords }
  ));
  deckModelSignature = signature;
  await chrome.storage.local.set({
    relevanceDeckModels: deckModelCache,
    relevanceDeckModelsSignature: signature
  });
  return deckModelCache;
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.studyState) {
    deckModelCache = null;
    deckModelSignature = '';
  }
});

function getTrackingStorage() {
  return chrome.storage?.session?.get ? chrome.storage.session : chrome.storage.local;
}

async function persistTrackingState(trackingState) {
  await getTrackingStorage().set({
    [TRACKING_STORAGE_KEY]: trackingState
  });
}

async function rehydrateTrackingState() {
  const stored = await getTrackingStorage().get(TRACKING_STORAGE_KEY);
  const trackingState = stored?.[TRACKING_STORAGE_KEY];
  if (!trackingState?.tabId && trackingState?.tabId !== 0) {
    activePage = null;
    activeTabId = null;
    return;
  }
  activePage = trackingState;
  activeTabId = trackingState.tabId;
  if (Number.isFinite(trackingState.windowId)) focusedWindowId = trackingState.windowId;
}

async function isTrackedPageActive() {
  if (!isTrackingEligible({ idleState, focusedWindowId, trackingState: activePage })) return false;
  try {
    const activeTabs = await chrome.tabs.query({
      active: true,
      windowId: activePage.windowId
    });
    return activeTabs.some(tab => tab.id === activePage.tabId);
  } catch {
    return false;
  }
}

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'chatWithGuide') {
    handleChatRequest(request.message, sendResponse);
    return true;
  }
  if (request.action === 'testApiKey') {
    testApiKey(request.apiKey, sendResponse);
    return true;
  }
  
  if (request.action === 'getSessionStats') {
    getSessionData(sendResponse);
    return true;
  }
  
  if (request.action === 'updateDomainClassification') {
    sendResponse({ success: false, error: 'Domain classification is no longer used.' });
    return false;
  }
  
  if (request.action === 'getUserDomainOverrides') {
    sendResponse({ success: true, overrides: {} });
    return false;
  }
  
  if (request.action === 'getAllTabs') {
    getAllTabsInfo(sendResponse);
    return true;
  }
  if (request.action === 'openDeckManager') {
    chrome.tabs.create({ url: chrome.runtime.getURL('deck-manager/deck-manager.html') });
    return false;
  }
  if (request.action === 'scoreRelevance') {
    getDeckModels().then(models => sendResponse({
      success: true,
      result: scoreRelevance(request.metadata || {}, models.find(model => model.deckId === request.deckId), PARAMS)
    })).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Handle chat request to Gemini API
async function handleChatRequest(userMessage, sendResponse) {
  try {
    const aiSettings = await chrome.storage.local.get(['aiEnabled']);
    if (aiSettings.aiEnabled === false) {
      sendResponse({ success: false, error: 'AI Guide is disabled in Settings.' });
      return;
    }
    const apiKey = await getApiKey();
    
    if (!apiKey) {
      sendResponse({
        success: false,
        error: 'API key not configured. Please set your Google Gemini API key in settings.'
      });
      return;
    }
    
    // Trim key to remove any whitespace
    const cleanKey = apiKey.trim();
    
    const data = await getSessionData();
    const stats = data.stats;
    const userContext = data.userContext;
    const devMode = data.devMode || false;
    
    const systemContext = `Current user context: ${JSON.stringify(userContext)}.
    Current session stats: ${JSON.stringify(stats)}. 
    Use these stats when relevant to the user's questions.`;
    
    // Gemini API uses contents format with parts
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT + '\\n\\n' + systemContext },
            { text: userMessage }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.7
      }
    };
    
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { raw: await response.text() };
      }
      const errorMsg = errorData.error?.message || errorData.error?.status || `API error: ${response.status} ${response.statusText}`;
      const errorResponse = {
        success: false,
        error: errorMsg,
        statusCode: response.status,
        statusText: response.statusText,
        rawResponse: errorData
      };
      
      if (devMode) {
        sendResponse(errorResponse);
      } else {
        sendResponse({ success: false, error: errorMsg });
      }
      return;
    }
    
    const result = await response.json();
    // Gemini response format: candidates[0].content.parts[0].text
    if (!result.candidates || result.candidates.length === 0) {
      const errorResponse = {
        success: false,
        error: 'Empty response from API',
        rawResponse: result
      };
      sendResponse(devMode ? errorResponse : { success: false, error: 'Empty response from API' });
      return;
    }
    
    const reply = result.candidates[0].content.parts[0].text;
    
    const responseData = {
      success: true,
      reply: reply,
      rawResponse: devMode ? result : undefined
    };
    
    sendResponse(responseData);
  } catch (error) {
    const errorData = {
      success: false,
      error: error.message || 'Failed to get response from AI Guide',
      rawError: error
    };
    
    sendResponse(errorData);
  }
}

// Get API key from storage
async function getApiKey() {
  const result = await chrome.storage.local.get(['apiKey']);
  return result.apiKey || null;
}

async function testApiKey(apiKey, sendResponse) {
  if (!apiKey) {
    sendResponse({ success: false, error: 'Please enter an API key first.' });
    return;
  }
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }] })
    });
    sendResponse(response.ok ? { success: true } : { success: false, error: `API returned ${response.status}.` });
  } catch (error) {
    sendResponse({ success: false, error: error.message || 'Unable to reach the API.' });
  }
}

// Get full session data
async function getSessionData(sendResponse) {
  await rehydrateTrackingState();
  await flushExposure();
  const result = await chrome.storage.local.get(['studyStats', 'studyState', 'devMode']);
  const studyStats = result.studyStats || { exposureMs: 0, tabsVisited: 0, dueCards: 0, startTime: Date.now() };
  const activeCards = getActiveCards(result.studyState);
  studyStats.dueCards = countDueCards(activeCards, Date.now());
  const devMode = result.devMode || false;
  
  if (sendResponse) {
    sendResponse({ success: true, stats: studyStats, devMode });
  } else {
    return { stats: studyStats, devMode };
  }
}

// Get default session stats
// Quick storage access
async function getStorage(key) {
  const result = await chrome.storage.local.get([key]);
  return result[key];
}

// Tab monitoring - track active tab and classify
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await flushExposure();
  await beginActivePage(activeInfo.tabId, activeInfo.windowId);
});

// Also monitor tab updates (URL changes and loading completion)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && tab) {
    await countNewTab(tab);
  }
  if ((changeInfo.url || changeInfo.status === 'complete') && tab && tab.active) {
    await flushExposure();
    await beginActivePage(tabId, tab.windowId);
  }
  // Always notify side panel on any tab update
  chrome.runtime.sendMessage({ action: 'tabsChanged' }).catch(() => {});
});

// Accumulate active time and refresh the chatbot context in complete one-minute blocks.
chrome.alarms.create('minuteUpdate', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'minuteUpdate') return;
  await rehydrateTrackingState();
  await flushExposure();
});

chrome.windows.onFocusChanged.addListener(async windowId => {
  await flushExposure();
  focusedWindowId = windowId;
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    activePage = null;
    await persistTrackingState(null);
    return;
  }
  const tabs = await chrome.tabs.query({ active: true, windowId });
  if (tabs[0]) await beginActivePage(tabs[0].id, windowId);
});

chrome.idle.onStateChanged.addListener(async state => {
  idleState = state;
  if (state !== 'active') {
    activePage = null;
    await persistTrackingState(null);
  }
  else if (focusedWindowId !== chrome.windows.WINDOW_ID_NONE) {
    const tabs = await chrome.tabs.query({ active: true, windowId: focusedWindowId });
    if (tabs[0]) await beginActivePage(tabs[0].id, focusedWindowId);
  }
});

// Listen for tab removal (auto-refresh tabs list)
chrome.tabs.onRemoved.addListener((tabId) => {
  countedTabIds.delete(tabId);
  if (activePage?.tabId === tabId) {
    activePage = null;
    activeTabId = null;
    persistTrackingState(null).catch(() => {});
  }
  chrome.runtime.sendMessage({ action: 'tabsChanged' }).catch(() => {});
});

// A tab visit means a newly created browser tab, not selecting an existing tab.
chrome.tabs.onCreated.addListener(async (tab) => {
  await countNewTab(tab);
  chrome.runtime.sendMessage({ action: 'tabsChanged' }).catch(() => {});
});

async function beginActivePage(tabId, windowId) {
  if (idleState !== 'active' || windowId !== focusedWindowId && focusedWindowId !== chrome.windows.WINDOW_ID_NONE) return;
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || !isScorableUrl(tab.url)) {
    activePage = null;
    await persistTrackingState(null);
    return;
  }
  const now = Date.now();
  const urlKey = normalizeUrl(tab.url);
  activeTabId = tabId;
  activePage = createTrackingState({
    tabId,
    windowId,
    urlKey,
    metadata: await getTabMetadata(tabId),
    now
  });
  focusedWindowId = windowId;
  await persistTrackingState(activePage);
}

async function flushExposure() {
  if (!activePage || idleState !== 'active') return;
  if (!(await isTrackedPageActive())) return;
  const now = Date.now();
  const advanced = advanceTrackingState(activePage, now, MAX_TRACKING_ELAPSED_MS);
  activePage = advanced.state;
  await persistTrackingState(activePage);
  const dwell = advanced.elapsedMs;
  if (dwell < PARAMS.MIN_DWELL * 1000) return;

  const state = await chrome.storage.local.get(['studyState', 'exposureVisits', 'studyStats']);
  const studyState = state.studyState || { decks: [], cards: [] };
  let visits = state.exposureVisits || {};
  const day = new Date().toISOString().slice(0, 10);
  const stats = state.studyStats || { exposureMs: 0, tabsVisited: 0, dueCards: 0, startTime: Date.now() };
  const models = await getDeckModels(studyState);
  const activeDecks = getActiveDecks(studyState);
  const cardsByDeck = groupCardsByDeck(studyState.cards || []);
  const pageMetadata = activePage.metadata;
  visits = pruneExposureVisits(visits, day);
  let countedExposureDwell = false;
  for (const deck of activeDecks) {
    const cards = cardsByDeck.get(deck.id) || [];
    const relevance = scoreRelevance(pageMetadata, models.find(model => model.deckId === deck.id), PARAMS);
    if (relevance.label !== 'related') continue;
    const accumulated = accumulateExposureVisit(visits, {
      dayKey: day,
      deckId: deck.id,
      urlHash: hashUrl(activePage.urlKey || ''),
      dwellIncrementMs: dwell,
      score: relevance.score,
      params: PARAMS
    });
    visits = accumulated.visits;
    const credit = accumulated.credit;
    if (credit <= 0) continue;
    for (const card of cards) {
      card.exposureCredit = clamp((card.exposureCredit || 0) + credit, 0, PARAMS.CREDIT_CAP);
    }
    countedExposureDwell = true;
  }
  if (countedExposureDwell) stats.exposureMs += dwell;
  await chrome.storage.local.set({ studyState, exposureVisits: visits, studyStats: stats });
}

function hashUrl(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function countNewTab(tab) {
  if (!tab?.id || !tab.url || !isScorableUrl(tab.url)) {
    return;
  }
  if (countedTabIds.has(tab.id)) return;

  countedTabIds.add(tab.id);
  const studyStats = await getStorage('studyStats') || { exposureMs: 0, tabsVisited: 0, dueCards: 0, startTime: Date.now() };
  studyStats.tabsVisited += 1;
  await chrome.storage.local.set({ studyStats });
}

async function getTabMetadata(tabId) {
  if (!tabId) return {};
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        description: [
          document.querySelector('meta[name="description"]')?.content,
          document.querySelector('meta[property="og:description"]')?.content,
          document.querySelector('meta[name="twitter:description"]')?.content
        ].filter(Boolean).join(' '),
        keywords: [
          document.querySelector('meta[name="keywords"]')?.content,
          document.querySelector('meta[property="og:title"]')?.content,
          document.querySelector('meta[name="twitter:title"]')?.content
        ].filter(Boolean).join(' '),
        headings: [...document.querySelectorAll('h1, h2, h3')]
          .slice(0, 10)
          .map(heading => heading.textContent?.trim())
          .filter(Boolean)
      })
    });
    return results[0]?.result || {};
  } catch (error) {
    console.warn('[TabDungeon] Page metadata unavailable:', error.message);
    return {};
  }
}

// Get all open tabs and their best matching study deck.
async function getAllTabsInfo(sendResponse) {
  const allTabs = await chrome.tabs.query({});
  const { studyState } = await chrome.storage.local.get('studyState');
  const eligibleTabs = allTabs.filter(tab => tab.url && isScorableUrl(tab.url));
  const models = await getDeckModels(studyState);
  const tabsWithDecks = await Promise.all(eligibleTabs.map(async tab => {
    if (tab.id !== activeTabId || tab.windowId !== focusedWindowId) {
      return { id: tab.id, title: tab.title || 'Untitled', bestDeck: null };
    }
    const metadata = await getTabMetadata(tab.id);
    const match = classifyAgainstDecks(metadata, models);
    const deck = studyState?.decks?.find(item => item.id === match?.deckId);
    return { id: tab.id, title: tab.title || 'Untitled', bestDeck: match?.label === 'related' ? deck?.name || null : null };
  }));
  
  if (sendResponse) {
    sendResponse({ success: true, tabs: tabsWithDecks });
  }
}

// Initialize when extension loads
chrome.runtime.onStartup.addListener(async () => {
  focusedWindowId = await chrome.windows.getLastFocused().then(window => window.id);
  await rehydrateTrackingState();
  await flushExposure();
  const tabs = await chrome.tabs.query({ active: true, windowId: focusedWindowId });
  if (tabs[0]) await beginActivePage(tabs[0].id, focusedWindowId);
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    studyStats: { exposureMs: 0, tabsVisited: 0, dueCards: 0, startTime: Date.now() }
  });
  const window = await chrome.windows.getLastFocused();
  focusedWindowId = window.id;
  const tabs = await chrome.tabs.query({ active: true, windowId: focusedWindowId });
  if (tabs[0]) await beginActivePage(tabs[0].id, focusedWindowId);
});
