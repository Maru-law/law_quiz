const GAS_API_URL = 'https://script.google.com/macros/s/AKfycby83naVQhqg0SzzEmvMlB3JwmT75Z3nexLnZc8j1HE7g6L0Fv9BVfs7WXDoAFB0mc5Cow/exec';

const STORAGE_KEYS = {
  QUESTIONS: 'quiz_questions_cache_v1',
  QUESTIONS_UPDATED_AT: 'quiz_questions_updated_at_v1',
  PROGRESS: 'quiz_section_progress_v1',
  PENDING_CHECKS: 'quiz_pending_checks_v1'
};

let allQuestions = [];
let currentSectionKey = null;
let currentSectionQuestions = [];
let currentQuestion = null;
let currentDisplayedType = null;
let answered = false;

const $ = (id) => document.getElementById(id);

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
  bindElements();
  bindEvents();
  await initializeApp();
});

function bindElements() {
  els.appTitle = $('app-title');
  els.refreshButton = $('refresh-button');
  els.sectionPage = $('section-page');
  els.quizPage = $('quiz-page');
  els.sectionList = $('section-list');
  els.dataStatus = $('data-status');
  els.categoryText = $('category-text');
  els.questionNumber = $('question-number');
  els.questionText = $('question-text');
  els.resultCard = $('result-card');
  els.resultText = $('result-text');
  els.explanationText = $('explanation-text');
  els.answerButtons = $('answer-buttons');
  els.btnTrue = $('btn-true');
  els.btnFalse = $('btn-false');
  els.navButtons = $('nav-buttons');
  els.checkLaterBtn = $('check-later-btn');
  els.nextQuestionBtn = $('next-question-btn');
  els.backToListBtn = $('back-to-list-btn');
  els.toast = $('toast');
}

function bindEvents() {
  els.refreshButton.addEventListener('click', async () => {
    await fetchAndCacheQuestions(true);
    renderSectionList();
  });

  els.btnTrue.addEventListener('click', () => handleAnswer(true));
  els.btnFalse.addEventListener('click', () => handleAnswer(false));
  els.nextQuestionBtn.addEventListener('click', loadNextQuestion);
  els.backToListBtn.addEventListener('click', backToList);

  els.checkLaterBtn.addEventListener('click', () => {
    if (!currentQuestion) return;
    addPendingCheck(currentQuestion.rowNumber);
    els.checkLaterBtn.classList.add('checked');
    els.checkLaterBtn.textContent = '後で見るに追加済み';
    showToast('後で見るに追加しました');
  });
}

async function initializeApp() {
  const cached = loadCachedQuestions();
  if (cached.length > 0) {
    allQuestions = cached;
    els.dataStatus.textContent = `キャッシュから ${allQuestions.length} 問を読み込みました`;
    renderSectionList();
    fetchAndCacheQuestions(false).then(renderSectionList);
    return;
  }

  await fetchAndCacheQuestions(true);
  renderSectionList();
}

