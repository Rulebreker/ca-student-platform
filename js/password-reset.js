/**
 * password-reset.js - Forgot Password (/forgot-password) and Reset Password (/reset-password?token=...)
 * pages for ExcellenceCA. The server emails a single-use link; this page never logs or stores the token.
 */

class PasswordResetPages {
  constructor() {
    this.resetToken = '';
    this.captureTokenFromUrl();
  }

  /** Keep the token in memory only and remove it from the address bar / history right away. */
  captureTokenFromUrl() {
    try {
      const url = new URL(window.location.href);
      if (url.pathname.replace(/\/$/, '').endsWith('/reset-password') && url.searchParams.has('token')) {
        this.resetToken = (url.searchParams.get('token') || '').trim();
        url.searchParams.delete('token');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
      }
    } catch (e) {
      this.resetToken = '';
    }
  }

  _card(inner) {
    return `
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xl p-6 sm:p-8">
        <div class="text-center mb-6">
          <img src="/assets/brandlogo.png" alt="ExcellenceCA" class="h-12 w-auto mx-auto object-contain mb-2">
          ${inner.header}
        </div>
        ${inner.body}
        <div class="text-center mt-6 pt-4 border-t border-slate-100 text-xs text-slate-600">
          <button type="button" onclick="window.passwordReset.backToLogin()" class="font-bold text-blue-600 hover:underline inline-flex items-center gap-1">
            <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Back to Login
          </button>
        </div>
      </div>`;
  }

  _mount(containerId, html) {
    const el = document.getElementById(containerId);
    if (!el) return null;
    el.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
    return el;
  }

