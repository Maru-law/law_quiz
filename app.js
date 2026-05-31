/**
 * GitHub Pages frontend
 * Vanilla JavaScript quiz app
 */

// TODO: GAS WebアプリのURLに差し替えてください
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycby83naVQhqg0SzzEmvMlB3JwmT75Z3nexLnZc8j1HE7g6L0Fv9BVfs7WXDoAFB0mc5Cow/exec';

const STORAGE_KEYS = {
  QUESTIONS: 'quiz_questions_cache_v1',
  QUESTIONS_UPDATED_AT: 'quiz_questions_updated_at_v1',
  PROGRESS: 'quiz_section_progress_v1',
  PENDING_CHECKS: 'quiz_pending_checks_v1'
};

let allQuestions = [];
let groupedSections = {};

let currentSectionKey = null;
let currentSectionQuestions = [];
let currentQuestion = null;
let currentDisplayedType = null;
let answered = false;

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
  bindElements();
  bindEvents();

  await initializeApp();
});

function bindElements() {
  els.appTitle = document.getElementById('appTitle');
  els.refreshButton = document.getElementById('refreshButton');
  els.sectionPage = document.getElementById('sectionPage');
  els.quizPage = document.getElementById('quizPage');
  els.sectionList = document.getElementById('sectionList');
  els.dataStatus = document.getElementById('dataStatus');

  els.backButton = document.getElementById('backButton');
  els.currentSection = document.getElementById('currentSection');
  els.progressText = document.getElementById('progressText');
  els.questionText = document.getElementById('questionText');

  els.resultArea = document.getElementById('resultArea');
  els.resultLabel = document.getElementById('resultLabel');
  els.explanationText = document.getElementById('explanationText');

  els.afterActions = document.getElementById('afterActions');
  els.checkLaterButton = document.getElementById('checkLaterButton');
  els.nextButton = document.getElementById('nextButton');
  els.returnButton = document.getElementById('returnButton');

  els.answerDock = document.getElementById('answerDock');
  els.trueButton = document.getElementById('trueButton');
  els.falseButton = document.getElementById('falseButton');

  els.toast = document.getElementById('toast');
}

function bindEvents() {
  els.refreshButton.addEventListener('click', async () => {
    await fetchAndCacheQuestions(true);
    renderSectionList();
  });

  els.backButton.addEventListener('click', () => {
    returnToSectionList();
  });

  els.returnButton.addEventListener('click', () => {
    returnToSectionList();
  });

  els.nextButton.addEventListener('click', () => {
    showNextQuestion();
  });

  els.checkLaterButton.addEventListener('click', () => {
    if (!currentQuestion) return;

    addPendingCheck(currentQuestion.rowNumber);

    els.checkLaterButton.classList.add('checked');
    els.checkLaterButton.textContent = '後で見るに追加済み';

    showToast('後で見るに追加しました');
  });

  els.trueButton.addEventListener('click', () => answerQuestion(true));
  els.falseButton.addEventListener('click', () => answerQuestion(false));
}

async function initializeApp() {
  const cached = loadCachedQuestions();

  if (cached.length > 0) {
    allQuestions = cached;
    els.dataStatus.textContent = `キャッシュから ${allQuestions.length} 問を読み込みました`;
    renderSectionList();

    // 初回表示を高速化しつつ、裏側で更新
    fetchAndCacheQuestions(false).then(() => {
      renderSectionList();
    });
  } else {
    await fetchAndCacheQuestions(true);
    renderSectionList();
  }
}

async function fetchAndCacheQuestions(showLoading) {
  try {
    if (showLoading) {
      els.dataStatus.textContent = 'データを取得中...';
    }

    const url = `${GAS_API_URL}?t=${Date.now()}`;
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const json = await response.json();

    if (!json.success) {
      throw new Error(json.message || 'データ取得に失敗しました');
    }

    allQuestions = json.data || [];

    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(allQuestions));
    localStorage.setItem(STORAGE_KEYS.QUESTIONS_UPDATED_AT, json.updatedAt || new Date().toISOString());

    els.dataStatus.textContent = `${allQuestions.length} 問を読み込みました`;

  } catch (error) {
    console.error(error);

    const cached = loadCachedQuestions();

    if (cached.length > 0) {
      allQuestions = cached;
      els.dataStatus.textContent = `通信に失敗したため、キャッシュ ${cached.length} 問を使用します`;
    } else {
      els.dataStatus.textContent = 'データ取得に失敗しました。GAS URLや公開設定を確認してください。';
    }
  }
}

function loadCachedQuestions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.QUESTIONS) || '[]');
  } catch {
    return [];
  }
}

