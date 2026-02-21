import { gemini } from './utils/gemini.js';
import { runCode } from './utils/runner.js';

// --- State ---
let currentChallenge = null;
let points = parseInt(localStorage.getItem('z-code-points') || '0');
const difficultyPoints = {
    easy: 10,
    medium: 30,
    hard: 100
};

// --- DOM Elements ---
const setupSection = document.getElementById('setup-section');
const challengeSection = document.getElementById('challenge-section');
const loader = document.getElementById('loader');
const pointsDisplay = document.getElementById('total-points');
const languageSelect = document.getElementById('language-select');
const difficultySelect = document.getElementById('difficulty-select');
const generateBtn = document.getElementById('generate-btn');

const challengeTitle = document.getElementById('challenge-title');
const challengeDesc = document.getElementById('challenge-desc');
const challengeBadge = document.getElementById('challenge-difficulty');
const codeEditor = document.getElementById('code-editor');
const currentLangDisplay = document.getElementById('current-lang');
const runBtn = document.getElementById('run-btn');
const runCodeBtn = document.getElementById('run-code-btn');
const aiSolveBtn = document.getElementById('ai-solve-btn');

const consoleOutput = document.getElementById('console-output');
const consoleText = document.getElementById('console-text');

const aiModal = document.getElementById('ai-modal');
const aiSolutionText = document.getElementById('ai-solution-text');
const closeModal = document.querySelector('.close-modal');

// --- Initialization ---
function init() {
    updatePointsDisplay();
    initTheme();
    setupEventListeners();
}

function updatePointsDisplay() {
    pointsDisplay.textContent = `Points: ${points}`;
}

function initTheme() {
    const saved = localStorage.getItem('z-code-theme') || 'dark';
    applyTheme(saved);

    document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('z-code-theme', next);
    });
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.innerHTML = theme === 'light'
            ? '<span class="theme-icon">◑</span> Dark'
            : '<span class="theme-icon">◐</span> Light';
    }
}

function setupEventListeners() {
    generateBtn.addEventListener('click', handleGenerateChallenge);
    runBtn.addEventListener('click', handleSubmit);
    runCodeBtn.addEventListener('click', handleRunCode);
    aiSolveBtn.addEventListener('click', handleAISolve);

    document.getElementById('back-btn').addEventListener('click', () => {
        challengeSection.classList.add('hidden');
        consoleOutput.classList.add('hidden');
        setupSection.classList.remove('hidden');
        currentChallenge = null;
        codeEditor.value = '';
        runBtn.textContent = 'Submit Solution';
        runBtn.classList.remove('success-btn');
        runBtn.onclick = null;
        runBtn.disabled = false;
    });

    codeEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeEditor.selectionStart;
            const end = codeEditor.selectionEnd;
            codeEditor.value = codeEditor.value.substring(0, start) + '    ' + codeEditor.value.substring(end);
            codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
        }
    });

    closeModal.addEventListener('click', () => aiModal.classList.add('hidden'));
    window.addEventListener('click', (e) => {
        if (e.target === aiModal) aiModal.classList.add('hidden');
    });

    document.getElementById('clear-console-btn').addEventListener('click', () => {
        consoleOutput.classList.add('hidden');
        consoleText.innerHTML = '';
    });

    // Tab switching in the AI modal
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
        });
    });
}


// --- Handlers ---
async function handleGenerateChallenge() {
    const lang = languageSelect.value;
    const diff = difficultySelect.value;

    setupSection.classList.add('hidden');
    loader.classList.remove('hidden');
    challengeSection.classList.add('hidden');
    consoleOutput.classList.add('hidden');

    try {
        currentChallenge = await gemini.generateChallenge(lang, diff);

        challengeTitle.textContent = currentChallenge.title;
        challengeDesc.innerHTML = parseMarkdown(currentChallenge.description);
        challengeBadge.textContent = diff.toUpperCase();
        challengeBadge.className = `badge ${diff}`;
        codeEditor.value = '';
        currentLangDisplay.textContent = lang;
        codeEditor.focus();

        loader.classList.add('hidden');
        challengeSection.classList.remove('hidden');
    } catch (error) {
        loader.classList.add('hidden');
        setupSection.classList.remove('hidden');
        showConsoleError(error.message);
    }
}

