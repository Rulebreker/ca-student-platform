/**
 * student-dashboard.js - Student Dashboard Views & Analytics
 */

class StudentDashboard {
  render() {
    const user = window.auth.getCurrentUser();
    if (!user) return;

    // Fetch user-specific metrics
    const userAttempts = window.store.getAttemptsByUser(user.id);
    const totalTests = userAttempts.length;
    
    let avgScore = 0;
    let bestScore = 0;
    if (totalTests > 0) {
      const sum = userAttempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
      avgScore = Math.round(sum / totalTests);
      bestScore = Math.round(Math.max(...userAttempts.map(a => a.percentage || 0)));
    }

    // Calculate current leaderboard rank from XP standings
    let rankDisplay = '--';
    if (window.leaderboardManager) {
      const currentRank = window.leaderboardManager.getStudentRank(user.id);
      if (currentRank) rankDisplay = `#${currentRank}`;
    }

    // Update Metrics in DOM
    const welcomeEl = document.getElementById('dashboard-welcome-name');
    if (welcomeEl) welcomeEl.textContent = user.name;

    const welcomeLevelEl = document.getElementById('dashboard-welcome-level');
    if (welcomeLevelEl) welcomeLevelEl.textContent = user.caLevel || 'CA Student';

    let totalXp = 0;
    if (window.rankService && typeof window.rankService.getUserTotalXp === 'function') {
      totalXp = window.rankService.getUserTotalXp(user.id);
    } else if (window.store && typeof window.store.getUserTotalXp === 'function') {
      totalXp = window.store.getUserTotalXp(user.id);
    } else {
      totalXp = user.totalXp !== undefined ? Number(user.totalXp) : (user.baseXp !== undefined ? Number(user.baseXp) : 0);
    }

    const metricTotalXp = document.getElementById('metric-total-xp');
    if (metricTotalXp) metricTotalXp.textContent = Number(totalXp).toLocaleString();

    const metricTests = document.getElementById('metric-tests-attempted');
    if (metricTests) metricTests.textContent = totalTests;
    const metricAvg = document.getElementById('metric-avg-score');
    if (metricAvg) metricAvg.textContent = totalTests > 0 ? `${avgScore}%` : '0%';
    const metricBest = document.getElementById('metric-best-score');
    if (metricBest) metricBest.textContent = totalTests > 0 ? `${bestScore}%` : '0%';
    const metricRank = document.getElementById('metric-current-rank');
    if (metricRank) metricRank.textContent = rankDisplay;

    // Render Sub-sections
    this.renderPassBadge();
    this.renderAvailableTests();
    // Video lectures hidden from student dashboard
    this.renderPendingAssignments();
    this.renderRecentAttempts(userAttempts);
  }

