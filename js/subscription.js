/**
 * subscription.js - Client-Side Subscription & UPI Payment Controller
 * ExcellenceCA Platform
 * 
 * Production-Grade Security:
 * - Server authorization is the single source of truth (never trusts localStorage)
 * - Unique immutable plan IDs (core_monthly, core_4_month, plus_monthly, plus_4_month, elite_monthly, elite_4_month, elite_trial)
 * - 5-minute server-enforced countdown timer
 * - Strict UTR format validation & screenshot capture
 * - Realtime UI updates via Firebase RTDB listeners
 */

class SubscriptionManager {
  constructor() {
    this.currentCycle = 'monthly'; // 'monthly' | '4_months'
    this.activeSession = null;
    this.countdownInterval = null;
    this.plans = null;
    this.selectedScreenshotBase64 = null;
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.fetchPlans();

    // Re-validate session if window gains focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.syncMySubscription();
      }
    });
  }

  async fetchPlans() {
    try {
      const resp = await fetch('/api/subscriptions/plans');
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.plans) {
          this.plans = data.plans;
          if (window.store) {
            window.store.saveSubscriptionPlans(data.plans);
          }
          return data.plans;
        }
      }
    } catch (err) {
      console.warn('[SubscriptionManager] Failed to fetch plans from backend, using store/defaults:', err);
    }
    if (window.store) {
      this.plans = window.store.getSubscriptionPlans();
    }
    return this.plans;
  }

  getPlans() {
    if (this.plans) return this.plans;
    if (window.store) {
      const stored = window.store.getSubscriptionPlans();
      if (stored) {
        this.plans = stored;
        return stored;
      }
    }
    return {
      'core_monthly': { id: 'core_monthly', tier: 'core', name: 'Core Pass', price: 49, durationDays: 30, instantPoints: 500, copyCheckSlaHours: 48, badge: 'Core Pass' },
      'core_4_month': { id: 'core_4_month', tier: 'core', name: 'Core Pass', price: 149, durationDays: 120, instantPoints: 500, copyCheckSlaHours: 48, badge: 'Core Pass' },
      'plus_monthly': { id: 'plus_monthly', tier: 'plus', name: 'Plus Pass', price: 99, durationDays: 30, instantPoints: 1000, copyCheckSlaHours: 24, badge: 'Plus Pass' },
      'plus_4_month': { id: 'plus_4_month', tier: 'plus', name: 'Plus Pass', price: 299, durationDays: 120, instantPoints: 1000, copyCheckSlaHours: 24, badge: 'Plus Pass' },
      'elite_monthly': { id: 'elite_monthly', tier: 'elite', name: 'Elite Pass', price: 149, durationDays: 30, instantPoints: 1500, copyCheckSlaHours: 12, badge: 'Elite Pass' },
      'elite_4_month': { id: 'elite_4_month', tier: 'elite', name: 'Elite Pass', price: 499, durationDays: 120, instantPoints: 1500, copyCheckSlaHours: 12, badge: 'Elite Pass' },
      'elite_trial': { id: 'elite_trial', tier: 'trial', name: '₹9 Elite 10-Day Trial', price: 9, durationDays: 10, instantPoints: 0, copyCheckSlaHours: 12, badge: 'Trial Pass' }
    };
  }

  async syncMySubscription() {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user || user.role === 'admin') return;

    try {
      const token = user.token || user.id;
      const resp = await fetch('/api/subscriptions/my', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success) {
          if (data.subscription && window.store) {
            window.store.saveSubscription(data.subscription);
          }
          if (data.paymentHistory && window.store) {
            window.store.savePaymentSessions(data.paymentHistory);
          }
          if (window.studentDashboard && typeof window.studentDashboard.renderPassBadge === 'function') {
            window.studentDashboard.renderPassBadge();
          }
        }
      }
    } catch (err) {
      // Offline fallback
    }
  }

  // --- PRICING MODAL ---

  openPricingModal(defaultTab = 'monthly') {
    this.currentCycle = defaultTab === '4_months' ? '4_months' : 'monthly';
    const modal = document.getElementById('pricing-modal');
    if (!modal) {
      this.createPricingModalElement();
    }
    this.renderPricingModalContent();
    window.app.openModal('pricing-modal');
    if (window.lucide) window.lucide.createIcons();
  }

  createPricingModalElement() {
    const el = document.createElement('div');
    el.id = 'pricing-modal';
    el.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs hidden overflow-y-auto';
    el.innerHTML = `
      <div class="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div id="pricing-modal-content" class="overflow-y-auto p-4 sm:p-8 flex-1"></div>
      </div>
    `;
    document.body.appendChild(el);
  }

  setBillingCycle(cycle) {
    this.currentCycle = cycle;
    this.renderPricingModalContent();
    if (window.lucide) window.lucide.createIcons();
  }

  renderPricingModalContent() {
    const container = document.getElementById('pricing-modal-content');
    if (!container) return;

    const user = window.auth ? window.auth.getCurrentUser() : null;
    const entitlements = window.store ? window.store.getUserEntitlements(user ? user.id : null) : null;
    const activePlanId = entitlements && entitlements.isSubscribed ? entitlements.planId : null;

    const isMonthly = this.currentCycle === 'monthly';

    const corePlanId = isMonthly ? 'core_monthly' : 'core_4_month';
    const plusPlanId = isMonthly ? 'plus_monthly' : 'plus_4_month';
    const elitePlanId = isMonthly ? 'elite_monthly' : 'elite_4_month';

    const corePrice = isMonthly ? 49 : 149;
    const plusPrice = isMonthly ? 99 : 299;
    const elitePrice = isMonthly ? 149 : 499;

    const durationLabel = isMonthly ? '/month' : '/4 months';
    const coreSaveBadge = !isMonthly ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Save ₹47</span>' : '';
    const plusSaveBadge = !isMonthly ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Save ₹97</span>' : '';
    const eliteSaveBadge = !isMonthly ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Save ₹97</span>' : '';

    container.innerHTML = `
      <!-- Close Button -->
      <button 
        onclick="window.app.closeModal('pricing-modal')" 
        class="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors z-10"
        title="Close"
      >
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>

      <!-- Header Section -->
      <div class="text-center max-w-2xl mx-auto mb-6 sm:mb-8">
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 mb-3 border border-rose-200">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          ExcellenceCA Premium Membership
        </span>
        <h2 class="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
          Elevate Your CA Preparation
        </h2>
        <p class="text-xs sm:text-sm text-slate-600">
          Choose a pass tailored to your exam schedule. Enjoy priority copy checks, premium MCQ test sessions, full syllabus mock exams, and direct faculty review.
        </p>

        <!-- Billing Cycle Switcher Tabs -->
        <div class="inline-flex items-center p-1 bg-slate-100 rounded-xl mt-6 border border-slate-200 shadow-2xs">
          <button 
            onclick="window.subscriptionManager.setBillingCycle('monthly')" 
            class="px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              isMonthly 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900'
            }"
          >
            Monthly Billing
          </button>
          <button 
            onclick="window.subscriptionManager.setBillingCycle('4_months')" 
            class="px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              !isMonthly 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900'
            }"
          >
            <span>4 Months</span>
            <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-600 text-white">Save 25%</span>
          </button>
        </div>
      </div>

      <!-- Highlighted ₹9 Elite Trial Banner -->
      <div class="mb-8 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 p-0.5 shadow-md">
        <div class="bg-white rounded-[15px] p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 flex-shrink-0">
              <i data-lucide="zap" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-base sm:text-lg font-black text-slate-900">₹9 Elite 10-Day Trial Pass</span>
                <span class="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-amber-100 text-amber-800 border border-amber-200">Exclusive Trial</span>
              </div>
              <p class="text-xs text-slate-600 mt-0.5">
                Full Elite VIP privileges for 10 full days: 12-hour copy checking, daily 3 live MCQ sessions, weekly mock exams, and faculty grading.
              </p>
            </div>
          </div>
          <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end flex-shrink-0">
            <div class="text-right">
              <div class="text-2xl font-black text-slate-900 leading-none">₹9</div>
              <div class="text-[10px] text-slate-500 font-semibold">10 full days</div>
            </div>
            <button 
              onclick="window.subscriptionManager.startCheckout('elite_trial')"
              class="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-transform active:scale-95"
            >
              ${activePlanId === 'elite_trial' ? 'Renew ₹9 Trial' : 'Start ₹9 Trial'}
            </button>
          </div>
        </div>
      </div>

      <!-- 3 Main Pass Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        <!-- 1. CORE PASS -->
        <div class="rounded-2xl border ${activePlanId === corePlanId ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20' : 'border-slate-200 bg-white'} p-6 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow">
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="px-3 py-1 text-xs font-black uppercase tracking-wider rounded-full bg-blue-100 text-blue-800 border border-blue-200">Core Pass</span>
              ${coreSaveBadge}
            </div>
            <div class="flex items-baseline gap-1 my-3">
              <span class="text-3xl sm:text-4xl font-black text-slate-900">₹${corePrice}</span>
              <span class="text-xs text-slate-500 font-semibold">${durationLabel}</span>
            </div>
            <p class="text-xs text-slate-600 mb-5">
              Essential practice tools for students starting structured question revision.
            </p>
            <div class="space-y-2.5 text-xs text-slate-700 border-t border-slate-100 pt-4">
              <div class="flex items-center gap-2 font-bold text-blue-700">
                <i data-lucide="award" class="w-4 h-4 flex-shrink-0 text-blue-600"></i>
                <span>+500 Instant Bonus XP Points</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="clock" class="w-4 h-4 flex-shrink-0 text-slate-400"></i>
                <span>Copy checked within <strong>48 hours</strong></span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Access to Premium MCQ Questions</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Daily <strong>1 live MCQ session</strong> per subject</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Teacher Review & Grading Workflow</span>
              </div>
              <div class="flex items-center gap-2 text-slate-400">
                <i data-lucide="minus" class="w-4 h-4 flex-shrink-0"></i>
                <span>Full Pledge Exams (Requires Plus/Elite)</span>
              </div>
            </div>
          </div>
          <button 
            onclick="window.subscriptionManager.startCheckout('${corePlanId}')" 
            class="mt-6 w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activePlanId === corePlanId
                ? 'bg-blue-50 text-blue-800 border border-blue-300 cursor-default'
                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
            }"
          >
            ${activePlanId === corePlanId ? 'Active Plan' : 'Select Core Pass'}
          </button>
        </div>

        <!-- 2. PLUS PASS (Popular) -->
        <div class="relative rounded-2xl border-2 border-indigo-600 bg-indigo-50/10 p-6 flex flex-col justify-between shadow-md hover:shadow-lg transition-shadow">
          <div class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-indigo-600 text-white text-[11px] font-extrabold uppercase tracking-wide shadow-xs">
            Most Popular
          </div>
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="px-3 py-1 text-xs font-black uppercase tracking-wider rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">Plus Pass</span>
              ${plusSaveBadge}
            </div>
            <div class="flex items-baseline gap-1 my-3">
              <span class="text-3xl sm:text-4xl font-black text-slate-900">₹${plusPrice}</span>
              <span class="text-xs text-slate-500 font-semibold">${durationLabel}</span>
            </div>
            <p class="text-xs text-slate-600 mb-5">
              Comprehensive exam preparation with fast-track 24h evaluation and mock papers.
            </p>
            <div class="space-y-2.5 text-xs text-slate-700 border-t border-slate-100 pt-4">
              <div class="flex items-center gap-2 font-bold text-indigo-700">
                <i data-lucide="award" class="w-4 h-4 flex-shrink-0 text-indigo-600"></i>
                <span>+1,000 Instant Bonus XP Points</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="clock" class="w-4 h-4 flex-shrink-0 text-indigo-600"></i>
                <span>Copy checked within <strong>24 hours</strong> (Fast-Track)</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Access to Premium MCQ Questions</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Access to Premium Test Papers (PDF)</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Daily <strong>2 live MCQ sessions</strong> per subject</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Monthly Full Pledge Exam of all subjects</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Teacher Review & Grading Workflow</span>
              </div>
            </div>
          </div>
          <button 
            onclick="window.subscriptionManager.startCheckout('${plusPlanId}')" 
            class="mt-6 w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activePlanId === plusPlanId
                ? 'bg-indigo-100 text-indigo-800 border border-indigo-300 cursor-default'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
            }"
          >
            ${activePlanId === plusPlanId ? 'Active Plan' : 'Select Plus Pass'}
          </button>
        </div>

        <!-- 3. ELITE PASS (VIP) -->
        <div class="rounded-2xl border ${activePlanId === elitePlanId ? 'border-purple-600 ring-2 ring-purple-500/20 bg-purple-50/20' : 'border-purple-200 bg-white'} p-6 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow">
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="px-3 py-1 text-xs font-black uppercase tracking-wider rounded-full bg-purple-100 text-purple-800 border border-purple-200">Elite Pass</span>
              ${eliteSaveBadge}
            </div>
            <div class="flex items-baseline gap-1 my-3">
              <span class="text-3xl sm:text-4xl font-black text-slate-900">₹${elitePrice}</span>
              <span class="text-xs text-slate-500 font-semibold">${durationLabel}</span>
            </div>
            <p class="text-xs text-slate-600 mb-5">
              Unrestricted priority access: 12-hour evaluation, weekly full exams, and direct mentorship.
            </p>
            <div class="space-y-2.5 text-xs text-slate-700 border-t border-slate-100 pt-4">
              <div class="flex items-center gap-2 font-bold text-purple-700">
                <i data-lucide="award" class="w-4 h-4 flex-shrink-0 text-purple-600"></i>
                <span>+1,500 Instant Bonus XP Points</span>
              </div>
              <div class="flex items-center gap-2 font-semibold text-purple-900">
                <i data-lucide="zap" class="w-4 h-4 flex-shrink-0 text-purple-600"></i>
                <span>Copy checked within <strong>12 hours</strong> (Ultra Priority)</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Access to Premium MCQ Questions</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Access to Premium Test Papers</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Daily <strong>3 live MCQ sessions</strong> per subject</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Weekly Full Pledge Exam across subjects</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-emerald-600"></i>
                <span>Direct Faculty Review & Mentorship</span>
              </div>
            </div>
          </div>
          <button 
            onclick="window.subscriptionManager.startCheckout('${elitePlanId}')" 
            class="mt-6 w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activePlanId === elitePlanId
                ? 'bg-purple-100 text-purple-800 border border-purple-300 cursor-default'
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
            }"
          >
            ${activePlanId === elitePlanId ? 'Active Plan' : 'Select Elite Pass'}
          </button>
        </div>

      </div>

      <!-- Trust Footer -->
      <div class="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
        <div class="flex items-center gap-2">
          <i data-lucide="shield-check" class="w-4 h-4 text-emerald-600"></i>
          <span>Secure Manual UPI Payment with instant transaction audit & receipt.</span>
        </div>
        <div>
          <span>Need institutional or faculty assistance? Contact support at support@excellenceca.com</span>
        </div>
      </div>
    `;
  }

  // --- CHECKOUT & 5-MINUTE PAYMENT MODAL ---

  async startCheckout(planId) {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) {
      window.app.closeModal('pricing-modal');
      window.app.showToast('Please sign in or register to subscribe.', 'info');
      window.app.openAuthModal('login');
      return;
    }

    window.app.closeModal('pricing-modal');
    window.app.showToast('Initializing payment session...', 'info');

    try {
      const token = user.token || user.id;
      const resp = await fetch('/api/payments/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planId })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        window.app.showToast(errData.error || 'Failed to create payment session.', 'error');
        return;
      }

      const data = await resp.json();
      if (!data.success || !data.session) {
        window.app.showToast(data.error || 'Failed to start payment.', 'error');
        return;
      }

      this.activeSession = data.session;
      if (window.store) {
        window.store.addPaymentSession(data.session);
      }

      this.openCheckoutModal(this.activeSession);
    } catch (err) {
      console.error('[SubscriptionManager] Checkout error:', err);
      window.app.showToast('Network error while connecting to payment service.', 'error');
    }
  }

  openCheckoutModal(session) {
    this.activeSession = session;
    this.selectedScreenshotBase64 = null;
    let modal = document.getElementById('payment-checkout-modal');
    if (!modal) {
      this.createCheckoutModalElement();
      modal = document.getElementById('payment-checkout-modal');
    }

    this.renderCheckoutModalContent();
    window.app.openModal('payment-checkout-modal');
    this.startCountdownTimer();
    if (window.lucide) window.lucide.createIcons();
  }

  createCheckoutModalElement() {
    const el = document.createElement('div');
    el.id = 'payment-checkout-modal';
    el.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs hidden overflow-y-auto';
    el.innerHTML = `
      <div class="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        <div id="payment-checkout-content" class="overflow-y-auto p-5 sm:p-7 flex-1"></div>
      </div>
    `;
    document.body.appendChild(el);
  }

  startCountdownTimer() {
    this.stopCountdownTimer();
    if (!this.activeSession || !this.activeSession.expiresAt) return;

    const expiresDt = new Date(this.activeSession.expiresAt);

    const updateDisplay = () => {
      const timerEl = document.getElementById('payment-countdown-display');
      const bannerEl = document.getElementById('payment-countdown-banner');
      const now = new Date();
      const diffMs = expiresDt - now;

      if (diffMs <= 0) {
        this.stopCountdownTimer();
        if (timerEl) timerEl.textContent = '00:00 (Expired)';
        if (bannerEl) {
          bannerEl.className = 'mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-bold';
          bannerEl.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4 flex-shrink-0"></i> Session expired. If you already made payment, submit your UTR below and it will be reviewed manually.`;
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }

      const totalSec = Math.floor(diffMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (timerEl) timerEl.textContent = formatted;
      if (totalSec < 60 && bannerEl) {
        bannerEl.className = 'mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-bold animate-pulse';
      }
    };

    updateDisplay();
    this.countdownInterval = setInterval(updateDisplay, 1000);
  }

  stopCountdownTimer() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  renderCheckoutModalContent() {
    const container = document.getElementById('payment-checkout-content');
    if (!container || !this.activeSession) return;

    const session = this.activeSession;
    const channel = session.channelSnapshot || {
      name: 'Primary UPI',
      upiId: 'excellenceca@okhdfcbank',
      qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=excellenceca@okhdfcbank%26pn=ExcellenceCA%26cu=INR'
    };

    container.innerHTML = `
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
            <i data-lucide="credit-card" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Complete UPI Payment</h3>
            <p class="text-[11px] text-slate-500 font-mono">Session #${session.paymentSessionId.slice(-8)}</p>
          </div>
        </div>
        <button 
          onclick="window.subscriptionManager.handleUserCloseCheckout()" 
          class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          title="Cancel Payment"
        >
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- 5-Minute Expiry Banner -->
      <div id="payment-countdown-banner" class="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i data-lucide="clock" class="w-4 h-4 text-blue-600 flex-shrink-0 animate-spin"></i>
          <span>Payment window expires in:</span>
        </div>
        <span id="payment-countdown-display" class="font-mono text-sm font-black text-blue-700 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200">
          05:00
        </span>
      </div>

      <!-- Plan Order Summary Card -->
      <div class="bg-slate-50 rounded-xl p-3.5 mb-5 border border-slate-200 flex items-center justify-between">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Order Summary</span>
          <div class="font-extrabold text-slate-900 text-sm">${session.planName}</div>
          <div class="text-[11px] text-slate-500 font-medium">${session.durationDays} Days Duration</div>
        </div>
        <div class="text-right">
          <div class="text-2xl font-black text-slate-900">₹${session.amount}</div>
          <div class="text-[10px] text-emerald-700 font-bold">Inclusive of all taxes</div>
        </div>
      </div>

      <!-- QR Code & UPI Details Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 items-center">
        <!-- QR Code -->
        <div class="bg-white p-3 rounded-xl border border-slate-200 text-center flex flex-col items-center shadow-2xs">
          <div class="w-40 h-40 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center p-1.5 border border-slate-100">
            <img src="${channel.qrCodeUrl}" alt="UPI QR Code" class="w-full h-full object-contain">
          </div>
          <span class="text-[11px] font-semibold text-slate-500 mt-2">Scan with GPay, PhonePe, or Paytm</span>
        </div>

        <!-- UPI Details & Copy -->
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-bold text-slate-600 block mb-1">UPI Payment Address</label>
            <div class="flex items-center gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
              <span id="checkout-upi-id" class="text-xs font-mono font-bold text-slate-900 flex-1 truncate">${channel.upiId}</span>
              <button 
                onclick="window.subscriptionManager.copyUpiId('${channel.upiId}')"
                class="px-2 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 shadow-2xs transition-colors flex items-center gap-1 flex-shrink-0"
              >
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                <span id="copy-btn-text">Copy</span>
              </button>
            </div>
          </div>

          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div class="font-bold text-slate-900 flex items-center gap-1">
              <i data-lucide="info" class="w-3.5 h-3.5 text-blue-600"></i>
              Payment Instructions:
            </div>
            <div>1. Pay exact amount <strong>₹${session.amount}</strong> via any UPI app.</div>
            <div>2. Copy the 12-digit <strong>UTR / Reference ID</strong> from transaction details.</div>
            <div>3. Enter UTR and upload screenshot below.</div>
          </div>
        </div>
      </div>

      <!-- Verification Form -->
      <form id="payment-verification-form" onsubmit="event.preventDefault(); window.subscriptionManager.submitPaymentVerification();" class="space-y-4">
        <div>
          <label class="text-xs font-bold text-slate-700 block mb-1">
            Transaction / UTR Number <span class="text-rose-600">*</span>
          </label>
          <input 
            type="text" 
            id="payment-utr-input" 
            required 
            placeholder="e.g. 423456789012 or UPI Ref ID" 
            class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-mono uppercase"
          >
          <span class="text-[10px] text-slate-500">Must be alphanumeric, between 6 and 30 characters.</span>
        </div>

        <div>
          <label class="text-xs font-bold text-slate-700 block mb-1">
            Payment Screenshot / Receipt <span class="text-rose-600">*</span>
          </label>
          <input 
            type="file" 
            id="payment-screenshot-input" 
            accept="image/*"
            required
            onchange="window.subscriptionManager.handleScreenshotSelect(event)"
            class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
          >
          <div id="screenshot-preview-container" class="mt-2 hidden">
            <img id="screenshot-preview-img" src="" alt="Proof Preview" class="h-20 w-auto rounded border border-slate-200 object-cover">
          </div>
        </div>

        <div class="pt-2 flex items-center justify-end gap-3">
          <button 
            type="button" 
            onclick="window.subscriptionManager.handleUserCloseCheckout()"
            class="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            id="submit-payment-btn"
            class="px-5 py-2 text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-transform active:scale-95 flex items-center gap-1.5"
          >
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Submit Verification</span>
          </button>
        </div>
      </form>
    `;
  }

  copyUpiId(upiId) {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId).then(() => {
      const btn = document.getElementById('copy-btn-text');
      if (btn) btn.textContent = 'Copied!';
      window.app.showToast('UPI ID copied to clipboard!', 'success');
      setTimeout(() => { if (btn) btn.textContent = 'Copy'; }, 2000);
    }).catch(() => {
      window.app.showToast(`UPI ID: ${upiId}`, 'info');
    });
  }

  handleScreenshotSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      window.app.showToast('Screenshot image must be under 5MB.', 'error');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedScreenshotBase64 = e.target.result;
      const previewImg = document.getElementById('screenshot-preview-img');
      const container = document.getElementById('screenshot-preview-container');
      if (previewImg && container) {
        previewImg.src = e.target.result;
        container.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  }

  async handleUserCloseCheckout() {
    if (!this.activeSession) {
      window.app.closeModal('payment-checkout-modal');
      return;
    }

    const sessionId = this.activeSession.paymentSessionId;
    this.stopCountdownTimer();
    window.app.closeModal('payment-checkout-modal');

    // Inform server of cancellation
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (user) {
      try {
        const token = user.token || user.id;
        await fetch('/api/payments/cancel-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ paymentSessionId: sessionId })
        });
      } catch (e) {}
    }

    this.activeSession = null;
    window.app.showToast('Payment session cancelled.', 'info');
  }

  async submitPaymentVerification() {
    if (!this.activeSession) return;

    const utrInput = document.getElementById('payment-utr-input');
    const utr = utrInput ? utrInput.value.trim() : '';

    if (!utr) {
      window.app.showToast('Please enter your transaction UTR / Reference number.', 'error');
      return;
    }

    if (!this.selectedScreenshotBase64) {
      window.app.showToast('Please upload a screenshot of the payment receipt.', 'error');
      return;
    }

    const submitBtn = document.getElementById('submit-payment-btn');
    const origHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Submitting...`;
      if (window.lucide) window.lucide.createIcons();
    }

    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || user.id) : '';

    try {
      const resp = await fetch('/api/payments/submit-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          paymentSessionId: this.activeSession.paymentSessionId,
          utr: utr,
          screenshot: this.selectedScreenshotBase64
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        window.app.showToast(data.error || 'Failed to submit payment proof.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origHtml;
        }
        return;
      }

      this.stopCountdownTimer();
      window.app.closeModal('payment-checkout-modal');

      if (data.session.status === 'late_payment') {
        window.app.showToast('Payment submitted after timeout. Flagged for priority manual verification.', 'warning');
      } else {
        window.app.showToast('Payment proof submitted successfully! Verification usually takes 10-30 minutes.', 'success');
      }

      this.activeSession = null;
      this.selectedScreenshotBase64 = null;

      // Refresh student dashboard and history
      this.syncMySubscription();
      if (window.studentDashboard && typeof window.studentDashboard.renderPaymentHistory === 'function') {
        window.studentDashboard.renderPaymentHistory();
      }
    } catch (err) {
      console.error('[SubscriptionManager] Payment submit error:', err);
      window.app.showToast('Network error while submitting payment.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      }
    }
  }

  // --- REALTIME SYNC HANDLERS ---

  onSubscriptionUpdate() {
    if (window.studentDashboard && typeof window.studentDashboard.renderPassBadge === 'function') {
      window.studentDashboard.renderPassBadge();
    }
    if (window.studentDashboard && typeof window.studentDashboard.renderPaymentHistory === 'function') {
      window.studentDashboard.renderPaymentHistory();
    }
  }

  onPaymentSessionsUpdate() {
    if (window.studentDashboard && typeof window.studentDashboard.renderPaymentHistory === 'function') {
      window.studentDashboard.renderPaymentHistory();
    }
  }
}

// Global Singleton
window.subscriptionManager = new SubscriptionManager();
document.addEventListener('DOMContentLoaded', () => window.subscriptionManager.init());
