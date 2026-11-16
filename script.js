/* ===== QuizMaster — Application Logic (500 MCQ Edition) ===== */

// Application State
let state = {
    playerName: '',
    subject: 'horticulture',
    questions: [],
    answers: {},       // { qIndex: selectedOptionIndex }
    currentQ: 0,
    timerInterval: null,
    timeLeft: 60 * 60, // 60 minutes in seconds
    startTime: null,
    endTime: null,
    submitted: false,
    statusFilter: 'all',
    typeFilter: 'all'
};

// Global chart references
let typeChartInstance = null;
let categoryChartInstance = null;
let doughnutChartInstance = null;

// ---- Initialization ----
document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('player-name');
    const subjectsSection = document.getElementById('subjects-section');
    const nameError = document.getElementById('name-error');

    nameInput.addEventListener('input', () => {
        const name = nameInput.value.trim();
        if (name.length >= 2) {
            subjectsSection.style.display = 'block';
            nameError.textContent = '';
        } else {
            subjectsSection.style.display = 'none';
        }
    });

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const name = nameInput.value.trim();
            if (name.length >= 2) {
                startQuiz('horticulture');
            } else {
                nameError.textContent = 'Please enter at least 2 characters to proceed.';
            }
        }
    });
});

// Screen switcher
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    }
}

// ---- Start Quiz ----
function startQuiz(subject) {
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value.trim();
    if (name.length < 2) {
        document.getElementById('name-error').textContent = 'Please enter your name first.';
        nameInput.focus();
        return;
    }

    state.playerName = name;
    state.subject = subject;
    state.answers = {};
    state.currentQ = 0;
    state.submitted = false;
    state.timeLeft = 60 * 60;
    state.startTime = new Date();
    state.statusFilter = 'all';
    state.typeFilter = 'all';

    const fullBank = QUESTION_BANK[subject];
    if (!fullBank || fullBank.length < 60) {
        alert('Insufficient questions in the question bank.');
        return;
    }

    // Pick a balanced, randomized set of 60 questions from the 500-question pool:
    // 18 from Section A (One-Word, 1-150)
    // 14 from Section B (Assertion & Reason, 151-250)
    // 16 from Section C (True/False & Statements, 251-400)
    // 12 from Section D (Match the Following, 401-500)
    const secA = shuffleArray(fullBank.filter(q => q.section === 'A'));
    const secB = shuffleArray(fullBank.filter(q => q.section === 'B'));
    const secC = shuffleArray(fullBank.filter(q => q.section === 'C'));
    const secD = shuffleArray(fullBank.filter(q => q.section === 'D'));

    const selected = [
        ...secA.slice(0, 18),
        ...secB.slice(0, 14),
        ...secC.slice(0, 16),
        ...secD.slice(0, 12)
    ];

    // Fallback if needed
    if (selected.length < 60) {
        const remaining = shuffleArray(fullBank.filter(q => !selected.includes(q)));
        selected.push(...remaining.slice(0, 60 - selected.length));
    }

    // Shuffle the final 60 questions so sections are interleaved naturally
    state.questions = shuffleArray(selected).slice(0, 60);

    // Update Header
    document.getElementById('quiz-subject-badge').textContent = capitalize(subject);
    document.getElementById('quiz-player-name').textContent = `Candidate: ${name}`;

    // Build Navigator Grid & Render First Question
    buildNavGrid();
    renderQuestion(0);
    updateProgress();

    // Start 60-Minute Countdown
    startTimer();

    showScreen('quiz-screen');
}