// Run code only — show real stdout/stderr, no AI
async function handleRunCode() {
    const code = codeEditor.value.trim();
    if (!code) {
        showConsoleError('Nothing to run — write some code first!');
        return;
    }

    runCodeBtn.disabled = true;
    runCodeBtn.textContent = '▶ Running...';
    showConsole('> Running...');

    const lang = languageSelect.value;
    const result = await runCode(lang, code);

    if (result.isError) {
        consoleText.innerHTML =
            `<span class="console-tag run-tag">RUN</span> <span class="error-text">${escHtml(result.output)}</span>`;
    } else {
        consoleText.innerHTML =
            `<span class="console-tag run-tag">RUN</span> ${escHtml(result.output)}`;
    }

    runCodeBtn.disabled = false;
    runCodeBtn.textContent = '▶ Run Code';
}

// Submit — AI evaluation only, checks if solution matches the challenge
async function handleSubmit() {
    if (!currentChallenge) return;

    const lang = languageSelect.value;
    const code = codeEditor.value.trim();
    if (!code) {
        showConsoleError('Write some code first!');
        return;
    }

    runBtn.disabled = true;
    runBtn.textContent = 'Evaluating...';
    showConsole('<span style="color:#888">⏳ AI is checking your solution...</span>');

    try {
        const result = await gemini.evaluate(lang, currentChallenge, code);

        if (result.isCorrect) {
            const earned = difficultyPoints[difficultySelect.value];
            points += earned;
            localStorage.setItem('z-code-points', points.toString());
            updatePointsDisplay();

            consoleText.innerHTML =
                `<span class="console-tag ai-tag">AI</span> <span class="success-text">✔ Challenge Solved!</span>\n\n` +
                `${escHtml(result.feedback)}\n\n` +
                `<span class="success-text">+${earned} points awarded.</span>`;

            runBtn.textContent = 'Next Challenge';
            runBtn.classList.add('success-btn');
            runBtn.onclick = () => window.location.reload();
        } else {
            consoleText.innerHTML =
                `<span class="console-tag ai-tag">AI</span> <span class="error-text">✖ Incorrect — ${escHtml(result.errorLog || result.feedback)}</span>\n` +
                `<span style="color:#555">    Hint: Run your code first to check the output, then adjust your logic.</span>`;
            runBtn.textContent = 'Submit Solution';
        }
    } catch (error) {
        showConsoleError(`AI Error: ${error.message}`);
        runBtn.textContent = 'Submit Solution';
    } finally {
        runBtn.disabled = false;
    }
}

async function handleAISolve() {
    if (!currentChallenge) return;

    aiSolveBtn.textContent = 'Thinking...';
    aiSolveBtn.disabled = true;

    try {
        const result = await gemini.solve(languageSelect.value, currentChallenge);

        // Populate Hints tab
        const hintsEl = document.getElementById('tab-hints');
        hintsEl.innerHTML = (result.hints || []).map((h, i) =>
            `<div class="ai-hint"><span class="hint-num">${i + 1}</span><p>${h}</p></div>`
        ).join('');

        // Populate Steps tab
        const stepsEl = document.getElementById('tab-steps');
        stepsEl.innerHTML = (result.steps || []).map((s, i) =>
            `<div class="ai-step"><span class="step-num">${i + 1}</span><p>${s}</p></div>`
        ).join('');

        // Populate Solution tab
        document.getElementById('ai-solution-text').textContent = result.solution || '';

        // Reset to first tab
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        document.querySelector('.tab-btn[data-tab="hints"]').classList.add('active');
        document.getElementById('tab-hints').classList.remove('hidden');

        aiModal.classList.remove('hidden');
    } catch (error) {
        alert(error.message);
    } finally {
        aiSolveBtn.textContent = 'AI Help';
        aiSolveBtn.disabled = false;
    }
}

// --- Utilities ---

function escHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function showConsole(msg = '') {
    consoleOutput.classList.remove('hidden');
    consoleText.innerHTML = msg;
}

function showConsoleError(msg) {
    showConsole(`<span class="error-text">✖ ${escHtml(msg)}</span>`);
}


function parseMarkdown(md) {
    // Very basic markdown parser for the AI description
    return md
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^\- (.*$)/gm, '<li>$1</li>')
        .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*)\*/g, '<em>$1</em>')
        .replace(/`([^`]*)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

init();
