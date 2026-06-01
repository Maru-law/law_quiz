// GASのWebアプリURLをここに設定してください
const GAS_URL = 'https://script.google.com/macros/s/AKfycby83naVQhqg0SzzEmvMlB3JwmT75Z3nexLnZc8j1HE7g6L0Fv9BVfs7WXDoAFB0mc5Cow/exec';

// 状態管理
let allData = [];
let currentSectionData = [];
let progressData = {}; 
let checkUpdates = {}; // { rowNumber: boolean }

// DOM要素
const views = {
  loading: document.getElementById('loading-view'),
  list: document.getElementById('list-view'),
  quiz: document.getElementById('quiz-view')
};

// クイズ用DOM
const qNumberDisplay = document.getElementById('question-number-display');
const progressText = document.getElementById('progress-text');
const qText = document.getElementById('question-text');
const expCard = document.getElementById('explanation-card');
const resTitle = document.getElementById('result-title');
const expText = document.getElementById('explanation-text');
const ansButtons = document.getElementById('answer-buttons');
const nextButtons = document.getElementById('next-buttons');
const btnMaru = document.getElementById('btn-maru');
const btnBatsu = document.getElementById('btn-batsu');
const btnNext = document.getElementById('btn-next');
const btnBackList = document.getElementById('btn-back-list');
const checkCheckbox = document.getElementById('check-later-checkbox');
const headerSectionName = document.getElementById('header-section-name');

// 現在の問題ステータス
let currentQuestion = null;
let currentIsTrue = true;
let currentSectionName = '';

// 初期化
async function init() {
  loadProgress();
  const cachedData = localStorage.getItem('quiz_data');
  
  if (cachedData) {
    allData = JSON.parse(cachedData);
    renderList();
  } else {
    await fetchAndCacheData();
  }
}

// データの取得とキャッシュ
async function fetchAndCacheData() {
  switchView('loading');
  try {
    const res = await fetch(GAS_URL);
    allData = await res.json();
    localStorage.setItem('quiz_data', JSON.stringify(allData));
    renderList();
  } catch (error) {
    alert('データの取得に失敗しました。ネットワークを確認してください。');
  }
}

document.getElementById('force-sync-btn').addEventListener('click', fetchAndCacheData);

// Markdown風太字のパース
function parseMarkdown(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

// セクション名の分割 (例: "民法R01" -> カテゴリ"民法", 年度"R01")
// 末尾のアンダースコア＋英数字、または英数字を年度とみなす
function splitSectionName(sectionStr) {
  const match = sectionStr.match(/^(.*?)(_?[a-zA-Z0-9]+)$/);
  if (match) return { category: match[1], year: match[2].replace('_', '') };
  return { category: "その他", year: sectionStr };
}

// 一覧画面のレンダリング
function renderList() {
  const container = document.getElementById('category-container');
  container.innerHTML = '';
  
  // カテゴリごとにグループ化
  const grouped = {};
  allData.forEach(item => {
    const { category, year } = splitSectionName(item.section);
    if (!grouped[category]) grouped[category] = new Set();
    grouped[category].add({ name: item.section, year: year });
  });

  for (const [category, sections] of Object.entries(grouped)) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'category-group';
    
    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = category;
    groupDiv.appendChild(title);
    
    const grid = document.createElement('div');
    grid.className = 'section-grid';
    
    Array.from(sections).forEach(sec => {
      const item = document.createElement('div');
      item.className = 'section-item';
      
      // 進捗状況に応じて色を変える等の拡張も可能
      item.textContent = sec.year;
      item.addEventListener('click', () => startQuiz(sec.name));
      grid.appendChild(item);
    });
    
    groupDiv.appendChild(grid);
    container.appendChild(groupDiv);
  }
  switchView('list');
}

// クイズの開始
function startQuiz(sectionName) {
  currentSectionName = sectionName;
  headerSectionName.textContent = sectionName;
  
  // セクションに属する問題を抽出
  const sectionQuestions = allData.filter(q => q.section === sectionName);
  const total = sectionQuestions.length;
  
  // レジューム処理（未回答の行番号リストを取得）
  let remainingRows = progressData[sectionName] || [];
  
  // 初回、または全て解き終わっている場合はリセット
  if (remainingRows.length === 0) {
    remainingRows = sectionQuestions.map(q => q.row);
  }
  
  // シャッフル
  remainingRows.sort(() => Math.random() - 0.5);
  progressData[sectionName] = remainingRows;
  saveProgress();
  
  currentSectionData = sectionQuestions; // 全体数はUI表示に必要
  nextQuestion();
  switchView('quiz');
}

