// GASのWebアプリURL（※デプロイ後に取得したURLに書き換えてください）
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycby83naVQhqg0SzzEmvMlB3JwmT75Z3nexLnZc8j1HE7g6L0Fv9BVfs7WXDoAFB0mc5Cow/exec';
const STORAGE_KEY = 'law_quiz_progress_v1';

let allQuestions = [];
let groupedSections = {}; // { "民法": { "R01": [Q1, Q2...], "R02": [...] } }
let currentSectionData = [];
let currentQuestionIndex = 0;
let currentQuestion = null;
let isShowingTrue = true; 
let completedIds = []; 
let totalSectionQuestions = 0;

// DOM Elements
const views = {
  loading: document.getElementById('loading-view'),
  list: document.getElementById('list-view'),
  quiz: document.getElementById('quiz-view')
};

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  try {
    const response = await fetch(GAS_API_URL);
    allQuestions = await response.json();
    processData(allQuestions);
    loadProgress();
    renderList();
    switchView('list');
  } catch (error) {
    console.error('Data fetch error:', error);
    alert('データの取得に失敗しました。リロードしてください。');
  }
}

function switchView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
  window.scrollTo(0, 0);
}

// データのグルーピング (A列 "カテゴリ_年度" を分割)
function processData(data) {
  groupedSections = {};
  data.forEach(q => {
    if (!q.section) return;
    const parts = q.section.split('_');
    const category = parts[0];
    const year = parts[1] || 'その他';

    if (!groupedSections[category]) groupedSections[category] = {};
    if (!groupedSections[category][year]) groupedSections[category][year] = [];
    
    groupedSections[category][year].push(q);
  });
}

function loadProgress() {
  const saved = localStorage.getItem(STORAGE_KEY);
  completedIds = saved ? JSON.parse(saved) : [];
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(completedIds));
}

function renderList() {
  const container = document.getElementById('category-container');
  container.innerHTML = '';

  for (const [category, yearsObj] of Object.entries(groupedSections)) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'category-group';
    
    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = category;
    groupDiv.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'year-grid';

    for (const [year, questions] of Object.entries(yearsObj)) {
      const btn = document.createElement('button');
      btn.className = 'year-btn';
      
      // そのセクションの問題が全て完了しているかチェック
      const isAllCompleted = questions.every(q => completedIds.includes(q.id));
      if (isAllCompleted) btn.classList.add('completed');

      btn.textContent = year;
      btn.onclick = () => startQuiz(category, year, questions);
      grid.appendChild(btn);
    }
    groupDiv.appendChild(grid);
    container.appendChild(groupDiv);
  }
}

function startQuiz(category, year, questions) {
  // 未回答の問題を抽出
  let remainingQuestions = questions.filter(q => !completedIds.includes(q.id));
  
  // 全て回答済みの場合はリセットして全問対象にする
  if (remainingQuestions.length === 0) {
    const idsToReset = questions.map(q => q.id);
    completedIds = completedIds.filter(id => !idsToReset.includes(id));
    saveProgress();
    remainingQuestions = [...questions];
    renderList(); // 一覧画面の取り消し線状態を更新
  }

  // ランダムにシャッフル
  currentSectionData = remainingQuestions.sort(() => Math.random() - 0.5);
  totalSectionQuestions = questions.length;
  currentQuestionIndex = questions.length - currentSectionData.length + 1;

  document.getElementById('section-name-text').textContent = `${category}_${year}`;
  
  switchView('quiz');
  loadNextQuestion();
}

// Markdownの太字(**text**)を変換する関数
function parseMarkdown(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function loadNextQuestion() {
  if (currentSectionData.length === 0) {
    alert('このセクションの問題を全て解き終えました！');
    renderList();
    switchView('list');
    return;
  }

  // 初期化・UIリセット
  currentQuestion = currentSectionData.pop();
  isShowingTrue = Math.random() >= 0.5; // 50%の確率
  
  document.getElementById('q-num').textContent = currentQuestionIndex;
  document.getElementById('progress-text').textContent = `全${totalSectionQuestions}問中 ${currentQuestionIndex}問目`;
  
  // 問題文セット
  const qText = isShowingTrue ? currentQuestion.question_true : currentQuestion.question_false;
  document.getElementById('question-text').innerHTML = parseMarkdown(qText);

  // UI状態の復元
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('action-buttons').classList.add('hidden');
  
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  
  [btnO, btnX].forEach(btn => {
    btn.classList.remove('disabled', 'dimmed');
  });
}

// 解答ボタンのイベントリスナー
document.getElementById('btn-true').onclick = () => handleAnswer(true);
document.getElementById('btn-false').onclick = () => handleAnswer(false);

function handleAnswer(userSelectedTrue) {
  // 正誤判定：正しい文章が表示されていて「〇」を選んだ、または間違った文章で「×」を選んだ場合
  const isCorrect = (isShowingTrue === userSelectedTrue);
  
  // 進捗保存
  if (!completedIds.includes(currentQuestion.id)) {
    completedIds.push(currentQuestion.id);
    saveProgress();
  }

  // ボタンの視覚的フィードバック（選ばなかった方をグレーアウト）
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  btnO.classList.add('disabled');
  btnX.classList.add('disabled');
  
  if (userSelectedTrue) {
    btnX.classList.add('dimmed');
  } else {
    btnO.classList.add('dimmed');
  }

  // 結果カードの表示
  const resultCard = document.getElementById('result-card');
  const resultTitle = document.getElementById('result-title');
  const expText = document.getElementById('explanation-text');

  resultCard.classList.remove('hidden', 'correct', 'incorrect');
  if (isCorrect) {
    resultCard.classList.add('correct');
    resultTitle.textContent = '正解';
  } else {
    resultCard.classList.add('incorrect');
    resultTitle.textContent = '間違い';
  }
  
  expText.innerHTML = parseMarkdown(currentQuestion.explanation);

  // アクションボタンの表示制御
  const actionButtons = document.getElementById('action-buttons');
  const btnNext = document.getElementById('btn-next-question');
  actionButtons.classList.remove('hidden');
  
  if (currentSectionData.length === 0) {
    btnNext.style.display = 'none'; // 最終問題の場合は非表示
  } else {
    btnNext.style.display = 'block';
  }
}

// アクションボタンの挙動
document.getElementById('btn-next-question').onclick = () => {
  currentQuestionIndex++;
  loadNextQuestion();
};

document.getElementById('btn-back-list').onclick = () => {
  renderList();
  switchView('list');
};