export function createStatsView($, runtime) {
  const formatMinutes = milliseconds => `${Math.floor((milliseconds || 0) / 60000)}m`;

  function renderStats(stats) {
    if (!stats) return;
    const sessionTime = $('session-time');
    const studyExposure = $('study-exposure');
    const dueCards = $('due-cards');
    const tabCount = $('tab-count');
    if (sessionTime) sessionTime.textContent = `Session: ${formatMinutes(Date.now() - (stats.startTime || Date.now()))}`;
    if (studyExposure) studyExposure.textContent = `Study exposure: ${formatMinutes(stats.exposureMs)}`;
    if (dueCards) dueCards.textContent = `Due cards: ${stats.dueCards || 0}`;
    if (tabCount) tabCount.textContent = `New tabs: ${stats.tabsVisited || 0}`;
  }

  function loadTabs() {
    runtime.send({ action: 'getAllTabs' }, response => {
      const list = $('tabs-list');
      list.textContent = '';
      (response?.tabs || []).forEach(tab => {
        const row = document.createElement('div');
        row.className = 'tab-row';
        row.textContent = `${tab.title} · ${tab.bestDeck || 'No matching deck'}`;
        list.appendChild(row);
      });
      if (!list.children.length) list.textContent = 'No web tabs found.';
    });
  }

  function update() {
    runtime.send({ action: 'getSessionStats' }, response => {
      if (response?.success) renderStats(response.stats);
    });
    loadTabs();
  }

  return { update };
}
