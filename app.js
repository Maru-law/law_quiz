// GASのウェブアプリURLをここに設定
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzzphVS89cQ3U9YAwQ8lRlbbXbPzrY-Khug0ebzXHLCs1UyUwQ1JEcvH9BXBnZG3k3MJw/exec';

let allQuestions = [];
let groupedSections = {};
let currentSectionData = [];
let currentQuestionIndex = 1;
let currentQuestion = null;
let isShowingTrue = true;
let totalSectionQuestions = 0;

const views = {
  loading: document.getElementById('loading-view'),
  list: document.getElementById('list-view'),
  quiz: document.getElementById('quiz-view')
};

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  try {
    const response = await fetch(GAS_API_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const text = await response.text();
    let fetchedData;

    try {
      fetchedData = JSON.parse(text);
    } catch (e) {
      console.error("受信したテキスト:", text);
      throw new Error("GASからの応答がJSON形式ではありません。HTMLやエラー画面が返却されています。");
    }

    if (typeof fetchedData === 'string') {
      try {
        fetchedData = JSON.parse(fetchedData);
      } catch (e) {
        throw new Error("データが純粋な文字列として返却されており、配列に変換できません。");
      }
    }

    if (fetchedData && typeof fetchedData === 'object' && !Array.isArray(fetchedData)) {
      if (Array.isArray(fetchedData.data)) {
        fetchedData = fetchedData.data;
      } else if (Array.isArray(fetchedData.items)) {
        fetchedData = fetchedData.items;
      } else {
        console.error("実際のデータ構造:", fetchedData);
        throw new Error("JSONデータは取得できましたが、配列ではありません。開発者ツール(F12)のConsoleを確認してください。");
      }
    }

    if (!Array.isArray(fetchedData)) {
      throw new Error("データを配列として認識できませんでした。");
    }

    allQuestions = fetchedData;
    processData(allQuestions);
    renderList();
    switchView('list');

  } catch (error) {
    console.error('Data fetch error:', error);
    const loadingView = document.getElementById('loading-view');
    loadingView.innerHTML = `
      <div style="padding: 20px; color: #F44336; line-height: 1.5; word-break: break-all;">
        <h3 style="margin-bottom: 12px;">データの読み込みエラー</h3>
        <p><strong>${error.message}</strong></p>
        <p style="margin-top: 12px; font-size: 0.9em; color: #333;">※URLの設定ミスか、GASのデプロイ設定が更新されていない可能性があります。</p>
      </div>
    `;
  }
}

function switchView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
}

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
      btn.textContent = year;
      btn.onclick = () => startQuiz(category, year, questions);
      grid.appendChild(btn);
    }
    groupDiv.appendChild(grid);
    container.appendChild(groupDiv);
  }
}

function startQuiz(category, year, questions) {
  let remainingQuestions = [...questions];
  
  // ランダムにシャッフル
  currentSectionData = remainingQuestions.sort(() => Math.random() - 0.5);
  totalSectionQuestions = questions.length;
  currentQuestionIndex = 1;

  document.getElementById('section-name-text').textContent = `${category}_${year}`;
  
  switchView('quiz');
  loadNextQuestion();
}

function parseMarkdown(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function loadNextQuestion() {
  if (currentSectionData.length === 0) {
    alert('このセクションの問題を全て解き終えました！');
    renderList();
    switchView('list');
    return;
  }

  currentQuestion = currentSectionData.pop();
  isShowingTrue = Math.random() >= 0.5;
  
  document.getElementById('q-num').textContent = currentQuestionIndex;
  document.getElementById('progress-text').textContent = `全${totalSectionQuestions}問中 ${currentQuestionIndex}問目`;
  
  const qText = isShowingTrue ? currentQuestion.question_true : currentQuestion.question_false;
  document.getElementById('question-text').innerHTML = parseMarkdown(qText);

  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('action-buttons').classList.add('hidden');
  
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  
  [btnO, btnX].forEach(btn => {
    btn.classList.remove('disabled', 'dimmed');
  });

  // 次の問題を読み込む際に、スクロールを一番上に戻す
  document.getElementById('quiz-scroll-area').scrollTop = 0;
}

document.getElementById('btn-true').onclick = () => handleAnswer(true);
document.getElementById('btn-false').onclick = () => handleAnswer(false);

function handleAnswer(userSelectedTrue) {
  const isCorrect = (isShowingTrue === userSelectedTrue);
  
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  btnO.classList.add('disabled');
  btnX.classList.add('disabled');
  
  if (userSelectedTrue) {
    btnX.classList.add('dimmed');
  } else {
    btnO.classList.add('dimmed');
  }

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

  const actionButtons = document.getElementById('action-buttons');
  const btnNext = document.getElementById('btn-next-question');
  actionButtons.classList.remove('hidden');
  
  if (currentSectionData.length === 0) {
    btnNext.style.display = 'none';
  } else {
    btnNext.style.display = 'block';
  }

  // 解答後、解説が見やすいように少し下へ自動スクロールする（QoL向上）
  setTimeout(() => {
    const scrollArea = document.getElementById('quiz-scroll-area');
    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior: 'smooth'
    });
  }, 100);
}

document.getElementById('btn-next-question').onclick = () => {
  currentQuestionIndex++;
  loadNextQuestion();
};

document.getElementById('btn-back-list').onclick = () => {
  renderList();
  switchView('list');
};