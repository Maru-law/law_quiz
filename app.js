// ====== 設定 ======
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby83naVQhqg0SzzEmvMlB3JwmT75Z3nexLnZc8j1HE7g6L0Fv9BVfs7WXDoAFB0mc5Cow/exec";

// ====== 状態管理 ======
let allQuestions = [];
let progressData = {}; // { "民法_R01": [id1, id2...], ... }
let currentSectionKey = "";
let currentSectionQuestions = [];
let remainingQuestions = [];
let currentQuestion = null;
let currentIsQuestionTrue = true; // 現在の問題がTrue用かFalse用か

// ====== DOM要素 ======
const screens = {
  loading: document.getElementById('loading-screen'),
  list: document.getElementById('list-screen'),
  quiz: document.getElementById('quiz-screen')
};

// 初期化
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  loadProgress();
  
  // キャッシュの確認
  const cachedData = localStorage.getItem('quizData');
  if (cachedData) {
    allQuestions = JSON.parse(cachedData);
    renderListScreen();
  } else {
    await fetchFromGAS();
  }
}

async function fetchFromGAS() {
  try {
    const response = await fetch(GAS_WEB_APP_URL);
    const data = await response.json();
    allQuestions = data;
    localStorage.setItem('quizData', JSON.stringify(data));
    renderListScreen();
  } catch (error) {
    alert("データの取得に失敗しました。通信環境を確認してください。");
  }
}

function loadProgress() {
  const saved = localStorage.getItem('quizProgress');
  if (saved) progressData = JSON.parse(saved);
}

function saveProgress() {
  localStorage.setItem('quizProgress', JSON.stringify(progressData));
}

function switchScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenName].classList.add('active');
}

// ====== 一覧画面ロジック ======
function renderListScreen() {
  const container = document.getElementById('category-container');
  container.innerHTML = '';
  
  // カテゴリごとにグループ化
  const grouped = {};
  allQuestions.forEach(q => {
    const parts = q.section.split('_');
    const category = parts[0] || 'その他';
    const year = parts.slice(1).join('_') || '共通';
    
    if (!grouped[category]) grouped[category] = {};
    if (!grouped[category][year]) grouped[category][year] = { count: 0, ids: [] };
    
    grouped[category][year].count++;
    grouped[category][year].ids.push(q.id);
  });

  for (const [category, years]] of Object.entries(grouped)) {
    const block = document.createElement('div');
    block.className = 'category-block';
    
    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = category;
    block.appendChild(title);
    
    const grid = document.createElement('div');
    grid.className = 'year-grid';
    
    for (const [year, info] of Object.entries(years)) {
      const sectionKey = `${category}_${year}`;
      const completedIds = progressData[sectionKey] || [];
      const isCompleted = completedIds.length >= info.count;

      const btn = document.createElement('div');
      btn.className = `year-btn ${isCompleted ? 'completed' : ''}`;
      btn.textContent = year;
      btn.onclick = () => startSection(sectionKey);
      grid.appendChild(btn);
    }
    block.appendChild(grid);
    container.appendChild(block);
  }
  switchScreen('list');
}

// ====== クイズ画面ロジック ======
function startSection(sectionKey) {
  currentSectionKey = sectionKey;
  currentSectionQuestions = allQuestions.filter(q => q.section === sectionKey);
  
  const completedIds = progressData[sectionKey] || [];
  remainingQuestions = currentSectionQuestions.filter(q => !completedIds.includes(q.id));
  
  // 全て解き終わっていたらリセット
  if (remainingQuestions.length === 0) {
    progressData[sectionKey] = [];
    saveProgress();
    remainingQuestions = [...currentSectionQuestions];
    renderListScreen(); // UIの完了色をリセットするため
  }

  switchScreen('quiz');
  document.getElementById('header-section-name').textContent = sectionKey;
  nextQuestion();
}

function nextQuestion() {
  // UIリセット
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('nav-buttons').classList.add('hidden');
  const btnTrue = document.getElementById('btn-true');
  const btnFalse = document.getElementById('btn-false');
  btnTrue.classList.remove('disabled-look', 'selected');
  btnFalse.classList.remove('disabled-look', 'selected');
  btnTrue.onclick = () => handleAnswer(true);
  btnFalse.onclick = () => handleAnswer(false);

  // 問題選定
  const randomIndex = Math.floor(Math.random() * remainingQuestions.length);
  currentQuestion = remainingQuestions[randomIndex];
  currentIsQuestionTrue = Math.random() < 0.5;

  // 画面更新
  const total = currentSectionQuestions.length;
  const currentNum = total - remainingQuestions.length + 1;
  document.getElementById('question-number').textContent = `問題 ${currentNum}`;
  
  const qText = currentIsQuestionTrue ? currentQuestion.question_true : currentQuestion.question_false;
  document.getElementById('question-text').innerHTML = parseMarkdown(qText);
}

function handleAnswer(userChoseTrue) {
  // ボタンの見た目更新
  const btnTrue = document.getElementById('btn-true');
  const btnFalse = document.getElementById('btn-false');
  btnTrue.onclick = null;
  btnFalse.onclick = null;

  if (userChoseTrue) {
    btnTrue.classList.add('selected');
    btnFalse.classList.add('disabled-look');
  } else {
    btnFalse.classList.add('selected');
    btnTrue.classList.add('disabled-look');
  }

  // 正誤判定
  const isCorrect = userChoseTrue === currentIsQuestionTrue;

  // 結果表示
  const resultCard = document.getElementById('result-card');
  const resultTitle = document.getElementById('result-title');
  const resultText = document.getElementById('result-text');
  
  resultCard.classList.remove('hidden', 'success', 'error');
  resultCard.classList.add(isCorrect ? 'success' : 'error');
  resultTitle.textContent = isCorrect ? '正解' : '間違い';
  resultText.innerHTML = parseMarkdown(currentQuestion.explanation);

  // 進捗保存
  if (!progressData[currentSectionKey]) progressData[currentSectionKey] = [];
  progressData[currentSectionKey].push(currentQuestion.id);
  saveProgress();

  // 残り問題の更新
  remainingQuestions = remainingQuestions.filter(q => q.id !== currentQuestion.id);

  // ナビゲーションボタン制御
  document.getElementById('nav-buttons').classList.remove('hidden');
  const btnNext = document.getElementById('btn-next');
  if (remainingQuestions.length === 0) {
    btnNext.style.display = 'none'; // 最終問題なら「次へ」を消す
  } else {
    btnNext.style.display = 'block';
  }
}

// ボタンイベント設定
document.getElementById('btn-next').addEventListener('click', nextQuestion);
document.getElementById('btn-back-list').addEventListener('click', () => {
  renderListScreen();
});

// Markdown風太字対応 (**text** -> <strong>text</strong>)
function parseMarkdown(text) {
  if (!text) return "";
  // サニタイズ（簡易）
  let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}