  renderAvailableTests() {
    const container = document.getElementById('dashboard-available-tests');
    if (!container) return;

    const user = window.auth.getCurrentUser();
    const userTier = window.testEngine ? window.testEngine.getUserTier() : 'free';
    const allTests = window.store.getTests().filter(t => t.isPublished || t.status === 'Published' || t.status === 'Live');
    const tests = allTests.filter(t => {
      if (window.testEngine) return window.testEngine.isTestVisibleForStudent(t, userTier);
      if (t.hideFromNonEligible) return false;
      return true;
    });
    const userAttempts = user ? window.store.getAttemptsByUser(user.id) : [];

    if (tests.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 py-4">No tests currently available.</p>`;
      return;
    }

    container.innerHTML = tests.slice(0, 3).map(test => {
      const attemptsCount = userAttempts.filter(a => a.testId === test.id).length;
      const attemptsLeft = Math.max(0, (test.maxAttempts || 1) - attemptsCount);
      const subject = window.store.getSubjectById(test.subjectId);
      const isEligible = window.testEngine ? window.testEngine.isTestEligibleForStudent(test, userTier) : true;
      const canTake = isEligible && attemptsLeft > 0;

      return `
        <div class="bg-white border ${isEligible ? 'border-slate-200' : 'border-amber-200/90'} rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                  ${subject ? subject.name : 'General CA'}
                </span>
                ${!isEligible ? `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <i data-lucide="lock" class="w-3 h-3 text-amber-700"></i> Locked
                  </span>
                ` : ''}
              </div>
              <span class="text-xs text-slate-500 font-medium">
                ${test.durationMinutes} mins • ${test.totalQuestions} MCQs
              </span>
            </div>
            <h4 class="text-base font-bold text-slate-900 line-clamp-2 mb-1.5">${test.title}</h4>
            <p class="text-xs text-slate-600 line-clamp-2 mb-4">${test.description}</p>
          </div>
          
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
            ${isEligible ? `
              <span class="text-xs ${attemptsLeft > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}">
                ${attemptsLeft} of ${test.maxAttempts || 1} attempt(s) remaining
              </span>
              <button 
                onclick="window.testEngine.showInstructionsModal('${test.id}')"
                class="px-3.5 py-1.5 text-xs font-semibold rounded-lg ${
                  canTake 
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                } transition-colors cursor-pointer"
                ${!canTake ? 'disabled' : ''}
              >
                ${attemptsCount > 0 ? 'Re-take Test' : 'Take Test'}
              </button>
            ` : `
              <span class="text-xs text-amber-800 font-semibold flex items-center gap-1">
                <i data-lucide="lock" class="w-3.5 h-3.5 text-amber-600"></i> Pass Required
              </span>
              <button 
                onclick="window.testEngine.showUnlockModal('${test.id}')"
                class="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <i data-lucide="key" class="w-3.5 h-3.5"></i> Unlock Mock
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  renderAvailableLectures() {
    const container = document.getElementById('dashboard-available-lectures');
    if (!container) return;

    const lectures = window.store.getLectures().filter(l => l.isPublished).slice(0, 3);
    if (lectures.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 py-4">No lectures published yet.</p>`;
      return;
    }

    container.innerHTML = lectures.map(lec => {
      const subject = window.store.getSubjectById(lec.subjectId);
      return `
        <div class="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow group flex flex-col justify-between">
          <div class="relative cursor-pointer" onclick="window.lecturePlayer.openLecture('${lec.id}')">
            <img src="${lec.thumbnail}" alt="${lec.title}" class="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300">
            <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <div class="w-10 h-10 rounded-full bg-blue-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <i data-lucide="play" class="w-5 h-5 fill-white ml-0.5"></i>
              </div>
            </div>
            <span class="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[11px] font-semibold px-2 py-0.5 rounded">
              ${lec.durationMinutes}m
            </span>
          </div>
          <div class="p-4 flex-1 flex flex-col justify-between">
            <div>
              <span class="text-xs font-semibold text-blue-600 uppercase tracking-wider">${subject ? subject.name : 'Lecture'}</span>
              <h4 class="text-sm font-bold text-slate-900 line-clamp-2 mt-1 mb-1">${lec.title}</h4>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100 mt-2">
              <span>${lec.views} views</span>
              <button onclick="window.lecturePlayer.openLecture('${lec.id}')" class="text-blue-600 font-semibold hover:underline">Watch Now →</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  renderPendingAssignments() {
    const container = document.getElementById('dashboard-pending-assignments');
    if (!container) return;

    const user = window.auth.getCurrentUser();

    // Sync papers from backend (non-blocking, with in-flight lock)
    if (!this._isSyncingPapers && typeof fetch !== 'undefined') {
      this._isSyncingPapers = true;
      const token = user ? (user.token || '') : '';
      fetch('/api/papers', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data && Array.isArray(data.papers)) {
          const localAssignments = window.store.getAssignments();
          let changed = false;
          data.papers.forEach(bp => {
            if (!bp.id) return;
            const exists = localAssignments.find(a => a.id === bp.id);
            if (!exists) {
              localAssignments.unshift({
                id: bp.id, title: bp.title || 'Untitled Paper', subjectId: bp.subjectId || '',
                subject: bp.subject || '', topic: bp.topic || '', maximumMarks: bp.maximumMarks || 0,
                durationMinutes: bp.durationMinutes || 0, description: bp.description || '',
                status: bp.effectiveStatus || bp.status || 'Published',
                isPublished: bp.effectiveStatus !== 'Draft' && bp.status !== 'Draft',
                isLive: bp.isLive || false, questionPdfName: bp.questionPdfName || null,
                questionPdfId: bp.questionPdfId || null, questionPdfData: bp.questionPdfData || null,
                answerPdfName: bp.answerPdfName || null, answerPdfId: bp.answerPdfId || null,
                answerPdfData: bp.answerPdfData || null,
                scheduledPublishTime: bp.scheduledPublishTime || null,
                liveStartTime: bp.liveStartTime || null, liveEndTime: bp.liveEndTime || null,
                expiryTime: bp.expiryTime || null, deadline: bp.deadline || null,
                createdAt: bp.createdAt || new Date().toISOString()
              });
              changed = true;
            }
          });
          if (changed) {
            window.store.saveAssignments(localAssignments);
            this.renderPendingAssignments();
          }
        }
      }).catch(() => {}).finally(() => { this._isSyncingPapers = false; });
    }

    const assignments = window.store.getAssignments().filter(a => a.isPublished);
    const submissions = window.store.getSubmissionsByUser(user.id);

    if (assignments.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 py-4">No assignments assigned right now.</p>`;
      return;
    }

    container.innerHTML = assignments.slice(0, 3).map(asg => {
      const submission = submissions.find(s => s.assignmentId === asg.id);
      const subject = window.store.getSubjectById(asg.subjectId);
      const deadlineDate = new Date(asg.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

      let statusBadge = `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">Pending</span>`;
      if (window.secureBackend) {
        const evalStatus = window.secureBackend.computePaperStatus(asg);
        statusBadge = `<span class="px-2 py-0.5 text-xs font-bold rounded-full ${evalStatus.badgeClass}">${evalStatus.badgeText}</span>`;
      }
      if (submission) {
        if (submission.status === 'Evaluated') {
          statusBadge = `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Evaluated (${submission.marksObtained}/${asg.maximumMarks})</span>`;
        } else {
          statusBadge = `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">Submitted</span>`;
        }
      }

      return `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl gap-4 hover:border-blue-300 transition-colors">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-semibold text-slate-500">${subject ? subject.name : 'CA Practice'}</span>
              ${statusBadge}
            </div>
            <h5 class="text-sm font-bold text-slate-900">${asg.title}</h5>
            <p class="text-xs text-slate-500 mt-1">Due: ${deadlineDate} • Max Marks: ${asg.maximumMarks}</p>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.assignmentPortal.openAssignmentModal('${asg.id}')"
              class="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors whitespace-nowrap"
            >
              ${submission ? 'View Submission' : 'Upload PDF Solution'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderRecentAttempts(userAttempts) {
    const container = document.getElementById('dashboard-recent-attempts');
    if (!container) return;

    if (!userAttempts || userAttempts.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <i data-lucide="award" class="w-8 h-8 text-slate-400 mx-auto mb-2"></i>
          <p class="text-sm font-medium text-slate-600">No test attempts yet</p>
          <p class="text-xs text-slate-400 mt-0.5">Take your first MCQ test to begin tracking your analytics</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    this.recentAttemptsPage = this.recentAttemptsPage || 1;
    const pageSize = 5;
    const totalItems = userAttempts.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (this.recentAttemptsPage > totalPages) this.recentAttemptsPage = totalPages;
    if (this.recentAttemptsPage < 1) this.recentAttemptsPage = 1;
    const startIndex = (this.recentAttemptsPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const pagedAttempts = userAttempts.slice(startIndex, endIndex);

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Test Title</th>
              <th class="py-3 px-4">Date</th>
              <th class="py-3 px-4">Score</th>
              <th class="py-3 px-4">Percentage</th>
              <th class="py-3 px-4">Time Taken</th>
              <th class="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${pagedAttempts.map(att => {
              const test = window.store.getTestById(att.testId);
              const dateStr = new Date(att.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              const minutes = Math.floor((att.timeTakenSeconds || 0) / 60);
              const seconds = (att.timeTakenSeconds || 0) % 60;
              const timeDisplay = `${minutes}m ${seconds}s`;

              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4 font-semibold text-slate-900">${test ? test.title : 'CA Mock Exam'}</td>
                  <td class="py-3 px-4 text-slate-600">${dateStr}</td>
                  <td class="py-3 px-4 font-bold text-blue-600">${att.finalScore.toFixed(1)} / ${(test ? test.totalQuestions * test.marksPerCorrect : 10)}</td>
                  <td class="py-3 px-4">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                      att.percentage >= 60 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }">
                      ${Math.round(att.percentage)}%
                    </span>
                  </td>
                  <td class="py-3 px-4 text-slate-600">${timeDisplay}</td>
                  <td class="py-3 px-4 text-right">
                    <button 
                      onclick="window.testEngine.showResultModal('${att.id}')"
                      class="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View Report & Solutions →
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${totalPages > 1 ? `
        <div class="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs mt-2 rounded-b-xl">
          <div class="text-slate-600">
            Showing <span class="font-semibold text-slate-900">${startIndex + 1}</span> to <span class="font-semibold text-slate-900">${endIndex}</span> of <span class="font-bold text-slate-900">${totalItems}</span> attempts
          </div>
          <div class="flex items-center gap-1">
            <button 
              onclick="window.studentDashboard.setRecentAttemptsPage(${this.recentAttemptsPage - 1})"
              ${this.recentAttemptsPage <= 1 ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
            >
              Previous
            </button>
            <span class="px-3 py-1 font-bold text-xs text-slate-700 bg-white border border-slate-200 rounded">
              Page ${this.recentAttemptsPage} of ${totalPages}
            </span>
            <button 
              onclick="window.studentDashboard.setRecentAttemptsPage(${this.recentAttemptsPage + 1})"
              ${this.recentAttemptsPage >= totalPages ? 'disabled class="px-2.5 py-1 rounded border border-slate-200 text-slate-300 bg-white cursor-not-allowed text-xs"' : 'class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-medium cursor-pointer"'}
            >
              Next
            </button>
          </div>
        </div>
      ` : ''}
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  setRecentAttemptsPage(page) {
    this.recentAttemptsPage = page;
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) return;
    const userAttempts = window.store ? window.store.getAttemptsByUser(user.id) : [];
    this.renderRecentAttempts(userAttempts);
  }

  renderPassBadge() {
    const container = document.getElementById('dashboard-subscription-card');
    const user = window.auth ? window.auth.getCurrentUser() : null;
    if (!user) return;

    const ent = window.store ? window.store.getUserEntitlements(user.id) : null;
    if (!ent) return;

    const sub = window.store ? window.store.getUserSubscription(user.id) : null;

    if (container) {
      if (ent.isSubscribed) {
        const isTrial = ent.isTrial;
        const expiryDateStr = sub && sub.expiresAt 
          ? new Date(sub.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'Active';

        container.innerHTML = `
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-start sm:items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl ${isTrial ? 'bg-amber-100 text-amber-700 border border-amber-300' : (ent.tier === 'elite' ? 'bg-purple-100 text-purple-700 border border-purple-300' : (ent.tier === 'plus' ? 'bg-indigo-100 text-indigo-700 border border-indigo-300' : 'bg-blue-100 text-blue-700 border border-blue-300'))} flex items-center justify-center flex-shrink-0 shadow-xs">
                <i data-lucide="${isTrial ? 'sparkles' : 'badge-check'}" class="w-6 h-6"></i>
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${ent.badgeClass || 'bg-blue-100 text-blue-800'}">
                    ${ent.badge || ent.planName}
                  </span>
                  <span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active
                  </span>
                  <span class="text-xs text-slate-500 font-medium">
                    • Expires: ${expiryDateStr} (${ent.remainingDays} day${ent.remainingDays === 1 ? '' : 's'} left)
                  </span>
                </div>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span class="flex items-center gap-1 font-semibold text-slate-800">
                    <i data-lucide="clock" class="w-3.5 h-3.5 text-blue-600"></i> ${ent.copyCheckSlaHours || (sub ? sub.copyCheckSlaHours : 24)}h SLA Copy Check
                  </span>
                  <span class="flex items-center gap-1 font-semibold text-slate-800">
                    <i data-lucide="check-square" class="w-3.5 h-3.5 text-emerald-600"></i> ${ent.permissions && ent.permissions.live_mcq_daily_limit ? ent.permissions.live_mcq_daily_limit + ' Live MCQs/Day' : 'Daily MCQs'}
                  </span>
                  ${ent.permissions && ent.permissions.weekly_full_exam_access ? '<span class="flex items-center gap-1 font-semibold text-purple-700"><i data-lucide="award" class="w-3.5 h-3.5"></i> Weekly Mocks Included</span>' : ''}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2.5 self-start md:self-center flex-shrink-0">
              <button 
                onclick="window.subscriptionManager && window.subscriptionManager.openPricingModal()"
                class="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Upgrade / Extend Pass
              </button>
            </div>
          </div>
        `;
      } else {
        // Free Basic Tier
        container.innerHTML = `
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-start sm:items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <i data-lucide="shield" class="w-6 h-6"></i>
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                    Free Basic Tier
                  </span>
                  <span class="text-xs text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Standard 72h+ SLA
                  </span>
                </div>
                <p class="text-xs text-slate-600">
                  Upgrade your membership for priority 12-24h answer copy evaluations, daily live MCQ drills, and instant XP boosts!
                </p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2.5 self-start md:self-center flex-shrink-0">
              <button 
                onclick="window.subscriptionManager && window.subscriptionManager.startCheckout('elite_trial')"
                class="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
              >
                <i data-lucide="zap" class="w-3.5 h-3.5"></i> Try Elite for ₹9
              </button>
              <button 
                onclick="window.subscriptionManager && window.subscriptionManager.openPricingModal()"
                class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                View Passes
              </button>
            </div>
          </div>
        `;
      }
    }

    // Also update pass badge on user nav container if present
    const userRoleBadge = document.getElementById('user-role-badge');
    if (userRoleBadge && ent.isSubscribed) {
      userRoleBadge.textContent = ent.badge || ent.planName;
      userRoleBadge.className = `px-1.5 py-0.2 text-[10px] font-bold rounded-full ${ent.badgeClass || 'bg-blue-100 text-blue-800'} uppercase`;
    }

    if (window.lucide) window.lucide.createIcons();
  }

  renderPaymentHistory() {
    if (window.subscriptionManager && typeof window.subscriptionManager.renderPassesPaymentHistory === 'function') {
      window.subscriptionManager.renderPassesPaymentHistory(true);
    }
  }
}

window.studentDashboard = new StudentDashboard();
