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
    this.selectedLevel = 'all';
    this.filterBookmarkedOnly = false;
    this.currentPage = 1;
    this.pageSize = 6;
    this.searchQuery = '';
    this.sortBy = 'new'; // 'new' | 'old' | 'popular'
    this.isPreview = false;
  }

  renderCatalog() {
    // 1. Render Subject Filters with dynamic counts
    this.renderSubjectFilters();

    // 2. Synchronize search input and sort select if present in DOM
    const searchInput = document.getElementById('test-search-input');
    if (searchInput && searchInput.value !== this.searchQuery) {
      searchInput.value = this.searchQuery;
    }
    const clearBtn = document.getElementById('test-search-clear-btn');
    if (clearBtn) {
      if (this.searchQuery.trim()) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    const sortSelect = document.getElementById('test-sort-select');
    if (sortSelect && sortSelect.value !== this.sortBy) {
      sortSelect.value = this.sortBy;
    }

    // 3. Render filtered and sorted cards
    this.renderCards();
  }

  getUserTier() {
    const curUser = window.auth ? window.auth.getCurrentUser() : null;
    if (!curUser) return 'free';
    if (curUser.role === 'admin' || curUser.role === 'teacher') return curUser.role;
    if (window.store && typeof window.store.getUserEntitlements === 'function') {
      const ent = window.store.getUserEntitlements(curUser.id);
      if (ent && ent.isSubscribed && ent.tier) {
        return ent.tier.toLowerCase();
      }
    }
    if (window.store && typeof window.store.getUserSubscription === 'function') {
      const sub = window.store.getUserSubscription(curUser.id);
      const now = new Date();
      if (sub && (sub.status === 'active' || sub.status === 'manually_granted') && (!sub.expiresAt || new Date(sub.expiresAt) > now)) {
        let tier = (sub.planTier || 'core').toLowerCase();
        if (sub.isTrial) tier = 'trial';
        return tier;
      }
    }
    return 'free';
  }

  isTestEligibleForStudent(test, userTier = null) {
    if (!test) return false;
    const tier = (userTier || this.getUserTier()).toLowerCase();
    if (tier === 'admin' || tier === 'teacher') return true;

    if (Array.isArray(test.allowedPlans) && test.allowedPlans.length > 0) {
      const plans = test.allowedPlans.map(p => String(p).toLowerCase().trim());
      if (plans.includes('all')) return true;
      return plans.includes(tier);
    }

    const reqTier = String(test.requiredTier || test.tier || 'free').toLowerCase().trim();
    if (!reqTier || reqTier === 'none' || reqTier === 'free' || reqTier === 'null') {
      return true;
    }
    const tierRanks = { free: 0, none: 0, trial: 1, core: 2, plus: 3, elite: 4 };
    const userRank = tierRanks[tier] || 0;
    const reqRank = tierRanks[reqTier] || 0;
    return userRank >= reqRank;
  }

  isTestVisibleForStudent(test, userTier = null) {
    if (!test) return false;
    const isPub = test.isPublished || test.status === 'Published' || test.status === 'Live';
    const tier = (userTier || this.getUserTier()).toLowerCase();
    const isStaff = tier === 'admin' || tier === 'teacher';
    if (!isPub && !isStaff) return false;

    // Eligible students can always see the test
    if (this.isTestEligibleForStudent(test, tier)) {
      return true;
    }

    // Non-eligible students:
    // Case 2: If admin enabled "Hide from non-eligible students", hide completely
    if (Boolean(test.hideFromNonEligible)) {
      return false;
    }

    // Case 1: "Hide from non-eligible students" is OFF -> remain visible in locked state
    return true;
  }

  formatRequiredPlans(allowedPlans, requiredTier = 'core') {
    if (Array.isArray(allowedPlans) && allowedPlans.length > 0) {
      const clean = allowedPlans.map(p => String(p).toLowerCase().trim()).filter(p => p !== 'free');
      const planNames = {
        'trial': 'Trial Pass (₹9)',
        'core': 'Core Pass',
        'plus': 'Plus Pass',
        'elite': 'Elite Pass'
      };
      const names = clean.filter(p => planNames[p]).map(p => planNames[p]);
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} or ${names[1]}`;
      if (names.length > 2) return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
    }
    const req = String(requiredTier || 'core').toLowerCase().trim();
    if (req === 'trial') return 'Trial Pass';
    if (req === 'core') return 'Core Pass or higher';
    if (req === 'plus') return 'Plus Pass or higher';
    if (req === 'elite') return 'Elite Pass';
    return 'Subscription Pass';
  }

  renderSubjectFilters() {
    const levelContainer = document.getElementById('test-level-pills');
    const subjectContainer = document.getElementById('test-subject-pills') || document.getElementById('test-subject-filters');
    if (!subjectContainer && !levelContainer) return;

    const userTier = this.getUserTier();
    // Unify visibility: Count exactly what is visible to the student
    const allPublishedTests = window.store.getTests().filter(t => t.isPublished || t.status === 'Published' || t.status === 'Live');
    const allVisibleTests = allPublishedTests.filter(t => this.isTestVisibleForStudent(t, userTier));
    const subjects = window.store.getSubjects ? window.store.getSubjects() : [];
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const visibleTestIds = new Set(allVisibleTests.map(t => t.id));
    const bookmarkedCount = user && window.store 
      ? window.store.getBookmarks(user.id).filter(b => (b.itemType === 'test' || !b.itemType) && visibleTestIds.has(b.itemId)).length 
      : 0;
    const levels = ['all', 'CA Foundation', 'CA Intermediate', 'CA Final'];

    if (levelContainer) {
      levelContainer.innerHTML = levels.map(lvl => {
        const isLvlActive = this.selectedLevel === lvl;
        const label = lvl === 'all' ? 'All Levels' : lvl;
        return `
          <button 
            type="button"
            onclick="window.testEngine.filterLevel('${lvl}')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              isLvlActive
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }"
          >
            ${label}
          </button>
        `;
      }).join('');
    }

    if (subjectContainer) {
      subjectContainer.innerHTML = `
        <button 
          type="button"
          onclick="window.testEngine.filterSubject('all')"
          class="px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
            this.selectedSubject === 'all' && !this.filterBookmarkedOnly
              ? 'bg-blue-600 text-white shadow-sm' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }"
        >
          <span>All Tests</span>
          <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono ${this.selectedSubject === 'all' && !this.filterBookmarkedOnly ? 'bg-blue-700/90 text-white' : 'bg-slate-100 text-slate-600'}">${allVisibleTests.length}</span>
        </button>

        <!-- Bookmarked Filter Pill -->
        <button 
          type="button"
          onclick="window.testEngine.toggleBookmarkedFilter()"
          class="px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
            this.filterBookmarkedOnly
              ? 'bg-amber-600 text-white shadow-sm' 
              : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
          }"
        >
          <i data-lucide="bookmark" class="w-3.5 h-3.5 ${this.filterBookmarkedOnly ? 'fill-current' : ''}"></i>
          <span>Bookmarked</span>
          <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono ${this.filterBookmarkedOnly ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'}">${bookmarkedCount}</span>
        </button>

        ${subjects.map(s => {
          const count = allVisibleTests.filter(t => t.subjectId === s.id || t.subject === s.name).length;
          const isActive = this.selectedSubject === s.id && !this.filterBookmarkedOnly;
          return `
            <button 
              type="button"
              onclick="window.testEngine.filterSubject('${s.id}')"
              class="px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }"
            >
              <span>${s.name}</span>
              <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono ${isActive ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}">${count}</span>
            </button>
          `;
        }).join('')}
      `;
    }

    if (window.lucide) window.lucide.createIcons();
  }

  filterLevel(lvl) {
    this.selectedLevel = lvl;
    this.currentPage = 1;
    this.renderSubjectFilters();
    this.renderCards();
  }

  toggleBookmarkedFilter() {
    this.filterBookmarkedOnly = !this.filterBookmarkedOnly;
    this.currentPage = 1;
    this.renderSubjectFilters();
    this.renderCards();
  }

  toggleBookmark(testId) {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) {
      window.app.showAuthModal('login');
      window.app.showToast('Please sign in to bookmark tests.', 'info');
      return;
    }
    const isNow = window.store.toggleBookmark(user.id, testId, 'test');
    window.app.showToast(isNow ? 'Test bookmarked!' : 'Bookmark removed.', 'info');
    this.renderSubjectFilters();
    this.renderCards();
  }

  goToPage(page) {
    const filtered = this.getFilteredAndSortedTests();
    const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
    if (page < 1 || page > totalPages) return;
    this.currentPage = page;
    this.renderCards();
    const grid = document.getElementById('tests-grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  filterSubject(subjectId) {
    this.selectedSubject = subjectId;
    this.filterBookmarkedOnly = false;
    this.currentPage = 1;
    this.renderSubjectFilters();
    this.renderCards();
  }

  handleSearch(query) {
    this.searchQuery = query || '';
    this.currentPage = 1;
    const clearBtn = document.getElementById('test-search-clear-btn');
    if (clearBtn) {
      if (this.searchQuery.trim()) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    this.renderCards();
  }

  clearSearch() {
    this.searchQuery = '';
    this.currentPage = 1;
    const searchInput = document.getElementById('test-search-input');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('test-search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    this.renderCards();
  }

  handleSort(sortBy) {
    this.sortBy = sortBy || 'new';
    this.currentPage = 1;
    this.renderCards();
  }

  resetFilters() {
    this.selectedSubject = 'all';
    this.selectedLevel = 'all';
    this.filterBookmarkedOnly = false;
    this.currentPage = 1;
    this.searchQuery = '';
    this.sortBy = 'new';
    const searchInput = document.getElementById('test-search-input');
    if (searchInput) searchInput.value = '';
    const sortSelect = document.getElementById('test-sort-select');
    if (sortSelect) sortSelect.value = 'new';
    const clearBtn = document.getElementById('test-search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    this.renderSubjectFilters();
    this.renderCards();
  }

  getFilteredAndSortedTests() {
    let list = window.store.getTests().filter(t => t.isPublished || t.status === 'Published' || t.status === 'Live');
    const user = window.auth ? window.auth.getCurrentUser() : null;

    // 0. Exam Level filter
    if (this.selectedLevel && this.selectedLevel !== 'all') {
      const targetLvl = this.selectedLevel.toUpperCase();
      list = list.filter(t => {
        const tLvl = (t.examLevel || 'CA Foundation').toUpperCase();
        if (targetLvl.includes('FOUNDATION')) return tLvl.includes('FOUNDATION');
        if (targetLvl.includes('INTER')) return tLvl.includes('INTER');
        if (targetLvl.includes('FINAL')) return tLvl.includes('FINAL');
        return tLvl === targetLvl;
      });
    }

    // 1. Bookmarked only filter
    if (this.filterBookmarkedOnly) {
      if (!user) {
        list = [];
      } else {
        list = list.filter(t => window.store.isBookmarked(user.id, t.id));
      }
    }

    // 2. Subject filter
    if (this.selectedSubject !== 'all' && !this.filterBookmarkedOnly) {
      list = list.filter(t => t.subjectId === this.selectedSubject || t.subject === this.selectedSubject);
    }

    // 3. Search filter
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(test => {
        const subject = window.store.getSubjectById(test.subjectId);
        const subjectName = (subject ? subject.name : (test.subject || '')).toLowerCase();
        const title = (test.title || '').toLowerCase();
        const desc = (test.description || '').toLowerCase();
        const topic = (test.chapter || test.topic || '').toLowerCase();
        const tags = Array.isArray(test.tags) ? test.tags.join(' ').toLowerCase() : (test.tags || '').toLowerCase();

        return title.includes(q) || 
               subjectName.includes(q) || 
               desc.includes(q) || 
               topic.includes(q) || 
               tags.includes(q);
      });
    }

    // 3b. Unified visibility filter (Case 1: visible in locked state; Case 2: hidden completely if ineligible)
    const userTier = this.getUserTier();
    list = list.filter(test => this.isTestVisibleForStudent(test, userTier));

    // 4. Sort
    if (this.sortBy === 'new') {
      list.sort((a, b) => new Date(b.createdAt || b.startDate || 0).getTime() - new Date(a.createdAt || a.startDate || 0).getTime());
    } else if (this.sortBy === 'old') {
      list.sort((a, b) => new Date(a.createdAt || a.startDate || 0).getTime() - new Date(b.createdAt || b.startDate || 0).getTime());
    } else if (this.sortBy === 'popular') {
      const getPopularity = (t) => {
        const recordedAttempts = window.store.getAttempts().filter(a => a.testId === t.id).length;
        const basePopularity = typeof t.attemptsCount === 'number' ? t.attemptsCount : 0;
        return basePopularity + recordedAttempts;
      };
      list.sort((a, b) => getPopularity(b) - getPopularity(a));
    }

    return list;
  }

  renderCards() {
    const grid = document.getElementById('tests-grid');
    if (!grid) return;

    const filtered = this.getFilteredAndSortedTests();
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const userAttempts = user ? window.store.getAttemptsByUser(user.id) : [];

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-16 bg-white rounded-xl border border-dashed border-slate-200 p-8">
          <i data-lucide="search-x" class="w-10 h-10 text-slate-400 mx-auto mb-3"></i>
          <h4 class="text-base font-bold text-slate-800">No MCQ tests found.</h4>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            ${this.filterBookmarkedOnly ? "You haven't bookmarked any tests yet. Click the bookmark icon on any test to save it here!" : "No mock tests match your current search query or filters."}
          </p>
          <button 
            type="button"
            onclick="window.testEngine.resetFilters()"
            class="mt-4 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Clear Search & Filters
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Pagination slice
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pagedTests = filtered.slice(startIndex, startIndex + this.pageSize);

    const userTier = this.getUserTier();
    const cardsHtml = pagedTests.map(test => {
      const isEligible = this.isTestEligibleForStudent(test, userTier);
      const subject = window.store.getSubjectById(test.subjectId) || { name: test.subject || 'CA Practice' };
      const testAttempts = user ? userAttempts.filter(a => a.testId === test.id) : [];
      const attemptsUsed = testAttempts.length;
      const maxAttempts = test.maxAttempts || 1;
      const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);
      const canTake = isEligible && (attemptsRemaining > 0);
      const bestAttempt = testAttempts.length > 0 ? Math.max(...testAttempts.map(a => a.percentage)) : null;
      const isBm = user && window.store.isBookmarked ? window.store.isBookmarked(user.id, test.id) : false;
      const points = test.pointsPerCorrect || 10;
      const requiredPlansText = this.formatRequiredPlans(test.allowedPlans, test.requiredTier);

      return `
        <div class="bg-white border ${isEligible ? 'border-slate-200' : 'border-amber-200/90'} rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative group">
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                  ${subject.name}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  ${test.examLevel || 'CA Foundation'}
                </span>
                ${!isEligible ? `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <i data-lucide="lock" class="w-3 h-3 text-amber-700"></i> Locked
                  </span>
                ` : ''}
              </div>
              
              <div class="flex items-center gap-1.5">
                <button 
                  type="button"
                  onclick="event.stopPropagation(); window.testEngine.toggleBookmark('${test.id}')"
                  class="p-1.5 rounded-lg transition-colors cursor-pointer ${isBm ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}"
                  title="${isBm ? 'Bookmarked (Click to remove)' : 'Bookmark this test'}"
                >
                  <i data-lucide="bookmark" class="w-4 h-4 ${isBm ? 'fill-current' : ''}"></i>
                </button>
                <span class="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <i data-lucide="clock" class="w-3.5 h-3.5"></i> ${test.durationMinutes}m
                </span>
              </div>
            </div>

            <h3 class="text-base font-bold text-slate-900 mb-2 leading-snug">${test.title}</h3>
            <p class="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">${test.description}</p>

            ${!isEligible ? `
              <div class="mb-3 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200/90 flex items-center gap-2 text-xs text-amber-900">
                <i data-lucide="shield-alert" class="w-4 h-4 text-amber-600 shrink-0"></i>
                <span class="font-medium">Requires ${requiredPlansText}</span>
              </div>
            ` : ''}

            <div class="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg text-xs mb-4">
              <div>
                <span class="text-slate-400 block text-[11px]">Marking / Points</span>
                <span class="font-bold text-emerald-700">+${test.marksPerCorrect}</span>
                <span class="text-slate-400">/</span>
                <span class="font-bold text-rose-600">-${test.negativeMarksPerWrong}</span>
                <span class="text-[10px] text-amber-700 font-bold block mt-0.5">+${points} XP/correct</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[11px]">Total Questions</span>
                <span class="font-bold text-slate-800">${test.totalQuestions} MCQs</span>
                <span class="text-[10px] text-slate-500 block mt-0.5">${test.maximumMarks || 10} Max Marks</span>
              </div>
            </div>
          </div>

          <div>
            <div class="text-xs py-2 border-t border-slate-100 mb-3 space-y-1">
              <div class="flex items-center justify-between">
                ${isEligible ? `
                  <span class="${canTake ? 'text-slate-600' : 'text-rose-600 font-semibold'}">
                    ${canTake ? `You have <strong>${attemptsRemaining} of ${maxAttempts}</strong> attempt(s) remaining.` : '<strong class="text-rose-600">You have no attempts remaining.</strong>'}
                  </span>
                ` : `
                  <span class="text-amber-800 font-semibold flex items-center gap-1.5">
                    <i data-lucide="lock" class="w-3.5 h-3.5 text-amber-600"></i> Pass Required to Attempt
                  </span>
                `}
                ${bestAttempt !== null ? `<span class="text-emerald-700 font-semibold text-[11px]">Best: ${Math.round(bestAttempt)}%</span>` : ''}
              </div>
            </div>

            <div class="flex items-center gap-2">
              ${isEligible ? `
                <button 
                  onclick="window.testEngine.showInstructionsModal('${test.id}')"
                  class="w-full py-2.5 text-xs font-bold rounded-lg ${
                    canTake 
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  } transition-colors cursor-pointer"
                  ${!canTake ? 'disabled' : ''}
                >
                  ${attemptsUsed === 0 ? 'Start Mock Test' : (canTake ? 'Re-attempt Test' : 'Attempts Limit Reached')}
                </button>
              ` : `
                <button 
                  type="button"
                  onclick="window.testEngine.showUnlockModal('${test.id}')"
                  class="w-full py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <i data-lucide="key" class="w-3.5 h-3.5"></i> Unlock this Mock
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Pagination controls
    let paginationHtml = '';
    if (totalPages > 1) {
      let pageBtns = [];
      for (let p = 1; p <= totalPages; p++) {
        pageBtns.push(`
          <button 
            type="button"
            onclick="window.testEngine.goToPage(${p})"
            class="w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              this.currentPage === p 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }"
          >
            ${p}
          </button>
        `);
      }

      paginationHtml = `
        <div class="col-span-full mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
          <div class="text-xs text-slate-500 font-medium">
            Showing <strong>${startIndex + 1}</strong> - <strong>${Math.min(startIndex + this.pageSize, totalItems)}</strong> of <strong>${totalItems}</strong> Tests
          </div>
          <div class="flex items-center gap-1.5">
            <button 
              type="button" 
              onclick="window.testEngine.goToPage(${this.currentPage - 1})"
              ${this.currentPage === 1 ? 'disabled' : ''}
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Previous
            </button>
            ${pageBtns.join('')}
            <button 
              type="button" 
              onclick="window.testEngine.goToPage(${this.currentPage + 1})"
              ${this.currentPage === totalPages ? 'disabled' : ''}
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      `;
    }

    grid.innerHTML = cardsHtml + paginationHtml;
    if (window.lucide) window.lucide.createIcons();
  }

  showUnlockModal(testId) {
    const test = window.store ? window.store.getTestById(testId) : null;
    if (!test) return;

    const user = window.auth ? window.auth.getCurrentUser() : null;
    const userTier = this.getUserTier();
    const allowedPlans = (Array.isArray(test.allowedPlans) && test.allowedPlans.length > 0)
      ? test.allowedPlans.map(p => String(p).toLowerCase().trim())
      : ['trial', 'core', 'plus', 'elite'];

    let modal = document.getElementById('test-unlock-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'test-unlock-modal';
      modal.className = 'modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 hidden items-center justify-center p-3 sm:p-4';
      modal.innerHTML = `
        <div class="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
          <div id="test-unlock-modal-content" class="overflow-y-auto p-5 sm:p-7 flex-1"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const content = document.getElementById('test-unlock-modal-content');
    if (!content) return;

    const subject = window.store.getSubjectById ? window.store.getSubjectById(test.subjectId) : null;
    const subjectName = subject ? subject.name : (test.subject || 'CA Practice');
    const reqText = this.formatRequiredPlans(test.allowedPlans, test.requiredTier);

    // Build cards for eligible tiers
    const planCards = [];

    if (allowedPlans.includes('trial')) {
      planCards.push(`
        <div class="relative rounded-2xl border-2 border-amber-500/80 bg-gradient-to-b from-amber-50/50 to-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div class="absolute -top-3 left-4 bg-amber-500 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
            Most Popular
          </div>
          <div>
            <div class="flex items-baseline justify-between mt-1 mb-2">
              <h4 class="font-bold text-slate-900 text-sm">₹9 Elite 10-Day Trial</h4>
              <span class="text-base font-extrabold text-amber-600">₹9</span>
            </div>
            <p class="text-xs text-slate-600 mb-3">Instant full Elite access to this test, all questions, & grading for 10 days.</p>
            <ul class="text-[11px] text-slate-500 space-y-1 mb-4">
              <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i> Unlocks this Mock Test immediately</li>
              <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i> 10 days of unlimited mock attempts</li>
            </ul>
          </div>
          <button 
            type="button"
            onclick="window.app.closeModal('test-unlock-modal'); window.subscriptionManager.startCheckout('elite_trial')"
            class="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <i data-lucide="zap" class="w-3.5 h-3.5"></i> Unlock with ₹9 Trial
          </button>
        </div>
      `);
    }

    if (allowedPlans.includes('elite')) {
      planCards.push(`
        <div class="relative rounded-2xl border border-purple-200 bg-gradient-to-b from-purple-50/40 to-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div class="absolute -top-3 left-4 bg-purple-600 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
            All-Access VIP
          </div>
          <div>
            <div class="flex items-baseline justify-between mt-1 mb-2">
              <h4 class="font-bold text-slate-900 text-sm">Elite Pass (Monthly)</h4>
              <span class="text-base font-extrabold text-purple-700">₹149<span class="text-xs font-normal text-slate-500">/mo</span></span>
            </div>
            <p class="text-xs text-slate-600 mb-3">Full access to all MCQs, test papers, 12h priority copy grading & mentorship.</p>
            <ul class="text-[11px] text-slate-500 space-y-1 mb-4">
              <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i> Unlocks all current & future tests</li>
              <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i> +1,500 instant bonus XP points</li>
            </ul>
          </div>
          <button 
            type="button"
            onclick="window.app.closeModal('test-unlock-modal'); window.subscriptionManager.startCheckout('elite_monthly')"
            class="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Get Elite Pass (₹149)
          </button>
        </div>
      `);
    }

    if (allowedPlans.includes('plus')) {
      planCards.push(`
        <div class="relative rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/40 to-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex items-baseline justify-between mb-2">
              <h4 class="font-bold text-slate-900 text-sm">Plus Pass (Monthly)</h4>
              <span class="text-base font-extrabold text-indigo-700">₹99<span class="text-xs font-normal text-slate-500">/mo</span></span>
            </div>
            <p class="text-xs text-slate-600 mb-3">Access to premium MCQs, test papers, and 24h fast-track evaluation.</p>
            <ul class="text-[11px] text-slate-500 space-y-1 mb-4">
              <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i> Full access to this Mock Test</li>
              <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i> +1,000 instant bonus XP points</li>
            </ul>
          </div>
          <button 
            type="button"
            onclick="window.app.closeModal('test-unlock-modal'); window.subscriptionManager.startCheckout('plus_monthly')"
            class="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <i data-lucide="shield" class="w-3.5 h-3.5"></i> Get Plus Pass (₹99)
          </button>
        </div>
      `);
    }

    if (allowedPlans.includes('core')) {
      planCards.push(`
        <div class="relative rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50/40 to-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex items-baseline justify-between mb-2">
              <h4 class="font-bold text-slate-900 text-sm">Core Pass (Monthly)</h4>
              <span class="text-base font-extrabold text-blue-700">₹49<span class="text-xs font-normal text-slate-500">/mo</span></span>
            </div>
            <p class="text-xs text-slate-600 mb-3">Access to all premium MCQ tests and standard 48h copy checking.</p>
            <ul class="text-[11px] text-slate-500 space-y-1 mb-4">
              <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i> Full access to this Mock Test</li>
              <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i> +500 instant bonus XP points</li>
            </ul>
          </div>
          <button 
            type="button"
            onclick="window.app.closeModal('test-unlock-modal'); window.subscriptionManager.startCheckout('core_monthly')"
            class="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <i data-lucide="shield" class="w-3.5 h-3.5"></i> Get Core Pass (₹49)
          </button>
        </div>
      `);
    }

    content.innerHTML = `
      <div class="flex items-start justify-between pb-4 border-b border-slate-100">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
            <i data-lucide="lock" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Unlock Mock Test</h3>
            <p class="text-xs text-slate-500">Select an eligible pass to attempt this test</p>
          </div>
        </div>
        <button 
          type="button" 
          onclick="window.app.closeModal('test-unlock-modal')"
          class="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Test Info Banner -->
      <div class="my-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
        <div class="flex items-center gap-2 mb-1">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
            ${subjectName}
          </span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            Requires ${reqText}
          </span>
        </div>
        <h4 class="text-sm font-bold text-slate-900">${test.title}</h4>
        <p class="text-xs text-slate-500 mt-1">${test.durationMinutes} mins • ${test.totalQuestions} Questions • ${test.maximumMarks || 10} Marks</p>
      </div>

      <!-- Passes Grid -->
      <div class="grid grid-cols-1 ${planCards.length > 1 ? 'sm:grid-cols-2' : ''} gap-3.5 mb-5">
        ${planCards.join('')}
      </div>

      <!-- Footer action -->
      <div class="pt-3 border-t border-slate-100 text-center flex items-center justify-between">
        <span class="text-xs text-slate-500">Need multi-month or full bundles?</span>
        <button 
          type="button" 
          onclick="window.app.closeModal('test-unlock-modal'); window.subscriptionManager.openPricingModal()"
          class="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer flex items-center gap-1"
        >
          View All Passes & Plans <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;

    window.app.openModal('test-unlock-modal');
    if (window.lucide) window.lucide.createIcons();
  }

  showInstructionsModal(testId) {
    const test = window.store.getTestById(testId);
    if (!test) return;

    const user = window.auth.getCurrentUser();
    if (!user) {
      window.app.showAuthModal('login');
      return;
    }

    if (!this.isTestEligibleForStudent(test)) {
      this.showUnlockModal(testId);
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
      <div class="flex flex-col h-full max-h-[90vh] overflow-hidden">
        <!-- Fixed Header -->
        <div class="flex-shrink-0 bg-white border-b border-slate-200 p-4 sm:p-6 flex items-start justify-between">
          <div>
            <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 mb-1">
              ${subject ? subject.name : 'Chartered Accountancy Test'}
            </span>
            <h3 class="text-lg font-bold text-slate-900">${test.title}</h3>
          </div>
          <button onclick="window.app.closeModal('instructions-modal')" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
          <!-- Exam Parameters Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
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
          <div class="space-y-3 text-xs text-slate-700 leading-relaxed">
            <h4 class="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Examination Rules & Guidelines:</h4>
            <ul class="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>This test contains multiple choice questions with single correct answer.</li>
              <li>Timer will start immediately when you click <strong>Start Test Now</strong>.</li>
              <li>You can navigate between questions using the question palette on the right.</li>
              <li>Unanswered questions will not be penalized.</li>
              <li>Each question carries positive marks for correct and negative deduction for wrong attempts.</li>
              <li>Do not refresh or switch tabs during the test; your progress will be auto-saved locally.</li>
            </ul>
          </div>

          <!-- Rules Acceptance Checkbox -->
          <div class="pt-2">
            <label class="flex items-start gap-2.5 cursor-pointer select-none bg-blue-50/50 p-3 rounded-xl border border-blue-100 hover:bg-blue-50 transition-colors">
              <input type="checkbox" id="agree-test-rules" class="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500">
              <span class="text-xs text-slate-700">
                I have read and understood all the instructions above. I agree to abide by the examination rules.
              </span>
            </label>
          </div>
        </div>

        <!-- Fixed Footer -->
        <div class="flex-shrink-0 bg-slate-50 border-t border-slate-200 p-4 sm:p-6 flex items-center justify-end gap-3">
          <button 
            onclick="window.app.closeModal('instructions-modal')"
            class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onclick="window.testEngine.startTest('${test.id}')"
            id="btn-confirm-start-test"
            class="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors active:scale-[0.98]"
          >
            Start Test Now →
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('instructions-modal');
  }

  async startTest(testId, options = {}) {
    this.isPreview = !!options.isPreview;

    if (!this.isPreview) {
      const agreeCheckbox = document.getElementById('agree-test-rules');
      if (agreeCheckbox && !agreeCheckbox.checked) {
        window.app.showToast('Please confirm that you have read the instructions.', 'warning');
        return;
      }
    }

    const test = window.store.getTestById(testId);
    if (!test) return;

    if (!this.isPreview) {
      if (!this.isTestEligibleForStudent(test)) {
        window.app.closeModal('instructions-modal');
        this.showUnlockModal(testId);
        return;
      }
    }

    // Check attempt limits with backend if not preview
    if (!this.isPreview) {
      const user = window.auth.getCurrentUser();
      if (!user) {
        window.app.showAuthModal('login');
        return;
      }
      const attemptCheck = await window.secureBackend.verifyTestAttemptAllowed(testId, false);
      if (attemptCheck && !attemptCheck.allowed) {
        window.app.showToast(attemptCheck.error || 'You have no attempts remaining.', 'error');
        return;
      }
    }

    // Question delivery: For students, deliver sanitized questions (NO answer keys or explanations in memory)
    let questions = [];
    if (this.isPreview) {
      questions = window.store.getQuestionsByTestId(test.id);
    } else {
      try {
        const user = window.auth ? window.auth.getCurrentUser() : null;
        const token = user ? (user.token || user.email) : '';
        const res = await fetch(`/api/tests?testId=${encodeURIComponent(test.id)}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const body = await res.json();
          if (body && Array.isArray(body.questions) && body.questions.length > 0) {
            questions = body.questions;
          }
        }
      } catch (err) {
        console.warn('Backend test question fetch error, fallback to store:', err);
      }
      if (!questions || questions.length === 0) {
        questions = window.store.getSanitizedQuestions(test.id);
      }
    }

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
    this.currentAttemptId = this.isPreview ? 'preview-' + Date.now() : 'att-' + Date.now();

    // Switch view to exam interface
    window.app.navigate('test-taking');
    this.renderExamInterface();
    this.startTimer();
  }

  exitPreview() {
    clearInterval(this.timerInterval);
    this.activeTest = null;
    this.isPreview = false;
    window.app.navigate('admin');
    window.adminDashboard.renderMCQTests();
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
    const hasQImage = !!currentQ.questionImage;

    container.innerHTML = `
      <!-- PREVIEW MODE BANNER (If Admin Preview) -->
      ${this.isPreview ? `
        <div class="bg-amber-500 text-slate-900 px-4 sm:px-8 py-2.5 text-xs font-black uppercase tracking-wider flex items-center justify-between shadow-md sticky top-0 z-40 border-b border-amber-600">
          <div class="flex items-center gap-2">
            <i data-lucide="shield-alert" class="w-4 h-4 text-slate-950"></i>
            <span>ADMIN PREVIEW — THIS IS NOT A REAL ATTEMPT (Zero student attempts consumed)</span>
          </div>
          <button 
            onclick="window.testEngine.exitPreview()" 
            class="px-3.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
          >
            Exit Preview ✕
          </button>
        </div>
      ` : ''}

      <!-- Exam Header Bar -->
      <div class="bg-white border-b border-slate-200 sticky ${this.isPreview ? 'top-10' : 'top-0'} z-30 px-3 sm:px-8 py-2.5 sm:py-3.5 shadow-sm">
        <div class="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
          <div class="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                CA
              </div>
              <div class="min-w-0">
                <h2 class="text-xs sm:text-sm font-bold text-slate-900 truncate">${this.activeTest.title}</h2>
                <span class="text-[11px] sm:text-xs text-slate-500 font-medium">Question ${this.currentIndex + 1} of ${totalQ}</span>
              </div>
            </div>
          </div>

          <!-- Live Timer & Submit Buttons -->
          <div class="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto">
            <div class="bg-slate-100 border border-slate-200 px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg flex items-center gap-2">
              <i data-lucide="timer" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600"></i>
              <div class="flex flex-col text-right">
                <span class="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-bold">Time Left</span>
                <span id="exam-timer" class="text-sm sm:text-base font-mono font-bold text-slate-900">00:00</span>
              </div>
            </div>

            <button 
              onclick="window.testEngine.confirmSubmit()"
              class="px-3.5 py-2 sm:px-4 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0"
            >
              <i data-lucide="check-square" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
              ${this.isPreview ? 'Finish Preview' : 'Submit Test'}
            </button>
          </div>
        </div>
      </div>

      <!-- Exam Workspace: Question Area + Palette -->
      <div class="max-w-7xl mx-auto px-3 sm:px-8 py-4 sm:py-6">
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
          
          <!-- Left Main: Active Question (3 Cols) -->
          <div class="lg:col-span-3 space-y-6">
            <div class="bg-white border border-slate-200 rounded-xl p-4 sm:p-8 shadow-sm">
              <!-- Question Header Meta -->
              <div class="flex items-center justify-between border-b border-slate-100 pb-3 sm:pb-4 mb-4 sm:mb-6">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
                    Question ${this.currentIndex + 1}
                  </span>
                  ${currentQ.isLocked ? `
                    <span class="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                      <i data-lucide="lock" class="w-3 h-3"></i> ${(currentQ.requiredTier || 'plus').toUpperCase()} PASS
                    </span>
                  ` : ''}
                </div>
                <div class="flex items-center gap-2 text-xs font-semibold">
                  <span class="text-emerald-600">+${(typeof currentQ.marks === 'number' && currentQ.marks > 0) ? currentQ.marks : (this.activeTest.marksPerCorrect || 2.0)} Marks</span>
                  <span class="text-slate-300">•</span>
                  <span class="text-rose-600">-${this.activeTest.negativeMarksPerWrong} Neg.</span>
                </div>
              </div>

              ${currentQ.isLocked ? `
                <!-- Locked Question State -->
                <div class="bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 border-2 border-dashed border-indigo-200 rounded-2xl p-6 sm:p-10 text-center space-y-4 my-2">
                  <div class="w-14 h-14 mx-auto rounded-2xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-sm">
                    <i data-lucide="lock" class="w-7 h-7"></i>
                  </div>
                  <div>
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200 mb-2">
                      <i data-lucide="shield" class="w-3.5 h-3.5"></i> ${(currentQ.requiredTier || 'plus').toUpperCase()} PASS REQUIRED
                    </span>
                    <h3 class="text-base sm:text-lg font-bold text-slate-900 mt-2">This Question is Locked</h3>
                    <p class="text-xs sm:text-sm text-slate-600 max-w-md mx-auto mt-1 leading-relaxed">
                      This premium MCQ requires an active ${(currentQ.requiredTier || 'plus').toUpperCase()} Pass or higher. Upgrade your membership pass to unlock this question and complete the full test paper.
                    </p>
                  </div>
                  <div class="pt-3 flex flex-wrap items-center justify-center gap-3">
                    <button 
                      type="button"
                      onclick="window.app.navigate('passes')" 
                      class="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <i data-lucide="sparkles" class="w-4 h-4"></i> View Passes & Upgrade
                    </button>
                  </div>
                </div>
              ` : `
                <!-- Question Prompt (Text & Optional Image) -->
                <div class="space-y-4 mb-6">
                  <div class="text-base sm:text-lg font-medium text-slate-900 leading-relaxed">
                    ${currentQ.text}
                  </div>
                  ${hasQImage ? `
                    <div class="max-w-md mx-auto rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-2 text-center">
                      <img src="${currentQ.questionImage}" alt="Question Diagram" class="w-full h-auto object-contain max-h-64 rounded-lg mx-auto">
                    </div>
                  ` : ''}
                </div>

                <!-- Options A, B, C, D (Supporting Text & Mixed Images) -->
                <div class="space-y-3">
                  ${['A', 'B', 'C', 'D'].map(optKey => {
                    const optText = currentQ['option' + optKey];
                    const optImg = currentQ.optionImages ? currentQ.optionImages[optKey] : null;
                    const isSelected = this.userAnswers[currentQ.id] === optKey;

                    return `
                      <div 
                        onclick="window.testEngine.selectOption('${currentQ.id}', '${optKey}')"
                        class="option-card p-3 sm:p-4 rounded-xl border ${isSelected ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300'} flex items-start sm:items-center gap-3 sm:gap-4 transition-all cursor-pointer"
                      >
                        <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 border border-slate-300'}">
                          ${optKey}
                        </div>
                        <div class="text-xs sm:text-sm font-medium text-slate-800 flex-1 space-y-2">
                          ${optText ? `<div>${optText}</div>` : ''}
                          ${optImg ? `<div><img src="${optImg}" class="max-h-20 sm:max-h-24 rounded border border-slate-200 object-contain"></div>` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}

              <!-- Question Action Bar -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-slate-100">
                <div class="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                  <button 
                    onclick="window.testEngine.clearAnswer('${currentQ.id}')"
                    class="w-full sm:w-auto px-3 py-2 min-h-[40px] text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200 cursor-pointer text-center"
                  >
                    Clear Choice
                  </button>
                  <button 
                    onclick="window.testEngine.toggleReview('${currentQ.id}')"
                    class="w-full sm:w-auto px-3 py-2 min-h-[40px] text-xs font-semibold rounded-lg transition-colors border ${
                      this.markedForReview[currentQ.id] 
                        ? 'bg-purple-100 text-purple-800 border-purple-300' 
                        : 'text-slate-600 hover:bg-slate-100 border-slate-200'
                    } cursor-pointer text-center"
                  >
                    <i data-lucide="bookmark" class="w-3.5 h-3.5 inline mr-1"></i>
                    ${this.markedForReview[currentQ.id] ? 'Marked' : 'Mark Review'}
                  </button>
                </div>

                <div class="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                  <button 
                    onclick="window.testEngine.previousQuestion()"
                    ${this.currentIndex === 0 ? 'disabled' : ''}
                    class="w-full sm:w-auto px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-center"
                  >
                    ← Previous
                  </button>
                  <button 
                    onclick="window.testEngine.nextQuestion()"
                    ${this.currentIndex === totalQ - 1 ? 'disabled' : ''}
                    class="w-full sm:w-auto px-5 py-2 min-h-[40px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-center"
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
                  <span class="w-3 h-3 rounded bg-slate-100 border border-dashed border-slate-400 flex items-center justify-center text-[8px] leading-none">🔒</span> Locked
                </div>
              </div>

              <!-- Question Grid Numbers -->
              <div class="grid grid-cols-5 gap-2">
                ${this.questions.map((q, idx) => {
                  const isCurrent = idx === this.currentIndex;
                  const isAnswered = !!this.userAnswers[q.id];
                  const isReview = !!this.markedForReview[q.id];
                  const isLocked = !!q.isLocked;

                  let colorClass = 'btn-palette unanswered';
                  if (isCurrent) colorClass = 'btn-palette current ring-2 ring-blue-500';
                  else if (isReview) colorClass = 'btn-palette marked';
                  else if (isAnswered) colorClass = 'btn-palette answered';
                  else if (isLocked) colorClass = 'btn-palette locked bg-slate-100 text-slate-400 border border-dashed border-slate-300';

                  return `
                    <button 
                      onclick="window.testEngine.jumpToQuestion(${idx})"
                      class="h-9 w-full rounded-lg text-xs font-bold border ${colorClass} flex items-center justify-center transition-transform hover:scale-105 cursor-pointer gap-0.5"
                      title="${isLocked ? 'Locked (' + (q.requiredTier || 'plus').toUpperCase() + ' Pass)' : 'Question ' + (idx + 1)}"
                    >
                      ${isLocked ? '<i data-lucide="lock" class="w-2.5 h-2.5 inline-block opacity-70"></i>' : ''}
                      <span>${idx + 1}</span>
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
    const q = this.questions.find(x => x.id === questionId);
    if (q && q.isLocked) return;
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

  async submitTest(isTimeout = false) {
    clearInterval(this.timerInterval);

    const user = window.auth.getCurrentUser();
    const test = this.activeTest;
    const timeTakenSeconds = Math.max(1, this.totalDurationSeconds - this.secondsRemaining);

    // Retrieve questions with answer keys (unlocked upon submission)
    const questionsWithKeys = window.store.getQuestionsByTestId(test.id);

    // Evaluate answers
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;
    let grossMarks = 0;
    let totalPossibleMarks = 0;

    const defaultPos = typeof test.marksPerCorrect === 'number' ? test.marksPerCorrect : 2.0;
    const neg = typeof test.negativeMarksPerWrong === 'number' ? test.negativeMarksPerWrong : 0.5;

    questionsWithKeys.forEach(q => {
      const qMark = (typeof q.marks === 'number' && q.marks > 0) ? q.marks : defaultPos;
      totalPossibleMarks += qMark;
      const chosen = this.userAnswers[q.id];
      if (!chosen) {
        unattemptedCount++;
      } else if (chosen === q.correctOption) {
        correctCount++;
        grossMarks += qMark;
      } else {
        wrongCount++;
      }
    });

    const negativePenalty = wrongCount * neg;
    const finalScore = Math.max(0, grossMarks - negativePenalty);
    if (totalPossibleMarks <= 0) {
      totalPossibleMarks = test.maximumMarks || (questionsWithKeys.length * defaultPos);
    }
    const percentage = totalPossibleMarks > 0 ? (finalScore / totalPossibleMarks) * 100 : 0;

    const earnedPoints = correctCount * (test.pointsPerCorrect || 10);

    if (this.isPreview) {
      // PREVIEW MODE: ZERO ATTEMPTS CONSUMED
      const previewRecord = {
        id: 'preview-' + Date.now(),
        testId: test.id,
        userId: user ? user.id : 'admin',
        userName: 'Admin Preview',
        attemptNumber: 1,
        status: 'Preview Completed',
        startedAt: new Date(Date.now() - (timeTakenSeconds * 1000)).toISOString(),
        submittedAt: new Date().toISOString(),
        timeTakenSeconds: timeTakenSeconds,
        correctCount: correctCount,
        wrongCount: wrongCount,
        unattemptedCount: unattemptedCount,
        grossMarks: grossMarks,
        negativePenalty: negativePenalty,
        finalScore: finalScore,
        earnedPoints: earnedPoints,
        percentage: percentage,
        userAnswers: { ...this.userAnswers }
      };

      this.showResultModal(null, previewRecord, questionsWithKeys);
      return;
    }

    // Normal student submission: call backend if possible
    let backendAttempt = null;
    let backendQuestions = null;
    try {
      const resp = await window.secureBackend.submitTestAnswers(test.id, this.userAnswers, timeTakenSeconds, false);
      if (resp && resp.success && resp.attempt) {
        backendAttempt = resp.attempt;
        backendQuestions = resp.questions;
      }
    } catch (e) {}

    const existingUserAttempts = window.store.getAttemptsByUser(user ? user.id : 'anon').filter(a => a.testId === test.id);

    const attemptRecord = backendAttempt || {
      id: this.currentAttemptId || 'att-' + Date.now(),
      testId: test.id,
      userId: user ? user.id : 'anon',
      userName: user ? user.name : 'Student',
      attemptNumber: existingUserAttempts.length + 1,
      status: isTimeout ? 'Timed Out' : 'Completed',
      startedAt: new Date(Date.now() - (timeTakenSeconds * 1000)).toISOString(),
      submittedAt: new Date().toISOString(),
      timeTakenSeconds: timeTakenSeconds,
      totalQuestions: questionsWithKeys.length,
      correctCount: correctCount,
      wrongCount: wrongCount,
      unattemptedCount: unattemptedCount,
      grossMarks: grossMarks,
      negativePenalty: negativePenalty,
      finalScore: finalScore,
      totalMarks: totalPossibleMarks,
      earnedPoints: earnedPoints,
      percentage: percentage,
      userAnswers: { ...this.userAnswers }
    };

    if (attemptRecord.earnedPoints === undefined) {
      attemptRecord.earnedPoints = earnedPoints;
    }
    if (attemptRecord.totalMarks === undefined) {
      attemptRecord.totalMarks = totalPossibleMarks;
    }

    window.store.recordAttempt(attemptRecord);

    // Record Authoritative XP Transaction for Student
    if (user && user.role === 'student' && earnedPoints > 0) {
      const oldTotalXp = window.store.getUserTotalXp ? window.store.getUserTotalXp(user.id) : (user.totalXp || 0);
      window.store.recordXpTransaction({
        idempotencyKey: `mcq_attempt_${attemptRecord.id}`,
        userId: user.id,
        sourceType: 'mcq_test',
        sourceId: test.id,
        activityName: `MCQ: ${test.title}`,
        points: earnedPoints,
        resultStatus: finalScore >= (totalPossibleMarks * 0.4) ? 'Passed' : 'Completed',
        metadata: {
          score: finalScore,
          totalMarks: totalPossibleMarks,
          correct: correctCount,
          wrong: wrongCount
        }
      });
      const newTotalXp = window.store.getUserTotalXp ? window.store.getUserTotalXp(user.id) : (oldTotalXp + earnedPoints);
      if (window.leaderboardManager && typeof window.leaderboardManager.triggerRankUpIfEligible === 'function') {
        window.leaderboardManager.triggerRankUpIfEligible(user.id, oldTotalXp, newTotalXp);
      }
    }

    // Notify student about score and earned platform points
    if (user && window.store && typeof window.store.addNotification === 'function') {
      window.store.addNotification({
        userId: user.id,
        type: 'points_received',
        title: 'MCQ Assessment Completed!',
        message: `You scored ${finalScore.toFixed(1)}/${totalPossibleMarks} on "${test.title}" and earned +${earnedPoints} Platform Points for the Leaderboard!`,
        link: 'leaderboard',
        metadata: { testId: test.id, points: earnedPoints }
      });
    }

    if (window.leaderboardManager) {
      window.leaderboardManager.calculateAllStandings();
    }
    this.showResultModal(attemptRecord.id, null, backendQuestions || questionsWithKeys);
  }

  showResultModal(attemptId, previewRecord = null, unlockedQuestions = null) {
    const attempt = previewRecord || window.store.getAttempts().find(a => a.id === attemptId);
    if (!attempt) return;

    const test = window.store.getTestById(attempt.testId);
    const questions = unlockedQuestions || window.store.getQuestionsByTestId(attempt.testId);

    const allAttemptsForTest = window.store.getAttemptsByTest(attempt.testId)
      .sort((a, b) => b.finalScore - a.finalScore || a.timeTakenSeconds - b.timeTakenSeconds);
    const rankIndex = allAttemptsForTest.findIndex(a => a.id === attempt.id);
    const testRank = rankIndex >= 0 ? rankIndex + 1 : 1;

    const minutes = Math.floor(attempt.timeTakenSeconds / 60);
    const seconds = attempt.timeTakenSeconds % 60;
    const timeFormatted = `${minutes}m ${seconds}s`;
    const pos = test ? (Number(test.marksPerCorrect) || 2.0) : 2.0;
    const neg = test ? (Number(test.negativeMarksPerWrong) || 0.5) : 0.5;

    const qSum = (questions && questions.length > 0)
      ? questions.reduce((sum, q) => sum + ((typeof q.marks === 'number' && q.marks > 0) ? q.marks : pos), 0)
      : 0;
    const attemptSavedMarks = attempt.totalMarks ? Number(attempt.totalMarks) : 0;
    const testMaxMarks = test && test.maximumMarks ? Number(test.maximumMarks) : 0;
    const totalMarks = Math.max(qSum, attemptSavedMarks, testMaxMarks, (questions && questions.length > 0 ? questions.length * pos : 0), 1);

    const percentage = Math.min(100, Math.max(0, totalMarks > 0 ? (attempt.finalScore / totalMarks) * 100 : (attempt.percentage || 0)));
    const totalAttempted = (attempt.correctCount || 0) + (attempt.wrongCount || 0);
    const accuracy = totalAttempted > 0 ? Math.round(((attempt.correctCount || 0) / totalAttempted) * 100) : 0;
    const pointsEarned = attempt.earnedPoints !== undefined ? attempt.earnedPoints : ((attempt.correctCount || 0) * (test ? (test.pointsPerCorrect || 10) : 10));

    const modalContent = document.getElementById('result-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-4 sm:p-8 max-h-[90vh] overflow-y-auto">
        <!-- Header Banner -->
        ${previewRecord ? `
          <div class="bg-amber-100 border border-amber-300 text-amber-950 p-3 rounded-xl mb-4 text-center font-bold text-xs uppercase tracking-wider">
            ADMIN PREVIEW ASSESSMENT REPORT (No attempt record was saved)
          </div>
        ` : ''}

        <div class="text-center pb-6 border-b border-slate-100">
          <div class="w-16 h-16 rounded-full ${percentage >= 50 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} mx-auto flex items-center justify-center mb-3">
            <i data-lucide="${percentage >= 50 ? 'trophy' : 'award'}" class="w-8 h-8"></i>
          </div>
          <h3 class="text-lg sm:text-xl font-bold text-slate-900">${test ? test.title : 'Assessment Report'}</h3>
          <p class="text-xs text-slate-500 mt-1">
            ${previewRecord ? 'Admin Test Preview Mode' : `Attempt #${attempt.attemptNumber} • Submitted on ${new Date(attempt.submittedAt).toLocaleString()}`}
          </p>
        </div>

        <!-- 5 Score Cards (Academic Marks & Platform Points Separated) -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3 my-4 sm:my-6">
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4 text-center">
            <span class="text-[10px] sm:text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Academic Score</span>
            <span class="text-xl sm:text-2xl font-black text-blue-900">${attempt.finalScore.toFixed(1)}</span>
            <span class="text-[11px] sm:text-xs text-blue-600 block">/ ${totalMarks} Marks</span>
          </div>
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 text-center">
            <span class="text-[10px] sm:text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Platform Points</span>
            <span class="text-xl sm:text-2xl font-black text-amber-900">+${pointsEarned}</span>
            <span class="text-[11px] sm:text-xs text-amber-600 block">Leaderboard XP</span>
          </div>
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:p-4 text-center">
            <span class="text-[10px] sm:text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Percentage</span>
            <span class="text-xl sm:text-2xl font-black text-emerald-900">${Math.round(percentage)}%</span>
            <span class="text-[11px] sm:text-xs text-emerald-600 block">${percentage >= 50 ? 'Passed' : 'Needs Practice'}</span>
          </div>
          <div class="bg-purple-50 border border-purple-200 rounded-xl p-3 sm:p-4 text-center">
            <span class="text-[10px] sm:text-[11px] font-bold text-purple-700 uppercase tracking-wider block">Accuracy</span>
            <span class="text-xl sm:text-2xl font-black text-purple-900">${accuracy}%</span>
            <span class="text-[11px] sm:text-xs text-purple-600 block">${attempt.correctCount || 0}/${totalAttempted} Attempted</span>
          </div>
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 text-center col-span-2 sm:col-span-1">
            <span class="text-[10px] sm:text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Rank & Time</span>
            <span class="text-xl sm:text-2xl font-black text-slate-900">#${testRank}</span>
            <span class="text-[11px] sm:text-xs text-slate-500 block">${timeFormatted}</span>
          </div>
        </div>

        <!-- Detailed Breakdown Pills (Dynamic Marking) -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 bg-slate-50 p-3 sm:p-4 rounded-xl text-center mb-6 sm:mb-8 border border-slate-200">
          <div class="p-2 sm:p-0">
            <span class="text-xs text-slate-500 block">Correct Answers</span>
            <span class="text-base sm:text-lg font-bold text-emerald-600">${attempt.correctCount} (+${attempt.grossMarks.toFixed(1)} Marks)</span>
          </div>
          <div class="p-2 sm:p-0 border-t sm:border-t-0 sm:border-l sm:border-r border-slate-200">
            <span class="text-xs text-slate-500 block">Incorrect Answers</span>
            <span class="text-base sm:text-lg font-bold text-rose-600">${attempt.wrongCount} (-${attempt.negativePenalty.toFixed(1)} Marks)</span>
          </div>
          <div class="p-2 sm:p-0 border-t sm:border-t-0 border-slate-200">
            <span class="text-xs text-slate-500 block">Unattempted</span>
            <span class="text-base sm:text-lg font-bold text-slate-500">${attempt.unattemptedCount} (0 Marks)</span>
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
              const qPos = (typeof q.marks === 'number' && q.marks > 0) ? q.marks : pos;
              const qNeg = (typeof q.negativeMarks === 'number' && q.negativeMarks >= 0) ? q.negativeMarks : neg;

              let statusBadge = '';
              if (isSkipped) {
                statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">Unattempted (0 / ${qPos} Marks)</span>`;
              } else if (isCorrect) {
                statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Correct (+${qPos} / ${qPos} Marks)</span>`;
              } else {
                statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">Incorrect (-${qNeg} / ${qPos} Marks)</span>`;
              }

              return `
                <div class="border border-slate-200 rounded-xl p-5 bg-white space-y-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-slate-500">Q${idx + 1}</span>
                    ${statusBadge}
                  </div>

                  <div class="text-sm font-semibold text-slate-900 leading-relaxed">${q.text}</div>
                  ${q.questionImage ? `
                    <div class="max-w-sm rounded-lg overflow-hidden border border-slate-200 my-2">
                      <img src="${q.questionImage}" class="max-h-36 object-contain">
                    </div>
                  ` : ''}

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    ${['A', 'B', 'C', 'D'].map(optKey => {
                      const isStudentSelected = studentChoice === optKey;
                      const isCorrectAnswer = q.correctOption === optKey;
                      const optImg = q.optionImages ? q.optionImages[optKey] : null;
                      
                      let cardStyle = 'border-slate-200 bg-slate-50 text-slate-700';
                      if (isCorrectAnswer) {
                        cardStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold';
                      } else if (isStudentSelected && !isCorrectAnswer) {
                        cardStyle = 'border-rose-400 bg-rose-50 text-rose-900 font-semibold line-through';
                      }

                      return `
                        <div class="p-2.5 rounded-lg border ${cardStyle} flex items-start sm:items-center justify-between gap-2">
                          <div class="flex items-start sm:items-center gap-2">
                            <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${isCorrectAnswer ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}">
                              ${optKey}
                            </span>
                            <div class="space-y-1">
                              <span>${q['option' + optKey]}</span>
                              ${optImg ? `<img src="${optImg}" class="max-h-16 rounded border border-slate-200 object-contain">` : ''}
                            </div>
                          </div>
                          ${isStudentSelected ? '<span class="text-[10px] font-bold uppercase ml-2 text-blue-600 flex-shrink-0">Your Choice</span>' : ''}
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
                    ${q.explanationImage ? `
                      <div class="mt-2 border-t border-amber-200 pt-2">
                        <p class="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">ICAI Reference Diagram:</p>
                        <img src="${q.explanationImage}" alt="ICAI Explanation Diagram" class="max-h-48 rounded border border-amber-300 object-contain bg-white w-full" onerror="this.style.display='none'">
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="mt-8 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          ${previewRecord ? `
            <button 
              onclick="window.app.closeModal('result-modal'); window.testEngine.exitPreview();"
              class="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors ml-auto cursor-pointer"
            >
              ← Return to Admin Portal
            </button>
          ` : `
            <button 
              onclick="window.app.closeModal('result-modal'); window.app.navigate('leaderboard');"
              class="px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="bar-chart-2" class="w-4 h-4"></i> View Test Leaderboard
            </button>
            
            <button 
              onclick="window.app.closeModal('result-modal'); window.app.navigate('dashboard');"
              class="px-6 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Return to Dashboard
            </button>
          `}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('result-modal');
  }
}

window.testEngine = new TestEngine();
