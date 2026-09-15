/**
 * app.js - Main Application Orchestrator & Router for ExcellenceCA
 * Supports hash-based direct URLs (#home, #admin, #teacher, #dashboard, etc.)
 */

class App {
  constructor() {
    this.currentView = 'home';
  }

  init() {
    // Capture referral code (?ref=USERNAME) from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');
    if (refParam) {
      sessionStorage.setItem('excellenceca_ref', refParam.trim());
    }

    window.auth.onAuthChange();

    // Navigation click listeners
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = el.getAttribute('data-nav');
        window.location.hash = targetView;
      });
    });

    // Hash change routing
    window.addEventListener('hashchange', () => this.handleHashChange());

    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Process initial route based on hash or default to home
    this.handleHashChange();

    // Set dynamic current year in footer
    const yearEl = document.getElementById('footer-current-year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }

    // Initialize centralized website updates banner slider
    if (window.bannerManager) {
      window.bannerManager.init();
    }

    this.updateNotificationBadge();

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  handleHashChange() {
    let rawHash = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '').trim();
    if (!rawHash) {
      const urlParams = new URLSearchParams(window.location.search);
      const vParam = urlParams.get('v');
      if (vParam) {
        rawHash = vParam.trim();
      } else {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart === 'test' || lastPart === 'tests') {
          rawHash = 'tests';
        } else {
          // Unauthenticated visitors or default landing opens Homepage
          rawHash = 'home';
        }
      }
    }

    let hash = rawHash;
    if (!hash || hash === '/' || hash === 'home') hash = 'home';
    if (hash === 'test' || hash === 'tests' || hash === '/test' || hash === '/tests') hash = 'tests';
    if (hash === 'passes' || hash === 'pricing' || hash === '/passes' || hash === '/pricing') hash = 'passes';

    // 403 Forbidden check for lectures: restricted for students and teachers (only admin allowed)
    if (hash === 'lectures') {
      if (!window.auth.isAdmin()) {
        this.navigate('403');
        this.showToast('403 Forbidden: Access to video lectures is restricted for students and faculty.', 'error');
        return;
      }
    }

    // Direct route checks
    if (hash === 'admin') {
      if (!window.auth.isAdmin()) {
        this.showToast('Please log in with Administrator credentials.', 'info');
        this.showAuthModal('admin-login');
        return;
      }
    } else if (hash === 'teacher') {
      if (!window.auth.isTeacher() && !window.auth.isAdmin()) {
        this.showToast('Please log in as Faculty / Teacher.', 'info');
        this.showAuthModal('teacher-login');
        return;
      }
    } else if (hash === 'dashboard') {
      // Unauthenticated visitor guard: Dashboard must NOT open directly
      if (!window.auth.isLoggedIn()) {
        this.redirectAfterLogin = 'dashboard';
        this.showToast('Please sign in to access your student dashboard.', 'info');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#home');
        }
        this.navigate('home');
        this.showAuthModal('login');
        return;
      }
    } else if (hash === 'leaderboard') {
      // Unauthenticated visitor guard: Leaderboard is login-protected
      if (!window.auth.isLoggedIn()) {
        this.redirectAfterLogin = 'leaderboard';
        this.showToast('Please sign in or create an account to access the Student Leaderboard.', 'info');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#home');
        }
        this.navigate('home');
        this.showAuthModal('login');
        return;
      }
    } else if (hash === 'profile') {
      // Unauthenticated visitor guard: Profile is login-protected
      if (!window.auth.isLoggedIn()) {
        this.redirectAfterLogin = 'profile';
        this.showToast('Please sign in to view your student profile.', 'info');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#home');
        }
        this.navigate('home');
        this.showAuthModal('login');
        return;
      }
    }

    // If navigating to register page, auto-fill referral code and update dynamic badge text
    if (hash === 'register') {
      setTimeout(() => {
        const refEl = document.getElementById('page-reg-ref');
        const savedRef = sessionStorage.getItem('excellenceca_ref');
        if (refEl && savedRef && !refEl.value) {
          refEl.value = savedRef;
        }
        // Dynamically update referral badge with configured rewards
        this._updateRegReferralBadge();
      }, 50);
    }

    this.navigate(hash);
  }

  navigate(viewName) {
    if (viewName === 'test') viewName = 'tests';

    // 403 Forbidden check for lectures: restricted for students and teachers
    if (viewName === 'lectures' && !window.auth.isAdmin()) {
      this.navigate('403');
      this.showToast('403 Forbidden: Access to video lectures is restricted for students and faculty.', 'error');
      return;
    }

    // Dashboard guard inside navigate as well
    if (viewName === 'dashboard' && !window.auth.isLoggedIn()) {
      this.redirectAfterLogin = 'dashboard';
      this.showToast('Please sign in to access your student dashboard.', 'info');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#home');
      }
      this.navigate('home');
      this.showAuthModal('login');
      return;
    }

    // Leaderboard login protection
    if (viewName === 'leaderboard' && !window.auth.isLoggedIn()) {
      this.redirectAfterLogin = 'leaderboard';
      this.showToast('Please sign in or create an account to access the Student Leaderboard.', 'info');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#home');
      }
      this.navigate('home');
      this.showAuthModal('login');
      return;
    }

    // Profile login protection
    if (viewName === 'profile' && !window.auth.isLoggedIn()) {
      this.redirectAfterLogin = 'profile';
      this.showToast('Please sign in to view your student profile.', 'info');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#home');
      }
      this.navigate('home');
      this.showAuthModal('login');
      return;
    }

    this.currentView = viewName;

    // View containers
    const views = [
      'view-home',
      'view-dashboard',
      'view-profile',
      'view-register',
      'view-lectures',
      'view-tests',
      'view-test-taking',
      'view-assignments',
      'view-leaderboard',
      'view-admin',
      'view-teacher',
      'view-passes',
      'view-403'
    ];

    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) {
        if (v === `view-${viewName}`) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    // Update active nav styling
    document.querySelectorAll('[data-nav]').forEach(link => {
      const linkTarget = link.getAttribute('data-nav');
      const isMatch = linkTarget === viewName || 
                      (linkTarget === 'tests' && (viewName === 'test' || viewName === 'tests')) ||
                      (linkTarget === 'passes' && (viewName === 'passes' || viewName === 'pricing'));
      
      if (isMatch) {
        if (linkTarget === 'passes') {
          link.classList.add('text-amber-900', 'bg-amber-100', 'font-bold');
          link.classList.remove('text-slate-600', 'text-amber-800');
        } else {
          link.classList.add('text-blue-600', 'bg-blue-50', 'font-bold');
          link.classList.remove('text-slate-600');
        }
      } else {
        if (linkTarget === 'passes') {
          link.classList.remove('text-amber-900', 'bg-amber-100');
          link.classList.add('text-amber-800');
        } else {
          link.classList.remove('text-blue-600', 'bg-blue-50', 'font-bold');
          link.classList.add('text-slate-600');
        }
      }
    });

    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.add('hidden');
    }

    // Trigger renderers
    if (viewName === 'dashboard') {
      window.studentDashboard.render();
    } else if (viewName === 'profile') {
      this.renderProfilePage();
    } else if (viewName === 'passes') {
      if (window.subscriptionManager && typeof window.subscriptionManager.renderPassesPage === 'function') {
        window.subscriptionManager.renderPassesPage();
      }
    } else if (viewName === 'lectures') {
      window.lecturePlayer.renderCatalog();
    } else if (viewName === 'tests') {
      window.testEngine.renderCatalog();
    } else if (viewName === 'test-taking') {
      if (window.testEngine) {
        if (!window.testEngine.activeTest) {
          const restored = window.testEngine.restoreExamSession();
          if (!restored) {
            this.navigate('tests');
          }
        } else {
          window.testEngine.renderExamInterface();
        }
      }
    } else if (viewName === 'assignments') {
      window.assignmentPortal.render();
    } else if (viewName === 'leaderboard') {
      window.leaderboardManager.render();
    } else if (viewName === 'admin') {
      window.adminDashboard.render();
    } else if (viewName === 'teacher') {
      window.teacherPortal.render();
    } else if (viewName === 'home') {
      if (window.auth && typeof window.auth.onAuthChange === 'function') {
        window.auth.onAuthChange();
      }
    }

    // Keep browser address bar URL hash synchronized with current view
    const cleanCurrentHash = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '').trim();
    if (cleanCurrentHash !== viewName && viewName !== '403') {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', `#${viewName}`);
      } else {
        window.location.hash = viewName;
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.lucide) window.lucide.createIcons();
  }

  toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
      mobileMenu.classList.toggle('hidden');
    }
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.body.classList.add('overflow-hidden');
      if (window.lucide) window.lucide.createIcons();
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      const openModals = document.querySelectorAll('.modal-backdrop.flex');
      if (!openModals || openModals.length === 0) {
        document.body.classList.remove('overflow-hidden');
      }
    }
  }

  // ==========================================
  // AUTHENTICATION MODAL (LOGIN & SIGNUP)
  // ==========================================
  showAuthModal(mode = 'login') {
    const modalContent = document.getElementById('auth-modal-content');
    if (!modalContent) return;

    let defaultEmail = '';
    let defaultPass = '';
    let roleLabel = 'Student Portal';

    if (mode === 'admin-login') {
      roleLabel = 'Administrator Portal';
    } else if (mode === 'teacher-login') {
      roleLabel = 'Faculty / Teacher Portal';
    } else if (mode === 'login') {
      roleLabel = 'Student Portal';
    }

    if (mode === 'signup') {
      const savedRef = sessionStorage.getItem('excellenceca_ref') || '';
      modalContent.innerHTML = `
        <div class="p-5 sm:p-8 max-h-[90vh] overflow-y-auto relative">
          <button type="button" onclick="window.app.closeModal('auth-modal')" class="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-600 p-2 rounded-lg cursor-pointer" aria-label="Close modal">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>

          <div class="text-center mb-5">
            <h3 class="text-xl font-black text-slate-900">Create ExcellenceCA Account</h3>
            <p class="text-xs text-slate-500 mt-1">Join India's premier Chartered Accountancy test platform</p>
          </div>

          <form onsubmit="window.app.handleSignupSubmit(event)" class="space-y-3 text-xs">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Username *</label>
                <input type="text" id="reg-username" required maxlength="10" placeholder="e.g. ram123" class="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input type="text" id="reg-name" required placeholder="Rohan Sharma" class="w-full px-3 py-2 border border-slate-300 rounded-lg">
              </div>
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Email Address *</label>
                <input type="email" id="reg-email" required placeholder="student@example.com" class="w-full px-3 py-2 border border-slate-300 rounded-lg">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Mobile Number *</label>
                <input type="tel" id="reg-phone" required placeholder="+91 98765 43210" class="w-full px-3 py-2 border border-slate-300 rounded-lg">
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">CA Level (Select from list) *</label>
              <select id="reg-level" required class="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-800 bg-white">
                <option value="" disabled selected>-- Select your CA Course Level --</option>
                <option value="CA FOUNDATION">CA FOUNDATION</option>
                <option value="CA INTERMEDIATE">CA INTERMEDIATE</option>
                <option value="CA FINAL">CA FINAL</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Referral Code (Optional)</span>
                <span class="text-[10px] text-emerald-600 font-bold">100 Pts to Referrer</span>
              </label>
              <input type="text" id="reg-ref" value="${savedRef}" placeholder="e.g. ram123 or @ram123" class="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Password (8+ chars) *</label>
                <div class="relative">
                  <input type="password" id="reg-pass" required placeholder="Letter + number/symbol" class="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg font-mono text-xs">
                  <button type="button" onclick="window.app.togglePasswordVisibility('reg-pass', this)" class="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Confirm *</label>
                <div class="relative">
                  <input type="password" id="reg-confirm" required placeholder="Re-enter" class="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg font-mono text-xs">
                  <button type="button" onclick="window.app.togglePasswordVisibility('reg-confirm', this)" class="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" class="w-full py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors mt-2 flex items-center justify-center gap-1.5">
              <i data-lucide="user-plus" class="w-4 h-4"></i> Complete Registration
            </button>
          </form>

          <div class="text-center mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600 flex flex-col gap-1.5">
            <div>
              Already registered? 
              <button onclick="window.app.showAuthModal('login')" class="font-bold text-blue-600 hover:underline">Log In</button>
            </div>
            <div>
              <button onclick="window.app.closeModal('auth-modal'); window.app.navigate('register');" class="text-[11px] text-slate-500 hover:text-blue-600 underline">
                Open Full Registration Page →
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      // Login mode (Student, Teacher, or Admin)
      modalContent.innerHTML = `
        <div class="p-5 sm:p-8 max-h-[90vh] overflow-y-auto relative">
          <button type="button" onclick="window.app.closeModal('auth-modal')" class="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-600 p-2 rounded-lg cursor-pointer" aria-label="Close modal">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>

          <div class="text-center mb-6">
            <img src="assets/brandlogo.png" alt="ExcellenceCA" class="h-12 w-auto mx-auto object-contain mb-2">
            <h3 class="text-xl font-black text-slate-900">Sign in to ExcellenceCA</h3>
            <span class="text-xs font-bold text-blue-600">${roleLabel}</span>
          </div>

          <form onsubmit="window.app.handleLoginSubmit(event)" class="space-y-4 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Username or Email Address</label>
              <input type="text" id="auth-email" required value="${defaultEmail}" placeholder="Enter your username or email" class="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium text-slate-800">
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="font-bold text-slate-700">Password</label>
              </div>
              <div class="relative">
                <input type="password" id="auth-password" required value="" placeholder="Enter your password" class="w-full pl-3.5 pr-10 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-slate-800">
                <button type="button" onclick="window.app.togglePasswordVisibility('auth-password', this)" class="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                  <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
              </div>
            </div>

            <button type="submit" class="w-full py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors mt-2 flex items-center justify-center gap-1.5">
              <i data-lucide="log-in" class="w-4 h-4"></i> Sign In to Account
            </button>
          </form>

          ${mode === 'login' ? `
            <div class="text-center mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
              Student without an account? 
              <button onclick="window.app.closeModal('auth-modal'); window.app.navigate('register');" class="font-bold text-blue-600 hover:underline">Register Now</button>
            </div>
          ` : mode === 'admin-login' ? `
            <div class="text-center mt-5 pt-4 border-t border-slate-100 text-[11px] text-slate-400">
              <i data-lucide="shield" class="w-3.5 h-3.5 inline text-amber-600"></i> Authorized administrative personnel only. Public registration is restricted.
            </div>
          ` : `
            <div class="text-center mt-5 pt-4 border-t border-slate-100 text-[11px] text-slate-400">
              <i data-lucide="user-check" class="w-3.5 h-3.5 inline text-blue-600"></i> Faculty access portal.
            </div>
          `}
        </div>
      `;
    }

    if (window.lucide) window.lucide.createIcons();
    this.openModal('auth-modal');
  }

  async handleLoginSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const identifier = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;

    const submitBtn = e && e.target ? e.target.querySelector('button[type="submit"]') : null;
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> Signing in...';
    }

    try {
      const res = await window.auth.login(identifier, pass);
      if (res.success) {
        this.closeModal('auth-modal');
        this.showToast(`Welcome back, ${res.user.name}!`, 'success');

        let target = 'dashboard';
        if (this.redirectAfterLogin) {
          target = this.redirectAfterLogin;
          this.redirectAfterLogin = null;
        } else if (res.user.role === 'admin') {
          target = 'admin';
        } else if (res.user.role === 'teacher') {
          target = 'teacher';
        } else {
          target = 'dashboard';
        }

        // Synchronously navigate and render target view immediately without page refresh
        this.navigate(target);

        // Keep address bar URL hash synchronized
        if (window.location.hash !== `#${target}` && window.location.hash !== target) {
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', `#${target}`);
          } else {
            window.location.hash = target;
          }
        }
      } else {
        this.showToast(res.error, 'error');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }
  }

  async handleSignupSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const caLevel = document.getElementById('reg-level').value;
    const pass = document.getElementById('reg-pass').value;
    const confirm = document.getElementById('reg-confirm').value;
    const ref = document.getElementById('reg-ref') ? document.getElementById('reg-ref').value.trim() : '';

    const submitBtn = e && e.target ? e.target.querySelector('button[type="submit"]') : null;
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-flex items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Registering...</span>';
    }

    try {
      const res = await window.auth.register(username, name, email, phone, caLevel, pass, confirm, 'student', 'Uttar Pradesh', 'Meerut', ref);
      if (res.success) {
        this.closeModal('auth-modal');
        let msg = `Registration complete! Welcome to ExcellenceCA, ${res.user.name} (${res.user.caLevel}).`;
        if (res.referredBy) {
          msg += ` Referred by ${res.referredBy} (+100 pts awarded).`;
        }
        this.showToast(msg, 'success');
        this.navigate('dashboard');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#dashboard');
        } else {
          window.location.hash = 'dashboard';
        }
      } else {
        this.showToast(res.error, 'error');
      }
    } catch (err) {
      this.showToast('Registration error: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async handlePageSignupSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const username = document.getElementById('page-reg-username').value.trim();
    const name = document.getElementById('page-reg-name').value.trim();
    const email = document.getElementById('page-reg-email').value.trim();
    const phone = document.getElementById('page-reg-phone').value.trim();
    const caLevel = document.getElementById('page-reg-level').value;
    const pass = document.getElementById('page-reg-pass').value;
    const confirm = document.getElementById('page-reg-confirm').value;
    const ref = document.getElementById('page-reg-ref') ? document.getElementById('page-reg-ref').value.trim() : '';

    const submitBtn = e && e.target ? e.target.querySelector('button[type="submit"]') : null;
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-flex items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Creating Account...</span>';
    }

    try {
      const res = await window.auth.register(username, name, email, phone, caLevel, pass, confirm, 'student', 'Uttar Pradesh', 'Meerut', ref);
      if (res.success) {
        let msg = `Account created successfully! Welcome to ExcellenceCA, ${res.user.name} (${res.user.caLevel}).`;
        if (res.referredBy) {
          msg += ` Referred by ${res.referredBy} (+100 pts awarded).`;
        }
        this.showToast(msg, 'success');
        const form = document.getElementById('page-registration-form');
        if (form) form.reset();
        this.navigate('dashboard');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#dashboard');
        } else {
          window.location.hash = 'dashboard';
        }
      } else {
        this.showToast(res.error, 'error');
      }
    } catch (err) {
      this.showToast('Registration error: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  // ==========================================
  // DEDICATED STUDENT PROFILE PAGE & SETTINGS
  // ==========================================
  openProfileModal() {
    this.navigate('profile');
  }

  renderProfilePage() {
    if (!window.auth.isLoggedIn()) {
      this.showToast('Please sign in to view your student profile.', 'info');
      this.navigate('home');
      this.showAuthModal('login');
      return;
    }

    const user = window.auth.getCurrentUser();
    if (!user) return;

    // 1. Header & Hero Values
    const avatarEl = document.getElementById('profile-page-avatar');
    if (avatarEl) avatarEl.src = user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120';

    const displayName = document.getElementById('profile-page-name');
    if (displayName) displayName.textContent = user.name || 'Student Name';

    const usernameTag = document.getElementById('profile-page-username');
    if (usernameTag) usernameTag.textContent = '@' + (user.username || 'student');

    const roleBadge = document.getElementById('profile-page-role-badge');
    if (roleBadge) roleBadge.textContent = (user.role || 'STUDENT').toUpperCase();

    const levelBadge = document.getElementById('profile-page-level-badge');
    if (levelBadge) levelBadge.textContent = (user.caLevel || 'CA INTERMEDIATE').toUpperCase();

    // 2. Academic Standing & Authoritative XP
    const rankNumEl = document.getElementById('profile-page-rank-number');
    const tierNameEl = document.getElementById('profile-page-tier-name');
    const xpDisplayEl = document.getElementById('profile-page-xp-display');
    const tierIconContainer = document.getElementById('profile-page-tier-icon-container');

    let xpVal = 0;
    if (window.rankService && typeof window.rankService.getUserTotalXp === 'function') {
      xpVal = window.rankService.getUserTotalXp(user.id);
    } else if (window.store && typeof window.store.getUserTotalXp === 'function') {
      xpVal = window.store.getUserTotalXp(user.id);
    } else {
      xpVal = user.totalXp !== undefined ? Number(user.totalXp) : (user.baseXp !== undefined ? Number(user.baseXp) : 0);
    }

    const tierData = window.rankService 
      ? window.rankService.resolveTier(xpVal) 
      : (window.store && window.store.resolveTier ? window.store.resolveTier(xpVal) : null);
    const tierObj = tierData ? tierData.currentTier : { id: 'rookie_3', name: 'Rookie III', family: 'Rookie' };

    let rankVal = '#--';
    if (window.leaderboardManager && typeof window.leaderboardManager.getStudentRank === 'function') {
      const r = window.leaderboardManager.getStudentRank(user.id);
      if (r) rankVal = '#' + r;
    }

    if (rankNumEl) rankNumEl.textContent = rankVal;
    if (tierNameEl) tierNameEl.textContent = tierObj.name;
    if (xpDisplayEl) xpDisplayEl.textContent = xpVal.toLocaleString() + ' Total XP';
    if (tierIconContainer && window.leaderboardManager && window.leaderboardManager.getTierBadgeSvg) {
      tierIconContainer.innerHTML = window.leaderboardManager.getTierBadgeSvg(tierObj, 52);
    }

    // Render Authoritative XP Activity Ledger
    this.renderProfileXpHistory(user.id, xpVal);

    // 3. Edit Form Pre-fill
    const editName = document.getElementById('profile-page-edit-name');
    if (editName) editName.value = user.name || '';

    const editLevel = document.getElementById('profile-page-edit-level');
    if (editLevel) {
      const userLevel = (user.caLevel || 'CA INTERMEDIATE').toUpperCase();
      if (userLevel.includes('FOUNDATION')) editLevel.value = 'CA FOUNDATION';
      else if (userLevel.includes('FINAL')) editLevel.value = 'CA FINAL';
      else editLevel.value = 'CA INTERMEDIATE';
    }

    // Populate States & Districts
    const stateSelect = document.getElementById('profile-page-edit-state');
    const statesMap = window.INDIA_STATES_AND_DISTRICTS || {};
    const stateNames = Object.keys(statesMap);

    if (stateSelect && stateNames.length > 0) {
      const userState = user.state || 'Uttar Pradesh';
      stateSelect.innerHTML = stateNames.map(s => 
        `<option value="${s}" ${s === userState ? 'selected' : ''}>${s}</option>`
      ).join('');

      this.handleProfilePageStateChange(userState, user.district);
    }

    // 4. Referral Section
    const cleanUsername = (user.username || user.id).replace(/^@+/, '');
    const refCodeEl = document.getElementById('profile-page-referral-code');
    if (refCodeEl) refCodeEl.textContent = cleanUsername;

    const allReferrals = window.store && window.store.getReferrals ? window.store.getReferrals() : [];
    const myReferrals = allReferrals.filter(r => 
      r.referrerId === user.id || 
      (r.referrerUsername && r.referrerUsername.replace(/^@+/, '').toLowerCase() === cleanUsername.toLowerCase())
    );

    const refCountEl = document.getElementById('profile-page-referral-count');
    if (refCountEl) refCountEl.textContent = myReferrals.length;

    const refPointsEl = document.getElementById('profile-page-referral-points');
    const totalPoints = user.referralPoints !== undefined ? user.referralPoints : (myReferrals.length * 100);
    if (refPointsEl) refPointsEl.textContent = totalPoints;

    // Referred Students Table (5 per page)
    const tbody = document.getElementById('profile-page-referred-tbody');
    const refPagContainer = document.getElementById('profile-page-referred-pagination');

    this.referredPage = this.referredPage || 1;
    const refPageSize = 5;
    const totalRefPages = Math.max(1, Math.ceil(myReferrals.length / refPageSize));
    if (this.referredPage > totalRefPages) this.referredPage = totalRefPages;
    const refStartIndex = (this.referredPage - 1) * refPageSize;
    const pagedReferrals = myReferrals.slice(refStartIndex, refStartIndex + refPageSize);

    if (tbody) {
      if (myReferrals.length === 0) {
        if (refPagContainer) refPagContainer.classList.add('hidden');
        tbody.innerHTML = `
          <tr>
            <td colspan="3" class="px-3 py-6 text-center text-slate-400">
              <i data-lucide="gift" class="w-6 h-6 mx-auto mb-1 text-slate-300"></i>
              No students have registered using your code yet.<br>
              Share your referral code <strong>${cleanUsername}</strong> to earn 100 bonus points!
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = pagedReferrals.map(r => {
          const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Verified';
          const studentCleanUsername = (r.referredUsername || 'student').replace(/^@+/, '');
          return `
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="px-3 py-2.5">
                <span class="font-bold text-slate-800 block">${r.referredName || 'Student'}</span>
                <span class="text-[11px] text-blue-600 font-mono">${studentCleanUsername}</span>
              </td>
              <td class="px-3 py-2.5">
                <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700">
                  ${r.examLevel || 'CA Student'}
                </span>
                <span class="text-[10px] text-slate-400 block mt-0.5">${dateStr}</span>
              </td>
              <td class="px-3 py-2.5">
                <span class="text-xs font-black text-emerald-700">+100 Pts</span>
              </td>
            </tr>
          `;
        }).join('');

        if (refPagContainer) {
          if (totalRefPages > 1) {
            refPagContainer.classList.remove('hidden');
            refPagContainer.innerHTML = `
              <div class="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span>Showing ${refStartIndex + 1} to ${Math.min(refStartIndex + refPageSize, myReferrals.length)} of ${myReferrals.length}</span>
                <div class="flex items-center gap-1">
                  <button 
                    type="button" 
                    onclick="window.app.setReferredPage(${this.referredPage - 1})" 
                    ${this.referredPage <= 1 ? 'disabled' : ''} 
                    class="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                  >
                    Prev
                  </button>
                  <button 
                    type="button" 
                    onclick="window.app.setReferredPage(${this.referredPage + 1})" 
                    ${this.referredPage >= totalRefPages ? 'disabled' : ''} 
                    class="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                  >
                    Next
                  </button>
                </div>
              </div>
            `;
          } else {
            refPagContainer.classList.add('hidden');
          }
        }
      }
    }

    // Reset password fields on profile page
    const pOld = document.getElementById('profile-page-old-pass');
    const pNew = document.getElementById('profile-page-new-pass');
    const pConf = document.getElementById('profile-page-confirm-pass');
    if (pOld) pOld.value = '';
    if (pNew) pNew.value = '';
    if (pConf) pConf.value = '';

    if (window.lucide) window.lucide.createIcons();
  }

  setReferredPage(page) {
    this.referredPage = page;
    this.renderProfilePage();
  }

  handleProfileStateChange(selectedState, selectedDistrict = null) {
    const districtSelect = document.getElementById('profile-edit-district');
    if (!districtSelect) return;

    const statesMap = window.INDIA_STATES_AND_DISTRICTS || {};
    const districts = statesMap[selectedState] || [];

    districtSelect.innerHTML = districts.map(d => 
      `<option value="${d}" ${d === selectedDistrict ? 'selected' : ''}>${d}</option>`
    ).join('');
  }

  handleProfileUpdate(e) {
    e.preventDefault();
    const user = window.auth.getCurrentUser();
    if (!user) return;

    const name = document.getElementById('profile-edit-name').value.trim();
    const caLevel = document.getElementById('profile-edit-level').value;
    const state = document.getElementById('profile-edit-state').value;
    const district = document.getElementById('profile-edit-district').value;

    if (!name) {
      this.showToast('Full name is required.', 'error');
      return;
    }

    user.name = name;
    user.caLevel = caLevel;
    user.state = state;
    user.district = district;
    user.city = district;

    window.store.updateUser(user);
    window.auth.currentUser = user;
    window.auth.onAuthChange();

    // Sync profile updates to backend server
    if (typeof fetch !== 'undefined') {
      const token = user.token || user.email;
      fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: user.name,
          phone: user.phone,
          caLevel: user.caLevel,
          state: user.state,
          district: user.district,
          city: user.city
        })
      }).catch(err => console.warn('Backend profile sync error:', err));
    }

    // Update display name in profile modal header and dashboard
    const pName = document.getElementById('profile-display-name');
    if (pName) pName.textContent = name;
    const dName = document.getElementById('dashboard-welcome-name');
    if (dName) dName.textContent = name;

    this.showToast('Profile information updated successfully!', 'success');
  }

  handleProfileAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('Please select a valid image file (JPG, PNG, WebP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const user = window.auth.getCurrentUser();
      if (user) {
        user.avatar = dataUrl;
        window.store.updateUser(user);
        window.auth.currentUser = user;
        window.auth.onAuthChange();

        const preview = document.getElementById('profile-avatar-preview');
        if (preview) preview.src = dataUrl;
        const pageAvatar = document.getElementById('profile-page-avatar');
        if (pageAvatar) pageAvatar.src = dataUrl;
        const navAvatar = document.getElementById('user-avatar');
        if (navAvatar) navAvatar.src = dataUrl;
        this.showToast('Profile photo updated successfully!', 'success');
      }
    };
    reader.readAsDataURL(file);
  }

  handleProfilePasswordChange(e) {
    e.preventDefault();
    const user = window.auth.getCurrentUser();
    if (!user) return;

    const oldPass = document.getElementById('profile-old-pass').value;
    const newPass = document.getElementById('profile-new-pass').value;
    const confirmPass = document.getElementById('profile-confirm-pass').value;

    const res = window.auth.changePassword(user.id, oldPass, newPass, confirmPass);
    if (res.success) {
      this.showToast('Password successfully updated! Keep your credentials safe.', 'success');
      document.getElementById('profile-old-pass').value = '';
      document.getElementById('profile-new-pass').value = '';
      document.getElementById('profile-confirm-pass').value = '';
    } else {
      this.showToast(res.error, 'error');
    }
  }


  copyReferralCode() {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) return;
    const code = (user.username || user.id).replace(/^@+/, '');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code)
        .then(() => {
          const pts = (window.store && window.store.getReferralSettings) ? window.store.getReferralSettings().referrerReward : 100;
          this.showToast(`Referral code ${code} copied! Share to earn ${pts} pts per friend.`, 'success');
        })
        .catch(() => {
          this.showToast(`Referral code ${code} copied to clipboard!`, 'success');
        });
    } else {
      this.showToast(`Referral code ${code} copied to clipboard!`, 'success');
    }
  }

  // Dynamically update registration page referral badge with configured reward amounts
  _updateRegReferralBadge() {
    const earnEl = document.getElementById('page-reg-ref-earn-text');
    const subEl  = document.getElementById('page-reg-ref-sub-text');
    const hintEl = document.getElementById('page-reg-ref-hint');
    if (!earnEl) return;

    const applySettings = (settings) => {
      const newStudentReward = Number(settings.newStudentReward) || 100;
      const referrerReward   = Number(settings.referrerReward) || 100;
      if (earnEl) earnEl.textContent = `✨ REFER A FRIEND & EARN ${referrerReward} PTS`;
      if (subEl)  subEl.textContent  = `Enter a friend's referral code below to get ${newStudentReward} bonus points when you join`;
      if (hintEl) hintEl.textContent = `Enter your friend's username. They earn +${referrerReward} referral points when you complete registration!`;
    };

    // Try to load from backend first, then fall back to local settings
    if (typeof fetch !== 'undefined') {
      fetch('/api/referrals/settings')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && (data.referrerReward !== undefined)) {
            // Save latest settings locally too
            if (window.store && window.store.saveReferralSettings) {
              window.store.saveReferralSettings(data);
            }
            applySettings(data);
          } else {
            const local = window.store && window.store.getReferralSettings ? window.store.getReferralSettings() : { referrerReward: 100, newStudentReward: 100 };
            applySettings(local);
          }
        })
        .catch(() => {
          const local = window.store && window.store.getReferralSettings ? window.store.getReferralSettings() : { referrerReward: 100, newStudentReward: 100 };
          applySettings(local);
        });
    } else {
      const local = window.store && window.store.getReferralSettings ? window.store.getReferralSettings() : { referrerReward: 100, newStudentReward: 100 };
      applySettings(local);
    }
  }

  handleProfilePageStateChange(selectedState, selectedDistrict = null) {
    const districtSelect = document.getElementById('profile-page-edit-district');
    if (!districtSelect) return;

    const statesMap = window.INDIA_STATES_AND_DISTRICTS || {};
    const districts = statesMap[selectedState] || [];

    districtSelect.innerHTML = districts.map(d => 
      `<option value="${d}" ${d === selectedDistrict ? 'selected' : ''}>${d}</option>`
    ).join('');
  }

  handleProfilePageUpdate(e) {
    e.preventDefault();
    const user = window.auth.getCurrentUser();
    if (!user) return;

    const name = document.getElementById('profile-page-edit-name').value.trim();
    const caLevel = document.getElementById('profile-page-edit-level').value;
    const state = document.getElementById('profile-page-edit-state').value;
    const district = document.getElementById('profile-page-edit-district').value;

    if (!name) {
      this.showToast('Full name is required.', 'error');
      return;
    }

    user.name = name;
    user.caLevel = caLevel;
    user.state = state;
    user.district = district;
    user.city = district;

    window.store.updateUser(user);
    window.auth.currentUser = user;
    window.auth.onAuthChange();

    // Sync profile updates to backend server
    if (typeof fetch !== 'undefined') {
      const token = user.token || user.email;
      fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: user.name,
          phone: user.phone,
          caLevel: user.caLevel,
          state: user.state,
          district: user.district,
          city: user.city
        })
      }).catch(err => console.warn('Backend profile sync error:', err));
    }

    this.renderProfilePage();
    this.showToast('Profile information updated successfully!', 'success');
  }

  handleProfilePagePasswordChange(e) {
    e.preventDefault();
    const user = window.auth.getCurrentUser();
    if (!user) return;

    const oldPass = document.getElementById('profile-page-old-pass').value;
    const newPass = document.getElementById('profile-page-new-pass').value;
    const confirmPass = document.getElementById('profile-page-confirm-pass').value;

    const res = window.auth.changePassword(user.id, oldPass, newPass, confirmPass);
    if (res.success) {
      this.showToast('Password successfully updated! Keep your credentials safe.', 'success');
      document.getElementById('profile-page-old-pass').value = '';
      document.getElementById('profile-page-new-pass').value = '';
      document.getElementById('profile-page-confirm-pass').value = '';
    } else {
      this.showToast(res.error, 'error');
    }
  }

  copyReferralLink() {
    const refInput = document.getElementById('profile-referral-url');
    if (!refInput) return;

    refInput.select();
    refInput.setSelectionRange(0, 99999);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(refInput.value)
        .then(() => {
          this.showToast('Referral link copied to clipboard! Share with friends to earn 100 points.', 'success');
        })
        .catch(() => {
          document.execCommand('copy');
          this.showToast('Referral link copied to clipboard!', 'success');
        });
    } else {
      document.execCommand('copy');
      this.showToast('Referral link copied to clipboard!', 'success');
    }
  }

  togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
      input.type = 'text';
      if (btnEl) btnEl.innerHTML = '<i data-lucide="eye-off" class="w-4 h-4"></i>';
    } else {
      input.type = 'password';
      if (btnEl) btnEl.innerHTML = '<i data-lucide="eye" class="w-4 h-4"></i>';
    }
    if (window.lucide) window.lucide.createIcons();
  }

  // ==========================================
  // FOOTER & GLOBAL MODALS
  // ==========================================
  showFooterModal(type) {
    const modal = document.getElementById('footer-info-modal');
    const container = document.getElementById('footer-info-modal-content');
    if (!modal || !container) return;

    let title = '';
    let icon = '';
    let badge = '';
    let body = '';

    if (type === 'partnership') {
      title = 'Partnership & Sponsorship';
      icon = 'handshake';
      badge = 'Collaborate with ExcellenceCA';
      body = `
        <div class="space-y-4 text-xs text-slate-600 leading-relaxed">
          <p>
            ExcellenceCA collaborates with renowned Chartered Accountancy faculties, authors, test series mentors, and educational publishers across India.
          </p>
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-900 space-y-2">
            <h5 class="font-bold text-xs flex items-center gap-1.5">
              <i data-lucide="check-circle-2" class="w-4 h-4 text-blue-600"></i> Faculty & Institute Opportunities:
            </h5>
            <ul class="list-disc list-inside space-y-1 text-[11px] text-blue-800">
              <li>Host exclusive CA Foundation, Inter & Final Mock Test Series</li>
              <li>Provide red-ink evaluative copy checking for subjective answer sheets</li>
              <li>Publish verified revision notes and case-study question papers</li>
            </ul>
          </div>
          <div class="border-t border-slate-100 pt-3">
            <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Corporate & Academic Enquiries</div>
            <div class="flex items-center gap-2 text-slate-800 font-semibold">
              <i data-lucide="mail" class="w-4 h-4 text-blue-600"></i>
              <a href="mailto:snapdoubt0@gmail.com" class="hover:underline text-blue-600">snapdoubt0@gmail.com</a>
            </div>
            <div class="text-[11px] text-slate-400 mt-1">Direct inquiries answered within 24-48 business hours.</div>
          </div>
        </div>
      `;
    } else if (type === 'privacy') {
      title = 'Privacy Policy';
      icon = 'shield-check';
      badge = 'Student Data Protection';
      body = `
        <div class="space-y-4 text-xs text-slate-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
          <p>
            At <strong>ExcellenceCA</strong>, we treat student privacy and academic record confidentiality with the utmost integrity.
          </p>
          <div class="space-y-3">
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <h6 class="font-bold text-slate-800 text-xs flex items-center gap-1.5 mb-1">
                <i data-lucide="database" class="w-3.5 h-3.5 text-blue-600"></i> 1. Academic Data Storage
              </h6>
              <p class="text-[11px] text-slate-500">
                Your submitted test responses, descriptive PDF answer sheets, and evaluated marks are stored securely and accessible only to authorized faculty and administrators.
              </p>
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <h6 class="font-bold text-slate-800 text-xs flex items-center gap-1.5 mb-1">
                <i data-lucide="lock" class="w-3.5 h-3.5 text-emerald-600"></i> 2. No Third-Party Commercial Sale
              </h6>
              <p class="text-[11px] text-slate-500">
                We strictly do not sell, barter, or distribute student phone numbers, email addresses, or test scores to third-party telemarketers or external advertisers.
              </p>
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <h6 class="font-bold text-slate-800 text-xs flex items-center gap-1.5 mb-1">
                <i data-lucide="file-check" class="w-3.5 h-3.5 text-indigo-600"></i> 3. Evaluated Submissions
              </h6>
              <p class="text-[11px] text-slate-500">
                Corrected PDF answer copies and teacher remarks are private to your student profile and never made public on search engines.
              </p>
            </div>
          </div>
          <p class="text-[11px] text-slate-400">
            For privacy inquiries or account data removal requests, contact <a href="mailto:snapdoubt0@gmail.com" class="text-blue-600 font-semibold hover:underline">snapdoubt0@gmail.com</a>.
          </p>
        </div>
      `;
    } else if (type === 'support') {
      title = 'Student & Faculty Support';
      icon = 'life-buoy';
      badge = 'Helpdesk & Assistance';
      body = `
        <div class="space-y-4 text-xs text-slate-600 leading-relaxed">
          <p>
            Encountering issues with test submissions, PDF question papers, or account login? Our dedicated support team is here to assist you.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Support</span>
              <a href="mailto:snapdoubt0@gmail.com" class="font-bold text-blue-600 text-xs block mt-1 hover:underline">snapdoubt0@gmail.com</a>
              <span class="text-[11px] text-slate-400 mt-0.5 block">Response time: &lt; 4 hours</span>
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Helpline Hours</span>
              <span class="font-bold text-slate-800 text-xs block mt-1">Mon - Sat: 9 AM - 7 PM</span>
              <span class="text-[11px] text-slate-400 mt-0.5 block">IST (Academic Support Desk)</span>
            </div>
          </div>
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-emerald-900">
            <div class="font-bold text-xs flex items-center gap-1.5 mb-1">
              <i data-lucide="help-circle" class="w-4 h-4 text-emerald-600"></i> Quick Resolution Checklist:
            </div>
            <ul class="list-disc list-inside text-[11px] text-emerald-800 space-y-0.5">
              <li>Ensure PDF file size is within 15 MB before uploading solutions.</li>
              <li>For login issues, verify your registered phone/email and password.</li>
              <li>Evaluated copies are marked within 48-72 hours of submission.</li>
            </ul>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 border-b border-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <i data-lucide="${icon}" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 block">${badge}</span>
              <h3 class="text-base font-bold text-slate-900">${title}</h3>
            </div>
          </div>
          <button onclick="window.app.closeModal('footer-info-modal')" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="py-5">
          ${body}
        </div>

        <div class="pt-4 border-t border-slate-100 flex justify-end">
          <button 
            onclick="window.app.closeModal('footer-info-modal')" 
            class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-msg max-w-sm w-full p-3.5 rounded-xl shadow-lg border text-xs font-semibold flex items-start gap-3 break-words ${
      type === 'success' ? 'bg-emerald-900 text-white border-emerald-700' :
      type === 'error' ? 'bg-rose-900 text-white border-rose-700' :
      type === 'warning' ? 'bg-amber-900 text-white border-amber-700' :
      'bg-slate-900 text-white border-slate-700'
    }`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle-2';
    if (type === 'error') icon = 'alert-triangle';
    if (type === 'warning') icon = 'alert-circle';

    toast.innerHTML = `
      <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0 mt-0.5"></i>
      <div class="flex-1 break-words leading-relaxed">${message}</div>
      <button 
        type="button" 
        onclick="this.closest('.toast-msg').remove()" 
        class="toast-close-btn text-white/60 hover:text-white p-0.5 rounded transition-colors cursor-pointer flex-shrink-0"
        title="Dismiss alert"
      >
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      if (!toast.isConnected) return;
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease-out';
      setTimeout(() => { if (toast.isConnected) toast.remove(); }, 200);
    }, 4500);
  }

  // Real-Time Notification System Handlers
  toggleNotificationPanel(forceState = null) {
    const panel = document.getElementById('nav-notification-panel');
    if (!panel) return;
    const isCurrentlyHidden = panel.classList.contains('hidden');
    const shouldShow = forceState !== null ? forceState : isCurrentlyHidden;

    if (shouldShow) {
      this.renderNotificationsList();
      panel.classList.remove('hidden');
      const dismissHandler = (e) => {
        const container = document.getElementById('nav-notification-container');
        if (container && !container.contains(e.target)) {
          panel.classList.add('hidden');
          document.removeEventListener('click', dismissHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', dismissHandler), 10);
    } else {
      panel.classList.add('hidden');
    }
  }

  updateNotificationBadge() {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const badge = document.getElementById('nav-notification-badge');
    const panelBadge = document.getElementById('notification-panel-count-badge');
    const mobileCount = document.getElementById('mobile-notification-count');

    if (!user) {
      if (badge) badge.classList.add('hidden');
      if (mobileCount) mobileCount.classList.add('hidden');
      return;
    }

    const count = window.store ? window.store.getUnreadNotificationCount(user.id) : 0;

    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
    if (panelBadge) {
      panelBadge.textContent = `${count} New`;
    }
    if (mobileCount) {
      if (count > 0) {
        mobileCount.textContent = count;
        mobileCount.classList.remove('hidden');
      } else {
        mobileCount.classList.add('hidden');
      }
    }
  }

  renderNotificationsList() {
    const listEl = document.getElementById('nav-notification-list');
    if (!listEl) return;
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) {
      listEl.innerHTML = `
        <div class="p-6 text-center text-slate-400">
          <i data-lucide="lock" class="w-6 h-6 mx-auto mb-2 text-slate-300"></i>
          Please sign in to view your real-time alerts.
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const notifs = window.store.getNotifications ? window.store.getNotifications(user.id) : [];
    if (!notifs || notifs.length === 0) {
      listEl.innerHTML = `
        <div class="p-6 text-center text-slate-400">
          <i data-lucide="bell-off" class="w-6 h-6 mx-auto mb-2 text-slate-300"></i>
          No notifications yet. You're all caught up!
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    this.notifPage = this.notifPage || 1;
    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(notifs.length / pageSize));
    if (this.notifPage > totalPages) this.notifPage = totalPages;
    const startIndex = (this.notifPage - 1) * pageSize;
    const pagedNotifs = notifs.slice(startIndex, startIndex + pageSize);

    const itemsHtml = pagedNotifs.map(n => {
      let icon = 'bell';
      let iconBg = 'bg-blue-50 text-blue-600';
      if (n.type === 'referral') {
        icon = 'gift';
        iconBg = 'bg-emerald-50 text-emerald-600';
      } else if (n.type === 'new_test') {
        icon = 'check-square';
        iconBg = 'bg-indigo-50 text-indigo-600';
      } else if (n.type === 'new_paper') {
        icon = 'file-text';
        iconBg = 'bg-purple-50 text-purple-600';
      } else if (n.type === 'points_received' || n.type === 'rank_up') {
        icon = 'award';
        iconBg = 'bg-amber-50 text-amber-600';
      }

      const timeAgo = n.createdAt 
        ? new Date(n.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
        : 'Recent';

      return `
        <div 
          onclick="window.app.handleNotificationClick('${n.id}', '${n.link || ''}')"
          class="p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 group ${n.read ? 'opacity-70' : 'bg-blue-50/20'}"
        >
          <div class="w-8 h-8 rounded-full ${iconBg} flex items-center justify-center shrink-0 mt-0.5">
            <i data-lucide="${icon}" class="w-4 h-4"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-0.5">
              <strong class="text-xs text-slate-900 truncate block">${n.title || 'Notification'}</strong>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[10px] text-slate-400 font-mono">${timeAgo}</span>
                <button 
                  type="button"
                  onclick="event.stopPropagation(); window.app.deleteNotification('${n.id}')"
                  class="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Delete notification"
                >
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
            <p class="text-[11px] text-slate-600 leading-snug line-clamp-2 break-words">${n.message || ''}</p>
            ${!n.read ? '<span class="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 mt-1"></span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    const paginationHtml = totalPages > 1 ? `
      <div class="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
        <span>Page ${this.notifPage} of ${totalPages}</span>
        <div class="flex items-center gap-1">
          <button 
            type="button" 
            onclick="window.app.setNotifPage(${this.notifPage - 1})" 
            ${this.notifPage <= 1 ? 'disabled' : ''} 
            class="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
          >
            Prev
          </button>
          <button 
            type="button" 
            onclick="window.app.setNotifPage(${this.notifPage + 1})" 
            ${this.notifPage >= totalPages ? 'disabled' : ''} 
            class="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    ` : '';

    listEl.innerHTML = itemsHtml + paginationHtml;

    if (window.lucide) window.lucide.createIcons();
  }

  setNotifPage(page) {
    this.notifPage = page;
    this.renderNotificationsList();
  }

  handleNotificationClick(notifId, link) {
    if (window.store && typeof window.store.markNotificationRead === 'function') {
      window.store.markNotificationRead(notifId);
    }
    this.updateNotificationBadge();
    const panel = document.getElementById('nav-notification-panel');
    if (panel) panel.classList.add('hidden');
    if (link) {
      this.navigate(link);
    }
  }

  markAllNotificationsRead() {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (user && window.store && typeof window.store.markAllNotificationsRead === 'function') {
      window.store.markAllNotificationsRead(user.id);
    }
    this.renderNotificationsList();
    this.updateNotificationBadge();
  }

  deleteNotification(notifId) {
    if (window.store && typeof window.store.deleteNotification === 'function') {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      window.store.deleteNotification(notifId, user ? user.id : null);
      this.renderNotificationsList();
      this.updateNotificationBadge();
      this.showToast('Notification deleted', 'info');
    }
  }

  clearAllNotifications() {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) return;
    if (window.store && typeof window.store.clearAllNotifications === 'function') {
      window.store.clearAllNotifications(user.id);
      this.renderNotificationsList();
      this.updateNotificationBadge();
      this.showToast('All notifications cleared', 'info');
    }
  }

  renderProfileXpHistory(userId, totalXp) {
    const tbody = document.getElementById('profile-xp-history-tbody');
    const totalPill = document.getElementById('profile-xp-total-pill');
    if (totalPill) {
      totalPill.textContent = Number(totalXp).toLocaleString() + ' Total XP';
    }
    if (!tbody) return;

    let txs = window.store && window.store.getXpTransactions ? window.store.getXpTransactions(userId) : [];

    // Also fetch latest from backend asynchronously to guarantee multi-device accuracy
    if (!this._fetchingBackendXp && typeof fetch !== 'undefined') {
      this._fetchingBackendXp = true;
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      fetch(`/api/xp/transactions?userId=${encodeURIComponent(userId)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data && data.success && Array.isArray(data.transactions)) {
          if (window.store && window.store.saveXpTransactions) {
            const local = window.store.getXpTransactions();
            const otherUserTxs = local.filter(t => t.userId !== userId);
            const combined = [...data.transactions, ...otherUserTxs];
            window.store.saveXpTransactions(combined);
            const currentTab = this.currentView || 'dashboard';
            if (currentTab === 'profile') {
              this.populateXpHistoryRows(data.transactions);
            }
          }
        }
      }).catch(() => {}).finally(() => { this._fetchingBackendXp = false; });
    }

    this.populateXpHistoryRows(txs);
  }

  populateXpHistoryRows(txs) {
    const tbody = document.getElementById('profile-xp-history-tbody');
    const pagContainer = document.getElementById('profile-xp-history-pagination');
    if (!tbody) return;

    this._cachedProfileTxs = txs || [];

    if (!txs || txs.length === 0) {
      if (pagContainer) pagContainer.classList.add('hidden');
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-slate-400">
            <i data-lucide="zap-off" class="w-6 h-6 mx-auto mb-2 text-slate-300"></i>
            <span class="block font-medium">No points activity recorded yet.</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Complete an MCQ test or submit a practical paper to earn platform XP!</span>
          </td>
        </tr>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    this.xpPage = this.xpPage || 1;
    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(txs.length / pageSize));
    if (this.xpPage > totalPages) this.xpPage = totalPages;
    const startIndex = (this.xpPage - 1) * pageSize;
    const pagedTxs = txs.slice(startIndex, startIndex + pageSize);

    tbody.innerHTML = pagedTxs.map(t => {
      let icon = 'zap';
      let badgeClass = 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      let typeLabel = 'Platform Points';
      if (t.sourceType === 'mcq_test') {
        icon = 'check-square';
        badgeClass = 'bg-blue-50 text-blue-700 border border-blue-200';
        typeLabel = 'MCQ Mock Test';
      } else if (t.sourceType === 'paper_submission') {
        icon = 'file-check';
        badgeClass = 'bg-purple-50 text-purple-700 border border-purple-200';
        typeLabel = 'Test Paper Evaluation';
      } else if (t.sourceType === 'referral') {
        icon = 'gift';
        badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
        typeLabel = 'Referral Bonus';
      } else if (t.sourceType === 'baseline') {
        icon = 'award';
        badgeClass = 'bg-amber-50 text-amber-700 border border-amber-200';
        typeLabel = 'Enrollment Baseline';
      }

      const dateStr = t.createdAt
        ? new Date(t.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Recent';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="py-3 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">${dateStr}</td>
          <td class="py-3 px-3 font-bold text-slate-900">${t.activityName || 'Assessment Activity'}</td>
          <td class="py-3 px-3">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">
              <i data-lucide="${icon}" class="w-3 h-3"></i> ${typeLabel}
            </span>
          </td>
          <td class="py-3 px-3 text-slate-600 text-xs">${t.resultStatus || 'Completed'}</td>
          <td class="py-3 px-3 text-right whitespace-nowrap">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
              +${Number(t.points).toLocaleString()} XP
            </span>
          </td>
        </tr>
      `;
    }).join('');

    if (pagContainer) {
      if (totalPages > 1) {
        pagContainer.classList.remove('hidden');
        pagContainer.innerHTML = `
          <div class="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Showing ${startIndex + 1} to ${Math.min(startIndex + pageSize, txs.length)} of ${txs.length} entries</span>
            <div class="flex items-center gap-1.5">
              <button 
                type="button" 
                onclick="window.app.setXpPage(${this.xpPage - 1})" 
                ${this.xpPage <= 1 ? 'disabled' : ''} 
                class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer"
              >
                Prev
              </button>
              <span class="px-2 py-0.5 font-bold text-slate-700">${this.xpPage} / ${totalPages}</span>
              <button 
                type="button" 
                onclick="window.app.setXpPage(${this.xpPage + 1})" 
                ${this.xpPage >= totalPages ? 'disabled' : ''} 
                class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        `;
      } else {
        pagContainer.classList.add('hidden');
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  setXpPage(page) {
    this.xpPage = page;
    this.populateXpHistoryRows(this._cachedProfileTxs || []);
  }
}

window.app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
  });
} else {
  window.app.init();
}