function renderSectionList() {
  groupedSections = groupByCategoryAndSection(allQuestions);

  els.sectionList.innerHTML = '';

  const categories = Object.keys(groupedSections);

  if (categories.length === 0) {
    els.sectionList.innerHTML = `
      <div class="status-card">
        <p>表示できるセクションがありません。</p>
      </div>
    `;
    return;
  }

  categories.forEach(category => {
    const categoryBlock = document.createElement('section');
    categoryBlock.className = 'category-block';

    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = category;

    const grid = document.createElement('div');
    grid.className = 'section-grid';

    groupedSections[category].forEach(sectionInfo => {
      const card = document.createElement('button');
      card.className = 'section-card';
      card.type = 'button';

      const progress = getProgress(sectionInfo.sectionKey);
      const total = sectionInfo.questions.length;
      const answeredCount = progress.answeredRowNumbers.length;
      const isCompleted = answeredCount >= total;
      const isResumable = answeredCount > 0 && !isCompleted;

      card.innerHTML = `
        <span class="section-year">${escapeHtml(sectionInfo.year)}</span>
        <span class="section-meta">
          ${total}問<br>
          ${isCompleted ? '完了済み・タップでリセット' : `${answeredCount}/${total} 問 回答済み`}
        </span>
        ${isResumable ? '<span class="resume-badge">続きから</span>' : ''}
      `;

      card.addEventListener('click', () => {
        startSection(sectionInfo.sectionKey);
      });

      grid.appendChild(card);
    });

    categoryBlock.appendChild(title);
    categoryBlock.appendChild(grid);
    els.sectionList.appendChild(categoryBlock);
  });
}

function groupByCategoryAndSection(questions) {
  const sectionMap = new Map();

  questions.forEach(q => {
    const section = q.section || '';
    const parsed = parseSection(section);

    if (!sectionMap.has(section)) {
      sectionMap.set(section, {
        sectionKey: section,
        category: parsed.category,
        year: parsed.year,
        questions: []
      });
    }

    sectionMap.get(section).questions.push(q);
  });

  const categoryMap = {};

  [...sectionMap.values()].forEach(sectionInfo => {
    if (!categoryMap[sectionInfo.category]) {
      categoryMap[sectionInfo.category] = [];
    }

    categoryMap[sectionInfo.category].push(sectionInfo);
  });

  return categoryMap;
}

function parseSection(section) {
  const parts = String(section).split('_');

  return {
    category: parts[0] || '未分類',
    year: parts.slice(1).join('_') || section
  };
}

function startSection(sectionKey) {
  currentSectionKey = sectionKey;
  currentSectionQuestions = allQuestions.filter(q => q.section === sectionKey);

  if (currentSectionQuestions.length === 0) {
    showToast('このセクションには問題がありません');
    return;
  }

  const progress = getProgress(sectionKey);

  // 全問完了済みならリセット
  if (progress.answeredRowNumbers.length >= currentSectionQuestions.length) {
    resetProgress(sectionKey);
  }

  switchPage('quiz');
  showNextQuestion();
}

function showNextQuestion() {
  answered = false;

  resetQuizUi();

  const progress = getProgress(currentSectionKey);
  const answeredSet = new Set(progress.answeredRowNumbers);

  const unanswered = currentSectionQuestions.filter(q => !answeredSet.has(q.rowNumber));

  if (unanswered.length === 0) {
    resetProgress(currentSectionKey);
    showToast('全問完了しました。進捗をリセットします。');
    showNextQuestion();
    return;
  }

  currentQuestion = pickRandom(unanswered);
  currentDisplayedType = Math.random() < 0.5 ? 'true' : 'false';

  const displayedText =
    currentDisplayedType === 'true'
      ? currentQuestion.question_true
      : currentQuestion.question_false;

  const parsed = parseSection(currentSectionKey);
  const currentIndex = progress.answeredRowNumbers.length + 1;
  const total = currentSectionQuestions.length;

  els.currentSection.textContent = `${parsed.category} ${parsed.year}`;
  els.progressText.textContent = `全${total}問中 ${currentIndex}問目`;

  els.questionText.innerHTML = markdownBoldToHtml(displayedText);
}

