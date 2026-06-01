const GAS_URL = "https://script.google.com/macros/s/AKfycby83naVQhqg0SzzEmvMlB3JwmT75Z3nexLnZc8j1HE7g6L0Fv9BVfs7WXDoAFB0mc5Cow/exec";

let allData = [];
let currentSection = "";
let sectionData = [];
let currentIndex = 0;
let currentQuestion = null;
let isTrueShown = false;

// Markdown → HTML
function parseMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

// 初期化
async function init() {
  const res = await fetch(GAS_URL);
  allData = await res.json();
  renderSections();
}

window.onload = init;

// セクション一覧生成
function renderSections() {
  const container = document.getElementById("sectionPage");
  const grouped = {};

  allData.forEach(q => {
    const [category, year] = q.section.split("_");
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(year);
  });

  container.innerHTML = "";

  Object.keys(grouped).forEach(cat => {
    const div = document.createElement("div");
    div.className = "section-group";

    const title = document.createElement("h2");
    title.textContent = cat;
    div.appendChild(title);

    grouped[cat].forEach(year => {
      const item = document.createElement("div");
      item.className = "section-item";
      item.textContent = year;
      item.onclick = () => startSection(`${cat}_${year}`);
      div.appendChild(item);
    });

    container.appendChild(div);
  });
}

// セクション開始
function startSection(section) {
  currentSection = section;

  sectionData = allData.filter(q => q.section === section);

  // レジューム
  const saved = JSON.parse(localStorage.getItem(section) || "[]");

  const unanswered = sectionData.filter(q => !saved.includes(q.id));

  if (unanswered.length === 0) {
    localStorage.removeItem(section);
    return startSection(section);
  }

  document.getElementById("sectionPage").classList.add("hidden");
  document.getElementById("quizPage").classList.remove("hidden");

  nextQuestion();
}

// 次問題
function nextQuestion() {
  clearUI();

  const saved = JSON.parse(localStorage.getItem(currentSection) || []);

  const remaining = sectionData.filter(q => !saved.includes(q.id));

  currentQuestion = remaining[Math.floor(Math.random() * remaining.length)];
  isTrueShown = Math.random() < 0.5;

  document.getElementById("sectionTitle").textContent = currentSection;
  document.getElementById("progress").textContent =
    `${sectionData.length - remaining.length + 1} / ${sectionData.length}`;

  const text = isTrueShown
    ? currentQuestion.question_true
    : currentQuestion.question_false;

  document.getElementById("questionText").innerHTML = parseMarkdown(text);
}

// 解答処理
function answer(isCircle) {
  const correct = (isTrueShown && isCircle) || (!isTrueShown && !isCircle);

  const resultArea = document.getElementById("resultArea");
  resultArea.classList.remove("hidden");
  resultArea.className = correct ? "correct" : "wrong";

  resultArea.innerHTML =
    `<b>${correct ? "正解" : "不正解"}</b><br><br>` +
    parseMarkdown(currentQuestion.explanation);

  document.getElementById("btnCircle").classList.add("disabled");
  document.getElementById("btnCross").classList.add("disabled");

  // 保存
  const saved = JSON.parse(localStorage.getItem(currentSection) || []);
  saved.push(currentQuestion.id);
  localStorage.setItem(currentSection, JSON.stringify(saved));

  showNextActions();
}

document.getElementById("btnCircle").onclick = () => answer(true);
document.getElementById("btnCross").onclick = () => answer(false);

// 次アクション
function showNextActions() {
  const div = document.getElementById("nextActions");
  div.classList.remove("hidden");

  const saved = JSON.parse(localStorage.getItem(currentSection) || []);
  const isLast = saved.length === sectionData.length;

  div.innerHTML = "";

  if (!isLast) {
    const nextBtn = document.createElement("button");
    nextBtn.innerText = "次の問題へ";
    nextBtn.onclick = nextQuestion;
    div.appendChild(nextBtn);
  }

  const backBtn = document.createElement("button");
  backBtn.innerText = "一覧へ戻る";
  backBtn.onclick = () => location.reload();
  div.appendChild(backBtn);
}

// 初期化
function clearUI() {
  document.getElementById("resultArea").classList.add("hidden");
  document.getElementById("nextActions").classList.add("hidden");

  document.getElementById("btnCircle").classList.remove("disabled");
  document.getElementById("btnCross").classList.remove("disabled");
}