/**
 * assignment-portal.js - Examination Papers & Student Answer Sheet Submissions for ExcellenceCA
 * Features:
 * - Direct URL: index.html#assignments
 * - Display admin-created test papers with CA Foundation subjects
 * - Search bar with instant clear & dynamic filtering
 * - Subject filter pills with dynamic count badges
 * - Status filter (All, Pending Attempt, Submitted, Checked / Evaluated)
 * - Sorting (Newest First, Oldest First, Highest Marks)
 * - Equal card heights across rows & strict 7-part internal vertical alignment
 * - Scrollable description container preserving 100% of problem text
 * - Protected Question Paper downloads (authenticated students only)
 * - Student Answer Sheet download (strictly student-isolated)
 * - Faculty Evaluated / Checked Answer Sheet download (strictly student-isolated)
 * - Magic-byte %PDF- validation and one-time submission protection
 */

class AssignmentPortal {
  constructor() {
    this.currentAssignmentId = null;
    this.selectedPdfFile = null;
    this.selectedSubject = 'all';
    this.selectedLevel = 'all';
    this.filterBookmarkedOnly = false;
    this.currentPage = 1;
    this.pageSize = 6;
    this.searchQuery = '';
    this.selectedStatus = 'all';
    this.sortBy = 'new';
  }

