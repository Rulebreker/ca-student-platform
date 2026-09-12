/**
 * test-engine.js - Online MCQ Examination System
 * Features:
 * - Pre-test instructions & rules
 * - Real-time countdown timer with auto-submit
 * - Question palette & navigation (Next, Prev, Mark for Review, Clear)
 * - Negative marking calculation (+2.0 / -0.5)
 * - Instant automatic evaluation & detailed solutions review
 * - Zero ads during active test taking
 */

class TestEngine {
  constructor() {
    this.activeTest = null;
    this.questions = [];
    this.currentIndex = 0;
    this.userAnswers = {}; // { [questionId]: 'A' | 'B' | 'C' | 'D' }
    this.markedForReview = {}; // { [questionId]: boolean }
    this.timerInterval = null;
    this.secondsRemaining = 0;
    this.totalDurationSeconds = 0;
    this.currentAttemptId = null;
    this.selectedSubject = 'all';
  }

  renderCatalog() {
    const tests = window.store.getTests().filter(t => t.isPublished);
    const subjects = window.store.getSubjects();
    const user = window.auth.getCurrentUser();
    const userAttempts = user ? window.store.getAttemptsByUser(user.id) : [];

    // Render Subject Filters
    const filterContainer = document.getElementById('test-subject-filters');
    if (filterContainer) {
      filterContainer.innerHTML = `
        <button 
          onclick="window.testEngine.filterSubject('all')"
          class="px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            this.selectedSubject === 'all' 
              ? 'bg-blue-600 text-white shadow-sm' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }"
        >
          All Tests (${tests.length})
        </button>
        ${subjects.map(s => {
          const count = tests.filter(t => t.subjectId === s.id).length;
          const isActive = this.selectedSubject === s.id;
          return `
            <button 
              onclick="window.testEngine.filterSubject('${s.id}')"
              class="px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }"
            >
              ${s.name} (${count})
            </button>
          `;
        }).join('')}
      `;
    }

    let filtered = tests;
    if (this.selectedSubject !== 'all') {
      filtered = filtered.filter(t => t.subjectId === this.selectedSubject);
    }

    const grid = document.getElementById('tests-grid');
    if (!grid) return;

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-16 bg-white rounded-xl border border-dashed border-slate-200 p-8">
          <i data-lucide="file-question" class="w-10 h-10 text-slate-400 mx-auto mb-3"></i>
          <h4 class="text-base font-bold text-slate-800">No mock tests found</h4>
          <p class="text-xs text-slate-500 mt-1">Please select another subject or check back later.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = filtered.map(test => {
      const subject = window.store.getSubjectById(test.subjectId);
      const testAttempts = user ? userAttempts.filter(a => a.testId === test.id) : [];
      const attemptsUsed = testAttempts.length;
      const maxAttempts = test.maxAttempts || 1;
      const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);
      const canTake = attemptsRemaining > 0;
      const bestAttempt = testAttempts.length > 0 ? Math.max(...testAttempts.map(a => a.percentage)) : null;

      return `
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                ${subject ? subject.name : 'CA Practice'}
              </span>
              <span class="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <i data-lucide="clock" class="w-3.5 h-3.5"></i> ${test.durationMinutes} mins
              </span>
            </div>

            <h3 class="text-base font-bold text-slate-900 mb-2 leading-snug">${test.title}</h3>
            <p class="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">${test.description}</p>

            <div class="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg text-xs mb-4">
              <div>
                <span class="text-slate-400 block text-[11px]">Marking Scheme</span>
                <span class="font-bold text-emerald-700">+${test.marksPerCorrect}</span>
                <span class="text-slate-400">/</span>
                <span class="font-bold text-rose-600">-${test.negativeMarksPerWrong}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[11px]">Total Questions</span>
                <span class="font-bold text-slate-800">${test.totalQuestions} MCQs</span>
              </div>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between text-xs py-2 border-t border-slate-100 mb-3">
              <span class="text-slate-500">
                Attempts: <strong class="${canTake ? 'text-slate-800' : 'text-rose-600'}">${attemptsUsed}/${maxAttempts}</strong>
              </span>
              ${bestAttempt !== null ? `<span class="text-emerald-700 font-semibold">Best: ${Math.round(bestAttempt)}%</span>` : ''}
            </div>

            <div class="flex items-center gap-2">
              <button 
                onclick="window.testEngine.showInstructionsModal('${test.id}')"
                class="w-full py-2.5 text-xs font-bold rounded-lg ${
                  canTake 
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                } transition-colors"
                ${!canTake ? 'disabled' : ''}
              >
                ${attemptsUsed === 0 ? 'Start Mock Test' : (canTake ? 'Re-attempt Test' : 'Attempts Limit Reached')}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  filterSubject(subjectId) {
    this.selectedSubject = subjectId;
    this.renderCatalog();
  }

  showInstructionsModal(testId) {
    const test = window.store.getTestById(testId);
    if (!test) return;

    const user = window.auth.getCurrentUser();
    if (!user) {
      window.app.showAuthModal('login');
      return;
    }

    const subject = window.store.getSubjectById(test.subjectId);
    const questions = window.store.getQuestionsByTestId(test.id);
    const userAttempts = window.store.getAttemptsByUser(user.id).filter(a => a.testId === test.id);
    const attemptsLeft = (test.maxAttempts || 1) - userAttempts.length;

    if (attemptsLeft <= 0) {
      window.app.showToast('You have exhausted all allowed attempts for this test.', 'error');
      return;
    }

    const modalContent = document.getElementById('instructions-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-start justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 mb-1">
              ${subject ? subject.name : 'Chartered Accountancy Test'}
            </span>
            <h3 class="text-lg font-bold text-slate-900">${test.title}</h3>
          </div>
          <button onclick="window.app.closeModal('instructions-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Exam Parameters Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl mb-5 text-center">
          <div class="p-2 border-r border-slate-200">
            <span class="text-[11px] text-slate-500 block uppercase font-medium">Duration</span>
            <span class="text-base font-bold text-slate-800">${test.durationMinutes} Minutes</span>
          </div>
          <div class="p-2 border-r border-slate-200">
            <span class="text-[11px] text-slate-500 block uppercase font-medium">Questions</span>
            <span class="text-base font-bold text-slate-800">${test.totalQuestions} MCQs</span>
          </div>
          <div class="p-2 border-r border-slate-200">
            <span class="text-[11px] text-slate-500 block uppercase font-medium">Correct Mark</span>
            <span class="text-base font-bold text-emerald-600">+${test.marksPerCorrect}</span>
          </div>
          <div class="p-2">
            <span class="text-[11px] text-slate-500 block uppercase font-medium">Negative Mark</span>
            <span class="text-base font-bold text-rose-600">-${test.negativeMarksPerWrong}</span>
          </div>
        </div>

        <!-- Instructions Details -->
        <div class="space-y-3 text-xs text-slate-700 leading-relaxed mb-6">
          <h4 class="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Examination Rules & Guidelines:</h4>
          <ul class="list-disc pl-5 space-y-1.5 text-slate-600">
            <li>The countdown timer starts immediately once you click <strong>Start Test</strong>.</li>
            <li>Each correct answer awards <strong>+${test.marksPerCorrect} marks</strong>. Each wrong answer deducts <strong>${test.negativeMarksPerWrong} marks</strong>.</li>
            <li>Unattempted questions carry zero penalty.</li>
            <li>You can navigate questions using the <strong>Question Palette</strong> or Next/Previous buttons.</li>
            <li>You may mark questions for review and return to them anytime before submission.</li>
            <li>The test will <strong>automatically submit</strong> when the countdown timer reaches 00:00.</li>
            <li>Ensure a stable internet connection. Correct answers and detailed solutions will be shown after submission.</li>
          </ul>
        </div>

        <div class="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-800 mb-6 flex items-start gap-2">
          <i data-lucide="info" class="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5"></i>
          <div>
            You have <strong>${attemptsLeft} of ${test.maxAttempts || 1}</strong> attempt(s) remaining for this examination.
          </div>
        </div>

        <div class="flex items-center gap-2 mb-6">
          <input type="checkbox" id="agree-test-rules" class="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer">
          <label for="agree-test-rules" class="text-xs text-slate-700 font-medium cursor-pointer">
            I have read and understood all the test instructions and marking guidelines.
          </label>
        </div>

        <div class="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button 
            onclick="window.app.closeModal('instructions-modal')"
            class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onclick="window.testEngine.startTest('${test.id}')"
            id="btn-confirm-start-test"
            class="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            Start Test Now →
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('instructions-modal');
  }

  startTest(testId) {
    const agreeCheckbox = document.getElementById('agree-test-rules');
    if (agreeCheckbox && !agreeCheckbox.checked) {
      window.app.showToast('Please confirm that you have read the instructions.', 'warning');
      return;
    }

    const test = window.store.getTestById(testId);
    if (!test) return;

    const questions = window.store.getQuestionsByTestId(test.id);
    if (questions.length === 0) {
      window.app.showToast('No questions available in this test yet.', 'error');
      return;
    }

    window.app.closeModal('instructions-modal');

    this.activeTest = test;
    this.questions = questions;
    this.currentIndex = 0;
    this.userAnswers = {};
    this.markedForReview = {};
    this.totalDurationSeconds = test.durationMinutes * 60;
    this.secondsRemaining = this.totalDurationSeconds;
    this.currentAttemptId = 'att-' + Date.now();

    // Switch view to exam interface
    window.app.navigate('test-taking');
    this.renderExamInterface();
    this.startTimer();
  }

  startTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.secondsRemaining--;
      this.updateTimerDisplay();

      if (this.secondsRemaining <= 0) {
        clearInterval(this.timerInterval);
        window.app.showToast('Time is up! Your test is being automatically submitted.', 'warning');
        this.submitTest(true);
      }
    }, 1000);
  }

  updateTimerDisplay() {
    const timerEl = document.getElementById('exam-timer');
    if (!timerEl) return;

    const minutes = Math.floor(this.secondsRemaining / 60);
    const seconds = this.secondsRemaining % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    timerEl.textContent = formatted;

    // Visual warning when less than 3 minutes remaining
    if (this.secondsRemaining <= 180) {
      timerEl.className = 'text-base font-mono font-bold text-rose-600 animate-pulse';
    } else {
      timerEl.className = 'text-base font-mono font-bold text-slate-900';
    }
  }

  renderExamInterface() {
    const container = document.getElementById('exam-interface-container');
    if (!container || !this.activeTest) return;

    const currentQ = this.questions[this.currentIndex];
    const totalQ = this.questions.length;

    // Strict requirement: No ads in active test mode
    container.innerHTML = `
      <!-- Exam Header Bar -->
      <div class="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-8 py-3.5 shadow-sm">
        <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              CA
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-900 line-clamp-1">${this.activeTest.title}</h2>
              <span class="text-xs text-slate-500 font-medium">Question ${this.currentIndex + 1} of ${totalQ}</span>
            </div>
          </div>

          <!-- Live Timer Display -->
          <div class="flex items-center gap-3">
            <div class="bg-slate-100 border border-slate-200 px-4 py-1.5 rounded-lg flex items-center gap-2">
              <i data-lucide="timer" class="w-4 h-4 text-blue-600"></i>
              <div class="flex flex-col text-right">
                <span class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Time Left</span>
                <span id="exam-timer" class="text-base font-mono font-bold text-slate-900">00:00</span>
              </div>
            </div>

            <button 
              onclick="window.testEngine.confirmSubmit()"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <i data-lucide="check-square" class="w-4 h-4"></i>
              Submit Test
            </button>
          </div>
        </div>
      </div>

      <!-- Exam Workspace: Question Area + Palette -->
      <div class="max-w-7xl mx-auto px-4 sm:px-8 py-6">
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          <!-- Left Main: Active Question (3 Cols) -->
          <div class="lg:col-span-3 space-y-6">
            <div class="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
              <!-- Question Header Meta -->
              <div class="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <span class="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
                  Question ${this.currentIndex + 1}
                </span>
                <div class="flex items-center gap-2 text-xs font-semibold">
                  <span class="text-emerald-600">+${this.activeTest.marksPerCorrect} Marks</span>
                  <span class="text-slate-300">•</span>
                  <span class="text-rose-600">-${this.activeTest.negativeMarksPerWrong} Neg.</span>
                </div>
              </div>

              <!-- Question Prompt -->
              <h3 class="text-base sm:text-lg font-medium text-slate-900 leading-relaxed mb-6">
                ${currentQ.text}
              </h3>

              <!-- Options A, B, C, D -->
              <div class="space-y-3">
                ${['A', 'B', 'C', 'D'].map(optKey => {
                  const optText = currentQ['option' + optKey];
                  const isSelected = this.userAnswers[currentQ.id] === optKey;
                  return `
                    <div 
                      onclick="window.testEngine.selectOption('${currentQ.id}', '${optKey}')"
                      class="option-card p-4 rounded-xl border ${isSelected ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-500' : 'border-slate-200 bg-white'} flex items-center gap-4 transition-all"
                    >
                      <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 border border-slate-300'}">
                        ${optKey}
                      </div>
                      <div class="text-sm font-medium text-slate-800 flex-1">
                        ${optText}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Question Action Bar -->
              <div class="flex flex-wrap items-center justify-between gap-3 mt-8 pt-6 border-t border-slate-100">
                <div class="flex items-center gap-2">
                  <button 
                    onclick="window.testEngine.clearAnswer('${currentQ.id}')"
                    class="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                  >
                    Clear Choice
                  </button>
                  <button 
                    onclick="window.testEngine.toggleReview('${currentQ.id}')"
                    class="px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors border ${
                      this.markedForReview[currentQ.id] 
                        ? 'bg-purple-100 text-purple-800 border-purple-300' 
                        : 'text-slate-600 hover:bg-slate-100 border-slate-200'
                    }"
                  >
                    <i data-lucide="bookmark" class="w-3.5 h-3.5 inline mr-1"></i>
                    ${this.markedForReview[currentQ.id] ? 'Marked for Review' : 'Mark for Review'}
                  </button>
                </div>

                <div class="flex items-center gap-2">
                  <button 
                    onclick="window.testEngine.previousQuestion()"
                    ${this.currentIndex === 0 ? 'disabled' : ''}
                    class="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <button 
                    onclick="window.testEngine.nextQuestion()"
                    ${this.currentIndex === totalQ - 1 ? 'disabled' : ''}
                    class="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Sidebar: Question Palette (1 Col) -->
          <div class="space-y-6">
            <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h4 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Question Palette</h4>
              
              <!-- Palette Status Legend -->
              <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-600 mb-4 pb-3 border-b border-slate-100">
                <div class="flex items-center gap-1.5">
                  <span class="w-3 h-3 rounded bg-emerald-500"></span> Answered
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="w-3 h-3 rounded bg-slate-200 border border-slate-300"></span> Unattempted
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="w-3 h-3 rounded bg-purple-500"></span> Review
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="w-3 h-3 rounded bg-blue-600"></span> Current
                </div>
              </div>

              <!-- Question Grid Numbers -->
              <div class="grid grid-cols-5 gap-2">
                ${this.questions.map((q, idx) => {
                  const isCurrent = idx === this.currentIndex;
                  const isAnswered = !!this.userAnswers[q.id];
                  const isReview = !!this.markedForReview[q.id];

                  let colorClass = 'btn-palette unanswered';
                  if (isCurrent) {
                    colorClass = 'btn-palette current';
                  } else if (isReview) {
                    colorClass = 'btn-palette marked';
                  } else if (isAnswered) {
                    colorClass = 'btn-palette answered';
                  }

                  return `
                    <button 
                      onclick="window.testEngine.jumpToQuestion(${idx})"
                      class="h-9 w-full rounded-lg text-xs font-bold border ${colorClass} flex items-center justify-center transition-transform hover:scale-105"
                    >
                      ${idx + 1}
                    </button>
                  `;
                }).join('')}
              </div>

              <!-- Stats Summary -->
              <div class="mt-6 pt-4 border-t border-slate-100 text-xs space-y-1.5 text-slate-600">
                <div class="flex justify-between">
                  <span>Answered:</span>
                  <strong class="text-emerald-700">${Object.keys(this.userAnswers).length}</strong>
                </div>
                <div class="flex justify-between">
                  <span>Marked for Review:</span>
                  <strong class="text-purple-700">${Object.keys(this.markedForReview).filter(k => this.markedForReview[k]).length}</strong>
                </div>
                <div class="flex justify-between">
                  <span>Remaining:</span>
                  <strong>${totalQ - Object.keys(this.userAnswers).length}</strong>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.updateTimerDisplay();
  }

  selectOption(questionId, optionKey) {
    this.userAnswers[questionId] = optionKey;
    this.renderExamInterface();
  }

  clearAnswer(questionId) {
    delete this.userAnswers[questionId];
    this.renderExamInterface();
  }

  toggleReview(questionId) {
    this.markedForReview[questionId] = !this.markedForReview[questionId];
    this.renderExamInterface();
  }

  jumpToQuestion(index) {
    if (index >= 0 && index < this.questions.length) {
      this.currentIndex = index;
      this.renderExamInterface();
    }
  }

  nextQuestion() {
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
      this.renderExamInterface();
    }
  }

  previousQuestion() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderExamInterface();
    }
  }

  confirmSubmit() {
    const answeredCount = Object.keys(this.userAnswers).length;
    const totalCount = this.questions.length;
    const unattempted = totalCount - answeredCount;

    if (confirm(`You have answered ${answeredCount} of ${totalCount} questions (${unattempted} unattempted).\n\nAre you sure you want to finalize and submit your test?`)) {
      this.submitTest(false);
    }
  }

  submitTest(isTimeout = false) {
    clearInterval(this.timerInterval);

    const user = window.auth.getCurrentUser();
    const test = this.activeTest;
    const questions = this.questions;
    const timeTakenSeconds = Math.max(1, this.totalDurationSeconds - this.secondsRemaining);

    // Evaluate answers
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;

    questions.forEach(q => {
      const chosen = this.userAnswers[q.id];
      if (!chosen) {
        unattemptedCount++;
      } else if (chosen === q.correctOption) {
        correctCount++;
      } else {
        wrongCount++;
      }
    });

    const grossMarks = correctCount * test.marksPerCorrect;
    const negativePenalty = wrongCount * test.negativeMarksPerWrong;
    const finalScore = Math.max(0, grossMarks - negativePenalty);
    const totalPossibleMarks = questions.length * test.marksPerCorrect;
    const percentage = totalPossibleMarks > 0 ? (finalScore / totalPossibleMarks) * 100 : 0;

    // Previous user attempts count
    const existingUserAttempts = window.store.getAttemptsByUser(user ? user.id : 'anon').filter(a => a.testId === test.id);

    const attemptRecord = {
      id: this.currentAttemptId || 'att-' + Date.now(),
      testId: test.id,
      userId: user ? user.id : 'anon',
      userName: user ? user.name : 'Student',
      attemptNumber: existingUserAttempts.length + 1,
      status: isTimeout ? 'Timed Out' : 'Completed',
      startedAt: new Date(Date.now() - (timeTakenSeconds * 1000)).toISOString(),
      submittedAt: new Date().toISOString(),
      timeTakenSeconds: timeTakenSeconds,
      correctCount: correctCount,
      wrongCount: wrongCount,
      unattemptedCount: unattemptedCount,
      grossMarks: grossMarks,
      negativePenalty: negativePenalty,
      finalScore: finalScore,
      percentage: percentage,
      userAnswers: { ...this.userAnswers }
    };

    window.store.recordAttempt(attemptRecord);
    this.showResultModal(attemptRecord.id);
  }

  showResultModal(attemptId) {
    const attempt = window.store.getAttempts().find(a => a.id === attemptId);
    if (!attempt) return;

    const test = window.store.getTestById(attempt.testId);
    const questions = window.store.getQuestionsByTestId(attempt.testId);

    // Calculate rank for this test
    const allAttemptsForTest = window.store.getAttemptsByTest(attempt.testId)
      .sort((a, b) => b.finalScore - a.finalScore || a.timeTakenSeconds - b.timeTakenSeconds);
    const rankIndex = allAttemptsForTest.findIndex(a => a.id === attempt.id);
    const testRank = rankIndex >= 0 ? rankIndex + 1 : 1;

    const minutes = Math.floor(attempt.timeTakenSeconds / 60);
    const seconds = attempt.timeTakenSeconds % 60;
    const timeFormatted = `${minutes}m ${seconds}s`;
    const totalMarks = test ? test.totalQuestions * test.marksPerCorrect : (questions.length * 2);

    const modalContent = document.getElementById('result-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <!-- Header Banner -->
        <div class="text-center pb-6 border-b border-slate-100">
          <div class="w-16 h-16 rounded-full ${attempt.percentage >= 60 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} mx-auto flex items-center justify-center mb-3">
            <i data-lucide="${attempt.percentage >= 60 ? 'trophy' : 'award'}" class="w-8 h-8"></i>
          </div>
          <h3 class="text-xl font-bold text-slate-900">${test ? test.title : 'Test Assessment Report'}</h3>
          <p class="text-xs text-slate-500 mt-1">Attempt #${attempt.attemptNumber} • Submitted on ${new Date(attempt.submittedAt).toLocaleString()}</p>
        </div>

        <!-- 4 Score Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <span class="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Score Obtained</span>
            <span class="text-2xl font-black text-blue-900">${attempt.finalScore.toFixed(1)}</span>
            <span class="text-xs text-blue-600 block">/ ${totalMarks} Marks</span>
          </div>
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <span class="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Percentage</span>
            <span class="text-2xl font-black text-emerald-900">${Math.round(attempt.percentage)}%</span>
            <span class="text-xs text-emerald-600 block">${attempt.percentage >= 50 ? 'Passed' : 'Needs Practice'}</span>
          </div>
          <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
            <span class="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">Test Rank</span>
            <span class="text-2xl font-black text-purple-900">#${testRank}</span>
            <span class="text-xs text-purple-600 block">of ${allAttemptsForTest.length} candidates</span>
          </div>
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
            <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Time Taken</span>
            <span class="text-2xl font-black text-slate-900">${timeFormatted}</span>
            <span class="text-xs text-slate-500 block">Duration</span>
          </div>
        </div>

        <!-- Detailed Breakdown Pills -->
        <div class="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl text-center mb-8 border border-slate-200">
          <div>
            <span class="text-xs text-slate-500 block">Correct Answers</span>
            <span class="text-lg font-bold text-emerald-600">${attempt.correctCount} (+${attempt.grossMarks.toFixed(1)})</span>
          </div>
          <div>
            <span class="text-xs text-slate-500 block">Incorrect Answers</span>
            <span class="text-lg font-bold text-rose-600">${attempt.wrongCount} (-${attempt.negativePenalty.toFixed(1)})</span>
          </div>
          <div>
            <span class="text-xs text-slate-500 block">Unattempted</span>
            <span class="text-lg font-bold text-slate-500">${attempt.unattemptedCount}</span>
          </div>
        </div>

        <!-- Solutions & Explanations Header -->
        <div class="border-t border-slate-200 pt-6">
          <h4 class="text-base font-bold text-slate-900 mb-4 flex items-center justify-between">
            <span>Detailed Solutions & Conceptual Explanations</span>
            <span class="text-xs text-slate-500 font-normal">ICAI Curriculum Standard</span>
          </h4>

          <div class="space-y-4">
            ${questions.map((q, idx) => {
              const studentChoice = attempt.userAnswers ? attempt.userAnswers[q.id] : null;
              const isCorrect = studentChoice === q.correctOption;
              const isSkipped = !studentChoice;

              let statusBadge = '';
              if (isSkipped) {
                statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">Unattempted (0 Marks)</span>';
              } else if (isCorrect) {
                statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Correct (+${test ? test.marksPerCorrect : 2})</span>`;
              } else {
                statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">Incorrect (-${test ? test.negativeMarksPerWrong : 0.5})</span>`;
              }

              return `
                <div class="border border-slate-200 rounded-xl p-5 bg-white space-y-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-slate-500">Q${idx + 1}</span>
                    ${statusBadge}
                  </div>

                  <p class="text-sm font-semibold text-slate-900 leading-relaxed">${q.text}</p>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    ${['A', 'B', 'C', 'D'].map(optKey => {
                      const isStudentSelected = studentChoice === optKey;
                      const isCorrectAnswer = q.correctOption === optKey;
                      
                      let cardStyle = 'border-slate-200 bg-slate-50 text-slate-700';
                      if (isCorrectAnswer) {
                        cardStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold';
                      } else if (isStudentSelected && !isCorrectAnswer) {
                        cardStyle = 'border-rose-400 bg-rose-50 text-rose-900 font-semibold line-through';
                      }

                      return `
                        <div class="p-2.5 rounded-lg border ${cardStyle} flex items-center justify-between">
                          <div class="flex items-center gap-2">
                            <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${isCorrectAnswer ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}">
                              ${optKey}
                            </span>
                            <span>${q['option' + optKey]}</span>
                          </div>
                          ${isStudentSelected ? '<span class="text-[10px] font-bold uppercase ml-2 text-blue-600">Your Choice</span>' : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>

                  <!-- In-depth Explanation Box -->
                  <div class="bg-amber-50/70 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-950 mt-2">
                    <div class="font-bold flex items-center gap-1.5 text-amber-900 mb-1">
                      <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
                      ICAI Standard Explanation:
                    </div>
                    <p class="leading-relaxed text-slate-800">${q.explanation || 'Refer to relevant Accounting Standard / Companies Act provisions.'}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="mt-8 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button 
            onclick="window.app.closeModal('result-modal'); window.app.navigate('leaderboard');"
            class="px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <i data-lucide="bar-chart-2" class="w-4 h-4"></i> View Test Leaderboard
          </button>
          
          <button 
            onclick="window.app.closeModal('result-modal'); window.app.navigate('dashboard');"
            class="px-6 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('result-modal');
  }
}

window.testEngine = new TestEngine();
