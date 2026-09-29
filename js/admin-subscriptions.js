/**
 * admin-subscriptions.js - Admin Portal Management for Subscriptions, UPI Payments & Plans
 * ExcellenceCA Platform
 * 
 * Extends AdminDashboard with:
 * 1. Subscriptions & Grants Management (KPIs, filter, manual grant/extend/shorten/suspend)
 * 2. Payment Verifications (review UTR, screenshot zoom, approve with instant XP, reject with reason)
 * 3. UPI Channels & QR Management (add/edit, toggle active, set primary)
 * 4. Plans & Trial Configuration (pricing, SLA, daily live MCQs, instant points)
 * 5. Admin Audit Logs (chronological security audit trail)
 */

(function() {
  if (typeof AdminDashboard === 'undefined') {
    console.error('[AdminSubscriptions] AdminDashboard class is not defined.');
    return;
  }

  // --- CORE RESILIENCE & NETWORKING HELPERS ---

  async function adminFetch(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || '') : '';

    const headers = {
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    };

    try {
      const resp = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!resp.ok) {
        let errDetail = `Server returned HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          if (j && (j.error || j.message)) errDetail = j.error || j.message;
        } catch (_) {}
        const error = new Error(errDetail);
        error.status = resp.status;
        throw error;
      }
      return await resp.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${timeoutMs / 1000}s. Please verify backend server is running.`);
      }
      throw err;
    }
  }

  function renderAdminError(containerId, title, errorMsg, retryFnName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="p-8 my-8 text-center bg-white border border-rose-200 rounded-2xl shadow-xs max-w-lg mx-auto animate-in fade-in duration-150">
        <div class="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-rose-100">
          <i data-lucide="alert-triangle" class="w-6 h-6"></i>
        </div>
        <h3 class="text-base font-bold text-slate-900 mb-1">${title}</h3>
        <p class="text-xs text-slate-500 mb-5 leading-relaxed">${errorMsg || 'Failed to load data from server.'}</p>
        <button 
          type="button"
          onclick="window.adminDashboard.${retryFnName}()"
          class="px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
        >
          <i data-lucide="refresh-cw" class="w-4 h-4"></i> Retry Connection
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  function normalizeSubsMap(data) {
    let subs = {};
    if (!data) return subs;
    if (data.subscriptions && typeof data.subscriptions === 'object' && !Array.isArray(data.subscriptions)) {
      return data.subscriptions;
    }
    const list = data.subscriptionsList || data.subscriptions || [];
    if (Array.isArray(list)) {
      list.forEach(item => {
        const s = item.subscription || item;
        const uid = s.userId || (item.student && item.student.id);
        if (uid) subs[uid] = s;
      });
    }
    return subs;
  }

  AdminDashboard.prototype.startTabPolling = function(tabName, callback, intervalMs = 60000) {
    this.stopTabPolling();
    // Do not poll on payment-channels, plans-config, or audit-logs where realtime listeners / manual actions handle state
    if (tabName === 'payment-channels' || tabName === 'plans-config' || tabName === 'audit-logs') {
      return;
    }
    this._activePollingTab = tabName;
    this._tabPollLastRunAt = Date.now();
    const tick = async () => {
      if (document.hidden) return;
      if (this.currentTab !== tabName) {
        this.stopTabPolling();
        return;
      }
      // Admin view not open (tab still selected in the background): no admin requests
      if (window.app && window.app.currentView !== 'admin') return;
      // If modal is open or user is actively typing, skip background re-renders
      const modal = document.getElementById('admin-generic-modal');
      if (modal && !modal.classList.contains('hidden')) return;
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
      this._tabPollLastRunAt = Date.now();
      try {
        await callback();
      } catch (err) {
        console.warn(`[AdminPolling] Tab ${tabName} poll error:`, err);
      }
    };
    this._tabPollTick = tick;
    this._pollingIntervalId = setInterval(tick, intervalMs);
  };

  /** Tab became visible again (called from serverSync's shared visibility refresh): one immediate
   * refresh of the polled admin tab, at most once per minute. */
  AdminDashboard.prototype.onBrowserTabVisible = function() {
    if (!this._pollingIntervalId || !this._tabPollTick) return;
    if (Date.now() - (this._tabPollLastRunAt || 0) < 60000) return;
    this._tabPollTick();
  };

  AdminDashboard.prototype.stopTabPolling = function() {
    if (this._pollingIntervalId) {
      clearInterval(this._pollingIntervalId);
      this._pollingIntervalId = null;
    }
    this._activePollingTab = null;
    this._tabPollTick = null;
  };

  // --- TAB 1: SUBSCRIPTIONS & MANUAL GRANTS ---

  AdminDashboard.prototype.renderSubscriptions = async function(isSilent = false, forceFullRender = false) {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    // Fast-path: if search input and table container already exist in DOM,
    // only update table without destroying search input or stealing focus
    if (!forceFullRender && document.getElementById('admin-sub-table-container') && document.getElementById('admin-sub-search-input')) {
      try {
        const data = await adminFetch('/api/admin/subscriptions');
        if (this.currentTab !== 'subscriptions') return;
        if (data && data.success) {
          const subs = normalizeSubsMap(data);
          this._cachedSubs = subs;
          if (window.store) window.store.saveSubscriptions(subs);
        }
      } catch (e) {
        console.warn('[AdminSubscriptions] Fast-path subs fetch failed:', e);
      }
      if (this.currentTab !== 'subscriptions') return;
      this.renderSubscriptionsTableOnly();
      return;
    }

    if (!isSilent) {
      container.innerHTML = `
        <div class="p-8 text-center text-slate-500">
          <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
          <p class="text-xs font-bold">Loading Subscriptions & Grants...</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    // Fetch subscriptions from backend
    let subs = {};
    try {
      const data = await adminFetch('/api/admin/subscriptions');
      if (this.currentTab !== 'subscriptions') return;
      if (data && data.success) {
        subs = normalizeSubsMap(data);
        this._cachedSubs = subs;
        if (window.store) window.store.saveSubscriptions(subs);
      }
    } catch (e) {
      if (this.currentTab !== 'subscriptions') return;
      console.warn('[AdminSubscriptions] Backend fetch failed, falling back to store:', e);
      if (window.store) subs = window.store.getSubscriptions() || {};
      if (Object.keys(subs).length === 0 && !isSilent) {
        renderAdminError('admin-content-area', 'Unable to Load Subscriptions', e.message, 'renderSubscriptions');
        return;
      }
    }

    if (this.currentTab !== 'subscriptions') return;

    // Start background live polling (refreshes silently every 7s)
    this.startTabPolling('subscriptions', async () => {
      await this.renderSubscriptions(true);
    });

    const students = (window.store ? window.store.getStudents() : []) || [];
    const plans = (window.store ? window.store.getSubscriptionPlans() : {}) || {};

    // Calculate KPIs
    let totalActive = 0;
    let eliteHolders = 0;
    let plusHolders = 0;
    let coreHolders = 0;
    let trialHolders = 0;
    let expiringIn7Days = 0;
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    students.forEach(st => {
      const sub = subs[st.id];
      if (sub && (sub.status === 'active' || sub.status === 'manually_granted')) {
        const exp = sub.expiresAt ? new Date(sub.expiresAt) : null;
        if (!exp || exp > now) {
          totalActive++;
          const tier = sub.planTier || (plans[sub.planId] ? plans[sub.planId].tier : 'core');
          if (tier === 'elite') eliteHolders++;
          else if (tier === 'plus') plusHolders++;
          else if (tier === 'trial' || sub.isTrial) trialHolders++;
          else coreHolders++;

          if (exp && exp <= next7Days) {
            expiringIn7Days++;
          }
        }
      }
    });

    const search = (this.subSearch || '').toLowerCase().trim();
    const tierFilter = this.subTierFilter || 'all';

    const filteredStudents = students.filter(st => {
      const sub = subs[st.id];
      const isSubActive = sub && (sub.status === 'active' || sub.status === 'manually_granted') && (!sub.expiresAt || new Date(sub.expiresAt) > now);
      const tier = isSubActive ? (sub.planTier || (plans[sub.planId] ? plans[sub.planId].tier : 'core')) : 'free';
      const isTrial = isSubActive && (tier === 'trial' || sub.isTrial);

      if (tierFilter === 'active' && !isSubActive) return false;
      if (tierFilter === 'free' && isSubActive) return false;
      if (tierFilter === 'elite' && (!isSubActive || tier !== 'elite')) return false;
      if (tierFilter === 'plus' && (!isSubActive || tier !== 'plus')) return false;
      if (tierFilter === 'core' && (!isSubActive || tier !== 'core')) return false;
      if (tierFilter === 'trial' && (!isSubActive || !isTrial)) return false;
      if (tierFilter === 'expired' && (!sub || (sub.status !== 'expired' && (!sub.expiresAt || new Date(sub.expiresAt) >= now)))) return false;

      if (search) {
        const name = (st.name || '').toLowerCase();
        const email = (st.email || '').toLowerCase();
        const phone = (st.phone || '').toLowerCase();
        const uid = (st.id || '').toLowerCase();
        const uname = (st.username || '').toLowerCase();
        const planName = (sub && sub.planName ? sub.planName : '').toLowerCase();
        if (!name.includes(search) && !email.includes(search) && !phone.includes(search) && !uid.includes(search) && !uname.includes(search) && !planName.includes(search)) {
          return false;
        }
      }
      return true;
    });

    this._subPage = this._subPage || 1;
    const pageSize = 10;
    const totalFiltered = filteredStudents.length;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
    if (this._subPage > totalPages) this._subPage = totalPages;
    if (this._subPage < 1) this._subPage = 1;

    const startIndex = (this._subPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalFiltered);
    const pagedStudents = filteredStudents.slice(startIndex, endIndex);

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header & Action Row -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-black text-slate-900 tracking-tight">Student Subscriptions & Pass Grants</h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Live Sync
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">Manage active memberships, extend validity, grant complimentary passes, and monitor expiry schedules.</p>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.openManualGrantModal()" 
              class="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="plus-circle" class="w-4 h-4"></i> Grant Pass Manually
            </button>
            <button 
              onclick="window.adminDashboard.renderSubscriptions()" 
              class="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="Refresh"
            >
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- KPI Summary Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Active Passes</span>
            <span class="text-2xl font-black text-slate-900 mt-1 block">${totalActive}</span>
            <span class="text-[10px] text-slate-400 font-medium">Out of ${students.length} students</span>
          </div>

          <div class="bg-white border border-purple-200 bg-purple-50/30 rounded-xl p-4 shadow-2xs">
            <span class="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">Elite Pass</span>
            <span class="text-2xl font-black text-purple-900 mt-1 block">${eliteHolders}</span>
            <span class="text-[10px] text-purple-600 font-semibold">12h SLA copy check</span>
          </div>

          <div class="bg-white border border-indigo-200 bg-indigo-50/30 rounded-xl p-4 shadow-2xs">
            <span class="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">Plus Pass</span>
            <span class="text-2xl font-black text-indigo-900 mt-1 block">${plusHolders}</span>
            <span class="text-[10px] text-indigo-600 font-semibold">24h SLA copy check</span>
          </div>

          <div class="bg-white border border-blue-200 bg-blue-50/30 rounded-xl p-4 shadow-2xs">
            <span class="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Core Pass</span>
            <span class="text-2xl font-black text-blue-900 mt-1 block">${coreHolders}</span>
            <span class="text-[10px] text-blue-600 font-semibold">48h SLA copy check</span>
          </div>

          <div class="bg-white border border-amber-200 bg-amber-50/30 rounded-xl p-4 shadow-2xs">
            <span class="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">₹9 Elite Trials</span>
            <span class="text-2xl font-black text-amber-900 mt-1 block">${trialHolders}</span>
            <span class="text-[10px] text-amber-600 font-semibold">10-day active trials</span>
          </div>

          <div class="bg-white border border-rose-200 bg-rose-50/30 rounded-xl p-4 shadow-2xs">
            <span class="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Expiring &le; 7d</span>
            <span class="text-2xl font-black text-rose-900 mt-1 block">${expiringIn7Days}</span>
            <span class="text-[10px] text-rose-600 font-semibold">Action required</span>
          </div>
        </div>

        <!-- Bulk Actions Sticky Bar (Shows when checkboxes are selected) -->
        <div id="admin-sub-bulk-bar" class="hidden items-center justify-between bg-rose-50 border border-rose-200 p-3.5 rounded-xl shadow-xs">
          <div class="text-xs font-bold text-rose-900 flex items-center gap-2">
            <i data-lucide="check-square" class="w-4 h-4 text-rose-600"></i>
            <span><span id="admin-sub-selected-count">0</span> students selected</span>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.openBulkSubscriptionModal()" 
              class="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="layers" class="w-4 h-4"></i> Bulk Update Passes
            </button>
            <button 
              onclick="window.adminDashboard.clearSubSelection()" 
              class="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Clear Selection
            </button>
          </div>
        </div>

        <!-- Filter & Search Controls -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-xl shadow-2xs">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-3"></i>
            <input 
              type="text" 
              id="admin-sub-search-input"
              placeholder="Search by student name, email, phone, ID or pass tier..."
              value="${this.subSearch || ''}"
              oninput="window.adminDashboard.subSearch = this.value; window.adminDashboard._subPage = 1; window.adminDashboard.renderSubscriptionsTableOnly();"
              class="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>

          <div class="flex items-center gap-2">
            <select 
              id="admin-sub-tier-filter"
              onchange="window.adminDashboard.subTierFilter = this.value; window.adminDashboard._subPage = 1; window.adminDashboard.renderSubscriptionsTableOnly();"
              class="px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all" ${tierFilter === 'all' ? 'selected' : ''}>All Tiers & Free</option>
              <option value="active" ${tierFilter === 'active' ? 'selected' : ''}>All Active Passes</option>
              <option value="elite" ${tierFilter === 'elite' ? 'selected' : ''}>Elite Pass Holders</option>
              <option value="plus" ${tierFilter === 'plus' ? 'selected' : ''}>Plus Pass Holders</option>
              <option value="core" ${tierFilter === 'core' ? 'selected' : ''}>Core Pass Holders</option>
              <option value="trial" ${tierFilter === 'trial' ? 'selected' : ''}>Active ₹9 Trials</option>
              <option value="free" ${tierFilter === 'free' ? 'selected' : ''}>Free Basic Tier</option>
              <option value="expired" ${tierFilter === 'expired' ? 'selected' : ''}>Expired Passes</option>
            </select>
          </div>
        </div>

        <!-- Student Subscriptions Table Container -->
        <div id="admin-sub-table-container">
        <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th class="py-3 px-3 w-8">
                    <input 
                      type="checkbox" 
                      id="admin-sub-select-all" 
                      onchange="window.adminDashboard.toggleSelectAllSubs(this.checked)" 
                      class="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                      title="Select all"
                    />
                  </th>
                  <th class="py-3 px-4">Student</th>
                  <th class="py-3 px-4">Current Pass</th>
                  <th class="py-3 px-4">SLA / Quota</th>
                  <th class="py-3 px-4">Validity / Expiry</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filteredStudents.length === 0 ? `
                  <tr>
                    <td colspan="7" class="py-12 text-center text-slate-400">
                      <i data-lucide="users" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                      <p class="text-xs font-bold">No students found matching current filters.</p>
                    </td>
                  </tr>
                ` : pagedStudents.map(st => {
                  const sub = subs[st.id];
                  const isSubActive = sub && (sub.status === 'active' || sub.status === 'manually_granted') && (!sub.expiresAt || new Date(sub.expiresAt) > now);
                  
                  let badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">Free Tier</span>';
                  let slaDisplay = '<span class="text-xs text-slate-500">72h SLA • 0 Live MCQ</span>';
                  let validityDisplay = '<span class="text-xs text-slate-400">Standard Access</span>';
                  let statusBadge = '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Free</span>';

                  if (isSubActive) {
                    const tier = sub.planTier || (plans[sub.planId] ? plans[sub.planId].tier : 'core');
                    const isTrial = tier === 'trial' || sub.isTrial;
                    
                    if (tier === 'elite') {
                      badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-100 text-purple-800 border border-purple-200">${sub.planName || 'Elite Pass'}</span>`;
                    } else if (tier === 'plus') {
                      badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 border border-indigo-200">${sub.planName || 'Plus Pass'}</span>`;
                    } else if (isTrial) {
                      badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200">₹9 Elite Trial</span>`;
                    } else {
                      badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">${sub.planName || 'Core Pass'}</span>`;
                    }

                    slaDisplay = `
                      <span class="text-xs font-semibold text-slate-800 block">${sub.copyCheckSlaHours || 24}h SLA Copy Check</span>
                      <span class="text-[11px] text-slate-500">${sub.liveMcqDailyLimit ? sub.liveMcqDailyLimit + ' Live MCQs/Day' : 'Weekly Mocks'}</span>
                    `;

                    if (sub.expiresAt) {
                      const expDate = new Date(sub.expiresAt);
                      const daysLeft = Math.max(0, Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)));
                      const isExpSoon = daysLeft <= 7;

                      validityDisplay = `
                        <span class="text-xs font-bold ${isExpSoon ? 'text-rose-700' : 'text-slate-800'} block">
                          ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining
                        </span>
                        <span class="text-[11px] text-slate-500">Exp: ${expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      `;
                    } else {
                      validityDisplay = '<span class="text-xs font-bold text-emerald-700">Lifetime / Custom</span>';
                    }

                    statusBadge = sub.status === 'manually_granted'
                      ? '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">Granted</span>'
                      : '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active</span>';
                  } else if (sub && (sub.status === 'expired' || (sub.expiresAt && new Date(sub.expiresAt) <= now))) {
                    statusBadge = '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">Expired</span>';
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">${sub.planName || 'Expired Pass'}</span>`;
                    validityDisplay = `<span class="text-xs text-rose-600 font-semibold">Expired on ${new Date(sub.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>`;
                  } else if (sub && sub.status === 'suspended') {
                    statusBadge = '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Suspended</span>';
                  }

                  return `
                    <tr class="hover:bg-slate-50/70 transition-colors">
                      <td class="py-3 px-3">
                        <input 
                          type="checkbox" 
                          value="${st.id}" 
                          onchange="window.adminDashboard.onSubRowCheckboxChange()" 
                          class="admin-sub-select-user rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                      </td>
                      <td class="py-3 px-4">
                        <span class="font-bold text-slate-900 block">${st.name || 'Unnamed Student'}</span>
                        <span class="text-xs text-slate-500 font-mono">${st.email || st.phone || '@' + (st.username || 'student')}</span>
                        <span class="text-[10px] font-bold text-blue-700 uppercase">${st.caLevel || 'CA Student'}</span>
                      </td>
                      <td class="py-3 px-4">${badge}</td>
                      <td class="py-3 px-4">${slaDisplay}</td>
                      <td class="py-3 px-4">${validityDisplay}</td>
                      <td class="py-3 px-4">${statusBadge}</td>
                      <td class="py-3 px-4 text-right">
                        <div class="inline-flex items-center gap-1.5">
                          <button 
                            onclick="window.adminDashboard.openManageSubscriptionModal('${st.id}')"
                            class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="Manage pass tier & expiry"
                          >
                            <i data-lucide="settings" class="w-3.5 h-3.5"></i> Manage Pass
                          </button>
                          <button 
                            onclick="window.adminDashboard.openUserAuditTrailModal('${st.id}')"
                            class="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="View Lifecycle Audit Trail"
                          >
                            <i data-lucide="history" class="w-4 h-4"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          ${totalPages > 1 ? `
            <div class="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div class="text-slate-600">
                Showing <span class="font-semibold text-slate-900">${totalFiltered === 0 ? 0 : startIndex + 1}</span> to <span class="font-semibold text-slate-900">${endIndex}</span> of <span class="font-bold text-slate-900">${totalFiltered}</span> students
              </div>
              <div class="flex items-center gap-1">
                <button 
                  onclick="window.adminDashboard.setSubPage(${this._subPage - 1})"
                  ${this._subPage <= 1 ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
                >
                  Previous
                </button>
                <span class="px-3 py-1 font-bold text-xs text-slate-700 bg-white border border-slate-200 rounded">
                  Page ${this._subPage} of ${totalPages}
                </span>
                <button 
                  onclick="window.adminDashboard.setSubPage(${this._subPage + 1})"
                  ${this._subPage >= totalPages ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
                >
                  Next
                </button>
              </div>
            </div>
          ` : ''}
        </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.setSubPage = function(page) {
    this._subPage = page;
    if (document.getElementById('admin-sub-table-container')) {
      this.renderSubscriptionsTableOnly();
    } else {
      this.renderSubscriptions(true);
    }
  };

  AdminDashboard.prototype.renderSubscriptionsTableOnly = function() {
    const tableContainer = document.getElementById('admin-sub-table-container');
    if (!tableContainer) {
      this.renderSubscriptions(true);
      return;
    }

    const students = (window.store ? window.store.getStudents() : []) || [];
    const subs = this._cachedSubs || (window.store ? window.store.getSubscriptions() : {}) || {};
    const plans = (window.store ? window.store.getSubscriptionPlans() : {}) || {};
    const tierFilter = this.subTierFilter || 'all';
    const search = (this.subSearch || '').toLowerCase().trim();
    const now = new Date();

    const filteredStudents = students.filter(st => {
      const sub = subs[st.id];
      const isSubActive = sub && (sub.status === 'active' || sub.status === 'manually_granted') && (!sub.expiresAt || new Date(sub.expiresAt) > now);
      const tier = sub ? (sub.planTier || (plans[sub.planId] ? plans[sub.planId].tier : 'core')) : 'free';
      const isTrial = sub ? (tier === 'trial' || sub.isTrial) : false;

      if (tierFilter === 'active' && !isSubActive) return false;
      if (tierFilter === 'free' && isSubActive) return false;
      if (tierFilter === 'elite' && (!isSubActive || tier !== 'elite')) return false;
      if (tierFilter === 'plus' && (!isSubActive || tier !== 'plus')) return false;
      if (tierFilter === 'core' && (!isSubActive || tier !== 'core')) return false;
      if (tierFilter === 'trial' && (!isSubActive || !isTrial)) return false;
      if (tierFilter === 'expired' && (!sub || (sub.status !== 'expired' && (!sub.expiresAt || new Date(sub.expiresAt) >= now)))) return false;

      if (search) {
        const name = (st.name || '').toLowerCase();
        const email = (st.email || '').toLowerCase();
        const phone = (st.phone || '').toLowerCase();
        const uid = (st.id || '').toLowerCase();
        const uname = (st.username || '').toLowerCase();
        const planName = (sub && sub.planName ? sub.planName : '').toLowerCase();
        if (!name.includes(search) && !email.includes(search) && !phone.includes(search) && !uid.includes(search) && !uname.includes(search) && !planName.includes(search)) {
          return false;
        }
      }
      return true;
    });

    this._subPage = this._subPage || 1;
    const pageSize = 10;
    const totalFiltered = filteredStudents.length;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
    if (this._subPage > totalPages) this._subPage = totalPages;
    if (this._subPage < 1) this._subPage = 1;

    const startIndex = (this._subPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalFiltered);
    const pagedStudents = filteredStudents.slice(startIndex, endIndex);

    tableContainer.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th class="py-3 px-3 w-8">
                  <input 
                    type="checkbox" 
                    id="admin-sub-select-all" 
                    onchange="window.adminDashboard.toggleSelectAllSubs(this.checked)" 
                    class="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    title="Select all"
                  />
                </th>
                <th class="py-3 px-4">Student</th>
                <th class="py-3 px-4">Current Pass</th>
                <th class="py-3 px-4">SLA / Quota</th>
                <th class="py-3 px-4">Validity / Expiry</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filteredStudents.length === 0 ? `
                <tr>
                  <td colspan="7" class="py-12 text-center text-slate-400">
                    <i data-lucide="users" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                    <p class="text-xs font-bold">No students found matching current filters.</p>
                  </td>
                </tr>
              ` : pagedStudents.map(st => {
                const sub = subs[st.id];
                const isSubActive = sub && (sub.status === 'active' || sub.status === 'manually_granted') && (!sub.expiresAt || new Date(sub.expiresAt) > now);
                
                let badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">Free Tier</span>';
                let slaDisplay = '<span class="text-xs text-slate-500">72h SLA • 0 Live MCQ</span>';
                let validityDisplay = '<span class="text-xs text-slate-400">Standard Access</span>';
                let statusBadge = '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Free</span>';

                if (isSubActive) {
                  const tier = sub.planTier || (plans[sub.planId] ? plans[sub.planId].tier : 'core');
                  const isTrial = tier === 'trial' || sub.isTrial;
                  
                  if (tier === 'elite') {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-100 text-purple-800 border border-purple-200">${sub.planName || 'Elite Pass'}</span>`;
                  } else if (tier === 'plus') {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 border border-indigo-200">${sub.planName || 'Plus Pass'}</span>`;
                  } else if (isTrial) {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200">₹9 Elite Trial</span>`;
                  } else {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">${sub.planName || 'Core Pass'}</span>`;
                  }

                  slaDisplay = `
                    <span class="text-xs font-semibold text-slate-800 block">${sub.copyCheckSlaHours || 24}h SLA Copy Check</span>
                    <span class="text-[11px] text-slate-500">${sub.liveMcqDailyLimit ? sub.liveMcqDailyLimit + ' Live MCQs/Day' : 'Weekly Mocks'}</span>
                  `;

                  if (sub.expiresAt) {
                    const expDate = new Date(sub.expiresAt);
                    const daysLeft = Math.max(0, Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)));
                    const isExpSoon = daysLeft <= 7;

                    validityDisplay = `
                      <span class="text-xs font-bold ${isExpSoon ? 'text-rose-700' : 'text-slate-800'} block">
                        ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining
                      </span>
                      <span class="text-[11px] text-slate-500">Exp: ${expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    `;
                  } else {
                    validityDisplay = '<span class="text-xs font-bold text-emerald-700">Lifetime / Custom</span>';
                  }

                  statusBadge = sub.status === 'manually_granted'
                    ? '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">Granted</span>'
                    : '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active</span>';
                } else if (sub && (sub.status === 'expired' || (sub.expiresAt && new Date(sub.expiresAt) <= now))) {
                  statusBadge = '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">Expired</span>';
                  badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">${sub.planName || 'Expired Pass'}</span>`;
                  validityDisplay = `<span class="text-xs text-rose-600 font-semibold">Expired on ${new Date(sub.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>`;
                } else if (sub && sub.status === 'suspended') {
                  statusBadge = '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Suspended</span>';
                }

                return `
                  <tr class="hover:bg-slate-50/70 transition-colors">
                    <td class="py-3 px-3">
                      <input 
                        type="checkbox" 
                        value="${st.id}" 
                        onchange="window.adminDashboard.onSubRowCheckboxChange()" 
                        class="admin-sub-select-user rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                    </td>
                    <td class="py-3 px-4">
                      <span class="font-bold text-slate-900 block">${st.name || 'Unnamed Student'}</span>
                      <span class="text-xs text-slate-500 font-mono">${st.email || st.phone || '@' + (st.username || 'student')}</span>
                      <span class="text-[10px] font-bold text-blue-700 uppercase">${st.caLevel || 'CA Student'}</span>
                    </td>
                    <td class="py-3 px-4">${badge}</td>
                    <td class="py-3 px-4">${slaDisplay}</td>
                    <td class="py-3 px-4">${validityDisplay}</td>
                    <td class="py-3 px-4">${statusBadge}</td>
                    <td class="py-3 px-4 text-right">
                      <div class="inline-flex items-center gap-1.5">
                        <button 
                          onclick="window.adminDashboard.openManageSubscriptionModal('${st.id}')"
                          class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          title="Manage pass tier & expiry"
                        >
                          <i data-lucide="settings" class="w-3.5 h-3.5"></i> Manage Pass
                        </button>
                        <button 
                          onclick="window.adminDashboard.openUserAuditTrailModal('${st.id}')"
                          class="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="View Lifecycle Audit Trail"
                        >
                          <i data-lucide="history" class="w-4 h-4"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
          <div class="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="text-slate-600">
              Showing <span class="font-semibold text-slate-900">${totalFiltered === 0 ? 0 : startIndex + 1}</span> to <span class="font-semibold text-slate-900">${endIndex}</span> of <span class="font-bold text-slate-900">${totalFiltered}</span> students
            </div>
            <div class="flex items-center gap-1">
              <button 
                onclick="window.adminDashboard.setSubPage(${this._subPage - 1})"
                ${this._subPage <= 1 ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
              >
                Previous
              </button>
              <span class="px-3 py-1 font-bold text-xs text-slate-700 bg-white border border-slate-200 rounded">
                Page ${this._subPage} of ${totalPages}
              </span>
              <button 
                onclick="window.adminDashboard.setSubPage(${this._subPage + 1})"
                ${this._subPage >= totalPages ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
              >
                Next
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  };

  // --- SELECTION & BULK ACTIONS FOR SUBSCRIPTIONS ---

  AdminDashboard.prototype.toggleSelectAllSubs = function(checked) {
    const boxes = document.querySelectorAll('.admin-sub-select-user');
    boxes.forEach(b => b.checked = checked);
    this.onSubRowCheckboxChange();
  };

  AdminDashboard.prototype.onSubRowCheckboxChange = function() {
    const checked = document.querySelectorAll('.admin-sub-select-user:checked');
    const bulkBar = document.getElementById('admin-sub-bulk-bar');
    const countSpan = document.getElementById('admin-sub-selected-count');
    if (bulkBar && countSpan) {
      if (checked.length > 0) {
        bulkBar.classList.remove('hidden');
        bulkBar.classList.add('flex');
        countSpan.textContent = checked.length;
      } else {
        bulkBar.classList.add('hidden');
        bulkBar.classList.remove('flex');
      }
    }
    const allBoxes = document.querySelectorAll('.admin-sub-select-user');
    const selectAll = document.getElementById('admin-sub-select-all');
    if (selectAll && allBoxes.length > 0) {
      selectAll.checked = (checked.length === allBoxes.length);
    }
  };

  AdminDashboard.prototype.clearSubSelection = function() {
    this.toggleSelectAllSubs(false);
  };

  AdminDashboard.prototype.openBulkSubscriptionModal = function() {
    const selectedBoxes = document.querySelectorAll('.admin-sub-select-user:checked');
    const userIds = Array.from(selectedBoxes).map(b => b.value);
    if (userIds.length === 0) {
      window.app.showToast('Please select at least one student checkbox.', 'warning');
      return;
    }

    const plans = (window.store ? window.store.getSubscriptionPlans() : {}) || {};
    const planOptions = Object.values(plans).map(p => `
      <option value="${p.id}">${p.name} (${p.tier.toUpperCase()} • ${p.durationDays}d • ₹${p.price})</option>
    `).join('');

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">Bulk Operation</span>
            <h3 class="text-lg font-black text-slate-900 mt-0.5">Bulk Update Passes (${userIds.length} Students Selected)</h3>
            <p class="text-xs text-slate-500">Apply plan tier changes or validity extensions to all selected students simultaneously.</p>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.submitBulkSubscription(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Bulk Action Type <span class="text-rose-600">*</span></label>
            <select id="admin-bulk-action-type" onchange="document.getElementById('bulk-plan-container').style.display = (this.value === 'grant' ? 'block' : 'none'); document.getElementById('bulk-days-container').style.display = (this.value === 'extend' ? 'block' : 'none');" class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              <option value="grant">Grant / Change Pass Tier</option>
              <option value="extend">Extend Subscription Expiry (+Days)</option>
              <option value="suspend">Suspend Passes</option>
              <option value="reactivate">Reactivate Passes</option>
            </select>
          </div>

          <div id="bulk-plan-container">
            <label class="block text-xs font-bold text-slate-700 mb-1">Select Pass Plan <span class="text-rose-600">*</span></label>
            <select id="admin-bulk-plan" class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              ${planOptions}
            </select>
          </div>

          <div id="bulk-days-container" style="display:none;">
            <label class="block text-xs font-bold text-slate-700 mb-1">Extension Days <span class="text-rose-600">*</span></label>
            <select id="admin-bulk-days" class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              <option value="7">+7 Days</option>
              <option value="15">+15 Days</option>
              <option value="30" selected>+30 Days (1 Month)</option>
              <option value="60">+60 Days (2 Months)</option>
              <option value="120">+120 Days (4 Months)</option>
              <option value="365">+365 Days (1 Year)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Administrative Reason / Note <span class="text-rose-600">*</span></label>
            <textarea id="admin-bulk-reason" required rows="2" placeholder="e.g. Batch promotion, scholarship grant, term extension..." class="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white"></textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="submit" id="admin-bulk-submit-btn" class="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer">
              <i data-lucide="layers" class="w-4 h-4"></i> Apply to ${userIds.length} Students
            </button>
          </div>
        </form>
      </div>
    `;
    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.submitBulkSubscription = async function(event) {
    event.preventDefault();
    const selectedBoxes = document.querySelectorAll('.admin-sub-select-user:checked');
    const userIds = Array.from(selectedBoxes).map(b => b.value);
    const action = document.getElementById('admin-bulk-action-type').value;
    const planId = document.getElementById('admin-bulk-plan') ? document.getElementById('admin-bulk-plan').value : '';
    const days = document.getElementById('admin-bulk-days') ? document.getElementById('admin-bulk-days').value : 30;
    const reason = document.getElementById('admin-bulk-reason').value.trim();

    const submitBtn = document.getElementById('admin-bulk-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const data = await adminFetch('/api/admin/subscriptions/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: userIds,
          action: action,
          planId: planId,
          days: parseInt(days, 10),
          extensionDays: parseInt(days, 10),
          reason: reason
        })
      });
      window.app.showToast(`Successfully updated ${userIds.length} student passes!`, 'success');
      window.app.closeModal('admin-generic-modal');
      this.clearSubSelection();
      this.renderSubscriptions();
    } catch (err) {
      console.error('[AdminSubscriptions] Bulk update error:', err);
      window.app.showToast(err.message || 'Bulk update failed.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="layers" class="w-4 h-4"></i> Apply to ${userIds.length} Students`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  };

  // --- PER-USER AUDIT TRAIL MODAL ---

  AdminDashboard.prototype.openUserAuditTrailModal = async function(studentId) {
    const student = window.store ? window.store.getUserById(studentId) : null;
    const sub = (window.store ? window.store.getUserSubscription(studentId) : null) || {};
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    let auditLogs = [];
    try {
      const data = await adminFetch('/api/admin/audit-logs');
      if (data && data.logs) {
        auditLogs = data.logs.filter(l => l.targetId === studentId || (l.details && l.details.includes(studentId)));
      }
    } catch (e) {
      console.warn('[AdminSubscriptions] Audit log fetch failed:', e);
    }

    const historyItems = (sub.history || []).slice().reverse();

    modalContent.innerHTML = `
      <div class="p-6 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">Per-User Audit Trail</span>
            <h3 class="text-lg font-black text-slate-900 mt-0.5">Subscription Lifecycle: ${student ? student.name : studentId}</h3>
            <p class="text-xs text-slate-500">${student ? (student.email || student.phone || student.username || student.id) : studentId}</p>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="max-h-96 overflow-y-auto space-y-3 pr-1">
          ${historyItems.length === 0 && auditLogs.length === 0 ? `
            <div class="text-center py-8 text-slate-400 text-xs">
              <i data-lucide="file-clock" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
              No historical subscription audit records found for this student.
            </div>
          ` : `
            <div class="space-y-2.5">
              ${historyItems.map(h => `
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-800 uppercase text-[10px] bg-slate-200 px-2 py-0.5 rounded">${(h.action || 'Action').replace(/_/g, ' ')}</span>
                    <span class="text-[10px] text-slate-400 font-mono">${new Date(h.timestamp).toLocaleString('en-IN')}</span>
                  </div>
                  <p class="text-slate-700 font-medium">${h.details || 'Subscription updated'}</p>
                  <span class="text-[10px] text-slate-400 block">By: ${h.adminName || h.adminId || 'Administrator'}</span>
                </div>
              `).join('')}
              ${auditLogs.map(a => `
                <div class="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-xs space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-blue-900 uppercase text-[10px] bg-blue-100 px-2 py-0.5 rounded">${(a.action || 'Audit').replace(/_/g, ' ')}</span>
                    <span class="text-[10px] text-slate-400 font-mono">${new Date(a.timestamp).toLocaleString('en-IN')}</span>
                  </div>
                  <p class="text-slate-700">${a.details || ''}</p>
                  <span class="text-[10px] text-slate-400 block">Admin: ${a.adminEmail || a.adminId || 'Admin'}</span>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="flex justify-end pt-3 border-t border-slate-100">
          <button onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer">
            Close
          </button>
        </div>
      </div>
    `;
    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  // --- MODAL: MANAGE INDIVIDUAL SUBSCRIPTION ---

  AdminDashboard.prototype.openManageSubscriptionModal = function(studentId) {
    const student = window.store ? window.store.getUserById(studentId) : null;
    if (!student) {
      window.app.showToast('Student record not found.', 'error');
      return;
    }

    const sub = (window.store ? window.store.getUserSubscription(studentId) : null) || {};
    const plans = (window.store ? window.store.getSubscriptionPlans() : {}) || {};
    const planOptions = Object.values(plans).map(p => `
      <option value="${p.id}" ${sub.planId === p.id ? 'selected' : ''}>
        ${p.name} (₹${p.price} • ${p.durationDays}d • ${p.copyCheckSlaHours}h SLA)
      </option>
    `).join('');

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">Subscription Management</span>
            <h3 class="text-lg font-black text-slate-900 mt-0.5">Manage Student Pass: ${student.name}</h3>
            <p class="text-xs text-slate-500">${student.email || student.phone || student.username} • ${student.caLevel || 'CA Student'}</p>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Current Status Banner -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span class="text-xs font-semibold text-slate-500 block">Current Status</span>
            <span class="text-sm font-black text-slate-900 block mt-0.5">
              ${sub.planName || 'Free Basic Tier'} 
              <span class="text-xs font-bold px-2 py-0.5 rounded-full ${sub.status === 'active' || sub.status === 'manually_granted' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
                ${sub.status || 'free'}
              </span>
            </span>
          </div>
          <div class="text-right">
            <span class="text-xs font-semibold text-slate-500 block">Expiry Date</span>
            <span class="text-xs font-bold text-slate-800 block mt-0.5">
              ${sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No Expiry (Free)'}
            </span>
          </div>
        </div>

        <!-- Action Form -->
        <form id="admin-sub-action-form" onsubmit="window.adminDashboard.submitManageSubscription(event, '${studentId}')" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Select Administrative Action <span class="text-rose-600">*</span></label>
            <select 
              id="admin-sub-action-type" 
              required 
              onchange="window.adminDashboard.onSubActionTypeChange(this.value)"
              class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white"
            >
              <option value="extend">Extend Subscription Expiry (+Days)</option>
              <option value="grant">Grant / Change Pass Tier</option>
              <option value="shorten">Shorten Subscription (-Days)</option>
              <option value="custom_expiry">Set Exact Custom Expiry Date</option>
              <option value="suspend">Suspend Subscription (Freeze Access)</option>
              <option value="reactivate">Reactivate Suspended Subscription</option>
              <option value="cancel">Cancel & Revoke Pass Immediately</option>
              <option value="delete" class="text-rose-700 font-bold">Delete Subscription Record (Hard Reset)</option>
            </select>
          </div>

          <!-- Dynamic Parameter: Extend/Shorten Days -->
          <div id="sub-param-days-container">
            <label class="block text-xs font-bold text-slate-700 mb-1">Number of Days <span class="text-rose-600">*</span></label>
            <select id="admin-sub-days-select" class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              <option value="7">+7 Days</option>
              <option value="15">+15 Days</option>
              <option value="30" selected>+30 Days (1 Month)</option>
              <option value="60">+60 Days (2 Months)</option>
              <option value="90">+90 Days (3 Months)</option>
              <option value="120">+120 Days (4 Months)</option>
              <option value="180">+180 Days (6 Months)</option>
              <option value="365">+365 Days (1 Year)</option>
            </select>
          </div>

          <!-- Dynamic Parameter: Grant Plan -->
          <div id="sub-param-plan-container" class="hidden">
            <label class="block text-xs font-bold text-slate-700 mb-1">Select Pass / Plan to Grant <span class="text-rose-600">*</span></label>
            <select id="admin-sub-plan-select" class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              ${planOptions}
            </select>
          </div>

          <!-- Dynamic Parameter: Custom Expiry Date -->
          <div id="sub-param-date-container" class="hidden">
            <label class="block text-xs font-bold text-slate-700 mb-1">New Expiry Date & Time <span class="text-rose-600">*</span></label>
            <input 
              type="datetime-local" 
              id="admin-sub-custom-date" 
              class="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white"
            />
          </div>

          <!-- Audit Reason (Mandatory) -->
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Administrative Reason / Note <span class="text-rose-600">*</span></label>
            <textarea 
              id="admin-sub-reason" 
              required 
              rows="2" 
              placeholder="e.g., Extension granted for top ranker, manual fee payment received in bank, support resolution..."
              class="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white"
            ></textarea>
            <span class="text-[10px] text-slate-400">All actions are recorded in immutable server audit logs with admin identity and timestamp.</span>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onclick="window.app.closeModal('admin-generic-modal')"
              class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              id="admin-sub-submit-btn"
              class="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="check" class="w-4 h-4"></i> Apply Changes
            </button>
          </div>
        </form>
      </div>
    `;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.onSubActionTypeChange = function(action) {
    const daysContainer = document.getElementById('sub-param-days-container');
    const planContainer = document.getElementById('sub-param-plan-container');
    const dateContainer = document.getElementById('sub-param-date-container');

    if (daysContainer) daysContainer.classList.add('hidden');
    if (planContainer) planContainer.classList.add('hidden');
    if (dateContainer) dateContainer.classList.add('hidden');

    if (action === 'extend' || action === 'shorten') {
      if (daysContainer) daysContainer.classList.remove('hidden');
    } else if (action === 'grant') {
      if (planContainer) planContainer.classList.remove('hidden');
      if (daysContainer) daysContainer.classList.remove('hidden');
    } else if (action === 'custom_expiry') {
      if (dateContainer) dateContainer.classList.remove('hidden');
    }
  };

  AdminDashboard.prototype.submitManageSubscription = async function(event, studentId) {
    event.preventDefault();
    const action = document.getElementById('admin-sub-action-type').value;
    const reason = document.getElementById('admin-sub-reason').value.trim();
    const submitBtn = document.getElementById('admin-sub-submit-btn');

    const payload = {
      studentId: studentId,
      userId: studentId,
      action: action,
      reason: reason
    };

    if (action === 'delete') {
      if (!confirm('Are you sure you want to permanently delete this student subscription record? This will revoke their active pass and revert them to free tier.')) {
        return;
      }
    }

    if (action === 'extend' || action === 'shorten') {
      const days = parseInt(document.getElementById('admin-sub-days-select').value, 10);
      payload.extensionDays = days;
      payload.days = days;
    } else if (action === 'grant') {
      payload.planId = document.getElementById('admin-sub-plan-select').value;
      const days = parseInt(document.getElementById('admin-sub-days-select').value, 10);
      payload.extensionDays = days;
      payload.days = days;
    } else if (action === 'custom_expiry') {
      const dt = document.getElementById('admin-sub-custom-date').value;
      if (!dt) {
        window.app.showToast('Please select a valid expiry date.', 'error');
        return;
      }
      const isoDate = new Date(dt).toISOString();
      payload.expiryDate = isoDate;
      payload.customExpiry = isoDate;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const data = await adminFetch('/api/admin/subscriptions/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      window.app.showToast(data.message || 'Subscription successfully updated!', 'success');
      window.app.closeModal('admin-generic-modal');

      if (action === 'delete') {
        if (window.store && typeof window.store.deleteSubscription === 'function') {
          window.store.deleteSubscription(studentId);
        }
      } else if (data.subscription && window.store) {
        window.store.saveSubscription(data.subscription);
      }

      this.renderSubscriptions();
    } catch (err) {
      console.error('[AdminSubscriptions] Manage sub error:', err);
      window.app.showToast(err.message || 'Failed to update subscription.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Apply Changes`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  };

  AdminDashboard.prototype.openManualGrantModal = function() {
    const students = (window.store ? window.store.getStudents() : []) || [];
    const plans = (window.store ? window.store.getSubscriptionPlans() : {}) || {};

    const studentOptions = students.map(s => `
      <option value="${s.id}">${s.name} (${s.email || s.phone || s.username || 'No email'}) • ${s.caLevel || 'CA'}</option>
    `).join('');

    const planOptions = Object.values(plans).map(p => `
      <option value="${p.id}">
        ${p.name} (${p.tier.toUpperCase()} • ${p.durationDays}d • ₹${p.price})
      </option>
    `).join('');

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 space-y-6">
        <div class="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">Manual Pass Provisioning</span>
            <h3 class="text-lg font-black text-slate-900 mt-0.5">Grant Complimentary / Offline Pass</h3>
            <p class="text-xs text-slate-500">Authoritatively grant any subscription tier to a student without payment gateway.</p>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.submitManualGrant(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Select Student <span class="text-rose-600">*</span></label>
            <select id="admin-grant-student" required class="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              <option value="">-- Choose Student --</option>
              ${studentOptions}
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Select Pass Tier / Plan <span class="text-rose-600">*</span></label>
            <select id="admin-grant-plan" required class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              ${planOptions}
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Validity Duration <span class="text-rose-600">*</span></label>
            <select id="admin-grant-days" class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              <option value="10">10 Days (Trial standard)</option>
              <option value="30" selected>30 Days (1 Month)</option>
              <option value="60">60 Days (2 Months)</option>
              <option value="120">120 Days (4 Months term)</option>
              <option value="180">180 Days (6 Months)</option>
              <option value="365">365 Days (Full Year)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Reason / Reference <span class="text-rose-600">*</span></label>
            <input 
              type="text" 
              id="admin-grant-reason" 
              required 
              placeholder="e.g. Scholarship award, cash payment received at office, top 10 ranker grant..."
              class="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white"
            />
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onclick="window.app.closeModal('admin-generic-modal')"
              class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              id="admin-grant-submit-btn"
              class="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="award" class="w-4 h-4"></i> Authorize & Grant Pass
            </button>
          </div>
        </form>
      </div>
    `;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.submitManualGrant = async function(event) {
    event.preventDefault();
    const studentId = document.getElementById('admin-grant-student').value;
    const planId = document.getElementById('admin-grant-plan').value;
    const days = parseInt(document.getElementById('admin-grant-days').value, 10);
    const reason = document.getElementById('admin-grant-reason').value.trim();

    if (!studentId) {
      window.app.showToast('Please select a student.', 'error');
      return;
    }

    const submitBtn = document.getElementById('admin-grant-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Granting...`;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const data = await adminFetch('/api/admin/subscriptions/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,
          userId: studentId,
          action: 'grant',
          planId: planId,
          extensionDays: days,
          days: days,
          reason: reason
        })
      });

      window.app.showToast(data.message || 'Pass successfully granted to student!', 'success');
      window.app.closeModal('admin-generic-modal');

      if (data.subscription && window.store) {
        window.store.saveSubscription(data.subscription);
      }

      this.renderSubscriptions();
    } catch (err) {
      console.error('[AdminSubscriptions] Manual grant error:', err);
      window.app.showToast(err.message || 'Network error while granting pass.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="award" class="w-4 h-4"></i> Authorize & Grant Pass`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  };

  // --- TAB 2: PAYMENT VERIFICATIONS ---

  AdminDashboard.prototype.renderPaymentVerifications = async function(isSilent = false, forceFullRender = false) {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    // Fast-path: if search input and table container exist in DOM,
    // only update table without destroying search input or stealing focus
    if (!forceFullRender && document.getElementById('admin-payment-table-container') && document.getElementById('admin-payment-search-input')) {
      try {
        const data = await adminFetch('/api/admin/payments');
        if (this.currentTab !== 'payments') return;
        if (data && data.payments) {
          this._cachedPaymentSessions = data.payments;
          if (window.store) window.store.savePaymentSessions(data.payments);
        }
      } catch (e) {
        console.warn('[AdminSubscriptions] Fast-path payments fetch failed:', e);
      }
      if (this.currentTab !== 'payments') return;
      this.renderPaymentVerificationsTableOnly();
      return;
    }

    this.startTabPolling('payments', async () => {
      await this.renderPaymentVerifications(true);
    });

    if (!isSilent) {
      container.innerHTML = `
        <div class="p-8 text-center text-slate-500">
          <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
          <p class="text-xs font-bold">Loading UPI Payment Sessions...</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    let payments = [];
    try {
      const data = await adminFetch('/api/admin/payments');
      if (this.currentTab !== 'payments') return;
      if (data && data.payments) {
        payments = data.payments;
        this._cachedPaymentSessions = payments;
        if (window.store) window.store.savePaymentSessions(payments);
      }
    } catch (e) {
      if (this.currentTab !== 'payments') return;
      console.warn('[AdminSubscriptions] Backend payments fetch failed, using store:', e);
      if (window.store) payments = window.store.getPaymentSessions();
      if (!payments || payments.length === 0) {
        this.renderAdminError(container, 'Failed to load UPI payment verification queue. The server may be restarting or unreachable.', () => this.renderPaymentVerifications());
        return;
      }
    }

    if (this.currentTab !== 'payments') return;

    const currentFilter = this.paymentFilter || 'pending';
    const search = (this.paymentSearch || '').toLowerCase().trim();
    const now = new Date();

    // Calculate UTR frequencies for duplicate fraud detection
    const utrCounts = {};
    payments.forEach(p => {
      const u = (p.utr || '').trim().toUpperCase();
      if (u && u !== 'N/A' && u !== 'NONE') {
        utrCounts[u] = (utrCounts[u] || 0) + 1;
      }
    });

    // Counts
    const pendingCount = payments.filter(p => p.status === 'pending_verification').length;
    const lateCount = payments.filter(p => p.status === 'late_payment').length;
    const approvedCount = payments.filter(p => p.status === 'approved').length;
    const rejectedCount = payments.filter(p => p.status === 'rejected').length;

    const filtered = payments.filter(p => {
      if (currentFilter === 'pending' && p.status !== 'pending_verification' && p.status !== 'late_payment') return false;
      if (currentFilter === 'late' && p.status !== 'late_payment') return false;
      if (currentFilter === 'approved' && p.status !== 'approved') return false;
      if (currentFilter === 'rejected' && p.status !== 'rejected') return false;

      if (search) {
        const studentUser = window.store && (window.store.getUserById(p.userId || p.studentId) || window.store.getUserByEmail(p.userEmail || p.studentEmail));
        const utr = (p.utr || '').toLowerCase();
        const studentName = ((studentUser && studentUser.name) || p.studentName || p.userName || '').toLowerCase();
        const username = ((studentUser && studentUser.username) || p.username || '').toLowerCase();
        const studentEmail = ((studentUser && studentUser.email) || p.studentEmail || p.userEmail || '').toLowerCase();
        const sessionId = (p.sessionId || p.paymentSessionId || '').toLowerCase();
        const planName = (p.planName || p.planId || '').toLowerCase();
        if (!utr.includes(search) && !studentName.includes(search) && !username.includes(search) && !studentEmail.includes(search) && !sessionId.includes(search) && !planName.includes(search)) {
          return false;
        }
      }
      return true;
    });

    this._cachedPaymentSessions = payments;
    this._pvPage = this._pvPage || 1;
    const pageSize = 10;
    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
    if (this._pvPage > totalPages) this._pvPage = totalPages;
    if (this._pvPage < 1) this._pvPage = 1;

    const startIndex = (this._pvPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalFiltered);
    const pagedSessions = filtered.slice(startIndex, endIndex);

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-black text-slate-900 tracking-tight">UPI Payment Proof Verifications</h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Live Sync
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">Inspect submitted UTR transaction codes, detect duplicate fraud, verify receipts, and activate student passes.</p>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.renderPaymentVerifications()" 
              class="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="Refresh"
            >
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Filter Tabs -->
        <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button 
            onclick="window.adminDashboard.paymentFilter = 'pending'; window.adminDashboard.renderPaymentVerifications();"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
              currentFilter === 'pending' ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }"
          >
            <i data-lucide="clock" class="w-3.5 h-3.5"></i> Pending Verification
            <span class="px-1.5 py-0.2 text-[10px] rounded-full bg-white/20 font-black">${pendingCount + lateCount}</span>
          </button>

          <button 
            onclick="window.adminDashboard.paymentFilter = 'late'; window.adminDashboard.renderPaymentVerifications();"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
              currentFilter === 'late' ? 'bg-orange-500 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }"
          >
            <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Late Payments Only
            <span class="px-1.5 py-0.2 text-[10px] rounded-full bg-white/20 font-black">${lateCount}</span>
          </button>

          <button 
            onclick="window.adminDashboard.paymentFilter = 'approved'; window.adminDashboard.renderPaymentVerifications();"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
              currentFilter === 'approved' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }"
          >
            <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Approved (${approvedCount})
          </button>

          <button 
            onclick="window.adminDashboard.paymentFilter = 'rejected'; window.adminDashboard.renderPaymentVerifications();"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
              currentFilter === 'rejected' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }"
          >
            <i data-lucide="x-circle" class="w-3.5 h-3.5"></i> Rejected (${rejectedCount})
          </button>

          <button 
            onclick="window.adminDashboard.paymentFilter = 'all'; window.adminDashboard.renderPaymentVerifications();"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
              currentFilter === 'all' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }"
          >
            All Sessions (${payments.length})
          </button>
        </div>

        <!-- Search Bar -->
        <div class="relative max-w-md">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-3"></i>
          <input 
            type="text" 
            id="admin-payment-search-input"
            placeholder="Search by UTR number, student name, email, or session ID..."
            value="${this.paymentSearch || ''}"
            oninput="window.adminDashboard.paymentSearch = this.value; window.adminDashboard._pvPage = 1; window.adminDashboard.renderPaymentVerificationsTableOnly();"
            class="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
          />
        </div>

        <!-- Payments Table Container (rendered by renderPaymentVerificationsTableOnly) -->
        <div id="admin-payment-table-container"></div>
      </div>
    `;

    this.renderPaymentVerificationsTableOnly();
  };

  AdminDashboard.prototype.setPvPage = function(page) {
    this._pvPage = page;
    if (document.getElementById('admin-payment-table-container')) {
      this.renderPaymentVerificationsTableOnly();
    } else {
      this.renderPaymentVerifications(true);
    }
  };

  AdminDashboard.prototype.renderPaymentVerificationsTableOnly = function() {
    const tableContainer = document.getElementById('admin-payment-table-container');
    if (!tableContainer) {
      this.renderPaymentVerifications(true);
      return;
    }

    const payments = this._cachedPaymentSessions || (window.store ? window.store.getPaymentSessions() : []) || [];
    const currentFilter = this.paymentFilter || 'pending';
    const search = (this.paymentSearch || '').toLowerCase().trim();
    const now = new Date();

    const utrCounts = {};
    payments.forEach(p => {
      const u = (p.utr || '').trim().toUpperCase();
      if (u && u !== 'N/A') utrCounts[u] = (utrCounts[u] || 0) + 1;
    });

    const filtered = payments.filter(p => {
      if (currentFilter === 'pending' && p.status !== 'pending_verification' && p.status !== 'late_payment') return false;
      if (currentFilter === 'late' && p.status !== 'late_payment') return false;
      if (currentFilter === 'approved' && p.status !== 'approved') return false;
      if (currentFilter === 'rejected' && p.status !== 'rejected') return false;

      if (search) {
        const studentUser = window.store && (window.store.getUserById(p.userId || p.studentId) || window.store.getUserByEmail(p.userEmail || p.studentEmail));
        const utr = (p.utr || '').toLowerCase();
        const sName = ((studentUser && studentUser.name) || p.studentName || p.userName || '').toLowerCase();
        const username = ((studentUser && studentUser.username) || p.username || '').toLowerCase();
        const sEmail = ((studentUser && studentUser.email) || p.studentEmail || p.userEmail || '').toLowerCase();
        const sid = (p.sessionId || p.paymentSessionId || '').toLowerCase();
        const pName = (p.planName || p.planId || '').toLowerCase();
        if (!utr.includes(search) && !sName.includes(search) && !username.includes(search) && !sEmail.includes(search) && !sid.includes(search) && !pName.includes(search)) {
          return false;
        }
      }
      return true;
    });

    this._pvPage = this._pvPage || 1;
    const pageSize = 10;
    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
    if (this._pvPage > totalPages) this._pvPage = totalPages;
    if (this._pvPage < 1) this._pvPage = 1;

    const startIndex = (this._pvPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalFiltered);
    const pagedSessions = filtered.slice(startIndex, endIndex);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sidOf = (p) => p.sessionId || p.paymentSessionId;
    const knownIds = new Set(payments.map(sidOf));
    this.pvSelected = new Set([...(this.pvSelected || [])].filter(id => knownIds.has(id)));
    const selectedCount = this.pvSelected.size;
    const pageIds = pagedSessions.map(sidOf);
    const allPageSelected = pageIds.length > 0 && pageIds.every(id => this.pvSelected.has(id));
    this._pvFilteredIds = filtered.map(sidOf);

    tableContainer.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2 px-1 text-xs ${selectedCount ? '' : 'hidden'}">
        <span class="font-bold text-slate-700">Selected: ${selectedCount}</span>
        <div class="flex flex-wrap items-center gap-2">
          ${filtered.length > selectedCount ? `<button onclick="window.adminDashboard.selectAllFilteredPayments()" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 cursor-pointer">Select all ${filtered.length} in this view</button>` : ''}
          <button onclick="window.adminDashboard.clearPaymentSelection()" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 cursor-pointer">Clear</button>
          <button id="admin-payment-bulk-delete" onclick="window.adminDashboard.bulkDeletePayments()" class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1 cursor-pointer">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete Selected (${selectedCount})
          </button>
        </div>
      </div>
      <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th class="py-3 pl-4 pr-1 w-8">
                  <input type="checkbox" aria-label="Select all payments on this page" ${allPageSelected ? 'checked' : ''}
                    onchange="window.adminDashboard.togglePaymentPageSelection(this.checked)" class="w-4 h-4 rounded cursor-pointer">
                </th>
                <th class="py-3 px-4">Student & Plan</th>
                <th class="py-3 px-4">Amount</th>
                <th class="py-3 px-4">UTR Reference</th>
                <th class="py-3 px-4">UPI Channel</th>
                <th class="py-3 px-4">Submitted At</th>
                <th class="py-3 px-4">Receipt Proof</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="9" class="py-12 text-center text-slate-400">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                    <p class="text-xs font-bold">No payment sessions in this category.</p>
                  </td>
                </tr>
              ` : pagedSessions.map(p => {
                const sid = sidOf(p);
                const isSelected = this.pvSelected.has(sid);
                const isPending = p.status === 'pending_verification' || p.status === 'late_payment';
                const isLate = p.status === 'late_payment';
                const dateStr = p.submittedAt ? new Date(p.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--';
                const pendingAgeDays = p.submittedAt ? (now - new Date(p.submittedAt)) / (1000 * 60 * 60 * 24) : 0;
                const isPendingOverdue = isPending && pendingAgeDays >= 3;
                const cleanUtr = (p.utr || '').trim().toUpperCase();
                const isDupUtr = cleanUtr && cleanUtr !== 'N/A' && (utrCounts[cleanUtr] || 0) > 1;

                let statusBadge = '';
                if (p.status === 'approved') {
                  statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><i data-lucide="check-circle" class="w-3 h-3"></i> Approved</span>';
                } else if (p.status === 'late_payment') {
                  statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200 animate-pulse"><i data-lucide="alert-triangle" class="w-3 h-3"></i> Late Payment</span>';
                } else if (p.status === 'pending_verification') {
                  statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200"><i data-lucide="clock" class="w-3 h-3 animate-spin"></i> Pending Review</span>';
                } else if (p.status === 'rejected') {
                  statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200"><i data-lucide="x-circle" class="w-3 h-3"></i> Rejected</span>';
                } else {
                  statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">Incomplete</span>';
                }

                const studentUser = window.store && (window.store.getUserById(p.userId || p.studentId) || window.store.getUserByEmail(p.userEmail || p.studentEmail));
                const studentName = (studentUser && studentUser.name) || p.studentName || p.userName || 'Student';
                const studentUsername = (studentUser && studentUser.username) || p.username || '';
                const studentEmail = (studentUser && studentUser.email) || p.studentEmail || p.userEmail || p.studentId || '';
                const snap = p.channelSnapshot || {};
                const channelTitle = snap.title || snap.name || p.channelTitle || p.channelId || 'UPI';
                const channelUpi = snap.upiId || p.channelUpi || p.channelUpiId || '';
                const hasProof = Boolean(p.screenshot || p.proofUrl);
                const proofStatus = p.proofStatus || (hasProof ? 'available' : 'none');

                let proofCell;
                if (proofStatus === 'available') {
                  proofCell = `
                    <button onclick="window.adminDashboard.viewPaymentProof('${sid}')"
                      class="group relative w-12 h-12 rounded-lg overflow-hidden border border-slate-300 hover:border-rose-500 transition-colors shadow-2xs block bg-slate-100 cursor-pointer"
                      title="Click to inspect receipt proof">
                      <img data-proof-session="${sid}" alt="Payment proof" class="hidden w-full h-full object-cover group-hover:scale-110 transition-transform">
                      <span data-proof-placeholder="${sid}" class="absolute inset-0 flex items-center justify-center text-slate-400"><i data-lucide="image" class="w-4 h-4"></i></span>
                    </button>`;
                } else if (proofStatus === 'missing') {
                  proofCell = `<span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700" title="The record points to a proof image that no longer exists in storage (uploaded before persistent storage was enabled).">
                      <i data-lucide="image-off" class="w-3.5 h-3.5"></i> Proof file missing</span>`;
                } else {
                  proofCell = '<span class="text-xs text-slate-400 italic">No receipt attached</span>';
                }

                return `
                  <tr class="hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-rose-50/40' : (isLate ? 'bg-orange-50/20' : '')}">
                    <td class="py-3 pl-4 pr-1">
                      <input type="checkbox" aria-label="Select payment" ${isSelected ? 'checked' : ''}
                        onchange="window.adminDashboard.togglePaymentSelection('${sid}', this.checked)" class="w-4 h-4 rounded cursor-pointer">
                    </td>
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-slate-900">${esc(studentName)}</span>
                        ${studentUsername ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">@${esc(studentUsername)}</span>` : ''}
                      </div>
                      <span class="text-xs text-slate-500 block">${esc(studentEmail)}</span>
                      <span class="text-[11px] font-bold text-rose-700 mt-0.5 inline-block">${esc(p.planName || p.planId)}</span>
                    </td>
                    <td class="py-3 px-4 font-black text-slate-900">₹${esc(p.amount)}</td>
                    <td class="py-3 px-4 font-mono text-xs font-bold text-slate-800">
                      <div class="flex items-center gap-1.5">
                        <span>${p.utr ? esc(p.utr) : '<span class="text-slate-400 font-sans">N/A</span>'}</span>
                        ${p.utr ? `
                          <button
                            onclick="navigator.clipboard.writeText('${esc(p.utr)}'); window.app.showToast('UTR copied!', 'info');"
                            class="text-slate-400 hover:text-slate-700 p-1"
                            title="Copy UTR"
                          >
                            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                          </button>
                        ` : ''}
                      </div>
                      <span class="text-[10px] text-slate-400 font-mono block mt-0.5">ID: ${esc(sid)}</span>
                      ${isDupUtr ? `
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 mt-1 block w-fit" title="Duplicate UTR detected across ${utrCounts[cleanUtr]} sessions!">
                          <i data-lucide="alert-triangle" class="w-3 h-3"></i> Duplicate UTR (${utrCounts[cleanUtr]}x)
                        </span>
                      ` : ''}
                    </td>
                    <td class="py-3 px-4 text-xs font-medium text-slate-600">
                      <div class="font-bold text-slate-800">${esc(channelTitle)}</div>
                      <div class="text-[10px] text-slate-400 font-mono">${esc(channelUpi)}</div>
                    </td>
                    <td class="py-3 px-4 text-xs text-slate-600">
                      <div>${dateStr}</div>
                      ${isPendingOverdue ? `
                        <span class="text-[10px] font-bold text-rose-600 flex items-center gap-0.5 mt-0.5">
                          <i data-lucide="alert-circle" class="w-3 h-3"></i> ${Math.floor(pendingAgeDays)}d overdue
                        </span>
                      ` : ''}
                    </td>
                    <td class="py-3 px-4">${proofCell}</td>
                    <td class="py-3 px-4">
                      ${statusBadge}
                    </td>
                    <td class="py-3 px-4 text-right">
                      <div class="inline-flex items-center gap-1.5">
                        ${isPending ? `
                          <button
                            onclick="window.adminDashboard.promptApprovePayment('${sid}')"
                            class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                            title="Verify and activate student membership"
                          >
                            <i data-lucide="check" class="w-3.5 h-3.5"></i> Approve
                          </button>
                          <button
                            onclick="window.adminDashboard.promptRejectPayment('${sid}')"
                            class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                            title="Reject payment proof"
                          >
                            <i data-lucide="x" class="w-3.5 h-3.5"></i> Reject
                          </button>
                        ` : `
                          ${p.status === 'approved' || p.status === 'rejected' ? '<span class="text-xs text-slate-400 font-medium mr-1">Settled</span>' : ''}
                        `}
                        <button
                          onclick="window.adminDashboard.deletePaymentRecord('${sid}')"
                          class="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete payment record"
                          aria-label="Delete payment record"
                        >
                          <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
          <div class="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="text-slate-600">
              Showing <span class="font-semibold text-slate-900">${totalFiltered === 0 ? 0 : startIndex + 1}</span> to <span class="font-semibold text-slate-900">${endIndex}</span> of <span class="font-bold text-slate-900">${totalFiltered}</span> sessions
            </div>
            <div class="flex items-center gap-1">
              <button
                onclick="window.adminDashboard.setPvPage(${this._pvPage - 1})"
                ${this._pvPage <= 1 ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
              >
                Previous
              </button>
              <span class="px-3 py-1 font-bold text-xs text-slate-700 bg-white border border-slate-200 rounded">
                Page ${this._pvPage} of ${totalPages}
              </span>
              <button
                onclick="window.adminDashboard.setPvPage(${this._pvPage + 1})"
                ${this._pvPage >= totalPages ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
              >
                Next
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.loadProofThumbnails(pagedSessions);
  };

  /** Payment proofs are private: fetch them with the admin's session and show them as object URLs. */
  AdminDashboard.prototype.fetchProofObjectUrl = async function(session) {
    const src = (session && (session.screenshot || session.proofUrl)) || '';
    if (!src) return null;
    if (src.startsWith('data:')) return src;
    this._proofUrlCache = this._proofUrlCache || new Map();
    if (this._proofUrlCache.has(src)) return this._proofUrlCache.get(src);
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const resp = await fetch(src, { headers: { 'Authorization': `Bearer ${user ? (user.token || '') : ''}` } });
    if (!resp.ok) {
      throw new Error(resp.status === 404 ? 'The proof image was not found in storage.' : `The proof image could not be loaded (HTTP ${resp.status}).`);
    }
    const url = URL.createObjectURL(await resp.blob());
    this._proofUrlCache.set(src, url);
    if (this._proofUrlCache.size > 80) {   // keep memory bounded
      const [oldKey, oldUrl] = this._proofUrlCache.entries().next().value;
      URL.revokeObjectURL(oldUrl);
      this._proofUrlCache.delete(oldKey);
    }
    return url;
  };

  AdminDashboard.prototype.loadProofThumbnails = function(sessions) {
    (sessions || []).forEach(p => {
      const sid = p.sessionId || p.paymentSessionId;
      if ((p.proofStatus || (p.screenshot ? 'available' : 'none')) !== 'available') return;
      this.fetchProofObjectUrl(p).then(url => {
        const img = document.querySelector(`img[data-proof-session="${sid}"]`);
        const ph = document.querySelector(`[data-proof-placeholder="${sid}"]`);
        if (!img || !url) return;
        img.src = url;
        img.classList.remove('hidden');
        if (ph) ph.classList.add('hidden');
      }).catch(() => {
        const ph = document.querySelector(`[data-proof-placeholder="${sid}"]`);
        if (ph) {
          ph.innerHTML = '<i data-lucide="image-off" class="w-4 h-4 text-amber-600"></i>';
          ph.title = 'Proof image unavailable';
          if (window.lucide) window.lucide.createIcons();
        }
      });
    });
  };

  AdminDashboard.prototype.togglePaymentSelection = function(sessionId, checked) {
    this.pvSelected = this.pvSelected || new Set();
    if (checked) this.pvSelected.add(sessionId); else this.pvSelected.delete(sessionId);
    this.renderPaymentVerificationsTableOnly();
  };

  AdminDashboard.prototype.togglePaymentPageSelection = function(checked) {
    this.pvSelected = this.pvSelected || new Set();
    document.querySelectorAll('#admin-payment-table-container input[aria-label="Select payment"]').forEach(cb => {
      const m = (cb.getAttribute('onchange') || '').match(/togglePaymentSelection\('([^']+)'/);
      if (m) { if (checked) this.pvSelected.add(m[1]); else this.pvSelected.delete(m[1]); }
    });
    this.renderPaymentVerificationsTableOnly();
  };

  AdminDashboard.prototype.selectAllFilteredPayments = function() {
    this.pvSelected = new Set(this._pvFilteredIds || []);
    this.renderPaymentVerificationsTableOnly();
  };

  AdminDashboard.prototype.clearPaymentSelection = function() {
    this.pvSelected = new Set();
    this.renderPaymentVerificationsTableOnly();
  };

  /** POST that reports partial results instead of throwing on a non-2xx response. */
  AdminDashboard.prototype._postPaymentDelete = async function(url, body) {
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user ? (user.token || '') : ''}` },
      body: JSON.stringify(body)
    });
    const res = await resp.json().catch(() => ({}));
    return { ok: resp.ok && res.success, res, status: resp.status };
  };

  AdminDashboard.prototype._removeDeletedPayments = function(ids) {
    const gone = new Set(ids || []);
    if (!gone.size) return;
    this._cachedPaymentSessions = (this._cachedPaymentSessions || []).filter(p => !gone.has(p.sessionId || p.paymentSessionId));
    if (window.store && typeof window.store.savePaymentSessions === 'function') {
      window.store.savePaymentSessions(this._cachedPaymentSessions);
    }
    gone.forEach(id => this.pvSelected && this.pvSelected.delete(id));
  };

  AdminDashboard.prototype.deletePaymentRecord = async function(sessionId) {
    const p = (this._cachedPaymentSessions || []).find(s => (s.sessionId || s.paymentSessionId) === sessionId);
    const label = p ? `${p.studentName || p.userName || 'student'} - ₹${p.amount} (${p.utr || sessionId})` : sessionId;
    if (!confirm(`Permanently delete this payment record?\n\n${label}\n\nThe payment proof image is deleted too. A subscription that was already granted is NOT changed. This cannot be undone.`)) return;
    try {
      const { ok, res } = await this._postPaymentDelete('/api/admin/payments/delete', { paymentSessionId: sessionId });
      this._removeDeletedPayments(res.deletedIds);
      if (ok) {
        window.app.showToast('Payment record deleted.', 'info');
      } else {
        window.app.showToast(res.error || 'Delete failed. Please try again.', 'error');
      }
    } catch (err) {
      window.app.showToast(`Delete failed: ${err.message}`, 'error');
    }
    this.renderPaymentVerifications(true, true);
  };

  AdminDashboard.prototype.bulkDeletePayments = async function() {
    const ids = [...(this.pvSelected || [])];
    if (!ids.length) return;
    if (!confirm(`Permanently delete ${ids.length} payment record${ids.length === 1 ? '' : 's'} and their proof images?\n\nSubscriptions that were already granted are NOT changed. This cannot be undone.`)) return;
    const btn = document.getElementById('admin-payment-bulk-delete');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }
    try {
      const { ok, res } = await this._postPaymentDelete('/api/admin/payments/bulk-delete', { ids });
      this._removeDeletedPayments(res.deletedIds);
      const deleted = (res.deletedIds || []).length;
      if (ok) {
        this.pvSelected = new Set();
        window.app.showToast(`Deleted ${deleted} payment record(s).`, 'info');
      } else if (deleted) {
        window.app.showToast(`Deleted ${deleted} record(s); ${(res.failed || []).length} could not be deleted and stay selected.`, 'warning');
      } else {
        window.app.showToast(res.error || 'Bulk delete failed. Please try again.', 'error');
      }
    } catch (err) {
      window.app.showToast(`Bulk delete failed: ${err.message}`, 'error');
    }
    this.renderPaymentVerifications(true, true);
  };

  AdminDashboard.prototype.viewPaymentProof = async function(sessionId) {
    const session = (this._cachedPaymentSessions || []).find(s => (s.sessionId || s.paymentSessionId) === sessionId);
    if (!session) {
      window.app.showToast('Session details not found.', 'error');
      return;
    }
    const title = `UTR: ${session.utr || sessionId}`;
    if (session.proofStatus === 'missing') {
      this.openScreenshotModal('', title, session, 'The proof image for this record no longer exists in storage.');
      return;
    }
    let imgSrc = '';
    let problem = '';
    try {
      imgSrc = (await this.fetchProofObjectUrl(session)) || '';
    } catch (err) {
      problem = err.message;
    }
    this.openScreenshotModal(imgSrc, title, session, problem);
  };

  AdminDashboard.prototype.promptApprovePayment = function(sessionId) {
    const session = (this._cachedPaymentSessions || []).find(s => s.sessionId === sessionId);
    const amount = session ? session.amount : '';
    const studentUser = session && window.store && (window.store.getUserById(session.userId || session.studentId) || window.store.getUserByEmail(session.userEmail || session.studentEmail));
    const studentName = (studentUser && studentUser.name) || (session ? (session.studentName || session.userName) : 'Student');
    const studentUsername = (studentUser && studentUser.username) || (session ? session.username : '');
    const studentDisplay = studentUsername ? `${studentName} (@${studentUsername})` : studentName;
    const planName = session ? (session.planName || session.planId) : 'Pass';

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-emerald-700 uppercase tracking-wider">Payment Verification</span>
            <h3 class="text-lg font-black text-slate-900 mt-0.5">Approve Payment Proof</h3>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
          <p class="font-bold">Approve payment of ₹${amount} for ${studentDisplay} (${planName})?</p>
          <p class="text-[11px] text-emerald-700">This will authoritatively activate the subscription, update SLA tracking, and credit bonus XP points to the student ledger.</p>
        </div>

        <form onsubmit="window.adminDashboard.submitApprovePayment(event, '${sessionId}')" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Approval Remarks / Bank Verification Notes</label>
            <select onchange="document.getElementById('admin-approve-remarks-text').value = this.value" class="w-full px-3.5 py-2 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white mb-2">
              <option value="Verified against HDFC Bank Statement">Verified against HDFC Bank Statement</option>
              <option value="Verified via institutional UPI SMS / Portal">Verified via institutional UPI SMS / Portal</option>
              <option value="Direct bank credit confirmed by accounts">Direct bank credit confirmed by accounts</option>
              <option value="Approved with instant pass activation">Approved with instant pass activation</option>
              <option value="Other">Other</option>
            </select>
            <textarea 
              id="admin-approve-remarks-text" 
              rows="2" 
              class="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
              placeholder="Add optional internal remarks or bank transaction reference..."
            >Verified against HDFC Bank Statement</textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onclick="window.app.closeModal('admin-generic-modal')"
              class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              id="confirm-approve-btn"
              class="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="check-circle" class="w-4 h-4"></i> Confirm & Activate Pass
            </button>
          </div>
        </form>
      </div>
    `;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.submitApprovePayment = async function(event, sessionId) {
    event.preventDefault();
    const remarks = (document.getElementById('admin-approve-remarks-text')?.value || '').trim();
    const btn = document.getElementById('confirm-approve-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Activating...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const data = await adminFetch('/api/admin/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          action: 'approve',
          remarks: remarks
        })
      });

      window.app.showToast(data.message || 'Payment successfully verified and pass activated!', 'success');
      window.app.closeModal('admin-generic-modal');
      this.renderPaymentVerifications();
    } catch (err) {
      console.error('[AdminSubscriptions] Verify payment error:', err);
      window.app.showToast(err.message || 'Failed to verify payment.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> Confirm & Activate Pass';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  };

  AdminDashboard.prototype.verifyPayment = async function(sessionId, action, amount, studentName, planName, remarks = '') {
    if (action === 'approve') {
      this.promptApprovePayment(sessionId);
      return;
    }

    try {
      const data = await adminFetch('/api/admin/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          action: action,
          remarks: remarks
        })
      });

      window.app.showToast(data.message || 'Payment successfully verified and pass activated!', 'success');
      this.renderPaymentVerifications();
    } catch (err) {
      console.error('[AdminSubscriptions] Verify payment error:', err);
      window.app.showToast(err.message || 'Failed to verify payment.', 'error');
    }
  };

  AdminDashboard.prototype.promptRejectPayment = function(sessionId) {
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">Payment Verification</span>
            <h3 class="text-lg font-black text-slate-900 mt-0.5">Reject Payment Proof</h3>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.submitRejectPayment(event, '${sessionId}')" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Select Reason for Rejection <span class="text-rose-600">*</span></label>
            <select id="admin-reject-reason-preset" onchange="document.getElementById('admin-reject-reason-text').value = this.value" class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white mb-2">
              <option value="UTR not found in bank statement">UTR not found in bank statement</option>
              <option value="Amount mismatch with bank receipt">Amount mismatch with bank receipt</option>
              <option value="Duplicate or previously submitted UTR">Duplicate or previously submitted UTR</option>
              <option value="Blurred / Illegible payment screenshot">Blurred / Illegible payment screenshot</option>
              <option value="Payment transferred to incorrect account / UPI ID">Payment transferred to incorrect account / UPI ID</option>
              <option value="Session expired and funds not credited">Session expired and funds not credited</option>
              <option value="Other">Other</option>
            </select>
            <textarea 
              id="admin-reject-reason-text" 
              required 
              rows="2" 
              class="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white"
              placeholder="Explain why this proof is being rejected..."
            >UTR not found in bank statement</textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onclick="window.app.closeModal('admin-generic-modal')"
              class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              class="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="x-circle" class="w-4 h-4"></i> Confirm Rejection
            </button>
          </div>
        </form>
      </div>
    `;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.submitRejectPayment = async function(event, sessionId) {
    event.preventDefault();
    const reason = document.getElementById('admin-reject-reason-text').value.trim();

    try {
      const data = await adminFetch('/api/admin/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          action: 'reject',
          rejectionReason: reason,
          remarks: reason
        })
      });

      window.app.showToast('Payment rejected and student notified.', 'info');
      window.app.closeModal('admin-generic-modal');
      this.renderPaymentVerifications();
    } catch (err) {
      console.error('[AdminSubscriptions] Reject payment error:', err);
      window.app.showToast(err.message || 'Failed to reject payment.', 'error');
    }
  };

  // --- ZOOMABLE / ROTATABLE SCREENSHOT MODAL ---

  AdminDashboard.prototype.openScreenshotModal = function(imgSrc, title, session, problem) {
    this._screenshotScale = 1.0;
    this._screenshotRotate = 0;
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    let cleanSrc = (imgSrc || '').trim();
    if (cleanSrc && !cleanSrc.startsWith('data:') && !cleanSrc.startsWith('blob:') && !cleanSrc.startsWith('http') && !cleanSrc.startsWith('/')) {
      if (cleanSrc.startsWith('iVBORw0KGgo')) {
        cleanSrc = 'data:image/png;base64,' + cleanSrc;
      } else {
        cleanSrc = 'data:image/jpeg;base64,' + cleanSrc;
      }
    }
    const hasImage = Boolean(cleanSrc);

    const studentUser = session && window.store && (window.store.getUserById(session.userId || session.studentId) || window.store.getUserByEmail(session.userEmail || session.studentEmail));
    const studentName = (studentUser && studentUser.name) || (session ? (session.studentName || session.userName) : '');
    const studentUsername = (studentUser && studentUser.username) || (session ? session.username : '');

    modalContent.innerHTML = `
      <div class="p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">Payment Receipt Inspection</span>
            <h3 class="text-sm font-black text-slate-900 mt-0.5">${title || 'Bank Screenshot'}</h3>
            ${studentName ? `
              <div class="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-slate-900">${studentName}</span>
                ${studentUsername ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-200 text-slate-700">@${studentUsername}</span>` : ''}
              </div>
            ` : ''}
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Inspection Toolbar -->
        <div class="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-xl text-xs">
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="window.adminDashboard.zoomScreenshot(0.25)" class="p-1.5 bg-white hover:bg-slate-200 rounded-lg text-slate-700 font-bold flex items-center gap-1 shadow-2xs cursor-pointer" title="Zoom In">
              <i data-lucide="zoom-in" class="w-4 h-4"></i>
            </button>
            <button type="button" onclick="window.adminDashboard.zoomScreenshot(-0.25)" class="p-1.5 bg-white hover:bg-slate-200 rounded-lg text-slate-700 font-bold flex items-center gap-1 shadow-2xs cursor-pointer" title="Zoom Out">
              <i data-lucide="zoom-out" class="w-4 h-4"></i>
            </button>
            <button type="button" onclick="window.adminDashboard.rotateScreenshot()" class="p-1.5 bg-white hover:bg-slate-200 rounded-lg text-slate-700 font-bold flex items-center gap-1 shadow-2xs cursor-pointer" title="Rotate 90°">
              <i data-lucide="rotate-cw" class="w-4 h-4"></i> Rotate
            </button>
            <button type="button" onclick="window.adminDashboard.resetScreenshotZoom()" class="px-2 py-1 bg-white hover:bg-slate-200 rounded-lg text-slate-600 font-medium text-xs shadow-2xs cursor-pointer">
              Reset
            </button>
          </div>
          <span id="screenshot-zoom-level" class="font-mono text-[11px] font-bold text-slate-500">100% (0°)</span>
        </div>

        <!-- Viewport -->
        <div class="relative max-h-[65vh] overflow-auto rounded-xl border border-slate-200 bg-slate-100/70 flex items-center justify-center p-4 min-h-[320px]">
          <div id="proof-loading-indicator" class="${hasImage ? 'flex' : 'hidden'} flex-col items-center justify-center p-6 text-slate-500">
            <i data-lucide="loader-2" class="w-8 h-8 animate-spin text-rose-600 mb-2"></i>
            <p class="text-xs font-bold">Loading payment receipt...</p>
          </div>
          <div id="proof-error-indicator" class="${hasImage ? 'hidden' : 'flex'} flex-col items-center justify-center p-6 text-rose-600 text-center">
            <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-2 text-rose-500"></i>
            <p class="text-xs font-bold">${problem ? 'Receipt image unavailable' : (hasImage ? 'Receipt image could not be displayed' : 'No receipt image attached')}</p>
            <p class="text-[11px] text-slate-500 mt-1">${problem || 'The student submitted payment without attaching an image proof or the image is unavailable.'}</p>
          </div>
          ${hasImage ? `
            <img id="screenshot-modal-image" src="${cleanSrc}" alt="Payment Proof" 
              onload="document.getElementById('proof-loading-indicator')?.classList.add('hidden'); this.classList.remove('hidden');" 
              onerror="document.getElementById('proof-loading-indicator')?.classList.add('hidden'); document.getElementById('proof-error-indicator')?.classList.remove('hidden');" 
              class="hidden max-w-full max-h-[60vh] object-contain transition-transform duration-150 ease-out shadow-md origin-center rounded-lg" 
              style="transform: scale(1) rotate(0deg);" 
            />
          ` : ''}
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100">
          ${hasImage ? `
            <a href="${cleanSrc}" download="payment_proof_${Date.now()}" class="text-xs font-bold text-rose-700 hover:text-rose-800 flex items-center gap-1">
              <i data-lucide="download" class="w-4 h-4"></i> Download Original
            </a>
          ` : '<span class="text-xs text-slate-400 font-medium">No image to download</span>'}
          <button onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer">
            Close
          </button>
        </div>
      </div>
    `;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.zoomScreenshot = function(delta) {
    this._screenshotScale = Math.max(0.5, Math.min(3.5, (this._screenshotScale || 1.0) + delta));
    this._applyScreenshotTransform();
  };

  AdminDashboard.prototype.rotateScreenshot = function() {
    this._screenshotRotate = ((this._screenshotRotate || 0) + 90) % 360;
    this._applyScreenshotTransform();
  };

  AdminDashboard.prototype.resetScreenshotZoom = function() {
    this._screenshotScale = 1.0;
    this._screenshotRotate = 0;
    this._applyScreenshotTransform();
  };

  AdminDashboard.prototype._applyScreenshotTransform = function() {
    const img = document.getElementById('screenshot-modal-image');
    const level = document.getElementById('screenshot-zoom-level');
    if (img) {
      img.style.transform = `scale(${this._screenshotScale}) rotate(${this._screenshotRotate}deg)`;
    }
    if (level) {
      level.textContent = `${Math.round(this._screenshotScale * 100)}% (${this._screenshotRotate}°)`;
    }
  };

  // --- TAB 3: UPI CHANNELS & QR MANAGEMENT ---

  AdminDashboard.prototype.renderPaymentChannels = async function(isSilent = false) {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    if (!isSilent) {
      container.innerHTML = `
        <div class="p-8 text-center text-slate-500">
          <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
          <p class="text-xs font-bold">Loading UPI Payment Channels...</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    let channels = [];
    try {
      const data = await adminFetch('/api/payments/channels');
      if (this.currentTab !== 'payment-channels') return;
      if (data && data.channels) {
        channels = data.channels;
        if (window.store) window.store.savePaymentChannels(channels);
      }
    } catch (e) {
      if (this.currentTab !== 'payment-channels') return;
      console.warn('[AdminSubscriptions] Channels fetch failed, using store:', e);
      if (window.store) channels = window.store.getPaymentChannels();
      if (!channels || channels.length === 0) {
        this.renderAdminError(container, 'Failed to load UPI payment channels.', () => this.renderPaymentChannels());
        return;
      }
    }

    if (this.currentTab !== 'payment-channels') return;

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-black text-slate-900 tracking-tight">UPI Payment Channels & QR Setup</h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Live Sync
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">Configure institutional UPI virtual addresses, manage primary routing for checkouts, and monitor channel transaction volume.</p>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.openAddEditChannelModal()" 
              class="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="plus" class="w-4 h-4"></i> Add New Channel
            </button>
            <button 
              onclick="window.adminDashboard.renderPaymentChannels()" 
              class="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="Refresh"
            >
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Channels Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          ${channels.map(ch => {
            const qrSrc = ch.qrCodeUrl || ch.qrData || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent('upi://pay?pa=' + ch.upiId + '&pn=' + encodeURIComponent(ch.payeeName || 'ExcellenceCA') + (ch.expectedAmount ? '&am=' + Number(ch.expectedAmount).toFixed(2) + '&cu=INR' : ''))}`;
            const planBadgeMap = {
              'all': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-200">PASS: ALL (UNIVERSAL)</span>',
              'elite_trial': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">TRIAL PASS (₹9)</span>',
              'trial': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">TRIAL PASS (₹9)</span>',
              'core_monthly': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-200">CORE PASS — 30D (₹49)</span>',
              'core_4_month': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-900 border border-blue-300">CORE PASS — 4M (₹149)</span>',
              'plus_monthly': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">PLUS PASS — 30D (₹99)</span>',
              'plus_4_month': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-900 border border-indigo-300">PLUS PASS — 4M (₹299)</span>',
              'elite_monthly': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-200">ELITE PASS — 30D (₹149)</span>',
              'elite_4_month': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-900 border border-purple-300">ELITE PASS — 4M (₹499)</span>',
              'core': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-200">PASS: CORE</span>',
              'plus': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">PASS: PLUS</span>',
              'elite': '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-200">PASS: ELITE</span>'
            };
            const planKey = (ch.targetPlanId || ch.subscriptionTier || 'all').toLowerCase();
            const tierBadge = planBadgeMap[planKey] || `<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-800 border border-slate-200">PASS: ${ch.targetPassTitle || (ch.subscriptionTier || 'ALL').toUpperCase()}</span>`;
            const amountLabel = ch.expectedAmount ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Amount: ₹${Number(ch.expectedAmount).toFixed(0)}</span>` : '';

            return `
              <div class="bg-white border ${ch.isPrimary ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'} rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="space-y-2 flex-1">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                      <span class="text-base font-bold text-slate-900">${ch.title || ch.name || 'UPI Channel'}</span>
                      ${ch.isPrimary ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">PRIMARY</span>' : ''}
                      ${tierBadge}
                      ${amountLabel}
                      ${ch.isActive ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">ACTIVE</span>' : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">INACTIVE</span>'}
                      ${(ch.needsReupload || ch.qrMissing) ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3 text-amber-600"></i> RE-UPLOAD QR</span>' : ''}
                    </div>

                    <div class="font-mono text-xs font-black text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg inline-flex items-center gap-2 border border-rose-100">
                      <span>${ch.upiId}</span>
                      <button onclick="navigator.clipboard.writeText('${ch.upiId}'); window.app.showToast('UPI ID copied!', 'info');" class="text-rose-500 hover:text-rose-800 p-0.5" title="Copy UPI ID">
                        <i data-lucide="copy" class="w-3 h-3"></i>
                      </button>
                    </div>

                    <div class="text-xs text-slate-600 font-medium">
                      Payee: <strong class="text-slate-800">${ch.payeeName || 'ExcellenceCA'}</strong>
                    </div>

                    <!-- Bank Details & Routing -->
                    <div class="space-y-1 text-xs border-t border-slate-100 pt-2.5 text-slate-600">
                      <div class="flex justify-between">
                        <span class="text-slate-500">Bank Account:</span>
                        <strong class="font-mono text-slate-800">${ch.bankAccountNumber || ch.accountNumber || 'Not specified'}</strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">IFSC Code:</span>
                        <strong class="font-mono text-slate-800">${ch.bankIfsc || ch.ifsc || 'Not specified'}</strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Account Holder:</span>
                        <strong class="text-slate-800">${ch.bankAccountHolder || ch.accountHolder || ch.payeeName || 'ExcellenceCA'}</strong>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">Amount Limit:</span>
                        <strong class="text-slate-800">${ch.amountLimit ? '₹' + Number(ch.amountLimit).toLocaleString('en-IN') : 'Unlimited'}</strong>
                      </div>
                      <div class="flex justify-between pt-1 border-t border-slate-100 text-[11px]">
                        <span class="text-slate-400">Activity Metrics:</span>
                        <span class="font-bold text-slate-700">${ch.totalTransactions || 0} txns • ₹${(ch.totalVolume || 0).toLocaleString('en-IN')} volume</span>
                      </div>
                    </div>
                  </div>

                  <!-- QR Thumbnail -->
                  <div class="w-24 h-24 bg-slate-50 border border-slate-200 rounded-xl p-1.5 flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                    ${(ch.needsReupload || ch.qrMissing) ? `
                      <div class="p-1 text-center text-amber-800 bg-amber-50 rounded flex flex-col items-center justify-center h-full w-full">
                        <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-600 mb-0.5"></i>
                        <span class="text-[9px] font-bold leading-tight">Re-upload</span>
                      </div>
                    ` : `
                      <img src="${qrSrc}" alt="QR" class="w-full h-full object-contain" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\\'p-1 text-center text-amber-800 bg-amber-50 rounded flex flex-col items-center justify-center h-full w-full\\\'><i data-lucide=\\\'alert-triangle\\\' class=\\\'w-5 h-5 text-amber-600 mb-0.5\\\'></i><span class=\\\'text-[9px] font-bold leading-tight\\\'>Re-upload</span></div>'; if(window.lucide) window.lucide.createIcons();" />
                    `}
                  </div>
                </div>

                <!-- Action Toolbar -->
                <div class="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    ${!ch.isPrimary ? `
                      <button 
                        onclick="window.adminDashboard.setPrimaryChannel('${ch.id}')" 
                        class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Set as Primary
                      </button>
                    ` : '<span class="text-xs text-emerald-700 font-bold flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> Live Primary Channel</span>'}

                    <button 
                      onclick="window.adminDashboard.toggleChannelActive('${ch.id}')" 
                      class="px-2.5 py-1 ${ch.isActive ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'} font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      ${ch.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <button 
                      onclick="window.adminDashboard.openAddEditChannelModal('${ch.id}')" 
                      class="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" 
                      title="Edit Channel"
                    >
                      <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    ${!ch.isPrimary ? `
                      <button 
                        onclick="window.adminDashboard.deleteChannel('${ch.id}')" 
                        class="p-1.5 text-rose-500 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
                        title="Delete Channel"
                      >
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.openAddEditChannelModal = function(channelId) {
    const channels = (window.store ? window.store.getPaymentChannels() : []) || [];
    const channel = channelId ? channels.find(c => c.id === channelId) : null;

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 space-y-5 overflow-y-auto max-h-[88vh]">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">UPI Channel Configuration</span>
            <h3 class="text-lg font-black text-slate-900 mt-0.5">${channel ? 'Edit UPI Channel' : 'Add New UPI Channel'}</h3>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.submitSaveChannel(event, '${channelId || ''}')" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Channel Label / Title <span class="text-rose-600">*</span></label>
            <input 
              type="text" 
              id="admin-channel-title" 
              required 
              value="${channel ? channel.title || channel.name || '' : ''}" 
              placeholder="e.g. Primary HDFC Current Account, ICICI QR" 
              class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Institutional UPI ID (VPA) <span class="text-rose-600">*</span></label>
            <input 
              type="text" 
              id="admin-channel-upi" 
              required 
              value="${channel ? channel.upiId : ''}" 
              placeholder="e.g. excellenceca@hdfcbank" 
              class="w-full px-3.5 py-2.5 text-xs font-mono font-bold text-rose-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Registered Payee Name <span class="text-rose-600">*</span></label>
            <input 
              type="text" 
              id="admin-channel-payee" 
              required 
              value="${channel ? channel.payeeName : 'ExcellenceCA EduTech LLP'}" 
              placeholder="e.g. ExcellenceCA EduTech LLP" 
              class="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Target Subscription / Pass Tier Mapping</label>
            <select id="admin-channel-tier" onchange="window.adminDashboard.onChannelTargetTierChanged(this.value)" class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white">
              <option value="all" data-amount="" ${(channel && (!channel.targetPlanId && (channel.subscriptionTier === 'all' || !channel.subscriptionTier))) ? 'selected' : ''}>All Passes (Universal / Fallback)</option>
              <option value="elite_trial" data-amount="9" ${(channel && (channel.targetPlanId === 'elite_trial' || channel.subscriptionTier === 'trial')) ? 'selected' : ''}>Trial Pass Only (₹9)</option>
              <option value="core_monthly" data-amount="49" ${(channel && channel.targetPlanId === 'core_monthly') ? 'selected' : ''}>Core Pass — 30 Days Only (₹49)</option>
              <option value="plus_monthly" data-amount="99" ${(channel && channel.targetPlanId === 'plus_monthly') ? 'selected' : ''}>Plus Pass — 30 Days Only (₹99)</option>
              <option value="elite_monthly" data-amount="149" ${(channel && channel.targetPlanId === 'elite_monthly') ? 'selected' : ''}>Elite Pass — 30 Days Only (₹149)</option>
              <option value="core_4_month" data-amount="149" ${(channel && channel.targetPlanId === 'core_4_month') ? 'selected' : ''}>Core Pass — 4 Months Only (₹149)</option>
              <option value="plus_4_month" data-amount="299" ${(channel && channel.targetPlanId === 'plus_4_month') ? 'selected' : ''}>Plus Pass — 4 Months Only (₹299)</option>
              <option value="elite_4_month" data-amount="499" ${(channel && channel.targetPlanId === 'elite_4_month') ? 'selected' : ''}>Elite Pass — 4 Months Only (₹499)</option>
            </select>
            <p class="text-[10px] text-slate-400 mt-1">Directs checkout for students buying this specific pass tier to this UPI/QR channel.</p>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Configured Payment Amount (₹) <span class="text-rose-600">*</span></label>
            <input 
              type="number" 
              id="admin-channel-expected-amount" 
              step="1"
              min="1"
              value="${channel && channel.expectedAmount ? channel.expectedAmount : (channel && channel.targetPlanId === 'elite_trial' ? '9' : (channel && channel.targetPlanId === 'core_monthly' ? '49' : (channel && channel.targetPlanId === 'plus_monthly' ? '99' : (channel && channel.targetPlanId === 'elite_monthly' ? '149' : (channel && channel.targetPlanId === 'core_4_month' ? '149' : (channel && channel.targetPlanId === 'plus_4_month' ? '299' : (channel && channel.targetPlanId === 'elite_4_month' ? '499' : '')))))))}" 
              placeholder="e.g. 49 (Auto-filled from pass tier or customize)" 
              class="w-full px-3.5 py-2.5 text-xs font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
            />
            <p class="text-[10px] text-slate-400 mt-1">Expected pass amount. Encoded directly into UPI QR URIs (am=XX.00&cu=INR) for pre-filling student payment apps.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Bank Account Number</label>
              <input 
                type="text" 
                id="admin-channel-bank-account" 
                value="${channel ? channel.bankAccountNumber || channel.accountNumber || '' : ''}" 
                placeholder="e.g. 50200012345678" 
                class="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Bank IFSC Code</label>
              <input 
                type="text" 
                id="admin-channel-bank-ifsc" 
                value="${channel ? channel.bankIfsc || channel.ifsc || '' : ''}" 
                placeholder="e.g. HDFC0001234" 
                class="w-full px-3.5 py-2.5 text-xs font-mono uppercase border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Account Holder Name</label>
              <input 
                type="text" 
                id="admin-channel-bank-holder" 
                value="${channel ? channel.bankAccountHolder || channel.accountHolder || '' : ''}" 
                placeholder="e.g. ExcellenceCA EduTech LLP" 
                class="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Per-Transaction Limit (₹)</label>
              <input 
                type="number" 
                id="admin-channel-limit" 
                min="0"
                value="${channel && channel.amountLimit ? channel.amountLimit : ''}" 
                placeholder="e.g. 50000 (leave empty for unlimited)" 
                class="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>
          </div>

          <!-- Channel QR Code Upload & Preview -->
          <div class="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
            <label class="block text-xs font-bold text-slate-700">Institutional QR Code (Optional)</label>
            <p class="text-[11px] text-slate-500">Upload a custom institutional QR image (PNG, JPG, WEBP, max 5MB). If left empty, an automatic dynamic UPI QR code is generated.</p>
            <div class="flex items-center gap-3 pt-1">
              <input 
                type="file" 
                id="admin-channel-qr-file" 
                accept="image/png,image/jpeg,image/webp" 
                onchange="window.adminDashboard.onChannelQrFileSelected(event)"
                class="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer"
              />
            </div>
            <div id="admin-channel-qr-preview-container" class="${channel && channel.qrCodeUrl ? '' : 'hidden'} mt-2 p-2 border border-slate-200 rounded-xl bg-white flex items-center gap-3">
              <img id="admin-channel-qr-preview-img" src="${channel && channel.qrCodeUrl ? channel.qrCodeUrl : ''}" class="w-14 h-14 object-contain rounded-lg border border-slate-200 bg-white" alt="QR Preview" />
              <div class="flex-1 min-w-0">
                <p id="admin-channel-qr-filename" class="text-xs font-bold text-slate-800 truncate">${channel && channel.qrCodeUrl ? 'Current QR Code' : 'Custom QR'}</p>
                <p class="text-[10px] text-slate-400">Institutional payment QR</p>
              </div>
              <button type="button" onclick="window.adminDashboard.removeChannelQr()" class="px-2 py-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer">
                Remove
              </button>
            </div>
          </div>

          <div class="flex items-center gap-6 pt-1">
            <label class="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                id="admin-channel-active" 
                ${!channel || channel.isActive ? 'checked' : ''} 
                class="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500" 
              />
              <span class="text-xs font-bold text-slate-700">Channel is Active</span>
            </label>

            <label class="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                id="admin-channel-primary" 
                ${channel && channel.isPrimary ? 'checked' : ''} 
                class="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500" 
              />
              <span class="text-xs font-bold text-slate-700">Set as Primary Channel</span>
            </label>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onclick="window.app.closeModal('admin-generic-modal')" 
              class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              id="admin-save-channel-btn"
              class="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="check" class="w-4 h-4"></i> Save Channel
            </button>
          </div>
        </form>
      </div>
    `;

    this._pendingChannelQr = null;
    this._removeChannelQr = false;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.onChannelQrFileSelected = function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      window.app.showToast('QR image must be smaller than 5 MB.', 'error');
      e.target.value = '';
      return;
    }

    // Client-side compression: resize QR images (between 300x300 and 600x600) and export
    // as lossless PNG. Unlike lossy JPEG which causes compression artifacts and blurred
    // module edges that fail on phone scanners, PNG preserves razor-sharp edges and high
    // contrast while keeping the file size small (~20-60KB).
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const origB64 = loadEvt.target.result;
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 600;
        const MIN_DIM = 300;
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        if (w < MIN_DIM && h < MIN_DIM && w > 0 && h > 0) {
          const ratio = Math.max(MIN_DIM / w, MIN_DIM / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        // Lossless PNG guarantees 100% sharp module borders for phone cameras
        const compressedB64 = canvas.toDataURL('image/png');

        const cleanBaseName = file.name.replace(/\.[^/.]+$/, '') || 'channel_qr';
        this._pendingChannelQr = {
          fileName: `${cleanBaseName}.png`,
          fileData: compressedB64
        };
        this._removeChannelQr = false;
        const container = document.getElementById('admin-channel-qr-preview-container');
        const previewImg = document.getElementById('admin-channel-qr-preview-img');
        const fn = document.getElementById('admin-channel-qr-filename');
        if (previewImg) previewImg.src = compressedB64;
        if (fn) fn.textContent = file.name;
        if (container) container.classList.remove('hidden');
      };
      img.onerror = () => {
        window.app.showToast('Failed to process image. Try a different file.', 'error');
      };
      img.src = origB64;
    };
    reader.readAsDataURL(file);
  };

  AdminDashboard.prototype.removeChannelQr = function() {
    this._pendingChannelQr = null;
    this._removeChannelQr = true;
    const fileInput = document.getElementById('admin-channel-qr-file');
    if (fileInput) fileInput.value = '';
    const container = document.getElementById('admin-channel-qr-preview-container');
    if (container) container.classList.add('hidden');
    const img = document.getElementById('admin-channel-qr-preview-img');
    if (img) img.src = '';
  };

  AdminDashboard.prototype.onChannelTargetTierChanged = function(val) {
    const sel = document.getElementById('admin-channel-tier');
    const opt = sel ? sel.options[sel.selectedIndex] : null;
    const defaultAmt = opt ? opt.getAttribute('data-amount') : '';
    const amtInput = document.getElementById('admin-channel-expected-amount');
    if (amtInput && defaultAmt) {
      amtInput.value = defaultAmt;
    }
  };

  AdminDashboard.prototype.submitSaveChannel = async function(event, channelId) {
    event.preventDefault();
    const title = document.getElementById('admin-channel-title').value.trim();
    const upiId = document.getElementById('admin-channel-upi').value.trim();
    const payeeName = document.getElementById('admin-channel-payee').value.trim();
    const bankAccountNumber = (document.getElementById('admin-channel-bank-account')?.value || '').trim();
    const bankIfsc = (document.getElementById('admin-channel-bank-ifsc')?.value || '').trim().toUpperCase();
    const bankAccountHolder = (document.getElementById('admin-channel-bank-holder')?.value || '').trim();
    const amountLimit = parseFloat(document.getElementById('admin-channel-limit')?.value) || 0;
    const isActive = document.getElementById('admin-channel-active').checked;
    const isPrimary = document.getElementById('admin-channel-primary').checked;
    const targetTierVal = (document.getElementById('admin-channel-tier')?.value || 'all').trim();
    const expectedAmount = parseFloat(document.getElementById('admin-channel-expected-amount')?.value) || 0;

    let targetPlanId = '';
    let targetPassTitle = 'All Passes (Universal / Fallback)';
    let subscriptionTier = 'all';

    const planMeta = {
      'elite_trial': { planId: 'elite_trial', title: 'Trial Pass Only (₹9)', tier: 'trial' },
      'core_monthly': { planId: 'core_monthly', title: 'Core Pass — 30 Days Only (₹49)', tier: 'core' },
      'plus_monthly': { planId: 'plus_monthly', title: 'Plus Pass — 30 Days Only (₹99)', tier: 'plus' },
      'elite_monthly': { planId: 'elite_monthly', title: 'Elite Pass — 30 Days Only (₹149)', tier: 'elite' },
      'core_4_month': { planId: 'core_4_month', title: 'Core Pass — 4 Months Only (₹149)', tier: 'core' },
      'plus_4_month': { planId: 'plus_4_month', title: 'Plus Pass — 4 Months Only (₹299)', tier: 'plus' },
      'elite_4_month': { planId: 'elite_4_month', title: 'Elite Pass — 4 Months Only (₹499)', tier: 'elite' }
    };

    if (planMeta[targetTierVal]) {
      targetPlanId = planMeta[targetTierVal].planId;
      targetPassTitle = planMeta[targetTierVal].title;
      subscriptionTier = planMeta[targetTierVal].tier;
    } else {
      subscriptionTier = targetTierVal;
    }

    const submitBtn = document.getElementById('admin-save-channel-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...';
      if (window.lucide) window.lucide.createIcons();
    }

    let qrUrl = undefined;
    if (this._pendingChannelQr) {
      try {
        const uploadRes = await adminFetch('/api/admin/payment-channels/upload-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: this._pendingChannelQr.fileName,
            fileData: this._pendingChannelQr.fileData,
            channelId: channelId || undefined
          })
        });
        if (!uploadRes || !uploadRes.qrCodeUrl) throw new Error('The server did not confirm the stored QR image.');
        qrUrl = uploadRes.qrCodeUrl;
      } catch (upErr) {
        console.warn('[AdminSubscriptions] QR upload failed:', upErr);
        window.app.showToast(`QR image was not saved: ${upErr.message} Nothing was changed.`, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Save Channel';
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }
    } else if (this._removeChannelQr) {
      qrUrl = '';
    }

    const payload = {
      action: channelId ? 'edit' : 'add',
      channelId: channelId || undefined,
      channelData: {
        title: title,
        upiId: upiId,
        payeeName: payeeName,
        subscriptionTier: subscriptionTier,
        targetPlanId: targetPlanId,
        targetPassTitle: targetPassTitle,
        expectedAmount: expectedAmount > 0 ? expectedAmount : undefined,
        bankAccountNumber: bankAccountNumber,
        bankIfsc: bankIfsc,
        bankAccountHolder: bankAccountHolder,
        amountLimit: amountLimit,
        isActive: isActive,
        isPrimary: isPrimary,
        ...(qrUrl !== undefined ? { qrCodeUrl: qrUrl } : {})
      }
    };

    try {
      const data = await adminFetch('/api/admin/payment-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      this._pendingChannelQr = null;
      this._removeChannelQr = false;
      window.app.showToast('UPI channel saved successfully!', 'success');
      window.app.closeModal('admin-generic-modal');
      this.renderPaymentChannels();
    } catch (err) {
      console.error('[AdminSubscriptions] Save channel error:', err);
      window.app.showToast(err.message || 'Failed to save channel.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Save Channel';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  };

  AdminDashboard.prototype.setPrimaryChannel = async function(channelId) {
    try {
      await adminFetch('/api/admin/payment-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_primary', channelId: channelId })
      });
      window.app.showToast('Primary channel updated!', 'success');
      this.renderPaymentChannels();
    } catch (err) {
      console.error('[AdminSubscriptions] Set primary channel error:', err);
      window.app.showToast(err.message || 'Failed to set primary channel.', 'error');
    }
  };

  AdminDashboard.prototype.toggleChannelActive = async function(channelId) {
    try {
      await adminFetch('/api/admin/payment-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_active', channelId: channelId })
      });
      window.app.showToast('Channel status updated!', 'info');
      this.renderPaymentChannels();
    } catch (err) {
      console.error('[AdminSubscriptions] Toggle channel active error:', err);
      window.app.showToast(err.message || 'Failed to toggle channel status.', 'error');
    }
  };

  AdminDashboard.prototype.deleteChannel = async function(channelId) {
    if (!confirm('Are you sure you want to delete this UPI channel?')) return;
    try {
      await adminFetch('/api/admin/payment-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', channelId: channelId })
      });
      window.app.showToast('Channel deleted.', 'info');
      this.renderPaymentChannels();
    } catch (err) {
      console.error('[AdminSubscriptions] Delete channel error:', err);
      window.app.showToast(err.message || 'Failed to delete channel.', 'error');
    }
  };

  // --- TAB 4: PLANS & TRIAL CONFIGURATION ---

  AdminDashboard.prototype.renderPlansConfig = async function(isSilent = false) {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    if (!isSilent) {
      container.innerHTML = `
        <div class="p-8 text-center text-slate-500">
          <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
          <p class="text-xs font-bold">Loading Subscription Plans Configuration...</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    let plans = {};
    try {
      const data = await adminFetch('/api/subscriptions/plans');
      if (this.currentTab !== 'plans-config') return;
      if (data && data.plans) {
        plans = data.plans;
        if (window.store) window.store.saveSubscriptionPlans(plans);
      }
    } catch (e) {
      if (this.currentTab !== 'plans-config') return;
      console.warn('[AdminSubscriptions] Plans fetch failed, using store:', e);
      if (window.store) plans = window.store.getSubscriptionPlans();
      if (!plans || Object.keys(plans).length === 0) {
        this.renderAdminError(container, 'Failed to load subscription plans configuration.', () => this.renderPlansConfig());
        return;
      }
    }

    if (this.currentTab !== 'plans-config') return;

    const planList = Object.values(plans);

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-black text-slate-900 tracking-tight">Subscription Plans & Trial Configuration</h2>
            <p class="text-xs text-slate-500 mt-0.5">Customize pricing, evaluation SLA turnaround, live MCQ limits, and instant XP points for all passes.</p>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.renderPlansConfig()" 
              class="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="Refresh"
            >
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Historical Integrity Notice -->
        <div class="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <i data-lucide="shield-check" class="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5"></i>
          <div>
            <span class="text-xs font-bold text-blue-900 block">Historical Purchase Integrity Guaranteed</span>
            <p class="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
              Modifications to plan prices, SLA, or bonus points will strictly apply to new purchases and renewals. Existing active subscriptions permanently retain their purchase terms.
            </p>
          </div>
        </div>

        <!-- Plans Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          ${planList.map(p => {
            const isTrial = p.tier === 'trial';
            const isElite = p.tier === 'elite';
            const isPlus = p.tier === 'plus';

            return `
              <div class="bg-white border ${isTrial ? 'border-amber-300 ring-1 ring-amber-200' : (isElite ? 'border-purple-300 ring-1 ring-purple-200' : (isPlus ? 'border-indigo-300' : 'border-slate-200'))} rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <div class="flex items-center gap-1.5">
                      <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isTrial ? 'bg-amber-100 text-amber-800' : (isElite ? 'bg-purple-100 text-purple-800' : (isPlus ? 'bg-indigo-100 text-indigo-800' : 'bg-blue-100 text-blue-800'))}">
                        ${p.tier.toUpperCase()} TIER
                      </span>
                      ${p.isActive !== false 
                        ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Active</span>' 
                        : '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">Inactive</span>'}
                    </div>
                    <span class="text-xs font-mono font-bold text-slate-400">ID: ${p.id}</span>
                  </div>

                  <h3 class="text-lg font-black text-slate-900">${p.name}</h3>
                  <div class="flex items-baseline gap-1 mt-1 mb-4">
                    <span class="text-2xl font-black text-slate-900">₹${p.price}</span>
                    <span class="text-xs text-slate-500 font-medium">/ ${p.durationDays} days</span>
                  </div>

                  <!-- Entitlements List -->
                  <div class="space-y-2 text-xs border-t border-slate-100 pt-3">
                    <div class="flex items-center justify-between">
                      <span class="text-slate-600 flex items-center gap-1.5"><i data-lucide="clock" class="w-3.5 h-3.5 text-blue-600"></i> Copy Check SLA:</span>
                      <strong class="text-slate-900">${p.copyCheckSlaHours} Hours</strong>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-slate-600 flex items-center gap-1.5"><i data-lucide="check-square" class="w-3.5 h-3.5 text-emerald-600"></i> Daily Live MCQs:</span>
                      <strong class="text-slate-900">${p.liveMcqDailyLimit ? p.liveMcqDailyLimit + ' / day' : 'Standard'}</strong>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-slate-600 flex items-center gap-1.5"><i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500"></i> Instant XP Bonus:</span>
                      <strong class="text-amber-700 font-bold">+${p.instantPoints || 0} XP</strong>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-slate-600 flex items-center gap-1.5"><i data-lucide="list-checks" class="w-3.5 h-3.5 text-purple-600"></i> Features Listed:</span>
                      <strong class="text-slate-900">${(p.features || []).length} Features</strong>
                    </div>
                  </div>
                </div>

                <div class="pt-3 border-t border-slate-100">
                  <button 
                    onclick="window.adminDashboard.openEditPlanModal('${p.id}')" 
                    class="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <i data-lucide="sliders" class="w-3.5 h-3.5"></i> Edit Plan Terms
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.openEditPlanModal = function(planId) {
    const plans = (window.store ? window.store.getSubscriptionPlans() : {}) || {};
    const plan = plans[planId];
    if (!plan) return;

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">Plan Terms Editor</span>
            <h3 class="text-lg font-black text-slate-900 mt-0.5">Edit: ${plan.name} (${plan.id})</h3>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.adminDashboard.submitSavePlan(event, '${planId}')" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Plan Display Name <span class="text-rose-600">*</span></label>
              <input 
                type="text" 
                id="admin-plan-name" 
                required 
                value="${(plan.name || '').replace(/"/g, '&quot;')}" 
                class="w-full px-3.5 py-2.5 text-xs font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Status <span class="text-rose-600">*</span></label>
              <select 
                id="admin-plan-status" 
                class="w-full px-3.5 py-2.5 text-xs font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              >
                <option value="true" ${plan.isActive !== false ? 'selected' : ''}>Active (Available for Purchase)</option>
                <option value="false" ${plan.isActive === false ? 'selected' : ''}>Inactive (Hidden / Unavailable)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Price (₹) <span class="text-rose-600">*</span></label>
              <input 
                type="number" 
                id="admin-plan-price" 
                required 
                min="0" 
                value="${plan.price}" 
                class="w-full px-3.5 py-2.5 text-xs font-black text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Duration (Days) <span class="text-rose-600">*</span></label>
              <input 
                type="number" 
                id="admin-plan-duration" 
                required 
                min="1" 
                value="${plan.durationDays}" 
                class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Copy Check SLA (Hours) <span class="text-rose-600">*</span></label>
              <input 
                type="number" 
                id="admin-plan-sla" 
                required 
                min="1" 
                value="${plan.copyCheckSlaHours || 24}" 
                class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Live MCQ Daily Limit</label>
              <input 
                type="number" 
                id="admin-plan-mcq-limit" 
                min="0" 
                value="${plan.liveMcqDailyLimit || 1}" 
                class="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Instant Bonus Points (XP) <span class="text-rose-600">*</span></label>
            <input 
              type="number" 
              id="admin-plan-points" 
              required 
              min="0" 
              value="${plan.instantPoints || 0}" 
              class="w-full px-3.5 py-2.5 text-xs font-bold text-amber-700 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white" 
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-bold text-slate-700">Plan Features & Deliverables (One per line)</label>
              <span class="text-[10px] text-slate-400 font-medium">Each line appears as a checkmark bullet on #passes</span>
            </div>
            <textarea 
              id="admin-plan-features" 
              rows="6" 
              class="w-full px-3.5 py-2.5 text-xs font-medium text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 bg-white leading-relaxed resize-y" 
              placeholder="e.g.&#10;+500 instant bonus XP points&#10;Copy checked within 48 hours&#10;Access to premium MCQ questions"
            >${(plan.features || []).join('\n')}</textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onclick="window.app.closeModal('admin-generic-modal')" 
              class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              id="admin-save-plan-btn"
              class="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="check" class="w-4 h-4"></i> Update Plan Terms
            </button>
          </div>
        </form>
      </div>
    `;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.submitSavePlan = async function(event, planId) {
    event.preventDefault();
    const name = document.getElementById('admin-plan-name').value.trim();
    const isActive = document.getElementById('admin-plan-status').value === 'true';
    const rawFeatures = document.getElementById('admin-plan-features').value;
    const features = rawFeatures
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const price = parseFloat(document.getElementById('admin-plan-price').value);
    const durationDays = parseInt(document.getElementById('admin-plan-duration').value, 10);
    const slaHours = parseInt(document.getElementById('admin-plan-sla').value, 10);
    const mcqLimit = parseInt(document.getElementById('admin-plan-mcq-limit').value, 10);
    const instantPoints = parseInt(document.getElementById('admin-plan-points').value, 10);

    const submitBtn = document.getElementById('admin-save-plan-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...';
      if (window.lucide) window.lucide.createIcons();
    }

    const planData = {
      name: name,
      isActive: isActive,
      features: features,
      price: price,
      durationDays: durationDays,
      copyCheckSlaHours: slaHours,
      liveMcqDailyLimit: mcqLimit,
      instantPoints: instantPoints
    };

    try {
      const data = await adminFetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_plan',
          planId: planId,
          planData: planData,
          updates: planData
        })
      });

      window.app.showToast('Plan terms updated successfully!', 'success');
      window.app.closeModal('admin-generic-modal');
      
      // Update store and refresh in memory
      if (window.store) {
        const storedPlans = window.store.getSubscriptionPlans() || {};
        storedPlans[planId] = { ...(storedPlans[planId] || {}), ...planData };
        window.store.saveSubscriptionPlans(storedPlans);
      }
      if (window.subscriptionManager && typeof window.subscriptionManager.fetchPlans === 'function') {
        window.subscriptionManager.fetchPlans(true);
      }
      
      this.renderPlansConfig();
    } catch (err) {
      console.error('[AdminSubscriptions] Save plan error:', err);
      window.app.showToast(err.message || 'Failed to save plan terms.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Update Plan Terms';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  };

  // --- TAB 5: ADMIN AUDIT LOGS ---

  AdminDashboard.prototype.renderAdminAuditLogs = async function(isSilent = false, forceFullRender = false) {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    // Fast-path: if search input and table container exist in DOM,
    // only update table without destroying search input or stealing focus
    if (!forceFullRender && document.getElementById('admin-audit-table-container') && document.getElementById('admin-audit-search-input')) {
      try {
        const data = await adminFetch('/api/admin/audit-logs');
        if (this.currentTab !== 'audit-logs') return;
        if (data && data.logs) {
          this._cachedAuditLogs = data.logs;
          if (window.store) window.store.saveAdminAuditLogs(data.logs);
        }
      } catch (e) {
        console.warn('[AdminSubscriptions] Fast-path audit logs fetch failed:', e);
      }
      if (this.currentTab !== 'audit-logs') return;
      this.renderAdminAuditLogsTableOnly();
      return;
    }

    if (!isSilent) {
      container.innerHTML = `
        <div class="p-8 text-center text-slate-500">
          <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
          <p class="text-xs font-bold">Loading Audit Trail...</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    let logs = [];
    try {
      const data = await adminFetch('/api/admin/audit-logs');
      if (this.currentTab !== 'audit-logs') return;
      if (data && data.logs) {
        logs = data.logs;
        this._cachedAuditLogs = logs;
        if (window.store) window.store.saveAdminAuditLogs(logs);
      }
    } catch (e) {
      if (this.currentTab !== 'audit-logs') return;
      console.warn('[AdminSubscriptions] Audit logs fetch failed, using store:', e);
      if (window.store) logs = window.store.getAdminAuditLogs();
      if (!logs || logs.length === 0) {
        this.renderAdminError(container, 'Failed to load administrative audit logs.', () => this.renderAdminAuditLogs());
        return;
      }
    }

    if (this.currentTab !== 'audit-logs') return;

    const actionFilter = this.auditActionFilter || 'all';
    const search = (this.auditSearch || '').toLowerCase().trim();

    const filtered = logs.filter(l => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (search) {
        const act = (l.action || '').toLowerCase();
        const adm = (l.adminId || '').toLowerCase();
        const tgt = (l.target || '').toLowerCase();
        const rsn = (l.reason || '').toLowerCase();
        if (!act.includes(search) && !adm.includes(search) && !tgt.includes(search) && !rsn.includes(search)) {
          return false;
        }
      }
      return true;
    });

    this.auditPage = this.auditPage || 1;
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (this.auditPage > totalPages) this.auditPage = totalPages;
    const startIndex = (this.auditPage - 1) * pageSize;
    const pagedLogs = filtered.slice(startIndex, startIndex + pageSize);

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-black text-slate-900 tracking-tight">Administrative Audit Trail</h2>
            <p class="text-xs text-slate-500 mt-0.5">Immutable server records of sensitive actions: manual grants, extensions, payment approvals, and plan alterations.</p>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.exportAuditLogs()" 
              class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="download" class="w-4 h-4"></i> Export Logs
            </button>
            <button 
              onclick="window.adminDashboard.renderAdminAuditLogs()" 
              class="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="Refresh"
            >
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-xl shadow-2xs">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-3"></i>
            <input 
              type="text" 
              id="admin-audit-search-input"
              placeholder="Search audit trail by student target, admin, reason, or action..."
              value="${this.auditSearch || ''}"
              oninput="window.adminDashboard.auditSearch = this.value; window.adminDashboard.auditPage = 1; window.adminDashboard.renderAdminAuditLogsTableOnly();"
              class="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50 focus:bg-white transition-colors" 
            />
          </div>

          <div class="flex items-center gap-2">
            <select 
              id="admin-audit-action-filter"
              onchange="window.adminDashboard.auditActionFilter = this.value; window.adminDashboard.auditPage = 1; window.adminDashboard.renderAdminAuditLogsTableOnly();" 
              class="px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">All Action Types</option>
              <option value="PAYMENT_APPROVE">Payment Approvals</option>
              <option value="PAYMENT_REJECT">Payment Rejections</option>
              <option value="SUB_GRANT">Manual Pass Grants</option>
              <option value="SUB_EXTEND">Pass Extensions</option>
              <option value="SUB_SHORTEN">Pass Reductions</option>
              <option value="SUB_SUSPEND">Pass Suspensions</option>
              <option value="SUB_REACTIVATE">Pass Reactivations</option>
              <option value="SUB_CANCEL">Pass Cancellations</option>
              <option value="CHANNEL_UPDATE">Channel Updates</option>
              <option value="PLAN_UPDATE">Plan Terms Config</option>
            </select>
          </div>
        </div>

        <!-- Audit Table Container -->
        <div id="admin-audit-table-container">
        <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th class="py-3 px-4">Timestamp (IST)</th>
                  <th class="py-3 px-4">Action</th>
                  <th class="py-3 px-4">Admin</th>
                  <th class="py-3 px-4">Target Entity / Student</th>
                  <th class="py-3 px-4">Reason / Notes</th>
                  <th class="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-mono text-xs">
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="6" class="py-12 text-center text-slate-400 font-sans">
                      <i data-lucide="shield-check" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                      <p class="text-xs font-bold">No audit records match current criteria.</p>
                    </td>
                  </tr>
                ` : pagedLogs.map(l => {
                  const dateStr = l.timestamp ? new Date(l.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';

                  let actionColor = 'bg-slate-100 text-slate-700 border-slate-200';
                  if (l.action && l.action.includes('APPROVE')) actionColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  else if (l.action && l.action.includes('REJECT')) actionColor = 'bg-rose-100 text-rose-800 border-rose-200';
                  else if (l.action && l.action.includes('GRANT')) actionColor = 'bg-purple-100 text-purple-800 border-purple-200';
                  else if (l.action && l.action.includes('EXTEND')) actionColor = 'bg-blue-100 text-blue-800 border-blue-200';

                  const detailSnippet = l.details ? JSON.stringify(l.details).replace(/"/g, '') : '--';

                  return `
                    <tr class="hover:bg-slate-50/70 transition-colors">
                      <td class="py-3 px-4 text-slate-600">${dateStr}</td>
                      <td class="py-3 px-4">
                        <span class="px-2 py-0.5 rounded-full font-sans text-[11px] font-bold border ${actionColor}">
                          ${l.action}
                        </span>
                      </td>
                      <td class="py-3 px-4 font-bold text-slate-800">${l.adminId || 'admin'}</td>
                      <td class="py-3 px-4 font-bold text-indigo-700">${l.target || '--'}</td>
                      <td class="py-3 px-4 font-sans text-slate-700 text-xs">${l.reason || '--'}</td>
                      <td class="py-3 px-4 text-right text-slate-500 font-mono text-[11px] max-w-xs truncate" title="${detailSnippet}">
                        ${detailSnippet}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Pagination Controls (10/page) -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold text-slate-500 pt-2 px-1">
          <div>
            Showing <span class="font-bold text-slate-800">${filtered.length === 0 ? 0 : startIndex + 1}</span> to <span class="font-bold text-slate-800">${Math.min(startIndex + pageSize, filtered.length)}</span> of <span class="font-bold text-slate-800">${filtered.length}</span> audit records
          </div>
          <div class="flex items-center gap-1.5">
            <button 
              onclick="window.adminDashboard.setAuditPage(${this.auditPage - 1})"
              ${this.auditPage <= 1 ? 'disabled' : ''}
              class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
            >
              <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i> Prev
            </button>
            ${Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - this.auditPage) <= 2)
              .map((p, idx, arr) => {
                const prev = arr[idx - 1];
                const showEllipsis = prev && p - prev > 1;
                return `
                  ${showEllipsis ? '<span class="px-1.5 text-slate-400">...</span>' : ''}
                  <button 
                    onclick="window.adminDashboard.setAuditPage(${p})"
                    class="px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${this.auditPage === p ? 'bg-rose-700 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}"
                  >
                    ${p}
                  </button>
                `;
              }).join('')}
            <button 
              onclick="window.adminDashboard.setAuditPage(${this.auditPage + 1})"
              ${this.auditPage >= totalPages ? 'disabled' : ''}
              class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
            >
              Next <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.setAuditPage = function(page) {
    this.auditPage = page;
    if (document.getElementById('admin-audit-table-container')) {
      this.renderAdminAuditLogsTableOnly();
    } else {
      this.renderAdminAuditLogs(true);
    }
  };

  AdminDashboard.prototype.renderAdminAuditLogsTableOnly = function() {
    const tableContainer = document.getElementById('admin-audit-table-container');
    if (!tableContainer) {
      this.renderAdminAuditLogs(true);
      return;
    }

    const logs = this._cachedAuditLogs || (window.store ? window.store.getAdminAuditLogs() : []) || [];
    const actionFilter = this.auditActionFilter || 'all';
    const search = (this.auditSearch || '').toLowerCase().trim();

    const filtered = logs.filter(l => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (search) {
        const act = (l.action || '').toLowerCase();
        const adm = (l.adminId || '').toLowerCase();
        const tgt = (l.target || '').toLowerCase();
        const rsn = (l.reason || '').toLowerCase();
        if (!act.includes(search) && !adm.includes(search) && !tgt.includes(search) && !rsn.includes(search)) {
          return false;
        }
      }
      return true;
    });

    this.auditPage = this.auditPage || 1;
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (this.auditPage > totalPages) this.auditPage = totalPages;
    if (this.auditPage < 1) this.auditPage = 1;

    const startIndex = (this.auditPage - 1) * pageSize;
    const pagedLogs = filtered.slice(startIndex, startIndex + pageSize);

    tableContainer.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th class="py-3 px-4">Timestamp (IST)</th>
                <th class="py-3 px-4">Action</th>
                <th class="py-3 px-4">Admin</th>
                <th class="py-3 px-4">Target Entity / Student</th>
                <th class="py-3 px-4">Reason / Notes</th>
                <th class="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-mono text-xs">
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-12 text-center text-slate-400 font-sans">
                    <i data-lucide="shield-check" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                    <p class="text-xs font-bold">No audit records match current criteria.</p>
                  </td>
                </tr>
              ` : pagedLogs.map(l => {
                const dateStr = l.timestamp ? new Date(l.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';

                let actionColor = 'bg-slate-100 text-slate-700 border-slate-200';
                if (l.action && l.action.includes('APPROVE')) actionColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                else if (l.action && l.action.includes('REJECT')) actionColor = 'bg-rose-100 text-rose-800 border-rose-200';
                else if (l.action && l.action.includes('GRANT')) actionColor = 'bg-purple-100 text-purple-800 border-purple-200';
                else if (l.action && l.action.includes('EXTEND')) actionColor = 'bg-blue-100 text-blue-800 border-blue-200';

                const detailSnippet = l.details ? JSON.stringify(l.details).replace(/"/g, '') : '--';

                return `
                  <tr class="hover:bg-slate-50/70 transition-colors">
                    <td class="py-3 px-4 text-slate-600">${dateStr}</td>
                    <td class="py-3 px-4">
                      <span class="px-2 py-0.5 rounded-full font-sans text-[11px] font-bold border ${actionColor}">
                        ${l.action}
                      </span>
                    </td>
                    <td class="py-3 px-4 font-bold text-slate-800">${l.adminId || 'admin'}</td>
                    <td class="py-3 px-4 font-bold text-indigo-700">${l.target || '--'}</td>
                    <td class="py-3 px-4 font-sans text-slate-700 text-xs">${l.reason || '--'}</td>
                    <td class="py-3 px-4 text-right text-slate-500 font-mono text-[11px] max-w-xs truncate" title="${detailSnippet}">
                      ${detailSnippet}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pagination Controls (10/page) -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold text-slate-500 pt-2 px-1">
        <div>
          Showing <span class="font-bold text-slate-800">${filtered.length === 0 ? 0 : startIndex + 1}</span> to <span class="font-bold text-slate-800">${Math.min(startIndex + pageSize, filtered.length)}</span> of <span class="font-bold text-slate-800">${filtered.length}</span> audit records
        </div>
        <div class="flex items-center gap-1.5">
          <button 
            onclick="window.adminDashboard.setAuditPage(${this.auditPage - 1})"
            ${this.auditPage <= 1 ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
          >
            <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i> Prev
          </button>
          ${Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - this.auditPage) <= 2)
            .map((p, idx, arr) => {
              const prev = arr[idx - 1];
              const showEllipsis = prev && p - prev > 1;
              return `
                ${showEllipsis ? '<span class="px-1.5 text-slate-400">...</span>' : ''}
                <button 
                  onclick="window.adminDashboard.setAuditPage(${p})"
                  class="px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${this.auditPage === p ? 'bg-rose-700 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}"
                >
                  ${p}
                </button>
              `;
            }).join('')}
          <button 
            onclick="window.adminDashboard.setAuditPage(${this.auditPage + 1})"
            ${this.auditPage >= totalPages ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
          >
            Next <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.exportAuditLogs = function() {
    const logs = window.store ? window.store.getAdminAuditLogs() : [];
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `excellenceca_audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    window.app.showToast('Audit logs exported successfully!', 'success');
  };

  console.log('[ExcellenceCA] Admin Subscriptions Module loaded and bound to AdminDashboard.');
})();