// ---- Timer ----
function startTimer() {
    clearInterval(state.timerInterval);
    const timerEl = document.getElementById('timer');
    timerEl.classList.remove('warning');
    updateTimerDisplay();

    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();

        if (state.timeLeft <= 300) { // 5 minutes remaining
            timerEl.classList.add('warning');
        }

        if (state.timeLeft <= 0) {
            clearInterval(state.timerInterval);
            submitQuiz();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    document.getElementById('timer-display').textContent =
        `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---- Question Rendering ----
function renderQuestion(index) {
    state.currentQ = index;
    const q = state.questions[index];
    const isAnswered = state.answers[index] !== undefined;

    // Header info
    document.getElementById('q-number').textContent = `Question ${index + 1} of 60 (Sec ${q.section})`;
    
    // Type badge
    const typeBadge = document.getElementById('q-type-badge');
    typeBadge.textContent = q.questionType;
    typeBadge.className = 'q-type-badge';
    if (q.section === 'A') typeBadge.classList.add('type-oneword');
    else if (q.section === 'B') typeBadge.classList.add('type-ar');
    else if (q.section === 'C') typeBadge.classList.add('type-stmt');
    else if (q.section === 'D') typeBadge.classList.add('type-match');

    // Category badge
    document.getElementById('q-category').textContent = q.category;

    // Question content box
    const qTextBox = document.getElementById('question-text');
    qTextBox.innerHTML = '';

    // Render depending on question type
    if (q.section === 'B') {
        // Assertion & Reason
        const aTxt = q.assertion || (q.question.match(/Assertion A:\s*(.*?)(?=Reason R:|$)/) || [])[1] || '';
        const rTxt = q.reason || (q.question.match(/Reason R:\s*(.*)/) || [])[1] || '';
        qTextBox.innerHTML = `
            <div class="ar-container">
                <div class="ar-box">
                    <span class="ar-tag">Assertion A</span>
                    <span class="ar-statement">${escapeHtml(aTxt)}</span>
                </div>
                <div class="ar-box reason-box">
                    <span class="ar-tag">Reason R</span>
                    <span class="ar-statement">${escapeHtml(rTxt)}</span>
                </div>
            </div>
        `;
    } else if (q.section === 'C' && q.statement1 && q.statement2) {
        // Statement I and II
        qTextBox.innerHTML = `
            <div class="ar-container">
                <div class="ar-box stmt1-box">
                    <span class="ar-tag">Statement I</span>
                    <span class="ar-statement">${escapeHtml(q.statement1)}</span>
                </div>
                <div class="ar-box stmt2-box">
                    <span class="ar-tag">Statement II</span>
                    <span class="ar-statement">${escapeHtml(q.statement2)}</span>
                </div>
            </div>
        `;
    } else if (q.section === 'D' && q.matchPairs) {
        // Match the Following
        qTextBox.innerHTML = `
            <div class="match-container">
                <p class="match-prompt">${escapeHtml(q.matchTitle || 'Match List I with List II:')}</p>
                <div class="match-table-wrapper">
                    <table class="match-table">
                        <thead>
                            <tr>
                                <th>List I (${escapeHtml(q.matchHeader1 || 'Item')})</th>
                                <th>List II (${escapeHtml(q.matchHeader2 || 'Match')})</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${q.matchPairs.map(p => `
                                <tr>
                                    <td><strong>${p.key}.</strong> ${escapeHtml(p.left)}</td>
                                    <td><strong>${p.num}.</strong> ${escapeHtml(p.right)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        // One-Word or Multi-statement text
        const formatted = escapeHtml(q.question).replace(/\n/g, '<br>');
        qTextBox.innerHTML = `<div>${formatted}</div>`;
    }

    // Render options
    const optionsList = document.getElementById('options-list');
    optionsList.innerHTML = '';
    const labels = ['A', 'B', 'C', 'D'];

    q.options.forEach((optText, optIdx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';

        if (isAnswered) {
            btn.classList.add('locked');
            if (state.answers[index] === optIdx) {
                btn.classList.add('selected');
            }
        }

        const isSelected = state.answers[index] === optIdx;
        btn.innerHTML = `
            <span class="option-label">${labels[optIdx]}</span>
            <span style="flex:1;">${escapeHtml(optText)}</span>
            ${isSelected ? '<span class="lock-indicator">🔒 Locked</span>' : ''}
        `;

        if (!isAnswered && !state.submitted) {
            btn.addEventListener('click', () => selectAnswer(index, optIdx));
        }

        optionsList.appendChild(btn);
    });

    // Navigation buttons state
    document.getElementById('btn-prev').disabled = index === 0;
    document.getElementById('btn-next').disabled = index === 59;

    updateNavGrid();
}

function selectAnswer(qIndex, optIndex) {
    if (state.answers[qIndex] !== undefined || state.submitted) return;

    // Lock answer
    state.answers[qIndex] = optIndex;

    renderQuestion(qIndex);
    updateProgress();
    updateNavGrid();
}

function navigateQuestion(dir) {
    const next = state.currentQ + dir;
    if (next >= 0 && next < 60) {
        renderQuestion(next);
    }
}

function jumpToQuestion(index) {
    if (index >= 0 && index < 60) {
        renderQuestion(index);
    }
}

// ---- Question Grid Navigator ----
function buildNavGrid() {
    const grid = document.getElementById('q-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 60; i++) {
        const btn = document.createElement('button');
        btn.className = 'q-grid-btn';
        btn.textContent = i + 1;
        btn.addEventListener('click', () => jumpToQuestion(i));
        grid.appendChild(btn);
    }
}

function updateNavGrid() {
    const btns = document.querySelectorAll('.q-grid-btn');
    btns.forEach((btn, i) => {
        btn.className = 'q-grid-btn';
        if (i === state.currentQ) btn.classList.add('current');
        else if (state.answers[i] !== undefined) btn.classList.add('answered');
    });
}

function updateProgress() {
    const count = Object.keys(state.answers).length;
    document.getElementById('answered-count').textContent = count;
}

// ---- Submit & Confirmation ----
function confirmSubmit() {
    const answeredCount = Object.keys(state.answers).length;
    const remaining = 60 - answeredCount;
    const modalText = document.getElementById('submit-modal-text');

    if (remaining === 0) {
        modalText.innerHTML = `Great job! You have answered <strong>all 60 questions</strong>.`;
    } else {
        modalText.innerHTML = `You have answered <strong>${answeredCount}</strong> out of 60 questions.<br>You have <strong>${remaining}</strong> unanswered question(s).`;
    }

    document.getElementById('submit-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('submit-modal').style.display = 'none';
}

function submitQuiz() {
    clearInterval(state.timerInterval);
    state.endTime = new Date();
    state.submitted = true;
    closeModal();
    evaluateResults();
    showScreen('results-screen');
}

// ---- Evaluation & Results ----
function evaluateResults() {
    const questions = state.questions;
    const answers = state.answers;

    let correct = 0;
    let wrong = 0;
    let skipped = 0;

    const typeStats = {};
    const categoryStats = {};

    questions.forEach((q, i) => {
        const typeKey = `Section ${q.section}: ${q.questionType}`;
        if (!typeStats[typeKey]) {
            typeStats[typeKey] = { total: 0, correct: 0, wrong: 0, skipped: 0 };
        }
        typeStats[typeKey].total++;

        if (!categoryStats[q.category]) {
            categoryStats[q.category] = { total: 0, correct: 0, wrong: 0, skipped: 0 };
        }
        categoryStats[q.category].total++;

        const userAns = answers[i];
        if (userAns === undefined) {
            skipped++;
            typeStats[typeKey].skipped++;
            categoryStats[q.category].skipped++;
        } else if (userAns === q.correct) {
            correct++;
            typeStats[typeKey].correct++;
            categoryStats[q.category].correct++;
        } else {
            wrong++;
            typeStats[typeKey].wrong++;
            categoryStats[q.category].wrong++;
        }
    });

    const total = 60;
    const pct = Math.round((correct / total) * 100);

    // Time taken calculation
    const elapsedSecs = Math.max(0, Math.floor((state.endTime - state.startTime) / 1000));
    const elapsedMin = Math.floor(elapsedSecs / 60);
    const elapsedSec = elapsedSecs % 60;
    const timeStr = `${elapsedMin} minute(s) and ${elapsedSec} second(s)`;

    // Score cards
    document.getElementById('results-player').textContent = `Candidate: ${state.playerName}`;
    document.getElementById('results-subject').textContent = `Subject: Horticulture Assessment (Official 500 Question Bank)`;
    document.getElementById('results-time').textContent = `⏱️ Time Elapsed: ${timeStr} (Out of 60 Minutes)`;
    document.getElementById('score-value').textContent = `${correct}/${total}`;
    document.getElementById('score-percent').textContent = `${pct}%`;
    document.getElementById('correct-count').textContent = correct;
    document.getElementById('wrong-count').textContent = wrong;
    document.getElementById('skipped-count').textContent = skipped;

    // Filter counts
    document.getElementById('filter-cnt-correct').textContent = correct;
    document.getElementById('filter-cnt-wrong').textContent = wrong;
    document.getElementById('filter-cnt-skipped').textContent = skipped;

    // Render Charts
    renderTypeChart(typeStats);
    renderCategoryChart(categoryStats);
    renderDoughnutChart(correct, wrong, skipped);

    // Render Diagnostic Summaries
    renderImprovementSummary(typeStats, categoryStats, pct);

    // Render Detailed Answer Review
    renderAnswersList();
}

// ---- Chart 1: Performance by Exam Section ----
function renderTypeChart(typeStats) {
    const ctx = document.getElementById('typeChart').getContext('2d');
    if (typeChartInstance) typeChartInstance.destroy();

    const types = Object.keys(typeStats);
    const correctData = types.map(t => typeStats[t].correct);
    const wrongData = types.map(t => typeStats[t].wrong);
    const skippedData = types.map(t => typeStats[t].skipped);

    typeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: types.map(t => t.replace('Section ', 'Sec ').replace('Statements', 'Stmts')),
            datasets: [
                { label: 'Correct', data: correctData, backgroundColor: '#16a34a', borderRadius: 4 },
                { label: 'Incorrect', data: wrongData, backgroundColor: '#dc2626', borderRadius: 4 },
                { label: 'Unanswered', data: skippedData, backgroundColor: '#d97706', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, boxWidth: 8 } }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { stepSize: 2 } }
            }
        }
    });
}

// ---- Chart 2: Performance by Subject Domain ----
function renderCategoryChart(categoryStats) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (categoryChartInstance) categoryChartInstance.destroy();

    const categories = Object.keys(categoryStats);
    const correctData = categories.map(c => categoryStats[c].correct);
    const wrongData = categories.map(c => categoryStats[c].wrong);
    const skippedData = categories.map(c => categoryStats[c].skipped);

    categoryChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categories.map(c => c.split('(')[0].trim()),
            datasets: [
                { label: 'Correct', data: correctData, backgroundColor: '#16a34a', borderRadius: 4 },
                { label: 'Incorrect', data: wrongData, backgroundColor: '#dc2626', borderRadius: 4 },
                { label: 'Unanswered', data: skippedData, backgroundColor: '#d97706', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, boxWidth: 8 } }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { stepSize: 2 } }
            }
        }
    });
}

// ---- Chart 3: Doughnut Breakdown ----
function renderDoughnutChart(correct, wrong, skipped) {
    const ctx = document.getElementById('doughnutChart').getContext('2d');
    if (doughnutChartInstance) doughnutChartInstance.destroy();

    doughnutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Correct', 'Incorrect', 'Unanswered'],
            datasets: [{
                data: [correct, wrong, skipped],
                backgroundColor: ['#16a34a', '#dc2626', '#d97706'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, boxWidth: 8 } }
            }
        }
    });
}

// ---- Diagnostic Analysis & Recommendations ----
function renderImprovementSummary(typeStats, categoryStats, overallPct) {
    // 1. Exam Section Analysis
    const typeBox = document.getElementById('type-improvement-summary');
    typeBox.innerHTML = '<h4 class="improvement-block-title">Section-Wise Diagnostic Analysis</h4>';

    const sectionTips = {
        'Section A: One-Word Answer': {
            high: 'Excellent speed and precision in direct factual recall and terminology.',
            mid: 'Fair recall. Practice flashcards for scientific names, cultivars, disorders, and physiological terms.',
            low: 'Requires reinforcement. Dedicate time to memorizing key botanical names, varieties, and causative organisms.'
        },
        'Section B: Assertion & Reasoning': {
            high: 'Outstanding mastery in evaluating logical and physiological relationships between assertions and reasons.',
            mid: 'Moderate grasp. Verify whether Reason R provides the direct cause of Assertion A or is simply an unrelated true statement.',
            low: 'Critical focus area. First evaluate if both statements are independently true; then check for a causal mechanism.'
        },
        'Section C: True or False Statements': {
            high: 'High vigilance for factual nuances and multi-statement combinations.',
            mid: 'Good accuracy. Watch for inverted facts, wrong species names, or swapped numerical parameters.',
            low: 'Needs systematic review. Review Statement I & II rules and eliminate options methodically.'
        },
        'Section D: Match the Following': {
            high: 'Superb associative recall across varieties, disorders, institutes, and botanical types.',
            mid: 'Good score. If unsure about all items, use process of elimination on the 1-2 pairs you know with certainty.',
            low: 'Area to strengthen. Review matching sets for institute locations, parentages, and disorder causes.'
        }
    };

    Object.entries(typeStats).forEach(([typeName, stats]) => {
        const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        let scoreClass = 'low';
        let level = 'low';
        if (pct >= 70) { scoreClass = 'high'; level = 'high'; }
        else if (pct >= 40) { scoreClass = 'mid'; level = 'mid'; }

        const tip = sectionTips[typeName] ? sectionTips[typeName][level] : 'Continue consistent practice in this section.';

        const item = document.createElement('div');
        item.className = 'improve-item';
        item.innerHTML = `
            <div class="improve-header">
                <span class="improve-category">${escapeHtml(typeName)}</span>
                <span class="improve-score ${scoreClass}">${pct}% (${stats.correct}/${stats.total})</span>
            </div>
            <p class="improve-tip">${tip}</p>
        `;
        typeBox.appendChild(item);
    });

    // 2. Subject Domain Analysis
    const subjBox = document.getElementById('subject-improvement-summary');
    subjBox.innerHTML = '<h4 class="improvement-block-title">Subject Domain Recommendations</h4>';

    const sortedSubjs = Object.entries(categoryStats).map(([cat, stats]) => ({
        cat,
        total: stats.total,
        correct: stats.correct,
        pct: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    })).sort((a, b) => a.pct - b.pct);

    sortedSubjs.forEach(s => {
        let scoreClass = 'low';
        if (s.pct >= 70) scoreClass = 'high';
        else if (s.pct >= 40) scoreClass = 'mid';

        let tip = '';
        if (s.pct < 40) {
            tip = `Scored ${s.correct}/${s.total}. Prioritize revision in this domain. Focus on core botanical classifications, disorders, and standard management practices.`;
        } else if (s.pct < 70) {
            tip = `Scored ${s.correct}/${s.total}. Fair comprehension. Re-read the detailed explanations below for the questions you missed.`;
        } else {
            tip = `Scored ${s.correct}/${s.total}. Excellent command! Keep up the strong preparation.`;
        }

        const item = document.createElement('div');
        item.className = 'improve-item';
        item.innerHTML = `
            <div class="improve-header">
                <span class="improve-category">${escapeHtml(s.cat)}</span>
                <span class="improve-score ${scoreClass}">${s.pct}%</span>
            </div>
            <p class="improve-tip">${tip}</p>
        `;
        subjBox.appendChild(item);
    });

    // 3. Overall Message
    const feedbackBox = document.getElementById('overall-feedback-box');
    let appraisal = '';
    if (overallPct >= 80) {
        appraisal = `🏆 Outstanding Performance, ${escapeHtml(state.playerName)}! You scored ${overallPct}%. You demonstrated high competitive aptitude across all CUET PG question formats.`;
    } else if (overallPct >= 60) {
        appraisal = `🌟 Solid Effort, ${escapeHtml(state.playerName)}! You scored ${overallPct}%. You have a dependable foundation. Targeted revision in the lower-scoring sections will elevate your rank.`;
    } else if (overallPct >= 40) {
        appraisal = `📖 Moderate Performance, ${escapeHtml(state.playerName)}. You scored ${overallPct}%. Strengthen your precision in Assertion-Reasoning and review key physiological disorders and cultivar names.`;
    } else {
        appraisal = `💪 Keep Practicing, ${escapeHtml(state.playerName)}! You scored ${overallPct}%. Review the thorough answer explanations below, then attempt another randomized quiz to track your progress.`;
    }

    const weakTypes = Object.entries(typeStats).filter(([t, s]) => (s.correct / s.total) < 0.5).map(([t]) => t);
    if (weakTypes.length > 0) {
        appraisal += `<br><br><strong>📌 Key Exam Sections to Strengthen:</strong> ${weakTypes.join(', ')}.`;
    }

    feedbackBox.innerHTML = appraisal;
}

// ---- Detailed Answers List & Multi-filtering ----
function renderAnswersList() {
    const container = document.getElementById('answers-list');
    container.innerHTML = '';
    const labels = ['A', 'B', 'C', 'D'];

    state.questions.forEach((q, i) => {
        const userAns = state.answers[i];
        let status = 'skipped';
        let statusLabel = 'Unanswered';
        let itemClass = 'result-skipped';

        if (userAns !== undefined) {
            if (userAns === q.correct) {
                status = 'correct';
                statusLabel = 'Correct';
                itemClass = 'result-correct';
            } else {
                status = 'wrong';
                statusLabel = 'Incorrect';
                itemClass = 'result-wrong';
            }
        }

        const div = document.createElement('div');
        div.className = `answer-item ${itemClass}`;
        div.dataset.status = status;
        div.dataset.type = q.questionType;

        // Format Question Text
        let questionHtml = '';
        if (q.section === 'B') {
            const aTxt = q.assertion || (q.question.match(/Assertion A:\s*(.*?)(?=Reason R:|$)/) || [])[1] || '';
            const rTxt = q.reason || (q.question.match(/Reason R:\s*(.*)/) || [])[1] || '';
            questionHtml = `
                <div class="ar-container" style="margin-bottom:12px;">
                    <div class="ar-box" style="padding:10px 14px;"><strong>Assertion A:</strong> ${escapeHtml(aTxt)}</div>
                    <div class="ar-box reason-box" style="padding:10px 14px;"><strong>Reason R:</strong> ${escapeHtml(rTxt)}</div>
                </div>
            `;
        } else if (q.section === 'C' && q.statement1 && q.statement2) {
            questionHtml = `
                <div class="ar-container" style="margin-bottom:12px;">
                    <div class="ar-box stmt1-box" style="padding:10px 14px;"><strong>Statement I:</strong> ${escapeHtml(q.statement1)}</div>
                    <div class="ar-box stmt2-box" style="padding:10px 14px;"><strong>Statement II:</strong> ${escapeHtml(q.statement2)}</div>
                </div>
            `;
        } else if (q.section === 'D' && q.matchPairs) {
            questionHtml = `
                <div class="match-container" style="margin-bottom:12px;">
                    <p style="font-weight:700; margin-bottom:8px;">${escapeHtml(q.matchTitle || 'Match List I with List II:')}</p>
                    <div class="match-table-wrapper">
                        <table class="match-table">
                            <thead>
                                <tr>
                                    <th>List I (${escapeHtml(q.matchHeader1 || 'Item')})</th>
                                    <th>List II (${escapeHtml(q.matchHeader2 || 'Match')})</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${q.matchPairs.map(p => `
                                    <tr>
                                        <td><strong>${p.key}.</strong> ${escapeHtml(p.left)}</td>
                                        <td><strong>${p.num}.</strong> ${escapeHtml(p.right)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } else {
            const formatted = escapeHtml(q.question).replace(/\n/g, '<br>');
            questionHtml = `<p class="answer-question">${formatted}</p>`;
        }

        // Format Answer Row
        const userAnsText = userAns !== undefined ? `${labels[userAns]}. ${escapeHtml(q.options[userAns])}` : 'None (Skipped)';
        const correctAnsText = `${labels[q.correct]}. ${escapeHtml(q.options[q.correct])}`;

        div.innerHTML = `
            <div class="answer-item-header">
                <div class="answer-badges">
                    <span class="answer-q-num">Q${i + 1} (Bank #${q.id})</span>
                    <span class="q-type-badge">${escapeHtml(q.questionType)}</span>
                    <span class="q-category">${escapeHtml(q.category)}</span>
                </div>
                <span class="answer-status ${status}">${statusLabel}</span>
            </div>
            ${questionHtml}
            <div class="answer-detail-box">
                <div class="answer-detail-row">
                    <strong>Your Choice:</strong> 
                    <span class="${status === 'correct' ? 'ans-text-correct' : (status === 'wrong' ? 'ans-text-wrong' : '')}">${userAnsText}</span>
                </div>
                <div class="answer-detail-row">
                    <strong>Correct Answer:</strong> 
                    <span class="ans-text-correct">${correctAnsText}</span>
                </div>
                <div class="ans-explanation">
                    <strong>💡 Explanation:</strong> ${escapeHtml(q.explanation)}
                </div>
            </div>
        `;

        container.appendChild(div);
    });

    applyFilters();
}

function setStatusFilter(filter, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.statusFilter = filter;
    applyFilters();
}

function setTypeFilter(filter, btn) {
    document.querySelectorAll('.filter-btn-type').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.typeFilter = filter;
    applyFilters();
}

function applyFilters() {
    const items = document.querySelectorAll('.answer-item');
    items.forEach(item => {
        const matchesStatus = (state.statusFilter === 'all') || (item.dataset.status === state.statusFilter);
        const matchesType = (state.typeFilter === 'all') || (item.dataset.type === state.typeFilter);

        item.style.display = (matchesStatus && matchesType) ? 'block' : 'none';
    });
}

// ---- Retake & Navigation ----
function retakeQuiz() {
    startQuiz(state.subject);
}

function goHome() {
    clearInterval(state.timerInterval);
    showScreen('home-screen');
}

// ---- Utilities ----
function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// Keyboard navigation during quiz
document.addEventListener('keydown', (e) => {
    if (!document.getElementById('quiz-screen').classList.contains('active')) return;
    if (state.submitted) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateQuestion(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateQuestion(-1);
    } else if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const q = state.questions[state.currentQ];
        if (q && idx < q.options.length) {
            selectAnswer(state.currentQ, idx);
        }
    }
});