  _setError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
  }

  backToLogin(successMessage) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '/#home');
    }
    window.app.navigate('home');
    window.app.showAuthModal('login');
    if (successMessage) {
      const form = document.querySelector('#auth-modal-content form');
      if (form) {
        const notice = document.createElement('div');
        notice.className = 'mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold';
        notice.textContent = successMessage;
        form.parentNode.insertBefore(notice, form);
      }
      window.app.showToast(successMessage, 'success');
    }
  }

  // ------------------------------------------------------------ Forgot Password

  renderForgotPassword() {
    this._mount('forgot-password-container', this._card({
      header: `
        <h2 class="text-xl font-black text-slate-900">Forgot your password?</h2>
        <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">Enter your registered email address and we'll send you a secure password reset link.</p>`,
      body: `
        <div id="forgot-success" class="hidden p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs leading-relaxed">
          <div class="flex items-start gap-2">
            <i data-lucide="mail-check" class="w-4 h-4 flex-shrink-0 mt-0.5"></i>
            <div>
              <p id="forgot-success-text" class="font-semibold"></p>
              <p class="mt-1.5 text-emerald-700">The link expires in 30 minutes. Check your spam folder if you don't see it.</p>
            </div>
          </div>
        </div>
        <form id="forgot-form" onsubmit="window.passwordReset.submitForgotPassword(event)" class="space-y-4 text-xs" novalidate>
          <div>
            <label for="forgot-email" class="block font-bold text-slate-700 mb-1">Email Address</label>
            <input type="email" id="forgot-email" required autocomplete="email" maxlength="254" placeholder="student@example.com"
              class="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium text-slate-800">
          </div>
          <p id="forgot-error" class="hidden text-rose-600 font-semibold" role="alert"></p>
          <button type="submit" class="w-full py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5">
            <i data-lucide="send" class="w-4 h-4"></i> Send Reset Link
          </button>
        </form>`
    }));
    const input = document.getElementById('forgot-email');
    if (input) input.focus();
  }

  async submitForgotPassword(e) {
    if (e && e.preventDefault) e.preventDefault();
    const input = document.getElementById('forgot-email');
    const email = (input ? input.value : '').trim();
    this._setError('forgot-error', '');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this._setError('forgot-error', 'Please enter a valid email address.');
      return;
    }
    const btn = document.querySelector('#forgot-form button[type="submit"]');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Sending...';
      if (window.lucide) window.lucide.createIcons();
    }
    try {
      const resp = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const res = await resp.json().catch(() => ({}));
      if (resp.ok && res.success) {
        document.getElementById('forgot-form').classList.add('hidden');
        document.getElementById('forgot-success-text').textContent = res.message ||
          'If an account exists with that email, a password reset link has been sent.';
        document.getElementById('forgot-success').classList.remove('hidden');
        return;
      }
      this._setError('forgot-error', res.error || 'Unable to send the reset link right now. Please try again later.');
    } catch (err) {
      this._setError('forgot-error', 'Network error. Please check your connection and try again.');
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // ------------------------------------------------------------ Reset Password

  renderResetPassword() {
    if (!this.resetToken) {
      this.renderResetProblem('invalid');
      return;
    }
    this._mount('reset-password-container', this._card({
      header: `
        <h2 class="text-xl font-black text-slate-900">Create a new password</h2>
        <p class="text-xs text-slate-500 mt-1.5">Use at least 8 characters with a letter and a number or symbol.</p>`,
      body: `
        <form id="reset-form" onsubmit="window.passwordReset.submitResetPassword(event)" class="space-y-4 text-xs" novalidate>
          <div>
            <label for="reset-new-password" class="block font-bold text-slate-700 mb-1">New Password</label>
            <div class="relative">
              <input type="password" id="reset-new-password" required autocomplete="new-password" maxlength="128" placeholder="Enter a new password"
                class="w-full pl-3.5 pr-10 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-slate-800">
              <button type="button" onclick="window.app.togglePasswordVisibility('reset-new-password', this)" class="absolute right-3 top-3 text-slate-400 hover:text-slate-600" aria-label="Show password">
                <i data-lucide="eye" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
          <div>
            <label for="reset-confirm-password" class="block font-bold text-slate-700 mb-1">Confirm New Password</label>
            <div class="relative">
              <input type="password" id="reset-confirm-password" required autocomplete="new-password" maxlength="128" placeholder="Re-enter the new password"
                class="w-full pl-3.5 pr-10 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-slate-800">
              <button type="button" onclick="window.app.togglePasswordVisibility('reset-confirm-password', this)" class="absolute right-3 top-3 text-slate-400 hover:text-slate-600" aria-label="Show password">
                <i data-lucide="eye" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
          <p id="reset-error" class="hidden text-rose-600 font-semibold" role="alert"></p>
          <button type="submit" class="w-full py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5">
            <i data-lucide="key-round" class="w-4 h-4"></i> Reset Password
          </button>
        </form>`
    }));
    const input = document.getElementById('reset-new-password');
    if (input) input.focus();
  }

  renderResetProblem(kind) {
    const copy = {
      expired: ['This link has expired', 'Password reset links are valid for 30 minutes. Please request a new one.', 'clock'],
      used: ['This link was already used', 'Each password reset link works only once. Please request a new one if you still need to reset your password.', 'link-2-off'],
      invalid: ['Invalid reset link', 'This password reset link is invalid or incomplete. Please request a new one.', 'shield-alert']
    }[kind] || null;
    const [title, text, icon] = copy || ['Invalid reset link', 'Please request a new password reset link.', 'shield-alert'];
    this._mount('reset-password-container', this._card({
      header: `
        <div class="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center my-3 border border-rose-100">
          <i data-lucide="${icon}" class="w-7 h-7"></i>
        </div>
        <h2 class="text-xl font-black text-slate-900">${title}</h2>
        <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">${text}</p>`,
      body: `
        <button type="button" onclick="window.app.navigate('forgot-password')" class="w-full py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 text-xs">
          <i data-lucide="mail" class="w-4 h-4"></i> Request a New Link
        </button>`
    }));
  }

  async submitResetPassword(e) {
    if (e && e.preventDefault) e.preventDefault();
    const newPassword = document.getElementById('reset-new-password').value;
    const confirmPassword = document.getElementById('reset-confirm-password').value;
    this._setError('reset-error', '');

    if (!newPassword || !confirmPassword) {
      this._setError('reset-error', 'Please enter and confirm your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      this._setError('reset-error', 'New password and confirmation do not match.');
      return;
    }
    const policy = window.auth && typeof window.auth.validatePasswordStrength === 'function'
      ? window.auth.validatePasswordStrength(newPassword) : { valid: true };
    if (!policy.valid) {
      this._setError('reset-error', policy.error);
      return;
    }

    const btn = document.querySelector('#reset-form button[type="submit"]');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Resetting...';
      if (window.lucide) window.lucide.createIcons();
    }
    try {
      const resp = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.resetToken, newPassword, confirmPassword })
      });
      const res = await resp.json().catch(() => ({}));
      if (resp.ok && res.success) {
        this.resetToken = '';
        // this browser's old session (if any) was revoked with all others
        if (window.auth && window.auth.isLoggedIn() && typeof window.auth.handleSessionRevoked === 'function') {
          try { window.auth.handleSessionRevoked(''); } catch (_) { /* ignore */ }
        }
        this.backToLogin(res.message || 'Your password has been reset successfully. Please log in with your new password.');
        return;
      }
      const kind = { RESET_TOKEN_EXPIRED: 'expired', RESET_TOKEN_USED: 'used', RESET_TOKEN_INVALID: 'invalid' }[res.code];
      if (kind) {
        this.resetToken = '';
        this.renderResetProblem(kind);
        return;
      }
      this._setError('reset-error', res.error || 'Unable to reset your password right now. Please try again later.');
    } catch (err) {
      this._setError('reset-error', 'Network error. Please check your connection and try again.');
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

window.passwordReset = new PasswordResetPages();
