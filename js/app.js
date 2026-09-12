/**
 * app.js - Main Application Orchestrator & Router
 */

class App {
  constructor() {
    this.currentView = 'dashboard';
  }

  init() {
    // Initial check of logged in user
    window.auth.onAuthChange();

    // Setup navigation listeners
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = el.getAttribute('data-nav');
        this.navigate(targetView);
      });
    });

    // Close modal on escape key or backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Initial render
    this.navigate('dashboard');

    // Create Lucide Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  navigate(viewName) {
    // Guard against student trying to enter admin panel
    if (viewName === 'admin' && !window.auth.isAdmin()) {
      this.showToast('Please login as Admin to view the faculty administration panel.', 'warning');
      this.showAuthModal('login');
      return;
    }

    this.currentView = viewName;

    // Toggle view containers
    const views = [
      'view-dashboard',
      'view-lectures',
      'view-tests',
      'view-test-taking',
      'view-assignments',
      'view-leaderboard',
      'view-admin'
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

    // Highlight active nav item
    document.querySelectorAll('[data-nav]').forEach(link => {
      const linkTarget = link.getAttribute('data-nav');
      if (linkTarget === viewName) {
        link.classList.add('text-blue-600', 'bg-blue-50', 'font-bold');
        link.classList.remove('text-slate-600');
      } else {
        link.classList.remove('text-blue-600', 'bg-blue-50', 'font-bold');
        link.classList.add('text-slate-600');
      }
    });

    // Close mobile nav drawer if open
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.add('hidden');
    }

    // Trigger sub-renderers
    if (viewName === 'dashboard') {
      window.studentDashboard.render();
    } else if (viewName === 'lectures') {
      window.lecturePlayer.renderCatalog();
    } else if (viewName === 'tests') {
      window.testEngine.renderCatalog();
    } else if (viewName === 'assignments') {
      window.assignmentPortal.render();
    } else if (viewName === 'leaderboard') {
      window.leaderboardManager.render();
    } else if (viewName === 'admin') {
      window.adminDashboard.render();
    }

    // Scroll top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.lucide) window.lucide.createIcons();
  }

  toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
      mobileMenu.classList.toggle('hidden');
    }
  }

  // Modals
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  // Authentication Modal Handler
  showAuthModal(mode = 'login') {
    const modalContent = document.getElementById('auth-modal-content');
    if (!modalContent) return;

    if (mode === 'login') {
      modalContent.innerHTML = `
        <div class="p-6 sm:p-8">
          <div class="text-center mb-6">
            <div class="w-12 h-12 rounded-xl bg-blue-600 text-white mx-auto flex items-center justify-center font-black text-xl mb-3 shadow-md">
              CA
            </div>
            <h3 class="text-xl font-bold text-slate-900">Sign in to CA Excellence</h3>
            <p class="text-xs text-slate-500 mt-1">Access your lectures, tests, and study dashboard</p>
          </div>

          <!-- Quick Switcher Helper inside Login Modal -->
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-5 text-xs text-blue-900">
            <span class="font-bold block mb-1 flex items-center gap-1.5">
              <i data-lucide="zap" class="w-3.5 h-3.5 text-blue-600"></i> Fast Demo Access (One-Click):
            </span>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <button 
                onclick="window.auth.switchRole('student'); window.app.closeModal('auth-modal');"
                class="px-2.5 py-1.5 bg-white border border-blue-300 hover:border-blue-500 rounded-lg font-bold text-blue-700 shadow-sm text-left truncate"
              >
                🎓 Demo Student
              </button>
              <button 
                onclick="window.auth.switchRole('admin'); window.app.closeModal('auth-modal');"
                class="px-2.5 py-1.5 bg-white border border-blue-300 hover:border-blue-500 rounded-lg font-bold text-amber-800 shadow-sm text-left truncate"
              >
                🛡️ Demo Admin
              </button>
            </div>
          </div>

          <form onsubmit="window.app.handleLoginSubmit(event)" class="space-y-4 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Email Address</label>
              <input type="email" id="auth-email" required placeholder="rohan.sharma@castudent.in" class="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="font-bold text-slate-700">Password</label>
                <a href="#" onclick="window.app.showAuthModal('forgot')" class="text-blue-600 hover:underline">Forgot Password?</a>
              </div>
              <input type="password" id="auth-password" required placeholder="••••••••" class="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>

            <button type="submit" class="w-full py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors mt-2">
              Log In to Account
            </button>
          </form>

          <div class="text-center mt-6 pt-4 border-t border-slate-100 text-xs text-slate-600">
            Don't have an account yet? 
            <button onclick="window.app.showAuthModal('signup')" class="font-bold text-blue-600 hover:underline">Create Student Account</button>
          </div>
        </div>
      `;
    } else if (mode === 'signup') {
      modalContent.innerHTML = `
        <div class="p-6 sm:p-8">
          <div class="text-center mb-6">
            <h3 class="text-xl font-bold text-slate-900">Create Student Account</h3>
            <p class="text-xs text-slate-500 mt-1">Join the premier platform for CA exam preparation</p>
          </div>

          <form onsubmit="window.app.handleSignupSubmit(event)" class="space-y-3.5 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Full Name</label>
              <input type="text" id="reg-name" required placeholder="e.g. Rohan Sharma" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Email Address</label>
              <input type="email" id="reg-email" required placeholder="student@example.com" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Password</label>
              <input type="password" id="reg-pass" required placeholder="At least 6 characters" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Confirm Password</label>
              <input type="password" id="reg-confirm" required placeholder="Re-enter password" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>

            <button type="submit" class="w-full py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors mt-3">
              Complete Registration
            </button>
          </form>

          <div class="text-center mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
            Already registered? 
            <button onclick="window.app.showAuthModal('login')" class="font-bold text-blue-600 hover:underline">Log In</button>
          </div>
        </div>
      `;
    } else if (mode === 'forgot') {
      modalContent.innerHTML = `
        <div class="p-6 sm:p-8">
          <div class="text-center mb-6">
            <h3 class="text-lg font-bold text-slate-900">Reset Password</h3>
            <p class="text-xs text-slate-500 mt-1">Enter your registered email to receive a password reset link</p>
          </div>

          <form onsubmit="window.app.handleForgotSubmit(event)" class="space-y-4 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Registered Email Address</label>
              <input type="email" id="forgot-email" required placeholder="student@example.com" class="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>

            <button type="submit" class="w-full py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
              Send Password Reset Link
            </button>
          </form>

          <div class="text-center mt-5 pt-4 border-t border-slate-100 text-xs">
            <button onclick="window.app.showAuthModal('login')" class="font-bold text-blue-600 hover:underline">← Back to Login</button>
          </div>
        </div>
      `;
    }

    if (window.lucide) window.lucide.createIcons();
    this.openModal('auth-modal');
  }

  handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;

    const res = window.auth.login(email, pass);
    if (res.success) {
      this.closeModal('auth-modal');
      this.showToast(`Welcome back, ${res.user.name}!`, 'success');
      this.navigate(res.user.role === 'admin' ? 'admin' : 'dashboard');
    } else {
      this.showToast(res.error, 'error');
    }
  }

  handleSignupSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const confirm = document.getElementById('reg-confirm').value;

    const res = window.auth.register(name, email, pass, confirm, 'student');
    if (res.success) {
      this.closeModal('auth-modal');
      this.showToast(`Account created successfully! Welcome, ${res.user.name}.`, 'success');
      this.navigate('dashboard');
    } else {
      this.showToast(res.error, 'error');
    }
  }

  handleForgotSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    this.closeModal('auth-modal');
    this.showToast(`Password reset link sent to ${email} (Simulated).`, 'info');
  }

  // Toast Notification System
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-msg max-w-sm w-full p-4 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-3 ${
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
      <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
      <div class="flex-1">${message}</div>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease-out';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }
}

window.app = new App();

document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
