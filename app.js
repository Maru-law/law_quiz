const API_URL = "https://script.google.com/macros/s/AKfycby83naVQhqg0SzzEmvMlB3JwmT75Z3nexLnZc8j1HE7g6L0Fv9BVfs7WXDoAFB0mc5Cow/exec";

let allData = [];
let currentSection = null;
let currentPool = [];
let answered = {};
let laterList = [];

const app = document.getElementById("app");

// Markdown太字変換
function parseMarkdown(text) {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

// 初期ロード（キャッシュ）
async function loadData() {
  const cache = localStorage.getItem("quizData");

  if (cache) {
    allData = JSON.parse(cache);
  } else {
    const res = await fetch(API_URL);
    allData = await res.json();
    localStorage.setItem("quizData", JSON.stringify(allData));
  }
}

// セクション一覧
function renderSections() {
  app.innerHTML = `<div class="container"></div>`;
  const container = app.firstChild;

  const grouped = {};
  allData.forEach(q => {
    if (!grouped[q.category]) grouped[q.category] = [];
    grouped[q.category].push(q);
  });

  Object.keys(grouped).forEach(cat => {
    const div = document.createElement("div");
    div.innerHTML = `<div class="section-title">${cat}</div>`;
    container.appendChild(div);

    const years = [...new Set(grouped[cat].map(q => q.year))];

    years.forEach(year => {
      const card = document.createElement("div");
      card.className = "card";
      card.textContent = year;

      card.onclick = () => startQuiz(cat, year);

      container.appendChild(card);
    });
  });
}

// クイズ開始
function startQuiz(cat, year) {
  currentSection = `${cat}_${year}`;

  const sectionData = allData.filter(q => q.section === currentSection);

  const progressKey = `progress_${currentSection}`;
  answered = JSON.parse(localStorage.getItem(progressKey) || "{}");

  const remaining = sectionData.filter(q => !answered[q.rowIndex]);

  if (remaining.length === 0) {
    localStorage.removeItem(progressKey);
    answered = {};
    currentPool = [...sectionData];
  } else {
    currentPool = remaining;
  }

  nextQuestion();
}

// ランダム問題
function nextQuestion() {
  if (currentPool.length === 0) {
    renderSections();
    return;
  }

  const index = Math.floor(Math.random() * currentPool.length);
  const q = currentPool.splice(index, 1)[0];

  const isTrue = Math.random() > 0.5;
  const text = isTrue ? q.question_true : q.question_false;

  renderQuestion(q, isTrue, text);
}

// 問題表示
function renderQuestion(q, isTrue, text) {
  app.innerHTML = `
    <div class="container">
      <div class="header">
        <div>${q.section}</div>
        <input type="checkbox" id="laterCheck">
      </div>

      <div class="card question">${parseMarkdown(text)}</div>

      <div id="result"></div>
    </div>

    <div class="buttons">
      <button class="btn btn-o" onclick="answer(true)">〇</button>
      <button class="btn btn-x" onclick="answer(false)">×</button>
    </div>
  `;

  window.currentQ = q;
  window.currentIsTrue = isTrue;
}

// 回答
function answer(userChoice) {
  const correct = (window.currentIsTrue && userChoice) ||
                  (!window.currentIsTrue && !userChoice);

  const resultDiv = document.getElementById("result");

  resultDiv.className = `card result ${correct ? "correct" : "wrong"}`;
  resultDiv.innerHTML = `
    <h2>${correct ? "正解" : "不正解"}</h2>
    <p>${parseMarkdown(window.currentQ.explanation)}</p>
    <button onclick="nextAction()">次へ</button>
    <button onclick="back()">一覧</button>
  `;

  const progressKey = `progress_${currentSection}`;
  answered[window.currentQ.rowIndex] = true;
  localStorage.setItem(progressKey, JSON.stringify(answered));

  if (document.getElementById("laterCheck").checked) {
    laterList.push(window.currentQ.rowIndex);
  }
}

// 次へ
function nextAction() {
  nextQuestion();
}

// 一覧へ戻る（バッチ送信）
function back() {
  if (laterList.length > 0) {
    fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ rows: laterList })
    });
    laterList = [];
  }
  renderSections();
}

// 起動
(async () => {
  await loadData();
  renderSections();
})();