async function fetchAndCacheQuestions(showLoading) {
  try {
    if (showLoading) els.dataStatus.textContent = 'データを取得中...';

    const res = await fetch(`${GAS_API_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'データ取得に失敗しました');

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
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.QUESTIONS) || '[]'); }
  catch { return []; }
}

function renderSectionList() {
  els.sectionList.innerHTML = '';
  const grouped = groupSections(allQuestions);
  const categories = Object.keys(grouped);

  if (categories.length === 0) {
    els.sectionList.innerHTML = '<div class="card"><p>表示できるセクションがありません。</p></div>';
    return;
  }

  for (const category of categories) {
    const header = document.createElement('h2');
    header.className = 'category-header';
    header.textContent = category;
    els.sectionList.appendChild(header);

    grouped[category].forEach(section => {
      const progress = getProgress(section.sectionKey);
      const total = section.questions.length;
      const answeredCount = progress.answeredRowNumbers.length;
      const completed = answeredCount >= total;
      const resumable = answeredCount > 0 && !completed;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'section-card';
      btn.innerHTML = `
        <span class="section-title">${escapeHtml(section.year)}</span>
        <span class="section-meta">${total}問 / ${completed ? '完了済み・タップでリセット' : `${answeredCount}/${total} 問 回答済み`}</span>
        ${resumable ? '<span class="resume-badge">続きから</span>' : ''}
      `;
      btn.addEventListener('click', () => startSection(section.sectionKey));
      els.sectionList.appendChild(btn);
    });
  }
}

function groupSections(questions) {
  const sectionMap = new Map();
  questions.forEach(q => {
    const parsed = parseSection(q.section || '未分類');
    if (!sectionMap.has(q.section)) {
      sectionMap.set(q.section, { sectionKey: q.section, category: parsed.category, year: parsed.year, questions: [] });
    }
    sectionMap.get(q.section).questions.push(q);
  });

  const grouped = {};
  [...sectionMap.values()].forEach(section => {
    if (!grouped[section.category]) grouped[section.category] = [];
    grouped[section.category].push(section);
  });
  return grouped;
}

function parseSection(section) {
  const parts = String(section).split('_');
  return { category: parts[0] || '未分類', year: parts.slice(1).join('_') || section };
}

function startSection(sectionKey) {
  currentSectionKey = sectionKey;
  currentSectionQuestions = allQuestions.filter(q => q.section === sectionKey);

  if (currentSectionQuestions.length === 0) return showToast('このセクションには問題がありません');

  const progress = getProgress(sectionKey);
  if (progress.answeredRowNumbers.length >= currentSectionQuestions.length) resetProgress(sectionKey);

  switchPage('quiz');
  loadNextQuestion();
}

function loadNextQuestion() {
  resetState();

  const progress = getProgress(currentSectionKey);
  const answeredSet = new Set(progress.answeredRowNumbers);
  const unanswered = currentSectionQuestions.filter(q => !answeredSet.has(q.rowNumber));

  if (unanswered.length === 0) {
    resetProgress(currentSectionKey);
    showToast('全問完了しました。進捗をリセットしました。');
    return backToList();
  }

  currentQuestion = unanswered[Math.floor(Math.random() * unanswered.length)];
  currentDisplayedType = Math.random() < 0.5 ? 'true' : 'false';
  answered = false;

  const parsed = parseSection(currentSectionKey);
  const currentNo = progress.answeredRowNumbers.length + 1;
  const total = currentSectionQuestions.length;

  els.categoryText.textContent = `${parsed.category} ${parsed.year}`;
  els.questionNumber.textContent = `全${total}問中 ${currentNo}問目`;
  els.questionText.innerHTML = markdownToHtml(
    currentDisplayedType === 'true' ? currentQuestion.question_true : currentQuestion.question_false
  );
}

function handleAnswer(userAnswer) {
  if (answered || !currentQuestion) return;
  answered = true;

  markAnswered(currentSectionKey, currentQuestion.rowNumber);

  const correctAnswer = currentDisplayedType === 'true';
  const isCorrect = userAnswer === correctAnswer;

  els.resultCard.classList.remove('correct', 'incorrect');
  els.resultText.classList.remove('correct', 'incorrect');

  if (isCorrect) {
    els.resultText.textContent = '正解！';
    els.resultText.classList.add('correct');
    els.resultCard.classList.add('correct');
  } else {
    els.resultText.textContent = '間違い';
    els.resultText.classList.add('incorrect');
    els.resultCard.classList.add('incorrect');
  }

  els.explanationText.innerHTML = markdownToHtml(currentQuestion.explanation || '解説はありません。');
  els.resultCard.style.display = 'block';

  els.btnTrue.disabled = true;
  els.btnFalse.disabled = true;
  (userAnswer ? els.btnTrue : els.btnFalse).classList.add('selected');
  (userAnswer ? els.btnFalse : els.btnTrue).classList.add('disabled');

  els.navButtons.style.display = 'flex';

  const progress = getProgress(currentSectionKey);
  const isLast = progress.answeredRowNumbers.length >= currentSectionQuestions.length;
  els.nextQuestionBtn.style.display = isLast ? 'none' : 'block';
}

function resetState() {
  els.resultCard.style.display = 'none';
  els.navButtons.style.display = 'none';
  els.checkLaterBtn.classList.remove('checked');
  els.checkLaterBtn.textContent = '後で見る';

  els.btnTrue.disabled = false;
  els.btnFalse.disabled = false;
  els.btnTrue.classList.remove('disabled', 'selected');
  els.btnFalse.classList.remove('disabled', 'selected');
}

function switchPage(page) {
  if (page === 'quiz') {
    els.sectionPage.classList.remove('active');
    els.quizPage.classList.add('active');
    els.refreshButton.classList.add('hidden');
    els.appTitle.textContent = '問題';
  } else {
    els.quizPage.classList.remove('active');
    els.sectionPage.classList.add('active');
    els.refreshButton.classList.remove('hidden');
    els.appTitle.textContent = '問題一覧';
  }
}

function backToList() {
  flushPendingChecksAsync();
  currentSectionKey = null;
  currentSectionQuestions = [];
  currentQuestion = null;
  switchPage('list');
  renderSectionList();
}

function getAllProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PROGRESS) || '{}'); }
  catch { return {}; }
}

function saveAllProgress(progress) {
  localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(progress));
}

function getProgress(sectionKey) {
  const progress = getAllProgress();
  if (!progress[sectionKey]) progress[sectionKey] = { answeredRowNumbers: [] };
  return progress[sectionKey];
}

function markAnswered(sectionKey, rowNumber) {
  const progress = getAllProgress();
  if (!progress[sectionKey]) progress[sectionKey] = { answeredRowNumbers: [] };
  if (!progress[sectionKey].answeredRowNumbers.includes(rowNumber)) progress[sectionKey].answeredRowNumbers.push(rowNumber);
  saveAllProgress(progress);
}

function resetProgress(sectionKey) {
  const progress = getAllProgress();
  progress[sectionKey] = { answeredRowNumbers: [] };
  saveAllProgress(progress);
}

function getPendingChecks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_CHECKS) || '[]'); }
  catch { return []; }
}

function savePendingChecks(rows) {
  localStorage.setItem(STORAGE_KEYS.PENDING_CHECKS, JSON.stringify(rows));
}

function addPendingCheck(rowNumber) {
  const rows = getPendingChecks();
  if (!rows.includes(rowNumber)) rows.push(rowNumber);
  savePendingChecks(rows);
}

async function flushPendingChecksAsync() {
  const rows = getPendingChecks();
  if (rows.length === 0) return;

  savePendingChecks([]);

  try {
    await fetch(GAS_API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'bulkCheck', rows })
    });
    showToast('後で見るを同期しました');
  } catch (error) {
    console.error(error);
    savePendingChecks([...new Set([...getPendingChecks(), ...rows])]);
    showToast('同期に失敗しました。次回再送します。');
  }
}

function markdownToHtml(text) {
  if (!text) return '';
  const escaped = escapeHtml(String(text));
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
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
  els.toast.style.display = 'block';
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { els.toast.style.display = 'none'; }, 1800);
}
