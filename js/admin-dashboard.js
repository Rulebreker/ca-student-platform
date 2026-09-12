/**
 * admin-dashboard.js - Comprehensive Administration & Faculty Management Suite
 * Modules:
 * - Overview Statistics & KPIs
 * - Lecture Management (CRUD + Publish toggle)
 * - Test & MCQ Management (CRUD + Questions Builder)
 * - Assignment Management & PDF Grading Center
 * - Student Directory & Audit Log
 */

class AdminDashboard {
  constructor() {
    this.currentTab = 'overview';
    this.activeEditingLectureId = null;
    this.activeEditingTestId = null;
    this.activeTestQuestionsId = null;
    this.activeEditingAssignmentId = null;
    this.activeGradingSubmissionId = null;
  }

  render() {
    // Role guard
    if (!window.auth.isAdmin()) {
      window.app.navigate('dashboard');
      window.app.showToast('Access restricted: Administrators only.', 'error');
      return;
    }

    this.renderTabs();

    if (this.currentTab === 'overview') this.renderOverview();
    else if (this.currentTab === 'lectures') this.renderLectures();
    else if (this.currentTab === 'tests') this.renderTests();
    else if (this.currentTab === 'assignments') this.renderAssignments();
    else if (this.currentTab === 'students') this.renderStudents();
  }

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  }

  renderTabs() {
    const nav = document.getElementById('admin-sub-tabs');
    if (!nav) return;

    const tabs = [
      { id: 'overview', name: 'Overview & Analytics', icon: 'layout-dashboard' },
      { id: 'lectures', name: 'Lectures', icon: 'video' },
      { id: 'tests', name: 'Tests & MCQs', icon: 'check-square' },
      { id: 'assignments', name: 'Assignments & Grading', icon: 'file-text' },
      { id: 'students', name: 'Student Directory', icon: 'users' }
    ];

    nav.innerHTML = tabs.map(t => {
      const isActive = this.currentTab === t.id;
      return `
        <button 
          onclick="window.adminDashboard.switchTab('${t.id}')"
          class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${
            isActive 
              ? 'bg-blue-600 text-white shadow-sm' 
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

  // --- OVERVIEW TAB ---
  renderOverview() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const students = window.store.getUsers().filter(u => u.role === 'student');
    const lectures = window.store.getLectures();
    const tests = window.store.getTests();
    const attempts = window.store.getAttempts();
    const submissions = window.store.getSubmissions();
    const pendingGrading = submissions.filter(s => s.status !== 'Evaluated').length;

    container.innerHTML = `
      <!-- Stats KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Students</span>
          <span class="text-2xl font-black text-slate-900 mt-1 block">${students.length}</span>
          <span class="text-[11px] text-emerald-600 font-semibold mt-1 block">Active Learners</span>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Lectures</span>
          <span class="text-2xl font-black text-slate-900 mt-1 block">${lectures.length}</span>
          <span class="text-[11px] text-blue-600 font-semibold mt-1 block">${lectures.filter(l => l.isPublished).length} Published</span>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Active Mock Tests</span>
          <span class="text-2xl font-black text-slate-900 mt-1 block">${tests.length}</span>
          <span class="text-[11px] text-purple-600 font-semibold mt-1 block">${tests.filter(t => t.isPublished).length} Published</span>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Test Attempts</span>
          <span class="text-2xl font-black text-slate-900 mt-1 block">${attempts.length}</span>
          <span class="text-[11px] text-slate-500 font-semibold mt-1 block">All Time</span>
        </div>
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm col-span-2 lg:col-span-1">
          <span class="text-xs font-bold text-amber-800 uppercase tracking-wider block">Pending Grading</span>
          <span class="text-2xl font-black text-amber-900 mt-1 block">${pendingGrading}</span>
          <button onclick="window.adminDashboard.switchTab('assignments')" class="text-[11px] text-amber-700 font-bold hover:underline mt-1 block">
            Review Submissions →
          </button>
        </div>
      </div>

      <!-- Recent Platform Activity Feed -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
            <span>Recent Test Submissions</span>
            <span class="text-xs text-blue-600 font-semibold">${attempts.length} Total</span>
          </h3>
          <div class="space-y-3">
            ${attempts.slice(0, 5).map(att => {
              const test = window.store.getTestById(att.testId);
              return `
                <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div>
                    <span class="font-bold text-slate-900">${att.userName}</span>
                    <span class="text-slate-500 block truncate max-w-xs">${test ? test.title : 'CA Test'}</span>
                  </div>
                  <div class="text-right">
                    <span class="font-bold text-emerald-700 block">${att.finalScore.toFixed(1)} pts (${Math.round(att.percentage)}%)</span>
                    <span class="text-[10px] text-slate-400">${new Date(att.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
            <span>Recent Assignment Uploads</span>
            <span class="text-xs text-blue-600 font-semibold">${submissions.length} Total</span>
          </h3>
          <div class="space-y-3">
            ${submissions.slice(0, 5).map(sub => {
              const asg = window.store.getAssignmentById(sub.assignmentId);
              return `
                <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div>
                    <span class="font-bold text-slate-900">${sub.studentName}</span>
                    <span class="text-slate-500 block truncate max-w-xs">${asg ? asg.title : 'Case Study'}</span>
                  </div>
                  <div class="text-right">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      sub.status === 'Evaluated' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }">${sub.status}</span>
                    <span class="text-[10px] text-slate-400 block mt-1">${new Date(sub.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  // --- LECTURES TAB ---
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

      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
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
                  <td class="py-3 px-4 text-right space-x-2">
                    <button 
                      onclick="window.adminDashboard.openLectureModal('${lec.id}')"
                      class="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button 
                      onclick="window.adminDashboard.deleteLecture('${lec.id}')"
                      class="text-xs font-semibold text-rose-600 hover:text-rose-800"
                    >
                      Delete
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

  openLectureModal(lectureId = null) {
    this.activeEditingLectureId = lectureId;
    const lecture = lectureId ? window.store.getLectures().find(l => l.id === lectureId) : null;
    const subjects = window.store.getSubjects();

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">${lecture ? 'Edit Lecture' : 'Create New Lecture'}</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="lecture-form" onsubmit="window.adminDashboard.saveLecture(event)" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Lecture Title</label>
            <input type="text" id="lec-title" required value="${lecture ? lecture.title : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Ind AS 115 Revenue Recognition Practical">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Subject</label>
              <select id="lec-subject" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
                ${subjects.map(s => `
                  <option value="${s.id}" ${lecture && lecture.subjectId === s.id ? 'selected' : ''}>${s.name}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Chapter / Topic</label>
              <input type="text" id="lec-chapter" required value="${lecture ? lecture.chapter : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Accounting Standards">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Video Embed URL (YouTube/Vimeo)</label>
              <input type="url" id="lec-video-url" required value="${lecture ? lecture.videoUrl : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="https://www.youtube-nocookie.com/embed/...">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Duration (Minutes)</label>
              <input type="number" id="lec-duration" min="1" required value="${lecture ? lecture.durationMinutes : 45}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Thumbnail Image URL</label>
            <input type="url" id="lec-thumbnail" required value="${lecture ? lecture.thumbnail : 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600'}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Description & Study Notes</label>
            <textarea id="lec-desc" rows="4" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="Detailed syllabus breakdown and notes...">${lecture ? lecture.description : ''}</textarea>
          </div>

          <div class="flex items-center gap-2 pt-2">
            <input type="checkbox" id="lec-published" ${lecture ? (lecture.isPublished ? 'checked' : '') : 'checked'} class="rounded text-blue-600 w-4 h-4">
            <label for="lec-published" class="font-bold text-slate-700">Publish Immediately to Students</label>
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
    const title = document.getElementById('lec-title').value.trim();
    const subjectId = document.getElementById('lec-subject').value;
    const chapter = document.getElementById('lec-chapter').value.trim();
    const videoUrl = document.getElementById('lec-video-url').value.trim();
    const durationMinutes = parseInt(document.getElementById('lec-duration').value, 10);
    const thumbnail = document.getElementById('lec-thumbnail').value.trim();
    const description = document.getElementById('lec-desc').value.trim();
    const isPublished = document.getElementById('lec-published').checked;

    if (this.activeEditingLectureId) {
      const existing = window.store.getLectures().find(l => l.id === this.activeEditingLectureId);
      if (existing) {
        existing.title = title;
        existing.subjectId = subjectId;
        existing.chapter = chapter;
        existing.videoUrl = videoUrl;
        existing.durationMinutes = durationMinutes;
        existing.thumbnail = thumbnail;
        existing.description = description;
        existing.isPublished = isPublished;
        window.store.updateLecture(existing);
        window.app.showToast('Lecture updated successfully.', 'success');
      }
    } else {
      const newLec = {
        id: 'lec-' + Date.now(),
        title,
        subjectId,
        chapter,
        videoUrl,
        durationMinutes,
        thumbnail,
        description,
        isPublished,
        views: 0,
        createdAt: new Date().toISOString()
      };
      window.store.addLecture(newLec);
      window.app.showToast('Lecture created successfully.', 'success');
    }

    window.app.closeModal('admin-generic-modal');
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
    if (confirm('Are you sure you want to delete this lecture?')) {
      window.store.deleteLecture(id);
      window.app.showToast('Lecture deleted.', 'info');
      this.renderLectures();
    }
  }

  // --- TESTS TAB ---
  renderTests() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const tests = window.store.getTests();

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-base font-bold text-slate-900">MCQ Examination Management</h3>
          <p class="text-xs text-slate-500 mt-0.5">Configure tests, timer limits, negative marks, and manage individual MCQ questions</p>
        </div>
        <button 
          onclick="window.adminDashboard.openTestModal()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
        >
          <i data-lucide="plus" class="w-4 h-4"></i> Create New Test
        </button>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Test Title</th>
              <th class="py-3 px-4">Duration</th>
              <th class="py-3 px-4">Questions</th>
              <th class="py-3 px-4">Marking (+ / -)</th>
              <th class="py-3 px-4">Max Attempts</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${tests.map(tst => {
              const subject = window.store.getSubjectById(tst.subjectId);
              const qCount = window.store.getQuestionsByTestId(tst.id).length;
              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4">
                    <span class="text-[11px] font-bold text-blue-600 uppercase block">${subject ? subject.name : 'CA Practice'}</span>
                    <span class="font-bold text-slate-900 text-xs">${tst.title}</span>
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-600">${tst.durationMinutes} mins</td>
                  <td class="py-3 px-4 text-xs font-semibold text-slate-800">
                    <button 
                      onclick="window.adminDashboard.openQuestionBuilder('${tst.id}')"
                      class="text-blue-600 hover:underline font-bold"
                    >
                      ${qCount} Questions (Manage) →
                    </button>
                  </td>
                  <td class="py-3 px-4 text-xs font-bold">
                    <span class="text-emerald-700">+${tst.marksPerCorrect}</span> / <span class="text-rose-600">-${tst.negativeMarksPerWrong}</span>
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-600">${tst.maxAttempts || 1}</td>
                  <td class="py-3 px-4">
                    <button 
                      onclick="window.adminDashboard.toggleTestPublish('${tst.id}')"
                      class="px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
                        tst.isPublished 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                          : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                      }"
                    >
                      ${tst.isPublished ? 'Published' : 'Draft'}
                    </button>
                  </td>
                  <td class="py-3 px-4 text-right space-x-2">
                    <button 
                      onclick="window.adminDashboard.openTestModal('${tst.id}')"
                      class="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button 
                      onclick="window.adminDashboard.deleteTest('${tst.id}')"
                      class="text-xs font-semibold text-rose-600 hover:text-rose-800"
                    >
                      Delete
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

  openTestModal(testId = null) {
    this.activeEditingTestId = testId;
    const test = testId ? window.store.getTestById(testId) : null;
    const subjects = window.store.getSubjects();

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">${test ? 'Edit Test Configuration' : 'Create New MCQ Test'}</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="test-form" onsubmit="window.adminDashboard.saveTest(event)" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Test Title</label>
            <input type="text" id="tst-title" required value="${test ? test.title : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Ind AS 115 Revenue Recognition Mock Assessment">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Subject</label>
              <select id="tst-subject" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
                ${subjects.map(s => `
                  <option value="${s.id}" ${test && test.subjectId === s.id ? 'selected' : ''}>${s.name}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Chapter / Topic</label>
              <input type="text" id="tst-chapter" required value="${test ? test.chapter : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Accounting Standards">
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Duration (Mins)</label>
              <input type="number" id="tst-duration" min="1" required value="${test ? test.durationMinutes : 15}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Marks/Correct</label>
              <input type="number" id="tst-positive" step="0.5" min="0.5" required value="${test ? test.marksPerCorrect : 2.0}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Negative Marks</label>
              <input type="number" id="tst-negative" step="0.25" min="0" required value="${test ? test.negativeMarksPerWrong : 0.5}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Max Allowed Attempts</label>
              <input type="number" id="tst-attempts" min="1" max="10" required value="${test ? test.maxAttempts : 2}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div class="flex items-center gap-2 pt-5">
              <input type="checkbox" id="tst-published" ${test ? (test.isPublished ? 'checked' : '') : 'checked'} class="rounded text-blue-600 w-4 h-4">
              <label for="tst-published" class="font-bold text-slate-700">Published to Students</label>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Instructions & Guidelines</label>
            <textarea id="tst-desc" rows="3" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="Instructions displayed to students before starting...">${test ? test.description : ''}</textarea>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">Save Test</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveTest(e) {
    e.preventDefault();
    const title = document.getElementById('tst-title').value.trim();
    const subjectId = document.getElementById('tst-subject').value;
    const chapter = document.getElementById('tst-chapter').value.trim();
    const durationMinutes = parseInt(document.getElementById('tst-duration').value, 10);
    const marksPerCorrect = parseFloat(document.getElementById('tst-positive').value);
    const negativeMarksPerWrong = parseFloat(document.getElementById('tst-negative').value);
    const maxAttempts = parseInt(document.getElementById('tst-attempts').value, 10);
    const description = document.getElementById('tst-desc').value.trim();
    const isPublished = document.getElementById('tst-published').checked;

    if (this.activeEditingTestId) {
      const existing = window.store.getTestById(this.activeEditingTestId);
      if (existing) {
        existing.title = title;
        existing.subjectId = subjectId;
        existing.chapter = chapter;
        existing.durationMinutes = durationMinutes;
        existing.marksPerCorrect = marksPerCorrect;
        existing.negativeMarksPerWrong = negativeMarksPerWrong;
        existing.maxAttempts = maxAttempts;
        existing.description = description;
        existing.isPublished = isPublished;
        window.store.updateTest(existing);
        window.app.showToast('Test updated successfully.', 'success');
      }
    } else {
      const newTest = {
        id: 'tst-' + Date.now(),
        title,
        subjectId,
        chapter,
        durationMinutes,
        marksPerCorrect,
        negativeMarksPerWrong,
        maxAttempts,
        description,
        totalQuestions: 0,
        isPublished,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 86400000).toISOString()
      };
      window.store.addTest(newTest);
      window.app.showToast('Test created! Now add questions.', 'success');
    }

    window.app.closeModal('admin-generic-modal');
    this.renderTests();
  }

  toggleTestPublish(id) {
    const tst = window.store.getTestById(id);
    if (tst) {
      tst.isPublished = !tst.isPublished;
      window.store.updateTest(tst);
      this.renderTests();
    }
  }

  deleteTest(id) {
    if (confirm('Are you sure you want to delete this test and its associated questions?')) {
      window.store.deleteTest(id);
      window.app.showToast('Test deleted.', 'info');
      this.renderTests();
    }
  }

  // --- MCQ QUESTION BUILDER ---
  openQuestionBuilder(testId) {
    this.activeTestQuestionsId = testId;
    const test = window.store.getTestById(testId);
    if (!test) return;

    const questions = window.store.getQuestionsByTestId(testId);

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Manage MCQs: ${test.title}</h3>
            <span class="text-xs text-slate-500">${questions.length} questions registered</span>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick="window.adminDashboard.openQuestionForm()"
              class="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              <i data-lucide="plus" class="w-3.5 h-3.5"></i> Add Question
            </button>
            <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600 p-1">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <div id="question-list-area" class="space-y-4">
          ${questions.length === 0 ? `
            <div class="text-center py-12 text-slate-400 text-xs">
              No questions added yet. Click "+ Add Question" to create MCQs.
            </div>
          ` : questions.map((q, idx) => `
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-xs space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-blue-600">Question ${idx + 1}</span>
                <div class="space-x-2">
                  <button onclick="window.adminDashboard.openQuestionForm('${q.id}')" class="text-blue-600 hover:underline font-semibold">Edit</button>
                  <button onclick="window.adminDashboard.deleteQuestion('${q.id}')" class="text-rose-600 hover:underline font-semibold">Delete</button>
                </div>
              </div>
              <p class="font-semibold text-slate-800">${q.text}</p>
              <div class="grid grid-cols-2 gap-2 text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                <div class="${q.correctOption === 'A' ? 'font-bold text-emerald-700' : ''}">A: ${q.optionA}</div>
                <div class="${q.correctOption === 'B' ? 'font-bold text-emerald-700' : ''}">B: ${q.optionB}</div>
                <div class="${q.correctOption === 'C' ? 'font-bold text-emerald-700' : ''}">C: ${q.optionC}</div>
                <div class="${q.correctOption === 'D' ? 'font-bold text-emerald-700' : ''}">D: ${q.optionD}</div>
              </div>
              <div class="text-[11px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded">
                <strong>Correct Key:</strong> Option ${q.correctOption} • <strong>Marks:</strong> ${q.marks}
              </div>
              <div class="text-[11px] text-slate-500 italic">
                <strong>Explanation:</strong> ${q.explanation}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  openQuestionForm(questionId = null) {
    const testId = this.activeTestQuestionsId;
    const test = window.store.getTestById(testId);
    const question = questionId ? window.store.getQuestions().find(q => q.id === questionId) : null;

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">${question ? 'Edit Question' : 'Add New MCQ Question'}</h3>
          <button onclick="window.adminDashboard.openQuestionBuilder('${testId}')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="question-form" onsubmit="window.adminDashboard.saveQuestion(event, '${questionId || ''}')" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Question Prompt / Case Stem</label>
            <textarea id="q-text" rows="3" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="State the question clearly...">${question ? question.text : ''}</textarea>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Option A</label>
              <input type="text" id="q-optA" required value="${question ? question.optionA : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Option B</label>
              <input type="text" id="q-optB" required value="${question ? question.optionB : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Option C</label>
              <input type="text" id="q-optC" required value="${question ? question.optionC : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Option D</label>
              <input type="text" id="q-optD" required value="${question ? question.optionD : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Correct Answer Key</label>
              <select id="q-correct" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-emerald-800 bg-emerald-50">
                <option value="A" ${question && question.correctOption === 'A' ? 'selected' : ''}>Option A</option>
                <option value="B" ${question && question.correctOption === 'B' ? 'selected' : ''}>Option B</option>
                <option value="C" ${question && question.correctOption === 'C' ? 'selected' : ''}>Option C</option>
                <option value="D" ${question && question.correctOption === 'D' ? 'selected' : ''}>Option D</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Marks Weight</label>
              <input type="number" id="q-marks" step="0.5" min="0.5" required value="${question ? question.marks : (test ? test.marksPerCorrect : 2.0)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Detailed Explanation / ICAI Standard Reference</label>
            <textarea id="q-explanation" rows="3" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="Detailed reason for the correct option and Ind AS / Act reference...">${question ? question.explanation : ''}</textarea>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.adminDashboard.openQuestionBuilder('${testId}')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Back</button>
            <button type="submit" class="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">Save Question</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  saveQuestion(e, questionId) {
    e.preventDefault();
    const testId = this.activeTestQuestionsId;
    const text = document.getElementById('q-text').value.trim();
    const optionA = document.getElementById('q-optA').value.trim();
    const optionB = document.getElementById('q-optB').value.trim();
    const optionC = document.getElementById('q-optC').value.trim();
    const optionD = document.getElementById('q-optD').value.trim();
    const correctOption = document.getElementById('q-correct').value;
    const marks = parseFloat(document.getElementById('q-marks').value);
    const explanation = document.getElementById('q-explanation').value.trim();

    if (questionId) {
      const q = window.store.getQuestions().find(x => x.id === questionId);
      if (q) {
        q.text = text;
        q.optionA = optionA;
        q.optionB = optionB;
        q.optionC = optionC;
        q.optionD = optionD;
        q.correctOption = correctOption;
        q.marks = marks;
        q.explanation = explanation;
        window.store.updateQuestion(q);
        window.app.showToast('Question updated.', 'success');
      }
    } else {
      const existingQs = window.store.getQuestionsByTestId(testId);
      const newQ = {
        id: 'q-' + Date.now(),
        testId: testId,
        number: existingQs.length + 1,
        text,
        optionA,
        optionB,
        optionC,
        optionD,
        correctOption,
        marks,
        explanation
      };
      window.store.addQuestion(newQ);

      // Update test total questions count
      const test = window.store.getTestById(testId);
      if (test) {
        test.totalQuestions = existingQs.length + 1;
        window.store.updateTest(test);
      }

      window.app.showToast('Question added.', 'success');
    }

    this.openQuestionBuilder(testId);
  }

  deleteQuestion(id) {
    if (confirm('Delete this question?')) {
      const q = window.store.getQuestions().find(x => x.id === id);
      window.store.deleteQuestion(id);
      if (q) {
        const test = window.store.getTestById(q.testId);
        if (test) {
          test.totalQuestions = Math.max(0, (test.totalQuestions || 1) - 1);
          window.store.updateTest(test);
        }
      }
      window.app.showToast('Question deleted.', 'info');
      this.openQuestionBuilder(this.activeTestQuestionsId);
    }
  }

  // --- ASSIGNMENTS & GRADING TAB ---
  renderAssignments() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const assignments = window.store.getAssignments();
    const submissions = window.store.getSubmissions();

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-base font-bold text-slate-900">Assignment Creation & PDF Grading Center</h3>
          <p class="text-xs text-slate-500 mt-0.5">Publish practical case problems, inspect submitted student PDFs, assign marks and feedback</p>
        </div>
        <button 
          onclick="window.adminDashboard.openAssignmentModal()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
        >
          <i data-lucide="plus" class="w-4 h-4"></i> Create Assignment
        </button>
      </div>

      <!-- Section 1: Student PDF Submissions Queue (Evaluation Center) -->
      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-8">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <i data-lucide="inbox" class="w-4 h-4 text-blue-600"></i>
            Student Submissions Queue (${submissions.length})
          </h4>
        </div>

        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Student</th>
              <th class="py-3 px-4">Assignment</th>
              <th class="py-3 px-4">Submitted File</th>
              <th class="py-3 px-4">Date</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4">Score</th>
              <th class="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${submissions.length === 0 ? `
              <tr><td colspan="7" class="py-8 text-center text-xs text-slate-400">No submissions uploaded yet.</td></tr>
            ` : submissions.map(sub => {
              const asg = window.store.getAssignmentById(sub.assignmentId);
              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4 font-bold text-slate-900 text-xs">${sub.studentName}</td>
                  <td class="py-3 px-4 text-xs text-slate-700">${asg ? asg.title : 'CA Assignment'}</td>
                  <td class="py-3 px-4 text-xs font-mono text-slate-600">
                    <a href="${sub.fileData}" download="${sub.fileName}" class="text-blue-600 hover:underline flex items-center gap-1">
                      <i data-lucide="file" class="w-3.5 h-3.5 text-rose-500"></i>
                      ${sub.fileName}
                    </a>
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-500">${new Date(sub.submittedAt).toLocaleDateString()}</td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-0.5 text-xs font-semibold rounded-full ${
                      sub.status === 'Evaluated' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }">${sub.status}</span>
                  </td>
                  <td class="py-3 px-4 text-xs font-bold text-slate-800">
                    ${sub.status === 'Evaluated' ? `${sub.marksObtained} / ${asg ? asg.maximumMarks : 50}` : '--'}
                  </td>
                  <td class="py-3 px-4 text-right">
                    <button 
                      onclick="window.adminDashboard.openGradingModal('${sub.id}')"
                      class="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                    >
                      ${sub.status === 'Evaluated' ? 'Edit Grade' : 'Grade PDF'}
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Section 2: All Assignments Catalog -->
      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">
            All Practical Assignments (${assignments.length})
          </h4>
        </div>
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Title & Subject</th>
              <th class="py-3 px-4">Deadline</th>
              <th class="py-3 px-4">Max Marks</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${assignments.map(a => {
              const subject = window.store.getSubjectById(a.subjectId);
              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4">
                    <span class="text-[11px] font-bold text-blue-600 uppercase block">${subject ? subject.name : 'CA'} • ${a.topic}</span>
                    <span class="font-bold text-slate-900 text-xs">${a.title}</span>
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-600">${new Date(a.deadline).toLocaleDateString()}</td>
                  <td class="py-3 px-4 text-xs font-bold text-slate-800">${a.maximumMarks} Marks</td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-0.5 text-xs font-semibold rounded-full ${a.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                      ${a.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-right space-x-2">
                    <button onclick="window.adminDashboard.openAssignmentModal('${a.id}')" class="text-xs font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                    <button onclick="window.adminDashboard.deleteAssignment('${a.id}')" class="text-xs font-semibold text-rose-600 hover:text-rose-800">Delete</button>
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

  openAssignmentModal(asgId = null) {
    this.activeEditingAssignmentId = asgId;
    const asg = asgId ? window.store.getAssignmentById(asgId) : null;
    const subjects = window.store.getSubjects();

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">${asg ? 'Edit Assignment' : 'Create New Assignment'}</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="asg-form" onsubmit="window.adminDashboard.saveAssignment(event)" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Assignment Title</label>
            <input type="text" id="asg-title" required value="${asg ? asg.title : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Computation of Total Income & Tax Payable (AY 2025-26)">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Subject</label>
              <select id="asg-subject" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
                ${subjects.map(s => `
                  <option value="${s.id}" ${asg && asg.subjectId === s.id ? 'selected' : ''}>${s.name}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Topic / Area</label>
              <input type="text" id="asg-topic" required value="${asg ? asg.topic : ''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Individuals & HUF Taxation">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Maximum Marks</label>
              <input type="number" id="asg-marks" min="10" required value="${asg ? asg.maximumMarks : 50}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Submission Deadline</label>
              <input type="date" id="asg-deadline" required value="${asg ? asg.deadline.split('T')[0] : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Detailed Case Study Instructions & Requirements (Formatted)</label>
            <textarea id="asg-desc" rows="5" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono" placeholder="Provide detailed scenario, numbers, and required steps...">${asg ? asg.description : ''}</textarea>
          </div>

          <div class="flex items-center gap-2 pt-2">
            <input type="checkbox" id="asg-published" ${asg ? (asg.isPublished ? 'checked' : '') : 'checked'} class="rounded text-blue-600 w-4 h-4">
            <label for="asg-published" class="font-bold text-slate-700">Published immediately for student submissions</label>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">Save Assignment</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveAssignment(e) {
    e.preventDefault();
    const title = document.getElementById('asg-title').value.trim();
    const subjectId = document.getElementById('asg-subject').value;
    const topic = document.getElementById('asg-topic').value.trim();
    const maximumMarks = parseInt(document.getElementById('asg-marks').value, 10);
    const deadline = new Date(document.getElementById('asg-deadline').value).toISOString();
    const description = document.getElementById('asg-desc').value.trim();
    const isPublished = document.getElementById('asg-published').checked;

    if (this.activeEditingAssignmentId) {
      const existing = window.store.getAssignmentById(this.activeEditingAssignmentId);
      if (existing) {
        existing.title = title;
        existing.subjectId = subjectId;
        existing.topic = topic;
        existing.maximumMarks = maximumMarks;
        existing.deadline = deadline;
        existing.description = description;
        existing.isPublished = isPublished;
        window.store.updateAssignment(existing);
        window.app.showToast('Assignment updated.', 'success');
      }
    } else {
      const newAsg = {
        id: 'asg-' + Date.now(),
        title,
        subjectId,
        topic,
        maximumMarks,
        deadline,
        description,
        isPublished,
        createdAt: new Date().toISOString()
      };
      window.store.addAssignment(newAsg);
      window.app.showToast('Assignment created.', 'success');
    }

    window.app.closeModal('admin-generic-modal');
    this.renderAssignments();
  }

  deleteAssignment(id) {
    if (confirm('Are you sure you want to delete this assignment?')) {
      window.store.deleteAssignment(id);
      window.app.showToast('Assignment deleted.', 'info');
      this.renderAssignments();
    }
  }

  // --- PDF GRADING MODAL ---
  openGradingModal(submissionId) {
    this.activeGradingSubmissionId = submissionId;
    const submission = window.store.getSubmissions().find(s => s.id === submissionId);
    if (!submission) return;

    const asg = window.store.getAssignmentById(submission.assignmentId);

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Grade Assignment Submission</h3>
            <span class="text-xs text-slate-500">Student: <strong>${submission.studentName}</strong> • ${asg ? asg.title : 'Practical Case'}</span>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Submitted PDF Document Banner -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
              <i data-lucide="file-text" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-xs font-mono font-bold text-slate-900 block">${submission.fileName}</span>
              <span class="text-[11px] text-slate-500">Submitted on ${new Date(submission.submittedAt).toLocaleString()}</span>
            </div>
          </div>
          <a 
            href="${submission.fileData}" 
            download="${submission.fileName}"
            class="px-3.5 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-white border border-slate-200 rounded-lg shadow-sm inline-flex items-center gap-1.5"
          >
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download & Inspect PDF
          </a>
        </div>

        <!-- Grading Form -->
        <form id="grading-form" onsubmit="window.adminDashboard.saveGrade(event)" class="space-y-4 text-xs">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Marks Awarded (Out of ${asg ? asg.maximumMarks : 50})</label>
              <input 
                type="number" 
                id="grade-marks" 
                min="0" 
                max="${asg ? asg.maximumMarks : 50}" 
                step="0.5" 
                required 
                value="${submission.marksObtained !== null ? submission.marksObtained : ''}" 
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-emerald-800"
                placeholder="e.g. 45"
              >
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Submission Status</label>
              <select id="grade-status" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
                <option value="Evaluated" ${submission.status === 'Evaluated' ? 'selected' : ''}>Evaluated (Complete)</option>
                <option value="Needs Revision" ${submission.status === 'Needs Revision' ? 'selected' : ''}>Needs Revision (Resubmit)</option>
                <option value="Submitted" ${submission.status === 'Submitted' ? 'selected' : ''}>Submitted (Pending)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Faculty Feedback & Working Notes Comments</label>
            <textarea 
              id="grade-feedback" 
              rows="4" 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" 
              placeholder="Provide constructive feedback on calculations, schedule presentations, and tax provisions..."
            >${submission.adminFeedback || ''}</textarea>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm">Save Evaluation</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  saveGrade(e) {
    e.preventDefault();
    const submissionId = this.activeGradingSubmissionId;
    const submission = window.store.getSubmissions().find(s => s.id === submissionId);
    if (!submission) return;

    const marks = parseFloat(document.getElementById('grade-marks').value);
    const status = document.getElementById('grade-status').value;
    const feedback = document.getElementById('grade-feedback').value.trim();

    submission.marksObtained = marks;
    submission.status = status;
    submission.adminFeedback = feedback;
    submission.evaluatedBy = window.auth.getCurrentUser().name;
    submission.evaluatedAt = new Date().toISOString();

    window.store.updateSubmission(submission);
    window.app.closeModal('admin-generic-modal');
    window.app.showToast(`Submission evaluated successfully. Score: ${marks}`, 'success');
    this.renderAssignments();
  }

  // --- STUDENTS TAB ---
  renderStudents() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const students = window.store.getUsers().filter(u => u.role === 'student');
    const attempts = window.store.getAttempts();
    const submissions = window.store.getSubmissions();

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-base font-bold text-slate-900">Registered CA Students Directory</h3>
          <p class="text-xs text-slate-500 mt-0.5">View student progress, exam scores, and submitted solutions</p>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Student</th>
              <th class="py-3 px-4">CA Level</th>
              <th class="py-3 px-4">Registration No</th>
              <th class="py-3 px-4 text-center">Tests Taken</th>
              <th class="py-3 px-4 text-center">Assignments</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${students.map(st => {
              const studentAttempts = attempts.filter(a => a.userId === st.id);
              const studentSubs = submissions.filter(s => s.studentId === st.id);
              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-3">
                      <img src="${st.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'}" class="w-8 h-8 rounded-full object-cover border border-slate-200">
                      <div>
                        <span class="font-bold text-slate-900 text-xs block">${st.name}</span>
                        <span class="text-[11px] text-slate-500">${st.email}</span>
                      </div>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-700">${st.caLevel}</td>
                  <td class="py-3 px-4 text-xs font-mono text-slate-600">${st.registrationNo || 'N/A'}</td>
                  <td class="py-3 px-4 text-center font-bold text-blue-600 text-xs">${studentAttempts.length}</td>
                  <td class="py-3 px-4 text-center font-bold text-slate-700 text-xs">${studentSubs.length}</td>
                  <td class="py-3 px-4 text-right">
                    <button 
                      onclick="window.adminDashboard.viewStudentDetail('${st.id}')"
                      class="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      View Profile & History →
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

  viewStudentDetail(studentId) {
    const student = window.store.getUsers().find(u => u.id === studentId);
    if (!student) return;

    const attempts = window.store.getAttemptsByUser(studentId);
    const submissions = window.store.getSubmissionsByUser(studentId);

    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
          <div class="flex items-center gap-3">
            <img src="${student.avatar}" class="w-12 h-12 rounded-full object-cover border border-slate-200">
            <div>
              <h3 class="text-base font-bold text-slate-900">${student.name}</h3>
              <span class="text-xs text-slate-500">${student.caLevel} • ${student.email} • ${student.registrationNo}</span>
            </div>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="space-y-6 text-xs">
          <!-- Test Attempts -->
          <div>
            <h4 class="font-bold text-slate-900 uppercase tracking-wider mb-2">Test Attempts (${attempts.length})</h4>
            <div class="space-y-2">
              ${attempts.length === 0 ? '<p class="text-slate-400">No test attempts recorded.</p>' : attempts.map(a => {
                const t = window.store.getTestById(a.testId);
                return `
                  <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span class="font-bold text-slate-900">${t ? t.title : 'CA Test'}</span>
                      <span class="text-slate-500 block text-[11px]">${new Date(a.submittedAt).toLocaleDateString()}</span>
                    </div>
                    <div class="text-right">
                      <span class="font-bold text-emerald-700">${a.finalScore.toFixed(1)} pts (${Math.round(a.percentage)}%)</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Assignment Submissions -->
          <div>
            <h4 class="font-bold text-slate-900 uppercase tracking-wider mb-2">Assignment Submissions (${submissions.length})</h4>
            <div class="space-y-2">
              ${submissions.length === 0 ? '<p class="text-slate-400">No assignments submitted.</p>' : submissions.map(s => {
                const asg = window.store.getAssignmentById(s.assignmentId);
                return `
                  <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <span class="font-bold text-slate-900">${asg ? asg.title : 'Assignment'}</span>
                      <span class="text-slate-500 block text-[11px]">${s.fileName}</span>
                    </div>
                    <div class="text-right">
                      <span class="font-bold text-blue-600">${s.status}</span>
                      ${s.status === 'Evaluated' ? `<span class="block text-emerald-700 font-bold">${s.marksObtained} Marks</span>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }
}

window.adminDashboard = new AdminDashboard();
