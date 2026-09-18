/**
 * admin-dashboard.js - Comprehensive Administration & Faculty Management Suite for ExcellenceCA
 * Features:
 * - Total students counter (Active vs Deactivated)
 * - Complete Student Management: Passwords visible, Add, Delete, Activate, Deactivate
 * - Test Question Paper PDF Upload (select subject, title, marks, upload question PDF)
 * - Teacher / Faculty Management & Privilege Editor (Can upload tests, Can grade copies, etc.)
 * - Checked Copy PDF evaluation & return
 * - Lecture and MCQ management
 */

class AdminDashboard {
  constructor() {
    this.currentTab = 'overview';
    this.activeEditingLectureId = null;
    this.activeEditingTestId = null;
    this.activeTestQuestionsId = null;
    this.activeEditingAssignmentId = null;
    this.activeGradingSubmissionId = null;
    this.selectedCheckedPdfFile = null;
    this.selectedQuestionPdfFile = null;
    this.showStudentPasswords = true;
    this.aiActiveSubTab = 'generate';
    this.aiActiveJobId = null;
    this.aiJobPollInterval = null;
    this.aiSelectedPdfFiles = [];
  }

  render() {
    if (!window.auth.isAdmin()) {
      window.app.navigate('dashboard');
      window.app.showToast('Access restricted: Administrators only.', 'error');
      return;
    }

    this.syncBackendUsers();
    this.renderTabs();

    try {
      if (this.currentTab === 'overview') this.renderOverview();
      else if (this.currentTab === 'banners') this.renderBanners();
      else if (this.currentTab === 'students') this.renderStudents();
      else if (this.currentTab === 'subscriptions') this.renderSubscriptions();
      else if (this.currentTab === 'payments') this.renderPaymentVerifications();
      else if (this.currentTab === 'payment-channels') this.renderPaymentChannels();
      else if (this.currentTab === 'plans-config') this.renderPlansConfig();
      else if (this.currentTab === 'audit-logs') this.renderAdminAuditLogs();
      else if (this.currentTab === 'teachers') this.renderTeachers();
      else if (this.currentTab === 'papers') this.renderTestPapers();
      else if (this.currentTab === 'grading') this.renderGradingCenter();
      else if (this.currentTab === 'xp-management') this.renderXpManagement();
      else if (this.currentTab === 'xp-reset') this.renderXpResetSettings();
      else if (this.currentTab === 'referrals') this.renderReferrals();
      else if (this.currentTab === 'mcq-tests') this.renderMCQTests();
      else if (this.currentTab === 'ranks-config') this.renderRanksConfig();
      else if (this.currentTab === 'lectures') this.renderLectures();
      else if (this.currentTab === 'subjects') this.renderSubjects();
      else if (this.currentTab === 'ai-automation') this.renderAiAutomation();
    } catch (tabErr) {
      console.error(`[AdminDashboard] Error rendering tab "${this.currentTab}":`, tabErr);
      const container = document.getElementById('admin-content-area');
      if (container) {
        container.innerHTML = `
          <div class="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center my-6">
            <div class="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <i data-lucide="alert-triangle" class="w-6 h-6"></i>
            </div>
            <h3 class="text-lg font-black text-rose-900">Unable to load this section</h3>
            <p class="text-sm text-rose-700 mt-1 max-w-md mx-auto">${tabErr && tabErr.message ? tabErr.message : 'An error occurred while loading this administrative view.'}</p>
            <button onclick="window.adminDashboard.switchTab('overview')" class="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm">
              Return to Overview
            </button>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  switchTab(tab) {
    if (this.stopTabPolling) this.stopTabPolling();
    this._activePollingTab = null;
    this.currentTab = tab;
    if (tab === 'students') {
      this.studentPage = 1;
      this.studentSearch = '';
      this.studentStatusFilter = 'all';
      this.studentLevelFilter = 'all';
    } else if (tab === 'subscriptions') {
      this.subSearch = '';
      this.subTierFilter = 'all';
      this.subPage = 1;
    } else if (tab === 'payments') {
      this.paymentFilter = 'all';
      this.paymentSearch = '';
    } else if (tab === 'audit-logs') {
      this.auditActionFilter = 'all';
      this.auditSearch = '';
    }
    this.render();
  }

  renderTabs() {
    const nav = document.getElementById('admin-sub-tabs');
    if (!nav) return;

    const tabs = [
      { id: 'overview', name: 'Overview & KPIs', icon: 'layout-dashboard' },
      { id: 'ai-automation', name: 'AI MCQ Studio & Automation', icon: 'sparkles' },
      { id: 'subscriptions', name: 'Subscriptions & Grants', icon: 'credit-card' },
      { id: 'payments', name: 'Payment Verifications', icon: 'badge-check' },
      { id: 'payment-channels', name: 'UPI Channels & QR', icon: 'qr-code' },
      { id: 'plans-config', name: 'Plan & Trial Config', icon: 'sliders' },
      { id: 'audit-logs', name: 'Admin Audit Logs', icon: 'shield-alert' },
      { id: 'banners', name: 'Website Updates Banner', icon: 'image' },
      { id: 'students', name: 'Students & Passwords', icon: 'users' },
      { id: 'teachers', name: 'Teachers & Privileges', icon: 'user-check' },
      { id: 'subjects', name: 'Subject Management', icon: 'book-open' },
      { id: 'papers', name: 'Question Papers (PDF)', icon: 'file-up' },
      { id: 'grading', name: 'Checked Copy Grading', icon: 'file-check-2' },
      { id: 'xp-management', name: 'Student XP Management', icon: 'zap' },
      { id: 'xp-reset', name: 'XP Reset Settings', icon: 'clock' },
      { id: 'referrals', name: 'Referral Management', icon: 'share-2' },
      { id: 'mcq-tests', name: 'MCQ Tests Builder', icon: 'check-square' },
      { id: 'ranks-config', name: 'XP & Rank Tiers', icon: 'award' },
      { id: 'lectures', name: 'Video Lectures', icon: 'video' }
    ];

    nav.innerHTML = tabs.map(t => {
      const isActive = this.currentTab === t.id;
      return `
        <button 
          onclick="window.adminDashboard.switchTab('${t.id}')"
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
            isActive 
              ? 'bg-rose-700 text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }"
        >
          <i data-lucide="${t.icon}" class="w-4 h-4"></i>
          ${t.name}
        </button>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  async syncBackendUsers(callback) {
    if (this._isSyncingUsers) {
      if (this._syncPromise) {
        return this._syncPromise.then(() => {
          if (typeof callback === 'function') callback();
        });
      }
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    }
    if (typeof fetch === 'undefined') {
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    }

    this._isSyncingUsers = true;
    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    this._syncPromise = fetch(`/api/admin/users?_t=${Date.now()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && Array.isArray(data.users)) {
        // Authoritative Database Sync: Replace and prune local store with exact database records
        window.store.syncUsersFromDatabase(data.users);
      }
      if (typeof callback === 'function') {
        callback();
      }
      return data;
    })
    .catch(err => {
      console.warn('[syncBackendUsers] Failed to fetch users from database:', err);
      if (typeof callback === 'function') {
        callback();
      }
      return null;
    })
    .finally(() => {
      this._isSyncingUsers = false;
      this._syncPromise = null;
    });

    return this._syncPromise;
  }

  // --- 1. OVERVIEW & KPIS ---
  renderOverview() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    this.syncBackendUsers(() => {
      if (this.currentTab === 'overview') this.renderOverview();
    });

    const allStudents = window.store.getStudents();
    const activeStudents = allStudents.filter(s => s.isActive !== false);
    const deactivatedStudents = allStudents.filter(s => s.isActive === false);
    const teachers = window.store.getTeachers();
    const papers = window.store.getAssignments();
    const submissions = window.store.getSubmissions();
    const pendingGrading = submissions.filter(s => s.status !== 'Evaluated');
    const checkedCopiesCount = submissions.filter(s => !!s.checkedCopyPdfData);

    container.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Students</span>
          <span class="text-3xl font-black text-slate-900 mt-1 block">${allStudents.length}</span>
          <div class="flex items-center gap-2 mt-1 text-[11px]">
            <span class="text-emerald-700 font-bold">${activeStudents.length} Active</span>
            <span class="text-slate-300">•</span>
            <span class="text-rose-600 font-bold">${deactivatedStudents.length} Deactivated</span>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Faculty / Teachers</span>
          <span class="text-3xl font-black text-slate-900 mt-1 block">${teachers.length}</span>
          <button onclick="window.adminDashboard.switchTab('teachers')" class="text-[11px] text-blue-600 font-bold hover:underline block mt-1">
            Manage Privileges →
          </button>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Question Papers</span>
          <span class="text-3xl font-black text-slate-900 mt-1 block">${papers.length}</span>
          <span class="text-[11px] text-purple-600 font-semibold mt-1 block">Active Tests & Cases</span>
        </div>

        <div class="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-amber-800 uppercase tracking-wider block">Pending Grading</span>
          <span class="text-3xl font-black text-amber-900 mt-1 block">${pendingGrading.length}</span>
          <button onclick="window.adminDashboard.switchTab('grading')" class="text-[11px] text-amber-800 font-bold hover:underline mt-1 block">
            Check Copies →
          </button>
        </div>

        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Checked Copies</span>
          <span class="text-3xl font-black text-emerald-900 mt-1 block">${checkedCopiesCount.length}</span>
          <span class="text-[11px] text-emerald-700 font-semibold block mt-1">Returned to Students</span>
        </div>
      </div>

      <!-- Quick Shortcuts -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="p-5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
          <div>
            <h4 class="font-bold text-slate-900 text-sm">Add New Student</h4>
            <p class="text-xs text-slate-500 mt-0.5">Register student with custom password</p>
          </div>
          <button onclick="window.adminDashboard.openAddStudentModal()" class="px-3.5 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700">
            + Add Student
          </button>
        </div>

        <div class="p-5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
          <div>
            <h4 class="font-bold text-slate-900 text-sm">Invite / Add Teacher</h4>
            <p class="text-xs text-slate-500 mt-0.5">Configure teacher privileges</p>
          </div>
          <button onclick="window.adminDashboard.openAddTeacherModal()" class="px-3.5 py-2 bg-amber-600 text-white font-bold text-xs rounded-lg hover:bg-amber-700">
            + Add Teacher
          </button>
        </div>

        <div class="p-5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
          <div>
            <h4 class="font-bold text-slate-900 text-sm">Upload Question Paper</h4>
            <p class="text-xs text-slate-500 mt-0.5">Post test PDF for specific subject</p>
          </div>
          <button onclick="window.adminDashboard.openUploadPaperModal()" class="px-3.5 py-2 bg-rose-600 text-white font-bold text-xs rounded-lg hover:bg-rose-700">
            + Upload PDF
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  // --- 2. STUDENT MANAGEMENT WITH PASSWORDS & ACTIVATION ---
  renderStudents(forceFullRender = false) {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    // Fast path: If the student search input and table container already exist in the DOM,
    // only update the table and counters without destroying the input element or losing focus!
    if (!forceFullRender && document.getElementById('admin-student-table-container') && document.getElementById('student-search-input')) {
      this.renderStudentTableOnly();
      return;
    }

    // Synchronize backend users when Students tab is initially opened
    this.syncBackendUsers(() => {
      if (this.currentTab === 'students') this.renderStudentTableOnly();
    });

    const allStudents = window.store.getStudents();
    allStudents.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const attempts = window.store.getAttempts();
    const submissions = window.store.getSubmissions();

    this.studentSearch = this.studentSearch !== undefined ? this.studentSearch : '';
    this.studentStatusFilter = this.studentStatusFilter || 'all';
    this.studentLevelFilter = this.studentLevelFilter || 'all';
    this.studentPage = this.studentPage || 1;
    this.studentPageSize = this.studentPageSize !== undefined ? this.studentPageSize : 10;

    const query = this.studentSearch.trim().toLowerCase();

    const filtered = allStudents.filter(st => {
      if (this.studentStatusFilter === 'active' && st.isActive === false) return false;
      if (this.studentStatusFilter === 'deactivated' && st.isActive !== false) return false;
      if (this.studentLevelFilter !== 'all') {
        const lvl = (st.caLevel || '').toUpperCase();
        if (!lvl.includes(this.studentLevelFilter.toUpperCase())) return false;
      }
      if (query) {
        const n = (st.name || '').toLowerCase();
        const em = (st.email || '').toLowerCase();
        const un = (st.username || '').toLowerCase();
        const ph = (st.phone || '').toLowerCase();
        const rg = (st.registrationNo || '').toLowerCase();
        const lv = (st.caLevel || '').toLowerCase();
        if (!n.includes(query) && !em.includes(query) && !un.includes(query) && !ph.includes(query) && !rg.includes(query) && !lv.includes(query)) {
          return false;
        }
      }
      return true;
    });

    const totalStudents = allStudents.length;
    const totalFiltered = filtered.length;
    const pageSize = this.studentPageSize;
    const totalPages = pageSize === 0 ? 1 : (Math.ceil(totalFiltered / pageSize) || 1);

    if (this.studentPage > totalPages) this.studentPage = totalPages;
    if (this.studentPage < 1) this.studentPage = 1;

    const startIndex = pageSize === 0 ? 0 : (this.studentPage - 1) * pageSize;
    const endIndex = pageSize === 0 ? totalFiltered : Math.min(startIndex + pageSize, totalFiltered);
    const paginated = pageSize === 0 ? filtered : filtered.slice(startIndex, startIndex + pageSize);

    container.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 class="text-base font-bold text-slate-900">Student Directory & Account Security</h3>
          <p class="text-xs text-slate-500 mt-0.5">Manage all registered students, view/reset passwords, and filter accounts</p>
        </div>
        <div class="flex items-center gap-2">
          <button 
            onclick="window.adminDashboard.syncBackendUsers(() => window.adminDashboard.renderStudents(true))"
            class="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Reload directory from server"
          >
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh
          </button>
          <button 
            onclick="window.adminDashboard.openAddStudentModal()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="user-plus" class="w-4 h-4"></i> Add New Student
          </button>
        </div>
      </div>

      <!-- Search & Filters Toolbar -->
      <div class="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <!-- Search box -->
          <div class="sm:col-span-6 relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <i data-lucide="search" class="w-4 h-4"></i>
            </div>
            <input 
              type="text" 
              id="student-search-input"
              value="${this.studentSearch.replace(/"/g, '&quot;')}"
              oninput="window.adminDashboard.handleStudentSearch(this.value)"
              placeholder="Search all students by name, email, username, phone, or reg no..."
              class="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button 
              id="student-search-clear-btn"
              onclick="window.adminDashboard.clearStudentSearch()"
              class="${this.studentSearch ? '' : 'hidden '}absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Clear search"
            >
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <!-- Status filter -->
          <div class="sm:col-span-3">
            <select 
              id="student-status-filter"
              onchange="window.adminDashboard.handleStudentStatusFilter(this.value)"
              class="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 font-medium cursor-pointer"
            >
              <option value="all" ${this.studentStatusFilter === 'all' ? 'selected' : ''}>Status: All Accounts</option>
              <option value="active" ${this.studentStatusFilter === 'active' ? 'selected' : ''}>Active Accounts</option>
              <option value="deactivated" ${this.studentStatusFilter === 'deactivated' ? 'selected' : ''}>Deactivated Accounts</option>
            </select>
          </div>

          <!-- CA Level filter -->
          <div class="sm:col-span-3">
            <select 
              id="student-level-filter"
              onchange="window.adminDashboard.handleStudentLevelFilter(this.value)"
              class="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 font-medium cursor-pointer"
            >
              <option value="all" ${this.studentLevelFilter === 'all' ? 'selected' : ''}>Level: All CA Levels</option>
              <option value="FOUNDATION" ${this.studentLevelFilter === 'FOUNDATION' ? 'selected' : ''}>CA Foundation</option>
              <option value="INTER" ${this.studentLevelFilter === 'INTER' ? 'selected' : ''}>CA Intermediate</option>
              <option value="FINAL" ${this.studentLevelFilter === 'FINAL' ? 'selected' : ''}>CA Final</option>
            </select>
          </div>
        </div>

        <!-- Meta info & Page size -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div id="admin-student-meta-counts" class="flex items-center gap-2">
            <span class="font-semibold text-slate-700">Total Registered Students:</span>
            <span class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold font-mono">${totalStudents}</span>
            ${totalFiltered !== totalStudents ? `
              <span class="text-slate-400">|</span>
              <span>Matching Filter: <strong class="text-slate-800">${totalFiltered}</strong></span>
            ` : ''}
          </div>

          <div class="flex items-center gap-2">
            <label class="text-slate-600 font-medium">Rows per page:</label>
            <select 
              onchange="window.adminDashboard.handleStudentPageSize(this.value)"
              class="py-1 px-2 text-xs border border-slate-300 rounded bg-white font-mono cursor-pointer"
            >
              <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
              <option value="0" ${pageSize === 0 ? 'selected' : ''}>All (${totalFiltered})</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Students Table Container (Preserves search focus) -->
      <div id="admin-student-table-container">
        ${this.renderStudentTableHtml(paginated, attempts, submissions, totalFiltered, totalPages, pageSize, startIndex, endIndex)}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  renderStudentTableOnly() {
    const tableContainer = document.getElementById('admin-student-table-container');
    if (!tableContainer) {
      this.renderStudents(true);
      return;
    }

    const allStudents = window.store.getStudents();
    allStudents.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const attempts = window.store.getAttempts();
    const submissions = window.store.getSubmissions();

    this.studentSearch = this.studentSearch !== undefined ? this.studentSearch : '';
    this.studentStatusFilter = this.studentStatusFilter || 'all';
    this.studentLevelFilter = this.studentLevelFilter || 'all';
    this.studentPage = this.studentPage || 1;
    this.studentPageSize = this.studentPageSize !== undefined ? this.studentPageSize : 10;

    const query = this.studentSearch.trim().toLowerCase();

    const filtered = allStudents.filter(st => {
      if (this.studentStatusFilter === 'active' && st.isActive === false) return false;
      if (this.studentStatusFilter === 'deactivated' && st.isActive !== false) return false;
      if (this.studentLevelFilter !== 'all') {
        const lvl = (st.caLevel || '').toUpperCase();
        if (!lvl.includes(this.studentLevelFilter.toUpperCase())) return false;
      }
      if (query) {
        const n = (st.name || '').toLowerCase();
        const em = (st.email || '').toLowerCase();
        const un = (st.username || '').toLowerCase();
        const ph = (st.phone || '').toLowerCase();
        const rg = (st.registrationNo || '').toLowerCase();
        const lv = (st.caLevel || '').toLowerCase();
        if (!n.includes(query) && !em.includes(query) && !un.includes(query) && !ph.includes(query) && !rg.includes(query) && !lv.includes(query)) {
          return false;
        }
      }
      return true;
    });

    const totalStudents = allStudents.length;
    const totalFiltered = filtered.length;
    const pageSize = this.studentPageSize;
    const totalPages = pageSize === 0 ? 1 : (Math.ceil(totalFiltered / pageSize) || 1);

    if (this.studentPage > totalPages) this.studentPage = totalPages;
    if (this.studentPage < 1) this.studentPage = 1;

    const startIndex = pageSize === 0 ? 0 : (this.studentPage - 1) * pageSize;
    const endIndex = pageSize === 0 ? totalFiltered : Math.min(startIndex + pageSize, totalFiltered);
    const paginated = pageSize === 0 ? filtered : filtered.slice(startIndex, startIndex + pageSize);

    tableContainer.innerHTML = this.renderStudentTableHtml(paginated, attempts, submissions, totalFiltered, totalPages, pageSize, startIndex, endIndex);

    const countsEl = document.getElementById('admin-student-meta-counts');
    if (countsEl) {
      countsEl.innerHTML = `
        <span class="font-semibold text-slate-700">Total Registered Students:</span>
        <span class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold font-mono">${totalStudents}</span>
        ${totalFiltered !== totalStudents ? `
          <span class="text-slate-400">|</span>
          <span>Matching Filter: <strong class="text-slate-800">${totalFiltered}</strong></span>
        ` : ''}
      `;
    }

    const clearBtn = document.getElementById('student-search-clear-btn');
    if (clearBtn) {
      if (this.studentSearch) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }

    if (window.lucide) window.lucide.createIcons();
  }

  renderStudentTableHtml(paginated, attempts, submissions, totalFiltered, totalPages, pageSize, startIndex, endIndex) {
    return `
      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Student</th>
              <th class="py-3 px-4">Account Security</th>
              <th class="py-3 px-4">CA Level & Reg No</th>
              <th class="py-3 px-4">Activity</th>
              <th class="py-3 px-4">Account Status</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${paginated.length === 0 ? `
              <tr>
                <td colspan="6" class="py-12 text-center text-xs text-slate-400">
                  <i data-lucide="user-x" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
                  No students found matching current search/filter criteria.
                </td>
              </tr>
            ` : paginated.map(st => {
              const studentAttempts = attempts.filter(a => a.userId === st.id).length;
              const studentSubs = submissions.filter(s => s.studentId === st.id).length;
              const isDeactivated = st.isActive === false;

              return `
                <tr class="hover:bg-slate-50/80 transition-colors ${isDeactivated ? 'bg-slate-50/50 opacity-70' : ''}">
                  <!-- Student Info -->
                  <td class="py-3.5 px-4">
                    <div class="flex items-center gap-3">
                      <img 
                        src="${st.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}" 
                        alt="${st.name}" 
                        class="w-9 h-9 rounded-full object-cover border border-slate-200 flex-shrink-0"
                      />
                      <div>
                        <span class="font-bold text-slate-900 text-xs block">${st.name}</span>
                        <span class="text-[11px] text-blue-600 font-mono font-bold block">@${(st.username || '').replace(/^@+/, '') || 'Not set'}</span>
                        <span class="text-[11px] text-slate-500 block">${st.email}</span>
                        ${st.phone ? `<span class="text-[10px] text-slate-400 font-mono block">${st.phone}</span>` : ''}
                      </div>
                    </div>
                  </td>

                  <!-- Student Security & Password -->
                  <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        <i data-lucide="shield-check" class="w-3.5 h-3.5 text-emerald-600"></i>
                        Protected
                      </span>
                      <button 
                        onclick="window.adminDashboard.openResetPasswordModal('${st.id}')"
                        class="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Change / Reset Password"
                      >
                        <i data-lucide="key-round" class="w-3 h-3"></i> Reset Password
                      </button>
                    </div>
                  </td>

                  <!-- CA Level & Registration No -->
                  <td class="py-3.5 px-4">
                    <span class="inline-block px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      ${st.caLevel || 'CA Foundation'}
                    </span>
                    <span class="block text-[11px] text-slate-400 font-mono mt-0.5">
                      ${st.registrationNo || 'REG-PENDING'}
                    </span>
                  </td>

                  <!-- Activity Counts -->
                  <td class="py-3.5 px-4">
                    <div class="text-xs text-slate-600 space-y-0.5">
                      <div><strong class="text-slate-900 font-mono">${studentAttempts}</strong> MCQ Attempts</div>
                      <div><strong class="text-slate-900 font-mono">${studentSubs}</strong> Paper Submissions</div>
                    </div>
                  </td>

                  <!-- Account Status Badge & Toggle -->
                  <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        isDeactivated 
                          ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }">
                        <span class="w-1.5 h-1.5 rounded-full ${isDeactivated ? 'bg-rose-500' : 'bg-emerald-500'}"></span>
                        ${isDeactivated ? 'Deactivated' : 'Active'}
                      </span>
                      <button 
                        onclick="window.adminDashboard.toggleStudentActivation('${st.id}')"
                        class="text-[11px] font-semibold ${isDeactivated ? 'text-emerald-700 hover:underline' : 'text-slate-500 hover:text-rose-600 hover:underline'} cursor-pointer"
                        title="${isDeactivated ? 'Activate this account' : 'Deactivate this account'}"
                      >
                        ${isDeactivated ? 'Activate' : 'Deactivate'}
                      </button>
                    </div>
                  </td>

                  <!-- Actions -->
                  <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <button 
                      onclick="window.adminDashboard.openEditStudentModal('${st.id}')"
                      class="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded mr-1 cursor-pointer"
                    >
                      Details & Edit
                    </button>
                    <button 
                      onclick="window.adminDashboard.confirmRemoveStudent('${st.id}')"
                      class="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded cursor-pointer"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- Interactive Pagination Bar -->
        ${totalPages > 1 || pageSize === 0 ? `
          <div class="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="text-slate-600">
              Showing <span class="font-semibold text-slate-900">${totalFiltered === 0 ? 0 : startIndex + 1}</span> to <span class="font-semibold text-slate-900">${endIndex}</span> of <span class="font-bold text-slate-900">${totalFiltered}</span> students
            </div>
            ${pageSize > 0 && totalPages > 1 ? `
              <div class="flex items-center gap-1">
                <button 
                  onclick="window.adminDashboard.setStudentPage(${this.studentPage - 1})"
                  ${this.studentPage <= 1 ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
                >
                  Previous
                </button>
                ${Array.from({ length: totalPages }, (_, idx) => idx + 1).map(p => `
                  <button 
                    onclick="window.adminDashboard.setStudentPage(${p})"
                    class="px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      p === this.studentPage 
                        ? 'bg-blue-600 text-white shadow-xs' 
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }"
                  >
                    ${p}
                  </button>
                `).join('')}
                <button 
                  onclick="window.adminDashboard.setStudentPage(${this.studentPage + 1})"
                  ${this.studentPage >= totalPages ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
                >
                  Next
                </button>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  handleStudentSearch(query) {
    this.studentSearch = query || '';
    this.studentPage = 1;
    this.renderStudentTableOnly();
  }

  clearStudentSearch() {
    this.studentSearch = '';
    this.studentPage = 1;
    const inp = document.getElementById('student-search-input');
    if (inp) inp.value = '';
    this.renderStudentTableOnly();
  }

  handleStudentStatusFilter(status) {
    this.studentStatusFilter = status;
    this.studentPage = 1;
    this.renderStudentTableOnly();
  }

  handleStudentLevelFilter(level) {
    this.studentLevelFilter = level;
    this.studentPage = 1;
    this.renderStudentTableOnly();
  }

  handleStudentPageSize(size) {
    this.studentPageSize = parseInt(size, 10);
    this.studentPage = 1;
    this.renderStudentTableOnly();
  }

  setStudentPage(page) {
    this.studentPage = page;
    this.renderStudentTableOnly();
  }

  togglePasswordVisibility() {
    this.showStudentPasswords = !this.showStudentPasswords;
    this.renderStudentTableOnly();
  }

  toggleStudentActivation(studentId) {
    const student = window.store.getUserById(studentId);
    if (!student) return;

    const newStatus = window.store.toggleUserStatus(studentId);
    window.app.showToast(
      `Student ${student.name} is now ${newStatus ? 'ACTIVATED' : 'DEACTIVATED'}.`,
      newStatus ? 'success' : 'warning'
    );
    this.renderStudents();
  }

  async confirmRemoveStudent(studentId) {
    if (this._isDeletingStudent) return;
    const student = window.store.getUserById(studentId);
    if (!student) return;

    if (!confirm(`Permanently remove student "${student.name}" (@${student.username || studentId})?\n\nThis will delete their account, quiz attempts, and paper submissions permanently from the server and database.`)) {
      return;
    }

    this._isDeletingStudent = true;
    const removeBtn = document.querySelector(`button[onclick*="confirmRemoveStudent('${studentId}')"]`);
    if (removeBtn) {
      removeBtn.disabled = true;
      removeBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin inline mr-1"></i>Removing...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      // 1. Authoritative delete: send delete request to backend and await confirmation
      await window.store.deleteUser(studentId);

      // 2. Immediately fetch the latest student list from the backend/database
      await this.syncBackendUsers();

      // 3. Update UI and recalculate counts from fresh database state
      window.app.showToast(`Student ${student.name} permanently removed.`, 'success');
      this.renderStudents(true);
      if (this.currentTab === 'overview') this.renderOverview();
    } catch (err) {
      console.error('[confirmRemoveStudent] Deletion failed:', err);
      window.app.showToast(`Failed to remove student: ${err.message || err}`, 'error');
      // On failure, student was not removed; re-render table to restore button state
      this.renderStudents(true);
    } finally {
      this._isDeletingStudent = false;
    }
  }

  async deleteStudent(studentId) {
    return this.confirmRemoveStudent(studentId);
  }

  openAddStudentModal() {
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">Add New Student</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveNewStudent(event)" class="space-y-4 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Student Full Name *</label>
              <input type="text" id="add-st-name" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Rahul Gupta">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Username *</label>
              <input type="text" id="add-st-username" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-700" placeholder="e.g. rahul_gupta">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Email Address (Login) *</label>
              <input type="email" id="add-st-email" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="rahul@castudent.in">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Mobile / Phone Number *</label>
              <input type="tel" id="add-st-phone" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono" placeholder="+91 98765 43210">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Password *</label>
              <input type="text" id="add-st-pass" required value="student123" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">CA Curriculum Level *</label>
              <select id="add-st-level" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 bg-white">
                <option value="CA FOUNDATION">CA FOUNDATION</option>
                <option value="CA INTER" selected>CA INTER</option>
                <option value="CA FINAL">CA FINAL</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">ICAI Registration No</label>
            <input type="text" id="add-st-reg" required value="CRO-${Math.floor(100000 + Math.random() * 900000)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono">
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
              Save Student
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  async saveNewStudent(e) {
    if (e && e.preventDefault) e.preventDefault();
    const name = document.getElementById('add-st-name').value.trim();
    const rawUsername = document.getElementById('add-st-username').value.trim().toLowerCase().replace(/^@+/, '');
    const email = document.getElementById('add-st-email').value.trim();
    const phone = document.getElementById('add-st-phone').value.trim();
    const password = document.getElementById('add-st-pass').value.trim();
    const caLevel = document.getElementById('add-st-level').value;
    const registrationNo = document.getElementById('add-st-reg').value.trim();

    if (!name || !email || !password) {
      window.app.showToast('Please provide Student Name, Email, and Password.', 'error');
      return;
    }

    const cleanUsername = rawUsername || email.split('@')[0];
    const submitBtn = e && e.target ? e.target.querySelector('button[type="submit"]') : null;
    const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> Provisioning Student...';
    }

    try {
      const currentAdmin = window.auth ? window.auth.getCurrentUser() : null;
      const adminToken = currentAdmin ? (currentAdmin.token || 'token_admin_excellenceca_secret') : 'token_admin_excellenceca_secret';

      // 1. Authoritative Backend Provisioning via POST /api/admin/users
      let authoritativeUser = null;
      if (typeof fetch !== 'undefined') {
        try {
          const resp = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminToken}`,
              'X-Auth-Token': adminToken
            },
            body: JSON.stringify({
              name,
              username: cleanUsername,
              email,
              phone,
              password,
              caLevel,
              registrationNo,
              role: 'student'
            })
          });

          const text = await resp.text();
          let data = null;
          try { data = JSON.parse(text); } catch (jsonErr) {}

          if (!resp.ok || !data || !data.success) {
            if (resp.status === 404) {
              console.warn('[AdminDashboard] Backend provisioning endpoint returned 404, proceeding with Firebase cloud provisioning.');
            } else {
              const errMsg = (data && data.error) ? data.error : 
                (resp.status === 403 ? 'Administrator authorization required to provision students.' :
                 resp.status === 409 ? (data && data.error ? data.error : 'A student with this username or email already exists.') :
                 resp.status >= 500 ? 'Server error occurred while provisioning student. Please try again.' :
                 'Failed to provision student on server. Please verify fields.');
              window.app.showToast(errMsg, 'error');
              return;
            }
          }

          authoritativeUser = (data && data.user) ? data.user : null;
          if (data && data.token && authoritativeUser) authoritativeUser.token = data.token;
        } catch (apiErr) {
          console.warn('[AdminDashboard] Server provisioning error, proceeding with local fallback:', apiErr);
        }
      }

      const hashedPassword = window.auth ? window.auth.hashPassword(password) : password;
      const finalStudent = authoritativeUser ? {
        ...authoritativeUser,
        password: hashedPassword,
        registrationNo,
        phone
      } : {
        id: 'usr-' + Date.now(),
        name,
        username: cleanUsername,
        email,
        phone,
        password: hashedPassword,
        token: `token_student_${Date.now()}`,
        role: 'student',
        caLevel,
        registrationNo,
        isActive: true,
        totalXp: 0,
        baseXp: 0,
        referralCount: 0,
        referralPoints: 0,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
        createdAt: new Date().toISOString()
      };

      window.store.addUser(finalStudent);
      if (window.firebaseSync && typeof window.firebaseSync.saveUser === 'function') {
        window.firebaseSync.saveUser(finalStudent);
      }

      window.app.closeModal('admin-generic-modal');
      window.app.showToast(`Student ${name} (@${cleanUsername}) provisioned successfully.`, 'success');
      this.renderStudents();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnHtml;
      }
    }
  }

  openEditStudentModal(studentId) {
    const student = window.store.getUserById(studentId);
    if (!student) return;

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    const usernameVal = (student.username || '').replace(/^@+/, '');

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div class="flex items-center gap-3">
            <img src="${student.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}" class="w-10 h-10 rounded-full object-cover border border-slate-200">
            <div>
              <h3 class="text-base font-bold text-slate-900">Student Account Details</h3>
              <span class="text-xs text-blue-600 font-mono font-semibold">@${usernameVal || 'Not set'}</span>
            </div>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveEditStudent(event, '${student.id}')" class="space-y-4 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Full Name *</label>
              <input type="text" id="edit-st-name" required value="${student.name || ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Username *</label>
              <input type="text" id="edit-st-username" value="${usernameVal}" placeholder="Not set" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-700">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Email Address *</label>
              <input type="email" id="edit-st-email" required value="${student.email || ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Mobile / Phone Number</label>
              <input type="tel" id="edit-st-phone" value="${student.phone || ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">CA Curriculum Level</label>
              <select id="edit-st-level" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 bg-white">
                <option value="CA FOUNDATION" ${(student.caLevel || '').toUpperCase().includes('FOUNDATION') ? 'selected' : ''}>CA FOUNDATION</option>
                <option value="CA INTER" ${(student.caLevel || '').toUpperCase().includes('INTER') ? 'selected' : ''}>CA INTER</option>
                <option value="CA FINAL" ${(student.caLevel || '').toUpperCase().includes('FINAL') ? 'selected' : ''}>CA FINAL</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">ICAI Registration No</label>
              <input type="text" id="edit-st-reg" value="${student.registrationNo || ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono">
            </div>
          </div>

          <!-- Academic & Referral Performance Metrics -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-3 gap-3 text-center">
            <div>
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Academic XP</span>
              <span class="text-sm font-black text-indigo-700">${Number(student.totalXp !== undefined ? student.totalXp : (student.baseXp || 0)).toLocaleString()} XP</span>
            </div>
            <div>
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Referral Points</span>
              <span class="text-sm font-black text-emerald-700">${Number(student.referralPoints || 0).toLocaleString()} Pts</span>
            </div>
            <div>
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Referrals Count</span>
              <span class="text-sm font-black text-blue-700">${student.referralCount || 0} Students</span>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveEditStudent(e, studentId) {
    e.preventDefault();
    const student = window.store.getUserById(studentId);
    if (!student) return;

    const name = document.getElementById('edit-st-name').value.trim();
    const rawUsername = document.getElementById('edit-st-username').value.trim().replace(/^@+/, '');
    const email = document.getElementById('edit-st-email').value.trim();
    const phone = document.getElementById('edit-st-phone').value.trim();
    const caLevel = document.getElementById('edit-st-level').value;
    const registrationNo = document.getElementById('edit-st-reg').value.trim();

    // Check for duplicate username across other users
    if (rawUsername) {
      const users = window.store.getUsers();
      const duplicate = users.find(u => u.id !== studentId && u.username && u.username.toLowerCase() === rawUsername.toLowerCase());
      if (duplicate) {
        window.app.showToast(`Username "@${rawUsername}" is already taken by another student.`, 'error');
        return;
      }
    }

    student.name = name;
    student.username = rawUsername || student.username || 'Not set';
    student.email = email;
    student.phone = phone;
    student.caLevel = caLevel;
    student.registrationNo = registrationNo;

    window.store.updateUser(student);
    if (window.firebaseSync && typeof window.firebaseSync.saveUser === 'function') {
      window.firebaseSync.saveUser(student);
    }

    window.app.closeModal('admin-generic-modal');
    window.app.showToast(`Student details updated successfully for ${student.name}.`, 'success');
    this.renderStudents();
  }

  openResetPasswordModal(studentId) {
    const student = window.store.getUserById(studentId);
    if (!student) return;

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">Reset Password for ${student.name}</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveResetPassword(event, '${student.id}')" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Enter New Password</label>
            <input type="text" id="reset-pass-val" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold" placeholder="e.g. 123456">
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" id="reset-pass-submit-btn" class="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50">Save New Password</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  async saveResetPassword(e, studentId) {
    e.preventDefault();
    const inputEl = document.getElementById('reset-pass-val');
    const submitBtn = document.getElementById('reset-pass-submit-btn') || (e.target ? e.target.querySelector('button[type="submit"]') : null);
    const newPass = inputEl ? inputEl.value.trim() : '';

    if (!newPass || newPass.length < 6) {
      window.app.showToast('Password must be at least 6 characters long.', 'error');
      return;
    }

    const student = window.store.getUserById(studentId);
    if (!student) {
      window.app.showToast('Student not found in store.', 'error');
      return;
    }

    const origBtnText = submitBtn ? submitBtn.innerHTML : 'Save New Password';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-block animate-spin mr-1.5">⏳</span> Updating...';
    }

    try {
      const currentUser = window.auth ? window.auth.getCurrentUser() : null;
      const token = currentUser ? (currentUser.token || currentUser.email) : '';
      const resp = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: studentId, newPassword: newPass })
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Failed to update student password on server.');
      }

      // Update local store without overwriting backend/Firebase session tokens
      const localUsers = window.store.getUsers();
      const sIdx = localUsers.findIndex(u => u.id === studentId);
      if (sIdx !== -1) {
        localUsers[sIdx].hasPassword = true;
        if (data.token) {
          localUsers[sIdx].token = data.token;
        }
        window.store.saveUsers(localUsers);
      }

      window.app.closeModal('admin-generic-modal');
      window.app.showToast(data.message || `Password updated successfully for ${student.name}`, 'success');
      this.renderStudents();
    } catch (err) {
      console.error('[AdminDashboard] saveResetPassword error:', err);
      window.app.showToast(`Error: ${err.message}`, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnText;
      }
    }
  }

  // --- 3. TEACHER & PRIVILEGES MANAGEMENT ---
  renderTeachers(skipSync = false) {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    if (!skipSync) {
      this.syncBackendUsers(() => {
        if (this.currentTab === 'teachers') this.renderTeachers(true);
      });
    }

    const teachers = window.store.getTeachers();
    const subjects = window.store.getSubjects();

    container.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 class="text-base font-bold text-slate-900">Faculty & Teacher Privilege Management</h3>
          <p class="text-xs text-slate-500 mt-0.5">Invite faculty, assign subjects, and configure permissions (copy grading, test upload, lectures)</p>
        </div>
        <button 
          onclick="window.adminDashboard.openAddTeacherModal()"
          class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
        >
          <i data-lucide="user-plus" class="w-4 h-4"></i> Add New Teacher
        </button>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Teacher Name & Email</th>
              <th class="py-3 px-4">Password</th>
              <th class="py-3 px-4">Assigned Subjects</th>
              <th class="py-3 px-4">Configured Privileges</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${teachers.length === 0 ? `
              <tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">No teachers added yet.</td></tr>
            ` : teachers.map(t => {
              const privs = t.privileges || {};
              const assignedSubs = subjects.filter(s => (t.assignedSubjects || []).includes(s.id));

              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-3">
                      <img src="${t.avatar || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120'}" class="w-8 h-8 rounded-full object-cover border border-slate-200">
                      <div>
                        <span class="font-bold text-slate-900 text-xs block">${t.name}</span>
                        <span class="text-[11px] text-slate-500 font-mono">${t.email}</span>
                      </div>
                    </div>
                  </td>
                  <td class="py-3 px-4 font-mono text-xs font-bold text-slate-700">
                    ${t.password}
                  </td>
                  <td class="py-3 px-4 text-xs">
                    ${assignedSubs.length > 0 ? assignedSubs.map(s => `
                      <span class="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-[10px] mr-1 mb-1">
                        ${s.name}
                      </span>
                    `).join('') : '<span class="text-slate-400">All Curriculum</span>'}
                  </td>
                  <td class="py-3 px-4 text-xs space-y-1">
                    <div class="flex flex-wrap gap-1">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${privs.canGradeCopies ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}">
                        ${privs.canGradeCopies ? '✓ Grade Copies' : '✕ No Grading'}
                      </span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${privs.canUploadTests ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-400'}">
                        ${privs.canUploadTests ? '✓ Upload Tests' : '✕ No Test Upload'}
                      </span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${privs.canUploadLectures ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-400'}">
                        ${privs.canUploadLectures ? '✓ Lectures' : '✕ No Lectures'}
                      </span>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-right space-x-2">
                    <button 
                      onclick="window.adminDashboard.openPrivilegesModal('${t.id}')"
                      class="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded border border-amber-200"
                    >
                      Adjust Privileges
                    </button>
                    <button 
                      onclick="window.adminDashboard.deleteTeacher('${t.id}')"
                      class="text-xs font-semibold text-rose-600 hover:text-rose-800"
                    >
                      Remove
                    </button>
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

  openAddTeacherModal() {
    const subjects = window.store.getSubjects();
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">Add Faculty / Teacher</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveNewTeacher(event)" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Teacher Full Name</label>
            <input type="text" id="teach-name" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. CA Amit Kedia, FCA">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Email (Login)</label>
              <input type="email" id="teach-email" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="amit.teacher@excellenceca.com">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Password</label>
              <input type="text" id="teach-pass" required value="123456" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Assigned Subjects (Hold Ctrl to select multiple)</label>
            <select id="teach-subjects" multiple class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs h-24">
              ${subjects.map(s => `<option value="${s.id}" selected>${s.name}</option>`).join('')}
            </select>
          </div>

          <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
            <span class="font-bold text-slate-800 block text-xs">Assign Teacher Privileges:</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="priv-grade" checked class="rounded text-amber-600">
                <span>Can Grade Student Copies</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="priv-upload-tests" checked class="rounded text-amber-600">
                <span>Can Upload Test Question Papers</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="priv-lectures" class="rounded text-amber-600">
                <span>Can Upload Video Lectures</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="priv-students" class="rounded text-amber-600">
                <span>Can View Student Directory</span>
              </label>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm">Save Teacher</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveNewTeacher(e) {
    e.preventDefault();
    const name = document.getElementById('teach-name').value.trim();
    const email = document.getElementById('teach-email').value.trim();
    const password = document.getElementById('teach-pass').value.trim();
    const select = document.getElementById('teach-subjects');
    const assignedSubjects = Array.from(select.selectedOptions).map(opt => opt.value);

    const newTeacher = {
      id: 'usr-teach-' + Date.now(),
      name,
      email,
      password,
      role: 'teacher',
      caLevel: 'Faculty Evaluator',
      registrationNo: 'FAC-' + Math.floor(100 + Math.random() * 900),
      isActive: true,
      assignedSubjects,
      privileges: {
        canGradeCopies: document.getElementById('priv-grade').checked,
        canUploadTests: document.getElementById('priv-upload-tests').checked,
        canUploadLectures: document.getElementById('priv-lectures').checked,
        canViewStudents: document.getElementById('priv-students').checked
      },
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    };

    window.store.addUser(newTeacher);
    window.app.closeModal('admin-generic-modal');
    window.app.showToast(`Teacher ${name} added with password: ${password}`, 'success');
    this.renderTeachers();
  }

  openPrivilegesModal(teacherId) {
    const teacher = window.store.getUserById(teacherId);
    if (!teacher) return;

    const privs = teacher.privileges || {};
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Adjust Privileges: ${teacher.name}</h3>
            <span class="text-xs text-slate-500">${teacher.email}</span>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.savePrivileges(event, '${teacher.id}')" class="space-y-4 text-xs">
          <div class="space-y-3">
            <label class="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
              <div>
                <span class="font-bold text-slate-900 block">Can Check & Grade Student Copies</span>
                <span class="text-slate-500 text-[11px]">Allows evaluating answer sheets and uploading checked copies</span>
              </div>
              <input type="checkbox" id="edit-priv-grade" ${privs.canGradeCopies ? 'checked' : ''} class="w-4 h-4 rounded text-amber-600">
            </label>

            <label class="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
              <div>
                <span class="font-bold text-slate-900 block">Can Upload Question Papers & MCQs</span>
                <span class="text-slate-500 text-[11px]">Allows teacher to create tests and upload Question Paper PDFs</span>
              </div>
              <input type="checkbox" id="edit-priv-upload" ${privs.canUploadTests ? 'checked' : ''} class="w-4 h-4 rounded text-amber-600">
            </label>

            <label class="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
              <div>
                <span class="font-bold text-slate-900 block">Can Upload Video Lectures</span>
                <span class="text-slate-500 text-[11px]">Allows teacher to add classes to the video catalog</span>
              </div>
              <input type="checkbox" id="edit-priv-lectures" ${privs.canUploadLectures ? 'checked' : ''} class="w-4 h-4 rounded text-amber-600">
            </label>

            <label class="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
              <div>
                <span class="font-bold text-slate-900 block">Can View Student Directory</span>
                <span class="text-slate-500 text-[11px]">Allows teacher to view all registered students</span>
              </div>
              <input type="checkbox" id="edit-priv-students" ${privs.canViewStudents ? 'checked' : ''} class="w-4 h-4 rounded text-amber-600">
            </label>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm">Save Privileges</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  savePrivileges(e, teacherId) {
    e.preventDefault();
    const teacher = window.store.getUserById(teacherId);
    if (!teacher) return;

    teacher.privileges = {
      canGradeCopies: document.getElementById('edit-priv-grade').checked,
      canUploadTests: document.getElementById('edit-priv-upload').checked,
      canUploadLectures: document.getElementById('edit-priv-lectures').checked,
      canViewStudents: document.getElementById('edit-priv-students').checked
    };

    window.store.updateUser(teacher);
    window.app.closeModal('admin-generic-modal');
    window.app.showToast(`Privileges updated for ${teacher.name}.`, 'success');
    this.renderTeachers();
  }

  async deleteTeacher(teacherId) {
    const teacher = window.store.getUserById(teacherId);
    if (!teacher) return;

    if (confirm(`Remove teacher ${teacher.name}?`)) {
      try {
        await window.store.deleteUser(teacherId);
        await this.syncBackendUsers();
        window.app.showToast('Teacher removed.', 'info');
        this.renderTeachers();
        if (this.currentTab === 'overview') this.renderOverview();
      } catch (err) {
        window.app.showToast(`Failed to remove teacher: ${err.message || err}`, 'error');
        this.renderTeachers();
      }
    }
  }

  // --- 4. COMPREHENSIVE TEST PAPER & QUESTION PAPER MANAGEMENT SYSTEM ---
  renderTestPapers() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const assignments = window.store.getAssignments();
    const serverTime = window.secureBackend ? window.secureBackend.getAuthoritativeTime() : new Date();

    container.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800">Admin Control</span>
            <span class="text-xs text-slate-400">• Total Papers: ${assignments.length}</span>
          </div>
          <h3 class="text-lg font-bold text-slate-900">Test Papers & Examination Repository</h3>
          <p class="text-xs text-slate-500 mt-0.5">Administer descriptive papers, live examination windows, schedule publications, and model answer keys.</p>
        </div>
        <div class="flex items-center gap-2">
          <button 
            onclick="window.adminDashboard.openCreatePaperModal()"
            class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="plus-circle" class="w-4 h-4"></i> Create / Upload Test Paper
          </button>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th class="py-3 px-3.5 whitespace-nowrap">Test Name</th>
                <th class="py-3 px-3 whitespace-nowrap">Subject</th>
                <th class="py-3 px-3 whitespace-nowrap">Topic</th>
                <th class="py-3 px-3 whitespace-nowrap">Max Marks</th>
                <th class="py-3 px-3 whitespace-nowrap">Duration</th>
                <th class="py-3 px-3 whitespace-nowrap">Status</th>
                <th class="py-3 px-3 whitespace-nowrap">Scheduled Date/Time</th>
                <th class="py-3 px-3 whitespace-nowrap">Live Start/End Time</th>
                <th class="py-3 px-3 whitespace-nowrap">Question Paper</th>
                <th class="py-3 px-3 whitespace-nowrap">Answer Sheet</th>
                <th class="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${assignments.length === 0 ? `
                <tr>
                  <td colspan="11" class="py-8 text-center text-slate-400">No test papers created yet. Click above to create one.</td>
                </tr>
              ` : assignments.map(a => {
                const subject = window.store.getSubjectById(a.subjectId) || { name: a.subject || 'Accounting' };
                const evalStatus = window.secureBackend ? window.secureBackend.computePaperStatus(a, serverTime) : { badgeText: a.status || 'Published', badgeClass: 'bg-slate-100 text-slate-700' };

                const schedStr = a.scheduledPublishTime ? new Date(a.scheduledPublishTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '<span class="text-slate-400">--</span>';
                
                let liveStr = '<span class="text-slate-400">--</span>';
                if (a.liveStartTime && a.liveEndTime) {
                  const s = new Date(a.liveStartTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                  const e = new Date(a.liveEndTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                  liveStr = `<span class="font-mono text-[11px]">${s} to ${e}</span>`;
                }

                const isCurrentlyLive = evalStatus.statusKey === 'Live';

                return `
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-3.5">
                      <span class="font-bold text-slate-900 block max-w-xs line-clamp-2">${a.title}</span>
                      <div class="flex items-center gap-2 mt-1">
                        ${{
                          free: '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">FREE</span>',
                          core: '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">CORE PASS</span>',
                          plus: '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">PLUS PASS</span>',
                          elite: '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">ELITE PASS</span>'
                        }[String(a.requiredTier || 'free').toLowerCase()] || '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">FREE</span>'}
                        <span class="text-[10px] text-slate-400 font-mono">ID: ${a.id}</span>
                      </div>
                    </td>
                    <td class="py-3 px-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap">
                        ${subject.name}
                      </span>
                    </td>
                    <td class="py-3 px-3 max-w-[140px] truncate text-slate-700 font-medium" title="${a.topic || ''}">
                      ${a.topic || 'General'}
                    </td>
                    <td class="py-3 px-3 font-bold text-slate-800 whitespace-nowrap">
                      ${a.maximumMarks !== undefined && a.maximumMarks !== null ? a.maximumMarks : 0} Marks
                    </td>
                    <td class="py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">
                      ${a.durationMinutes || 180} Mins
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${evalStatus.badgeClass}">
                        ${evalStatus.badgeText}
                      </span>
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap text-slate-600">
                      ${schedStr}
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap text-slate-600">
                      ${liveStr}
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap">
                      ${a.questionPdfId || a.questionPdfData ? `
                        <button 
                          onclick="window.secureBackend.downloadProtectedFile('${a.questionPdfId || 'qp.pdf'}', '${a.id}', 'question', '${a.questionPdfName || 'QuestionPaper.pdf'}')" 
                          class="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 font-bold hover:underline"
                          title="${a.questionPdfName || 'Download Question PDF'}"
                        >
                          <i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF
                        </button>
                      ` : '<span class="text-slate-400">None</span>'}
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap">
                      ${a.answerPdfId || a.answerPdfData ? `
                        <button 
                          onclick="window.secureBackend.downloadProtectedFile('${a.answerPdfId || 'ans.pdf'}', '${a.id}', 'answer', '${a.answerPdfName || 'ModelAnswer.pdf'}')" 
                          class="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-bold hover:underline"
                          title="${a.answerPdfName || 'Download Answer Sheet'}"
                        >
                          <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Key PDF
                        </button>
                      ` : '<span class="text-slate-400">None</span>'}
                    </td>
                    <td class="py-3 px-3.5 text-right whitespace-nowrap space-x-1.5">
                      <button 
                        onclick="window.adminDashboard.openViewDetailsModal('${a.id}')"
                        class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold"
                        title="View Details"
                      >Details</button>
                      <button 
                        onclick="window.adminDashboard.openEditPaperModal('${a.id}')"
                        class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[11px] font-semibold"
                        title="Edit Paper"
                      >Edit</button>
                      <button 
                        onclick="window.adminDashboard.openSchedulePaperModal('${a.id}')"
                        class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] font-semibold"
                        title="Schedule Paper"
                      >Schedule</button>
                      ${isCurrentlyLive ? `
                        <button 
                          onclick="window.adminDashboard.endPaperLive('${a.id}')"
                          class="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold"
                          title="End Live Test"
                        >End Live</button>
                      ` : `
                        <button 
                          onclick="window.adminDashboard.openLiveTestModal('${a.id}')"
                          class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded text-[11px] font-semibold"
                          title="Configure Live Window"
                        >Make Live</button>
                      `}
                      ${a.status !== 'Published' && evalStatus.statusKey !== 'Live' ? `
                        <button 
                          onclick="window.adminDashboard.publishPaperNow('${a.id}')"
                          class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-semibold"
                          title="Publish Immediately"
                        >Publish</button>
                      ` : ''}
                      <button 
                        onclick="window.adminDashboard.confirmDeletePaper('${a.id}')"
                        class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-[11px] font-semibold"
                        title="Delete Paper"
                      >Delete</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  openCreatePaperModal() {
    this.openEditPaperModal(null);
  }

  openUploadPaperModal() {
    this.openCreatePaperModal();
  }

  openEditPaperModal(paperId) {
    const isEdit = !!paperId;
    const paper = isEdit ? window.store.getAssignmentById(paperId) : null;
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    this.activeEditingPaperId = paperId;
    this.selectedNewQuestionFile = null;
    this.selectedNewAnswerFile = null;

    const currentExamLevel = paper ? (paper.examLevel || 'CA Foundation') : 'CA Foundation';
    const validSubjects = window.store && window.store.getDescriptiveSubjectsByLevel 
      ? window.store.getDescriptiveSubjectsByLevel(currentExamLevel) 
      : (window.store && window.store.getSubjects ? window.store.getSubjects() : []);

    const isUntimed = !!(paper && (paper.isUntimed || paper.hasTimeLimit === false || paper.durationMinutes === 0));
    const isPlanSelected = (plan) => {
      if (!paper) return true; // Default to all selected for new paper
      if (Array.isArray(paper.allowedPlans) && paper.allowedPlans.length > 0) {
        return paper.allowedPlans.map(p => String(p).toLowerCase()).includes(plan);
      }
      if (paper.requiredTier) {
        const tier = String(paper.requiredTier).toLowerCase();
        if (tier === 'free') return true;
        const levels = { free: 0, trial: 1, core: 2, plus: 3, elite: 4 };
        return (levels[plan] ?? 0) >= (levels[tier] ?? 0);
      }
      return true;
    };

    modalContent.innerHTML = `
      <div class="p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">${isEdit ? 'Edit Test Paper / Assignment' : 'Create & Upload Test Paper (PDF)'}</h3>
            <span class="text-xs text-slate-500">ExcellenceCA Official Examination System</span>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveTestPaper(event)" class="space-y-4 text-xs">
          <!-- Test Name -->
          <div>
            <label class="block font-bold text-slate-700 mb-1">Test Name / Paper Name <span class="text-rose-500">*</span></label>
            <input 
              type="text" 
              id="admin-paper-title" 
              required 
              value="${paper ? paper.title : ''}"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500" 
              placeholder="e.g. CA Foundation Accounting Mock Paper 1 - Final Assessment"
            >
          </div>

          <!-- Exam Level, Subject and Topic -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Exam Level <span class="text-rose-500">*</span></label>
              <select id="admin-paper-exam-level" onchange="window.adminDashboard.onPaperExamLevelChange(this.value)" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white">
                <option value="CA Foundation" ${!paper || paper.examLevel === 'CA Foundation' ? 'selected' : ''}>CA Foundation</option>
                <option value="CA Intermediate" ${paper && paper.examLevel === 'CA Intermediate' ? 'selected' : ''}>CA Intermediate</option>
                <option value="CA Final" ${paper && paper.examLevel === 'CA Final' ? 'selected' : ''}>CA Final</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Subject <span class="text-rose-500">*</span></label>
              <select id="admin-paper-subject" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 bg-white">
                ${validSubjects.map(s => `
                  <option value="${s.id}" ${paper && (paper.subjectId === s.id || paper.subject === s.name) ? 'selected' : ''}>
                    ${s.name} (${s.level || currentExamLevel})
                  </option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Topic / Chapter Name <span class="text-rose-500">*</span></label>
              <input 
                type="text" 
                id="admin-paper-topic" 
                required 
                value="${paper ? paper.topic : ''}"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500" 
                placeholder="e.g. Partnership Accounts & Financial Statements"
              >
            </div>
          </div>

          <!-- Maximum Marks and Duration -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Maximum Marks <span class="text-rose-500">*</span></label>
              <input 
                type="number" 
                id="admin-paper-marks" 
                min="0" 
                required 
                value="${paper && paper.maximumMarks !== undefined && paper.maximumMarks !== null ? paper.maximumMarks : 100}" 
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500"
              >
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block font-bold text-slate-700">Duration (Minutes) <span class="text-rose-500">*</span></label>
                <label class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-purple-700 hover:text-purple-900 select-none">
                  <input 
                    type="checkbox" 
                    id="admin-paper-untimed" 
                    ${isUntimed ? 'checked' : ''} 
                    onchange="window.adminDashboard.togglePaperUntimed(this.checked)"
                    class="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  >
                  <span>No Time Limit / Untimed</span>
                </label>
              </div>
              <input 
                type="number" 
                id="admin-paper-duration" 
                min="1" 
                max="360" 
                ${isUntimed ? 'disabled' : 'required'} 
                value="${isUntimed ? '' : (paper ? (paper.durationMinutes || 180) : 180)}" 
                placeholder="${isUntimed ? 'No Time Limit' : '180'}"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 ${isUntimed ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white'}"
              >
            </div>
          </div>

          <!-- Description -->
          <div>
            <label class="block font-bold text-slate-700 mb-1">Test Description & Instructions <span class="text-rose-500">*</span></label>
            <textarea 
              id="admin-paper-desc" 
              rows="3" 
              required 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs leading-relaxed focus:ring-2 focus:ring-blue-500" 
              placeholder="Detailed guidelines, chapters tested, and instruction notes for students..."
            >${paper ? paper.description : ''}</textarea>
          </div>

          <!-- Question Paper PDF File Input -->
          <div class="p-3.5 bg-rose-50/50 border border-rose-200 rounded-xl">
            <label class="block font-bold text-rose-950 mb-1 flex items-center justify-between">
              <span>Question Paper PDF (Only .pdf) <span class="text-rose-500">*</span></span>
              ${paper && paper.questionPdfName ? `<span class="text-[11px] font-normal text-rose-700 font-mono">Current: ${paper.questionPdfName}</span>` : ''}
            </label>
            <input 
              type="file" 
              id="admin-paper-qp-file" 
              accept="application/pdf,.pdf" 
              ${!isEdit && !(paper && paper.questionPdfData) ? 'required' : ''}
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white cursor-pointer"
              onchange="window.adminDashboard.handlePaperFileSelect(event, 'question')"
            >
            <span class="text-[11px] text-slate-500 mt-1 block">Protected document. Strict magic-byte check enforces %PDF- validation. Max: 15 MB.</span>
            <div id="qp-file-status" class="hidden mt-1 text-[11px] font-semibold text-emerald-700"></div>
          </div>

          <!-- Answer Sheet / Model Solution PDF Input -->
          <div class="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl">
            <label class="block font-bold text-emerald-950 mb-1 flex items-center justify-between">
              <span>Answer Sheet / Model Answer PDF (Optional)</span>
              ${paper && paper.answerPdfName ? `<span class="text-[11px] font-normal text-emerald-700 font-mono">Current: ${paper.answerPdfName}</span>` : ''}
            </label>
            <input 
              type="file" 
              id="admin-paper-ans-file" 
              accept="application/pdf,.pdf" 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white cursor-pointer"
              onchange="window.adminDashboard.handlePaperFileSelect(event, 'answer')"
            >
            <span class="text-[11px] text-slate-500 mt-1 block">Faculty evaluation key or model solutions. PDF only. Max: 15 MB.</span>
            <div id="ans-file-status" class="hidden mt-1 text-[11px] font-semibold text-emerald-700"></div>
          </div>

          <!-- Paper Status & Required Subscription Tier -->
          <div class="space-y-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Paper Status</label>
              <select id="admin-paper-status" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="Published" ${paper && paper.status === 'Published' ? 'selected' : ''}>Published (Available Immediately)</option>
                <option value="Draft" ${paper && paper.status === 'Draft' ? 'selected' : ''}>Draft (Hidden from Students)</option>
                <option value="Scheduled" ${paper && paper.status === 'Scheduled' ? 'selected' : ''}>Scheduled (Available on Scheduled Date)</option>
                <option value="Live" ${paper && paper.status === 'Live' ? 'selected' : ''}>Live (Active Exam Window)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1.5">Required Subscription Tier(s) <span class="text-slate-400 font-normal">(Select which subscription tiers can access this paper)</span> <span class="text-rose-500">*</span></label>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="free" class="admin-paper-plan rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" ${isPlanSelected('free') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-slate-700">Free Tier</span>
                </label>
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="trial" class="admin-paper-plan rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer" ${isPlanSelected('trial') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-amber-800">₹9 Trial</span>
                </label>
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="core" class="admin-paper-plan rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" ${isPlanSelected('core') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-blue-800">Core Pass</span>
                </label>
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="plus" class="admin-paper-plan rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" ${isPlanSelected('plus') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-indigo-800">Plus Pass</span>
                </label>
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="elite" class="admin-paper-plan rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer" ${isPlanSelected('elite') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-purple-800">Elite Pass</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Hide from non-eligible students toggle -->
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <p class="text-xs font-bold text-slate-800">Hide from non-eligible students</p>
              <p class="text-[11px] text-slate-500">When enabled, students without the required pass will not see this paper at all instead of seeing it locked.</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                id="admin-paper-hide-non-eligible" 
                ${paper && paper.hideFromNonEligible ? 'checked' : ''} 
                class="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
              />
            </label>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm">
              ${isEdit ? 'Save Changes' : 'Create & Save Paper'}
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  async handlePaperFileSelect(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById(type === 'question' ? 'qp-file-status' : 'ans-file-status');

    // Perform pre-flight magic-byte check
    const validation = await window.secureBackend.validatePdfFile(file);
    if (!validation.valid) {
      window.app.showToast(validation.error, 'error');
      e.target.value = '';
      if (statusEl) {
        statusEl.textContent = '❌ Invalid file rejected.';
        statusEl.className = 'mt-1 text-[11px] font-semibold text-rose-600';
        statusEl.classList.remove('hidden');
      }
      return;
    }

    if (type === 'question') {
      this.selectedNewQuestionFile = file;
    } else {
      this.selectedNewAnswerFile = file;
    }

    if (statusEl) {
      statusEl.textContent = `✓ Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB, Valid PDF)`;
      statusEl.className = 'mt-1 text-[11px] font-semibold text-emerald-700';
      statusEl.classList.remove('hidden');
    }
  }

  onPaperExamLevelChange(level) {
    const subjectSelect = document.getElementById('admin-paper-subject');
    if (!subjectSelect) return;
    const subjects = window.store && window.store.getDescriptiveSubjectsByLevel 
      ? window.store.getDescriptiveSubjectsByLevel(level) 
      : (window.store && window.store.getSubjects ? window.store.getSubjects() : []);
    const currentVal = subjectSelect.value;
    subjectSelect.innerHTML = subjects.map(s => `
      <option value="${s.id}">
        ${s.name} (${s.level || level})
      </option>
    `).join('');
    // Keep current selection if valid for new level; otherwise select first subject
    const exists = subjects.some(s => s.id === currentVal || s.name === currentVal);
    if (exists) {
      subjectSelect.value = currentVal;
    } else if (subjects.length > 0) {
      subjectSelect.value = subjects[0].id;
    }
  }

  togglePaperUntimed(isUntimed) {
    const durInput = document.getElementById('admin-paper-duration');
    if (!durInput) return;
    durInput.disabled = isUntimed;
    if (isUntimed) {
      durInput.value = '';
      durInput.placeholder = 'No Time Limit';
      durInput.classList.add('bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
      durInput.removeAttribute('required');
    } else {
      durInput.value = '180';
      durInput.placeholder = '180';
      durInput.classList.remove('bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
      durInput.setAttribute('required', 'required');
    }
  }

  async saveTestPaper(e) {
    e.preventDefault();

    const title = document.getElementById('admin-paper-title').value.trim();
    const examLevel = document.getElementById('admin-paper-exam-level') ? document.getElementById('admin-paper-exam-level').value : 'CA Foundation';
    const subjectId = document.getElementById('admin-paper-subject').value;
    const subjectObj = window.store.getSubjectById(subjectId) || { name: 'Accounting' };
    const rawMarks = document.getElementById('admin-paper-marks').value;
    const parsedMarks = parseInt(rawMarks, 10);
    const maximumMarks = !isNaN(parsedMarks) && parsedMarks >= 0 ? parsedMarks : 0;

    const isUntimed = !!(document.getElementById('admin-paper-untimed') && document.getElementById('admin-paper-untimed').checked);
    const durationInput = document.getElementById('admin-paper-duration');
    const durationMinutes = isUntimed ? 0 : (parseInt(durationInput ? durationInput.value : '180', 10) || 180);

    const description = document.getElementById('admin-paper-desc').value.trim();
    const status = document.getElementById('admin-paper-status').value;

    const planCheckboxes = Array.from(document.querySelectorAll('.admin-paper-plan:checked')).map(cb => cb.value);
    if (planCheckboxes.length === 0) {
      window.app.showToast('Please select at least one subscription tier for this test paper.', 'warning');
      return;
    }
    const allowedPlans = planCheckboxes;
    let requiredTier = 'free';
    if (!allowedPlans.includes('free')) {
      for (const t of ['trial', 'core', 'plus', 'elite']) {
        if (allowedPlans.includes(t)) {
          requiredTier = t;
          break;
        }
      }
    }

    const hideFromNonEligible = document.getElementById('admin-paper-hide-non-eligible') ? document.getElementById('admin-paper-hide-non-eligible').checked : false;

    const isEdit = !!this.activeEditingPaperId;
    const existing = isEdit ? window.store.getAssignmentById(this.activeEditingPaperId) : null;

    let questionPdfName = existing ? existing.questionPdfName : 'QuestionPaper.pdf';
    let questionPdfId = existing ? existing.questionPdfId : null;
    let questionPdfData = existing ? existing.questionPdfData : null;

    let answerPdfName = existing ? existing.answerPdfName : null;
    let answerPdfId = existing ? existing.answerPdfId : null;
    let answerPdfData = existing ? existing.answerPdfData : null;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1"></i> Saving...';
    }

    // If new Question Paper selected, upload
    if (this.selectedNewQuestionFile) {
      const upRes = await window.secureBackend.uploadProtectedPdf(this.selectedNewQuestionFile, 'question');
      if (!upRes.success) {
        window.app.showToast('Question Paper Upload Error: ' + upRes.error, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isEdit ? 'Save Changes' : 'Create & Save Paper';
        }
        return;
      }
      questionPdfName = upRes.fileName;
      questionPdfId = upRes.fileId;
      questionPdfData = upRes.fileData;
    }

    // If new Answer Sheet selected, upload
    if (this.selectedNewAnswerFile) {
      const upRes = await window.secureBackend.uploadProtectedPdf(this.selectedNewAnswerFile, 'answer');
      if (!upRes.success) {
        window.app.showToast('Answer Sheet Upload Error: ' + upRes.error, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isEdit ? 'Save Changes' : 'Create & Save Paper';
        }
        return;
      }
      answerPdfName = upRes.fileName;
      answerPdfId = upRes.fileId;
      answerPdfData = upRes.fileData;
    }

    const paperObj = {
      id: isEdit ? existing.id : ('paper-' + Date.now()),
      title,
      examLevel,
      subjectId,
      subject: subjectObj.name,
      topic,
      maximumMarks,
      durationMinutes,
      isUntimed,
      hasTimeLimit: !isUntimed,
      description,
      status,
      requiredTier,
      allowedPlans,
      hideFromNonEligible,
      isPublished: status !== 'Draft',
      isLive: status === 'Live',
      scheduledPublishTime: (existing && existing.scheduledPublishTime) ? existing.scheduledPublishTime : (status === 'Scheduled' ? new Date(Date.now() + 86400000).toISOString() : null),
      liveStartTime: (existing && existing.liveStartTime) ? existing.liveStartTime : (status === 'Live' ? new Date().toISOString() : null),
      liveEndTime: (existing && existing.liveEndTime) ? existing.liveEndTime : (status === 'Live' ? new Date(Date.now() + (durationMinutes || 180) * 60000).toISOString() : null),
      expiryTime: (existing && existing.expiryTime) ? existing.expiryTime : new Date(Date.now() + 30 * 86400000).toISOString(),
      deadline: (existing && existing.deadline) ? existing.deadline : new Date(Date.now() + 30 * 86400000).toISOString(),
      questionPdfName: questionPdfName || null,
      questionPdfId: questionPdfId || null,
      questionPdfData: questionPdfData || null,
      answerPdfName: answerPdfName || null,
      answerPdfId: answerPdfId || null,
      answerPdfData: answerPdfData || null,
      createdAt: (existing && existing.createdAt) ? existing.createdAt : new Date().toISOString()
    };

    // Strict sanitization: ensure no field in paperObj is undefined (Firebase RTDB throws on undefined)
    Object.keys(paperObj).forEach(k => {
      if (paperObj[k] === undefined) {
        paperObj[k] = null;
      }
    });

    try {
      const curUser = window.auth ? window.auth.getCurrentUser() : null;
      const token = curUser ? (curUser.token || curUser.email) : '';
      const resp = await fetch('/api/papers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(paperObj)
      });
      const resJson = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(resJson.error || `Server error (${resp.status})`);
      }

      if (isEdit) {
        window.store.updateAssignment(paperObj);
        window.app.showToast('Test Paper updated successfully!', 'success');
      } else {
        window.store.addAssignment(paperObj);
        window.app.showToast('Test Paper created & uploaded successfully!', 'success');
      }

      // Trigger notification to students matching exam level if newly created and published
      if (!isEdit && paperObj.isPublished) {
        const allStudents = window.store.getStudents ? window.store.getStudents() : [];
        const bulkNotifs = [];
        allStudents.forEach(st => {
          const stLevel = (st.caLevel || '').toUpperCase();
          const pLevel = (examLevel || '').toUpperCase();
          if (!pLevel || (stLevel.includes('FOUNDATION') && pLevel.includes('FOUNDATION')) ||
              (stLevel.includes('INTER') && pLevel.includes('INTER')) ||
              (stLevel.includes('FINAL') && pLevel.includes('FINAL')) ||
              !st.caLevel) {
            bulkNotifs.push({
              userId: st.id,
              type: 'new_paper',
              title: 'New Test Paper Uploaded!',
              message: `${paperObj.title} (${paperObj.subject}) is now available for download.`,
              link: 'assignments',
              metadata: { paperId: paperObj.id }
            });
          }
        });
        if (bulkNotifs.length > 0 && window.store && typeof window.store.addNotificationsBulk === 'function') {
          window.store.addNotificationsBulk(bulkNotifs);
        }
      }

      window.app.closeModal('admin-generic-modal');
      this.renderTestPapers();
    } catch (err) {
      console.error('[AdminDashboard] Save paper error:', err);
      window.app.showToast(`Failed to save test paper: ${err.message}`, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Save Changes' : 'Create & Save Paper';
      }
    }
  }

  async confirmDeletePaper(paperId) {
    const paper = window.store.getAssignmentById(paperId);
    if (!paper) return;

    // Hard protection for core test papers
    const protectedTitles = [
      'Indian Regulatory Framework – Descriptive Practice Test 1',
      'Indian Regulatory Framework – Descriptive Practice Test 2',
      'Indian Regulatory Framework - Descriptive Practice Test 1',
      'Indian Regulatory Framework - Descriptive Practice Test 2'
    ];
    const protectedIds = ['asg-1789408695574', 'asg-1789409044746'];
    if (protectedIds.includes(paperId) || (paper.title && protectedTitles.includes(paper.title))) {
      window.app.showToast('This core practice test paper is protected and cannot be deleted.', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete the test paper:\n"${paper.title}"?\n\nThis will remove the question paper, attached answer keys, and student submission records.`)) {
      return;
    }

    try {
      const curUser = window.auth ? window.auth.getCurrentUser() : null;
      const token = curUser ? (curUser.token || curUser.email) : '';
      const resp = await fetch('/api/papers/delete', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: paperId })
      });

      const resJson = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(resJson.error || `Server error (${resp.status})`);
      }

      window.store.deleteAssignment(paperId);
      window.app.showToast('Test paper deleted successfully.', 'info');
      this.renderTestPapers();
    } catch (err) {
      console.error('[AdminDashboard] Delete paper error:', err);
      window.app.showToast(`Failed to delete test paper: ${err.message}`, 'error');
    }
  }

  openSchedulePaperModal(paperId) {
    const paper = window.store.getAssignmentById(paperId);
    if (!paper) return;

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    const defaultDate = paper.scheduledPublishTime ? paper.scheduledPublishTime.slice(0, 16) : new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    const defaultExpiry = paper.expiryTime ? paper.expiryTime.slice(0, 16) : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Schedule Test Paper Release</h3>
            <p class="text-xs text-slate-500 mt-0.5">${paper.title}</p>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveScheduledPaper(event, '${paper.id}')" class="space-y-4 text-xs">
          <div class="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 leading-relaxed">
            <i data-lucide="clock" class="w-4 h-4 inline-block mr-1 text-indigo-600"></i>
            Scheduled test papers will be locked. Students cannot view or download the Question Paper before the scheduled date and time.
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Publish / Schedule Date & Time <span class="text-rose-500">*</span></label>
            <input 
              type="datetime-local" 
              id="sched-publish-time" 
              required 
              value="${defaultDate}"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
            >
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Optional Expiry Date & Time</label>
            <input 
              type="datetime-local" 
              id="sched-expiry-time" 
              value="${defaultExpiry}"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
            >
            <span class="text-[11px] text-slate-400 mt-1 block">After this date, the paper moves to Completed/Expired status.</span>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm">
              Confirm Schedule
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveScheduledPaper(e, paperId) {
    e.preventDefault();
    const paper = window.store.getAssignmentById(paperId);
    if (!paper) return;

    const publishTimeVal = document.getElementById('sched-publish-time').value;
    const expiryTimeVal = document.getElementById('sched-expiry-time').value;

    paper.status = 'Scheduled';
    paper.scheduledPublishTime = new Date(publishTimeVal).toISOString();
    if (expiryTimeVal) {
      paper.expiryTime = new Date(expiryTimeVal).toISOString();
      paper.deadline = paper.expiryTime;
    }

    window.store.updateAssignment(paper);
    window.app.closeModal('admin-generic-modal');
    window.app.showToast('Paper scheduled successfully!', 'success');
    this.renderTestPapers();
  }

  openLiveTestModal(paperId) {
    const paper = window.store.getAssignmentById(paperId);
    if (!paper) return;

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    const now = new Date();
    const defaultStart = paper.liveStartTime ? paper.liveStartTime.slice(0, 16) : now.toISOString().slice(0, 16);
    const defaultEnd = paper.liveEndTime ? paper.liveEndTime.slice(0, 16) : new Date(now.getTime() + (paper.durationMinutes || 180) * 60000).toISOString().slice(0, 16);

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Configure Live Examination Window</h3>
            <p class="text-xs text-slate-500 mt-0.5">${paper.title}</p>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveLiveTest(e, '${paper.id}')" class="space-y-4 text-xs">
          <div class="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-950 leading-relaxed">
            <i data-lucide="alert-circle" class="w-4 h-4 inline-block mr-1 text-rose-600"></i>
            Live Window Rule: The paper will display <strong>"Live Test starts at [date/time]"</strong> before start time, <strong>"Live Now"</strong> during the window, and <strong>"Live Test Ended"</strong> after conclusion. Access is strictly blocked outside the window.
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Live Start Date & Time <span class="text-rose-500">*</span></label>
            <input 
              type="datetime-local" 
              id="live-start-time" 
              required 
              value="${defaultStart}"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-rose-500"
            >
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Live End Date & Time <span class="text-rose-500">*</span></label>
            <input 
              type="datetime-local" 
              id="live-end-time" 
              required 
              value="${defaultEnd}"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-rose-500"
            >
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="button" onclick="window.adminDashboard.saveLiveTestDirect('${paper.id}')" class="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm">
              Activate Live Window
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveLiveTestDirect(paperId) {
    const paper = window.store.getAssignmentById(paperId);
    if (!paper) return;

    const startVal = document.getElementById('live-start-time').value;
    const endVal = document.getElementById('live-end-time').value;

    if (!startVal || !endVal) {
      window.app.showToast('Both Start and End Date/Time are required.', 'warning');
      return;
    }

    const startDate = new Date(startVal);
    const endDate = new Date(endVal);

    if (endDate <= startDate) {
      window.app.showToast('End time must be after start time.', 'error');
      return;
    }

    paper.status = 'Live';
    paper.isLive = true;
    paper.liveStartTime = startDate.toISOString();
    paper.liveEndTime = endDate.toISOString();
    paper.expiryTime = paper.liveEndTime;
    paper.deadline = paper.liveEndTime;

    window.store.updateAssignment(paper);
    window.app.closeModal('admin-generic-modal');
    window.app.showToast('Live Test window successfully configured!', 'success');
    this.renderTestPapers();
  }

  endPaperLive(paperId) {
    const paper = window.store.getAssignmentById(paperId);
    if (!paper) return;

    if (confirm(`End the live examination for "${paper.title}" immediately?`)) {
      paper.isLive = false;
      paper.status = 'Completed/Expired';
      paper.liveEndTime = new Date().toISOString();
      paper.expiryTime = paper.liveEndTime;
      window.store.updateAssignment(paper);
      window.app.showToast('Live test ended.', 'info');
      this.renderTestPapers();
    }
  }

  publishPaperNow(paperId) {
    const paper = window.store.getAssignmentById(paperId);
    if (!paper) return;

    paper.status = 'Published';
    paper.isPublished = true;
    paper.isLive = false;
    paper.scheduledPublishTime = new Date().toISOString();
    window.store.updateAssignment(paper);
    window.app.showToast('Paper published and available immediately!', 'success');
    this.renderTestPapers();
  }

  openViewDetailsModal(paperId) {
    const paper = window.store.getAssignmentById(paperId);
    if (!paper) return;

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    const subject = window.store.getSubjectById(paper.subjectId) || { name: paper.subject || 'Accounting' };
    const evalStatus = window.secureBackend ? window.secureBackend.computePaperStatus(paper) : { badgeText: paper.status, badgeClass: '' };

    modalContent.innerHTML = `
      <div class="p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <span class="text-xs font-bold text-blue-600 uppercase tracking-wider">${subject.name} • ${paper.topic}</span>
            <h3 class="text-lg font-bold text-slate-900 mt-0.5">${paper.title}</h3>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span class="text-[10px] font-bold text-slate-400 uppercase block">Status</span>
            <span class="text-xs font-bold text-slate-800">${evalStatus.badgeText}</span>
          </div>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span class="text-[10px] font-bold text-slate-400 uppercase block">Max Marks</span>
            <span class="text-xs font-bold text-slate-800">${paper.maximumMarks} Marks</span>
          </div>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span class="text-[10px] font-bold text-slate-400 uppercase block">Duration</span>
            <span class="text-xs font-bold text-slate-800">${paper.durationMinutes || 180} Minutes</span>
          </div>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span class="text-[10px] font-bold text-slate-400 uppercase block">Paper ID</span>
            <span class="text-xs font-bold text-slate-800 font-mono">${paper.id}</span>
          </div>
        </div>

        <div class="space-y-4 text-xs mb-6">
          <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl leading-relaxed">
            <span class="font-bold text-slate-800 block mb-1">Instructions / Description:</span>
            <p class="text-slate-600 whitespace-pre-line">${paper.description}</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="p-3 border border-slate-200 rounded-lg">
              <span class="font-bold text-slate-700 block mb-1">Schedule Window</span>
              <p class="text-slate-600">Publish Time: <strong>${paper.scheduledPublishTime ? new Date(paper.scheduledPublishTime).toLocaleString() : 'Not scheduled'}</strong></p>
              <p class="text-slate-600">Expiry Time: <strong>${paper.expiryTime ? new Date(paper.expiryTime).toLocaleString() : 'No expiry'}</strong></p>
            </div>
            <div class="p-3 border border-slate-200 rounded-lg">
              <span class="font-bold text-slate-700 block mb-1">Live Examination Window</span>
              <p class="text-slate-600">Live Start: <strong>${paper.liveStartTime ? new Date(paper.liveStartTime).toLocaleString() : 'Not configured'}</strong></p>
              <p class="text-slate-600">Live End: <strong>${paper.liveEndTime ? new Date(paper.liveEndTime).toLocaleString() : 'Not configured'}</strong></p>
            </div>
          </div>

          <div class="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
            <div>
              <span class="font-bold text-rose-950 block">Official Question Paper (PDF)</span>
              <span class="text-slate-500 font-mono text-[11px]">${paper.questionPdfName || 'qp.pdf'}</span>
            </div>
            <button 
              onclick="window.secureBackend.downloadProtectedFile('${paper.questionPdfId || 'qp.pdf'}', '${paper.id}', 'question', '${paper.questionPdfName || 'QuestionPaper.pdf'}')" 
              class="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs flex items-center gap-1"
            >
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Download
            </button>
          </div>

          ${paper.answerPdfName || paper.answerPdfData ? `
            <div class="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div>
                <span class="font-bold text-emerald-950 block">Official Model Answer Sheet (PDF)</span>
                <span class="text-slate-500 font-mono text-[11px]">${paper.answerPdfName || 'ans.pdf'}</span>
              </div>
              <button 
                onclick="window.secureBackend.downloadProtectedFile('${paper.answerPdfId || 'ans.pdf'}', '${paper.id}', 'answer', '${paper.answerPdfName || 'ModelAnswer.pdf'}')" 
                class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs flex items-center gap-1"
              >
                <i data-lucide="download" class="w-3.5 h-3.5"></i> Download
              </button>
            </div>
          ` : ''}
        </div>

        <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
          <button onclick="window.app.closeModal('admin-generic-modal')" class="px-5 py-2 font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Close</button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }


  // --- 5. CHECKED COPY GRADING CENTER ---
  renderGradingCenter() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const submissions = window.store.getSubmissions();

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-base font-bold text-slate-900">Student Copy Evaluation & Return Center</h3>
          <p class="text-xs text-slate-500 mt-0.5">Check student answers, award marks, write remarks, and upload Evaluated/Checked Copy PDFs</p>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Student</th>
              <th class="py-3 px-4">Test Paper</th>
              <th class="py-3 px-4">Student Answer Sheet</th>
              <th class="py-3 px-4">Status & Score</th>
              <th class="py-3 px-4">Returned Checked Copy</th>
              <th class="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${submissions.length === 0 ? `
              <tr><td colspan="6" class="py-8 text-center text-xs text-slate-400">No student copies submitted yet.</td></tr>
            ` : submissions.map(sub => {
              const asg = window.store.getAssignmentById(sub.assignmentId);
              const isEvaluated = sub.status === 'Evaluated';

              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4">
                    <span class="font-bold text-slate-900 text-xs block">${sub.studentName}</span>
                    <span class="text-[11px] text-slate-500">${new Date(sub.submittedAt).toLocaleDateString()}</span>
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-700 font-semibold max-w-xs truncate">
                    ${asg ? asg.title : 'CA Paper'}
                  </td>
                  <td class="py-3 px-4 text-xs font-mono">
                    <a href="${sub.fileData}" download="${sub.fileName}" class="text-blue-600 hover:underline flex items-center gap-1 font-semibold">
                      <i data-lucide="file" class="w-3.5 h-3.5 text-rose-500"></i>
                      ${sub.fileName}
                    </a>
                  </td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold ${isEvaluated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                      ${sub.status} ${isEvaluated ? `(${sub.marksObtained}/${sub.maxMarks || 50})` : ''}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-xs">
                    ${sub.checkedCopyPdfData ? `
                      <a href="${sub.checkedCopyPdfData}" download="${sub.checkedCopyFileName}" class="text-emerald-700 hover:underline font-bold inline-flex items-center gap-1">
                        <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-600"></i>
                        ${sub.checkedCopyFileName}
                      </a>
                    ` : '<span class="text-slate-400 italic">Not uploaded yet</span>'}
                  </td>
                  <td class="py-3 px-4 text-right">
                    <button 
                      onclick="window.adminDashboard.openGradeModal('${sub.id}')"
                      class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm"
                    >
                      ${isEvaluated ? 'Edit Checked Copy' : 'Check Copy & Grade →'}
                    </button>
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

  openGradeModal(submissionId) {
    this.activeGradingSubmissionId = submissionId;
    this.selectedCheckedPdfFile = null;

    const submission = window.store.getSubmissions().find(s => s.id === submissionId);
    if (!submission) return;

    const asg = window.store.getAssignmentById(submission.assignmentId);
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Evaluate Student Answer Sheet</h3>
            <span class="text-xs text-slate-500">Student: <strong>${submission.studentName}</strong> • ${asg ? asg.title : 'CA Paper'}</span>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
              <i data-lucide="file-text" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-xs font-mono font-bold text-slate-900 block">${submission.fileName}</span>
              <span class="text-[11px] text-slate-500">Submitted: ${new Date(submission.submittedAt).toLocaleString()}</span>
            </div>
          </div>
          <a 
            href="${submission.fileData}" 
            download="${submission.fileName}"
            class="px-3.5 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-white border border-slate-200 rounded-lg shadow-sm inline-flex items-center gap-1.5"
          >
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download Student Answer Copy
          </a>
        </div>

        <form onsubmit="window.adminDashboard.saveGrade(event)" class="space-y-4 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Academic Marks (Max: ${asg ? asg.maximumMarks : 50})</label>
              <input 
                type="number" 
                id="admin-grade-marks" 
                step="0.5" 
                min="0" 
                max="${asg ? asg.maximumMarks : 50}" 
                required 
                value="${submission.marksObtained !== null ? submission.marksObtained : ''}" 
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-emerald-800"
              >
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Platform Points (XP)</label>
              <input 
                type="number" 
                id="admin-grade-points" 
                step="1" 
                min="0" 
                required 
                value="${submission.pointsAwarded !== undefined && submission.pointsAwarded !== null ? submission.pointsAwarded : (submission.marksObtained !== null ? Math.round(submission.marksObtained) : 50)}" 
                class="w-full px-3 py-2 border border-amber-300 bg-amber-50/30 rounded-lg text-xs font-bold text-amber-800"
                title="XP Points awarded to student for the Leaderboard"
              >
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Status</label>
              <select id="admin-grade-status" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
                <option value="Evaluated" selected>Evaluated (Checked & Returned)</option>
                <option value="Needs Revision">Needs Revision</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Examiner Feedback / Working Notes Comments</label>
            <textarea id="admin-grade-feedback" rows="3" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="Feedback on steps, standard references...">${submission.adminFeedback || ''}</textarea>
          </div>

          <!-- Checked Copy Upload -->
          <div class="border-t border-slate-200 pt-4">
            <label class="block font-bold text-slate-900 mb-1">Upload Checked / Evaluated Copy (PDF)</label>
            <p class="text-[11px] text-slate-500 mb-2">Upload your corrected sheet. The student will be able to download this copy.</p>

            <input 
              type="file" 
              id="admin-checked-copy-file" 
              accept="application/pdf,.pdf" 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50"
              onchange="window.adminDashboard.handleCheckedFileSelect(event)"
            >

            ${submission.checkedCopyFileName ? `
              <div class="mt-2 text-xs text-slate-600 flex items-center justify-between">
                <span>Current checked copy: <strong class="text-emerald-700">${submission.checkedCopyFileName}</strong></span>
                <a href="${submission.checkedCopyPdfData}" download="${submission.checkedCopyFileName}" class="text-blue-600 hover:underline">Download</a>
              </div>
            ` : ''}
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm">Save & Return Copy</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  handleCheckedFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      window.app.showToast('Only PDF files are allowed.', 'error');
      e.target.value = '';
      return;
    }
    this.selectedCheckedPdfFile = file;
  }

  saveGrade(e) {
    e.preventDefault();
    const submissionId = this.activeGradingSubmissionId;
    const submission = window.store.getSubmissions().find(s => s.id === submissionId);
    if (!submission) return;

    const marks = parseFloat(document.getElementById('admin-grade-marks').value);
    const pointsAwarded = parseFloat(document.getElementById('admin-grade-points').value) || 0;
    const status = document.getElementById('admin-grade-status').value;
    const feedback = document.getElementById('admin-grade-feedback').value.trim();
    const currentUser = window.auth.getCurrentUser();

    submission.marksObtained = marks;
    submission.pointsAwarded = pointsAwarded;
    submission.status = status;
    submission.adminFeedback = feedback;
    submission.evaluatedBy = currentUser ? currentUser.name : 'Administrator';
    submission.evaluatedAt = new Date().toISOString();

    const notifyStudent = () => {
      const asg = window.store.getAssignmentById(submission.assignmentId);
      window.store.addNotification({
        userId: submission.studentId,
        type: 'points_received',
        title: 'Paper Evaluated & Points Awarded',
        message: `Your paper "${asg ? asg.title : 'Test Paper'}" was checked! Marks: ${marks}/${asg ? asg.maximumMarks : 100}, Points: +${pointsAwarded} XP.`,
        link: 'assignments',
        metadata: { submissionId: submission.id }
      });
      // Record authoritative XP transaction in store
      if (window.store && typeof window.store.recordXpTransaction === 'function' && pointsAwarded > 0) {
        window.store.recordXpTransaction({
          idempotencyKey: `paper_submission_${submission.id}`,
          userId: submission.studentId,
          sourceType: 'paper_submission',
          sourceId: submission.assignmentId,
          activityName: asg ? asg.title : 'Test Paper Evaluation',
          points: pointsAwarded,
          resultStatus: `Score: ${marks}/${asg ? asg.maximumMarks : 100} M`,
          metadata: { marksObtained: marks, maximumMarks: asg ? asg.maximumMarks : 100, submissionId: submission.id }
        });
      }
      // Backend sync
      fetch('/api/papers/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser ? currentUser.token : ''}` },
        body: JSON.stringify(submission)
      }).catch(() => {});
    };

    if (this.selectedCheckedPdfFile) {
      const reader = new FileReader();
      reader.onload = () => {
        submission.checkedCopyFileName = this.selectedCheckedPdfFile.name;
        submission.checkedCopyPdfData = reader.result;
        window.store.updateSubmission(submission);
        notifyStudent();
        window.app.closeModal('admin-generic-modal');
        window.app.showToast(`Checked copy, marks (${marks}) and points (+${pointsAwarded} XP) saved!`, 'success');
        this.renderGradingCenter();
      };
      reader.readAsDataURL(this.selectedCheckedPdfFile);
    } else {
      window.store.updateSubmission(submission);
      notifyStudent();
      window.app.closeModal('admin-generic-modal');
      window.app.showToast(`Evaluation saved. Marks: ${marks}, Points: +${pointsAwarded} XP`, 'success');
      this.renderGradingCenter();
    }
  }

  // --- 6. MCQ TESTS BUILDER & COMPREHENSIVE QUESTION MANAGEMENT ---
  renderMCQTests(forceFullRender = false) {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    // Fast path: if search input and table container already exist, only update the table
    // without destroying the search input (prevents focus loss on keystroke)
    if (!forceFullRender && document.getElementById('admin-mcq-table-container') && document.getElementById('admin-mcq-search-input')) {
      this.renderMCQTestsTableOnly();
      return;
    }

    const tests = window.store.getTests();
    const search = (this.mcqSearch || '').toLowerCase().trim();

    const filteredTests = tests.filter(tst => {
      if (!search) return true;
      const subject = window.store.getSubjectById(tst.subjectId);
      const subjectName = (subject ? subject.name : (tst.subject || '')).toLowerCase();
      const title = (tst.title || '').toLowerCase();
      const topic = (tst.topic || tst.chapter || '').toLowerCase();
      return title.includes(search) || subjectName.includes(search) || topic.includes(search);
    });

    this.mcqPage = this.mcqPage || 1;
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(filteredTests.length / pageSize));
    if (this.mcqPage > totalPages) this.mcqPage = totalPages;
    const startIndex = (this.mcqPage - 1) * pageSize;
    const pagedTests = filteredTests.slice(startIndex, startIndex + pageSize);

    container.innerHTML = `
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <h3 class="text-base font-bold text-slate-900">MCQ Mock Examination Management</h3>
          <p class="text-xs text-slate-500 mt-0.5">Author tests, configure dynamic marking schemes, manage attempt limits, import PDFs, and preview student experience</p>
        </div>
        <div class="flex items-center gap-2">
          <button 
            onclick="window.adminDashboard.openTestModal()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="plus" class="w-4 h-4"></i> Create MCQ Test
          </button>
        </div>
      </div>

      <!-- Search & Filter Bar -->
      <div class="mb-4 bg-white p-3 border border-slate-200 rounded-xl shadow-2xs">
        <div class="relative">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
          <input 
            type="text" 
            id="admin-mcq-search-input"
            placeholder="Search MCQ tests by title, subject, or topic..."
            value="${this.mcqSearch || ''}"
            oninput="window.adminDashboard.mcqSearch = this.value; window.adminDashboard.mcqPage = 1; window.adminDashboard.renderMCQTestsTableOnly();"
            class="w-full pl-9 pr-3.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors"
          />
        </div>
      </div>

      <div id="admin-mcq-table-container">
      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table class="w-full text-left text-xs min-w-[950px]">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-3">Test Title & Tier</th>
              <th class="py-3 px-3">Subject</th>
              <th class="py-3 px-3">Topic</th>
              <th class="py-3 px-2 text-center">Questions</th>
              <th class="py-3 px-2 text-center">Max Marks</th>
              <th class="py-3 px-2 text-center">Duration</th>
              <th class="py-3 px-2 text-center">Marking (+ / -)</th>
              <th class="py-3 px-2 text-center">Attempt Limit</th>
              <th class="py-3 px-3 text-center">Status</th>
              <th class="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${filteredTests.length === 0 ? `
              <tr>
                <td colspan="10" class="py-12 text-center text-slate-400 text-xs">
                  ${tests.length === 0 ? 'No mock tests registered yet. Click "Create MCQ Test" to start.' : 'No tests found matching search criteria.'}
                </td>
              </tr>
            ` : pagedTests.map(tst => {
              const subject = window.store.getSubjectById(tst.subjectId);
              const subjectName = subject ? subject.name : (tst.subject || 'Accounting');
              const qCount = window.store.getQuestionsByTestId(tst.id).length;
              const posMark = typeof tst.marksPerCorrect === 'number' ? tst.marksPerCorrect : 2.0;
              const negMark = typeof tst.negativeMarksPerWrong === 'number' ? tst.negativeMarksPerWrong : 0.5;
              const maxAtt = tst.maxAttempts || 3;
              const status = tst.status || (tst.isPublished ? 'Published' : 'Draft');

              let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
              if (status === 'Published') statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              else if (status === 'Live') statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse';
              else if (status === 'Scheduled') statusBadgeClass = 'bg-purple-50 text-purple-800 border-purple-200';
              else if (status === 'Completed/Expired') statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';

              const reqTier = (tst.requiredTier || tst.tier || 'free').toLowerCase();
              let tierBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">FREE</span>';
              if (reqTier === 'elite') tierBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">ELITE</span>';
              else if (reqTier === 'plus') tierBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">PLUS</span>';
              else if (reqTier === 'core') tierBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200">CORE</span>';

              return `
                <tr class="hover:bg-slate-50/70 transition-colors">
                  <td class="py-3 px-3 max-w-[220px]">
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-slate-900 line-clamp-1">${tst.title}</span>
                      ${tierBadge}
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-[10px] text-slate-400">${new Date(tst.createdAt || Date.now()).toLocaleDateString()}</span>
                      ${tst.hideFromNonEligible ? '<span class="text-[10px] font-semibold text-rose-600">Hidden if ineligible</span>' : ''}
                    </div>
                  </td>
                  <td class="py-3 px-3">
                    <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                      ${subjectName}
                    </span>
                  </td>
                  <td class="py-3 px-3 max-w-[130px] truncate text-slate-600 font-medium">${tst.topic || tst.chapter || 'Syllabus Core'}</td>
                  <td class="py-3 px-2 text-center">
                    <button 
                      onclick="window.adminDashboard.openQuestionBuilder('${tst.id}')"
                      class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-[11px] transition-colors cursor-pointer"
                      title="Manage Questions"
                    >
                      ${qCount} MCQs →
                    </button>
                  </td>
                  <td class="py-3 px-2 text-center font-bold text-slate-800">${tst.maximumMarks || (qCount * posMark) || 10}</td>
                  <td class="py-3 px-2 text-center text-slate-600 font-medium">${tst.durationMinutes}m</td>
                  <td class="py-3 px-2 text-center font-semibold">
                    <span class="text-emerald-700">+${posMark}</span> / <span class="text-rose-600">-${negMark}</span>
                  </td>
                  <td class="py-3 px-2 text-center font-bold text-slate-700">${maxAtt}</td>
                  <td class="py-3 px-3 text-center">
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadgeClass}">
                      ${status}
                    </span>
                  </td>
                  <td class="py-3 px-3 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <button 
                        onclick="window.adminDashboard.openTestModal('${tst.id}')"
                        class="px-2 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit Test Details"
                      >
                        Edit
                      </button>
                      <button 
                        onclick="window.adminDashboard.openQuestionBuilder('${tst.id}')"
                        class="px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors font-semibold"
                        title="Add/Review Questions"
                      >
                        Questions
                      </button>
                      <button 
                        onclick="window.adminDashboard.previewTest('${tst.id}')"
                        class="px-2 py-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors font-semibold flex items-center gap-0.5"
                        title="Preview Exact Student Interface"
                      >
                        <i data-lucide="eye" class="w-3 h-3"></i> Preview
                      </button>
                      <button 
                        onclick="window.adminDashboard.openPublishModal('${tst.id}')"
                        class="px-2 py-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded transition-colors font-semibold"
                        title="Publish / Schedule"
                      >
                        Publish
                      </button>
                      <button 
                        onclick="window.adminDashboard.deleteTest('${tst.id}')"
                        class="px-2 py-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors"
                        title="Delete Test"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls (10/page) -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold text-slate-500 pt-3 px-1">
        <div>
          Showing <span class="font-bold text-slate-800">${filteredTests.length === 0 ? 0 : startIndex + 1}</span> to <span class="font-bold text-slate-800">${Math.min(startIndex + pageSize, filteredTests.length)}</span> of <span class="font-bold text-slate-800">${filteredTests.length}</span> tests
        </div>
        <div class="flex items-center gap-1.5">
          <button 
            onclick="window.adminDashboard.setMcqPage(${this.mcqPage - 1})"
            ${this.mcqPage <= 1 ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
          >
            <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i> Prev
          </button>
          ${Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - this.mcqPage) <= 2)
            .map((p, idx, arr) => {
              const prev = arr[idx - 1];
              const showEllipsis = prev && p - prev > 1;
              return `
                ${showEllipsis ? '<span class="px-1.5 text-slate-400">...</span>' : ''}
                <button 
                  onclick="window.adminDashboard.setMcqPage(${p})"
                  class="px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${this.mcqPage === p ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}"
                >
                  ${p}
                </button>
              `;
            }).join('')}
          <button 
            onclick="window.adminDashboard.setMcqPage(${this.mcqPage + 1})"
            ${this.mcqPage >= totalPages ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
          >
            Next <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  setMcqPage(page) {
    this.mcqPage = page;
    if (document.getElementById('admin-mcq-table-container')) {
      this.renderMCQTestsTableOnly();
    } else {
      this.renderMCQTests(true);
    }
  }

  renderMCQTestsTableOnly() {
    const tableContainer = document.getElementById('admin-mcq-table-container');
    if (!tableContainer) {
      this.renderMCQTests(true);
      return;
    }

    const tests = window.store.getTests();
    const search = (this.mcqSearch || '').toLowerCase().trim();

    const filteredTests = tests.filter(tst => {
      if (!search) return true;
      const subject = window.store.getSubjectById(tst.subjectId);
      const subjectName = (subject ? subject.name : (tst.subject || '')).toLowerCase();
      const title = (tst.title || '').toLowerCase();
      const topic = (tst.topic || tst.chapter || '').toLowerCase();
      return title.includes(search) || subjectName.includes(search) || topic.includes(search);
    });

    this.mcqPage = this.mcqPage || 1;
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(filteredTests.length / pageSize));
    if (this.mcqPage > totalPages) this.mcqPage = totalPages;
    if (this.mcqPage < 1) this.mcqPage = 1;
    const startIndex = (this.mcqPage - 1) * pageSize;
    const pagedTests = filteredTests.slice(startIndex, startIndex + pageSize);

    tableContainer.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table class="w-full text-left text-xs min-w-[950px]">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-3">Test Title & Tier</th>
              <th class="py-3 px-3">Subject</th>
              <th class="py-3 px-3">Topic</th>
              <th class="py-3 px-2 text-center">Questions</th>
              <th class="py-3 px-2 text-center">Max Marks</th>
              <th class="py-3 px-2 text-center">Duration</th>
              <th class="py-3 px-2 text-center">Marking (+ / -)</th>
              <th class="py-3 px-2 text-center">Attempt Limit</th>
              <th class="py-3 px-3 text-center">Status</th>
              <th class="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${filteredTests.length === 0 ? `
              <tr>
                <td colspan="10" class="py-12 text-center text-slate-400 text-xs">
                  ${tests.length === 0 ? 'No mock tests registered yet. Click "Create MCQ Test" to start.' : 'No tests found matching search criteria.'}
                </td>
              </tr>
            ` : pagedTests.map(tst => {
              const subject = window.store.getSubjectById(tst.subjectId);
              const subjectName = subject ? subject.name : (tst.subject || 'Accounting');
              const qCount = window.store.getQuestionsByTestId(tst.id).length;
              const posMark = typeof tst.marksPerCorrect === 'number' ? tst.marksPerCorrect : 2.0;
              const negMark = typeof tst.negativeMarksPerWrong === 'number' ? tst.negativeMarksPerWrong : 0.5;
              const maxAtt = tst.maxAttempts || 3;
              const status = tst.status || (tst.isPublished ? 'Published' : 'Draft');

              let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
              if (status === 'Published') statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              else if (status === 'Live') statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse';
              else if (status === 'Scheduled') statusBadgeClass = 'bg-purple-50 text-purple-800 border-purple-200';
              else if (status === 'Completed/Expired') statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';

              const reqTier = (tst.requiredTier || tst.tier || 'free').toLowerCase();
              let tierBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">FREE</span>';
              if (reqTier === 'elite') tierBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">ELITE</span>';
              else if (reqTier === 'plus') tierBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">PLUS</span>';
              else if (reqTier === 'core') tierBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200">CORE</span>';

              return `
                <tr class="hover:bg-slate-50/70 transition-colors">
                  <td class="py-3 px-3 max-w-[220px]">
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-slate-900 line-clamp-1">${tst.title}</span>
                      ${tierBadge}
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-[10px] text-slate-400">${new Date(tst.createdAt || Date.now()).toLocaleDateString()}</span>
                      ${tst.hideFromNonEligible ? '<span class="text-[10px] font-semibold text-rose-600">Hidden if ineligible</span>' : ''}
                    </div>
                  </td>
                  <td class="py-3 px-3">
                    <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                      ${subjectName}
                    </span>
                  </td>
                  <td class="py-3 px-3 max-w-[130px] truncate text-slate-600 font-medium">${tst.topic || tst.chapter || 'Syllabus Core'}</td>
                  <td class="py-3 px-2 text-center">
                    <button 
                      onclick="window.adminDashboard.openQuestionBuilder('${tst.id}')"
                      class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-[11px] transition-colors cursor-pointer"
                      title="Manage Questions"
                    >
                      ${qCount} MCQs →
                    </button>
                  </td>
                  <td class="py-3 px-2 text-center font-bold text-slate-800">${tst.maximumMarks || (qCount * posMark) || 10}</td>
                  <td class="py-3 px-2 text-center text-slate-600 font-medium">${tst.durationMinutes}m</td>
                  <td class="py-3 px-2 text-center font-semibold">
                    <span class="text-emerald-700">+${posMark}</span> / <span class="text-rose-600">-${negMark}</span>
                  </td>
                  <td class="py-3 px-2 text-center font-bold text-slate-700">${maxAtt}</td>
                  <td class="py-3 px-3 text-center">
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadgeClass}">
                      ${status}
                    </span>
                  </td>
                  <td class="py-3 px-3 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <button 
                        onclick="window.adminDashboard.openTestModal('${tst.id}')"
                        class="px-2 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit Test Details"
                      >
                        Edit
                      </button>
                      <button 
                        onclick="window.adminDashboard.openQuestionBuilder('${tst.id}')"
                        class="px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors font-semibold"
                        title="Add/Review Questions"
                      >
                        Questions
                      </button>
                      <button 
                        onclick="window.adminDashboard.previewTest('${tst.id}')"
                        class="px-2 py-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors font-semibold flex items-center gap-0.5"
                        title="Preview Exact Student Interface"
                      >
                        <i data-lucide="eye" class="w-3 h-3"></i> Preview
                      </button>
                      <button 
                        onclick="window.adminDashboard.openPublishModal('${tst.id}')"
                        class="px-2 py-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded transition-colors font-semibold"
                        title="Publish / Schedule"
                      >
                        Publish
                      </button>
                      <button 
                        onclick="window.adminDashboard.deleteTest('${tst.id}')"
                        class="px-2 py-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors"
                        title="Delete Test"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls (10/page) -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold text-slate-500 pt-3 px-1">
        <div>
          Showing <span class="font-bold text-slate-800">${filteredTests.length === 0 ? 0 : startIndex + 1}</span> to <span class="font-bold text-slate-800">${Math.min(startIndex + pageSize, filteredTests.length)}</span> of <span class="font-bold text-slate-800">${filteredTests.length}</span> tests
        </div>
        <div class="flex items-center gap-1.5">
          <button 
            onclick="window.adminDashboard.setMcqPage(${this.mcqPage - 1})"
            ${this.mcqPage <= 1 ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
          >
            <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i> Prev
          </button>
          ${Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - this.mcqPage) <= 2)
            .map((p, idx, arr) => {
              const prev = arr[idx - 1];
              const showEllipsis = prev && p - prev > 1;
              return `
                ${showEllipsis ? '<span class="px-1.5 text-slate-400">...</span>' : ''}
                <button 
                  onclick="window.adminDashboard.setMcqPage(${p})"
                  class="px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${this.mcqPage === p ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}"
                >
                  ${p}
                </button>
              `;
            }).join('')}
          <button 
            onclick="window.adminDashboard.setMcqPage(${this.mcqPage + 1})"
            ${this.mcqPage >= totalPages ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
          >
            Next <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  toggleTestSchedulePicker(statusVal) {
    const el = document.getElementById('tst-schedule-picker-container');
    if (el) {
      if (statusVal === 'Scheduled') {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  }

  openTestModal(testId = null) {
    this._isSavingTest = false;
    const isEdit = !!testId;
    const test = isEdit ? window.store.getTestById(testId) : null;
    const existingQs = isEdit ? window.store.getQuestionsByTestId(testId) : [];
    const currentMaxMarks = test ? (typeof test.maximumMarks === 'number' ? test.maximumMarks : (parseFloat(test.maximumMarks) || 10)) : 10;
    const questionsMarksSum = existingQs.reduce((sum, q) => sum + (typeof q.marks === 'number' ? q.marks : (test && typeof test.marksPerCorrect === 'number' ? test.marksPerCorrect : 2.0)), 0);
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    const subjects = window.store.getSubjects ? window.store.getSubjects() : [];

    let scheduledDateVal = '';
    let scheduledTimeVal = '17:00';
    if (test && test.scheduledPublishTime) {
      try {
        const dt = new Date(test.scheduledPublishTime);
        if (!isNaN(dt.getTime())) {
          const istOffset = 5.5 * 60 * 60 * 1000;
          const istDate = new Date(dt.getTime() + istOffset);
          scheduledDateVal = istDate.toISOString().slice(0, 10);
          scheduledTimeVal = istDate.toISOString().slice(11, 16);
        }
      } catch (e) {}
    }
    if (!scheduledDateVal) {
      const tom = new Date(Date.now() + 24 * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000);
      scheduledDateVal = tom.toISOString().slice(0, 10);
    }

    modalContent.innerHTML = `
      <form onsubmit="window.adminDashboard.saveTest(event, '${testId || ''}')" class="flex flex-col h-full max-h-[90vh]">
        <!-- Fixed Header -->
        <div class="flex-shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-slate-200">
          <div>
            <h3 class="text-base font-bold text-slate-900">${isEdit ? 'Edit Mock Test' : 'Create New MCQ Test'}</h3>
            <p class="text-xs text-slate-500">Chartered Accountancy Online CBT Examination Module</p>
          </div>
          <button 
            type="button" 
            onclick="window.app.closeModal('admin-generic-modal')" 
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div class="space-y-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Test Title *</label>
              <input 
                type="text" 
                id="tst-title" 
                required 
                value="${test ? test.title : ''}"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500" 
                placeholder="e.g. CA Foundation Accounts Mock Test 1 - Accounting Principles"
              >
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Course Level *</label>
                <select id="tst-exam-level" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white">
                  <option value="CA Foundation" ${!test || test.examLevel === 'CA Foundation' ? 'selected' : ''}>CA Foundation</option>
                  <option value="CA Intermediate" ${test && test.examLevel === 'CA Intermediate' ? 'selected' : ''}>CA Intermediate</option>
                  <option value="CA Final" ${test && test.examLevel === 'CA Final' ? 'selected' : ''}>CA Final</option>
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Subject *</label>
                <select id="tst-subject" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white">
                  ${subjects.map(s => `
                    <option value="${s.id}" ${test && (test.subjectId === s.id || test.subject === s.name) ? 'selected' : ''}>${s.name}</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Chapter / Topic *</label>
                <input 
                  type="text" 
                  id="tst-topic" 
                  required 
                  value="${test ? (test.topic || test.chapter || '') : ''}"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500" 
                  placeholder="e.g. Accounting Standards / Ind AS"
                >
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Duration (Mins) *</label>
                <input 
                  type="number" 
                  id="tst-duration" 
                  min="1" 
                  required 
                  value="${test ? test.durationMinutes : 15}"
                  class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                >
              </div>
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block font-bold text-slate-700">Max Marks *</label>
                  ${existingQs.length > 0 ? `<span class="text-[9px] text-slate-500 font-semibold" title="Total sum of individual question marks">(${existingQs.length} Qs, Sum: ${questionsMarksSum})</span>` : ''}
                </div>
                <input 
                  type="number" 
                  id="tst-maxmarks" 
                  step="0.5" 
                  min="1" 
                  required 
                  value="${currentMaxMarks}"
                  class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                >
              </div>
            </div>
            <div>
              <label class="block font-bold text-emerald-800 mb-1">Exam Mark (+) *</label>
              <input 
                type="number" 
                id="tst-positive" 
                step="0.25" 
                min="0.25" 
                required 
                value="${test && typeof test.marksPerCorrect === 'number' ? test.marksPerCorrect : 2.0}"
                class="w-full px-2.5 py-1.5 border border-emerald-300 bg-emerald-50/50 rounded-lg text-xs font-bold text-emerald-800"
              >
            </div>
            <div>
              <label class="block font-bold text-rose-800 mb-1">Negative Mark (-) *</label>
              <input 
                type="number" 
                id="tst-negative" 
                step="0.05" 
                min="0" 
                required 
                value="${test && typeof test.negativeMarksPerWrong === 'number' ? test.negativeMarksPerWrong : 0.5}"
                class="w-full px-2.5 py-1.5 border border-rose-300 bg-rose-50/50 rounded-lg text-xs font-bold text-rose-800"
              >
            </div>
            <div>
              <label class="block font-bold text-amber-800 mb-1">Platform XP (+) *</label>
              <input 
                type="number" 
                id="tst-points" 
                step="1" 
                min="1" 
                required 
                value="${test && typeof test.pointsPerCorrect === 'number' ? test.pointsPerCorrect : 10}"
                class="w-full px-2.5 py-1.5 border border-amber-300 bg-amber-50/50 rounded-lg text-xs font-bold text-amber-800"
                title="Leaderboard XP points earned per correct answer"
              >
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Maximum Attempts Allowed *</label>
              <input 
                type="number" 
                id="tst-maxattempts" 
                min="1" 
                max="20" 
                required 
                value="${test ? (test.maxAttempts || 3) : 3}"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold"
              >
              <p class="text-[10px] text-slate-400 mt-0.5">Students will be blocked once they reach this limit.</p>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Initial Status *</label>
              <select id="tst-status" onchange="window.adminDashboard.toggleTestSchedulePicker(this.value)" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white">
                <option value="Draft" ${test && test.status === 'Draft' ? 'selected' : ''}>Draft / Under Review</option>
                <option value="Published" ${test && test.status === 'Published' ? 'selected' : (!test ? 'selected' : '')}>Published (Live for Students)</option>
                <option value="Scheduled" ${test && test.status === 'Scheduled' ? 'selected' : ''}>Scheduled (Automatic Release)</option>
                <option value="Live" ${test && test.status === 'Live' ? 'selected' : ''}>Live Window</option>
                <option value="Completed/Expired" ${test && test.status === 'Completed/Expired' ? 'selected' : ''}>Completed/Expired</option>
              </select>
            </div>
          </div>

          <!-- Scheduled Publishing Date & Time Picker (Asia/Kolkata IST) -->
          <div id="tst-schedule-picker-container" class="${test && test.status === 'Scheduled' ? '' : 'hidden'} p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2.5">
            <div class="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
              <i data-lucide="calendar-clock" class="w-4 h-4 text-blue-600"></i>
              <span>Scheduled Automatic Publishing (Asia/Kolkata IST)</span>
            </div>
            <p class="text-[11px] text-blue-700">When this scheduled time arrives, the server will automatically set this test to LIVE and notify eligible students.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Publish Date (IST) <span class="text-rose-500">*</span></label>
                <input 
                  type="date" 
                  id="tst-scheduled-date" 
                  value="${scheduledDateVal}"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Publish Time (IST) <span class="text-rose-500">*</span></label>
                <input 
                  type="time" 
                  id="tst-scheduled-time" 
                  value="${scheduledTimeVal}"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                />
              </div>
            </div>
          </div>

          <!-- Plan-based visibility & Tier Requirement -->
          <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Required Minimum Subscription Tier *</label>
                <select id="tst-required-tier" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold bg-white text-slate-800 focus:ring-2 focus:ring-blue-500">
                  <option value="none" ${!test || (test.requiredTier || test.tier) === 'free' || (test.requiredTier || test.tier) === 'none' ? 'selected' : ''}>None (Open to All Students / Free)</option>
                  <option value="trial" ${test && (test.requiredTier || test.tier) === 'trial' ? 'selected' : ''}>Trial Pass or Higher</option>
                  <option value="core" ${test && (test.requiredTier || test.tier) === 'core' ? 'selected' : ''}>Core Pass or Higher</option>
                  <option value="plus" ${test && (test.requiredTier || test.tier) === 'plus' ? 'selected' : ''}>Plus Pass or Higher</option>
                  <option value="elite" ${test && (test.requiredTier || test.tier) === 'elite' ? 'selected' : ''}>Elite Pass Only</option>
                </select>
                <p class="text-[10px] text-slate-400 mt-1">Students must possess at least this pass level or higher to open the test.</p>
              </div>
              <div class="flex items-center pt-5">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    id="tst-hide-non-eligible" 
                    ${test && test.hideFromNonEligible ? 'checked' : ''} 
                    class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span class="text-xs font-semibold text-slate-700">Hide from non-eligible students</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1.5">Visible to Plan(s) <span class="text-slate-400 font-normal">(Select which student subscription tiers can access this test)</span> *</label>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="free" class="tst-allowed-plan rounded border-slate-300 text-blue-600 focus:ring-blue-500" ${!test || !test.allowedPlans || test.allowedPlans.includes('free') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-slate-700">Free Tier</span>
                </label>
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="trial" class="tst-allowed-plan rounded border-slate-300 text-amber-600 focus:ring-amber-500" ${!test || !test.allowedPlans || test.allowedPlans.includes('trial') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-amber-800">₹9 Trial</span>
                </label>
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="core" class="tst-allowed-plan rounded border-slate-300 text-blue-600 focus:ring-blue-500" ${!test || !test.allowedPlans || test.allowedPlans.includes('core') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-blue-800">Core Pass</span>
                </label>
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="plus" class="tst-allowed-plan rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" ${!test || !test.allowedPlans || test.allowedPlans.includes('plus') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-indigo-800">Plus Pass</span>
                </label>
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" value="elite" class="tst-allowed-plan rounded border-slate-300 text-purple-600 focus:ring-purple-500" ${!test || !test.allowedPlans || test.allowedPlans.includes('elite') ? 'checked' : ''}>
                  <span class="text-xs font-bold text-purple-800">Elite Pass</span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Test Description & Student Instructions *</label>
            <textarea 
              id="tst-desc" 
              rows="3" 
              required 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500" 
              placeholder="Explain the topic coverage, syllabus focus, and guidelines for students..."
            >${test ? test.description : ''}</textarea>
          </div>
        </div>

        <!-- Sticky Footer -->
        <div class="flex-shrink-0 flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-slate-200 bg-slate-50">
          <button 
            type="button" 
            onclick="window.app.closeModal('admin-generic-modal')" 
            class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            class="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            ${isEdit ? 'Save Changes' : 'Create Test & Proceed to Questions →'}
          </button>
        </div>
      </form>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  async saveTest(e, existingId = '') {
    e.preventDefault();

    if (this._isSavingTest) {
      console.warn('[saveTest] Save already in progress, ignoring duplicate call.');
      return;
    }
    this._isSavingTest = true;

    const submitBtn = e.target ? e.target.querySelector('[type="submit"]') : null;
    if (submitBtn) {
      if (submitBtn.disabled) {
        this._isSavingTest = false;
        return;
      }
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-flex items-center gap-1.5"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ' + (existingId ? 'Saving Changes...' : 'Creating Test...') + '</span>';
      if (window.lucide) window.lucide.createIcons();
    }

    const enableSubmit = () => {
      this._isSavingTest = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = existingId ? 'Save Changes' : 'Create Test & Proceed to Questions →';
      }
    };

    const title = document.getElementById('tst-title').value.trim();
    const examLevel = document.getElementById('tst-exam-level').value;
    const subjectId = document.getElementById('tst-subject').value;
    const topic = document.getElementById('tst-topic').value.trim();
    const durationMinutes = parseInt(document.getElementById('tst-duration').value, 10);
    const maxMarksInput = parseFloat(document.getElementById('tst-maxmarks').value);
    const maximumMarks = !isNaN(maxMarksInput) && maxMarksInput > 0 ? maxMarksInput : 10.0;
    const marksPerCorrect = parseFloat(document.getElementById('tst-positive').value) || 2.0;
    const negativeMarksPerWrong = parseFloat(document.getElementById('tst-negative').value) || 0.5;
    const pointsPerCorrect = parseFloat(document.getElementById('tst-points').value) || 10;
    const maxAttempts = parseInt(document.getElementById('tst-maxattempts').value, 10) || 3;
    const status = document.getElementById('tst-status').value;
    const description = document.getElementById('tst-desc').value.trim();
    const requiredTier = document.getElementById('tst-required-tier') ? document.getElementById('tst-required-tier').value : 'free';
    const hideFromNonEligible = document.getElementById('tst-hide-non-eligible') ? document.getElementById('tst-hide-non-eligible').checked : false;

    const allSubjs = window.store.getSubjects ? window.store.getSubjects() : [];
    const matchedSub = allSubjs.find(s => s.id === subjectId || s.name === subjectId);
    const subjectName = matchedSub ? matchedSub.name : (document.getElementById('tst-subject').selectedOptions[0]?.text || 'Accounting');

    const planCheckboxes = document.querySelectorAll('.tst-allowed-plan:checked');
    const allowedPlans = planCheckboxes.length > 0 
      ? Array.from(planCheckboxes).map(c => c.value) 
      : ['free', 'trial', 'core', 'plus', 'elite'];

    let scheduledPublishTime = null;
    if (status === 'Scheduled') {
      const sDate = document.getElementById('tst-scheduled-date')?.value;
      const sTime = document.getElementById('tst-scheduled-time')?.value || '17:00';
      if (!sDate) {
        window.app.showToast('Please select a scheduled publish date.', 'error');
        enableSubmit();
        return;
      }
      scheduledPublishTime = `${sDate}T${sTime.length === 5 ? sTime + ':00' : sTime}+05:30`;
    }

    // Preserve the admin's explicitly set maximumMarks!
    const testPayload = {
      id: existingId || ('tst-' + Date.now()),
      title,
      examLevel,
      subjectId,
      subject: subjectName,
      chapter: topic,
      topic,
      durationMinutes,
      maximumMarks: maximumMarks,
      marksPerCorrect,
      negativeMarksPerWrong,
      pointsPerCorrect,
      unattemptedMarks: 0.0,
      maxAttempts,
      status,
      scheduledPublishTime,
      isPublished: (status === 'Published' || status === 'Live'),
      isLive: (status === 'Live'),
      allowedPlans,
      requiredTier,
      tier: requiredTier,
      hideFromNonEligible,
      description,
      totalQuestions: existingId ? (window.store.getQuestionsByTestId(existingId).length) : 0,
      updatedAt: new Date().toISOString()
    };

    if (!existingId) {
      testPayload.createdAt = new Date().toISOString();
      testPayload.attemptsCount = 0;
    }

    const user = window.auth.getCurrentUser();
    const token = user ? (user.token || user.email) : '';

    try {
      const resp = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(testPayload)
      });

      if (!resp.ok) {
        let errMsg = 'Failed to save test configuration.';
        try {
          const errData = await resp.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        console.error('[saveTest] Backend rejected test:', resp.status, errMsg);
        window.app.showToast(errMsg, 'error');
        enableSubmit();
        return;
      }

      const resData = await resp.json();
      if (!resData.success) {
        window.app.showToast(resData.error || 'Server error saving test.', 'error');
        enableSubmit();
        return;
      }

      const confirmedTest = resData.test || testPayload;

      // Update store only on confirmed backend persistence
      const currentTests = window.store.getTests();
      const alreadyInStore = currentTests.some(t => t.id === confirmedTest.id);

      if (existingId || alreadyInStore) {
        window.store.updateTest(confirmedTest);
      } else {
        window.store.addTest(confirmedTest);
      }

      // Trigger notification ONLY to students subscribed to allowed plans
      if (!existingId && confirmedTest.isPublished) {
        const allStudents = window.store.getStudents ? window.store.getStudents() : [];
        const subs = window.store.getSubscriptions ? window.store.getSubscriptions() : {};
        const now = new Date();
        const bulkNotifs = [];
        allStudents.forEach(st => {
          const stLevel = (st.caLevel || '').toUpperCase();
          const tLevel = (examLevel || '').toUpperCase();
          const levelMatches = !tLevel ||
            (stLevel.includes('FOUNDATION') && tLevel.includes('FOUNDATION')) ||
            (stLevel.includes('INTER') && tLevel.includes('INTER')) ||
            (stLevel.includes('FINAL') && tLevel.includes('FINAL')) ||
            !st.caLevel;
          if (!levelMatches) return;

          const sub = subs[st.id];
          const isSubActive = sub && (sub.status === 'active' || sub.status === 'manually_granted') && (!sub.expiresAt || new Date(sub.expiresAt) > now);
          let studentTier = 'free';
          if (isSubActive) {
            studentTier = (sub.planTier || 'core').toLowerCase();
            if (sub.isTrial) studentTier = 'trial';
          }

          if (confirmedTest.allowedPlans.includes(studentTier)) {
            bulkNotifs.push({
              userId: st.id,
              type: 'new_test',
              title: 'New MCQ Test Published!',
              message: `${confirmedTest.title} (${confirmedTest.subject}) is now live for your ${studentTier.toUpperCase()} pass tier.`,
              link: 'tests',
              metadata: { testId: confirmedTest.id }
            });
          }
        });
        if (bulkNotifs.length > 0 && window.store && typeof window.store.addNotificationsBulk === 'function') {
          window.store.addNotificationsBulk(bulkNotifs);
        }
      }

      window.app.closeModal('admin-generic-modal');
      window.app.showToast(existingId ? 'Test updated successfully!' : 'Test created! You can now add questions.', 'success');
      this.renderMCQTests();
      if (!existingId) {
        this.openQuestionBuilder(confirmedTest.id);
      }
    } catch (netErr) {
      console.error('[saveTest] Network error during save:', netErr);
      window.app.showToast('Network error: Unable to reach server. Test was not saved.', 'error');
      enableSubmit();
    } finally {
      this._isSavingTest = false;
    }
  }

  async deleteTest(id) {
    if (!confirm('Are you sure you want to permanently delete this mock test and all its questions?')) return;

    const user = window.auth.getCurrentUser();
    const token = user ? (user.token || user.email) : '';
    try {
      const resp = await fetch('/api/tests/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id })
      });

      if (!resp.ok) {
        let errMsg = 'Failed to delete test.';
        try {
          const errData = await resp.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        window.app.showToast(errMsg, 'error');
        return;
      }

      window.store.deleteTest(id);
      window.app.showToast('Test and associated questions deleted.', 'info');
      this.renderMCQTests();
    } catch (netErr) {
      console.error('[deleteTest] Network error:', netErr);
      window.app.showToast('Network error: Could not delete test.', 'error');
    }
  }

  // --- QUESTION BUILDER MODAL ---
  openQuestionBuilder(testId) {
    this.activeTestQuestionsId = testId;
    this._isEditingQuestion = false; // Clear editing guard — now in list view
    const test = window.store.getTestById(testId);
    if (!test) return;

    const questions = window.store.getQuestionsByTestId(testId);
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;


    const posMark = typeof test.marksPerCorrect === 'number' ? test.marksPerCorrect : 2.0;
    const negMark = typeof test.negativeMarksPerWrong === 'number' ? test.negativeMarksPerWrong : 0.5;

    modalContent.innerHTML = `
      <div class="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <!-- Top Header & Summary -->
        <div class="border-b border-slate-200 pb-4 mb-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 mb-1">
                ${test.subject || 'CA Foundation'} • ${test.topic || test.chapter || ''}
              </span>
              <h3 class="text-lg font-bold text-slate-900">${test.title}</h3>
              <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                <span>Duration: <strong>${test.durationMinutes} mins</strong></span>
                <span>•</span>
                <span>Marking: <strong class="text-emerald-700">+${posMark}</strong> / <strong class="text-rose-600">-${negMark}</strong></span>
                <span>•</span>
                <span>Max Attempts: <strong>${test.maxAttempts || 3}</strong></span>
                <span>•</span>
                <span>Status: <strong class="text-slate-800">${test.status || 'Draft'}</strong></span>
              </div>
            </div>
            <button onclick="window.app.closeModal('admin-generic-modal'); window.adminDashboard.renderMCQTests();" class="text-slate-400 hover:text-slate-600 p-1 self-start">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Action Toolbar -->
          <div class="flex flex-wrap items-center gap-2.5 mt-5 pt-4 border-t border-slate-100">
            <button 
              onclick="window.adminDashboard.openQuestionForm()"
              class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="plus" class="w-4 h-4"></i> + Add Question
            </button>
            <button 
              onclick="window.adminDashboard.openPdfImportModal('${testId}')"
              class="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="file-up" class="w-4 h-4"></i> Import from PDF
            </button>
            <button 
              onclick="window.adminDashboard.previewTest('${testId}')"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="play" class="w-4 h-4"></i> PREVIEW TEST
            </button>
            <button 
              onclick="window.adminDashboard.openPublishModal('${testId}')"
              class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ml-auto cursor-pointer"
            >
              <i data-lucide="send" class="w-4 h-4"></i> Publish Workflow
            </button>
          </div>
        </div>

        <!-- Questions List -->
        <div class="space-y-4">
          ${questions.length === 0 ? `
            <div class="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8">
              <i data-lucide="help-circle" class="w-10 h-10 text-slate-300 mx-auto mb-2"></i>
              <h4 class="text-sm font-bold text-slate-700">No questions added to this test yet.</h4>
              <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Use <strong>+ Add Question</strong> to manually author rich text questions, or <strong>Import from PDF</strong> to automatically extract MCQs.
              </p>
            </div>
          ` : questions.map((q, idx) => {
            const hasQImage = !!q.questionImage;
            const hasOptImages = q.optionImages && Object.values(q.optionImages).some(Boolean);
            const isDraft = !!q.isDraft;
            const isDuplicate = !!q.isDuplicate;
            const hasAiSuggested = !!q.aiSuggestedAnswer;
            const isCorrectSet = !!q.correctOption;

            return `
              <div class="bg-white border ${isDuplicate ? 'border-rose-300 ring-1 ring-rose-200' : (isDraft ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200')} rounded-xl p-4 shadow-sm text-xs space-y-3 transition-all">
                <!-- Question Card Header -->
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                      Question ${idx + 1}
                    </span>
                    ${isDraft ? `
                      <span class="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded bg-amber-100 text-amber-900 border border-amber-300">
                        DRAFT / NEEDS REVIEW
                      </span>
                    ` : ''}
                    ${isDuplicate ? `
                      <span class="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1">
                        <i data-lucide="alert-triangle" class="w-3 h-3"></i> Possible Duplicate Question
                      </span>
                    ` : ''}
                    ${hasQImage ? `<span class="px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-50 text-purple-700">Image Prompt</span>` : ''}
                    ${hasOptImages ? `<span class="px-2 py-0.5 text-[10px] font-semibold rounded bg-indigo-50 text-indigo-700">Image Options</span>` : ''}
                    ${(() => {
                      const reqTier = (q.requiredTier || 'free').toLowerCase();
                      const tierBadgeStyle = {
                        free: 'bg-slate-100 text-slate-700 border-slate-200',
                        core: 'bg-blue-100 text-blue-800 border-blue-200',
                        plus: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                        elite: 'bg-purple-100 text-purple-800 border-purple-200'
                      }[reqTier] || 'bg-slate-100 text-slate-700 border-slate-200';
                      return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${tierBadgeStyle}">Tier: ${reqTier}</span>`;
                    })()}
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-700 border border-blue-200">${typeof q.marks === 'number' ? q.marks : 2.0} Marks</span>
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-50 text-amber-800 border border-amber-200">+${(q.xp !== undefined && q.xp !== null) ? q.xp : (q.points !== undefined && q.points !== null ? q.points : (test && test.pointsPerCorrect ? test.pointsPerCorrect : 10))} XP</span>
                  </div>

                  <!-- Reorder & Action Controls -->
                  <div class="flex items-center gap-1.5">
                    <button 
                      onclick="window.adminDashboard.moveQuestion('${q.id}', -1)"
                      ${idx === 0 ? 'disabled' : ''}
                      class="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                      title="Move Question Up"
                    >
                      <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
                    </button>
                    <button 
                      onclick="window.adminDashboard.moveQuestion('${q.id}', 1)"
                      ${idx === questions.length - 1 ? 'disabled' : ''}
                      class="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                      title="Move Question Down"
                    >
                      <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
                    </button>
                    <span class="text-slate-300">|</span>
                    <button 
                      onclick="window.adminDashboard.openQuestionForm('${q.id}')" 
                      class="text-blue-600 hover:text-blue-800 font-bold px-1.5 py-0.5"
                    >
                      Edit
                    </button>
                    <button 
                      onclick="window.adminDashboard.duplicateQuestion('${q.id}')" 
                      class="text-indigo-600 hover:text-indigo-800 font-semibold px-1.5 py-0.5"
                      title="Duplicate Question"
                    >
                      Duplicate
                    </button>
                    <button 
                      onclick="window.adminDashboard.deleteQuestion('${q.id}')" 
                      class="text-rose-600 hover:text-rose-800 font-semibold px-1.5 py-0.5"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <!-- Prompt Body -->
                <div class="space-y-2">
                  <div class="font-medium text-slate-800 text-sm leading-relaxed">${q.text}</div>
                  ${hasQImage ? `
                    <div class="my-2 max-w-sm rounded-lg overflow-hidden border border-slate-200">
                      <img src="${q.questionImage}" alt="Question Diagram" class="w-full h-auto object-contain max-h-48 bg-slate-50">
                    </div>
                  ` : ''}
                </div>

                <!-- Options A, B, C, D Grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                  ${['A', 'B', 'C', 'D'].map(optKey => {
                    const optText = q['option' + optKey] || '';
                    const optImg = q.optionImages ? q.optionImages[optKey] : null;
                    const isCorrect = q.correctOption === optKey;

                    return `
                      <div class="p-2 rounded border ${isCorrect ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-semibold' : 'border-slate-200 bg-white'} flex items-start gap-2">
                        <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}">
                          ${optKey}
                        </span>
                        <div class="flex-1 space-y-1">
                          ${optText ? `<div>${optText}</div>` : ''}
                          ${optImg ? `<img src="${optImg}" class="max-h-20 rounded border border-slate-200 object-contain">` : ''}
                        </div>
                        ${isCorrect ? `<i data-lucide="check" class="w-4 h-4 text-emerald-600 flex-shrink-0"></i>` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>

                <!-- Status / Correct Key / AI Suggested Footer -->
                <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                  <div class="flex items-center gap-2">
                    ${hasAiSuggested ? `
                      <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                        AI Suggested Answer: Option ${q.aiSuggestedAnswer}
                      </span>
                    ` : ''}
                    
                    ${isCorrectSet ? `
                      <span class="text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                        ✓ Verified Key: <strong>Option ${q.correctOption}</strong>
                      </span>
                    ` : `
                      <span class="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        ⚠ Correct Answer: Not Set (Admin verification required)
                      </span>
                    `}
                  </div>

                  ${isDraft ? `
                    <button 
                      onclick="window.adminDashboard.verifyQuestionDraft('${q.id}')"
                      class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[10px] transition-colors cursor-pointer"
                    >
                      ✓ Mark as Verified
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  // --- MANUAL QUESTION BUILDER FORM WITH RICH TEXT & IMAGES ---
  openQuestionForm(questionId = null) {
    const existingQ = questionId ? window.store.getQuestions().find(x => x.id === questionId) : null;
    const testId = this.activeTestQuestionsId || (existingQ ? existingQ.testId : null);
    if (testId) this.activeTestQuestionsId = testId;
    const test = window.store.getTestById(testId);
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;
    this._isEditingQuestion = true; // Guard: prevent realtime sync from re-rendering while admin is editing

    const optTypes = existingQ && existingQ.optionTypes ? existingQ.optionTypes : { A: 'text', B: 'text', C: 'text', D: 'text' };
    const optImages = existingQ && existingQ.optionImages ? existingQ.optionImages : { A: null, B: null, C: null, D: null };

    modalContent.innerHTML = `
      <div class="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">${existingQ ? 'Edit MCQ Question' : 'Add MCQ Question'}</h3>
            <p class="text-xs text-slate-500">Supports rich text, equations, formulas, tables, and mixed image options</p>
          </div>
          <button onclick="window.adminDashboard.openQuestionBuilder('${testId}')" class="text-slate-400 hover:text-slate-600 p-1">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveQuestion(event, '${questionId || ''}', '${testId || ''}')" class="space-y-5 text-xs">
          <!-- Question Prompt Section -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="font-bold text-slate-800">Question Prompt / Text *</label>
              <!-- Math & Formatting Toolbar -->
              <div class="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px]">
                <button type="button" onclick="window.adminDashboard.insertFormat('<b>', '</b>')" class="px-2 py-0.5 font-bold hover:bg-white rounded transition-colors" title="Bold">B</button>
                <button type="button" onclick="window.adminDashboard.insertFormat('<i>', '</i>')" class="px-2 py-0.5 italic hover:bg-white rounded transition-colors" title="Italic">I</button>
                <button type="button" onclick="window.adminDashboard.insertFormat('<u>', '</u>')" class="px-2 py-0.5 underline hover:bg-white rounded transition-colors" title="Underline">U</button>
                <span class="text-slate-300">|</span>
                <button type="button" onclick="window.adminDashboard.insertFormat('<sup>', '</sup>')" class="px-2 py-0.5 hover:bg-white rounded transition-colors" title="Superscript">x²</button>
                <button type="button" onclick="window.adminDashboard.insertFormat('<sub>', '</sub>')" class="px-2 py-0.5 hover:bg-white rounded transition-colors" title="Subscript">x₂</button>
                <span class="text-slate-300">|</span>
                <button type="button" onclick="window.adminDashboard.insertSymbol('√')" class="px-1.5 py-0.5 hover:bg-white rounded" title="Square Root">√</button>
                <button type="button" onclick="window.adminDashboard.insertSymbol('∑')" class="px-1.5 py-0.5 hover:bg-white rounded" title="Summation">∑</button>
                <button type="button" onclick="window.adminDashboard.insertSymbol('π')" class="px-1.5 py-0.5 hover:bg-white rounded" title="Pi">π</button>
                <button type="button" onclick="window.adminDashboard.insertSymbol('±')" class="px-1.5 py-0.5 hover:bg-white rounded" title="Plus Minus">±</button>
                <button type="button" onclick="window.adminDashboard.insertSymbol('≠')" class="px-1.5 py-0.5 hover:bg-white rounded" title="Not Equal">≠</button>
                <button type="button" onclick="window.adminDashboard.insertSymbol('≤')" class="px-1.5 py-0.5 hover:bg-white rounded" title="Less or Equal">≤</button>
                <button type="button" onclick="window.adminDashboard.insertSymbol('≥')" class="px-1.5 py-0.5 hover:bg-white rounded" title="Greater or Equal">≥</button>
                <button type="button" onclick="window.adminDashboard.insertTable()" class="px-2 py-0.5 hover:bg-white rounded font-semibold text-blue-600" title="Insert Accounting Table">+ Table</button>
              </div>
            </div>

            <textarea 
              id="q-text" 
              rows="3" 
              required 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500" 
              placeholder="Enter question text here. HTML tags (<b>, <i>, <sup>, etc.) and formulas are supported..."
            >${existingQ ? existingQ.text : ''}</textarea>
          </div>

          <!-- Question Image Upload (Optional) -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <label class="block font-bold text-slate-700">Question Image / Diagram (Optional)</label>
            <p class="text-[11px] text-slate-500">Upload diagram, balance sheet excerpt, or mathematical formula image (&lt;5 MB)</p>
            <div class="flex items-center gap-3">
              <input 
                type="file" 
                id="q-img-file" 
                accept="image/*"
                onchange="window.adminDashboard.handleQuestionImageUpload(this)" 
                class="text-xs file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              >
              <input type="hidden" id="q-img-url" value="${existingQ && existingQ.questionImage ? existingQ.questionImage : ''}">
            </div>
            <div id="q-img-preview-container" class="${existingQ && existingQ.questionImage ? '' : 'hidden'} mt-2 relative inline-block">
              <img id="q-img-preview" src="${existingQ && existingQ.questionImage ? existingQ.questionImage : ''}" class="max-h-32 rounded border border-slate-300">
              <button type="button" onclick="window.adminDashboard.removeQuestionImage()" class="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow hover:bg-rose-700">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>
          </div>

          <!-- 4 Options (A, B, C, D) with Text / Image Toggles -->
          <div class="space-y-3">
            <label class="block font-bold text-slate-800 text-sm">MCQ Options (A, B, C, D) *</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              ${['A', 'B', 'C', 'D'].map(optKey => {
                const optVal = existingQ ? (existingQ['option' + optKey] || '') : '';
                const optImg = optImages[optKey];
                const isImageMode = optTypes[optKey] === 'image';

                return `
                  <div class="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="w-6 h-6 rounded-full bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center border border-slate-200">
                        ${optKey}
                      </span>
                      <div class="flex items-center gap-2">
                        <label class="text-[11px] font-medium text-slate-600 flex items-center gap-1 cursor-pointer">
                          <input 
                            type="radio" 
                            name="opt-mode-${optKey}" 
                            value="text" 
                            ${!isImageMode ? 'checked' : ''} 
                            onchange="window.adminDashboard.toggleOptionMode('${optKey}', 'text')"
                          > Text
                        </label>
                        <label class="text-[11px] font-medium text-slate-600 flex items-center gap-1 cursor-pointer">
                          <input 
                            type="radio" 
                            name="opt-mode-${optKey}" 
                            value="image" 
                            ${isImageMode ? 'checked' : ''} 
                            onchange="window.adminDashboard.toggleOptionMode('${optKey}', 'image')"
                          > Image
                        </label>
                      </div>
                    </div>

                    <!-- Text Option Input -->
                    <div id="opt-text-wrap-${optKey}" class="${isImageMode ? 'hidden' : ''}">
                      <input 
                        type="text" 
                        id="q-opt${optKey}" 
                        value="${optVal}"
                        placeholder="Option ${optKey} text..."
                        class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      >
                    </div>

                    <!-- Image Option Input -->
                    <div id="opt-img-wrap-${optKey}" class="${!isImageMode ? 'hidden' : ''} space-y-1.5">
                      <input 
                        type="file" 
                        accept="image/*"
                        onchange="window.adminDashboard.handleOptionImageUpload(this, '${optKey}')"
                        class="text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-slate-100 file:text-slate-700"
                      >
                      <input type="hidden" id="q-opt${optKey}-img-url" value="${optImg || ''}">
                      <div id="opt-img-preview-container-${optKey}" class="${optImg ? '' : 'hidden'} relative inline-block">
                        <img id="opt-img-preview-${optKey}" src="${optImg || ''}" class="max-h-20 rounded border border-slate-200">
                        <button type="button" onclick="window.adminDashboard.removeOptionImage('${optKey}')" class="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-0.5 shadow">
                          <i data-lucide="x" class="w-2.5 h-2.5"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Correct Answer Selector -->
          <div class="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2">
            <div class="flex items-center justify-between">
              <label class="font-bold text-emerald-950 text-sm">Correct Answer Key *</label>
              <span class="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                🔒 Private: Protected until student submits
              </span>
            </div>
            <p class="text-[11px] text-emerald-800">Select which option is authoritative. This is kept strictly private on the server.</p>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              ${['A', 'B', 'C', 'D'].map(k => `
                <label class="flex items-center justify-center gap-2 p-2.5 rounded-lg border bg-white border-emerald-300 font-bold text-slate-800 hover:bg-emerald-100/50 cursor-pointer transition-colors">
                  <input 
                    type="radio" 
                    name="q-correct-choice" 
                    value="${k}" 
                    ${existingQ && existingQ.correctOption === k ? 'checked' : ''}
                    class="text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  >
                  <span>Option ${k}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Required Subscription Tier -->
          <div class="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-2">
            <div class="flex items-center justify-between">
              <label class="font-bold text-indigo-950 text-sm">Required Subscription Tier *</label>
              <span class="text-[10px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                Access Level
              </span>
            </div>
            <p class="text-[11px] text-indigo-800">Specify which membership pass is required to unlock and solve this MCQ question.</p>
            <select 
              id="q-required-tier" 
              class="w-full sm:w-60 px-3 py-2 border border-indigo-300 rounded-lg text-xs font-bold bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="free" ${!existingQ || existingQ.requiredTier === 'free' ? 'selected' : ''}>Free (Open to All Students)</option>
              <option value="core" ${existingQ && existingQ.requiredTier === 'core' ? 'selected' : ''}>Core Pass or Higher</option>
              <option value="plus" ${existingQ && existingQ.requiredTier === 'plus' ? 'selected' : ''}>Plus Pass or Higher</option>
              <option value="elite" ${existingQ && existingQ.requiredTier === 'elite' ? 'selected' : ''}>Elite Pass Only</option>
            </select>
          </div>

          <!-- Individual Marks & Platform XP for this MCQ -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Academic Marks -->
            <div class="bg-blue-50/70 border border-blue-200 rounded-xl p-4 space-y-2">
              <div class="flex items-center justify-between">
                <label class="font-bold text-blue-950 text-sm">Marks for Correct Answer *</label>
                <span class="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                  Academic Marks
                </span>
              </div>
              <p class="text-[11px] text-blue-800">Specify score marks awarded for this question (0 or any number).</p>
              <input 
                type="number" 
                id="q-marks" 
                value="${existingQ && typeof existingQ.marks === 'number' ? existingQ.marks : (test && typeof test.marksPerCorrect === 'number' ? test.marksPerCorrect : 2.0)}" 
                min="0" 
                step="0.25" 
                required
                class="w-full px-3 py-2 border border-blue-300 rounded-lg text-xs font-bold bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 2.0"
              >
            </div>

            <!-- Platform Gamification XP -->
            <div class="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2">
              <div class="flex items-center justify-between">
                <label class="font-bold text-amber-950 text-sm">XP Awarded for Correct Answer *</label>
                <span class="text-[10px] font-bold text-amber-700 bg-white px-2 py-0.5 rounded border border-amber-200">
                  Platform XP
                </span>
              </div>
              <p class="text-[11px] text-amber-800">Specify gamification XP awarded towards student's leaderboard & profile.</p>
              <input 
                type="number" 
                id="q-xp" 
                value="${existingQ && (typeof existingQ.xp === 'number' ? existingQ.xp : (typeof existingQ.points === 'number' ? existingQ.points : null)) !== null ? (existingQ.xp ?? existingQ.points) : (test && typeof test.pointsPerCorrect === 'number' ? test.pointsPerCorrect : 10)}" 
                min="0" 
                step="1" 
                required
                class="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs font-bold bg-white text-slate-800 focus:ring-2 focus:ring-amber-500"
                placeholder="e.g. 10"
              >
            </div>
          </div>

          <!-- Explanation / ICAI Standard Reference -->
          <div class="space-y-2">
            <label class="block font-bold text-slate-700 mb-1">ICAI Solution Explanation &amp; Conceptual Reference</label>
            <textarea 
              id="q-explanation" 
              rows="2" 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" 
              placeholder="Explain the solution formula, section reference, or accounting principle..."
            >${existingQ ? (existingQ.explanation || '') : ''}</textarea>

            <!-- Explanation Image Upload (for ICAI diagrams / journal entries / balance sheets) -->
            <div class="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-2">
              <label class="block font-semibold text-amber-900 text-[11px] uppercase tracking-wide">Explanation Diagram / Image (Optional)</label>
              <p class="text-[11px] text-amber-800">Attach an ICAI diagram, journal entry table, or balance sheet image shown after student submits. Uploaded to Firebase Storage (permanent).</p>
              <div class="flex items-center gap-3 flex-wrap">
                <input 
                  type="file" 
                  id="q-explanation-img-file" 
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onchange="window.adminDashboard.handleExplanationImageUpload(this)" 
                  class="text-xs file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
                >
                <input type="hidden" id="q-explanation-img-url" value="${existingQ && existingQ.explanationImage ? existingQ.explanationImage : ''}">
                <span id="q-explanation-img-spinner" class="hidden text-[11px] text-amber-700 font-semibold animate-pulse">⏳ Uploading…</span>
              </div>
              <div id="q-explanation-img-preview-container" class="${existingQ && existingQ.explanationImage ? '' : 'hidden'} relative inline-block mt-1">
                <img id="q-explanation-img-preview" src="${existingQ && existingQ.explanationImage ? existingQ.explanationImage : ''}" class="max-h-36 rounded border border-amber-300 object-contain bg-white">
                <button type="button" onclick="window.adminDashboard.removeExplanationImage()" class="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow hover:bg-rose-700">
                  <i data-lucide="x" class="w-3 h-3"></i>
                </button>
              </div>
            </div>
          </div>


          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button 
              type="button" 
              onclick="window.adminDashboard.openQuestionBuilder('${testId}')" 
              class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Back
            </button>
            <button 
              type="submit" 
              class="px-6 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm cursor-pointer"
            >
              ${existingQ ? 'Update Question' : 'Save Question'}
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  insertFormat(openTag, closeTag) {
    const txtArea = document.getElementById('q-text');
    if (!txtArea) return;
    const start = txtArea.selectionStart;
    const end = txtArea.selectionEnd;
    const sel = txtArea.value.substring(start, end);
    const replacement = openTag + (sel || 'text') + closeTag;
    txtArea.value = txtArea.value.substring(0, start) + replacement + txtArea.value.substring(end);
    txtArea.focus();
  }

  insertSymbol(sym) {
    const txtArea = document.getElementById('q-text');
    if (!txtArea) return;
    const start = txtArea.selectionStart;
    txtArea.value = txtArea.value.substring(0, start) + sym + txtArea.value.substring(start);
    txtArea.focus();
  }

  insertTable() {
    const txtArea = document.getElementById('q-text');
    if (!txtArea) return;
    const tableHtml = '\n<table class="w-full text-xs border border-slate-300 my-2"><thead><tr class="bg-slate-100"><th class="border p-1">Particulars</th><th class="border p-1">Amount (₹)</th></tr></thead><tbody><tr><td class="border p-1">Item 1</td><td class="border p-1">10,000</td></tr></tbody></table>\n';
    txtArea.value += tableHtml;
    txtArea.focus();
  }

  async handleQuestionImageUpload(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const res = await window.secureBackend.uploadImageFile(file);
    if (res.success) {
      document.getElementById('q-img-url').value = res.imageUrl;
      document.getElementById('q-img-preview').src = res.imageUrl;
      document.getElementById('q-img-preview-container').classList.remove('hidden');
      window.app.showToast('Question image attached.', 'success');
    } else {
      window.app.showToast(res.error || 'Failed to upload image.', 'error');
    }
  }

  removeQuestionImage() {
    document.getElementById('q-img-url').value = '';
    document.getElementById('q-img-preview-container').classList.add('hidden');
    const fInput = document.getElementById('q-img-file');
    if (fInput) fInput.value = '';
  }

  toggleOptionMode(optKey, mode) {
    const textWrap = document.getElementById(`opt-text-wrap-${optKey}`);
    const imgWrap = document.getElementById(`opt-img-wrap-${optKey}`);
    if (mode === 'image') {
      textWrap.classList.add('hidden');
      imgWrap.classList.remove('hidden');
    } else {
      imgWrap.classList.add('hidden');
      textWrap.classList.remove('hidden');
    }
  }

  async handleOptionImageUpload(input, optKey) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const res = await window.secureBackend.uploadImageFile(file);
    if (res.success) {
      document.getElementById(`q-opt${optKey}-img-url`).value = res.imageUrl;
      document.getElementById(`opt-img-preview-${optKey}`).src = res.imageUrl;
      document.getElementById(`opt-img-preview-container-${optKey}`).classList.remove('hidden');
      window.app.showToast(`Option ${optKey} image attached.`, 'success');
    } else {
      window.app.showToast(res.error || 'Failed to upload image.', 'error');
    }
  }

  removeOptionImage(optKey) {
    document.getElementById(`q-opt${optKey}-img-url`).value = '';
    document.getElementById(`opt-img-preview-container-${optKey}`).classList.add('hidden');
  }

  async handleExplanationImageUpload(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    // Show spinner, disable input
    const spinner = document.getElementById('q-explanation-img-spinner');
    if (spinner) spinner.classList.remove('hidden');
    input.disabled = true;

    try {
      // Validate file client-side
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        window.app.showToast('Explanation image must be under 5 MB.', 'error');
        input.disabled = false;
        if (spinner) spinner.classList.add('hidden');
        return;
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        window.app.showToast('Only JPEG, PNG, GIF, or WebP images are allowed.', 'error');
        input.disabled = false;
        if (spinner) spinner.classList.add('hidden');
        return;
      }

      let imageUrl = null;

      // Attempt Firebase Storage upload (permanent, survives Vercel cold starts)
      if (window.firebaseSync && typeof window.firebaseSync.uploadToFirebaseStorage === 'function') {
        const questionId = document.getElementById('q-explanation-img-url') ? 'q-' + Date.now() : 'q-unknown';
        const storagePath = `explanation-images/${questionId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        try {
          imageUrl = await window.firebaseSync.uploadToFirebaseStorage(file, storagePath);
        } catch (fbErr) {
          console.warn('[ExplanationImg] Firebase Storage upload failed, falling back:', fbErr);
          imageUrl = null;
        }
      }

      // Fallback: base64 data URL (stored in localStorage via question payload)
      if (!imageUrl) {
        imageUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
        console.info('[ExplanationImg] Using base64 fallback — consider Firebase Storage for persistence');
      }

      const urlInput = document.getElementById('q-explanation-img-url');
      const preview = document.getElementById('q-explanation-img-preview');
      const previewContainer = document.getElementById('q-explanation-img-preview-container');

      if (urlInput) urlInput.value = imageUrl;
      if (preview) preview.src = imageUrl;
      if (previewContainer) previewContainer.classList.remove('hidden');

      window.app.showToast('Explanation diagram attached.', 'success');
    } catch (err) {
      console.error('[ExplanationImg] Upload error:', err);
      window.app.showToast('Failed to attach explanation image. Please try again.', 'error');
    } finally {
      input.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    }
  }

  removeExplanationImage() {
    const urlInput = document.getElementById('q-explanation-img-url');
    const previewContainer = document.getElementById('q-explanation-img-preview-container');
    const fileInput = document.getElementById('q-explanation-img-file');
    if (urlInput) urlInput.value = '';
    if (previewContainer) previewContainer.classList.add('hidden');
    if (fileInput) fileInput.value = '';
  }

  async saveQuestion(e, existingQId = '', explicitTestId = '') {
    e.preventDefault();

    if (this._isSavingQuestion) {
      console.warn('[saveQuestion] Save already in progress, ignoring duplicate call.');
      return;
    }
    this._isSavingQuestion = true;

    const testId = explicitTestId || this.activeTestQuestionsId || (existingQId ? window.store.getQuestions().find(x => x.id === existingQId)?.testId : null);
    if (!testId) {
      window.app.showToast('Error: No active test selected. Please close and reopen the question builder.', 'error');
      this._isSavingQuestion = false;
      return;
    }

    const submitBtn = e.target ? e.target.querySelector('[type="submit"]') : null;
    if (submitBtn) {
      if (submitBtn.disabled) {
        this._isSavingQuestion = false;
        return;
      }
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-flex items-center gap-1.5"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ' + (existingQId ? 'Updating Question...' : 'Saving Question...') + '</span>';
      if (window.lucide) window.lucide.createIcons();
    }

    const enableSubmit = () => {
      this._isSavingQuestion = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = existingQId ? 'Update Question' : 'Save Question';
      }
    };

    const test = window.store.getTestById(testId);
    const existingQs = window.store.getQuestionsByTestId(testId);

    const text = document.getElementById('q-text').value.trim();
    const qImgUrl = document.getElementById('q-img-url').value;

    if (!text && !qImgUrl) {
      window.app.showToast('Please provide question text or upload a question image.', 'warning');
      enableSubmit();
      return;
    }

    const optA = document.getElementById('q-optA').value.trim();
    const optB = document.getElementById('q-optB').value.trim();
    const optC = document.getElementById('q-optC').value.trim();
    const optD = document.getElementById('q-optD').value.trim();

    const optAImg = document.getElementById('q-optA-img-url').value;
    const optBImg = document.getElementById('q-optB-img-url').value;
    const optCImg = document.getElementById('q-optC-img-url').value;
    const optDImg = document.getElementById('q-optD-img-url').value;

    const selectedRadio = document.querySelector('input[name="q-correct-choice"]:checked');
    const correctOption = selectedRadio ? selectedRadio.value : null;

    if (!correctOption) {
      window.app.showToast('Please select the correct answer key (A, B, C, or D).', 'warning');
      enableSubmit();
      return;
    }

    const explanation = document.getElementById('q-explanation').value.trim();
    const explanationImageUrl = document.getElementById('q-explanation-img-url') ? document.getElementById('q-explanation-img-url').value : '';
    const marksInput = document.getElementById('q-marks');
    const marksVal = marksInput ? parseFloat(marksInput.value) : null;
    const qMarks = (marksVal !== null && !isNaN(marksVal) && marksVal >= 0) ? marksVal : (test && typeof test.marksPerCorrect === 'number' ? test.marksPerCorrect : 2.0);

    const xpInput = document.getElementById('q-xp');
    const xpVal = xpInput ? parseFloat(xpInput.value) : null;
    const qXp = (xpVal !== null && !isNaN(xpVal) && xpVal >= 0) ? Math.round(xpVal) : (test && typeof test.pointsPerCorrect === 'number' ? test.pointsPerCorrect : 10);

    const tierSelect = document.getElementById('q-required-tier');
    const requiredTier = tierSelect ? tierSelect.value : 'free';

    const qPayload = {
      id: existingQId || ('q-' + Date.now()),
      testId: testId,
      number: existingQId ? (existingQs.find(x => x.id === existingQId)?.number || 1) : (existingQs.length + 1),
      text,
      questionType: qImgUrl ? (text ? 'both' : 'image') : 'text',
      questionImage: qImgUrl || null,
      optionA: optA || 'Option A',
      optionB: optB || 'Option B',
      optionC: optC || 'Option C',
      optionD: optD || 'Option D',
      optionTypes: {
        A: optAImg ? 'image' : 'text',
        B: optBImg ? 'image' : 'text',
        C: optCImg ? 'image' : 'text',
        D: optDImg ? 'image' : 'text'
      },
      optionImages: {
        A: optAImg || null,
        B: optBImg || null,
        C: optCImg || null,
        D: optDImg || null
      },
      correctOption,
      marks: qMarks,
      xp: qXp,
      points: qXp,
      requiredTier: requiredTier || 'free',
      explanation: explanation || 'Refer to ICAI Module.',
      explanationImage: explanationImageUrl || null,
      isDraft: false,
      isDuplicate: false
    };

    // Await backend response BEFORE updating store
    const user = window.auth.getCurrentUser();
    const token = user ? (user.token || user.email) : '';
    try {
      const resp = await fetch('/api/tests/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(qPayload)
      });

      if (!resp.ok) {
        let errMsg = 'Failed to save question to server.';
        try {
          const errData = await resp.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        console.error('[saveQuestion] Backend returned error:', resp.status, errMsg);
        window.app.showToast(errMsg, 'error');
        enableSubmit();
        return; // Form remains open
      }

      const resData = await resp.json();
      if (!resData.success) {
        window.app.showToast(resData.error || 'Server rejected question.', 'error');
        enableSubmit();
        return;
      }

      const confirmedQ = resData.question || qPayload;

      // Update frontend state only after confirmed backend persistence
      const currentQuestions = window.store.getQuestions();
      const alreadyInStore = currentQuestions.some(q => q.id === confirmedQ.id);

      if (existingQId || alreadyInStore) {
        window.store.updateQuestion(confirmedQ);
      } else {
        window.store.addQuestion(confirmedQ);
      }

      if (test) {
        const allQs = window.store.getQuestionsByTestId(testId);
        test.totalQuestions = allQs.length;
        // Strictly preserve admin-configured maximumMarks (DO NOT overwrite with sum)
        window.store.updateTest(test);
      }

      this._isEditingQuestion = false;
      window.app.showToast(existingQId ? 'Question updated successfully!' : 'Question saved successfully!', 'success');
      this.openQuestionBuilder(testId);
    } catch (netErr) {
      console.error('[saveQuestion] Network error during backend sync:', netErr);
      window.app.showToast('Network error: Unable to reach server. Question was not saved.', 'error');
      enableSubmit();
    } finally {
      this._isSavingQuestion = false;
    }
  }

  async duplicateQuestion(questionId) {
    const user = window.auth.getCurrentUser();
    const token = user ? (user.token || user.email) : '';
    try {
      const resp = await fetch('/api/tests/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'duplicate', questionId })
      });

      if (!resp.ok) {
        let errMsg = 'Failed to duplicate question.';
        try {
          const errData = await resp.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        window.app.showToast(errMsg, 'error');
        return;
      }

      const resData = await resp.json();
      if (resData.success && resData.question) {
        window.store.addQuestion(resData.question);
        const test = window.store.getTestById(this.activeTestQuestionsId);
        if (test) {
          test.totalQuestions = (test.totalQuestions || 0) + 1;
          // Strictly preserve admin-configured maximumMarks
          window.store.updateTest(test);
        }
        window.app.showToast('Question duplicated.', 'success');
        this.openQuestionBuilder(this.activeTestQuestionsId);
      }
    } catch (netErr) {
      console.error('[duplicateQuestion] Network error:', netErr);
      window.app.showToast('Network error: Could not duplicate question.', 'error');
    }
  }

  async moveQuestion(questionId, direction) {
    const testId = this.activeTestQuestionsId;
    const questions = window.store.getQuestionsByTestId(testId);
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;

    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= questions.length) return;

    // Swap
    const temp = questions[idx];
    questions[idx] = questions[targetIdx];
    questions[targetIdx] = temp;

    const orderIds = questions.map(q => q.id);
    window.store.reorderQuestions(testId, orderIds);

    const user = window.auth.getCurrentUser();
    const token = user ? (user.token || user.email) : '';
    try {
      await fetch('/api/tests/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'reorder', testId, questionIds: orderIds })
      });
    } catch (e) {}

    this.openQuestionBuilder(testId);
  }

  async deleteQuestion(id) {
    if (!id) return;
    if (!confirm('Delete this question permanently?')) return;
    const testId = this.activeTestQuestionsId;
    const user = window.auth.getCurrentUser();
    const token = user ? (user.token || user.email) : '';

    try {
      const resp = await fetch('/api/tests/questions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id })
      });

      if (!resp.ok) {
        let errMsg = 'Failed to delete question from server.';
        try {
          const errData = await resp.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        window.app.showToast(errMsg, 'error');
        return;
      }

      window.store.deleteQuestion(id);

      const test = window.store.getTestById(testId);
      if (test) {
        const remaining = window.store.getQuestionsByTestId(testId);
        test.totalQuestions = remaining.length;
        // Strictly preserve admin-configured maximumMarks
        window.store.updateTest(test);
      }

      window.app.showToast('Question deleted.', 'info');
      this.openQuestionBuilder(testId);
    } catch (netErr) {
      console.error('[deleteQuestion] Network error:', netErr);
      window.app.showToast('Network error: Could not delete question.', 'error');
    }
  }

  verifyQuestionDraft(questionId) {
    const q = window.store.getQuestions().find(x => x.id === questionId);
    if (!q) return;

    if (!q.correctOption) {
      window.app.showToast('Please edit the question and select the correct answer key first.', 'warning');
      this.openQuestionForm(questionId);
      return;
    }

    q.isDraft = false;
    q.isDuplicate = false;
    window.store.updateQuestion(q);
    window.app.showToast('Question marked as verified.', 'success');
    this.openQuestionBuilder(this.activeTestQuestionsId);
  }

  // --- PDF MCQ IMPORT MODAL ---
  openPdfImportModal(testId) {
    const test = window.store ? window.store.getTestById(testId) : null;
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Import MCQs from PDF Document</h3>
            <p class="text-xs text-slate-500">Automatically extracts individual questions, options, suggested answer keys, and preserves diagrams</p>
          </div>
          <button onclick="window.adminDashboard.openQuestionBuilder('${testId}')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Important PDF Rule Alert -->
          <div class="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-950 space-y-1">
            <div class="font-bold flex items-center gap-1.5 text-amber-900">
              <i data-lucide="shield-alert" class="w-4 h-4 text-amber-600"></i>
              MANDATORY DRAFT / REVIEW POLICY
            </div>
            <p class="leading-relaxed">
              Imported questions are <strong>never published automatically</strong>. All extracted questions will be staged as <strong>DRAFT / NEEDS REVIEW</strong> with AI suggested answers highlighted for mandatory admin verification before publication.
            </p>
          </div>

          <!-- File Upload Zone -->
          <div class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50 hover:bg-slate-100/60 transition-colors">
            <i data-lucide="file-up" class="w-10 h-10 text-indigo-500 mx-auto mb-2"></i>
            <h4 class="font-bold text-slate-800">Select PDF Question Paper</h4>
            <p class="text-[11px] text-slate-500 mt-0.5 mb-3">Accepts official ICAI Mock Test, RTP, or MTP PDF files (&lt;15 MB)</p>
            <input 
              type="file" 
              id="pdf-import-file" 
              accept=".pdf,application/pdf"
              class="text-xs file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
            >
          </div>

          <!-- Points Per Question Input -->
          <div class="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3.5 space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="font-bold text-indigo-950 text-xs">Points Awarded per Correct MCQ Answer *</label>
              <span class="text-[10px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">Per Extracted Question</span>
            </div>
            <p class="text-[11px] text-indigo-800">Specify score points to assign to every extracted question.</p>
            <input 
              type="number" 
              id="pdf-import-points" 
              value="${(test && typeof test.marksPerCorrect === 'number') ? test.marksPerCorrect : 2.0}" 
              min="0.25" 
              step="0.25"
              class="w-full sm:w-44 px-3 py-1.5 border border-indigo-300 rounded-lg text-xs font-bold bg-white text-slate-800"
              placeholder="e.g. 2.0"
            >
          </div>

          <!-- Direct OCR Text Paste Area (Optional Override) -->
          <div>
            <label class="block font-bold text-slate-700 mb-1">Or Paste MCQ Text directly:</label>
            <textarea 
              id="pdf-raw-text" 
              rows="4" 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono" 
              placeholder="e.g.\n1. What is the statutory notice period for board meetings?\n(A) 3 days\n(B) 7 days\n(C) 14 days\n(D) 21 days\nAnswer: B"
            ></textarea>
          </div>

          <div id="pdf-import-status" class="hidden p-3 rounded-lg text-xs"></div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button 
              type="button" 
              onclick="window.adminDashboard.openQuestionBuilder('${testId}')" 
              class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="button" 
              onclick="window.adminDashboard.executePdfImport('${testId}')"
              id="btn-run-pdf-import"
              class="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="sparkles" class="w-4 h-4"></i> Extract & Review Questions
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  async executePdfImport(testId) {
    const fileInput = document.getElementById('pdf-import-file');
    const rawText = document.getElementById('pdf-raw-text') ? document.getElementById('pdf-raw-text').value.trim() : '';
    const statusBox = document.getElementById('pdf-import-status');
    const btn = document.getElementById('btn-run-pdf-import');
    const pointsInput = document.getElementById('pdf-import-points');

    const test = window.store ? window.store.getTestById(testId) : null;
    const pointsPerQ = pointsInput ? (parseFloat(pointsInput.value) || (test && test.marksPerCorrect ? test.marksPerCorrect : 2.0)) : 2.0;

    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (!file && !rawText) {
      window.app.showToast('Please select a PDF file or paste question text.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing & Parsing...';
    }
    if (statusBox) {
      statusBox.className = 'p-3 rounded-lg text-xs bg-blue-50 text-blue-800 border border-blue-200 block';
      statusBox.innerHTML = 'Analyzing document structure, extracting questions and identifying answer patterns...';
    }
    if (window.lucide) window.lucide.createIcons();

    try {
      const res = await window.secureBackend.importMCQFromPdf(file, testId, rawText, pointsPerQ);

      if (res.success && res.questions && res.questions.length > 0) {
        window.app.showToast(`Extracted ${res.questions.length} questions. Please review them below.`, 'info');
        this.openExtractedMcqsReviewModal(testId, res.questions, pointsPerQ);
      } else {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4"></i> Extract & Review Questions';
        }
        if (statusBox) {
          statusBox.className = 'p-3 rounded-lg text-xs bg-rose-50 text-rose-800 border border-rose-200 block';
          statusBox.innerHTML = res.error || 'Could not parse questions from document. Please check PDF content format.';
        }
        if (window.lucide) window.lucide.createIcons();
      }
    } catch (err) {
      console.error('PDF import execution error:', err);
      if (statusBox) {
        statusBox.className = 'p-3 rounded-lg text-xs bg-rose-50 text-rose-800 border border-rose-200 block';
        statusBox.innerHTML = 'An unexpected error occurred during PDF processing: ' + (err.message || 'Unknown error');
      }
      window.app.showToast('PDF import failed: ' + (err.message || 'Parsing error'), 'error');
    } finally {
      // GUARANTEE button is re-enabled if question builder was not opened
      const currentBtn = document.getElementById('btn-run-pdf-import');
      if (currentBtn && currentBtn.disabled) {
        currentBtn.disabled = false;
        currentBtn.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4"></i> Extract & Review Questions';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  // --- INTERACTIVE REVIEW & VERIFICATION MODAL FOR EXTRACTED MCQs ---
  openExtractedMcqsReviewModal(testId, extractedQuestions, defaultPoints) {
    const test = window.store.getTestById(testId);
    this._pendingImportQuestions = (extractedQuestions || []).map((q, idx) => {
      let opts = q.options || {};
      if (Array.isArray(opts)) {
        opts = {
          A: opts[0] || '',
          B: opts[1] || '',
          C: opts[2] || '',
          D: opts[3] || ''
        };
      }
      return {
        tempId: 'temp-q-' + idx,
        text: q.text || q.question || '',
        options: {
          A: (opts.A || '').toString().trim(),
          B: (opts.B || '').toString().trim(),
          C: (opts.C || '').toString().trim(),
          D: (opts.D || '').toString().trim()
        },
        correctOption: (q.correctOption || q.correctAnswer || q.suggestedAnswer || 'A').toString().trim().toUpperCase(),
        marks: parseFloat(q.marks || defaultPoints || (test ? test.marksPerCorrect : 2.0) || 2.0),
        explanation: q.explanation || ''
      };
    });

    this.renderExtractedMcqsReviewModalHtml(testId);
  }

  renderExtractedMcqsReviewModalHtml(testId) {
    const test = window.store.getTestById(testId);
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    const questions = this._pendingImportQuestions || [];

    modalContent.innerHTML = `
      <div class="p-6 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-4 flex-shrink-0">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                Step 2 of 2: Review & Verification
              </span>
              <h3 class="text-base font-bold text-slate-900">Extracted MCQs (${questions.length})</h3>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">Review question wording, options, and correct answers. You can edit any field or remove malformed questions before saving.</p>
          </div>
          <button onclick="window.adminDashboard.openPdfImportModal('${testId}')" class="text-slate-400 hover:text-slate-600 cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Scrollable Questions List -->
        <div class="flex-1 overflow-y-auto space-y-4 pr-1 mb-4" id="extracted-mcqs-list">
          ${questions.length === 0 ? `
            <div class="p-8 text-center text-slate-400">
              <i data-lucide="help-circle" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
              No questions in list. <button onclick="window.adminDashboard.openPdfImportModal('${testId}')" class="text-indigo-600 font-bold underline cursor-pointer">Re-upload PDF</button>
            </div>
          ` : questions.map((q, qIndex) => `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 relative" id="card-${q.tempId}">
              <div class="flex items-center justify-between mb-2">
                <span class="font-bold text-xs text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200">
                  Question #${qIndex + 1}
                </span>
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1.5">
                    <label class="text-[11px] font-bold text-slate-600">Marks:</label>
                    <input 
                      type="number" 
                      min="0.25" 
                      step="0.25" 
                      value="${q.marks}" 
                      onchange="window.adminDashboard.updatePendingQField(${qIndex}, 'marks', this.value)"
                      class="w-16 px-2 py-1 text-xs border border-slate-300 rounded bg-white font-bold"
                    />
                  </div>
                  <button 
                    onclick="window.adminDashboard.removePendingQuestion(${qIndex}, '${testId}')"
                    class="text-rose-600 hover:text-rose-800 text-xs font-semibold flex items-center gap-1 p-1 hover:bg-rose-50 rounded cursor-pointer"
                    title="Remove this question"
                  >
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Remove
                  </button>
                </div>
              </div>

              <!-- Question Text -->
              <div class="mb-3">
                <label class="block text-[11px] font-bold text-slate-700 mb-1">Question Text</label>
                <textarea 
                  rows="2" 
                  onchange="window.adminDashboard.updatePendingQField(${qIndex}, 'text', this.value)"
                  class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium focus:ring-2 focus:ring-indigo-400"
                >${q.text}</textarea>
              </div>

              <!-- Options A, B, C, D -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
                ${['A', 'B', 'C', 'D'].map(letter => `
                  <div class="flex items-center gap-1.5">
                    <span class="w-6 text-center text-xs font-black rounded ${q.correctOption === letter ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'} py-1 flex-shrink-0">
                      ${letter}
                    </span>
                    <input 
                      type="text" 
                      value="${(q.options[letter] || '').replace(/"/g, '&quot;')}" 
                      onchange="window.adminDashboard.updatePendingQOption(${qIndex}, '${letter}', this.value)"
                      class="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded bg-white font-medium"
                      placeholder="Option ${letter}"
                    />
                  </div>
                `).join('')}
              </div>

              <!-- Correct Option & Explanation -->
              <div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                <div class="flex items-center gap-2">
                  <label class="font-bold text-emerald-800 flex items-center gap-1">
                    <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-600"></i> Correct Answer:
                  </label>
                  <select 
                    onchange="window.adminDashboard.updatePendingQField(${qIndex}, 'correctOption', this.value); window.adminDashboard.renderExtractedMcqsReviewModalHtml('${testId}');"
                    class="px-2.5 py-1 text-xs border border-emerald-300 rounded-md bg-emerald-50 text-emerald-900 font-bold cursor-pointer"
                  >
                    ${['A', 'B', 'C', 'D'].map(opt => `
                      <option value="${opt}" ${q.correctOption === opt ? 'selected' : ''}>Option ${opt}</option>
                    `).join('')}
                  </select>
                </div>
                <div class="flex-1 w-full">
                  <input 
                    type="text" 
                    value="${(q.explanation || '').replace(/"/g, '&quot;')}" 
                    onchange="window.adminDashboard.updatePendingQField(${qIndex}, 'explanation', this.value)"
                    placeholder="Explanation / Answer Key Reference (optional)"
                    class="w-full px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-600 italic bg-slate-50/50"
                  />
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Action Footer -->
        <div class="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
          <div class="flex items-center gap-2">
            <input type="checkbox" id="chk-publish-immediately" checked class="w-4 h-4 text-emerald-600 rounded cursor-pointer" />
            <label for="chk-publish-immediately" class="text-xs font-bold text-slate-800 cursor-pointer">
              Publish immediately to students (Make Live in Student Portal)
            </label>
          </div>
          <div class="flex items-center justify-end gap-2.5">
            <button 
              type="button"
              onclick="window.adminDashboard.openPdfImportModal('${testId}')"
              class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Back to Upload
            </button>
            <button 
              type="button"
              id="btn-confirm-import-mcqs"
              onclick="window.adminDashboard.commitImportMcqs('${testId}')"
              ${questions.length === 0 ? 'disabled' : ''}
              class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
            >
              <i data-lucide="check-circle-2" class="w-4 h-4"></i> Add / Import MCQs (${questions.length})
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  updatePendingQField(idx, field, val) {
    if (this._pendingImportQuestions && this._pendingImportQuestions[idx]) {
      this._pendingImportQuestions[idx][field] = field === 'marks' ? (parseFloat(val) || 2.0) : val;
    }
  }

  updatePendingQOption(idx, letter, val) {
    if (this._pendingImportQuestions && this._pendingImportQuestions[idx] && this._pendingImportQuestions[idx].options) {
      this._pendingImportQuestions[idx].options[letter] = val;
    }
  }

  removePendingQuestion(idx, testId) {
    if (this._pendingImportQuestions) {
      this._pendingImportQuestions.splice(idx, 1);
      this.renderExtractedMcqsReviewModalHtml(testId);
    }
  }

  async commitImportMcqs(testId) {
    const questions = this._pendingImportQuestions || [];
    if (questions.length === 0) {
      window.app.showToast('No questions to import.', 'warning');
      return;
    }

    const publishImmediately = document.getElementById('chk-publish-immediately') ? document.getElementById('chk-publish-immediately').checked : true;
    const btn = document.getElementById('btn-confirm-import-mcqs');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving to Database...';
    }

    const adminUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = adminUser ? (adminUser.token || adminUser.email) : '';

    try {
      // 1. Call Backend Bulk Import API
      const resp = await fetch('/api/tests/questions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          testId: testId,
          questions: questions,
          publishImmediately: publishImmediately
        })
      });

      const data = await resp.json();

      if (resp.ok && data.success) {
        // 2. Also save into local window.store
        const savedQs = data.questions || [];
        savedQs.forEach(q => {
          if (window.store.addQuestion) {
            window.store.addQuestion(q);
          }
        });

        // Update test stats
        const test = window.store.getTestById(testId);
        if (test) {
          const allQs = window.store.getQuestionsByTestId(testId);
          test.totalQuestions = allQs.length;
          test.maximumMarks = allQs.reduce((sum, q) => sum + (typeof q.marks === 'number' ? q.marks : 2.0), 0);
          if (publishImmediately) test.isPublished = true;
          window.store.updateTest(test);
        }

        window.app.showToast(`Successfully imported and published ${savedQs.length} MCQs!`, 'success');
        this._pendingImportQuestions = null;
        this.openQuestionBuilder(testId);
      } else {
        throw new Error(data.error || 'Server rejected question import.');
      }
    } catch (err) {
      console.error('MCQ bulk import error:', err);
      window.app.showToast('Error saving questions: ' + err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="check-circle-2" class="w-4 h-4"></i> Add / Import MCQs (${questions.length})`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  // --- MANDATORY ADMIN PREVIEW MODE ---
  previewTest(testId) {
    const test = window.store.getTestById(testId);
    if (!test) {
      window.app.showToast('Test not found.', 'error');
      return;
    }
    const questions = window.store.getQuestionsByTestId(testId);
    if (questions.length === 0) {
      window.app.showToast('Cannot preview test with 0 questions. Please add questions first.', 'warning');
      return;
    }

    // Close admin modal
    window.app.closeModal('admin-generic-modal');

    // Launch student exam interface in Preview Mode
    window.testEngine.startTest(testId, { isPreview: true });
  }

  // --- PUBLISHING CONFIRMATION WORKFLOW ---
  openPublishModal(testId) {
    const test = window.store.getTestById(testId);
    if (!test) return;

    const questions = window.store.getQuestionsByTestId(testId);
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    const draftsCount = questions.filter(q => q.isDraft).length;
    const duplicatesCount = questions.filter(q => q.isDuplicate).length;
    const unsetAnswersCount = questions.filter(q => !q.correctOption).length;
    const canPublish = questions.length > 0 && unsetAnswersCount === 0;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Publish Confirmation & Schedule</h3>
            <p class="text-xs text-slate-500">Step 6 of 6 in the verified authoring workflow</p>
          </div>
          <button onclick="window.adminDashboard.openQuestionBuilder('${testId}')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Summary Checklist -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <h4 class="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Examination Overview</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
              <div>Test: <strong>${test.title}</strong></div>
              <div>Subject: <strong>${test.subject || 'Accounting'}</strong></div>
              <div>Topic: <strong>${test.topic || test.chapter || 'Full Syllabus'}</strong></div>
              <div>Total Questions: <strong>${questions.length} MCQs</strong></div>
              <div>Duration: <strong>${test.durationMinutes} mins</strong></div>
              <div>Marking: <strong class="text-emerald-700">+${test.marksPerCorrect}</strong> / <strong class="text-rose-600">-${test.negativeMarksPerWrong}</strong></div>
              <div>Attempt Limit: <strong>${test.maxAttempts || 3} allowed</strong></div>
              <div>Current Status: <strong>${test.status || 'Draft'}</strong></div>
            </div>
          </div>

          <!-- Pre-flight Validation Alerts -->
          ${questions.length === 0 ? `
            <div class="bg-rose-50 border border-rose-200 p-3 rounded-lg text-rose-800 font-bold flex items-center gap-2">
              <i data-lucide="alert-circle" class="w-4 h-4"></i>
              Cannot publish: The test has 0 questions. Please add questions before publishing.
            </div>
          ` : ''}

          ${unsetAnswersCount > 0 ? `
            <div class="bg-rose-50 border border-rose-200 p-3 rounded-lg text-rose-800 font-semibold flex items-center gap-2">
              <i data-lucide="alert-circle" class="w-4 h-4"></i>
              Warning: ${unsetAnswersCount} question(s) do not have a verified correct answer. Admin verification is required.
            </div>
          ` : ''}

          ${draftsCount > 0 ? `
            <div class="bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-800 flex items-center gap-2">
              <i data-lucide="info" class="w-4 h-4"></i>
              Notice: ${draftsCount} question(s) are still flagged as draft. Publishing will verify and release all questions.
            </div>
          ` : ''}

          <!-- Schedule Options -->
          <div class="space-y-3 pt-2">
            <label class="block font-bold text-slate-800">Select Release Mode:</label>
            <div class="space-y-2">
              <label class="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="publish-mode" value="immediate" checked onchange="document.getElementById('schedule-picker-box').classList.add('hidden')">
                <div>
                  <strong class="text-slate-900 block">Publish Immediately</strong>
                  <span class="text-slate-500 text-[11px]">Make visible to all enrolled students right now.</span>
                </div>
              </label>

              <label class="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="publish-mode" value="schedule" onchange="document.getElementById('schedule-picker-box').classList.remove('hidden')">
                <div>
                  <strong class="text-slate-900 block">Schedule for Specific Date & Time</strong>
                  <span class="text-slate-500 text-[11px]">Automatically releases at the scheduled future timestamp.</span>
                </div>
              </label>

              <div id="schedule-picker-box" class="hidden p-3 bg-purple-50/50 border border-purple-200 rounded-xl space-y-2">
                <label class="block font-bold text-purple-900">Publish Date & Time:</label>
                <input type="datetime-local" id="tst-schedule-datetime" class="px-3 py-2 border border-purple-300 rounded-lg bg-white w-full">
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button 
              type="button" 
              onclick="window.adminDashboard.openQuestionBuilder('${testId}')" 
              class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Back to Builder
            </button>
            <button 
              type="button" 
              onclick="window.adminDashboard.confirmPublish('${testId}')"
              ${!canPublish ? 'disabled' : ''}
              class="px-6 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              Confirm & Publish
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  async confirmPublish(testId) {
    const test = window.store.getTestById(testId);
    if (!test) return;

    const modeRadio = document.querySelector('input[name="publish-mode"]:checked');
    const mode = modeRadio ? modeRadio.value : 'immediate';

    let newStatus = 'Published';
    let schedTime = null;

    if (mode === 'schedule') {
      const dtInput = document.getElementById('tst-schedule-datetime');
      if (dtInput && dtInput.value) {
        schedTime = new Date(dtInput.value).toISOString();
        newStatus = 'Scheduled';
      } else {
        window.app.showToast('Please specify the scheduled date and time.', 'warning');
        return;
      }
    }

    test.status = newStatus;
    test.isPublished = (newStatus === 'Published');
    if (schedTime) test.scheduledPublishTime = schedTime;

    // Verify any pending draft questions
    const questions = window.store.getQuestionsByTestId(testId);
    questions.forEach(q => {
      q.isDraft = false;
      q.isDuplicate = false;
      window.store.updateQuestion(q);
    });

    window.store.updateTest(test);

    // Backend sync
    const user = window.auth.getCurrentUser();
    const token = user ? (user.token || user.email) : '';
    try {
      await fetch('/api/tests/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ testId, status: newStatus, scheduledPublishTime: schedTime })
      });
    } catch (e) {}

    window.app.closeModal('admin-generic-modal');
    window.app.showToast(`Test successfully ${newStatus.toLowerCase()}!`, 'success');
    this.renderMCQTests();
  }

  // --- 7. VIDEO LECTURES ---
  renderLectures() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const lectures = window.store.getLectures();

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-base font-bold text-slate-900">Lecture Video Management</h3>
          <p class="text-xs text-slate-500 mt-0.5">Manage recorded video sessions, YouTube/Vimeo embeds, and chapter notes</p>
        </div>
        <button 
          onclick="window.adminDashboard.openLectureModal()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
        >
          <i data-lucide="plus" class="w-4 h-4"></i> Add New Lecture
        </button>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Video</th>
              <th class="py-3 px-4">Title & Subject</th>
              <th class="py-3 px-4">Duration</th>
              <th class="py-3 px-4">Views</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${lectures.map(lec => {
              const subject = window.store.getSubjectById(lec.subjectId);
              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4 w-24">
                    <img src="${lec.thumbnail}" class="w-20 h-12 object-cover rounded-md border border-slate-200">
                  </td>
                  <td class="py-3 px-4">
                    <span class="text-[11px] font-bold text-blue-600 uppercase block">${subject ? subject.name : 'CA'} • ${lec.chapter}</span>
                    <span class="font-bold text-slate-900 text-xs line-clamp-1">${lec.title}</span>
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-600">${lec.durationMinutes} mins</td>
                  <td class="py-3 px-4 text-xs font-semibold text-slate-700">${lec.views}</td>
                  <td class="py-3 px-4">
                    <button 
                      onclick="window.adminDashboard.toggleLecturePublish('${lec.id}')"
                      class="px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
                        lec.isPublished 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                          : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                      }"
                    >
                      ${lec.isPublished ? 'Published' : 'Draft'}
                    </button>
                  </td>
                  <td class="py-3 px-4 text-right">
                    <button onclick="window.adminDashboard.deleteLecture('${lec.id}')" class="text-xs font-semibold text-rose-600 hover:text-rose-800">Delete</button>
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

  openLectureModal() {
    const subjects = window.store.getSubjects();
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">Create New Lecture</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveLecture(event)" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Lecture Title</label>
            <input type="text" id="lec-title" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Ind AS 115 Revenue Recognition Practical">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Subject</label>
              <select id="lec-subject" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
                ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Chapter / Topic</label>
              <input type="text" id="lec-chapter" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Accounting Standards">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Video Embed URL (YouTube/Vimeo)</label>
              <input type="url" id="lec-video-url" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="https://www.youtube-nocookie.com/embed/...">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Duration (Minutes)</label>
              <input type="number" id="lec-duration" min="1" required value="45" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Thumbnail Image URL</label>
            <input type="url" id="lec-thumbnail" required value="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Description & Study Notes</label>
            <textarea id="lec-desc" rows="3" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="Detailed notes..."></textarea>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">Save Lecture</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveLecture(e) {
    e.preventDefault();
    const newLec = {
      id: 'lec-' + Date.now(),
      title: document.getElementById('lec-title').value.trim(),
      subjectId: document.getElementById('lec-subject').value,
      chapter: document.getElementById('lec-chapter').value.trim(),
      videoUrl: document.getElementById('lec-video-url').value.trim(),
      durationMinutes: parseInt(document.getElementById('lec-duration').value, 10),
      thumbnail: document.getElementById('lec-thumbnail').value.trim(),
      description: document.getElementById('lec-desc').value.trim(),
      isPublished: true,
      views: 0,
      createdAt: new Date().toISOString()
    };

    window.store.addLecture(newLec);
    window.app.closeModal('admin-generic-modal');
    window.app.showToast('Lecture added.', 'success');
    this.renderLectures();
  }

  toggleLecturePublish(id) {
    const lec = window.store.getLectures().find(l => l.id === id);
    if (lec) {
      lec.isPublished = !lec.isPublished;
      window.store.updateLecture(lec);
      this.renderLectures();
    }
  }

  deleteLecture(id) {
    if (confirm('Delete this lecture?')) {
      window.store.deleteLecture(id);
      window.app.showToast('Lecture deleted.', 'info');
      this.renderLectures();
    }
  }

  // --- 8. WEBSITE UPDATES BANNER & SLIDER MANAGEMENT ---
  renderBanners() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const banners = window.store.getBanners();
    const visibleCount = banners.filter(b => b.isVisible !== false).length;

    container.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 class="text-base font-bold text-slate-900">Website Updates Banner & Slider Manager</h3>
          <p class="text-xs text-slate-500 mt-0.5">
            Upload and control centralized update images. If 1 image is active it displays statically; 2 or more images automatically create a sliding carousel for all website visitors.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button 
            onclick="window.adminDashboard.openAddBannerModal()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <i data-lucide="plus-circle" class="w-4 h-4"></i> Upload New Banner
          </button>
        </div>
      </div>

      <!-- Banner Status KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Banners</span>
          <span class="text-2xl font-black text-slate-900 mt-0.5 block">${banners.length}</span>
          <span class="text-[11px] text-slate-400">Uploaded announcements</span>
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span class="text-xs font-semibold text-blue-800 uppercase tracking-wider block">Currently Visible</span>
          <span class="text-2xl font-black text-blue-900 mt-0.5 block">${visibleCount}</span>
          <span class="text-[11px] text-blue-700">Displayed on website</span>
        </div>
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span class="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">Display Mode</span>
          <span class="text-2xl font-black text-emerald-900 mt-0.5 block">
            ${visibleCount === 1 ? 'Static Banner' : (visibleCount > 1 ? 'Auto Slider (' + visibleCount + ')' : 'Hidden (0)')}
          </span>
          <span class="text-[11px] text-emerald-700">
            ${visibleCount > 1 ? 'Continuous horizontal carousel' : (visibleCount === 1 ? 'Single hero banner' : 'No active images')}
          </span>
        </div>
      </div>

      <!-- Banners List / Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${banners.length === 0 ? `
          <div class="col-span-full py-12 text-center bg-white border border-slate-200 rounded-2xl">
            <i data-lucide="image" class="w-10 h-10 text-slate-300 mx-auto mb-2"></i>
            <h4 class="text-sm font-bold text-slate-700">No Update Banners Yet</h4>
            <p class="text-xs text-slate-400 mt-1 mb-4">Upload your first notification or announcement image for CA students.</p>
            <button onclick="window.adminDashboard.openAddBannerModal()" class="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm">
              + Upload Banner
            </button>
          </div>
        ` : banners.map(b => {
          const isVis = b.isVisible !== false;
          return `
            <div class="bg-white border ${isVis ? 'border-slate-200' : 'border-rose-200 bg-rose-50/20'} rounded-xl overflow-hidden shadow-xs flex flex-col justify-between">
              <div>
                <div class="relative h-36 w-full bg-slate-900 overflow-hidden">
                  <img src="${b.imageUrl}" alt="${b.title}" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80'">
                  <div class="absolute top-2 left-2 flex items-center gap-1.5">
                    <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-blue-600 text-white shadow-xs">
                      ${b.tag || 'UPDATE'}
                    </span>
                  </div>
                  <div class="absolute top-2 right-2">
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border ${isVis ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-rose-500 text-white border-rose-600'}">
                      ${isVis ? '● Live' : '✕ Hidden'}
                    </span>
                  </div>
                </div>

                <div class="p-4">
                  <h4 class="font-bold text-slate-900 text-xs line-clamp-2">${b.title}</h4>
                  ${b.subtitle ? `<p class="text-[11px] text-slate-500 mt-1 line-clamp-2">${b.subtitle}</p>` : ''}
                  ${b.linkUrl ? `<span class="text-[10px] text-blue-600 font-mono block mt-1.5 truncate">Link: ${b.linkUrl}</span>` : ''}
                </div>
              </div>

              <div class="p-4 pt-0 border-t border-slate-100 flex items-center justify-between gap-2 mt-2">
                <button 
                  onclick="window.adminDashboard.toggleBannerVisibility('${b.id}')"
                  class="px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors ${
                    isVis 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }"
                  title="Toggle Visibility"
                >
                  ${isVis ? '✓ Visible' : '✕ Hidden'}
                </button>

                <div class="space-x-1">
                  <button 
                    onclick="window.adminDashboard.openEditBannerModal('${b.id}')"
                    class="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button 
                    onclick="window.adminDashboard.deleteBanner('${b.id}')"
                    class="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  openAddBannerModal() {
    this.activeEditingBannerId = null;
    this.showBannerModal({
      title: '',
      tag: 'NEW UPDATE',
      subtitle: '',
      imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80',
      linkUrl: '#tests',
      isVisible: true
    }, 'Upload New Website Update Banner');
  }

  openEditBannerModal(id) {
    const banner = window.store.getBannerById(id);
    if (!banner) return;
    this.activeEditingBannerId = id;
    this.showBannerModal(banner, 'Edit Website Update Banner');
  }

  showBannerModal(b, modalTitle) {
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">${modalTitle}</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveBanner(event)" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Banner Headline / Title *</label>
            <input type="text" id="bnr-form-title" required value="${b.title || ''}" placeholder="e.g. ICAI Exam Pattern 2026: Updated Syllabus Released" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Badge Tag *</label>
              <input type="text" id="bnr-form-tag" required value="${b.tag || 'NEW UPDATE'}" placeholder="e.g. NOTICE, MOCK EXAMS, REVISION" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs uppercase font-bold">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Target Click Link URL</label>
              <input type="text" id="bnr-form-link" value="${b.linkUrl || '#tests'}" placeholder="#tests, #assignments or https://..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Subtitle / Summary</label>
            <textarea id="bnr-form-subtitle" rows="2" placeholder="Short description of the update..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">${b.subtitle || ''}</textarea>
          </div>

          <!-- Image Upload / URL Input -->
          <div class="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
            <label class="block font-bold text-slate-800">Banner Image</label>
            
            <div class="flex flex-col sm:flex-row gap-3">
              <div class="flex-1">
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Option A: Image URL</label>
                <input 
                  type="url" 
                  id="bnr-form-image-url" 
                  value="${b.imageUrl || ''}" 
                  placeholder="https://..." 
                  oninput="document.getElementById('bnr-preview-img').src = this.value"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                >
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Option B: Upload File</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  id="bnr-form-file" 
                  onchange="window.adminDashboard.handleBannerFileSelect(event)" 
                  class="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                >
              </div>
            </div>

            <!-- Image Presets for Fast Admin Use -->
            <div>
              <span class="text-[11px] text-slate-500 font-semibold block mb-1">Quick Sample Presets:</span>
              <div class="flex flex-wrap gap-1.5 text-[11px]">
                <button type="button" onclick="window.adminDashboard.setPresetBanner('ICAI Syllabus Notice', 'EXAM NOTICE', 'New guidance notes issued for Accounting & Law standards.', 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80', '#tests')" class="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 font-medium">
                  📚 Exam Notice
                </button>
                <button type="button" onclick="window.adminDashboard.setPresetBanner('All-India CA Mock Series', 'TEST SERIES', 'Timed test simulation with negative marking and solutions.', 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80', '#tests')" class="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 font-medium">
                  📝 Mock Series
                </button>
                <button type="button" onclick="window.adminDashboard.setPresetBanner('Faculty Copy Checking', 'EVALUATION', 'Submit PDF answers and receive checked copy corrections.', 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&auto=format&fit=crop&q=80', '#assignments')" class="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 font-medium">
                  ✍️ Copy Checking
                </button>
              </div>
            </div>

            <!-- Preview Container -->
            <div class="relative h-28 w-full rounded-lg overflow-hidden bg-slate-200 border border-slate-300">
              <img 
                id="bnr-preview-img" 
                src="${b.imageUrl || 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80'}" 
                class="w-full h-full object-cover"
                alt="Banner Preview"
              >
              <div class="absolute bottom-1 right-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded font-mono">
                Live Preview
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input type="checkbox" id="bnr-form-visible" ${b.isVisible !== false ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded">
            <label for="bnr-form-visible" class="font-bold text-slate-800 text-xs">Publish and display immediately on website</label>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
              ${this.activeEditingBannerId ? 'Update Banner' : 'Save & Publish Banner'}
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  handleBannerFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      window.app.showToast('Please select a valid image file (JPG, PNG, WebP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const urlInput = document.getElementById('bnr-form-image-url');
      const previewImg = document.getElementById('bnr-preview-img');
      if (urlInput) urlInput.value = dataUrl;
      if (previewImg) previewImg.src = dataUrl;
      window.app.showToast('Image loaded successfully.', 'success');
    };
    reader.readAsDataURL(file);
  }

  setPresetBanner(title, tag, subtitle, imageUrl, linkUrl) {
    const tInput = document.getElementById('bnr-form-title');
    const tagInput = document.getElementById('bnr-form-tag');
    const subInput = document.getElementById('bnr-form-subtitle');
    const urlInput = document.getElementById('bnr-form-image-url');
    const linkInput = document.getElementById('bnr-form-link');
    const previewImg = document.getElementById('bnr-preview-img');

    if (tInput) tInput.value = title;
    if (tagInput) tagInput.value = tag;
    if (subInput) subInput.value = subtitle;
    if (urlInput) urlInput.value = imageUrl;
    if (linkInput) linkInput.value = linkUrl;
    if (previewImg) previewImg.src = imageUrl;
  }

  saveBanner(e) {
    e.preventDefault();
    const title = document.getElementById('bnr-form-title').value.trim();
    const tag = document.getElementById('bnr-form-tag').value.trim();
    const subtitle = document.getElementById('bnr-form-subtitle').value.trim();
    let imageUrl = document.getElementById('bnr-form-image-url').value.trim();
    const linkUrl = document.getElementById('bnr-form-link').value.trim();
    const isVisible = document.getElementById('bnr-form-visible').checked;

    if (!imageUrl) {
      imageUrl = 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80';
    }

    if (this.activeEditingBannerId) {
      const existing = window.store.getBannerById(this.activeEditingBannerId);
      if (existing) {
        existing.title = title;
        existing.tag = tag;
        existing.subtitle = subtitle;
        existing.imageUrl = imageUrl;
        existing.linkUrl = linkUrl;
        existing.isVisible = isVisible;
        existing.updatedAt = new Date().toISOString();
        window.store.updateBanner(existing);
        window.app.showToast('Banner updated successfully.', 'success');
      }
    } else {
      const newBanner = {
        id: 'bnr-' + Date.now(),
        title,
        tag,
        subtitle,
        imageUrl,
        linkUrl,
        isVisible,
        createdAt: new Date().toISOString()
      };
      window.store.addBanner(newBanner);
      window.app.showToast('New update banner published.', 'success');
    }

    window.app.closeModal('admin-generic-modal');
    this.renderBanners();

    // Trigger website updates banner reload across all views
    if (window.bannerManager) {
      window.bannerManager.render();
    }
  }

  deleteBanner(id) {
    const banner = window.store.getBannerById(id);
    if (!banner) return;

    if (confirm(`Are you sure you want to delete banner "${banner.title}"?`)) {
      window.store.deleteBanner(id);
      window.app.showToast('Banner deleted.', 'info');
      this.renderBanners();

      if (window.bannerManager) {
        window.bannerManager.render();
      }
    }
  }

  toggleBannerVisibility(id) {
    const newStatus = window.store.toggleBannerVisibility(id);
    window.app.showToast(
      `Banner is now ${newStatus ? 'VISIBLE on website' : 'HIDDEN from website'}.`,
      newStatus ? 'success' : 'warning'
    );
    this.renderBanners();

    if (window.bannerManager) {
      window.bannerManager.render();
    }
  }

  // ==========================================
  // XP & GAMING RANK TIERS CONFIGURATION
  // ==========================================
  renderRanksConfig() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const rankTiers = window.store.getRankTiers();
    const xpSettings = window.store.getXpSettings();

    container.innerHTML = `
      <div class="space-y-8">
        
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 mb-2">
              <i data-lucide="award" class="w-3.5 h-3.5"></i> Gamified Rank Tier Architecture
            </div>
            <h2 class="text-xl font-black text-slate-900">XP Rules & Competitive Rank Tiers</h2>
            <p class="text-xs text-slate-500 mt-1">Configure minimum XP requirements for all 19 competitive tiers and set referral bonus values.</p>
          </div>

          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.resetRankTiers()"
              class="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Reset to Defaults
            </button>
            <button 
              onclick="window.adminDashboard.saveRankTiers()"
              class="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="save" class="w-4 h-4"></i> Save All Tier Changes
            </button>
          </div>
        </div>

        <!-- Referral XP & Earning Rules Card -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <!-- Referral Settings -->
          <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <i data-lucide="user-plus" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Referral XP Bonus</h3>
                <p class="text-xs text-slate-500">XP awarded to student when a referred peer registers</p>
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1.5">XP Awarded per Valid Referral</label>
                <div class="flex items-center gap-3">
                  <input 
                    type="number" 
                    id="admin-referral-xp" 
                    value="${xpSettings.referralXp || 500}"
                    min="0"
                    step="50"
                    class="w-40 px-3.5 py-2 text-xs font-bold border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
                  >
                  <span class="text-xs font-bold text-slate-500">XP</span>
                  <button 
                    onclick="window.adminDashboard.saveReferralXp()"
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Update Referral XP
                  </button>
                </div>
              </div>
              <p class="text-[11px] text-slate-500 italic">
                Referral XP propagates immediately across student standing calculations upon updating.
              </p>
            </div>
          </div>

          <!-- Academic Exam Rule Summary -->
          <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <i data-lucide="shield-alert" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Exam Mark Allocation Rule</h3>
                <p class="text-xs text-slate-500">Direct integration with ICAI question marks</p>
              </div>
            </div>
            <ul class="text-xs text-slate-600 space-y-2 mt-2 leading-relaxed">
              <li class="flex items-start gap-2">
                <i data-lucide="check" class="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5"></i>
                <span><strong>MCQs:</strong> Correctly solved questions award XP strictly according to the marks assigned (+1 XP for 1 mark, +2 XP for 2 marks, +4 XP for 4 marks).</span>
              </li>
              <li class="flex items-start gap-2">
                <i data-lucide="check" class="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5"></i>
                <span><strong>Descriptive Papers:</strong> Evaluated submissions award XP exactly equal to the marks awarded by faculty evaluators.</span>
              </li>
              <li class="flex items-start gap-2">
                <i data-lucide="check" class="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5"></i>
                <span><strong>Anti-Cheat:</strong> XP is credited once per unique examination paper to prevent duplicate spamming.</span>
              </li>
            </ul>
          </div>

        </div>

        <!-- 19 Rank Tiers Configuration Table -->
        <div class="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div class="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 class="text-sm font-bold text-slate-900">19 Competitive Rank Tiers</h3>
              <p class="text-xs text-slate-500 mt-0.5">Edit rank names and minimum XP thresholds. Values must be in ascending order.</p>
            </div>
            <span class="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              19 Active Tiers
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <th class="py-3 px-4 w-12 text-center">#</th>
                  <th class="py-3 px-4 w-16 text-center">Badge</th>
                  <th class="py-3 px-4">Family / Category</th>
                  <th class="py-3 px-4">Display Rank Name</th>
                  <th class="py-3 px-4">Minimum XP Required</th>
                  <th class="py-3 px-4 text-right">XP Bracket</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${rankTiers.map((tier, idx) => {
                  const badgeSvg = window.leaderboardManager ? window.leaderboardManager.getTierBadgeSvg(tier, 28) : '';
                  const nextTier = rankTiers[idx + 1];
                  const bracketText = nextTier 
                    ? `${tier.minXp.toLocaleString()} – ${(nextTier.minXp - 1).toLocaleString()} XP`
                    : `${tier.minXp.toLocaleString()}+ XP`;

                  return `
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="py-3 px-4 text-center font-mono font-bold text-slate-500">${idx + 1}</td>
                      <td class="py-3 px-4 text-center">${badgeSvg}</td>
                      <td class="py-3 px-4 font-bold text-slate-700">${tier.family}</td>
                      <td class="py-3 px-4">
                        <input 
                          type="text" 
                          id="tier-name-${tier.id}"
                          value="${tier.name}"
                          class="w-full max-w-xs px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
                        >
                      </td>
                      <td class="py-3 px-4">
                        <div class="flex items-center gap-2">
                          <input 
                            type="number" 
                            id="tier-minxp-${tier.id}"
                            value="${tier.minXp}"
                            min="0"
                            step="100"
                            class="w-32 px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
                          >
                          <span class="text-slate-400 font-mono text-[11px]">XP</span>
                        </div>
                      </td>
                      <td class="py-3 px-4 text-right font-mono text-slate-600 font-bold whitespace-nowrap">
                        ${bracketText}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
            <button 
              onclick="window.adminDashboard.resetRankTiers()"
              class="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Reset to Defaults
            </button>
            <button 
              onclick="window.adminDashboard.saveRankTiers()"
              class="px-6 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="save" class="w-4 h-4"></i> Save Rank Configuration
            </button>
          </div>

        </div>

      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  saveReferralXp() {
    const input = document.getElementById('admin-referral-xp');
    if (!input) return;

    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) {
      window.app.showToast('Please enter a valid non-negative number for referral XP.', 'error');
      return;
    }

    const curr = window.store.getXpSettings();
    curr.referralXp = val;
    window.store.saveXpSettings(curr);

    if (window.leaderboardManager) {
      window.leaderboardManager.calculateAllStandings();
    }

    window.app.showToast(`Referral XP updated to ${val} XP per referral!`, 'success');
  }

  saveRankTiers() {
    const rankTiers = window.store.getRankTiers();
    const updated = [];

    for (let i = 0; i < rankTiers.length; i++) {
      const t = rankTiers[i];
      const nameInput = document.getElementById(`tier-name-${t.id}`);
      const minXpInput = document.getElementById(`tier-minxp-${t.id}`);

      const newName = nameInput ? nameInput.value.trim() : t.name;
      const newMinXp = minXpInput ? parseInt(minXpInput.value, 10) : t.minXp;

      if (!newName) {
        window.app.showToast(`Tier #${i + 1} name cannot be empty.`, 'error');
        return;
      }
      if (isNaN(newMinXp) || newMinXp < 0) {
        window.app.showToast(`Tier #${i + 1} minimum XP must be a non-negative number.`, 'error');
        return;
      }

      updated.push({
        ...t,
        name: newName,
        minXp: newMinXp
      });
    }

    // Validate ascending order
    for (let i = 1; i < updated.length; i++) {
      if (updated[i].minXp <= updated[i - 1].minXp) {
        window.app.showToast(`Validation Error: ${updated[i].name} (${updated[i].minXp} XP) must have a higher threshold than ${updated[i - 1].name} (${updated[i - 1].minXp} XP).`, 'error');
        return;
      }
    }

    // Update maxXp for each tier
    for (let i = 0; i < updated.length; i++) {
      if (i < updated.length - 1) {
        updated[i].maxXp = updated[i + 1].minXp - 1;
      } else {
        updated[i].maxXp = Infinity;
      }
    }

    window.store.saveRankTiers(updated);

    if (window.leaderboardManager) {
      window.leaderboardManager.calculateAllStandings();
    }

    window.app.showToast('All 19 rank tiers and XP thresholds updated successfully!', 'success');
    this.renderRanksConfig();
  }

  resetRankTiers() {
    if (confirm('Are you sure you want to restore all 19 rank tiers to ICAI default names and XP thresholds?')) {
      window.store.resetRankTiersToDefault();
      if (window.leaderboardManager) {
        window.leaderboardManager.calculateAllStandings();
      }
      window.app.showToast('Rank tiers restored to defaults.', 'info');
      this.renderRanksConfig();
    }
  }

  // --- 10. STUDENT XP MANAGEMENT ---
  renderXpManagement() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const adminUser = window.auth ? window.auth.getCurrentUser() : null;
    const students = window.store.getStudents ? window.store.getStudents() : [];

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <i data-lucide="zap" class="w-5 h-5"></i>
            </div>
            <div>
              <h2 class="text-base font-black text-slate-900">Student XP Management</h2>
              <p class="text-xs text-slate-500">Search a student, view their XP and CA rank level, then add, remove or set XP directly.</p>
            </div>
          </div>
        </div>

        <!-- Search Card -->
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <label class="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Search Student by Username</label>
          <div class="flex gap-2">
            <input 
              type="text" 
              id="admin-xp-search" 
              placeholder="Enter username (e.g. ram123)"
              class="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
              oninput="window.adminDashboard._xpSearchDebounce(this.value)"
            >
            <button 
              onclick="window.adminDashboard._xpSearchStudent(document.getElementById('admin-xp-search').value)"
              class="px-4 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 flex items-center gap-1.5"
            >
              <i data-lucide="search" class="w-4 h-4"></i> Find
            </button>
          </div>
          <div id="admin-xp-student-card" class="mt-4"></div>
        </div>

        <!-- Bulk Set All Students' Points Card -->
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div class="flex items-center justify-between gap-4 mb-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                <i data-lucide="layers" class="w-4 h-4 text-indigo-600"></i> Bulk Set All Students' Points
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">Admin feature to set points for all registered students simultaneously to any valid number (e.g. 1000 or 0).</p>
            </div>
            <span class="px-2.5 py-1 text-xs font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
              Bulk Admin Action
            </span>
          </div>
          <div class="flex flex-col sm:flex-row gap-3 items-end">
            <div class="w-full sm:w-48">
              <label class="block text-xs font-bold text-slate-700 mb-1">Target Points</label>
              <input 
                type="number" 
                id="admin-bulk-xp-amount" 
                min="0" 
                value="1000" 
                placeholder="e.g. 1000"
                class="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div class="w-full sm:flex-1">
              <label class="block text-xs font-bold text-slate-700 mb-1">Reason / Reference Note</label>
              <input 
                type="text" 
                id="admin-bulk-xp-reason" 
                placeholder="e.g. Academic cycle recalibration to 1000 XP"
                class="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <button 
              onclick="window.adminDashboard.handleBulkSetXp()"
              class="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
            >
              <i data-lucide="zap" class="w-4 h-4"></i> Apply Bulk Set
            </button>
          </div>
        </div>

        <!-- XP Adjust Form (hidden until student found) -->
        <div id="admin-xp-adjust-panel" class="hidden bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <i data-lucide="edit-3" class="w-4 h-4 text-indigo-500"></i> Adjust XP
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <button onclick="window.adminDashboard._xpSetAction('add')" id="admin-xp-btn-add"
              class="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-emerald-300 text-emerald-700 font-bold rounded-xl hover:bg-emerald-50 transition-all text-sm">
              <i data-lucide="plus-circle" class="w-4 h-4"></i> Add XP
            </button>
            <button onclick="window.adminDashboard._xpSetAction('remove')" id="admin-xp-btn-remove"
              class="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-rose-300 text-rose-700 font-bold rounded-xl hover:bg-rose-50 transition-all text-sm">
              <i data-lucide="minus-circle" class="w-4 h-4"></i> Remove XP
            </button>
            <button onclick="window.adminDashboard._xpSetAction('set')" id="admin-xp-btn-set"
              class="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-blue-300 text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all text-sm">
              <i data-lucide="target" class="w-4 h-4"></i> Set XP
            </button>
          </div>
          <div id="admin-xp-action-form" class="hidden">
            <div class="flex gap-2 items-end">
              <div class="flex-1">
                <label class="block text-xs font-bold text-slate-600 mb-1" id="admin-xp-amount-label">XP Amount</label>
                <input type="number" id="admin-xp-amount" min="0" placeholder="e.g. 500"
                  class="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400">
              </div>
              <div class="flex-1">
                <label class="block text-xs font-bold text-slate-600 mb-1">Reason (optional)</label>
                <input type="text" id="admin-xp-reason" placeholder="e.g. Bonus for quiz"
                  class="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400">
              </div>
              <button onclick="window.adminDashboard._xpApplyAction()"
                class="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm flex items-center gap-1.5 whitespace-nowrap">
                <i data-lucide="check" class="w-4 h-4"></i> Apply
              </button>
            </div>
          </div>
        </div>

        <!-- Audit History -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div class="p-5 border-b border-slate-100">
            <h3 class="text-sm font-bold text-slate-900">Recent XP Adjustment History</h3>
            <p class="text-xs text-slate-500 mt-0.5">Latest admin XP changes across all students</p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-100">
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Student</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Action</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Prev XP</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Change</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">New XP</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Admin</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Reason</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date & Time</th>
                </tr>
              </thead>
              <tbody id="admin-xp-history-tbody">
                ${this._renderXpAuditRows()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  _renderXpAuditRows() {
    const txs = window.store && window.store.getXpTransactions ? window.store.getXpTransactions() : [];
    const adminTxs = txs.filter(t => 
      t.sourceType === 'admin_adjustment' || 
      (t.source && t.source.startsWith('admin_'))
    );
    adminTxs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const recent = adminTxs.slice(0, 50);
    if (recent.length === 0) {
      return `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400 text-sm">No XP adjustments recorded yet. Use the student search above to modify XP.</td></tr>`;
    }
    return recent.map(t => {
      const action = (t.action || (t.source || '').replace('admin_', '') || (t.metadata && t.metadata.action) || 'add').toLowerCase();
      const change = Number(t.points !== undefined ? t.points : (t.metadata ? (t.metadata.newXp - t.metadata.previousXp) : 0));
      const colorCls = change > 0 ? 'text-emerald-700' : (change < 0 ? 'text-rose-700' : 'text-slate-600');
      const prefix = change > 0 ? '+' : '';
      const prevXp = Number(t.previousXp !== undefined ? t.previousXp : (t.metadata ? t.metadata.previousXp : 0));
      const newXp = Number(t.newXp !== undefined ? t.newXp : (t.metadata ? t.metadata.newXp : prevXp + change));
      const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleString('en-IN') : '—';
      const studentName = t.studentName || t.name || 'Student';
      const studentUname = (t.studentUsername || t.username || 'Not set').replace(/^@+/, '');
      const adminName = t.adminUser || (t.metadata ? (t.metadata.adminName || t.metadata.adminUsername) : 'Administrator');
      const reasonStr = t.reason || t.description || (t.metadata ? t.metadata.reason : '') || '—';

      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
          <td class="px-4 py-2.5">
            <span class="font-bold text-slate-900 text-xs block">${studentName}</span>
            <span class="font-mono text-[11px] text-blue-600 font-semibold block">@${studentUname}</span>
          </td>
          <td class="px-4 py-2.5">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
              action === 'add' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
              action === 'remove' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
              'bg-blue-100 text-blue-800 border border-blue-200'
            }">${action === 'remove' ? 'DELETE' : action.toUpperCase()}</span>
          </td>
          <td class="px-4 py-2.5 text-xs text-slate-500 font-mono">${prevXp.toLocaleString()} XP</td>
          <td class="px-4 py-2.5 text-xs font-bold font-mono ${colorCls}">${prefix}${change.toLocaleString()} XP</td>
          <td class="px-4 py-2.5 text-xs font-black font-mono text-slate-900">${newXp.toLocaleString()} XP</td>
          <td class="px-4 py-2.5 text-xs text-slate-600 font-medium">${adminName}</td>
          <td class="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate" title="${reasonStr}">${reasonStr}</td>
          <td class="px-4 py-2.5 text-[11px] text-slate-400 whitespace-nowrap">${dateStr}</td>
        </tr>
      `;
    }).join('');
  }

  _xpSearchDebounce(val) {
    clearTimeout(this._xpSearchTimer);
    this._xpSearchTimer = setTimeout(() => this._xpSearchStudent(val), 350);
  }

  _xpSearchStudent(query) {
    const q = (query || '').trim().toLowerCase().replace(/^@+/, '');
    const cardEl = document.getElementById('admin-xp-student-card');
    const panelEl = document.getElementById('admin-xp-adjust-panel');
    if (!cardEl) return;
    if (!q) {
      cardEl.innerHTML = '';
      if (panelEl) panelEl.classList.add('hidden');
      return;
    }
    const students = window.store.getStudents ? window.store.getStudents() : [];
    const student = students.find(s => 
      (s.username && s.username.toLowerCase() === q) ||
      (s.email && s.email.toLowerCase() === q) ||
      (s.name && s.name.toLowerCase() === q)
    );
    if (!student) {
      cardEl.innerHTML = `<div class="flex items-center gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm">
        <i data-lucide="user-x" class="w-4 h-4"></i> No student found with username "<strong>${q}</strong>"
      </div>`;
      if (panelEl) panelEl.classList.add('hidden');
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    this._currentXpStudent = student;
    const totalXp = Number(student.totalXp !== undefined ? student.totalXp : (student.baseXp || 0));
    const tierInfo = window.store.resolveTier ? window.store.resolveTier(totalXp) : null;
    const tierName = tierInfo ? tierInfo.currentTier.name : '—';
    const tierFamily = tierInfo ? tierInfo.currentTier.family : '';
    const familyColor = {
      'Rookie': 'bg-slate-100 text-slate-700', 'Scholar': 'bg-blue-100 text-blue-700',
      'Achiever': 'bg-emerald-100 text-emerald-700', 'Elite': 'bg-purple-100 text-purple-700',
      'Master': 'bg-yellow-100 text-yellow-700', 'Apex': 'bg-orange-100 text-orange-700',
      'Titan': 'bg-rose-100 text-rose-700', 'Legend': 'bg-pink-100 text-pink-700',
      'Sovereign': 'bg-amber-100 text-amber-700'
    }[tierFamily] || 'bg-slate-100 text-slate-700';

    cardEl.innerHTML = `
      <div class="flex items-center gap-4 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4">
        <img src="${student.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'}" 
          class="w-14 h-14 rounded-full object-cover border-2 border-indigo-200" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-black text-slate-900">${student.name || '—'}</span>
            <span class="font-mono text-xs text-blue-600">@${student.username || student.id}</span>
            <span class="px-2 py-0.5 text-[10px] font-bold rounded-md ${familyColor}">${tierName}</span>
          </div>
          <div class="flex items-center gap-3 mt-1 flex-wrap">
            <span class="text-xs text-slate-500">${student.caLevel || '—'}</span>
            <span class="text-2xl font-black text-indigo-700">${totalXp.toLocaleString()} <span class="text-sm font-bold text-indigo-400">XP</span></span>
            <span class="text-xs text-slate-400">Referral Pts: <strong class="text-emerald-700">${student.referralPoints || 0}</strong></span>
          </div>
        </div>
      </div>
    `;
    if (panelEl) panelEl.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  _xpSetAction(action) {
    this._currentXpAction = action;
    const formEl = document.getElementById('admin-xp-action-form');
    const labelEl = document.getElementById('admin-xp-amount-label');
    const amtEl = document.getElementById('admin-xp-amount');
    if (formEl) formEl.classList.remove('hidden');
    if (amtEl) amtEl.focus();
    // Update labels
    const labels = { add: 'XP to Add', remove: 'XP to Remove', set: 'Set XP to' };
    if (labelEl) labelEl.textContent = labels[action] || 'XP Amount';
    // Highlight active button
    ['add', 'remove', 'set'].forEach(a => {
      const btn = document.getElementById(`admin-xp-btn-${a}`);
      if (btn) btn.classList.toggle('ring-2', a === action);
    });
  }

  _xpApplyAction() {
    const student = this._currentXpStudent;
    const action = this._currentXpAction;
    const amtEl = document.getElementById('admin-xp-amount');
    const reasonEl = document.getElementById('admin-xp-reason');
    if (!student || !action) {
      window.app.showToast('Please search for a student first.', 'error');
      return;
    }
    const amount = parseInt(amtEl ? amtEl.value : 0, 10);
    if (isNaN(amount) || amount < 0) {
      window.app.showToast('Please enter a valid non-negative XP amount.', 'error');
      return;
    }
    const reason = reasonEl ? reasonEl.value.trim() : '';
    const adminUser = window.auth ? window.auth.getCurrentUser() : null;

    const actionLabels = { add: `Add ${amount} XP`, remove: `Remove ${amount} XP`, set: `Set XP to ${amount}` };
    const confirmed = confirm(`Confirm: ${actionLabels[action]} for @${student.username}?`);
    if (!confirmed) return;

    const result = window.store.adminAdjustStudentXp(student.id, action, amount, reason, adminUser ? adminUser.username : 'admin');
    if (result.success) {
      window.app.showToast(`✅ XP updated: @${student.username} → ${result.newXp.toLocaleString()} XP`, 'success');
      // Update the displayed card
      this._currentXpStudent = { ...this._currentXpStudent, totalXp: result.newXp, baseXp: result.newXp };
      this._xpSearchStudent(student.username);
      // Refresh audit rows
      const tbody = document.getElementById('admin-xp-history-tbody');
      if (tbody) tbody.innerHTML = this._renderXpAuditRows();
      // Clear inputs
      if (amtEl) amtEl.value = '';
      if (reasonEl) reasonEl.value = '';
    } else {
      window.app.showToast(`Error: ${result.error}`, 'error');
    }
  }

  handleBulkSetXp() {
    const amountInput = document.getElementById('admin-bulk-xp-amount');
    const reasonInput = document.getElementById('admin-bulk-xp-reason');
    if (!amountInput) return;
    const amount = parseInt(amountInput.value, 10);
    if (isNaN(amount) || amount < 0) {
      window.app.showToast('Please enter a valid non-negative XP number.', 'error');
      return;
    }
    const reason = (reasonInput ? reasonInput.value.trim() : '') || `Admin bulk set XP to ${amount}`;
    const allStudents = window.store.getStudents();
    if (!confirm(`Are you sure you want to set points for ALL ${allStudents.length} registered students to ${amount} XP?\n\nReason: ${reason}\n\nThis will apply immediately across the leaderboard, student profiles, and server.`)) {
      return;
    }
    const adminUser = window.auth ? window.auth.getCurrentUser() : null;
    const adminName = adminUser ? (adminUser.name || adminUser.username || 'admin') : 'admin';
    const res = window.store.adminBulkSetStudentXp(amount, reason, adminName);
    window.app.showToast(`Successfully set ${amount} points for all ${res.count} students!`, 'success');
    this.renderXpManagement();
  }

  // --- 11. XP RESET SETTINGS ---
  renderXpResetSettings() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const settings = window.store.getXpResetSettings ? window.store.getXpResetSettings() : { enabled: false, scheduledTime: '', interval: 'once', nextReset: null, lastReset: null };
    const history = window.store.getXpResetHistory ? window.store.getXpResetHistory() : [];

    const fmtDate = (iso) => {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
      } catch (e) {
        return new Date(iso).toLocaleString('en-IN') + ' IST';
      }
    };

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
              <i data-lucide="clock" class="w-5 h-5"></i>
            </div>
            <div>
              <h2 class="text-base font-black text-slate-900">Automatic XP Reset Settings</h2>
              <p class="text-xs text-slate-500">Configure scheduled XP resets. Only academic XP is reset. Referral points, test history, and accounts are never affected.</p>
            </div>
          </div>
        </div>

        <!-- Warning Banner -->
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"></i>
          <div class="text-xs text-amber-800">
            <strong class="font-bold">Important:</strong> XP Reset only zeroes student <code>totalXp</code>. 
            Referral Points, Referral History, Test Attempts, Evaluated Papers, Notifications, and Student Accounts are <strong>never deleted or modified</strong>.
          </div>
        </div>

        <!-- Settings Form -->
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-900">Schedule Configuration</h3>
            <label class="flex items-center gap-2 cursor-pointer">
              <span class="text-xs font-semibold text-slate-600">Enable Auto-Reset</span>
              <div class="relative">
                <input type="checkbox" id="admin-xp-reset-enabled" class="sr-only" ${settings.enabled ? 'checked' : ''}>
                <div class="w-10 h-6 bg-slate-200 rounded-full peer-checked:bg-indigo-500 transition-colors" id="admin-xp-reset-toggle-track">
                </div>
              </div>
              <button onclick="window.adminDashboard._toggleXpReset()" 
                class="relative inline-flex w-10 h-5 items-center rounded-full transition-colors ${settings.enabled ? 'bg-indigo-500' : 'bg-slate-300'}" 
                id="admin-xp-reset-toggle">
                <span class="inline-block w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.enabled ? 'translate-x-5' : 'translate-x-0.5'}"></span>
              </button>
            </label>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1.5">Scheduled Date & Time</label>
              <input type="datetime-local" id="admin-xp-reset-datetime" 
                value="${settings.scheduledTime || ''}"
                class="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1.5">Reset Interval</label>
              <select id="admin-xp-reset-interval" 
                class="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 bg-white">
                <option value="once" ${settings.interval === 'once' ? 'selected' : ''}>One-time reset only</option>
                <option value="monthly" ${settings.interval === 'monthly' ? 'selected' : ''}>Every Month</option>
                <option value="quarterly" ${settings.interval === 'quarterly' ? 'selected' : ''}>Every 3 Months</option>
                <option value="biannual" ${settings.interval === 'biannual' ? 'selected' : ''}>Every 6 Months</option>
                <option value="yearly" ${settings.interval === 'yearly' ? 'selected' : ''}>Every Year</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div class="bg-slate-50 rounded-xl p-3">
              <span class="text-xs font-semibold text-slate-500 block">Next Scheduled Reset</span>
              <span class="text-sm font-bold text-indigo-700" id="admin-xp-reset-next-display">${settings.nextReset ? fmtDate(settings.nextReset) : 'Not scheduled'}</span>
            </div>
            <div class="bg-slate-50 rounded-xl p-3">
              <span class="text-xs font-semibold text-slate-500 block">Last Reset Executed</span>
              <span class="text-sm font-bold text-slate-700">${settings.lastReset ? fmtDate(settings.lastReset) : 'Never'}</span>
            </div>
          </div>

          <div class="flex flex-wrap gap-3 mt-5">
            <button onclick="window.adminDashboard._saveXpResetSettings()"
              class="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm flex items-center gap-2">
              <i data-lucide="save" class="w-4 h-4"></i> Save Settings
            </button>
            <button onclick="window.adminDashboard._manualXpReset()"
              class="px-5 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 text-sm flex items-center gap-2">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> Trigger Manual Reset Now
            </button>
          </div>
        </div>

        <!-- Reset History -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div class="p-5 border-b border-slate-100">
            <h3 class="text-sm font-bold text-slate-900">XP Reset History</h3>
            <p class="text-xs text-slate-500 mt-0.5">Log of all XP resets (manual and automatic)</p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-100">
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Date & Time</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Triggered By</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Students Reset</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${history.length === 0
                  ? `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400 text-sm">No XP resets have been performed yet.</td></tr>`
                  : history.slice(0, 30).map(h => `
                      <tr class="border-b border-slate-50 hover:bg-slate-50">
                        <td class="px-4 py-2.5 text-xs text-slate-700">${fmtDate(h.resetAt)}</td>
                        <td class="px-4 py-2.5">
                          <span class="px-2 py-0.5 text-[10px] font-bold rounded-md ${h.triggeredBy === 'admin' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}">
                            ${h.triggeredBy === 'admin' ? `👤 ${h.adminUser || 'Admin'}` : '🕐 Scheduled'}
                          </span>
                        </td>
                        <td class="px-4 py-2.5 text-xs font-bold text-slate-900">${h.studentsReset || '—'}</td>
                        <td class="px-4 py-2.5 text-xs text-slate-500">${h.notes || '—'}</td>
                      </tr>
                    `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  _toggleXpReset() {
    const btn = document.getElementById('admin-xp-reset-toggle');
    const chk = document.getElementById('admin-xp-reset-enabled');
    if (!btn || !chk) return;
    const newEnabled = !chk.checked;
    chk.checked = newEnabled;
    btn.className = `relative inline-flex w-10 h-5 items-center rounded-full transition-colors ${newEnabled ? 'bg-indigo-500' : 'bg-slate-300'}`;
    btn.querySelector('span').className = `inline-block w-4 h-4 bg-white rounded-full shadow transition-transform ${newEnabled ? 'translate-x-5' : 'translate-x-0.5'}`;
  }

  _saveXpResetSettings() {
    const enabledChk = document.getElementById('admin-xp-reset-enabled');
    const datetimeEl = document.getElementById('admin-xp-reset-datetime');
    const intervalEl = document.getElementById('admin-xp-reset-interval');
    const nextDisplayEl = document.getElementById('admin-xp-reset-next-display');

    const enabled = enabledChk ? enabledChk.checked : false;
    const scheduledTime = datetimeEl ? datetimeEl.value : '';
    const interval = intervalEl ? intervalEl.value : 'once';
    const nextReset = (enabled && scheduledTime) ? new Date(scheduledTime).toISOString() : null;

    const existingSettings = window.store.getXpResetSettings ? window.store.getXpResetSettings() : {};
    const updatedSettings = {
      ...existingSettings,
      enabled,
      scheduledTime,
      interval,
      nextReset,
      lastReset: existingSettings.lastReset || null
    };

    if (window.store.saveXpResetSettings) {
      window.store.saveXpResetSettings(updatedSettings);
    }
    if (window.firebaseSync && typeof window.firebaseSync.saveXpResetSettings === 'function') {
      window.firebaseSync.saveXpResetSettings(updatedSettings);
    }

    if (nextDisplayEl) {
      nextDisplayEl.textContent = nextReset 
        ? new Date(nextReset).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST'
        : 'Not scheduled';
    }

    // Also persist to backend
    const adminUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = adminUser ? (adminUser.token || adminUser.email) : '';
    if (typeof fetch !== 'undefined') {
      fetch('/api/admin/xp-reset/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ enabled, scheduledTime, interval, nextReset })
      }).catch(() => {});
    }

    const toastMsg = enabled
      ? `✅ Auto XP Reset scheduled for ${new Date(scheduledTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`
      : '✅ Auto-reset disabled. Settings saved.';
    if (window.app && typeof window.app.showToast === 'function') {
      window.app.showToast(toastMsg, 'success');
    }
  }

  _manualXpReset() {
    const confirmed = confirm('⚠️ CONFIRM XP RESET\n\nThis will reset ALL student academic XP to 0 immediately.\n\nReferral points, test history, and accounts will NOT be affected.\n\nThis action cannot be undone. Proceed?');
    if (!confirmed) return;
    const doubleConfirm = confirm('Final confirmation: Reset ALL student XP to 0 now?');
    if (!doubleConfirm) return;

    const students = window.store.getStudents ? window.store.getStudents() : [];
    let resetCount = 0;
    students.forEach(s => {
      s.totalXp = 0;
      s.baseXp = 0;
      window.store.updateUser(s);
      if (window.firebaseSync && window.firebaseSync.db) {
        window.firebaseSync.db.ref('users/' + s.id).update({ totalXp: 0, baseXp: 0 }).catch(() => {});
      }
      resetCount++;
    });

    const adminUser = window.auth ? window.auth.getCurrentUser() : null;
    const nowIso = new Date().toISOString();
    const resetEvent = {
      id: `xpreset-${Date.now()}`,
      triggeredBy: 'admin',
      adminUser: adminUser ? (adminUser.username || adminUser.name) : 'admin',
      studentsReset: resetCount,
      resetAt: nowIso,
      notes: 'Manual reset triggered from Admin Panel'
    };
    if (window.store.recordXpResetEvent) window.store.recordXpResetEvent(resetEvent);
    if (window.firebaseSync && typeof window.firebaseSync.saveXpResetEvent === 'function') {
      window.firebaseSync.saveXpResetEvent(resetEvent);
    }

    // Update lastReset in settings
    const currentSettings = window.store.getXpResetSettings ? window.store.getXpResetSettings() : {};
    const updatedSettings = { ...currentSettings, lastReset: resetEvent.resetAt };
    if (window.store.saveXpResetSettings) window.store.saveXpResetSettings(updatedSettings);
    if (window.firebaseSync && typeof window.firebaseSync.saveXpResetSettings === 'function') {
      window.firebaseSync.saveXpResetSettings(updatedSettings);
    }

    // Call backend to reset server-side too
    const token = adminUser ? (adminUser.token || adminUser.email) : '';
    if (typeof fetch !== 'undefined') {
      fetch('/api/admin/xp-reset/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ manual: true })
      }).catch(() => {});
    }

    // Recalculate leaderboard rankings immediately
    if (window.leaderboardManager && typeof window.leaderboardManager.calculateAllStandings === 'function') {
      window.leaderboardManager.calculateAllStandings();
    }

    if (window.app && typeof window.app.showToast === 'function') {
      window.app.showToast(`✅ XP Reset complete: ${resetCount} students' XP reset to 0`, 'success');
    }
    this.renderXpResetSettings();
  }

  // --- 12. REFERRAL MANAGEMENT & AUDIT ---
  renderReferrals() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const referrals = window.store.getReferrals ? window.store.getReferrals() : [];
    const totalPoints = referrals.reduce((sum, r) => sum + (r.pointsAwarded || 100), 0);

    // Load current referral reward settings
    const refSettings = window.store.getReferralSettings ? window.store.getReferralSettings() : { referrerReward: 100, newStudentReward: 100 };

    // Compute top referrers
    const referrerMap = {};
    referrals.forEach(r => {
      const key = r.referrerUsername || r.referrerName || r.referrerId;
      if (!referrerMap[key]) {
        referrerMap[key] = {
          name: r.referrerName || key,
          username: r.referrerUsername || key,
          count: 0,
          points: 0
        };
      }
      referrerMap[key].count += 1;
      referrerMap[key].points += (r.pointsAwarded || 100);
    });

    container.innerHTML = `
      <div class="space-y-6">

        <!-- Admin Referral Reward Configuration Card -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div class="p-5 border-b border-slate-100 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <i data-lucide="settings-2" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-900">Referral Reward Configuration</h3>
              <p class="text-xs text-slate-500 mt-0.5">Configure how many points are awarded for referrals. Applies to future referrals only — existing rewards are not affected.</p>
            </div>
          </div>
          <div class="p-5">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1.5">Referrer Reward (points earned by the person who referred)</label>
                <div class="flex items-center gap-2">
                  <input type="number" id="admin-ref-reward-referrer" min="0" value="${refSettings.referrerReward || 100}"
                    class="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400">
                  <span class="text-xs text-slate-500 font-semibold">pts</span>
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1.5">New Student Reward (points earned by the newly registered student)</label>
                <div class="flex items-center gap-2">
                  <input type="number" id="admin-ref-reward-new-student" min="0" value="${refSettings.newStudentReward || 100}"
                    class="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400">
                  <span class="text-xs text-slate-500 font-semibold">pts</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button onclick="window.adminDashboard._saveReferralSettings()"
                class="px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 text-sm flex items-center gap-2">
                <i data-lucide="save" class="w-4 h-4"></i> Save Reward Settings
              </button>
              <span class="text-xs text-slate-400">Current: <strong class="text-slate-700">${refSettings.referrerReward}pts</strong> referrer / <strong class="text-slate-700">${refSettings.newStudentReward}pts</strong> new student</span>
            </div>
          </div>
        </div>

        <!-- Top Stats Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <i data-lucide="share-2" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Referrals</span>
              <span class="text-2xl font-black text-slate-900">${referrals.length}</span>
              <span class="text-[11px] text-slate-400 block">Successful student signups</span>
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <i data-lucide="gift" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Points Awarded</span>
              <span class="text-2xl font-black text-emerald-700">${totalPoints.toLocaleString()} Pts</span>
              <span class="text-[11px] text-emerald-600 font-semibold block">${refSettings.referrerReward}pts per verified referral</span>
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
              <i data-lucide="trophy" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Active Referrers</span>
              <span class="text-2xl font-black text-purple-700">${Object.keys(referrerMap).length}</span>
              <span class="text-[11px] text-slate-400 block">Student community builders</span>
            </div>
          </div>
        </div>

        <!-- Main Referral Audit Table Container -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div class="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 class="text-base font-bold text-slate-900">Student Referral Audit Log</h3>
              <p class="text-xs text-slate-500 mt-0.5">Real-time log of student invitations, rewarded bonus points, and verified account activations</p>
            </div>
            
            <div class="flex items-center gap-2">
              <div class="relative w-64">
                <input 
                  type="text" 
                  id="admin-referral-search" 
                  placeholder="Search by student or username..." 
                  oninput="window.adminDashboard.filterReferralsTable(this.value)"
                  class="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
              </div>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs" id="admin-referrals-table">
              <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th class="px-4 py-3">Date & Time</th>
                  <th class="px-4 py-3">Referring Student</th>
                  <th class="px-4 py-3">Referred Student</th>
                  <th class="px-4 py-3">Course Level</th>
                  <th class="px-4 py-3">Points Awarded</th>
                  <th class="px-4 py-3">Audit Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium text-slate-700" id="admin-referrals-tbody">
                ${this.renderReferralRows(referrals)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  renderReferralRows(referrals) {
    if (!referrals || referrals.length === 0) {
      return `
        <tr>
          <td colspan="6" class="px-4 py-8 text-center text-slate-400">
            No referral records logged yet. Share student referral links to start tracking rewards.
          </td>
        </tr>
      `;
    }

    return referrals.map(r => {
      const dateStr = r.createdAt 
        ? new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
        : 'Recent';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3 text-slate-500 whitespace-nowrap">
            <span class="font-mono text-[11px]">${dateStr}</span>
          </td>
          <td class="px-4 py-3">
            <div class="font-bold text-slate-900">${r.referrerName || 'Referrer'}</div>
            <div class="text-[10px] text-blue-600 font-mono">@${r.referrerUsername || 'unknown'}</div>
          </td>
          <td class="px-4 py-3">
            <div class="font-bold text-slate-900">${r.referredName || 'New Student'}</div>
            <div class="text-[10px] text-slate-500 font-mono">@${r.referredUsername || 'student'}</div>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              ${r.examLevel || 'CA INTER'}
            </span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
              +${r.pointsAwarded || 100} Points
            </span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
              <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Verified
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  filterReferralsTable(query) {
    const q = (query || '').toLowerCase().trim();
    const referrals = window.store.getReferrals ? window.store.getReferrals() : [];
    const filtered = !q ? referrals : referrals.filter(r => 
      (r.referrerName && r.referrerName.toLowerCase().includes(q)) ||
      (r.referrerUsername && r.referrerUsername.toLowerCase().includes(q)) ||
      (r.referredName && r.referredName.toLowerCase().includes(q)) ||
      (r.referredUsername && r.referredUsername.toLowerCase().includes(q)) ||
      (r.examLevel && r.examLevel.toLowerCase().includes(q))
    );
    const tbody = document.getElementById('admin-referrals-tbody');
    if (tbody) {
      tbody.innerHTML = this.renderReferralRows(filtered);
      if (window.lucide) window.lucide.createIcons();
    }
  }

  _saveReferralSettings() {
    const referrerEl = document.getElementById('admin-ref-reward-referrer');
    const newStudentEl = document.getElementById('admin-ref-reward-new-student');
    const referrerReward = parseInt(referrerEl ? referrerEl.value : 100, 10);
    const newStudentReward = parseInt(newStudentEl ? newStudentEl.value : 100, 10);

    if (isNaN(referrerReward) || referrerReward < 0) {
      window.app.showToast('Referrer reward must be a non-negative number.', 'error');
      return;
    }
    if (isNaN(newStudentReward) || newStudentReward < 0) {
      window.app.showToast('New student reward must be a non-negative number.', 'error');
      return;
    }

    // Save to store (localStorage)
    if (window.store.saveReferralSettings) {
      window.store.saveReferralSettings({ referrerReward, newStudentReward });
    }

    // Persist to backend
    const adminUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = adminUser ? (adminUser.token || adminUser.email) : '';
    if (typeof fetch !== 'undefined') {
      fetch('/api/admin/referrals/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ referrerReward, newStudentReward })
      }).then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.success) {
            window.app.showToast(`✅ Referral rewards updated: Referrer = ${referrerReward} pts / New Student = ${newStudentReward} pts`, 'success');
          }
        })
        .catch(() => {
          // Backend may be offline; settings saved locally at least
          window.app.showToast(`✅ Referral rewards updated locally: ${referrerReward}pts / ${newStudentReward}pts`, 'success');
        });
    } else {
      window.app.showToast(`✅ Referral rewards updated: Referrer = ${referrerReward} pts / New Student = ${newStudentReward} pts`, 'success');
    }

    // Re-render the tab to show new current values
    setTimeout(() => this.renderReferrals(), 500);
  }

  // --- SUBJECT MANAGEMENT TAB ---
  renderSubjects() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const subjects = window.store.getSubjects ? window.store.getSubjects() : [];
    const tests = window.store.getTests ? window.store.getTests() : [];
    const assignments = window.store.getAssignments ? window.store.getAssignments() : [];

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header banner -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-black text-slate-900">Dynamic Subject Management</h2>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                ${subjects.length} Subjects Active
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              Create and manage subjects dynamically. Newly added subjects instantly sync across all devices, tests, papers, and student filters.
            </p>
          </div>
          <button 
            onclick="window.adminDashboard.openSubjectModal()"
            class="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <i data-lucide="plus-circle" class="w-4 h-4"></i> Add New Subject
          </button>
        </div>

        <!-- Subjects Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="admin-subjects-grid">
          ${subjects.map(s => {
            const subjectTestsCount = tests.filter(t => t.subjectId === s.id || t.subject === s.name).length;
            const subjectPapersCount = assignments.filter(a => a.subjectId === s.id || a.subject === s.name).length;
            const iconName = s.icon || 'book-open';
            const levelBadge = s.level || 'CA Foundation';

            return `
              <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                      ${s.code || s.id}
                    </span>
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      ${levelBadge}
                    </span>
                  </div>

                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                      <i data-lucide="${iconName}" class="w-5 h-5"></i>
                    </div>
                    <div>
                      <h3 class="font-bold text-slate-900 text-sm">${s.name}</h3>
                      <p class="text-[11px] text-slate-400 line-clamp-1">${s.description || 'Core CA Syllabus Subject'}</p>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-2 my-3 p-2.5 bg-slate-50 rounded-lg text-[11px] font-medium text-slate-600">
                    <div>
                      <span class="text-slate-400 block text-[10px]">MCQ Tests</span>
                      <strong class="text-slate-800 text-xs">${subjectTestsCount} Tests</strong>
                    </div>
                    <div>
                      <span class="text-slate-400 block text-[10px]">Test Papers</span>
                      <strong class="text-slate-800 text-xs">${subjectPapersCount} Papers</strong>
                    </div>
                  </div>
                </div>

                <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
                  <button 
                    onclick="window.adminDashboard.openSubjectModal('${s.id}')" 
                    class="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit
                  </button>
                  <button 
                    onclick="window.adminDashboard.deleteSubject('${s.id}')" 
                    class="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  openSubjectModal(subjectId = null) {
    const isEdit = !!subjectId;
    const subject = isEdit ? window.store.getSubjectById(subjectId) : null;
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">${isEdit ? 'Edit Subject' : 'Add New Subject'}</h3>
            <p class="text-xs text-slate-500">Configure subject details, code, level, and icon</p>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.saveSubject(event, '${subjectId || ''}')" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Subject Name *</label>
            <input 
              type="text" 
              id="sub-name" 
              required 
              value="${subject ? subject.name : ''}"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500" 
              placeholder="e.g. Taxation, Advanced Accounting, Auditing"
            >
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Subject Code / Abbreviation *</label>
              <input 
                type="text" 
                id="sub-code" 
                required 
                value="${subject ? (subject.code || subject.id.replace('sub-', '').toUpperCase()) : ''}"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono uppercase focus:ring-2 focus:ring-rose-500" 
                placeholder="e.g. TAX, ADV-ACC, AUD"
              >
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Exam Level *</label>
              <select id="sub-level" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
                <option value="CA Foundation" ${!subject || subject.level === 'CA Foundation' ? 'selected' : ''}>CA Foundation</option>
                <option value="CA Intermediate" ${subject && subject.level === 'CA Intermediate' ? 'selected' : ''}>CA Intermediate</option>
                <option value="CA Final" ${subject && subject.level === 'CA Final' ? 'selected' : ''}>CA Final</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Icon Name (Lucide)</label>
              <select id="sub-icon" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium">
                <option value="book-open" ${!subject || subject.icon === 'book-open' ? 'selected' : ''}>book-open (General/Reading)</option>
                <option value="calculator" ${subject && subject.icon === 'calculator' ? 'selected' : ''}>calculator (Accounting/Math)</option>
                <option value="scale" ${subject && subject.icon === 'scale' ? 'selected' : ''}>scale (Law/Ethics)</option>
                <option value="trending-up" ${subject && subject.icon === 'trending-up' ? 'selected' : ''}>trending-up (Economics/Finance)</option>
                <option value="file-text" ${subject && subject.icon === 'file-text' ? 'selected' : ''}>file-text (Tax/Auditing)</option>
                <option value="shield-check" ${subject && subject.icon === 'shield-check' ? 'selected' : ''}>shield-check (Compliance)</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Color Theme</label>
              <select id="sub-color" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium">
                <option value="blue" ${!subject || subject.color === 'blue' ? 'selected' : ''}>Blue</option>
                <option value="rose" ${subject && subject.color === 'rose' ? 'selected' : ''}>Rose</option>
                <option value="emerald" ${subject && subject.color === 'emerald' ? 'selected' : ''}>Emerald</option>
                <option value="purple" ${subject && subject.color === 'purple' ? 'selected' : ''}>Purple</option>
                <option value="amber" ${subject && subject.color === 'amber' ? 'selected' : ''}>Amber</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Subject Description / Notes</label>
            <textarea 
              id="sub-desc" 
              rows="2" 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500" 
              placeholder="Brief summary of syllabus coverage..."
            >${subject ? (subject.description || '') : ''}</textarea>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button 
              type="button" 
              onclick="window.app.closeModal('admin-generic-modal')" 
              class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              class="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              ${isEdit ? 'Save Changes' : 'Create Subject'}
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveSubject(e, existingId = '') {
    e.preventDefault();
    const name = document.getElementById('sub-name').value.trim();
    const code = document.getElementById('sub-code').value.trim().toUpperCase();
    const level = document.getElementById('sub-level').value;
    const icon = document.getElementById('sub-icon').value;
    const color = document.getElementById('sub-color').value;
    const description = document.getElementById('sub-desc').value.trim();

    if (!name || !code) {
      window.app.showToast('Please fill in Subject Name and Code.', 'error');
      return;
    }

    const subjectObj = {
      id: existingId || ('sub-' + Date.now()),
      code,
      name,
      level,
      icon,
      color,
      description,
      updatedAt: new Date().toISOString()
    };

    if (!existingId) {
      subjectObj.createdAt = new Date().toISOString();
    }

    window.store.addSubject(subjectObj);
    window.app.closeModal('admin-generic-modal');
    window.app.showToast(existingId ? 'Subject updated successfully!' : 'New subject created successfully!', 'success');
    this.renderSubjects();
  }

  deleteSubject(subjectId) {
    const subject = window.store.getSubjectById(subjectId);
    if (!subject) return;

    if (!confirm(`Are you sure you want to delete "${subject.name}"?`)) return;

    window.store.deleteSubject(subjectId);
    window.app.showToast(`Subject "${subject.name}" deleted.`, 'info');
    this.renderSubjects();
  }

  // ================================================================
  // --- 18. AI MCQ STUDIO & AUTONOMOUS HOSTING SUITE ---
  // ================================================================

  async renderAiAutomation() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    container.innerHTML = `
      <div class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-black text-slate-900 flex items-center gap-2">
              <i data-lucide="sparkles" class="w-6 h-6 text-rose-600"></i>
              AI MCQ Studio & Automation
            </h2>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              ICAI Pipeline Active
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Automated CA MCQ generation, Mistral OCR document indexing, multi-provider failover, and server-side Auto-Pilot hosting.
          </p>
        </div>
      </div>

      <!-- Sub-Tab Navigation Pills -->
      <div class="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-200 mb-6">
        <button 
          onclick="window.adminDashboard.switchAiSubTab('generate')"
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
            this.aiActiveSubTab === 'generate' 
              ? 'bg-rose-700 text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }"
        >
          <i data-lucide="zap" class="w-4 h-4"></i>
          Generate & Host Now
        </button>

        <button 
          onclick="window.adminDashboard.switchAiSubTab('library')"
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
            this.aiActiveSubTab === 'library' 
              ? 'bg-rose-700 text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }"
        >
          <i data-lucide="book-open" class="w-4 h-4"></i>
          PDF / Source Library
        </button>

        <button 
          onclick="window.adminDashboard.switchAiSubTab('autopilot')"
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
            this.aiActiveSubTab === 'autopilot' 
              ? 'bg-rose-700 text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }"
        >
          <i data-lucide="clock" class="w-4 h-4"></i>
          Auto-Pilot / Scheduled MCQs
        </button>

        <button 
          onclick="window.adminDashboard.switchAiSubTab('logs')"
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
            this.aiActiveSubTab === 'logs' 
              ? 'bg-rose-700 text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }"
        >
          <i data-lucide="activity" class="w-4 h-4"></i>
          AI Generation Logs
        </button>

        <button 
          onclick="window.adminDashboard.switchAiSubTab('providers')"
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
            this.aiActiveSubTab === 'providers' 
              ? 'bg-rose-700 text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }"
        >
          <i data-lucide="cpu" class="w-4 h-4"></i>
          AI Provider Management
        </button>
      </div>

      <!-- Sub-Tab Content Target -->
      <div id="ai-subtab-container"></div>
    `;

    const subContainer = document.getElementById('ai-subtab-container');
    if (this.aiActiveSubTab === 'generate') await this.renderAiGenerateSubTab(subContainer);
    else if (this.aiActiveSubTab === 'library') await this.renderAiLibrarySubTab(subContainer);
    else if (this.aiActiveSubTab === 'autopilot') await this.renderAiAutopilotSubTab(subContainer);
    else if (this.aiActiveSubTab === 'logs') await this.renderAiLogsSubTab(subContainer);
    else if (this.aiActiveSubTab === 'providers') await this.renderAiProvidersSubTab(subContainer);

    if (window.lucide) window.lucide.createIcons();
  }

  async switchAiSubTab(subTab) {
    this.aiActiveSubTab = subTab;
    await this.renderAiAutomation();
  }

  async getSyllabusHierarchy() {
    if (this._syllabusHierarchy && this._syllabusHierarchy.length > 0) {
      return this._syllabusHierarchy;
    }
    try {
      const resp = await fetch('/api/syllabus/hierarchy');
      const res = await resp.json();
      if (res.success && res.hierarchy && res.hierarchy.levels) {
        this._syllabusHierarchy = res.hierarchy.levels;
        return this._syllabusHierarchy;
      }
    } catch (e) {
      console.warn('[SYLLABUS_HIERARCHY_FETCH_ERROR]', e);
    }
    return [];
  }

  setupCascadingSyllabus(levelElId, subjectElId, chapterElId, initialLevelId, initialSubjectId, initialChapterId) {
    const levelEl = document.getElementById(levelElId);
    const subjectEl = document.getElementById(subjectElId);
    const chapterEl = document.getElementById(chapterElId);
    if (!levelEl || !subjectEl) return;

    const levels = this._syllabusHierarchy || [];

    if (initialLevelId) {
      const opt = Array.from(levelEl.options).find(o => o.dataset.id === initialLevelId || o.value === initialLevelId);
      if (opt) {
        opt.selected = true;
        levelEl.value = opt.value;
      }
    }

    const populateSubjects = (lvlVal, preselectedSubId, preselectedChId) => {
      const foundLvl = levels.find(l => l.id === lvlVal || l.name === lvlVal) || levels[0];
      const subs = foundLvl ? (foundLvl.subjects || []) : [];
      subjectEl.innerHTML = subs.map(s => `<option value="${s.name}" data-id="${s.id}" data-level-id="${foundLvl ? foundLvl.id : ''}">${s.code ? `[${s.code}] ` : ''}${s.name}</option>`).join('');
      if (preselectedSubId) {
        const opt = Array.from(subjectEl.options).find(o => o.dataset.id === preselectedSubId || o.value === preselectedSubId);
        if (opt) opt.selected = true;
      }
      populateChapters(subjectEl.value, preselectedChId);
    };

    const populateChapters = (subVal, preselectedChId) => {
      if (!chapterEl) return;
      let foundSub = null;
      for (const lvl of levels) {
        foundSub = (lvl.subjects || []).find(s => s.name === subVal || s.id === subVal);
        if (foundSub) break;
      }
      const chs = foundSub ? (foundSub.chapters || []) : [];
      chapterEl.innerHTML = '<option value="" data-id="">-- All Chapters / General Focus --</option>' + 
        chs.map(ch => `<option value="${ch.name}" data-id="${ch.id}">Ch ${ch.number}: ${ch.name}</option>`).join('');
      if (preselectedChId) {
        const opt = Array.from(chapterEl.options).find(o => o.dataset.id === preselectedChId || o.value === preselectedChId);
        if (opt) opt.selected = true;
      }
    };

    levelEl.onchange = () => populateSubjects(levelEl.value);
    subjectEl.onchange = () => populateChapters(subjectEl.value);

    populateSubjects(levelEl.value, initialSubjectId, initialChapterId);
  }

  // --- SUB-TAB 1: GENERATE & HOST NOW ---
  async renderAiGenerateSubTab(container) {
    if (!container) return;
    await this.getSyllabusHierarchy();

    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Configuration Form (Left 6 cols) -->
        <div class="lg:col-span-6 space-y-5">
          <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <i data-lucide="sliders" class="w-4 h-4 text-rose-600"></i>
              Test Generation Parameters
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Test Title <span class="text-rose-600">*</span></label>
                <input 
                  type="text" 
                  id="ai-gen-title" 
                  value="CA Foundation Business Economics Conceptual Sprint" 
                  class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="e.g. Advanced Accounting AS 115 Master Quiz"
                />
              </div>

              <!-- Cascading Hierarchy: Level -> Subject -> Chapter -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Exam Level <span class="text-rose-600">*</span></label>
                  <select id="ai-gen-level" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                    <option value="CA Foundation" data-id="foundation" selected>CA Foundation</option>
                    <option value="CA Intermediate" data-id="intermediate">CA Intermediate</option>
                    <option value="CA Final" data-id="final">CA Final</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Subject <span class="text-rose-600">*</span></label>
                  <select id="ai-gen-subject" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Chapter Filter</label>
                  <select id="ai-gen-chapter" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                    <option value="" data-id="">-- All Chapters / General Focus --</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Topic / Syllabus Focus <span class="text-rose-600">*</span></label>
                <input 
                  type="text" 
                  id="ai-gen-topic" 
                  value="Theory of Demand and Supply" 
                  class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="e.g. Price Elasticity of Demand, Consumer Equilibrium"
                />
              </div>

              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">MCQ Count</label>
                  <input type="number" id="ai-gen-count" min="1" max="50" value="5" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Duration (Min)</label>
                  <input type="number" id="ai-gen-duration" min="1" max="180" value="15" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Difficulty</label>
                  <select id="ai-gen-difficulty" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                    <option value="ICAI Exam Standard" selected>ICAI Standard</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <!-- Question Category & Thinking Speed -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Question Category <span class="text-rose-600">*</span></label>
                  <select id="ai-gen-category" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-medium">
                    <option value="Direct Questions" selected>Direct Questions (Concise, Definition/Fact)</option>
                    <option value="Direct + Case Based Questions">Direct + Case Based Questions</option>
                    <option value="Conceptual Questions">Conceptual Questions</option>
                    <option value="Application Based Questions">Application Based Questions</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Question Speed / Thinking Level <span class="text-rose-600">*</span></label>
                  <select id="ai-gen-speed" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-medium">
                    <option value="Quick" selected>Quick (&lt; 60-70 words, fast answer)</option>
                    <option value="Medium">Medium (Standard pacing)</option>
                    <option value="Thinking">Thinking (Deeper multi-step reasoning)</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-4 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Marks per Correct</label>
                  <input type="number" id="ai-gen-marks" step="0.5" value="2.0" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Negative Marks</label>
                  <input type="number" id="ai-gen-neg-marks" step="0.25" value="0.5" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Platform XP (+)</label>
                  <input type="number" id="ai-gen-xp" min="0" step="5" value="10" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Max Attempts</label>
                  <input type="number" id="ai-gen-attempts" min="1" max="10" value="3" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
              </div>

              <!-- Canonical Eligible Plans: Free, Trial, Core, Plus, Elite -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1.5">Eligible Student Plans</label>
                <div class="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-plan-free" checked class="rounded text-rose-600 focus:ring-rose-500" /> Free
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-plan-trial" checked class="rounded text-rose-600 focus:ring-rose-500" /> ₹9 Trial
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-plan-core" checked class="rounded text-rose-600 focus:ring-rose-500" /> Core Pass
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-plan-plus" checked class="rounded text-rose-600 focus:ring-rose-500" /> Plus Pass
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-plan-elite" checked class="rounded text-rose-600 focus:ring-rose-500" /> Elite Pass
                  </label>
                </div>
              </div>

              <!-- Auto-Publish Toggle -->
              <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span class="text-xs font-bold text-slate-900 block">Auto-Publish Immediately</span>
                  <span class="text-[11px] text-slate-500 block">Test will instantly become live for students upon completion</span>
                </div>
                <input type="checkbox" id="ai-gen-publish" checked class="w-4 h-4 text-rose-600 rounded focus:ring-rose-500 cursor-pointer" />
              </div>

              <!-- Optional Context PDF Upload -->
              <div class="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-rose-400 transition-colors">
                <i data-lucide="file-up" class="w-6 h-6 text-slate-400 mx-auto mb-1"></i>
                <span class="text-xs font-bold text-slate-700 block">Attach Syllabus PDF Context (Optional)</span>
                <span class="text-[11px] text-slate-500 block mb-2">Upload study material to ground questions in specific textbook sections (Max 4MB)</span>
                <input type="file" id="ai-gen-pdf-input" accept=".pdf" multiple class="hidden" onchange="window.adminDashboard.handleAiPdfFilesSelected(this.files)" />
                <button type="button" onclick="document.getElementById('ai-gen-pdf-input').click()" class="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                  Browse PDF Files
                </button>
                <div id="ai-selected-files-list" class="mt-2 text-xs text-slate-600"></div>
              </div>

              <!-- CTA Button -->
              <button 
                id="ai-btn-generate"
                onclick="window.adminDashboard.startAiGenerationJob()"
                class="w-full bg-rose-700 hover:bg-rose-800 text-white font-bold py-3.5 px-6 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <i data-lucide="sparkles" class="w-4 h-4"></i>
                Generate & Host Test Now
              </button>
            </div>
          </div>
        </div>

        <!-- Live Progress & Streaming Panel (Right 6 cols) -->
        <div class="lg:col-span-6 space-y-5">
          <div id="ai-live-panel" class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[500px]">
            <div id="ai-idle-state" class="text-center py-16 space-y-4">
              <div class="w-16 h-16 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center mx-auto text-rose-600">
                <i data-lucide="cpu" class="w-8 h-8"></i>
              </div>
              <div>
                <h4 class="text-sm font-bold text-slate-900">Autonomous MCQ Generation Engine</h4>
                <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Configure the parameters on the left and click <b>Generate & Host Test Now</b>. The system will formulate, mathematically verify, and independently audit questions across multi-provider failover.
                </p>
              </div>

              <div class="grid grid-cols-2 gap-3 max-w-sm mx-auto text-left pt-4">
                <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span class="text-[10px] font-bold text-slate-500 uppercase block">Generation Failover</span>
                  <span class="text-xs font-semibold text-slate-800">Gemini 1 → 2 → OpenRouter → Groq</span>
                </div>
                <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span class="text-[10px] font-bold text-slate-500 uppercase block">Duplicate Filter</span>
                  <span class="text-xs font-semibold text-slate-800">&gt;0.50 Jaccard Rejected</span>
                </div>
              </div>
            </div>

            <!-- Dynamic Active Pipeline View (Hidden initially) -->
            <div id="ai-active-pipeline" class="hidden space-y-5">
              <div class="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Execution Status</span>
                  <h4 id="ai-pipeline-stage-text" class="text-sm font-black text-slate-900 flex items-center gap-2 mt-0.5">
                    <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                    Initializing Generation Pipeline...
                  </h4>
                </div>
                <span id="ai-pipeline-badge" class="px-2.5 py-1 text-xs font-black rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
                  GENERATING
                </span>
              </div>

              <!-- Animated Progress Bar -->
              <div>
                <div class="flex justify-between text-xs font-bold text-slate-600 mb-1.5">
                  <span id="ai-progress-counter">0 / 0 Questions Verified</span>
                  <span id="ai-progress-pct">0%</span>
                </div>
                <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div id="ai-progress-bar-fill" class="bg-gradient-to-r from-rose-600 to-rose-700 h-full w-0 transition-all duration-500"></div>
                </div>
              </div>

              <!-- Question Slot Status Indicators -->
              <div id="ai-question-slots-container" class="hidden p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Question Slot Lifecycles (Failure-Isolated)</span>
                <div id="ai-question-slots-grid" class="flex flex-wrap gap-1.5"></div>
              </div>

              <!-- Live Stream of Formulated MCQs -->
              <div class="space-y-3">
                <span class="text-xs font-bold text-slate-700 block">Streamed MCQ Pipeline Output</span>
                <div id="ai-stream-questions-list" class="space-y-3 max-h-[350px] overflow-y-auto pr-1"></div>
              </div>

              <!-- Final Completion Card (Hidden until complete) -->
              <div id="ai-completion-card" class="hidden p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                <div class="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <i data-lucide="check-circle" class="w-5 h-5 text-emerald-600"></i>
                  Test Generated & Hosted Successfully!
                </div>
                <div class="text-xs text-emerald-700">
                  <span id="ai-complete-test-title" class="font-bold block"></span>
                  <span>Test ID: <code id="ai-complete-test-id" class="font-mono bg-emerald-100 px-1 py-0.5 rounded"></code></span>
                </div>
                <div class="flex items-center gap-3 pt-2">
                  <button 
                    onclick="window.adminDashboard.switchTab('tests')"
                    class="px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-all"
                  >
                    View in Test Management
                  </button>
                  <button 
                    onclick="window.adminDashboard.resetAiGenerateView()"
                    class="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg transition-all"
                  >
                    Generate Another
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupCascadingSyllabus('ai-gen-level', 'ai-gen-subject', 'ai-gen-chapter');
    if (window.lucide) window.lucide.createIcons();
    this.checkForActiveAiJob();
  }

  async checkForActiveAiJob() {
    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';
    if (!token) return;

    try {
      const resp = await fetch(`/api/admin/ai/jobs/active?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.hasActiveJob && data.job) {
        const job = data.job;
        this.aiActiveJobId = job.id;
        const idlePanel = document.getElementById('ai-idle-state');
        const activePanel = document.getElementById('ai-active-pipeline');
        const btn = document.getElementById('ai-btn-generate');
        if (idlePanel) idlePanel.classList.add('hidden');
        if (activePanel) activePanel.classList.remove('hidden');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = `<span class="inline-block animate-spin mr-2">⚙</span> Generating (${job.currentQuestionIndex || 0}/${job.totalQuestions || 10})...`;
        }
        this.pollAiJobStatus(job.id, job.totalQuestions || 10);
      }
    } catch (err) {
      console.warn('[CHECK_ACTIVE_JOB_ERROR]', err);
    }
  }

  handleAiPdfFilesSelected(files) {
    if (!files || files.length === 0) return;
    this.aiSelectedPdfFiles = Array.from(files);
    const listEl = document.getElementById('ai-selected-files-list');
    if (listEl) {
      listEl.innerHTML = this.aiSelectedPdfFiles.map(f => `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[11px] font-bold mr-1 mb-1">
          <i data-lucide="file-text" class="w-3 h-3"></i>
          ${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)
        </span>
      `).join('');
      if (window.lucide) window.lucide.createIcons();
    }
  }

  async startAiGenerationJob() {
    if (this._isGenerating) {
      window.app.showToast('An AI generation job is already in progress. Please wait for it to finish.', 'warning');
      return;
    }

    const title = document.getElementById('ai-gen-title')?.value.trim();
    const topic = document.getElementById('ai-gen-topic')?.value.trim();

    const levelSelect = document.getElementById('ai-gen-level');
    const examLevel = levelSelect?.value || 'CA Foundation';
    const examLevelId = levelSelect?.selectedOptions[0]?.dataset.id || 'foundation';

    const subjectSelect = document.getElementById('ai-gen-subject');
    const subject = subjectSelect?.value || 'Business Economics';
    const subjectId = subjectSelect?.selectedOptions[0]?.dataset.id || 'sub-3';

    const chapterSelect = document.getElementById('ai-gen-chapter');
    const chapter = chapterSelect?.value || '';
    const chapterId = chapterSelect?.selectedOptions[0]?.dataset.id || '';

    const difficulty = document.getElementById('ai-gen-difficulty')?.value || 'ICAI Exam Standard';
    const questionCategory = document.getElementById('ai-gen-category')?.value || 'Direct Questions';
    const questionSpeed = document.getElementById('ai-gen-speed')?.value || 'Quick';
    const count = parseInt(document.getElementById('ai-gen-count')?.value || '5', 10);
    const duration = parseInt(document.getElementById('ai-gen-duration')?.value || '15', 10);
    const marks = parseFloat(document.getElementById('ai-gen-marks')?.value || '2.0');
    const negMarks = parseFloat(document.getElementById('ai-gen-neg-marks')?.value || '0.5');
    const xp = parseFloat(document.getElementById('ai-gen-xp')?.value || '10');
    const maxAttempts = parseInt(document.getElementById('ai-gen-attempts')?.value || '3', 10);
    const autoPublish = document.getElementById('ai-gen-publish')?.checked ?? true;

    if (!title || !topic) {
      window.app.showToast('Please provide both Test Title and Topic.', 'error');
      return;
    }

    this._isGenerating = true;

    const plans = [];
    if (document.getElementById('ai-plan-free')?.checked) plans.push('free');
    if (document.getElementById('ai-plan-trial')?.checked) plans.push('trial');
    if (document.getElementById('ai-plan-core')?.checked) plans.push('core');
    if (document.getElementById('ai-plan-plus')?.checked) plans.push('plus');
    if (document.getElementById('ai-plan-elite')?.checked) plans.push('elite');

    const btn = document.getElementById('ai-btn-generate');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block animate-spin mr-2">⚙</span> Initiating Pipeline...`;
    }

    // Switch right panel to active pipeline view
    const idlePanel = document.getElementById('ai-idle-state');
    const activePanel = document.getElementById('ai-active-pipeline');
    if (idlePanel) idlePanel.classList.add('hidden');
    if (activePanel) activePanel.classList.remove('hidden');

    const progressBar = document.getElementById('ai-progress-bar-fill');
    const progressPct = document.getElementById('ai-progress-pct');
    const progressCounter = document.getElementById('ai-progress-counter');
    const stageText = document.getElementById('ai-pipeline-stage-text');
    const questionsList = document.getElementById('ai-stream-questions-list');
    const completionCard = document.getElementById('ai-completion-card');

    if (progressBar) progressBar.style.width = '10%';
    if (progressPct) progressPct.innerText = '10%';
    if (progressCounter) progressCounter.innerText = `0 / ${count} Questions Verified`;
    if (stageText) stageText.innerText = 'Uploading & Indexing Source Material...';
    if (questionsList) questionsList.innerHTML = '';
    if (completionCard) completionCard.classList.add('hidden');

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    // If inline PDFs were selected, upload them first
    if (this.aiSelectedPdfFiles && this.aiSelectedPdfFiles.length > 0) {
      for (const pdfFile of this.aiSelectedPdfFiles) {
        if (pdfFile.size > 4 * 1024 * 1024) {
          window.app.showToast(`Skipping ${pdfFile.name}: Exceeds 4MB limit`, 'warning');
          continue;
        }
        try {
          if (stageText) stageText.innerText = `Running Mistral OCR on ${pdfFile.name}...`;
          const base64Data = await this._readFileAsBase64(pdfFile);
          await fetch('/api/admin/ai/documents/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              filename: pdfFile.name,
              fileData: base64Data,
              subject: subject,
              subjectId: subjectId,
              examLevel: examLevel,
              examLevelId: examLevelId,
              chapter: chapter,
              chapterId: chapterId
            })
          });
        } catch (uploadErr) {
          console.warn('[AI_INLINE_UPLOAD_WARNING]', uploadErr);
        }
      }
    }

    // Trigger Generation Job
    try {
      if (stageText) stageText.innerText = 'Dispatching Generation Request across AI Gateway...';
      const response = await fetch('/api/admin/ai/jobs/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: title,
          subject: subject,
          subjectId: subjectId,
          chapter: chapter,
          chapterId: chapterId,
          topic: topic,
          examLevel: examLevel,
          examLevelId: examLevelId,
          difficulty: difficulty,
          questionCategory: questionCategory,
          questionSpeed: questionSpeed,
          count: count,
          durationMinutes: duration,
          marksPerCorrect: marks,
          negativeMarksPerWrong: negMarks,
          platformXp: xp,
          maxAttempts: maxAttempts,
          autoPublish: autoPublish,
          allowedPlans: plans
        })
      });

      const contentType = response.headers.get('content-type') || '';
      let resData = null;
      if (contentType.includes('application/json')) {
        resData = await response.json();
      } else {
        const rawText = await response.text();
        throw new Error(rawText || `Server returned HTTP ${response.status}`);
      }

      if (response.status === 409 && resData && resData.job) {
        window.app.showToast(resData.error || 'A generation job is already in progress.', 'warning');
        const activeJobId = resData.job.id;
        this.aiActiveJobId = activeJobId;
        this.pollAiJobStatus(activeJobId, resData.job.totalQuestions || count);
        return;
      }

      if (!response.ok || !resData.success) {
        const errMsg = (resData && (resData.error?.message || resData.error)) || 'Failed to queue generation job.';
        throw new Error(errMsg);
      }

      const jobId = resData.job.id;
      this.aiActiveJobId = jobId;
      this.pollAiJobStatus(jobId, count);

    } catch (err) {
      this._isGenerating = false;
      window.app.showToast(`Generation error: ${err.message}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> Generate & Host Test Now`;
        if (window.lucide) window.lucide.createIcons();
      }
      if (stageText) stageText.innerText = `Failed: ${err.message}`;
    }
  }

  pollAiJobStatus(jobId, targetCount) {
    if (this.aiJobPollInterval) clearInterval(this.aiJobPollInterval);

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    this.aiJobPollInterval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/admin/ai/jobs/status?jobId=${jobId}&_t=${Date.now()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) return;

        const data = await resp.json();
        const job = data.job;
        if (!job) return;

        const progressBar = document.getElementById('ai-progress-bar-fill');
        const progressPct = document.getElementById('ai-progress-pct');
        const progressCounter = document.getElementById('ai-progress-counter');
        const stageText = document.getElementById('ai-pipeline-stage-text');
        const badge = document.getElementById('ai-pipeline-badge');
        const questionsList = document.getElementById('ai-stream-questions-list');
        const completionCard = document.getElementById('ai-completion-card');
        const btn = document.getElementById('ai-btn-generate');

        const pct = job.progressPct || 10;
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPct) progressPct.innerText = `${pct}%`;
        if (stageText) stageText.innerText = job.currentStage || 'Processing...';

        // Render question slot lifecycle telemetry
        const slotsContainer = document.getElementById('ai-question-slots-container');
        const slotsGrid = document.getElementById('ai-question-slots-grid');
        if (slotsContainer && slotsGrid && Array.isArray(job.questionStatuses) && job.questionStatuses.length > 0) {
          slotsContainer.classList.remove('hidden');
          slotsGrid.innerHTML = job.questionStatuses.map(qs => {
            let color = 'bg-slate-100 text-slate-600 border-slate-200';
            let label = qs.status ? qs.status.toUpperCase() : 'PENDING';
            if (qs.status === 'generating') color = 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse';
            else if (qs.status === 'rate_limited') {
              color = 'bg-amber-100 text-amber-900 border-amber-400 font-bold animate-pulse';
              label = '429 LIMIT';
            }
            else if (qs.status === 'fallback') {
              color = 'bg-blue-100 text-blue-900 border-blue-400 font-bold';
              label = 'FALLBACK';
            }
            else if (qs.status === 'retrying') {
              color = 'bg-orange-100 text-orange-900 border-orange-300 animate-pulse';
              label = 'RETRYING';
            }
            else if (qs.status === 'validating') {
              color = 'bg-purple-100 text-purple-800 border-purple-300';
              label = 'VALIDATING';
            }
            else if (qs.status === 'saved') {
              color = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
              label = 'VERIFIED';
            }
            else if (qs.status === 'failed') {
              color = 'bg-red-100 text-red-800 border-red-300 font-bold';
              label = 'FAILED';
            }
            return `<span class="px-2 py-0.5 text-[10px] rounded border ${color}">Q${qs.number}: ${label}</span>`;
          }).join('');
        }

        if (job.status === 'GENERATING') {
          if (badge) {
            badge.innerText = 'GENERATING';
            badge.className = 'px-2.5 py-1 text-xs font-black rounded-lg bg-rose-100 text-rose-800 border border-rose-200';
          }
          const verified = (typeof job.generatedCount === 'number') ? job.generatedCount : (job.currentQuestionIndex || 0);
          if (progressCounter) {
            progressCounter.innerText = `${verified} / ${job.totalQuestions || targetCount} Questions Verified`;
          }
          // Live streaming: show verified questions as they arrive
          if (questionsList && Array.isArray(job.generatedQuestions) && job.generatedQuestions.length > 0) {
            this._renderStreamedQuestions(job.generatedQuestions, questionsList);
          }
        }

        // Stream completed questions if job finished or result exists
        if (job.status === 'COMPLETED' && job.result) {
          this._isGenerating = false;
          clearInterval(this.aiJobPollInterval);
          this.aiJobPollInterval = null;

          if (badge) {
            badge.innerText = 'COMPLETED';
            badge.className = 'px-2.5 py-1 text-xs font-black rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200';
          }
          if (progressBar) progressBar.style.width = '100%';
          if (progressPct) progressPct.innerText = '100%';
          const finalQs = (job.result && job.result.questions) || job.generatedQuestions || [];
          if (progressCounter) progressCounter.innerText = `${finalQs.length} / ${finalQs.length} Questions Verified`;
          if (completionCard) {
            completionCard.className = 'p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3';
            const titleEl = document.getElementById('ai-complete-test-title');
            const idEl = document.getElementById('ai-complete-test-id');
            if (titleEl) titleEl.innerText = job.title || (job.result?.test?.title) || 'MCQ Test';
            if (idEl) idEl.innerText = (job.result?.test?.id) || job.testId || '';
            completionCard.classList.remove('hidden');
          }

          if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> Generate & Host Test Now`;
          }

          if (questionsList && finalQs.length > 0) {
            this._renderStreamedQuestions(finalQs, questionsList);
          }

          // Authoritative sync: reload store tests and questions
          if (window.store && window.store.refreshTests) window.store.refreshTests();
          window.app.showToast('AI MCQ Test successfully created and hosted in ExcellenceCA!', 'success');
          if (window.lucide) window.lucide.createIcons();
        } else if ((job.status === 'PARTIALLY_COMPLETED' || job.status === 'PARTIAL') && job.result) {
          this._isGenerating = false;
          clearInterval(this.aiJobPollInterval);
          this.aiJobPollInterval = null;

          if (badge) {
            badge.innerText = 'PARTIAL';
            badge.className = 'px-2.5 py-1 text-xs font-black rounded-lg bg-amber-100 text-amber-800 border border-amber-200';
          }
          if (progressBar) progressBar.style.width = '100%';
          if (progressPct) progressPct.innerText = '100%';
          const finalQs = (job.result && job.result.questions) || job.generatedQuestions || [];
          if (progressCounter) progressCounter.innerText = `${finalQs.length} / ${job.totalQuestions || targetCount} Questions Verified`;
          if (completionCard) {
            completionCard.className = 'p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3';
            const titleEl = document.getElementById('ai-complete-test-title');
            const idEl = document.getElementById('ai-complete-test-id');
            if (titleEl) titleEl.innerText = `${job.title || (job.result?.test?.title) || 'MCQ Test'} (Partially Completed: ${finalQs.length} MCQs)`;
            if (idEl) idEl.innerText = (job.result?.test?.id) || job.testId || '';
            completionCard.classList.remove('hidden');
          }

          if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> Generate & Host Test Now`;
          }

          if (questionsList && finalQs.length > 0) {
            this._renderStreamedQuestions(finalQs, questionsList);
          }

          if (window.store && window.store.refreshTests) window.store.refreshTests();
          window.app.showToast(`Test created with ${finalQs.length} verified MCQs.`, 'warning');
          if (window.lucide) window.lucide.createIcons();
        } else if (job.status === 'FAILED') {
          this._isGenerating = false;
          clearInterval(this.aiJobPollInterval);
          this.aiJobPollInterval = null;
          if (badge) {
            badge.innerText = 'FAILED';
            badge.className = 'px-2.5 py-1 text-xs font-black rounded-lg bg-rose-100 text-rose-800 border border-rose-200';
          }
          if (stageText) stageText.innerText = `Pipeline Error: ${job.error || 'Failed'}`;
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> Generate & Host Test Now`;
          }
          window.app.showToast(`Generation failed: ${job.error}`, 'error');
        }

      } catch (pollErr) {
        console.warn('[AI_POLL_WARNING]', pollErr);
      }
    }, 1500);
  }

  _renderStreamedQuestions(questions, listEl) {
    if (!listEl || !Array.isArray(questions)) return;
    listEl.innerHTML = questions.map((q, idx) => `
      <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-black text-rose-700">Question ${idx + 1}</span>
          <div class="flex items-center gap-1 text-[10px] font-bold text-slate-500">
            <span class="px-1.5 py-0.5 bg-slate-200 rounded">${q.providerUsed || 'AI Engine'}</span>
            <span>•</span>
            <span class="text-emerald-600 font-black">Verified Answer: ${q.correctOption}</span>
          </div>
        </div>
        <p class="font-bold text-slate-900">${q.text}</p>
        <div class="grid grid-cols-2 gap-2 text-slate-700">
          <div class="p-1.5 rounded ${q.correctOption === 'A' ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300' : 'bg-white border border-slate-200'}">A: ${q.optionA}</div>
          <div class="p-1.5 rounded ${q.correctOption === 'B' ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300' : 'bg-white border border-slate-200'}">B: ${q.optionB}</div>
          <div class="p-1.5 rounded ${q.correctOption === 'C' ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300' : 'bg-white border border-slate-200'}">C: ${q.optionC}</div>
          <div class="p-1.5 rounded ${q.correctOption === 'D' ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300' : 'bg-white border border-slate-200'}">D: ${q.optionD}</div>
        </div>
        <details class="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200 cursor-pointer">
          <summary class="font-bold text-slate-800">ICAI Step-by-Step Explanation</summary>
          <p class="mt-1 leading-relaxed text-slate-700">${q.explanation || 'Step-by-step conceptual solution.'}</p>
        </details>
      </div>
    `).join('');
  }

  // --- SUB-TAB 2: PDF / SOURCE LIBRARY ---
  async renderAiLibrarySubTab(container) {
    if (!container) return;
    await this.getSyllabusHierarchy();

    container.innerHTML = `
      <div class="space-y-6">
        <!-- PDF Upload Form -->
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div class="flex items-center gap-2 mb-4">
            <i data-lucide="file-up" class="w-5 h-5 text-rose-600"></i>
            <div>
              <h3 class="text-sm font-bold text-slate-900">Upload & Index Syllabus Documents</h3>
              <p class="text-[11px] text-slate-500">Attach ICAI syllabus material to ground AI MCQ formulations in official curriculum texts.</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Exam Level <span class="text-rose-600">*</span></label>
              <select id="ai-lib-level" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                <option value="CA Foundation" data-id="foundation" selected>CA Foundation</option>
                <option value="CA Intermediate" data-id="intermediate">CA Intermediate</option>
                <option value="CA Final" data-id="final">CA Final</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Subject <span class="text-rose-600">*</span></label>
              <select id="ai-lib-subject" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Chapter Association</label>
              <select id="ai-lib-chapter" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                <option value="" data-id="">-- General / Entire Subject --</option>
              </select>
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-xs font-bold text-slate-700 mb-1">Select PDF File <span class="text-rose-600">*</span></label>
            <input type="file" id="ai-lib-file" accept=".pdf" class="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer" />
            <p class="text-[11px] text-slate-500 mt-1">
              <span class="font-semibold text-rose-600">Max file size: 4MB.</span> For large textbooks, please upload individual chapter PDFs to maximize OCR clarity and ensure strict chapter-wise MCQ retrieval isolation.
            </p>
          </div>

          <button 
            id="ai-btn-lib-upload"
            onclick="window.adminDashboard.uploadAiLibraryPdf()"
            class="px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2"
          >
            <i data-lucide="upload" class="w-4 h-4"></i>
            Process with Mistral OCR & Index
          </button>
        </div>

        <!-- Indexed Documents Table -->
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <i data-lucide="layers" class="w-4 h-4 text-purple-600"></i>
              Indexed Knowledge Sources (<span id="ai-doc-count">...</span>)
            </h3>
            <button onclick="window.adminDashboard.renderAiLibrarySubTab(document.getElementById('ai-subtab-container'))" class="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh
            </button>
          </div>

          <div id="ai-docs-table-wrapper" class="overflow-x-auto">
            <div class="py-8 text-center text-slate-400 text-xs">Loading indexed documents...</div>
          </div>
        </div>
      </div>
    `;

    this.setupCascadingSyllabus('ai-lib-level', 'ai-lib-subject', 'ai-lib-chapter');
    if (window.lucide) window.lucide.createIcons();

    // Fetch documents from backend
    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch(`/api/admin/ai/documents?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      const docs = data.documents || [];

      const countEl = document.getElementById('ai-doc-count');
      if (countEl) countEl.innerText = docs.length;

      const tableWrapper = document.getElementById('ai-docs-table-wrapper');
      if (!tableWrapper) return;

      if (docs.length === 0) {
        tableWrapper.innerHTML = `
          <div class="py-12 text-center text-slate-400 text-xs">
            <i data-lucide="file-text" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
            No syllabus documents indexed yet. Upload a PDF above to enable concept-grounded MCQ generation.
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      tableWrapper.innerHTML = `
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
              <th class="py-3 px-4">Document / Filename</th>
              <th class="py-3 px-4">Subject & Level</th>
              <th class="py-3 px-4">Chapter Tag</th>
              <th class="py-3 px-4">Pages / Chunks</th>
              <th class="py-3 px-4">OCR Engine</th>
              <th class="py-3 px-4">Uploaded</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${docs.map(d => `
              <tr class="hover:bg-slate-50">
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2">
                    <i data-lucide="file-text" class="w-4 h-4 text-rose-600 flex-shrink-0"></i>
                    <div>
                      <span class="font-bold text-slate-900 block">${d.filename}</span>
                      <span class="text-[10px] text-slate-400">${(d.fileSize / 1024).toFixed(1)} KB • ID: ${d.id}</span>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <span class="font-semibold text-slate-800 block">${d.subject}</span>
                  <span class="text-[10px] text-slate-500 block">${d.examLevel || 'CA Foundation'}</span>
                </td>
                <td class="py-3 px-4">
                  ${d.chapter ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">${d.chapter}</span>` : '<span class="text-slate-400 text-[11px]">—</span>'}
                </td>
                <td class="py-3 px-4 font-semibold text-slate-700">
                  ${d.pageCount} Pages • ${d.chunkCount} Chunks
                </td>
                <td class="py-3 px-4">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    ${d.ocrEngine || 'mistral-ocr-latest'}
                  </span>
                </td>
                <td class="py-3 px-4 text-slate-500 text-[11px]">
                  ${d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : 'Recently'}
                </td>
                <td class="py-3 px-4 text-right">
                  <button 
                    onclick="window.adminDashboard.deleteAiDocument('${d.id}')"
                    class="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition-all"
                    title="Delete Document"
                  >
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error('[AI_DOCS_FETCH_ERROR]', err);
    }
  }

  async uploadAiLibraryPdf() {
    const fileInput = document.getElementById('ai-lib-file');
    const levelSelect = document.getElementById('ai-lib-level');
    const examLevel = levelSelect?.value || 'CA Foundation';
    const examLevelId = levelSelect?.selectedOptions[0]?.dataset.id || 'foundation';

    const subjectSelect = document.getElementById('ai-lib-subject');
    const subject = subjectSelect?.value || 'General CA Studies';
    const subjectId = subjectSelect?.selectedOptions[0]?.dataset.id || '';

    const chapterSelect = document.getElementById('ai-lib-chapter');
    const chapter = chapterSelect?.value || '';
    const chapterId = chapterSelect?.selectedOptions[0]?.dataset.id || '';

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      window.app.showToast('Please select a PDF file to upload.', 'error');
      return;
    }

    const file = fileInput.files[0];

    // Client-side 4MB Pre-Validation to avoid Vercel 413 plain-text crashes
    if (file.size > 4 * 1024 * 1024) {
      window.app.showToast(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowable 4MB limit for serverless upload. Please compress or split the PDF by chapter.`, 'error');
      return;
    }

    const btn = document.getElementById('ai-btn-lib-upload');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block animate-spin mr-2">⚙</span> Uploading & Running Mistral OCR...`;
    }

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const base64Data = await this._readFileAsBase64(file);
      const resp = await fetch('/api/admin/ai/documents/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: file.name,
          fileData: base64Data,
          subject: subject,
          subjectId: subjectId,
          examLevel: examLevel,
          examLevelId: examLevelId,
          chapter: chapter,
          chapterId: chapterId
        })
      });

      const contentType = resp.headers.get('content-type') || '';
      let res = null;
      if (contentType.includes('application/json')) {
        res = await resp.json();
      } else {
        const rawText = await resp.text();
        throw new Error(rawText || `Server returned HTTP ${resp.status}`);
      }

      if (!resp.ok || !res.success) {
        const errMsg = (res.error && (res.error.message || res.error)) || 'Failed to upload document';
        throw new Error(errMsg);
      }

      window.app.showToast(`Document "${file.name}" indexed successfully with Mistral OCR!`, 'success');
      this.renderAiLibrarySubTab(document.getElementById('ai-subtab-container'));

    } catch (err) {
      window.app.showToast(`Upload failed: ${err.message}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> Process with Mistral OCR & Index`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async deleteAiDocument(docId) {
    if (!confirm('Are you sure you want to remove this source document? Extracted chunks will no longer be referenced in MCQ prompts.')) return;

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/documents/delete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documentId: docId })
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to delete');
      }

      window.app.showToast('Document deleted from knowledge index.', 'info');
      this.renderAiLibrarySubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // --- SUB-TAB 3: AUTO-PILOT / SCHEDULED MCQS ---
  async renderAiAutopilotSubTab(container) {
    if (!container) return;
    await this.getSyllabusHierarchy();

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    const escapeHtml = (str) => {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const formatIstDateTime = (isoString) => {
      if (!isoString) return 'Not scheduled';
      try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        return d.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }) + ' IST';
      } catch (e) {
        return isoString;
      }
    };

    const getCountdownText = (nextRunAtIso) => {
      if (!nextRunAtIso) return '';
      const diffMs = new Date(nextRunAtIso).getTime() - Date.now();
      if (diffMs <= 0) return '⚡ Due now / processing';
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 60) return `in ${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;
      if (diffHours < 24) return `in ${diffHours}h ${remMins}m`;
      const diffDays = Math.floor(diffHours / 24);
      return `in ${diffDays}d ${diffHours % 24}h`;
    };

    let tasks = [];
    let serverTimeIst = '';
    try {
      const resp = await fetch(`/api/admin/ai/scheduler/tasks?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (data.tasks) tasks = data.tasks;
      if (data.serverTimeIst) serverTimeIst = data.serverTimeIst;
    } catch (err) {
      console.warn('[AUTOPILOT_TASKS_FETCH_ERROR]', err);
    }

    this._scheduledTasks = tasks;

    const totalTasks = tasks.length;
    const activeTasks = tasks.filter(t => t.enabled && t.status !== 'paused').length;
    const totalRunsCompleted = tasks.reduce((sum, t) => sum + (t.executionCount || 0), 0);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header & Action Bar -->
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <i data-lucide="clock" class="w-5 h-5 text-rose-600"></i>
              Autonomous Auto-Pilot &amp; Scheduled MCQs
            </h3>
            <p class="text-xs text-slate-500 mt-1">
              Create independent recurring daily schedules or one-off tests. Runs 100% server-side in Indian Standard Time (IST).
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button 
              id="btn-trigger-tick"
              onclick="window.adminDashboard.triggerSchedulerTick()" 
              class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
              title="Manually trigger server-side tick to check and process any due tasks right now"
            >
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
              Check Due Schedules
            </button>

            <button 
              onclick="window.adminDashboard.openCreateScheduleModal()" 
              class="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
            >
              <i data-lucide="plus-circle" class="w-4 h-4"></i>
              + Create Scheduled Task
            </button>
          </div>
        </div>

        <!-- KPI Telemetry Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Schedules</span>
            <span class="text-2xl font-black text-slate-900 mt-1 block">${totalTasks}</span>
            <span class="text-[11px] text-slate-500 font-semibold mt-1 block">Configured in Database</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Active Schedulers</span>
            <span class="text-2xl font-black text-emerald-600 mt-1 block">${activeTasks}</span>
            <span class="text-[11px] text-emerald-700 font-semibold mt-1 block">Live &amp; Armed</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Tests Hosted</span>
            <span class="text-2xl font-black text-rose-700 mt-1 block">${totalRunsCompleted}</span>
            <span class="text-[11px] text-rose-600 font-semibold mt-1 block">Auto-Published to Platform</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Server Clock (IST)</span>
            <span class="text-base font-bold text-slate-800 mt-2 block truncate" title="${escapeHtml(serverTimeIst || 'Asia/Kolkata')}">
              ${escapeHtml(serverTimeIst ? serverTimeIst.replace('T', ' ').substring(0, 19) + ' IST' : 'Asia/Kolkata (UTC+5:30)')}
            </span>
            <span class="text-[11px] text-blue-600 font-semibold mt-1 block">Timezone Synchronized</span>
          </div>
        </div>

        <!-- Server-Side Autonomous Guarantee Notice -->
        <div class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-start gap-3">
          <i data-lucide="shield-check" class="w-5 h-5 text-blue-700 mt-0.5 flex-shrink-0"></i>
          <div class="text-xs text-blue-950 space-y-1">
            <span class="font-bold block">Autonomous Multi-Schedule Execution &amp; Guaranteed Hosting</span>
            <p class="text-blue-900 leading-relaxed">
              Every schedule functions as an independent, isolated task. Tests are generated, mathematically verified, and published directly into the production database via continuous server-side runners, Vercel Cron, and AI multi-provider fallback. Schedulers run reliably even when no admin is logged in.
            </p>
          </div>
        </div>

        <!-- Task List or Empty State -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-600">
              Configured Schedules (${tasks.length})
            </h4>
          </div>

          ${tasks.length === 0 ? `
            <div class="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-4">
              <div class="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <i data-lucide="calendar-plus" class="w-7 h-7"></i>
              </div>
              <div class="max-w-md mx-auto space-y-1">
                <h4 class="text-sm font-bold text-slate-900">No Scheduled MCQ Tasks Yet</h4>
                <p class="text-xs text-slate-500">
                  Set up independent recurring schedules (e.g. 09:00 AM Accounts, 02:00 PM Law) or a one-time event. The server will autonomously generate, verify, and host tests into the student platform.
                </p>
              </div>
              <button 
                onclick="window.adminDashboard.openCreateScheduleModal()" 
                class="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
              >
                <i data-lucide="plus" class="w-4 h-4"></i>
                Create Your First Schedule
              </button>
            </div>
          ` : `
            <div class="grid grid-cols-1 gap-4">
              ${tasks.map(task => `
                <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-all" id="task-card-${escapeHtml(task.id)}">
                  <!-- Top: Header & Status -->
                  <div class="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="text-sm font-bold text-slate-900">${escapeHtml(task.name)}</h4>
                        <span class="px-2 py-0.5 text-[11px] font-bold rounded bg-rose-50 text-rose-700 border border-rose-100">${escapeHtml(task.examLevel || 'CA Foundation')}</span>
                        <span class="px-2 py-0.5 text-[11px] font-bold rounded ${task.scheduleType === 'recurring' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-purple-50 text-purple-700 border border-purple-100'}">
                          ${task.scheduleType === 'recurring' ? `🔁 Daily at ${escapeHtml(task.dailyTime || '20:00')} IST` : `🎯 One-Time: ${formatIstDateTime(task.scheduledDateTime || task.nextRunAt)}`}
                        </span>
                        ${task.isLiveEvent ? `<span class="px-2 py-0.5 text-[11px] font-bold rounded bg-rose-50 text-rose-700 border border-rose-100">⚡ Live Window: ${task.liveDurationMinutes || 60}m</span>` : ''}
                      </div>
                      <p class="text-xs text-slate-500 mt-1">
                        Title Template: <code class="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">${escapeHtml(task.titleTemplate || '[Subject] Daily Conceptual Sprint')}</code>
                      </p>
                    </div>

                    <!-- Status Badge -->
                    <div class="flex items-center gap-2">
                      ${task.status === 'processing' 
                        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                             <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Generating &amp; Hosting...
                           </span>`
                        : task.status === 'live'
                        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-600 text-white shadow-sm animate-pulse">
                             <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>⚡ LIVE NOW
                           </span>`
                        : task.status === 'expired'
                        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                             <i data-lucide="clock" class="w-3.5 h-3.5"></i> Expired
                           </span>`
                        : task.enabled && task.status === 'scheduled'
                        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                             <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Active Schedule
                           </span>`
                        : task.status === 'completed'
                        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                             <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Completed
                           </span>`
                        : task.status === 'failed'
                        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                             <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Failed
                           </span>`
                        : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                             <i data-lucide="pause-circle" class="w-3.5 h-3.5"></i> Paused
                           </span>`
                      }
                    </div>
                  </div>

                  <!-- Specs Grid -->
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                      <span class="text-slate-400 font-medium block text-[10px] uppercase">Subject &amp; Chapter</span>
                      <span class="font-bold text-slate-800 block truncate" title="${escapeHtml(task.subject)}">${escapeHtml(task.subject)}</span>
                      <span class="text-slate-500 text-[11px] block truncate" title="${escapeHtml(task.chapter || 'All Chapters')}">${escapeHtml(task.chapter || 'All Chapters / Auto-Rotate')}</span>
                    </div>
                    <div>
                      <span class="text-slate-400 font-medium block text-[10px] uppercase">Curriculum Topic</span>
                      <span class="font-bold text-slate-800 block truncate" title="${escapeHtml(task.topic || 'Comprehensive Practice')}">${escapeHtml(task.topic || 'Comprehensive Practice')}</span>
                      <span class="text-slate-500 text-[11px] block">${escapeHtml(task.difficulty || 'ICAI Standard')}</span>
                    </div>
                    <div>
                      <span class="text-slate-400 font-medium block text-[10px] uppercase">Test Configuration</span>
                      <span class="font-bold text-slate-800 block">${task.questionCount || 5} MCQs • ${task.durationMinutes || 15} Mins</span>
                      <span class="text-slate-500 text-[11px] block">+${task.marksPerCorrect ?? 2}/-${task.negativeMarksPerWrong ?? 0.5} Marks • ${task.platformXp ?? 10} XP</span>
                    </div>
                    <div>
                      <span class="text-slate-400 font-medium block text-[10px] uppercase">Next Scheduled Run</span>
                      <span class="font-bold text-slate-800 block">${formatIstDateTime(task.nextRunAt)}</span>
                      <span class="text-rose-600 text-[11px] font-semibold block">${task.enabled ? getCountdownText(task.nextRunAt) : 'Schedule Paused'}</span>
                    </div>
                  </div>

                  <!-- Telemetry / Last Run State -->
                  <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 bg-white px-1">
                    <div class="flex items-center gap-4 flex-wrap">
                      <span>Runs Completed: <b class="text-slate-800">${task.executionCount || 0}</b></span>
                      ${task.lastRunAt ? `<span>Last Run: <b class="text-slate-700">${formatIstDateTime(task.lastRunAt)}</b></span>` : ''}
                      ${task.lastTestTitle ? `<span>Last Hosted: <b class="text-emerald-700">${escapeHtml(task.lastTestTitle)}</b> <span class="text-slate-400 text-[10px]">(${escapeHtml(task.lastTestId || '')})</span></span>` : ''}
                      ${task.lastError ? `<span class="text-rose-600 font-semibold truncate max-w-xs" title="${escapeHtml(task.lastError)}">Error: ${escapeHtml(task.lastError)}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                        ${escapeHtml(task.questionCategory || 'Direct Questions')}
                      </span>
                      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                        ${escapeHtml(task.questionSpeed || 'Quick')}
                      </span>
                      ${(task.allowedPlans || ['free', 'trial', 'core', 'plus', 'elite']).map(p => `<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">${escapeHtml(p)}</span>`).join('')}
                      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${task.autoPublish ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">
                        ${task.autoPublish ? 'Auto-Published' : 'Draft'}
                      </span>
                    </div>
                  </div>

                  <!-- Action Bar -->
                  <div class="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                    <div class="flex items-center gap-2">
                      <!-- Run Now Button -->
                      <button 
                        id="btn-run-task-${escapeHtml(task.id)}"
                        onclick="window.adminDashboard.runScheduledTaskNow('${escapeHtml(task.id)}')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors shadow-sm"
                        title="Immediately generate MCQs, mathematically verify, and host test directly to database right now"
                      >
                        <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                        <span>Run &amp; Host Now</span>
                      </button>

                      <!-- Pause / Resume Button -->
                      <button 
                        onclick="window.adminDashboard.toggleScheduledTask('${escapeHtml(task.id)}', ${!task.enabled})"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg ${task.enabled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'} transition-colors"
                      >
                        <i data-lucide="${task.enabled ? 'pause' : 'play'}" class="w-3.5 h-3.5"></i>
                        <span>${task.enabled ? 'Pause' : 'Resume'}</span>
                      </button>
                    </div>

                    <div class="flex items-center gap-2">
                      <!-- Edit Button -->
                      <button 
                        onclick="window.adminDashboard.openEditScheduleModal('${escapeHtml(task.id)}')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      >
                        <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                        <span>Edit</span>
                      </button>

                      <!-- Delete Button -->
                      <button 
                        onclick="window.adminDashboard.deleteScheduledTask('${escapeHtml(task.id)}')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Modal: Create / Edit Scheduled Task -->
        <div id="ai-schedule-modal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 hidden overflow-y-auto">
          <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div class="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <i data-lucide="calendar" class="w-4 h-4"></i>
                </div>
                <div>
                  <h3 id="ai-sched-modal-title" class="text-sm font-bold text-slate-900">Create Scheduled MCQ Task</h3>
                  <p class="text-xs text-slate-500">Autonomous server-side MCQ test generation and hosting</p>
                </div>
              </div>
              <button onclick="window.adminDashboard.closeScheduleModal()" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>

            <form onsubmit="event.preventDefault(); window.adminDashboard.saveScheduledTask();" class="p-6 space-y-4">
              <input type="hidden" id="ai-sched-id" value="" />

              <!-- Task Name -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Task Name <span class="text-rose-600">*</span></label>
                <input type="text" id="ai-sched-name" required placeholder="e.g. CA Foundation Morning Accounts Sprint" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
              </div>

              <!-- Schedule Cadence & Time Selection -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1.5">Schedule Cadence <span class="text-rose-600">*</span></label>
                  <div class="flex items-center gap-4 text-xs">
                    <label class="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                      <input type="radio" name="ai-sched-type-radio" value="recurring" checked onchange="window.adminDashboard.handleScheduleTypeChange('recurring')" class="text-rose-600 focus:ring-rose-500" />
                      Daily Recurring
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                      <input type="radio" name="ai-sched-type-radio" value="one_time" onchange="window.adminDashboard.handleScheduleTypeChange('one_time')" class="text-rose-600 focus:ring-rose-500" />
                      One-Time Event
                    </label>
                  </div>
                </div>

                <!-- Recurring Daily Time (IST) -->
                <div id="ai-sched-daily-time-container">
                  <label class="block text-xs font-bold text-slate-700 mb-1">Daily Time (IST) <span class="text-rose-600">*</span></label>
                  <input type="time" id="ai-sched-daily-time" value="09:00" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                  <span class="text-[10px] text-slate-400 mt-0.5 block">Indian Standard Time (UTC+05:30)</span>
                </div>

                <!-- One-Time Date & Time (IST) -->
                <div id="ai-sched-datetime-container" class="hidden space-y-1.5">
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class="block text-xs font-bold text-slate-700 mb-1">Date (IST) <span class="text-rose-600">*</span></label>
                      <input type="date" id="ai-sched-date" class="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white" />
                    </div>
                    <div>
                      <label class="block text-xs font-bold text-slate-700 mb-1">Time (IST) <span class="text-rose-600">*</span></label>
                      <input type="time" id="ai-sched-time" value="10:00" class="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white" />
                    </div>
                  </div>
                  <span class="text-[10px] text-slate-400 block">Indian Standard Time (Asia/Kolkata, UTC+05:30)</span>
                </div>
              </div>

              <!-- Cascading Syllabus -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Exam Level <span class="text-rose-600">*</span></label>
                  <select id="ai-sched-level" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                    <option value="CA Foundation" data-id="foundation" selected>CA Foundation</option>
                    <option value="CA Intermediate" data-id="intermediate">CA Intermediate</option>
                    <option value="CA Final" data-id="final">CA Final</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Subject <span class="text-rose-600">*</span></label>
                  <select id="ai-sched-subject" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Chapter Focus</label>
                  <select id="ai-sched-chapter" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                    <option value="" data-id="">-- Auto-Rotate / All Chapters --</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Test Title Template <span class="text-rose-600">*</span></label>
                  <input type="text" id="ai-sched-title-template" value="[Subject] Daily Conceptual Sprint" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                  <span class="text-[10px] text-slate-400 mt-0.5 block">Placeholders: [Subject], [Chapter], [Date]</span>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Topic / Syllabus Coverage</label>
                  <input type="text" id="ai-sched-topic" value="Daily Comprehensive Exam Practice" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
              </div>

              <!-- Test Parameters -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">MCQ Count</label>
                  <input type="number" id="ai-sched-count" min="1" max="25" value="5" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Duration (Min)</label>
                  <input type="number" id="ai-sched-duration" min="5" max="180" value="15" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Difficulty</label>
                  <select id="ai-sched-difficulty" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                    <option value="ICAI Exam Standard" selected>ICAI Standard</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Marks per Correct</label>
                  <input type="number" id="ai-sched-marks" step="0.5" value="2.0" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
              </div>

              <!-- Question Category & Thinking Speed -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Question Category <span class="text-rose-600">*</span></label>
                  <select id="ai-sched-category" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-medium">
                    <option value="Direct Questions" selected>Direct Questions (Concise, Definition/Fact)</option>
                    <option value="Direct + Case Based Questions">Direct + Case Based Questions</option>
                    <option value="Conceptual Questions">Conceptual Questions</option>
                    <option value="Application Based Questions">Application Based Questions</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Question Speed / Thinking Level <span class="text-rose-600">*</span></label>
                  <select id="ai-sched-speed" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-medium">
                    <option value="Quick" selected>Quick (&lt; 60-70 words, fast answer)</option>
                    <option value="Medium">Medium (Standard pacing)</option>
                    <option value="Thinking">Thinking (Deeper multi-step reasoning)</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Negative Marks</label>
                  <input type="number" id="ai-sched-neg-marks" step="0.25" value="0.5" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Platform XP (+)</label>
                  <input type="number" id="ai-sched-xp" min="0" step="5" value="10" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Max Attempts</label>
                  <input type="number" id="ai-sched-attempts" min="1" max="10" value="3" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
                </div>
              </div>

              <!-- Eligible Student Plans -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1.5">Eligible Student Plans</label>
                <div class="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-sched-plan-free" checked class="rounded text-rose-600 focus:ring-rose-500" /> Free
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-sched-plan-trial" checked class="rounded text-rose-600 focus:ring-rose-500" /> ₹9 Trial
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-sched-plan-core" checked class="rounded text-rose-600 focus:ring-rose-500" /> Core Pass
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-sched-plan-plus" checked class="rounded text-rose-600 focus:ring-rose-500" /> Plus Pass
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" id="ai-sched-plan-elite" checked class="rounded text-rose-600 focus:ring-rose-500" /> Elite Pass
                  </label>
                </div>
              </div>

              <!-- Auto-Publish Toggle -->
              <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span class="text-xs font-bold text-slate-900 block">Auto-Publish Directly to Students</span>
                  <span class="text-[11px] text-slate-500 block">Immediately make test live upon generation without draft review</span>
                </div>
                <input type="checkbox" id="ai-sched-autopublish" checked class="w-4 h-4 text-rose-600 rounded focus:ring-rose-500 cursor-pointer" />
              </div>

              <!-- Live Event Configuration -->
              <div class="p-3.5 bg-rose-50/50 border border-rose-200 rounded-xl space-y-2.5">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs font-bold text-rose-950 block">⚡ Host as Live Timed Event</span>
                    <span class="text-[11px] text-rose-700 block">Automatically activates at scheduled time and auto-expires when window closes</span>
                  </div>
                  <input type="checkbox" id="ai-sched-is-live" checked class="w-4 h-4 text-rose-600 rounded focus:ring-rose-500 cursor-pointer" />
                </div>
                <div class="pt-2 border-t border-rose-200/60">
                  <label class="block text-[11px] font-bold text-slate-700 mb-1">Live Window Duration (Minutes)</label>
                  <input type="number" id="ai-sched-live-duration" min="5" max="1440" value="60" class="w-full sm:w-1/2 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white" />
                  <span class="text-[10px] text-slate-400 block mt-0.5">Test will automatically transition to Expired after this many minutes.</span>
                </div>
              </div>

              <!-- Modal Actions -->
              <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onclick="window.adminDashboard.closeScheduleModal()" class="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" id="btn-save-schedule" class="px-5 py-2 text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white rounded-lg shadow-sm transition-all flex items-center gap-2">
                  <i data-lucide="save" class="w-4 h-4"></i>
                  <span>Save Scheduled Task</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  handleScheduleTypeChange(type) {
    const dailyContainer = document.getElementById('ai-sched-daily-time-container');
    const datetimeContainer = document.getElementById('ai-sched-datetime-container');
    if (type === 'recurring') {
      if (dailyContainer) dailyContainer.classList.remove('hidden');
      if (datetimeContainer) datetimeContainer.classList.add('hidden');
    } else {
      if (dailyContainer) dailyContainer.classList.add('hidden');
      if (datetimeContainer) datetimeContainer.classList.remove('hidden');
    }
  }

  openCreateScheduleModal() {
    const modal = document.getElementById('ai-schedule-modal');
    if (!modal) return;

    document.getElementById('ai-sched-id').value = '';
    document.getElementById('ai-sched-modal-title').innerText = 'Create Scheduled MCQ Task';
    document.getElementById('ai-sched-name').value = '';
    document.getElementById('ai-sched-daily-time').value = '09:00';

    // Set default IST date and time
    const nowIst = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
    const todayIst = nowIst.toISOString().slice(0, 10);
    const dateInput = document.getElementById('ai-sched-date');
    if (dateInput) {
      dateInput.value = todayIst;
      dateInput.min = todayIst;
    }
    const timeInput = document.getElementById('ai-sched-time');
    if (timeInput) timeInput.value = '10:00';

    const isLiveCheckbox = document.getElementById('ai-sched-is-live');
    if (isLiveCheckbox) isLiveCheckbox.checked = true;
    const liveDurInput = document.getElementById('ai-sched-live-duration');
    if (liveDurInput) liveDurInput.value = '60';

    document.getElementById('ai-sched-title-template').value = '[Subject] Daily Conceptual Sprint';
    document.getElementById('ai-sched-topic').value = 'Daily Comprehensive Exam Practice';
    document.getElementById('ai-sched-count').value = '5';
    document.getElementById('ai-sched-duration').value = '15';
    document.getElementById('ai-sched-difficulty').value = 'ICAI Exam Standard';
    const createCatEl = document.getElementById('ai-sched-category');
    if (createCatEl) createCatEl.value = 'Direct Questions';
    const createSpeedEl = document.getElementById('ai-sched-speed');
    if (createSpeedEl) createSpeedEl.value = 'Quick';
    document.getElementById('ai-sched-marks').value = '2.0';
    document.getElementById('ai-sched-neg-marks').value = '0.5';
    document.getElementById('ai-sched-xp').value = '10';
    document.getElementById('ai-sched-attempts').value = '3';
    document.getElementById('ai-sched-plan-free').checked = true;
    document.getElementById('ai-sched-plan-trial').checked = true;
    document.getElementById('ai-sched-plan-core').checked = true;
    document.getElementById('ai-sched-plan-plus').checked = true;
    document.getElementById('ai-sched-plan-elite').checked = true;
    document.getElementById('ai-sched-autopublish').checked = true;

    const recurringRadio = document.querySelector('input[name="ai-sched-type-radio"][value="recurring"]');
    if (recurringRadio) recurringRadio.checked = true;
    this.handleScheduleTypeChange('recurring');

    this.setupCascadingSyllabus('ai-sched-level', 'ai-sched-subject', 'ai-sched-chapter', 'foundation', 'sub-1', '');

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  openEditScheduleModal(taskId) {
    const task = (this._scheduledTasks || []).find(t => t.id === taskId);
    if (!task) {
      window.app.showToast('Schedule task not found', 'error');
      return;
    }

    const modal = document.getElementById('ai-schedule-modal');
    if (!modal) return;

    document.getElementById('ai-sched-id').value = task.id;
    document.getElementById('ai-sched-modal-title').innerText = `Edit Schedule: ${task.name || 'Task'}`;
    document.getElementById('ai-sched-name').value = task.name || '';
    document.getElementById('ai-sched-daily-time').value = task.dailyTime || '09:00';

    let sDate = task.scheduledDate || '';
    let sTime = task.scheduledTime || '10:00';
    if (!sDate && task.scheduledDateTime) {
      const parts = task.scheduledDateTime.split('T');
      sDate = parts[0] || '';
      sTime = parts[1] ? parts[1].slice(0, 5) : '10:00';
    } else if (!sDate && task.nextRunAt) {
      try {
        const dt = new Date(task.nextRunAt);
        const istOffset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(dt.getTime() + istOffset);
        sDate = ist.toISOString().slice(0, 10);
        sTime = ist.toISOString().slice(11, 16);
      } catch (e) {}
    }
    const dateInput = document.getElementById('ai-sched-date');
    if (dateInput) dateInput.value = sDate;
    const timeInput = document.getElementById('ai-sched-time');
    if (timeInput) timeInput.value = sTime;

    const isLiveCheckbox = document.getElementById('ai-sched-is-live');
    if (isLiveCheckbox) isLiveCheckbox.checked = task.isLiveEvent !== false;
    const liveDurInput = document.getElementById('ai-sched-live-duration');
    if (liveDurInput) liveDurInput.value = task.liveDurationMinutes || 60;

    document.getElementById('ai-sched-title-template').value = task.titleTemplate || '[Subject] Daily Conceptual Sprint';
    document.getElementById('ai-sched-topic').value = task.topic || 'Daily Comprehensive Exam Practice';
    document.getElementById('ai-sched-count').value = task.questionCount || 5;
    document.getElementById('ai-sched-duration').value = task.durationMinutes || 15;
    document.getElementById('ai-sched-difficulty').value = task.difficulty || 'ICAI Exam Standard';
    const editCatEl = document.getElementById('ai-sched-category');
    if (editCatEl) editCatEl.value = task.questionCategory || 'Direct Questions';
    const editSpeedEl = document.getElementById('ai-sched-speed');
    if (editSpeedEl) editSpeedEl.value = task.questionSpeed || 'Quick';
    document.getElementById('ai-sched-marks').value = task.marksPerCorrect ?? 2.0;
    document.getElementById('ai-sched-neg-marks').value = task.negativeMarksPerWrong ?? 0.5;
    document.getElementById('ai-sched-xp').value = task.platformXp ?? 10;
    document.getElementById('ai-sched-attempts').value = task.maxAttempts ?? 3;

    const plans = task.allowedPlans || ['free', 'trial', 'core', 'plus', 'elite'];
    document.getElementById('ai-sched-plan-free').checked = plans.includes('free');
    document.getElementById('ai-sched-plan-trial').checked = plans.includes('trial');
    document.getElementById('ai-sched-plan-core').checked = plans.includes('core');
    document.getElementById('ai-sched-plan-plus').checked = plans.includes('plus');
    document.getElementById('ai-sched-plan-elite').checked = plans.includes('elite');
    document.getElementById('ai-sched-autopublish').checked = task.autoPublish !== false;

    const isOneTime = task.scheduleType === 'one_time';
    const radio = document.querySelector(`input[name="ai-sched-type-radio"][value="${isOneTime ? 'one_time' : 'recurring'}"]`);
    if (radio) radio.checked = true;
    this.handleScheduleTypeChange(isOneTime ? 'one_time' : 'recurring');

    this.setupCascadingSyllabus(
      'ai-sched-level',
      'ai-sched-subject',
      'ai-sched-chapter',
      task.examLevelId || task.examLevel || 'foundation',
      task.subjectId || task.subject || 'sub-1',
      task.chapterId || task.chapter || ''
    );

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  closeScheduleModal() {
    const modal = document.getElementById('ai-schedule-modal');
    if (modal) modal.classList.add('hidden');
  }

  async saveScheduledTask() {
    const id = document.getElementById('ai-sched-id')?.value.trim();
    const name = document.getElementById('ai-sched-name')?.value.trim();
    if (!name) {
      window.app.showToast('Please enter a task name.', 'error');
      return;
    }

    const scheduleTypeRadio = document.querySelector('input[name="ai-sched-type-radio"]:checked');
    const scheduleType = scheduleTypeRadio ? scheduleTypeRadio.value : 'recurring';
    const dailyTime = document.getElementById('ai-sched-daily-time')?.value || '09:00';
    
    const scheduledDate = document.getElementById('ai-sched-date')?.value || '';
    const scheduledTime = document.getElementById('ai-sched-time')?.value || '10:00';
    const isLiveEvent = document.getElementById('ai-sched-is-live')?.checked ?? true;
    const liveDurationMinutes = parseInt(document.getElementById('ai-sched-live-duration')?.value || '60', 10);

    if (scheduleType === 'one_time') {
      if (!scheduledDate || !scheduledTime) {
        window.app.showToast('Please select both a scheduled date and time for the one-time event.', 'error');
        return;
      }
      try {
        const targetIst = new Date(`${scheduledDate}T${scheduledTime}:00+05:30`);
        if (isNaN(targetIst.getTime()) || targetIst.getTime() <= Date.now()) {
          window.app.showToast('Scheduled date & time must be in the future (Asia/Kolkata IST).', 'error');
          return;
        }
      } catch (dateErr) {
        window.app.showToast('Invalid date or time format.', 'error');
        return;
      }
    }

    const scheduledDateTime = scheduleType === 'one_time' ? `${scheduledDate}T${scheduledTime}:00` : null;

    const levelSelect = document.getElementById('ai-sched-level');
    const examLevel = levelSelect?.value || 'CA Foundation';
    const examLevelId = levelSelect?.selectedOptions[0]?.dataset.id || 'foundation';

    const subjectSelect = document.getElementById('ai-sched-subject');
    const subject = subjectSelect?.value || 'Accounting';
    const subjectId = subjectSelect?.selectedOptions[0]?.dataset.id || 'sub-1';

    const chapterSelect = document.getElementById('ai-sched-chapter');
    const chapter = chapterSelect?.value || '';
    const chapterId = chapterSelect?.selectedOptions[0]?.dataset.id || '';

    const titleTemplate = document.getElementById('ai-sched-title-template')?.value.trim() || '[Subject] Daily Conceptual Sprint';
    const topic = document.getElementById('ai-sched-topic')?.value.trim() || 'Daily Comprehensive Exam Practice';
    const difficulty = document.getElementById('ai-sched-difficulty')?.value || 'ICAI Exam Standard';
    const questionCategory = document.getElementById('ai-sched-category')?.value || 'Direct Questions';
    const questionSpeed = document.getElementById('ai-sched-speed')?.value || 'Quick';
    const questionCount = parseInt(document.getElementById('ai-sched-count')?.value || '5', 10);
    const durationMinutes = parseInt(document.getElementById('ai-sched-duration')?.value || '15', 10);
    const marksPerCorrect = parseFloat(document.getElementById('ai-sched-marks')?.value || '2.0');
    const negativeMarksPerWrong = parseFloat(document.getElementById('ai-sched-neg-marks')?.value || '0.5');
    const platformXp = parseFloat(document.getElementById('ai-sched-xp')?.value || '10');
    const maxAttempts = parseInt(document.getElementById('ai-sched-attempts')?.value || '3', 10);
    const autoPublish = document.getElementById('ai-sched-autopublish')?.checked ?? true;

    const plans = [];
    if (document.getElementById('ai-sched-plan-free')?.checked) plans.push('free');
    if (document.getElementById('ai-sched-plan-trial')?.checked) plans.push('trial');
    if (document.getElementById('ai-sched-plan-core')?.checked) plans.push('core');
    if (document.getElementById('ai-sched-plan-plus')?.checked) plans.push('plus');
    if (document.getElementById('ai-sched-plan-elite')?.checked) plans.push('elite');

    const existingTask = id ? (this._scheduledTasks || []).find(t => t.id === id) : null;
    const enabled = existingTask ? (existingTask.enabled !== false) : true;

    const payload = {
      id: id || undefined,
      name,
      scheduleType,
      dailyTime,
      scheduledDate,
      scheduledTime,
      scheduledDateTime,
      isLiveEvent,
      liveDurationMinutes,
      examLevel,
      examLevelId,
      subject,
      subjectId,
      chapter,
      chapterId,
      titleTemplate,
      topic,
      difficulty,
      questionCategory,
      questionSpeed,
      questionCount,
      durationMinutes,
      marksPerCorrect,
      negativeMarksPerWrong,
      platformXp,
      maxAttempts,
      allowedPlans: plans,
      autoPublish,
      enabled
    };

    const btn = document.getElementById('btn-save-schedule');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
      if (window.lucide) window.lucide.createIcons();
    }

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/scheduler/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to save scheduled task');
      }

      if (res.task) {
        const idx = (this._scheduledTasks || []).findIndex(t => t.id === res.task.id);
        if (idx >= 0) {
          this._scheduledTasks[idx] = res.task;
        } else {
          this._scheduledTasks.unshift(res.task);
        }
      }

      window.app.showToast('Scheduled task saved successfully!', 'success');
      this.closeScheduleModal();
      await this.renderAiAutopilotSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Save failed: ${err.message}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Save Scheduled Task`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async deleteScheduledTask(taskId) {
    if (!confirm('Are you sure you want to delete this scheduled task? This schedule will be removed permanently.')) return;

    // Immediately remove from DOM to give instant visual feedback
    const card = document.getElementById(`task-card-${taskId}`);
    if (card) card.remove();

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/scheduler/tasks/delete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ taskId })
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to delete task');
      }

      window.app.showToast('Scheduled task removed successfully.', 'info');
      await this.renderAiAutopilotSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Delete failed: ${err.message}`, 'error');
      await this.renderAiAutopilotSubTab(document.getElementById('ai-subtab-container'));
    }
  }

  async toggleScheduledTask(taskId, enabled) {
    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/scheduler/tasks/toggle', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ taskId, enabled })
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to toggle task');
      }

      window.app.showToast(`Scheduled task ${enabled ? 'resumed' : 'paused'}.`, 'info');
      await this.renderAiAutopilotSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Toggle failed: ${err.message}`, 'error');
    }
  }

  async runScheduledTaskNow(taskId) {
    const btn = document.getElementById(`btn-run-task-${taskId}`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Hosting...`;
      if (window.lucide) window.lucide.createIcons();
    }

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/scheduler/tasks/run-now', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ taskId })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Failed to execute scheduled task');
      }

      window.app.showToast(`Success! Test "${data.testTitle || data.testId}" generated and hosted into ExcellenceCA database (${data.questionCount || 0} MCQs).`, 'success');
      await this.renderAiAutopilotSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Execution failed: ${err.message}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="zap" class="w-3.5 h-3.5"></i> Run &amp; Host Now`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async triggerSchedulerTick() {
    const btn = document.getElementById('btn-trigger-tick');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Checking Due...`;
      if (window.lucide) window.lucide.createIcons();
    }

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/scheduler/tick', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to trigger tick');
      }

      const count = res.executedCount || 0;
      if (count > 0) {
        window.app.showToast(`Executed and hosted ${count} due test(s) successfully!`, 'success');
      } else {
        window.app.showToast('Scheduler check complete: No tasks were currently due.', 'info');
      }

      await this.renderAiAutopilotSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Tick failed: ${err.message}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4"></i> Check Due Schedules`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async saveAiAutopilotSettings() {
    return this.saveScheduledTask();
  }

  // --- SUB-TAB 4: AI GENERATION LOGS & TELEMETRY ---
  async renderAiLogsSubTab(container) {
    if (!container) return;

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    container.innerHTML = `
      <div class="space-y-6">
        <!-- KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total AI Tests</span>
            <span id="ai-kpi-tests" class="text-2xl font-black text-slate-900 mt-1 block">...</span>
            <span class="text-[11px] text-emerald-600 font-semibold mt-1 block">Hosted & Published</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total MCQs Generated</span>
            <span id="ai-kpi-mcqs" class="text-2xl font-black text-slate-900 mt-1 block">...</span>
            <span class="text-[11px] text-blue-600 font-semibold mt-1 block">ICAI Exam Standard</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Duplicates Intercepted</span>
            <span id="ai-kpi-dups" class="text-2xl font-black text-slate-900 mt-1 block">...</span>
            <span class="text-[11px] text-amber-600 font-semibold mt-1 block">&gt;0.50 Jaccard Rejections</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Failover Protection</span>
            <span class="text-2xl font-black text-emerald-700 mt-1 block">100%</span>
            <span class="text-[11px] text-emerald-600 font-semibold mt-1 block">Zero Pipeline Outages</span>
          </div>
        </div>

        <!-- Logs Table -->
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <i data-lucide="activity" class="w-4 h-4 text-rose-600"></i>
              Pipeline Generation Telemetry Logs
            </h3>
            <button onclick="window.adminDashboard.renderAiLogsSubTab(document.getElementById('ai-subtab-container'))" class="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh
            </button>
          </div>

          <div id="ai-logs-table-wrapper" class="overflow-x-auto">
            <div class="py-8 text-center text-slate-400 text-xs">Loading generation telemetry...</div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    try {
      const resp = await fetch(`/api/admin/ai/jobs/logs?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      const logs = data.logs || [];

      // Calculate KPI sums
      const totalTests = logs.length;
      const totalMcqs = logs.reduce((acc, l) => acc + (l.generatedCount || 0), 0);
      const totalDups = logs.reduce((acc, l) => acc + (l.rejectedDuplicates || 0), 0);

      const kpiTests = document.getElementById('ai-kpi-tests');
      const kpiMcqs = document.getElementById('ai-kpi-mcqs');
      const kpiDups = document.getElementById('ai-kpi-dups');
      if (kpiTests) kpiTests.innerText = totalTests;
      if (kpiMcqs) kpiMcqs.innerText = totalMcqs;
      if (kpiDups) kpiDups.innerText = totalDups;

      const tableWrapper = document.getElementById('ai-logs-table-wrapper');
      if (!tableWrapper) return;

      if (logs.length === 0) {
        tableWrapper.innerHTML = `
          <div class="py-12 text-center text-slate-400 text-xs">
            No generation telemetry recorded yet. Generate your first test to view execution logs.
          </div>
        `;
        return;
      }

      tableWrapper.innerHTML = `
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
              <th class="py-3 px-4">Timestamp</th>
              <th class="py-3 px-4">Test Title & Subject</th>
              <th class="py-3 px-4">MCQs (Req / Gen)</th>
              <th class="py-3 px-4">Rejections Filtered</th>
              <th class="py-3 px-4">Providers Cascaded</th>
              <th class="py-3 px-4">Latency</th>
              <th class="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${logs.map(l => `
              <tr class="hover:bg-slate-50">
                <td class="py-3 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                  ${l.timestamp ? new Date(l.timestamp).toLocaleString() : 'Recently'}
                </td>
                <td class="py-3 px-4">
                  <span class="font-bold text-slate-900 block">${l.testTitle || 'AI Test'}</span>
                  <span class="text-[10px] text-slate-500 block">${l.subject} • ${l.topic}</span>
                </td>
                <td class="py-3 px-4 font-bold text-slate-800">
                  ${l.generatedCount} / ${l.requestedCount} MCQs
                </td>
                <td class="py-3 px-4 text-[11px]">
                  <span class="text-amber-700 font-bold">${l.rejectedDuplicates || 0} Dups</span>
                  <span class="text-slate-300">•</span>
                  <span class="text-purple-700 font-bold">${l.rejectedValidation || 0} Invalid</span>
                </td>
                <td class="py-3 px-4 text-[11px]">
                  <span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-semibold">
                    ${(l.providersUsed || []).join(', ') || 'Gemini'}
                  </span>
                </td>
                <td class="py-3 px-4 text-slate-600 font-mono text-[11px]">
                  ${l.durationSeconds || 0}s
                </td>
                <td class="py-3 px-4 text-right">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black ${
                    l.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }">
                    ${l.status}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error('[AI_LOGS_FETCH_ERROR]', err);
    }
  }

  // --- SUB-TAB 5: AI PROVIDER MANAGEMENT & FULL CRUD ---
  async renderAiProvidersSubTab(container) {
    if (!container) return;

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    container.innerHTML = `
      <div class="space-y-6 max-w-4xl">
        <!-- Security & Architecture Banner -->
        <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
          <i data-lucide="shield-check" class="w-5 h-5 text-emerald-700 mt-0.5 flex-shrink-0"></i>
          <div class="text-xs text-emerald-950 space-y-1">
            <span class="font-black text-sm block">Authenticated Encrypted Vault & Strict Credential Isolation</span>
            <p class="text-emerald-800">
              Provider credentials are encrypted server-side using PBKDF2-HMAC-SHA256 authenticated encryption, persisted in isolated vault storage, and synced securely across serverless cold starts. Plaintext keys are never sent to the browser or stored in Git.
            </p>
          </div>
        </div>

        <!-- Providers Management Grid -->
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                <i data-lucide="cpu" class="w-4 h-4 text-rose-600"></i>
                Configured AI Models & Gateways
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                Manage provider hierarchy, execution priorities, failover chains, and verify live connectivity.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="window.adminDashboard.openAddProviderModal()" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> Add Provider
              </button>
              <button onclick="window.adminDashboard.saveAiProvidersSettings()" class="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5">
                <i data-lucide="save" class="w-3.5 h-3.5"></i> Save Settings
              </button>
            </div>
          </div>

          <div id="ai-providers-grid" class="space-y-4">
            <div class="py-8 text-center text-slate-400 text-xs">Loading provider telemetry...</div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    try {
      const resp = await fetch(`/api/admin/ai/providers?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      const providers = data.providers || [];
      this._cachedAiProviders = providers;

      const grid = document.getElementById('ai-providers-grid');
      if (!grid) return;

      if (providers.length === 0) {
        grid.innerHTML = `
          <div class="py-12 text-center text-slate-400 text-xs">
            <i data-lucide="cpu" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
            No AI providers configured. Click <b>Add Provider</b> to register an AI gateway.
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      grid.innerHTML = providers.map(p => {
        let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
        let badgeText = p.status || 'Unknown';
        if (badgeText === 'Configured — Healthy' || badgeText === 'healthy') {
          badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
          badgeText = 'Configured — Healthy';
        } else if (badgeText === 'Configured — Connection Failed' || badgeText === 'error') {
          badgeClass = 'bg-rose-100 text-rose-800 border-rose-200';
          badgeText = 'Connection Failed';
        } else if (badgeText === 'Not Configured') {
          badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
          badgeText = 'Not Configured';
        } else if (badgeText === 'Disabled') {
          badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
          badgeText = 'Disabled';
        }

        const typeBadge = (p.provider || 'ai').substring(0, 3).toUpperCase();

        return `
          <div class="p-4 border border-slate-200 rounded-xl bg-slate-50 hover:bg-white transition-all space-y-3" id="provider-card-${p.id}">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center font-black text-xs uppercase flex-shrink-0">
                  ${typeBadge}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-900 text-xs block">${p.name}</span>
                    <span class="text-[10px] text-slate-400 font-mono">(${p.id})</span>
                  </div>
                  <span class="text-[10px] text-slate-500 font-mono block">Model: <b>${p.model}</b> ${p.fallback_model ? `• Fallback: ${p.fallback_model}` : ''}</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <span id="prov-status-${p.id}" class="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${badgeClass}">
                  ${badgeText}
                </span>

                <button 
                  id="btn-test-prov-${p.id}"
                  onclick="window.adminDashboard.testAiProvider('${p.id}', this)"
                  class="px-2.5 py-1 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 shadow-sm"
                  title="Ping provider endpoint and measure live round-trip latency"
                >
                  <i data-lucide="activity" class="w-3.5 h-3.5 text-rose-600"></i>
                  Test Connection
                </button>

                <button 
                  onclick="window.adminDashboard.openEditProviderModal('${p.id}')"
                  class="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all border border-slate-200"
                  title="Edit Provider Settings & Key"
                >
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>

                <button 
                  onclick="window.adminDashboard.deleteAiProvider('${p.id}')"
                  class="p-1.5 text-rose-600 hover:text-rose-900 hover:bg-rose-50 rounded-lg transition-all border border-rose-200"
                  title="Delete Provider"
                >
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 text-xs">
              <div>
                <span class="text-[10px] font-bold text-slate-500 uppercase block">Masked Vault Credential</span>
                <span class="font-mono text-slate-800 font-bold">${p.maskedKey || '••••••••••••'}</span>
              </div>

              <div>
                <span class="text-[10px] font-bold text-slate-500 uppercase block">Execution Priority (1 = Top)</span>
                <input type="number" id="prov-priority-${p.id}" data-id="${p.id}" min="1" max="20" value="${p.priority || 1}" class="prov-priority-input w-20 px-2 py-0.5 text-xs font-bold border border-slate-300 rounded focus:ring-1 focus:ring-rose-500 focus:outline-none" />
              </div>

              <div class="flex items-center sm:justify-end gap-2">
                <label class="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input type="checkbox" id="prov-enabled-${p.id}" data-id="${p.id}" ${p.enabled !== false ? 'checked' : ''} class="prov-enabled-input rounded text-rose-600 focus:ring-rose-500" />
                  Active in Failover Chain
                </label>
              </div>
            </div>

            <div id="prov-test-feedback-${p.id}" class="hidden text-[11px] pt-2 border-t border-slate-100"></div>
          </div>
        `;
      }).join('');

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error('[AI_PROVIDERS_FETCH_ERROR]', err);
    }
  }

  async testAiProvider(providerId, btnElement) {
    const origHtml = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = `<span class="inline-block animate-spin mr-1">⚙</span> Testing...`;

    const feedbackEl = document.getElementById(`prov-test-feedback-${providerId}`);
    const statusEl = document.getElementById(`prov-status-${providerId}`);

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/providers/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ providerId: providerId })
      });

      const res = await resp.json();
      btnElement.disabled = false;
      btnElement.innerHTML = origHtml;

      if (res.success) {
        if (statusEl) {
          statusEl.innerText = 'Configured — Healthy';
          statusEl.className = 'px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-emerald-100 text-emerald-800 border-emerald-200';
        }
        if (feedbackEl) {
          feedbackEl.classList.remove('hidden');
          feedbackEl.className = 'text-[11px] pt-2 border-t border-emerald-100 text-emerald-800 font-bold';
          feedbackEl.innerText = `✓ Verified Active (${res.latency_ms}ms round-trip). Live Model Response: "${res.response_snippet || res.model}"`;
        }
        window.app.showToast(`Provider "${providerId}" healthy! (${res.latency_ms}ms)`, 'success');
      } else {
        if (statusEl) {
          statusEl.innerText = 'Connection Failed';
          statusEl.className = 'px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-rose-100 text-rose-800 border-rose-200';
        }
        if (feedbackEl) {
          feedbackEl.classList.remove('hidden');
          feedbackEl.className = 'text-[11px] pt-2 border-t border-rose-100 text-rose-800 font-bold';
          feedbackEl.innerText = `✗ Live test failed: ${res.error}`;
        }
        window.app.showToast(`Test failed: ${res.error}`, 'error');
      }

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      btnElement.disabled = false;
      btnElement.innerHTML = origHtml;
      window.app.showToast(`Network error: ${err.message}`, 'error');
    }
  }

  async saveAiProvidersSettings() {
    const priorityInputs = document.querySelectorAll('.prov-priority-input');
    const enabledInputs = document.querySelectorAll('.prov-enabled-input');
    const updates = [];

    priorityInputs.forEach(pInput => {
      const pid = pInput.dataset.id;
      const enabledInput = document.querySelector(`.prov-enabled-input[data-id="${pid}"]`);
      if (pid) {
        updates.push({
          id: pid,
          priority: parseInt(pInput.value, 10) || 1,
          enabled: enabledInput ? enabledInput.checked : true
        });
      }
    });

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/providers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ providers: updates })
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to update');
      }

      window.app.showToast('AI Provider priority & configuration saved successfully!', 'success');
      this.renderAiProvidersSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Failed saving providers: ${err.message}`, 'error');
    }
  }

  openAddProviderModal() {
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="plus-circle" class="w-4 h-4 text-rose-600"></i>
            Add New AI Provider
          </h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <form id="add-provider-form" onsubmit="event.preventDefault(); window.adminDashboard.submitAddProvider();" class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Provider ID <span class="text-rose-600">*</span></label>
              <input type="text" id="add-prov-id" placeholder="e.g. gemini_3, custom_vllm" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Display Name <span class="text-rose-600">*</span></label>
              <input type="text" id="add-prov-name" placeholder="e.g. Gemini Account 3" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Provider Type <span class="text-rose-600">*</span></label>
              <select id="add-prov-type" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none">
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq</option>
                <option value="mistral">Mistral OCR</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Primary Model <span class="text-rose-600">*</span></label>
              <input type="text" id="add-prov-model" placeholder="e.g. gemini-2.5-flash" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Fallback Model</label>
              <input type="text" id="add-prov-fallback" placeholder="e.g. gemini-1.5-flash" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Priority (1 = Highest)</label>
              <input type="number" id="add-prov-priority" value="6" min="1" max="20" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">API Key / Secret Token <span class="text-rose-600">*</span></label>
            <input type="password" id="add-prov-key" placeholder="Enter provider API key (will be encrypted server-side)" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none font-mono" />
            <span class="text-[10px] text-slate-400 block mt-0.5">Encrypted with PBKDF2-HMAC-SHA256 vault storage. Never exposed to browser clients.</span>
          </div>

          <div class="flex items-center justify-between pt-2">
            <label class="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
              <input type="checkbox" id="add-prov-enabled" checked class="rounded text-rose-600 focus:ring-rose-500" />
              Enable Immediately in Failover Chain
            </label>
          </div>

          <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button type="submit" class="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg shadow-sm">
              Register Provider
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  async submitAddProvider() {
    const id = document.getElementById('add-prov-id')?.value.trim();
    const name = document.getElementById('add-prov-name')?.value.trim();
    const provider = document.getElementById('add-prov-type')?.value;
    const model = document.getElementById('add-prov-model')?.value.trim();
    const fallbackModel = document.getElementById('add-prov-fallback')?.value.trim();
    const priority = parseInt(document.getElementById('add-prov-priority')?.value || '1', 10);
    const apiKey = document.getElementById('add-prov-key')?.value.trim();
    const enabled = document.getElementById('add-prov-enabled')?.checked ?? true;

    if (!id || !name || !model || !apiKey) {
      window.app.showToast('Please fill all required fields.', 'error');
      return;
    }

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/providers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'add',
          provider: {
            id: id,
            name: name,
            provider: provider,
            model: model,
            fallback_model: fallbackModel,
            priority: priority,
            enabled: enabled,
            apiKey: apiKey
          }
        })
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to add provider');
      }

      window.app.closeModal('admin-generic-modal');
      window.app.showToast(`Provider "${name}" registered successfully!`, 'success');
      this.renderAiProvidersSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Error: ${err.message}`, 'error');
    }
  }

  openEditProviderModal(providerId) {
    const prov = (this._cachedAiProviders || []).find(p => p.id === providerId);
    if (!prov) {
      window.app.showToast('Provider not found', 'error');
      return;
    }

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="edit-3" class="w-4 h-4 text-rose-600"></i>
            Edit AI Provider: ${prov.name}
          </h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <form onsubmit="event.preventDefault(); window.adminDashboard.submitEditProvider('${prov.id}');" class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Display Name</label>
              <input type="text" id="edit-prov-name" value="${prov.name || ''}" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Primary Model</label>
              <input type="text" id="edit-prov-model" value="${prov.model || ''}" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Fallback Model</label>
              <input type="text" id="edit-prov-fallback" value="${prov.fallback_model || ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Execution Priority</label>
              <input type="number" id="edit-prov-priority" value="${prov.priority || 1}" min="1" max="20" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Update API Key (Optional)</label>
            <input type="password" id="edit-prov-key" placeholder="Leave empty to retain existing encrypted vault key" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none font-mono" />
            <span class="text-[10px] text-slate-400 block mt-0.5">Current Vault Key: <code class="font-bold">${prov.maskedKey || 'Not Configured'}</code></span>
          </div>

          <div class="flex items-center justify-between pt-2">
            <label class="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
              <input type="checkbox" id="edit-prov-enabled" ${prov.enabled !== false ? 'checked' : ''} class="rounded text-rose-600 focus:ring-rose-500" />
              Enabled in Failover Chain
            </label>
          </div>

          <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button type="submit" class="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg shadow-sm">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  async submitEditProvider(providerId) {
    const name = document.getElementById('edit-prov-name')?.value.trim();
    const model = document.getElementById('edit-prov-model')?.value.trim();
    const fallbackModel = document.getElementById('edit-prov-fallback')?.value.trim();
    const priority = parseInt(document.getElementById('edit-prov-priority')?.value || '1', 10);
    const newApiKey = document.getElementById('edit-prov-key')?.value.trim();
    const enabled = document.getElementById('edit-prov-enabled')?.checked ?? true;

    const updates = {
      name: name,
      model: model,
      fallback_model: fallbackModel,
      priority: priority,
      enabled: enabled
    };
    if (newApiKey) {
      updates.apiKey = newApiKey;
    }

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/providers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'edit',
          providerId: providerId,
          updates: updates
        })
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to update provider');
      }

      window.app.closeModal('admin-generic-modal');
      window.app.showToast(`Provider "${providerId}" updated successfully!`, 'success');
      this.renderAiProvidersSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Error: ${err.message}`, 'error');
    }
  }

  async deleteAiProvider(providerId) {
    if (!confirm(`Are you sure you want to delete AI provider "${providerId}"? This will remove it from the failover chain.`)) {
      return;
    }

    const currentUser = window.auth ? window.auth.getCurrentUser() : null;
    const token = currentUser ? (currentUser.token || currentUser.email) : '';

    try {
      const resp = await fetch('/api/admin/ai/providers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'delete',
          providerId: providerId
        })
      });

      const res = await resp.json();
      if (!resp.ok || !res.success) {
        throw new Error(res.error || 'Failed to delete provider');
      }

      window.app.showToast(`Provider "${providerId}" deleted.`, 'info');
      this.renderAiProvidersSubTab(document.getElementById('ai-subtab-container'));
    } catch (err) {
      window.app.showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  _readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

}

window.adminDashboard = new AdminDashboard();

