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

  // --- TAB 1: SUBSCRIPTIONS & MANUAL GRANTS ---

  AdminDashboard.prototype.renderSubscriptions = async function() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    // Show loading skeleton
    container.innerHTML = `
      <div class="p-8 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
        <p class="text-xs font-bold">Loading Subscriptions & Grants...</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    // Fetch subscriptions & students
    let subs = {};
    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/subscriptions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.subscriptions) {
          subs = data.subscriptions;
          if (window.store) window.store.saveSubscriptions(subs);
        }
      }
    } catch (e) {
      console.warn('[AdminSubscriptions] Backend fetch failed, using store:', e);
      if (window.store) subs = window.store.getSubscriptions();
    }

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
      if (tierFilter === 'expired' && (!sub || sub.status !== 'expired' && (!sub.expiresAt || new Date(sub.expiresAt) >= now))) return false;

      if (search) {
        const name = (st.name || '').toLowerCase();
        const email = (st.email || '').toLowerCase();
        const phone = (st.phone || '').toLowerCase();
        const planName = (sub && sub.planName ? sub.planName : '').toLowerCase();
        if (!name.includes(search) && !email.includes(search) && !phone.includes(search) && !planName.includes(search)) {
          return false;
        }
      }
      return true;
    });

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header & Action Row -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-black text-slate-900 tracking-tight">Student Subscriptions & Pass Grants</h2>
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

        <!-- Filter & Search Controls -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-xl shadow-2xs">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-3"></i>
            <input 
              type="text" 
              placeholder="Search by student name, email, phone or pass..."
              value="${this.subSearch || ''}"
              oninput="window.adminDashboard.subSearch = this.value; window.adminDashboard.renderSubscriptions();"
              class="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>

          <div class="flex items-center gap-2">
            <select 
              onchange="window.adminDashboard.subTierFilter = this.value; window.adminDashboard.renderSubscriptions();"
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

        <!-- Student Subscriptions Table -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
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
                    <td colspan="6" class="py-12 text-center text-slate-400">
                      <i data-lucide="users" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                      <p class="text-xs font-bold">No students found matching current filters.</p>
                    </td>
                  </tr>
                ` : filteredStudents.slice(0, 50).map(st => {
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
                        <button 
                          onclick="window.adminDashboard.openManageSubscriptionModal('${st.id}')"
                          class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Manage Pass
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${filteredStudents.length > 50 ? `
            <div class="p-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
              Showing first 50 of ${filteredStudents.length} students. Use search bar to refine.
            </div>
          ` : ''}
        </div>
      </div>
    `;

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
              <span class="text-xs font-bold px-2 py-0.5 rounded-full ${sub.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
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
      action: action,
      reason: reason
    };

    if (action === 'extend' || action === 'shorten') {
      payload.extensionDays = parseInt(document.getElementById('admin-sub-days-select').value, 10);
    } else if (action === 'grant') {
      payload.planId = document.getElementById('admin-sub-plan-select').value;
      payload.extensionDays = parseInt(document.getElementById('admin-sub-days-select').value, 10);
    } else if (action === 'custom_expiry') {
      const dt = document.getElementById('admin-sub-custom-date').value;
      if (!dt) {
        window.app.showToast('Please select a valid expiry date.', 'error');
        return;
      }
      payload.expiryDate = new Date(dt).toISOString();
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/subscriptions/manage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        window.app.showToast(data.error || 'Failed to update subscription.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Apply Changes`;
        }
        return;
      }

      window.app.showToast(data.message || 'Subscription successfully updated!', 'success');
      window.app.closeModal('admin-generic-modal');

      // Update store
      if (data.subscription && window.store) {
        window.store.saveSubscription(data.subscription);
      }

      this.renderSubscriptions();
    } catch (err) {
      console.error('[AdminSubscriptions] Manage sub error:', err);
      window.app.showToast('Network error while updating subscription.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Apply Changes`;
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
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/subscriptions/manage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          studentId: studentId,
          action: 'grant',
          planId: planId,
          extensionDays: days,
          reason: reason
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        window.app.showToast(data.error || 'Failed to grant pass.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i data-lucide="award" class="w-4 h-4"></i> Authorize & Grant Pass`;
        }
        return;
      }

      window.app.showToast(data.message || 'Pass successfully granted to student!', 'success');
      window.app.closeModal('admin-generic-modal');

      if (data.subscription && window.store) {
        window.store.saveSubscription(data.subscription);
      }

      this.renderSubscriptions();
    } catch (err) {
      console.error('[AdminSubscriptions] Manual grant error:', err);
      window.app.showToast('Network error while granting pass.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="award" class="w-4 h-4"></i> Authorize & Grant Pass`;
      }
    }
  };

  // --- TAB 2: PAYMENT VERIFICATIONS ---

  AdminDashboard.prototype.renderPaymentVerifications = async function() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    container.innerHTML = `
      <div class="p-8 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
        <p class="text-xs font-bold">Loading UPI Payment Sessions...</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    let payments = [];
    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/payments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.payments) {
          payments = data.payments;
          if (window.store) window.store.savePaymentSessions(payments);
        }
      }
    } catch (e) {
      console.warn('[AdminSubscriptions] Backend payments fetch failed, using store:', e);
      if (window.store) payments = window.store.getPaymentSessions();
    }

    const currentFilter = this.paymentFilter || 'pending'; // default to pending for urgent action
    const search = (this.paymentSearch || '').toLowerCase().trim();

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
        const utr = (p.utr || '').toLowerCase();
        const studentName = (p.studentName || '').toLowerCase();
        const studentEmail = (p.studentEmail || '').toLowerCase();
        const sessionId = (p.sessionId || '').toLowerCase();
        const planName = (p.planName || '').toLowerCase();
        if (!utr.includes(search) && !studentName.includes(search) && !studentEmail.includes(search) && !sessionId.includes(search) && !planName.includes(search)) {
          return false;
        }
      }
      return true;
    });

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-black text-slate-900 tracking-tight">UPI Payment Proof Verifications</h2>
            <p class="text-xs text-slate-500 mt-0.5">Inspect submitted UTR transaction codes, verify bank screenshots, activate student passes, and award instant bonus XP.</p>
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
            placeholder="Search by UTR number, student name, email, or session ID..."
            value="${this.paymentSearch || ''}"
            oninput="window.adminDashboard.paymentSearch = this.value; window.adminDashboard.renderPaymentVerifications();"
            class="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
          />
        </div>

        <!-- Payments Table -->
        <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th class="py-3 px-4">Student & Plan</th>
                  <th class="py-3 px-4">Amount</th>
                  <th class="py-3 px-4">UTR Reference</th>
                  <th class="py-3 px-4">UPI Channel</th>
                  <th class="py-3 px-4">Submitted At</th>
                  <th class="py-3 px-4">Receipt Proof</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4 text-right">Verification Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="8" class="py-12 text-center text-slate-400">
                      <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
                      <p class="text-xs font-bold">No payment sessions in this category.</p>
                    </td>
                  </tr>
                ` : filtered.map(p => {
                  const isPending = p.status === 'pending_verification' || p.status === 'late_payment';
                  const isLate = p.status === 'late_payment';
                  const dateStr = p.submittedAt ? new Date(p.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--';

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

                  return `
                    <tr class="hover:bg-slate-50/70 transition-colors ${isLate ? 'bg-orange-50/20' : ''}">
                      <td class="py-3 px-4">
                        <span class="font-bold text-slate-900 block">${p.studentName || 'Student'}</span>
                        <span class="text-xs text-slate-500 block">${p.studentEmail || p.studentId}</span>
                        <span class="text-[11px] font-bold text-rose-700 mt-0.5 inline-block">${p.planName || p.planId}</span>
                      </td>
                      <td class="py-3 px-4 font-black text-slate-900">₹${p.amount}</td>
                      <td class="py-3 px-4 font-mono text-xs font-bold text-slate-800">
                        <div class="flex items-center gap-1.5">
                          <span>${p.utr || '<span class="text-slate-400 font-sans">N/A</span>'}</span>
                          ${p.utr ? `
                            <button 
                              onclick="navigator.clipboard.writeText('${p.utr}'); window.app.showToast('UTR copied!', 'info');"
                              class="text-slate-400 hover:text-slate-700 p-1"
                              title="Copy UTR"
                            >
                              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                            </button>
                          ` : ''}
                        </div>
                        <span class="text-[10px] text-slate-400 font-mono block mt-0.5">ID: ${p.sessionId}</span>
                      </td>
                      <td class="py-3 px-4 text-xs font-mono text-slate-600">
                        ${p.channelUpiId || (p.channelSnapshot ? p.channelSnapshot.upiId : 'HDFC UPI')}
                      </td>
                      <td class="py-3 px-4 text-xs text-slate-500">${dateStr}</td>
                      <td class="py-3 px-4">
                        ${p.screenshot ? `
                          <button 
                            onclick="window.adminDashboard.openScreenshotModal('${p.screenshot}', 'UTR: ${p.utr || p.sessionId}')"
                            class="group relative w-10 h-10 rounded-lg overflow-hidden border border-slate-300 hover:border-rose-500 transition-colors shadow-2xs block"
                            title="Click to zoom screenshot"
                          >
                            <img src="${p.screenshot}" alt="Proof" class="w-full h-full object-cover group-hover:scale-110 transition-transform">
                            <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors flex items-center justify-center">
                              <i data-lucide="zoom-in" class="w-4 h-4 text-white drop-shadow"></i>
                            </div>
                          </button>
                        ` : '<span class="text-xs text-slate-400">No image</span>'}
                      </td>
                      <td class="py-3 px-4">${statusBadge}</td>
                      <td class="py-3 px-4 text-right">
                        ${isPending ? `
                          <div class="inline-flex items-center gap-1.5">
                            <button 
                              onclick="window.adminDashboard.verifyPayment('${p.sessionId}', 'approve', ${p.amount}, '${(p.studentName || '').replace(/'/g, "\\'")}', '${p.planName || p.planId}')"
                              class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                              title="Approve and activate subscription"
                            >
                              <i data-lucide="check" class="w-3.5 h-3.5"></i> Approve
                            </button>
                            <button 
                              onclick="window.adminDashboard.promptRejectPayment('${p.sessionId}')"
                              class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Reject proof"
                            >
                              <i data-lucide="x" class="w-3.5 h-3.5"></i> Reject
                            </button>
                          </div>
                        ` : (p.status === 'approved' ? `
                          <div class="text-xs text-emerald-700 font-medium">
                            <span class="font-bold">Verified</span> by ${p.verifiedBy || 'admin'}
                          </div>
                        ` : (p.status === 'rejected' ? `
                          <div class="text-xs text-rose-600 font-medium" title="${p.rejectionReason || ''}">
                            <span class="font-bold">Rejected:</span> ${p.rejectionReason || 'Proof invalid'}
                          </div>
                        ` : '--'))}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.verifyPayment = async function(sessionId, action, amount, studentName, planName) {
    if (action === 'approve') {
      const confirmMsg = `Approve payment of ₹${amount} for ${studentName}?\n\nThis will authoritatively activate their ${planName} pass and award instant bonus XP points.`;
      if (!confirm(confirmMsg)) return;
    }

    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: sessionId,
          action: action
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        window.app.showToast(data.error || 'Failed to verify payment.', 'error');
        return;
      }

      window.app.showToast(data.message || 'Payment successfully verified and pass activated!', 'success');
      this.renderPaymentVerifications();
    } catch (err) {
      console.error('[AdminSubscriptions] Verify payment error:', err);
      window.app.showToast('Network error while processing verification.', 'error');
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
              <option value="Session expired and payment not received">Session expired and payment not received</option>
              <option value="Other">Custom Reason</option>
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
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: sessionId,
          action: 'reject',
          rejectionReason: reason
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        window.app.showToast(data.error || 'Failed to reject payment.', 'error');
        return;
      }

      window.app.showToast('Payment rejected and student notified.', 'info');
      window.app.closeModal('admin-generic-modal');
      this.renderPaymentVerifications();
    } catch (err) {
      console.error('[AdminSubscriptions] Reject payment error:', err);
      window.app.showToast('Network error while rejecting payment.', 'error');
    }
  };

  AdminDashboard.prototype.openScreenshotModal = function(imgSrc, title) {
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-rose-700 uppercase tracking-wider">Payment Receipt Preview</span>
            <h3 class="text-sm font-black text-slate-900 mt-0.5">${title}</h3>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-slate-950 flex items-center justify-center p-2">
          <img src="${imgSrc}" alt="Receipt Full" class="max-w-full max-h-[70vh] object-contain rounded shadow-lg">
        </div>

        <div class="flex items-center justify-between pt-2">
          <a href="${imgSrc}" download="payment_proof.png" class="text-xs font-bold text-rose-700 hover:underline flex items-center gap-1">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download Original Image
          </a>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg">
            Close
          </button>
        </div>
      </div>
    `;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  // --- TAB 3: UPI CHANNELS & QR MANAGEMENT ---

  AdminDashboard.prototype.renderPaymentChannels = async function() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    container.innerHTML = `
      <div class="p-8 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
        <p class="text-xs font-bold">Loading UPI Payment Channels...</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    let channels = [];
    try {
      const resp = await fetch('/api/payments/channels');
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.channels) {
          channels = data.channels;
          if (window.store) window.store.savePaymentChannels(channels);
        }
      }
    } catch (e) {
      if (window.store) channels = window.store.getPaymentChannels();
    }

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-black text-slate-900 tracking-tight">UPI Payment Channels & QR Setup</h2>
            <p class="text-xs text-slate-500 mt-0.5">Configure institutional UPI virtual addresses, manage primary routing for checkouts, and upload official QR codes.</p>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.openAddEditChannelModal()" 
              class="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="plus" class="w-4 h-4"></i> Add New Channel
            </button>
          </div>
        </div>

        <!-- Channels Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          ${channels.map(ch => {
            const qrSrc = ch.qrCodeUrl || ch.qrData || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent('upi://pay?pa=' + ch.upiId + '&pn=' + encodeURIComponent(ch.payeeName || 'ExcellenceCA'))}`;

            return `
              <div class="bg-white border ${ch.isPrimary ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'} rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-base font-bold text-slate-900">${ch.title || ch.name || 'UPI Channel'}</span>
                      ${ch.isPrimary ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">PRIMARY</span>' : ''}
                      ${ch.isActive ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">ACTIVE</span>' : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">INACTIVE</span>'}
                    </div>
                    <div class="font-mono text-xs font-black text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg inline-block border border-rose-100">
                      ${ch.upiId}
                    </div>
                    <div class="text-xs text-slate-600 mt-2 font-medium">
                      Payee Name: <strong class="text-slate-800">${ch.payeeName}</strong>
                    </div>
                  </div>

                  <!-- QR Thumbnail -->
                  <div class="w-20 h-20 bg-slate-50 border border-slate-200 rounded-xl p-1 flex-shrink-0 flex items-center justify-center">
                    <img src="${qrSrc}" alt="QR" class="w-full h-full object-contain">
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
      <div class="p-6 space-y-5">
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
              value="${channel ? channel.title : ''}"
              placeholder="e.g. Primary HDFC Current Account, Backup ICICI QR"
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
              class="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i data-lucide="check" class="w-4 h-4"></i> Save Channel
            </button>
          </div>
        </form>
      </div>
    `;

    window.app.openModal('admin-generic-modal');
    if (window.lucide) window.lucide.createIcons();
  };

  AdminDashboard.prototype.submitSaveChannel = async function(event, channelId) {
    event.preventDefault();
    const title = document.getElementById('admin-channel-title').value.trim();
    const upiId = document.getElementById('admin-channel-upi').value.trim();
    const payeeName = document.getElementById('admin-channel-payee').value.trim();
    const isActive = document.getElementById('admin-channel-active').checked;
    const isPrimary = document.getElementById('admin-channel-primary').checked;

    const payload = {
      action: channelId ? 'edit' : 'add',
      channelId: channelId || undefined,
      channelData: {
        title: title,
        upiId: upiId,
        payeeName: payeeName,
        isActive: isActive,
        isPrimary: isPrimary
      }
    };

    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/payment-channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        window.app.showToast(data.error || 'Failed to save channel.', 'error');
        return;
      }

      window.app.showToast('UPI channel saved successfully!', 'success');
      window.app.closeModal('admin-generic-modal');
      this.renderPaymentChannels();
    } catch (err) {
      console.error('[AdminSubscriptions] Save channel error:', err);
      window.app.showToast('Network error while saving channel.', 'error');
    }
  };

  AdminDashboard.prototype.setPrimaryChannel = async function(channelId) {
    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/payment-channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'set_primary', channelId: channelId })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        window.app.showToast('Primary channel updated!', 'success');
        this.renderPaymentChannels();
      }
    } catch (err) {
      window.app.showToast('Failed to set primary channel.', 'error');
    }
  };

  AdminDashboard.prototype.toggleChannelActive = async function(channelId) {
    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/payment-channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'toggle_active', channelId: channelId })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        window.app.showToast('Channel status updated!', 'info');
        this.renderPaymentChannels();
      }
    } catch (err) {
      window.app.showToast('Failed to toggle channel status.', 'error');
    }
  };

  AdminDashboard.prototype.deleteChannel = async function(channelId) {
    if (!confirm('Are you sure you want to delete this UPI channel?')) return;
    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/payment-channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'delete', channelId: channelId })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        window.app.showToast('Channel deleted.', 'info');
        this.renderPaymentChannels();
      }
    } catch (err) {
      window.app.showToast('Failed to delete channel.', 'error');
    }
  };

  // --- TAB 4: PLANS & TRIAL CONFIGURATION ---

  AdminDashboard.prototype.renderPlansConfig = async function() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    let plans = {};
    try {
      const resp = await fetch('/api/subscriptions/plans');
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.plans) {
          plans = data.plans;
          if (window.store) window.store.saveSubscriptionPlans(plans);
        }
      }
    } catch (e) {
      if (window.store) plans = window.store.getSubscriptionPlans();
    }

    const planList = Object.values(plans);

    container.innerHTML = `
      <div class="space-y-6 animate-in fade-in duration-150">
        <!-- Header -->
        <div>
          <h2 class="text-xl font-black text-slate-900 tracking-tight">Subscription Plans & Trial Configuration</h2>
          <p class="text-xs text-slate-500 mt-0.5">Customize pricing, evaluation SLA turnaround, live MCQ limits, and instant XP points for all passes.</p>
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
                        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Active</span>' 
                        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">Inactive</span>'}
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
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'update_plan',
          planId: planId,
          planData: planData,
          updates: planData
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        window.app.showToast(data.error || 'Failed to update plan terms.', 'error');
        return;
      }

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
      window.app.showToast('Network error while saving plan.', 'error');
    }
  };

  // --- TAB 5: ADMIN AUDIT LOGS ---

  AdminDashboard.prototype.renderAdminAuditLogs = async function() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    container.innerHTML = `
      <div class="p-8 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-rose-600"></i>
        <p class="text-xs font-bold">Loading Audit Trail...</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    let logs = [];
    try {
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      const resp = await fetch('/api/admin/audit-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.logs) {
          logs = data.logs;
          if (window.store) window.store.saveAdminAuditLogs(logs);
        }
      }
    } catch (e) {
      if (window.store) logs = window.store.getAdminAuditLogs();
    }

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
              placeholder="Search audit trail by student target, admin, reason, or action..."
              value="${this.auditSearch || ''}"
              oninput="window.adminDashboard.auditSearch = this.value; window.adminDashboard.renderAdminAuditLogs();"
              class="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>

          <div class="flex items-center gap-2">
            <select 
              onchange="window.adminDashboard.auditActionFilter = this.value; window.adminDashboard.renderAdminAuditLogs();"
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

        <!-- Audit Table -->
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
                ` : filtered.slice(0, 100).map(l => {
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