function answerQuestion(userAnswerIsTrue) {
  if (answered || !currentQuestion) return;

  answered = true;

  const correctAnswerIsTrue = currentDisplayedType === 'true';
  const isCorrect = userAnswerIsTrue === correctAnswerIsTrue;

  markAnswered(currentSectionKey, currentQuestion.rowNumber);

  updateAnswerButtons(userAnswerIsTrue);

  els.resultArea.classList.remove('hidden', 'correct', 'incorrect');
  els.resultArea.classList.add(isCorrect ? 'correct' : 'incorrect');
  els.resultLabel.textContent = isCorrect ? '正解' : '不正解';

  els.explanationText.innerHTML = markdownBoldToHtml(currentQuestion.explanation || '解説はありません。');

  els.afterActions.classList.remove('hidden');

  const progress = getProgress(currentSectionKey);
  const isLast = progress.answeredRowNumbers.length >= currentSectionQuestions.length;

  if (isLast) {
    els.nextButton.classList.add('hidden');
  } else {
    els.nextButton.classList.remove('hidden');
  }
}

function updateAnswerButtons(userAnswerIsTrue) {
  els.trueButton.disabled = true;
  els.falseButton.disabled = true;

  if (userAnswerIsTrue) {
    els.trueButton.classList.add('selected');
    els.falseButton.classList.add('dimmed');
  } else {
    els.falseButton.classList.add('selected');
    els.trueButton.classList.add('dimmed');
  }
}

function resetQuizUi() {
  els.resultArea.className = 'result-area hidden';
  els.resultLabel.textContent = '';
  els.explanationText.textContent = '';

  els.afterActions.classList.add('hidden');
  els.checkLaterButton.classList.remove('checked');
  els.checkLaterButton.textContent = '後で見る';

  els.nextButton.classList.remove('hidden');

  els.trueButton.disabled = false;
  els.falseButton.disabled = false;
  els.trueButton.classList.remove('selected', 'dimmed');
  els.falseButton.classList.remove('selected', 'dimmed');
}

function switchPage(pageName) {
  if (pageName === 'quiz') {
    els.sectionPage.classList.remove('active');
    els.quizPage.classList.add('active');
    els.answerDock.classList.remove('hidden');
    els.refreshButton.classList.add('hidden');
    els.appTitle.textContent = '問題';
  } else {
    els.quizPage.classList.remove('active');
    els.sectionPage.classList.add('active');
    els.answerDock.classList.add('hidden');
    els.refreshButton.classList.remove('hidden');
    els.appTitle.textContent = 'クイズ';
  }
}

function returnToSectionList() {
  flushPendingChecksAsync();
  currentSectionKey = null;
  currentSectionQuestions = [];
  currentQuestion = null;
  switchPage('sections');
  renderSectionList();
}

/**
 * 進捗管理
 */

function getAllProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.PROGRESS) || '{}');
  } catch {
    return {};
  }
}

function saveAllProgress(progress) {
  localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(progress));
}

function getProgress(sectionKey) {
  const allProgress = getAllProgress();

  if (!allProgress[sectionKey]) {
    allProgress[sectionKey] = {
      answeredRowNumbers: []
    };
  }

  return allProgress[sectionKey];
}

function markAnswered(sectionKey, rowNumber) {
  const allProgress = getAllProgress();

  if (!allProgress[sectionKey]) {
    allProgress[sectionKey] = {
      answeredRowNumbers: []
    };
  }

  if (!allProgress[sectionKey].answeredRowNumbers.includes(rowNumber)) {
    allProgress[sectionKey].answeredRowNumbers.push(rowNumber);
  }

  saveAllProgress(allProgress);
}

function resetProgress(sectionKey) {
  const allProgress = getAllProgress();
  allProgress[sectionKey] = {
    answeredRowNumbers: []
  };
  saveAllProgress(allProgress);
}

/**
 * 後で見る 一括送信
 */

function getPendingChecks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_CHECKS) || '[]');
  } catch {
    return [];
  }
}

function savePendingChecks(rows) {
  localStorage.setItem(STORAGE_KEYS.PENDING_CHECKS, JSON.stringify(rows));
}

function addPendingCheck(rowNumber) {
  const rows = getPendingChecks();

  if (!rows.includes(rowNumber)) {
    rows.push(rowNumber);
  }

  savePendingChecks(rows);
}

async function flushPendingChecksAsync() {
  const rows = getPendingChecks();

  if (rows.length === 0) return;

  // 先にローカルから消す。
  // 失敗した場合はcatchで戻す。
  savePendingChecks([]);

  try {
    await fetch(GAS_API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'bulkCheck',
        rows
      })
    });

    showToast('後で見るを同期しました');

  } catch (error) {
    console.error(error);

    const current = getPendingChecks();
    const restored = [...new Set([...current, ...rows])];
    savePendingChecks(restored);

    showToast('同期に失敗しました。次回再送します。');
  }
}

/**
 * Utilities
 */

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function markdownBoldToHtml(text) {
  const escaped = escapeHtml(String(text || ''));

  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 1800);
}