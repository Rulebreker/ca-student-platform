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

    const metricTests = document.getElementById('metric-tests-attempted');
    if (metricTests) metricTests.textContent = totalTests;
    const metricAvg = document.getElementById('metric-avg-score');
    if (metricAvg) metricAvg.textContent = totalTests > 0 ? `${avgScore}%` : '0%';
    const metricBest = document.getElementById('metric-best-score');
    if (metricBest) metricBest.textContent = totalTests > 0 ? `${bestScore}%` : '0%';
    const metricRank = document.getElementById('metric-current-rank');
    if (metricRank) metricRank.textContent = rankDisplay;

    // Render Sub-sections
    this.renderAvailableTests();
    // Video lectures hidden from student dashboard
    this.renderPendingAssignments();
    this.renderRecentAttempts(userAttempts);
  }

  renderAvailableTests() {
    const container = document.getElementById('dashboard-available-tests');
    if (!container) return;

    const user = window.auth.getCurrentUser();
    const tests = window.store.getTests().filter(t => t.isPublished);
    const userAttempts = window.store.getAttemptsByUser(user.id);

    if (tests.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 py-4">No tests currently available.</p>`;
      return;
    }

    container.innerHTML = tests.slice(0, 3).map(test => {
      const attemptsCount = userAttempts.filter(a => a.testId === test.id).length;
      const attemptsLeft = Math.max(0, (test.maxAttempts || 1) - attemptsCount);
      const subject = window.store.getSubjectById(test.subjectId);
      const canTake = attemptsLeft > 0;

      return `
        <div class="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                ${subject ? subject.name : 'General CA'}
              </span>
              <span class="text-xs text-slate-500 font-medium">
                ${test.durationMinutes} mins • ${test.totalQuestions} MCQs
              </span>
            </div>
            <h4 class="text-base font-bold text-slate-900 line-clamp-2 mb-1.5">${test.title}</h4>
            <p class="text-xs text-slate-600 line-clamp-2 mb-4">${test.description}</p>
          </div>
          
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span class="text-xs ${attemptsLeft > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}">
              ${attemptsLeft} of ${test.maxAttempts || 1} attempt(s) remaining
            </span>
            <button 
              onclick="window.testEngine.showInstructionsModal('${test.id}')"
              class="px-3.5 py-1.5 text-xs font-semibold rounded-lg ${
                canTake 
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              } transition-colors"
              ${!canTake ? 'disabled' : ''}
            >
              ${attemptsCount > 0 ? 'Re-take Test' : 'Take Test'}
            </button>
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
            ${userAttempts.slice(0, 5).map(att => {
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
    `;
    if (window.lucide) window.lucide.createIcons();
  }
}

window.studentDashboard = new StudentDashboard();