function nextQuestion() {
  resetUI();
  
  const remainingRows = progressData[currentSectionName];
  const total = currentSectionData.length;
  const currentNum = total - remainingRows.length + 1;
  
  if (remainingRows.length === 0) {
    // 全問終了のフェイルセーフ（通常はボタンで制御）
    backToList();
    return;
  }
  
  // 次の問題をPop
  const targetRow = remainingRows.pop();
  currentQuestion = allData.find(q => q.row === targetRow);
  
  // UI更新
  qNumberDisplay.textContent = `問題 ${currentNum}`;
  progressText.textContent = `${currentNum} / ${total}問`;
  
  // 真偽をランダムに決定 (50%)
  currentIsTrue = Math.random() >= 0.5;
  qText.textContent = currentIsTrue ? currentQuestion.question_true : currentQuestion.question_false;
  
  // チェックボックスの状態復元（未送信の変更があればそれを優先）
  if (checkUpdates.hasOwnProperty(currentQuestion.row)) {
    checkCheckbox.checked = checkUpdates[currentQuestion.row];
  } else {
    checkCheckbox.checked = currentQuestion.check;
  }
}

// 解答ボタンの処理
btnMaru.addEventListener('click', () => handleAnswer('O'));
btnBatsu.addEventListener('click', () => handleAnswer('X'));

function handleAnswer(selectedStr) {
  // 正解判定
  const isCorrect = (selectedStr === 'O' && currentIsTrue) || (selectedStr === 'X' && !currentIsTrue);
  
  // UIの更新
  ansButtons.classList.add('hidden');
  nextButtons.classList.remove('hidden');
  expCard.classList.remove('hidden');
  
  if (isCorrect) {
    expCard.className = 'card explanation-card success';
    resTitle.textContent = '正解';
  } else {
    expCard.className = 'card explanation-card danger';
    resTitle.textContent = '間違い';
  }
  
  expText.innerHTML = parseMarkdown(currentQuestion.explanation);
  
  // 最終問題の場合は「次の問題へ」を非表示
  if (progressData[currentSectionName].length === 0) {
    btnNext.classList.add('hidden');
  } else {
    btnNext.classList.remove('hidden');
  }
  
  saveProgress();
}

// チェックボックスの変更を記録
checkCheckbox.addEventListener('change', (e) => {
  if (currentQuestion) {
    const isChecked = e.target.checked;
    currentQuestion.check = isChecked; // キャッシュ更新
    checkUpdates[currentQuestion.row] = isChecked; // 送信用キューに追加
    localStorage.setItem('quiz_data', JSON.stringify(allData));
  }
});

btnNext.addEventListener('click', nextQuestion);
btnBackList.addEventListener('click', backToList);

// 一覧へ戻る & バッチ処理
function backToList() {
  saveProgress();
  
  // 変更があれば非同期でGASへ送信
  const updatesArray = Object.keys(checkUpdates).map(rowStr => ({
    row: parseInt(rowStr),
    check: checkUpdates[rowStr]
  }));
  
  if (updatesArray.length > 0) {
    fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // CORS回避用
      body: JSON.stringify({ updates: updatesArray })
    }).catch(e => console.error('送信エラー', e));
    
    // 送信キューをクリア
    checkUpdates = {};
  }
  
  renderList();
}

function resetUI() {
  expCard.classList.add('hidden');
  ansButtons.classList.remove('hidden');
  nextButtons.classList.add('hidden');
  checkCheckbox.checked = false;
  expText.innerHTML = '';
}

function switchView(viewId) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewId].classList.add('active');
}

function saveProgress() {
  localStorage.setItem('quiz_progress', JSON.stringify(progressData));
}

function loadProgress() {
  const data = localStorage.getItem('quiz_progress');
  if (data) progressData = JSON.parse(data);
}

// 起動
init();