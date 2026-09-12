/**
 * leaderboard.js - Test and Overall Student Rankings
 * Features:
 * - Test-specific leaderboards with score, percentage, time taken
 * - Overall cumulative platform leaderboard
 * - Privacy protection (no email leaks)
 * - Highlight current logged-in student
 */

class LeaderboardManager {
  constructor() {
    this.selectedTestId = 'overall';
  }

  render() {
    const tests = window.store.getTests().filter(t => t.isPublished);
    const filterSelect = document.getElementById('leaderboard-test-select');
    
    if (filterSelect) {
      filterSelect.innerHTML = `
        <option value="overall" ${this.selectedTestId === 'overall' ? 'selected' : ''}>🏆 Overall Platform Standings</option>
        ${tests.map(t => `<option value="${t.id}" ${this.selectedTestId === t.id ? 'selected' : ''}>${t.title}</option>`).join('')}
      `;
    }

    if (this.selectedTestId === 'overall') {
      this.renderOverallLeaderboard();
    } else {
      this.renderTestLeaderboard(this.selectedTestId);
    }
  }

  handleSelectChange(testId) {
    this.selectedTestId = testId;
    this.render();
  }

  renderOverallLeaderboard() {
    const container = document.getElementById('leaderboard-content');
    if (!container) return;

    const currentUser = window.auth.getCurrentUser();
    const students = window.store.getUsers().filter(u => u.role === 'student');
    const allAttempts = window.store.getAttempts();

    // Compute cumulative stats for each student
    const standings = students.map(student => {
      const studentAttempts = allAttempts.filter(a => a.userId === student.id);
      const testsCount = studentAttempts.length;
      const totalPoints = studentAttempts.reduce((acc, c) => acc + (c.finalScore || 0), 0);
      const avgPercent = testsCount > 0 
        ? Math.round(studentAttempts.reduce((acc, c) => acc + (c.percentage || 0), 0) / testsCount) 
        : 0;

      return {
        id: student.id,
        name: student.name,
        caLevel: student.caLevel || 'CA Student',
        avatar: student.avatar,
        testsCount: testsCount,
        totalPoints: totalPoints,
        avgPercent: avgPercent
      };
    }).sort((a, b) => b.totalPoints - a.totalPoints || b.avgPercent - a.avgPercent);

    container.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-slate-900">Overall CA Merit Standings</h3>
            <p class="text-xs text-slate-500 mt-0.5">Rankings based on cumulative test points and examination performance</p>
          </div>
          <span class="text-xs font-semibold px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1">
            <i data-lucide="shield" class="w-3.5 h-3.5"></i> Live Ranks
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th class="py-3.5 px-5 w-16 text-center">Rank</th>
                <th class="py-3.5 px-5">Student Name</th>
                <th class="py-3.5 px-5">Level</th>
                <th class="py-3.5 px-5 text-center">Tests Taken</th>
                <th class="py-3.5 px-5 text-center">Average %</th>
                <th class="py-3.5 px-5 text-right">Cumulative Points</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${standings.map((st, idx) => {
                const rank = idx + 1;
                const isCurrentUser = currentUser && currentUser.id === st.id;
                
                let rankBadge = `<span class="font-bold text-slate-600">#${rank}</span>`;
                if (rank === 1) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 font-black text-xs shadow-sm">🥇 1</span>`;
                if (rank === 2) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-black text-xs shadow-sm">🥈 2</span>`;
                if (rank === 3) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 text-amber-900 font-black text-xs shadow-sm">🥉 3</span>`;

                return `
                  <tr class="${isCurrentUser ? 'bg-blue-50/80 font-medium' : 'hover:bg-slate-50'} transition-colors">
                    <td class="py-4 px-5 text-center">${rankBadge}</td>
                    <td class="py-4 px-5">
                      <div class="flex items-center gap-3">
                        <img src="${st.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'}" class="w-8 h-8 rounded-full object-cover border border-slate-200">
                        <div>
                          <div class="font-bold text-slate-900 flex items-center gap-1.5">
                            ${st.name}
                            ${isCurrentUser ? '<span class="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">You</span>' : ''}
                          </div>
                          <!-- Privacy rule: email strictly omitted -->
                        </div>
                      </div>
                    </td>
                    <td class="py-4 px-5 text-xs text-slate-600">${st.caLevel}</td>
                    <td class="py-4 px-5 text-center font-semibold text-slate-800">${st.testsCount}</td>
                    <td class="py-4 px-5 text-center">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                        st.avgPercent >= 60 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }">
                        ${st.avgPercent}%
                      </span>
                    </td>
                    <td class="py-4 px-5 text-right font-black text-blue-600 text-base">
                      ${st.totalPoints.toFixed(1)} pts
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

  renderTestLeaderboard(testId) {
    const container = document.getElementById('leaderboard-content');
    if (!container) return;

    const test = window.store.getTestById(testId);
    const currentUser = window.auth.getCurrentUser();
    const attempts = window.store.getAttemptsByTest(testId)
      .sort((a, b) => b.finalScore - a.finalScore || a.timeTakenSeconds - b.timeTakenSeconds);

    const totalMarks = test ? test.totalQuestions * test.marksPerCorrect : 10;

    container.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-slate-900">${test ? test.title : 'Test'} • Standings</h3>
            <p class="text-xs text-slate-500 mt-0.5">${attempts.length} attempts recorded</p>
          </div>
        </div>

        ${attempts.length === 0 ? `
          <div class="text-center py-12 p-6">
            <i data-lucide="award" class="w-10 h-10 text-slate-300 mx-auto mb-2"></i>
            <h4 class="text-sm font-bold text-slate-700">No attempts recorded yet</h4>
            <p class="text-xs text-slate-400 mt-1">Be the first CA candidate to attempt this mock test!</p>
          </div>
        ` : `
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th class="py-3.5 px-5 w-16 text-center">Rank</th>
                  <th class="py-3.5 px-5">Candidate Name</th>
                  <th class="py-3.5 px-5 text-center">Score</th>
                  <th class="py-3.5 px-5 text-center">Percentage</th>
                  <th class="py-3.5 px-5 text-center">Time Taken</th>
                  <th class="py-3.5 px-5 text-right">Attempt Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${attempts.map((att, idx) => {
                  const rank = idx + 1;
                  const isCurrentUser = currentUser && currentUser.id === att.userId;
                  const minutes = Math.floor(att.timeTakenSeconds / 60);
                  const seconds = att.timeTakenSeconds % 60;
                  const timeDisplay = `${minutes}m ${seconds}s`;
                  const dateStr = new Date(att.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

                  let rankBadge = `<span class="font-bold text-slate-600">#${rank}</span>`;
                  if (rank === 1) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 font-black text-xs shadow-sm">🥇 1</span>`;
                  if (rank === 2) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-black text-xs shadow-sm">🥈 2</span>`;
                  if (rank === 3) rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 text-amber-900 font-black text-xs shadow-sm">🥉 3</span>`;

                  return `
                    <tr class="${isCurrentUser ? 'bg-blue-50/80 font-medium' : 'hover:bg-slate-50'} transition-colors">
                      <td class="py-4 px-5 text-center">${rankBadge}</td>
                      <td class="py-4 px-5">
                        <div class="font-bold text-slate-900 flex items-center gap-1.5">
                          ${att.userName}
                          ${isCurrentUser ? '<span class="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">You</span>' : ''}
                        </div>
                      </td>
                      <td class="py-4 px-5 text-center font-bold text-blue-600">
                        ${att.finalScore.toFixed(1)} / ${totalMarks}
                      </td>
                      <td class="py-4 px-5 text-center">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          att.percentage >= 60 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }">
                          ${Math.round(att.percentage)}%
                        </span>
                      </td>
                      <td class="py-4 px-5 text-center text-slate-600 text-xs">${timeDisplay}</td>
                      <td class="py-4 px-5 text-right text-xs text-slate-500">${dateStr}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
}

window.leaderboardManager = new LeaderboardManager();