  render() {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const serverTime = window.secureBackend ? window.secureBackend.getAuthoritativeTime() : new Date();
    const userSubmissions = user ? window.store.getSubmissionsByUser(user.id) : [];

    // Synchronize papers from backend (fetches admin-uploaded papers that aren't in localStorage)
    if (!this._isSyncingPapers && typeof fetch !== 'undefined') {
      this._isSyncingPapers = true;
      const token = user ? (user.token || user.email) : '';
      fetch('/api/papers', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data && Array.isArray(data.papers)) {
          const localAssignments = window.store.getAssignments();
          let changed = false;
          data.papers.forEach(bp => {
            if (!bp.id) return;
            const existIdx = localAssignments.findIndex(a => a.id === bp.id);
            if (existIdx === -1) {
              // New paper from backend — add it
              // Map backend paper fields to local assignment format
              const paperObj = {
                id: bp.id,
                title: bp.title || 'Untitled Paper',
                subjectId: bp.subjectId || '',
                subject: bp.subject || '',
                topic: bp.topic || '',
                maximumMarks: bp.maximumMarks || 0,
                durationMinutes: bp.durationMinutes || 0,
                description: bp.description || '',
                status: bp.effectiveStatus || bp.status || 'Published',
                isPublished: bp.effectiveStatus !== 'Draft' && bp.status !== 'Draft',
                isLive: bp.isLive || bp.effectiveStatus === 'Live Now',
                questionPdfName: bp.questionPdfName || null,
                questionPdfId: bp.questionPdfId || null,
                questionPdfData: bp.questionPdfData || null,
                answerPdfName: bp.answerPdfName || null,
                answerPdfId: bp.answerPdfId || null,
                answerPdfData: bp.answerPdfData || null,
                scheduledPublishTime: bp.scheduledPublishTime || null,
                liveStartTime: bp.liveStartTime || null,
                liveEndTime: bp.liveEndTime || null,
                expiryTime: bp.expiryTime || null,
                deadline: bp.deadline || null,
                createdAt: bp.createdAt || new Date().toISOString()
              };
              localAssignments.unshift(paperObj);
              changed = true;
            } else {
              // Existing paper — update metadata (title, status, PDF info)
              const existing = localAssignments[existIdx];
              const updateFields = ['title', 'subject', 'subjectId', 'topic', 'maximumMarks', 'durationMinutes', 'description', 'status', 'questionPdfName', 'questionPdfId', 'answerPdfName', 'answerPdfId'];
              updateFields.forEach(f => {
                if (bp[f] !== undefined && bp[f] !== null && existing[f] !== bp[f]) {
                  existing[f] = bp[f];
                  changed = true;
                }
              });
              // Update computed fields
              if (bp.effectiveStatus) {
                const newPublished = bp.effectiveStatus !== 'Draft';
                if (existing.isPublished !== newPublished) {
                  existing.isPublished = newPublished;
                  changed = true;
                }
              }
              // Sync PDF data if local is missing but backend has it
              if (!existing.questionPdfData && bp.questionPdfData) {
                existing.questionPdfData = bp.questionPdfData;
                changed = true;
              }
              if (!existing.answerPdfData && bp.answerPdfData) {
                existing.answerPdfData = bp.answerPdfData;
                changed = true;
              }
            }
          });
          if (changed) {
            window.store.saveAssignments(localAssignments);
            this.render();
          }
        }
      }).catch(() => {}).finally(() => { this._isSyncingPapers = false; });
    }

    // 1. Render Subject Filter Pills with Dynamic Counts
    this.renderSubjectFilters();

    // 2. Synchronize search input and controls with current state
    const searchInput = document.getElementById('assignment-search-input');
    if (searchInput && searchInput.value !== this.searchQuery) {
      searchInput.value = this.searchQuery;
    }
    const clearBtn = document.getElementById('assignment-search-clear-btn');
    if (clearBtn) {
      if (this.searchQuery.trim()) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    }
    const statusSelect = document.getElementById('assignment-status-select');
    if (statusSelect && statusSelect.value !== this.selectedStatus) {
      statusSelect.value = this.selectedStatus;
    }
    const sortSelect = document.getElementById('assignment-sort-select');
    if (sortSelect && sortSelect.value !== this.sortBy) {
      sortSelect.value = this.sortBy;
    }

    // 3. Filter and sort assignments
    const assignments = this.getFilteredAndSortedAssignments();
    const listContainer = document.getElementById('assignment-list');
    if (!listContainer) return;

    if (assignments.length === 0) {
      listContainer.innerHTML = `
        <div class="col-span-full text-center py-16 bg-white rounded-xl border border-dashed border-slate-200 p-8">
          <i data-lucide="search-x" class="w-10 h-10 text-slate-400 mx-auto mb-3"></i>
          <h4 class="text-base font-bold text-slate-800">No examination papers match your filters</h4>
          <p class="text-xs text-slate-500 mt-1">Try changing keywords, selecting another subject, or clearing active filters.</p>
          <button 
            onclick="window.assignmentPortal.resetFilters()" 
            class="mt-4 px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Clear Search & Filters
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      this.renderSubmissionsTable(userSubmissions);
      return;
    }

    // 3.5 Pagination calculation
    const totalPages = Math.max(1, Math.ceil(assignments.length / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pagedAssignments = assignments.slice(startIndex, startIndex + this.pageSize);

    // 4. Render uniform equal-height cards with 7-part aligned structure
    const cardsHtml = pagedAssignments.map(asg => {
      const subject = window.store.getSubjectById(asg.subjectId) || { name: asg.subject || 'Accounting' };
      const submission = userSubmissions.find(s => s.assignmentId === asg.id);
      const isBm = user && window.store && window.store.isBookmarked ? window.store.isBookmarked(user.id, asg.id) : false;
      const examLevel = asg.examLevel || 'CA Foundation';
      
      const evalStatus = window.secureBackend 
        ? window.secureBackend.computePaperStatus(asg, serverTime) 
        : { statusKey: asg.status || 'Published', badgeText: asg.status || 'Published', badgeClass: 'bg-emerald-50 text-emerald-800', canAttempt: true, canDownloadQP: true };

      // Date / Window string display (truncated with tooltip for 1-line guaranteed alignment)
      let timeInfoHtml = '';
      if (evalStatus.statusKey === 'Live' || evalStatus.statusKey === 'Live-Upcoming' || evalStatus.statusKey === 'Live-Ended') {
        if (asg.liveStartTime && asg.liveEndTime) {
          const s = new Date(asg.liveStartTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          const e = new Date(asg.liveEndTime).toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit' });
          timeInfoHtml = `<span class="text-[11px] font-semibold text-rose-700 flex items-center gap-1 truncate" title="Window: ${s} - ${e}"><i data-lucide="clock" class="w-3.5 h-3.5 flex-shrink-0"></i> <span class="truncate">Window: ${s} - ${e}</span></span>`;
        }
      } else if (evalStatus.statusKey === 'Scheduled') {
        const schedStr = asg.scheduledPublishTime ? new Date(asg.scheduledPublishTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Soon';
        timeInfoHtml = `<span class="text-[11px] font-semibold text-indigo-700 flex items-center gap-1 truncate" title="Release: ${schedStr}"><i data-lucide="calendar" class="w-3.5 h-3.5 flex-shrink-0"></i> <span class="truncate">Release: ${schedStr}</span></span>`;
      } else {
        const deadlineDate = new Date(asg.expiryTime || asg.deadline || Date.now() + 30 * 86400000);
        const dStr = deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        timeInfoHtml = `<span class="text-[11px] font-medium text-slate-500 flex items-center gap-1 truncate" title="Due: ${dStr}"><i data-lucide="calendar" class="w-3.5 h-3.5 flex-shrink-0"></i> <span class="truncate">Due: ${dStr}</span></span>`;
      }

      // Concise badge text for top badge
      let badgeLabel = evalStatus.badgeText;
      if (evalStatus.statusKey === 'Scheduled') {
        badgeLabel = 'Scheduled';
      } else if (evalStatus.statusKey === 'Live') {
        badgeLabel = 'Live Now';
      }

      // Submission status tag
      let userSubBadge = '';
      if (submission) {
        if (submission.status === 'Evaluated') {
          const pts = (submission.pointsAwarded !== undefined && submission.pointsAwarded !== null) ? ` • +${submission.pointsAwarded} XP` : '';
          userSubBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex-shrink-0">Checked (${submission.marksObtained}/${asg.maximumMarks} M${pts})</span>`;
        } else {
          userSubBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex-shrink-0">Submitted</span>`;
        }
      }

      return `
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col h-full group box-border">
          <!-- 1. Top Badges/Status (Exact h-8 flex-shrink-0) -->
          <div class="flex items-center justify-between gap-2 mb-3 h-8 flex-shrink-0">
            <div class="flex items-center gap-1.5 flex-wrap overflow-hidden max-w-[60%]">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 truncate" title="${subject.name}">
                ${subject.name}
              </span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                ${examLevel}
              </span>
            </div>
            <div class="flex items-center gap-1.5 justify-end flex-shrink-0">
              <button 
                type="button"
                onclick="event.stopPropagation(); window.assignmentPortal.toggleBookmark('${asg.id}')"
                class="p-1.5 rounded-lg transition-colors cursor-pointer ${isBm ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}"
                title="${isBm ? 'Bookmarked (Click to remove)' : 'Bookmark this test paper'}"
              >
                <i data-lucide="bookmark" class="w-4 h-4 ${isBm ? 'fill-current' : ''}"></i>
              </button>
              ${userSubBadge}
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${evalStatus.badgeClass} flex-shrink-0" title="${evalStatus.badgeText}">
                ${badgeLabel}
              </span>
            </div>
          </div>

          <!-- 2. Assignment Title (Exact h-12 flex-shrink-0 line-clamp-2) -->
          <h3 class="text-base font-bold text-slate-900 mb-1.5 group-hover:text-blue-600 transition-colors h-12 line-clamp-2 leading-snug flex-shrink-0" title="${asg.title}">
            ${asg.title}
          </h3>

          <!-- 3. Subject/Topic (Exact h-5 flex-shrink-0 mb-3) -->
          <div class="h-5 mb-3 flex-shrink-0">
            <span class="text-xs text-slate-500 font-semibold block font-mono truncate" title="${asg.topic || 'CA Foundation Syllabus'}">
              ${asg.topic || 'CA Foundation Syllabus'}
            </span>
          </div>

          <!-- 4. Description (Exact h-28 flex-shrink-0 scrollable box preserving all text) -->
          <div class="h-28 overflow-y-auto pr-1.5 mb-4 bg-slate-50/60 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-600 leading-relaxed scrollbar-thin flex-shrink-0">
            <p class="whitespace-pre-line">${(asg.description || '').replace(/###/g, '')}</p>
          </div>

          <!-- 5. Question Paper (PDF) Section (Exact h-16 flex-shrink-0 mb-4) -->
          <div class="mb-4 bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex items-center justify-between h-16 flex-shrink-0 box-border">
            <div class="flex items-center gap-2 overflow-hidden mr-2">
              <div class="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold flex-shrink-0">
                <i data-lucide="file-text" class="w-4 h-4"></i>
              </div>
              <div class="truncate">
                <span class="text-xs font-bold text-slate-800 block leading-tight">Question Paper (PDF)</span>
                <span class="text-[10px] text-slate-500 font-mono truncate block" title="${asg.questionPdfName || 'Official_QP.pdf'}">
                  ${asg.questionPdfName || 'Official_QP.pdf'}
                </span>
              </div>
            </div>
            <button 
              type="button"
              onclick="window.secureBackend.downloadProtectedFile('${asg.questionPdfId || 'qp.pdf'}', '${asg.id}', 'question', '${asg.questionPdfName || 'QuestionPaper.pdf'}')"
              class="flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg ${evalStatus.canDownloadQP ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer' : 'bg-slate-200 text-slate-400 cursor-not-allowed'} transition-colors flex items-center gap-1"
              ${!evalStatus.canDownloadQP ? 'title="Locked until published/live"' : ''}
            >
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Download PDF
            </button>
          </div>

          <!-- 6. Metadata & 7. Bottom Action Button (Exact horizontal and vertical alignment) -->
          <div class="mt-auto pt-4 border-t border-slate-100 flex-shrink-0">
            <div class="flex items-center justify-between text-xs text-slate-500 mb-3 h-6">
              <div class="overflow-hidden mr-2">
                ${timeInfoHtml}
              </div>
              <div class="flex items-center gap-2 font-bold text-slate-700 text-xs flex-shrink-0">
                <span><i data-lucide="clock" class="w-3.5 h-3.5 inline"></i> ${asg.durationMinutes || 180}m</span>
                <span>•</span>
                <span>${asg.maximumMarks} Marks</span>
              </div>
            </div>

            ${submission ? `
              <button 
                type="button"
                onclick="window.assignmentPortal.openAssignmentModal('${asg.id}')"
                class="w-full h-10 px-4 text-xs font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer box-border"
              >
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600 flex-shrink-0"></i> <span class="truncate">Answer Sheet Submitted • View Details</span>
              </button>
            ` : evalStatus.canAttempt ? `
              <button 
                type="button"
                onclick="window.assignmentPortal.openAssignmentModal('${asg.id}')"
                class="w-full h-10 px-4 text-xs font-bold rounded-lg ${evalStatus.statusKey === 'Live' ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md animate-pulse border border-rose-600' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm border border-blue-600'} transition-all flex items-center justify-center gap-1.5 cursor-pointer box-border"
              >
                <i data-lucide="upload-cloud" class="w-4 h-4 flex-shrink-0"></i> <span class="truncate">${evalStatus.statusKey === 'Live' ? 'Attempt Live Test & Submit PDF →' : 'Solve & Upload Answer Sheet (PDF) →'}</span>
              </button>
            ` : `
              <button 
                type="button"
                disabled
                class="w-full h-10 px-4 text-xs font-bold rounded-lg bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed flex items-center justify-center gap-1.5 box-border"
              >
                <i data-lucide="lock" class="w-4 h-4 flex-shrink-0"></i> <span class="truncate">${evalStatus.badgeText}</span>
              </button>
            `}
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
            onclick="window.assignmentPortal.goToPage(${p})"
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
            Showing <strong>${startIndex + 1}</strong> - <strong>${Math.min(startIndex + this.pageSize, assignments.length)}</strong> of <strong>${assignments.length}</strong> Test Papers
          </div>
          <div class="flex items-center gap-1.5">
            <button 
              type="button"
              onclick="window.assignmentPortal.goToPage(${this.currentPage - 1})"
              ${this.currentPage === 1 ? 'disabled' : ''}
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Previous
            </button>
            ${pageBtns.join('')}
            <button 
              type="button"
              onclick="window.assignmentPortal.goToPage(${this.currentPage + 1})"
              ${this.currentPage === totalPages ? 'disabled' : ''}
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      `;
    }

    listContainer.innerHTML = cardsHtml + paginationHtml;

    this.renderSubmissionsTable(userSubmissions);
    if (window.lucide) window.lucide.createIcons();
  }

  renderSubjectFilters() {
    const levelContainer = document.getElementById('assignment-level-pills');
    const subjectContainer = document.getElementById('assignment-subject-pills') || document.getElementById('assignment-subject-filters');
    if (!subjectContainer && !levelContainer) return;

    const allAssignments = window.store.getAssignments();
    const subjects = window.store.getSubjects();
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const bmCount = user && window.store && window.store.getBookmarks ? window.store.getBookmarks(user.id).filter(b => b.itemType === 'paper' || allAssignments.some(a => a.id === b.itemId)).length : 0;
    const examLevels = ['all', 'CA Foundation', 'CA Intermediate', 'CA Final'];

    if (levelContainer) {
      levelContainer.innerHTML = examLevels.map(lvl => {
        const isActive = this.selectedLevel === lvl;
        const label = lvl === 'all' ? 'All Levels' : lvl;
        return `
          <button 
            type="button"
            onclick="window.assignmentPortal.filterLevel('${lvl}')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              isActive ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
          onclick="window.assignmentPortal.filterSubject('all')"
          class="px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
            this.selectedSubject === 'all' && !this.filterBookmarkedOnly
              ? 'bg-blue-600 text-white shadow-sm' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }"
        >
          <span>All Test Papers</span>
          <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono ${this.selectedSubject === 'all' && !this.filterBookmarkedOnly ? 'bg-blue-700/90 text-white' : 'bg-slate-100 text-slate-600'}">${allAssignments.length}</span>
        </button>

        <!-- Bookmarked Filter Button -->
        <button 
          type="button"
          onclick="window.assignmentPortal.toggleBookmarkedFilter()"
          class="px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
            this.filterBookmarkedOnly 
              ? 'bg-amber-600 text-white shadow-sm' 
              : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
          }"
        >
          <i data-lucide="bookmark" class="w-3.5 h-3.5 ${this.filterBookmarkedOnly ? 'fill-current' : ''}"></i>
          <span>Bookmarked</span>
          <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono ${this.filterBookmarkedOnly ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'}">${bmCount}</span>
        </button>

        ${subjects.map(s => {
          const count = allAssignments.filter(a => a.subjectId === s.id || a.subject === s.name).length;
          const isActive = this.selectedSubject === s.id && !this.filterBookmarkedOnly;
          return `
            <button 
              type="button"
              onclick="window.assignmentPortal.filterSubject('${s.id}')"
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
    this.render();
  }

  toggleBookmarkedFilter() {
    this.filterBookmarkedOnly = !this.filterBookmarkedOnly;
    this.currentPage = 1;
    this.renderSubjectFilters();
    this.render();
  }

  toggleBookmark(paperId) {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) {
      window.app.showAuthModal('login');
      window.app.showToast('Please sign in to bookmark test papers.', 'info');
      return;
    }
    const isNow = window.store.toggleBookmark(user.id, paperId, 'paper');
    window.app.showToast(isNow ? 'Test paper bookmarked!' : 'Bookmark removed.', 'info');
    this.renderSubjectFilters();
    this.render();
  }

  goToPage(page) {
    const filtered = this.getFilteredAndSortedAssignments();
    const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
    if (page < 1 || page > totalPages) return;
    this.currentPage = page;
    this.render();
    const listContainer = document.getElementById('assignment-list');
    if (listContainer) listContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  filterSubject(subjectId) {
    this.selectedSubject = subjectId;
    this.filterBookmarkedOnly = false;
    this.currentPage = 1;
    this.renderSubjectFilters();
    this.render();
  }

  handleSearch(query) {
    this.searchQuery = query || '';
    this.currentPage = 1;
    const clearBtn = document.getElementById('assignment-search-clear-btn');
    if (clearBtn) {
      if (this.searchQuery.trim()) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    }
    this.render();
  }

  clearSearch() {
    this.searchQuery = '';
    this.currentPage = 1;
    const searchInput = document.getElementById('assignment-search-input');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('assignment-search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    this.render();
  }

  handleStatusFilter(status) {
    this.selectedStatus = status || 'all';
    this.currentPage = 1;
    this.render();
  }

  handleSort(sortBy) {
    this.sortBy = sortBy || 'new';
    this.currentPage = 1;
    this.render();
  }

  resetFilters() {
    this.selectedSubject = 'all';
    this.selectedLevel = 'all';
    this.filterBookmarkedOnly = false;
    this.currentPage = 1;
    this.searchQuery = '';
    this.selectedStatus = 'all';
    this.sortBy = 'new';

    const searchInput = document.getElementById('assignment-search-input');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('assignment-search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    const statusSelect = document.getElementById('assignment-status-select');
    if (statusSelect) statusSelect.value = 'all';
    const sortSelect = document.getElementById('assignment-sort-select');
    if (sortSelect) sortSelect.value = 'new';

    this.renderSubjectFilters();
    this.render();
  }

  getFilteredAndSortedAssignments() {
    const allAssignments = window.store.getAssignments();
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const userSubmissions = user ? window.store.getSubmissionsByUser(user.id) : [];

    let list = [...allAssignments];

    // 0. Exam Level filter
    if (this.selectedLevel && this.selectedLevel !== 'all') {
      const targetLvl = this.selectedLevel.toUpperCase();
      list = list.filter(a => {
        const aLvl = (a.examLevel || 'CA Foundation').toUpperCase();
        if (targetLvl.includes('FOUNDATION')) return aLvl.includes('FOUNDATION');
        if (targetLvl.includes('INTER')) return aLvl.includes('INTER');
        if (targetLvl.includes('FINAL')) return aLvl.includes('FINAL');
        return aLvl === targetLvl;
      });
    }

    // 0.5 Bookmarked only filter
    if (this.filterBookmarkedOnly) {
      if (!user) {
        list = [];
      } else {
        list = list.filter(a => window.store && window.store.isBookmarked && window.store.isBookmarked(user.id, a.id));
      }
    }

    // 1. Subject filter
    if (this.selectedSubject && this.selectedSubject !== 'all') {
      list = list.filter(a => a.subjectId === this.selectedSubject || a.subject === this.selectedSubject);
    }

    // 2. Search query (title, topic, subject, description)
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter(a => {
        const title = (a.title || '').toLowerCase();
        const topic = (a.topic || '').toLowerCase();
        const desc = (a.description || '').toLowerCase();
        const subj = (a.subject || '').toLowerCase();
        return title.includes(q) || topic.includes(q) || desc.includes(q) || subj.includes(q);
      });
    }

    // 3. Status filter
    if (this.selectedStatus && this.selectedStatus !== 'all') {
      list = list.filter(a => {
        const sub = userSubmissions.find(s => s.assignmentId === a.id);
        if (this.selectedStatus === 'pending') {
          return !sub;
        } else if (this.selectedStatus === 'submitted') {
          return sub && sub.status !== 'Evaluated';
        } else if (this.selectedStatus === 'evaluated') {
          return sub && sub.status === 'Evaluated';
        }
        return true;
      });
    }

    // 4. Sort
    if (this.sortBy === 'new') {
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else if (this.sortBy === 'old') {
      list.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    } else if (this.sortBy === 'marks') {
      list.sort((a, b) => (b.maximumMarks || 0) - (a.maximumMarks || 0));
    }

    return list;
  }

  renderSubmissionsTable(userSubmissions) {
    const container = document.getElementById('my-submissions-table-container');
    if (!container) return;

    if (!userSubmissions || userSubmissions.length === 0) {
      container.innerHTML = `
        <div class="text-center py-10 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
          <i data-lucide="inbox" class="w-8 h-8 text-slate-400 mx-auto mb-2"></i>
          <p class="text-xs font-bold text-slate-600">No answer sheets submitted yet</p>
          <p class="text-[11px] text-slate-400 mt-0.5">Attempt an active paper above and upload your handwritten/typed PDF solution.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Test Title</th>
              <th class="py-3 px-4">Your Answer Sheet</th>
              <th class="py-3 px-4">Submission Date</th>
              <th class="py-3 px-4">Status & Score</th>
              <th class="py-3 px-4">Evaluator Remarks</th>
              <th class="py-3 px-4 text-right">Checked Copy (PDF)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${userSubmissions.map(sub => {
              const asg = window.store.getAssignmentById(sub.assignmentId);
              const dateStr = new Date(sub.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
              const isEvaluated = sub.status === 'Evaluated';

              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4 font-bold text-slate-900">${asg ? asg.title : 'CA Paper'}</td>
                  <td class="py-3 px-4 text-xs font-mono">
                    <button 
                      type="button"
                      onclick="window.assignmentPortal.downloadStudentSubmission('${sub.id}')"
                      class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold border border-blue-200 transition-colors cursor-pointer"
                      title="Download your submitted answer sheet"
                    >
                      <i data-lucide="download" class="w-3.5 h-3.5 text-blue-600"></i>
                      Download Answer Sheet
                    </button>
                    <div class="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[150px]">${sub.fileName || 'AnswerSheet.pdf'}</div>
                  </td>
                  <td class="py-3 px-4 text-slate-600">${dateStr}</td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="px-2 py-0.5 text-xs font-bold rounded-full ${isEvaluated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${sub.status} ${isEvaluated ? `(${sub.marksObtained}/${sub.maxMarks || (asg ? asg.maximumMarks : 100)} M)` : ''}
                      </span>
                      ${isEvaluated && (sub.pointsAwarded !== undefined && sub.pointsAwarded !== null) ? `
                        <span class="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          +${sub.pointsAwarded} XP
                        </span>
                      ` : ''}
                    </div>
                  </td>
                  <td class="py-3 px-4 text-slate-600 max-w-xs truncate">
                    ${sub.adminFeedback || '<span class="text-slate-400 italic">Evaluation in progress</span>'}
                  </td>
                  <td class="py-3 px-4 text-right">
                    ${sub.checkedCopyPdfData || sub.checkedCopyFileName ? `
                      <button 
                        type="button"
                        onclick="window.assignmentPortal.downloadCheckedSubmission('${sub.id}')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                        title="Download faculty evaluated copy"
                      >
                        <i data-lucide="download" class="w-3.5 h-3.5"></i> Download Checked Answer Sheet
                      </button>
                    ` : `
                      <span class="text-slate-400 italic">Under faculty review</span>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  formatSubmissionDate(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = hours.toString().padStart(2, '0');
    return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
  }

  openAssignmentModal(asgId) {
    const asg = window.store.getAssignmentById(asgId);
    if (!asg) return;

    this.currentAssignmentId = asgId;
    this.selectedPdfFile = null;

    // Security Check 1: User must be logged in to view assignment modal or upload
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) {
      if (window.app) {
        window.app.showToast('Authentication Required: Please sign in to attempt tests and upload answer sheets.', 'info');
        window.app.showAuthModal('login');
      }
      return;
    }

    // Security Check 2: Check live test and scheduled rules
    const serverTime = window.secureBackend ? window.secureBackend.getAuthoritativeTime() : new Date();
    const evalStatus = window.secureBackend ? window.secureBackend.computePaperStatus(asg, serverTime) : { canAttempt: true };

    const existingSubmission = window.store.getSubmissionsByUser(user.id).find(s => s.assignmentId === asg.id);

    if (!existingSubmission && !evalStatus.canAttempt && user.role === 'student') {
      window.app.showToast(`Access Denied: ${evalStatus.badgeText}. Test cannot be attempted outside the active window.`, 'error');
      return;
    }

    const subject = window.store.getSubjectById(asg.subjectId) || { name: asg.subject || 'Accounting' };
    const modalContent = document.getElementById('assignment-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-4 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between border-b border-slate-200 pb-4 mb-5 sm:mb-6">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                ${subject.name}
              </span>
              <span class="text-xs font-semibold text-slate-500">• Max Marks: ${asg.maximumMarks}</span>
              <span class="text-xs font-semibold text-slate-500">• Duration: ${asg.durationMinutes || 180} Mins</span>
            </div>
            <h3 class="text-base sm:text-lg font-bold text-slate-900">${asg.title}</h3>
            <span class="text-xs text-slate-500 font-medium">Topic: ${asg.topic}</span>
          </div>
          <button onclick="window.app.closeModal('assignment-modal')" class="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Official Question Paper Download Box -->
        <div class="bg-rose-50 border border-rose-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold flex-shrink-0">
              <i data-lucide="file-text" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-xs font-bold text-rose-900 block">Official Test Question Paper (PDF)</span>
              <span class="text-[11px] text-slate-500 font-mono">${asg.questionPdfName || 'QuestionPaper.pdf'}</span>
            </div>
          </div>
          <button 
            type="button"
            onclick="window.secureBackend.downloadProtectedFile('${asg.questionPdfId || 'qp.pdf'}', '${asg.id}', 'question', '${asg.questionPdfName || 'QuestionPaper.pdf'}')"
            class="w-full sm:w-auto px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="download" class="w-4 h-4"></i> Download Question Paper (PDF)
          </button>
        </div>

        <!-- Problem Statement & Instructions -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6 text-xs leading-relaxed text-slate-800 space-y-3">
          <h4 class="font-bold text-slate-900 text-sm uppercase tracking-wider mb-2">Instructions & Problem Details:</h4>
          <div class="whitespace-pre-line">${asg.description}</div>
        </div>

        <!-- Return Checked Copy Card (If Checked by Teacher/Admin) -->
        ${existingSubmission && (existingSubmission.checkedCopyPdfData || existingSubmission.checkedCopyFileName) ? `
          <div class="border-2 border-emerald-500 bg-emerald-50/70 rounded-xl p-5 mb-6 shadow-sm">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <i data-lucide="check-circle" class="w-6 h-6 text-emerald-600"></i>
                <div>
                  <h4 class="text-sm font-bold text-emerald-950">Evaluated / Checked Copy Ready!</h4>
                  <span class="text-[11px] text-emerald-800">Checked by: <strong>${existingSubmission.evaluatedBy || 'Faculty Evaluator'}</strong></span>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-wrap justify-end">
                <span class="text-xs font-black px-3 py-1 rounded-full bg-emerald-600 text-white shadow-xs">
                  Score: ${existingSubmission.marksObtained} / ${asg.maximumMarks} Marks
                </span>
                ${existingSubmission.pointsAwarded !== undefined && existingSubmission.pointsAwarded !== null ? `
                  <span class="text-xs font-black px-3 py-1 rounded-full bg-amber-500 text-white shadow-xs">
                    +${existingSubmission.pointsAwarded} Platform XP
                  </span>
                ` : ''}
              </div>
            </div>

            ${existingSubmission.adminFeedback ? `
              <div class="bg-white p-3.5 rounded-lg border border-emerald-200 text-xs mb-4">
                <span class="font-bold text-slate-800 block mb-1">Faculty Remarks & Corrections:</span>
                <p class="text-slate-700 italic leading-relaxed">"${existingSubmission.adminFeedback}"</p>
              </div>
            ` : ''}

            <button 
              type="button"
              onclick="window.assignmentPortal.downloadCheckedSubmission('${existingSubmission.id}')"
              class="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <i data-lucide="download" class="w-4 h-4"></i> Download Checked Answer Sheet
            </button>
          </div>
        ` : ''}

        ${existingSubmission ? `
          <!-- ALREADY SUBMITTED STATE -->
          <div class="border-t border-slate-200 pt-6">
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold flex-shrink-0">
                    <i data-lucide="check-circle" class="w-5 h-5"></i>
                  </div>
                  <div>
                    <h4 class="text-sm font-bold text-slate-900">Answer Sheet Submitted</h4>
                    <span class="text-xs text-slate-500">Submitted on ${this.formatSubmissionDate(existingSubmission.submittedAt)}</span>
                  </div>
                </div>
                <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center gap-1.5 flex-shrink-0">
                    <i data-lucide="lock" class="w-3.5 h-3.5"></i> Finalized
                  </span>
                  <button 
                    type="button"
                    onclick="window.assignmentPortal.downloadStudentSubmission('${existingSubmission.id}')"
                    class="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 flex-shrink-0 cursor-pointer"
                    title="Download your submitted answer sheet"
                  >
                    <i data-lucide="download" class="w-4 h-4"></i> Download Answer Sheet
                  </button>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end">
              <button 
                type="button"
                onclick="window.app.closeModal('assignment-modal')"
                class="w-full sm:w-auto px-6 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-center"
              >
                Close
              </button>
            </div>
          </div>
        ` : `
          <!-- Upload Answer Sheet PDF Form (First-time submission only) -->
          <div class="border-t border-slate-200 pt-6">
            <h4 class="text-sm font-bold text-slate-900 mb-1">
              Upload Your Answer Sheet (PDF Only)
            </h4>
            <p class="text-xs text-slate-500 mb-4">Upload your handwritten or typed solution as a single genuine PDF (maximum size: 15 MB). Strictly PDF format with valid %PDF- header is accepted. <strong>Note: Submissions are final and cannot be re-uploaded.</strong></p>

            <div 
              id="pdf-dropzone"
              class="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-xl p-5 sm:p-8 text-center transition-all cursor-pointer"
              onclick="document.getElementById('pdf-file-input').click()"
            >
              <input 
                type="file" 
                id="pdf-file-input" 
                accept="application/pdf,.pdf" 
                class="hidden"
                onchange="window.assignmentPortal.handleFileSelect(event)"
              >
              <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 mx-auto flex items-center justify-center mb-3">
                <i data-lucide="upload-cloud" class="w-6 h-6"></i>
              </div>
              <div id="dropzone-text">
                <p class="text-sm font-bold text-slate-800">Click to choose Answer Sheet PDF or drag & drop here</p>
                <p class="text-xs text-slate-500 mt-1">Accepts genuine .pdf files up to 15MB (JPG, PNG, DOCX, ZIP strictly rejected)</p>
              </div>
              <div id="file-preview-area" class="hidden mt-3 p-3 bg-white border border-blue-200 rounded-lg inline-flex items-center gap-3">
                <i data-lucide="file" class="w-5 h-5 text-rose-500"></i>
                <div class="text-left">
                  <span id="preview-filename" class="text-xs font-bold text-slate-900 block font-mono break-all"></span>
                  <span id="preview-filesize" class="text-[11px] text-emerald-700 block font-semibold"></span>
                </div>
              </div>
            </div>

            <div class="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3">
              <button 
                type="button"
                onclick="window.app.closeModal('assignment-modal')"
                class="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>
              <button 
                type="button"
                id="submit-pdf-btn"
                onclick="window.assignmentPortal.submitPdfSolution()"
                class="w-full sm:w-auto px-6 py-2.5 sm:py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer text-center"
              >
                Submit Answer Sheet (PDF) →
              </button>
            </div>
          </div>
        `}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('assignment-modal');
  }

  downloadStudentSubmission(submId) {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) {
      if (window.app) {
        window.app.showToast('Authentication Required: Please sign in to download your submitted answer sheet.', 'info');
        window.app.showAuthModal('login');
      }
      return;
    }

    const subm = window.store.getSubmissions().find(s => s.id === submId);
    if (!subm) {
      if (window.app) window.app.showToast('Submission document not found.', 'error');
      return;
    }

    // Security Check: Strict ownership validation (Prevent student from downloading another student's submission)
    const isOwner = subm.studentId === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'teacher';
    if (!isOwner && !isAdmin) {
      if (window.app) window.app.showToast('Access Denied: You are not authorized to access another student\'s submitted answer sheet.', 'error');
      return;
    }

    if (subm.fileData && subm.fileData.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = subm.fileData;
      a.download = subm.fileName || 'My_Submitted_Answer_Sheet.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (window.app) window.app.showToast('Downloading your submitted answer sheet...', 'success');
      return;
    }

    window.secureBackend.downloadProtectedFile(
      subm.fileId || subm.fileName,
      subm.assignmentId,
      'submission',
      subm.fileName || 'My_Submitted_Answer_Sheet.pdf'
    );
  }

  downloadCheckedSubmission(submId) {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) {
      if (window.app) {
        window.app.showToast('Authentication Required: Please sign in to download your evaluated copy.', 'info');
        window.app.showAuthModal('login');
      }
      return;
    }

    const subm = window.store.getSubmissions().find(s => s.id === submId);
    if (!subm) {
      if (window.app) window.app.showToast('Submission record not found.', 'error');
      return;
    }

    // Security Check: Strict ownership validation
    const isOwner = subm.studentId === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'teacher';
    if (!isOwner && !isAdmin) {
      if (window.app) window.app.showToast('Access Denied: You are not authorized to access another student\'s evaluated copy.', 'error');
      return;
    }

    if (!subm.checkedCopyPdfData && !subm.checkedCopyFileName) {
      if (window.app) window.app.showToast('Faculty review is in progress. The evaluated copy is not ready yet.', 'info');
      return;
    }

    if (subm.checkedCopyPdfData && subm.checkedCopyPdfData.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = subm.checkedCopyPdfData;
      a.download = subm.checkedCopyFileName || 'Checked_Answer_Sheet.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (window.app) window.app.showToast('Downloading faculty evaluated answer sheet...', 'success');
      return;
    }

    window.secureBackend.downloadProtectedFile(
      subm.checkedCopyFileName || 'checked.pdf',
      subm.assignmentId,
      'checked',
      subm.checkedCopyFileName || 'Checked_Answer_Sheet.pdf'
    );
  }

  async handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Strict Magic-Byte & File-Type Inspection
    const validation = await window.secureBackend.validatePdfFile(file);
    if (!validation.valid) {
      window.app.showToast(validation.error, 'error');
      e.target.value = '';
      const previewArea = document.getElementById('file-preview-area');
      const dropzoneText = document.getElementById('dropzone-text');
      if (previewArea) previewArea.classList.add('hidden');
      if (dropzoneText) dropzoneText.classList.remove('hidden');
      return;
    }

    this.selectedPdfFile = file;

    const previewArea = document.getElementById('file-preview-area');
    const previewName = document.getElementById('preview-filename');
    const previewSize = document.getElementById('preview-filesize');
    const dropzoneText = document.getElementById('dropzone-text');

    if (previewArea && previewName && previewSize) {
      previewName.textContent = file.name;
      previewSize.textContent = `✓ ${(file.size / (1024 * 1024)).toFixed(2)} MB • Genuine %PDF- Verified`;
      previewArea.classList.remove('hidden');
      if (dropzoneText) dropzoneText.classList.add('hidden');
    }
  }

  async submitPdfSolution() {
    // Security check 1: Must be logged in
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) {
      window.app.showToast('Security Alert: You must be logged in to upload an answer sheet.', 'error');
      window.app.showAuthModal('login');
      return;
    }

    if (!this.selectedPdfFile) {
      window.app.showToast('Please select your PDF answer sheet first.', 'warning');
      return;
    }

    const asg = window.store.getAssignmentById(this.currentAssignmentId);
    if (!asg) return;

    // Security check 2: Check live/scheduled authorization
    const serverTime = window.secureBackend ? window.secureBackend.getAuthoritativeTime() : new Date();
    const evalStatus = window.secureBackend ? window.secureBackend.computePaperStatus(asg, serverTime) : { canAttempt: true };

    if (!evalStatus.canAttempt && user.role === 'student') {
      window.app.showToast(`Submission Blocked: ${evalStatus.badgeText}. Test cannot be submitted outside the active window.`, 'error');
      return;
    }

    // Security check 3: STRICT ONE-TIME SUBMISSION ENFORCEMENT (NO RE-UPLOAD)
    const existingSubmission = window.store.getSubmissionsByUser(user.id).find(s => s.assignmentId === asg.id);
    if (existingSubmission) {
      window.app.showToast('Re-upload not permitted: You have already submitted an answer sheet for this examination paper.', 'error');
      return;
    }

    const submitBtn = document.getElementById('submit-pdf-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying & Uploading PDF...';
    }

    // Perform secure upload via secureBackend
    const upRes = await window.secureBackend.uploadProtectedPdf(this.selectedPdfFile, 'submission', asg.id);
    if (!upRes.success) {
      window.app.showToast('Upload Rejected: ' + upRes.error, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Answer Sheet (PDF) →';
      }
      return;
    }

    const submission = {
      id: 'subm-' + Date.now(),
      assignmentId: asg.id,
      studentId: user.id,
      studentName: user.name,
      fileName: upRes.fileName,
      fileId: upRes.fileId,
      fileSizeKb: Math.round(upRes.fileSize / 1024),
      fileData: upRes.fileData,
      submittedAt: new Date().toISOString(),
      status: 'Submitted',
      marksObtained: null,
      maxMarks: asg.maximumMarks,
      adminFeedback: null,
      evaluatedBy: null,
      evaluatedAt: null,
      checkedCopyFileName: null,
      checkedCopyPdfData: null
    };

    const added = window.store.addSubmission(submission);
    if (!added) {
      window.app.showToast('Submission Blocked: A submission already exists for this test paper. Re-upload is not permitted.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Answer Sheet (PDF) →';
      }
      return;
    }

    // Sync to backend if server is active
    try {
      const token = user.token || user.email;
      await fetch('/api/papers/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(submission)
      });
    } catch (e) {
      // Local storage persists
    }

    window.app.closeModal('assignment-modal');
    window.app.showToast('Answer sheet submitted successfully! Faculty will evaluate your solution.', 'success');
    this.render();
  }
}

window.assignmentPortal = new AssignmentPortal();
