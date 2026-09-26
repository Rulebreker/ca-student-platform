/**
 * teacher-portal.js - Dedicated Teacher & Faculty Portal for ExcellenceCA
 * Features:
 * - Assigned subjects filter & inspection queue
 * - Student Answer Copy review & download
 * - Evaluated / Checked Copy PDF upload
 * - Test / Question Paper upload (controlled by Admin Privileges)
 */

class TeacherPortal {
  constructor() {
    this.activeGradingSubmissionId = null;
    this.selectedCheckedPdfFile = null;
    this.selectedQuestionPdfFile = null;
  }

  render() {
    const user = window.auth.getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      window.app.navigate('dashboard');
      window.app.showToast('Access restricted to Faculty / Teachers.', 'error');
      return;
    }

    const container = document.getElementById('teacher-content-area');
    if (!container) return;

    const subjects = window.store.getSubjects();
    const assignedSubjectIds = user.assignedSubjects || subjects.map(s => s.id);
    const assignedSubjects = subjects.filter(s => assignedSubjectIds.includes(s.id));
    
    // Submissions for teacher's subjects
    const allAssignments = window.store.getAssignments();
    const teacherAssignmentIds = allAssignments
      .filter(a => user.role === 'admin' || assignedSubjectIds.includes(a.subjectId))
      .map(a => a.id);

    const submissions = window.store.getSubmissions()
      .filter(s => teacherAssignmentIds.includes(s.assignmentId));

    const pendingCount = submissions.filter(s => s.status !== 'Evaluated').length;
    const evaluatedCount = submissions.filter(s => s.status === 'Evaluated').length;

    const canUpload = window.auth.hasPrivilege('canUploadTests');
    const canGrade = window.auth.hasPrivilege('canGradeCopies');

    container.innerHTML = `
      <!-- Teacher Header Banner -->
      <div class="bg-gradient-to-r from-amber-700 via-amber-800 to-slate-900 rounded-2xl p-6 text-white shadow-md mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-amber-100">
                👨‍🏫 Faculty Portal
              </span>
              <span class="text-xs text-amber-200">• ${user.registrationNo || 'Faculty'}</span>
            </div>
            <h2 class="text-xl sm:text-2xl font-black">${user.name}</h2>
            <p class="text-xs text-amber-100/90 mt-1">
              Assigned Curriculum: <strong>${assignedSubjects.map(s => s.name).join(', ') || 'All Subjects'}</strong>
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            ${canUpload ? `
              <button 
                onclick="window.teacherPortal.openUploadTestModal()"
                class="px-4 py-2 bg-white text-slate-900 font-bold text-xs rounded-lg shadow-sm hover:bg-slate-100 transition-colors flex items-center gap-1.5"
              >
                <i data-lucide="upload" class="w-4 h-4 text-amber-600"></i> Upload Question Paper PDF
              </button>
            ` : `
              <span class="px-3 py-1.5 bg-black/20 text-amber-200 text-xs rounded-lg border border-white/10 flex items-center gap-1" title="Question upload disabled by Admin">
                <i data-lucide="lock" class="w-3.5 h-3.5"></i> Test Upload Locked by Admin
              </span>
            `}
          </div>
        </div>
      </div>

      <!-- Quick KPI Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block">Assigned Copies</span>
          <span class="text-2xl font-black text-slate-900 mt-1 block">${submissions.length}</span>
          <span class="text-[11px] text-slate-400">Total submitted</span>
        </div>
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
          <span class="text-xs font-bold text-amber-800 uppercase tracking-wider block">Copies to Check</span>
          <span class="text-2xl font-black text-amber-900 mt-1 block">${pendingCount}</span>
          <span class="text-[11px] text-amber-700 font-semibold">Pending Evaluation</span>
        </div>
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
          <span class="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Checked & Returned</span>
          <span class="text-2xl font-black text-emerald-900 mt-1 block">${evaluatedCount}</span>
          <span class="text-[11px] text-emerald-700 font-semibold">Checked Copy Uploaded</span>
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
          <span class="text-xs font-bold text-blue-800 uppercase tracking-wider block">Your Privileges</span>
          <span class="text-xs font-bold text-blue-900 mt-1 block">
            ${canGrade ? '✓ Grade Copies' : '✗ No Grading'}<br>
            ${canUpload ? '✓ Upload Tests' : '✗ No Test Upload'}
          </span>
        </div>
      </div>

      <!-- Section: Student Answer Copies Queue -->
      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-8">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <i data-lucide="file-check-2" class="w-4 h-4 text-amber-600"></i>
              Student Answer Sheets & Evaluation Center
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">Inspect student answers, enter marks & feedback, and upload the evaluated Checked Copy (PDF)</p>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th class="py-3 px-4">Student</th>
                <th class="py-3 px-4">Test / Case Title</th>
                <th class="py-3 px-4">Submitted Answer Copy</th>
                <th class="py-3 px-4">Date</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4">Checked Copy PDF</th>
                <th class="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${submissions.length === 0 ? `
                <tr><td colspan="7" class="py-12 text-center text-xs text-slate-400">No student answer sheets pending for your assigned subjects.</td></tr>
              ` : submissions.map(sub => {
                const asg = window.store.getAssignmentById(sub.assignmentId);
                const isEvaluated = sub.status === 'Evaluated';
                const hasCheckedCopy = !!sub.checkedCopyPdfData;

                return `
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4">
                      <span class="font-bold text-slate-900 text-xs block">${sub.studentName}</span>
                      <span class="text-[11px] text-slate-500 font-mono">ID: ${sub.studentId}</span>
                    </td>
                    <td class="py-3 px-4 text-xs text-slate-700 font-semibold max-w-xs truncate">
                      ${asg ? asg.title : 'CA Test Paper'}
                    </td>
                    <td class="py-3 px-4 text-xs font-mono">
                      <a href="${sub.fileData}" download="${sub.fileName}" class="text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold">
                        <i data-lucide="file" class="w-3.5 h-3.5 text-rose-500"></i>
                        ${sub.fileName}
                      </a>
                    </td>
                    <td class="py-3 px-4 text-xs text-slate-500">${new Date(sub.submittedAt).toLocaleDateString()}</td>
                    <td class="py-3 px-4">
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isEvaluated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }">
                        ${sub.status} ${isEvaluated ? `(${sub.marksObtained}/${sub.maxMarks || (asg ? asg.maximumMarks : 50)})` : ''}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-xs">
                      ${hasCheckedCopy ? `
                        <a href="${sub.checkedCopyPdfData}" download="${sub.checkedCopyFileName}" class="text-emerald-700 hover:underline font-bold inline-flex items-center gap-1">
                          <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-600"></i>
                          Checked Copy
                        </a>
                      ` : `
                        <span class="text-slate-400 italic text-[11px]">Not uploaded yet</span>
                      `}
                    </td>
                    <td class="py-3 px-4 text-right">
                      ${canGrade ? `
                        <button 
                          onclick="window.teacherPortal.openGradeModal('${sub.id}')"
                          class="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
                        >
                          ${isEvaluated ? 'Re-Evaluate Copy' : 'Check & Grade Copy →'}
                        </button>
                      ` : `
                        <span class="text-xs text-slate-400">View Only</span>
                      `}
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

  openGradeModal(submissionId) {
    this.activeGradingSubmissionId = submissionId;
    this.selectedCheckedPdfFile = null;

    const submission = window.store.getSubmissions().find(s => s.id === submissionId);
    if (!submission) return;

    const asg = window.store.getAssignmentById(submission.assignmentId);
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900">Check Student Answer Copy & Return Result</h3>
            <span class="text-xs text-slate-500">Student: <strong>${submission.studentName}</strong> • ${asg ? asg.title : 'CA Paper'}</span>
          </div>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Student Submitted Answer Sheet Banner -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black">
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
            class="px-3.5 py-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 bg-white border border-blue-300 rounded-lg shadow-sm inline-flex items-center gap-1.5"
          >
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download Student Answer Copy
          </a>
        </div>

        <form onsubmit="window.teacherPortal.saveEvaluation(event)" class="space-y-4 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Academic Marks (Max: ${asg ? asg.maximumMarks : 50})</label>
              <input 
                type="number" 
                id="eval-marks" 
                step="0.5" 
                min="0" 
                max="${asg ? asg.maximumMarks : 50}" 
                required 
                value="${submission.marksObtained !== null ? submission.marksObtained : ''}"
                placeholder="e.g. 42" 
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-emerald-800"
              >
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Platform Points (XP)</label>
              <input 
                type="number" 
                id="eval-points" 
                step="1" 
                min="0" 
                required 
                value="${submission.pointsAwarded !== undefined && submission.pointsAwarded !== null ? submission.pointsAwarded : (submission.marksObtained !== null ? Math.round(submission.marksObtained) : 50)}" 
                class="w-full px-3 py-2 border border-amber-300 bg-amber-50/30 rounded-lg text-xs font-bold text-amber-800"
                title="XP Points awarded to student for the Leaderboard"
              >
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Evaluation Status</label>
              <select id="eval-status" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold">
                <option value="Evaluated" selected>Evaluated (Checked & Returned)</option>
                <option value="Needs Revision">Needs Revision (Resubmit Copy)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Faculty Remarks & Step-by-Step Corrections</label>
            <textarea 
              id="eval-feedback" 
              rows="3" 
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" 
              placeholder="Provide constructive feedback on calculations, standards, and presentation..."
            >${submission.adminFeedback || ''}</textarea>
          </div>

          <!-- Upload Checked Copy PDF Section -->
          <div class="border-t border-slate-200 pt-4">
            <label class="block font-bold text-slate-900 mb-1">Upload Checked / Marked Copy (PDF)</label>
            <p class="text-[11px] text-slate-500 mb-3">Upload your evaluated copy with red ink markings. The student will be able to download this directly.</p>

            <div 
              class="border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 rounded-xl p-6 text-center cursor-pointer transition-colors"
              onclick="document.getElementById('checked-pdf-input').click()"
            >
              <input 
                type="file" 
                id="checked-pdf-input" 
                accept="application/pdf,.pdf" 
                class="hidden"
                onchange="window.teacherPortal.handleCheckedFileSelect(event)"
              >
              <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-2">
                <i data-lucide="check-circle-2" class="w-5 h-5"></i>
              </div>
              <p class="text-xs font-bold text-slate-800" id="checked-dropzone-text">Click to choose Checked Copy PDF or drag here</p>
              <span class="text-[11px] text-slate-500 block mt-0.5">Maximum size: 10 MB (.pdf)</span>
              
              <div id="checked-file-preview" class="hidden mt-2 inline-flex items-center gap-2 p-2 bg-white rounded border border-emerald-300 text-emerald-800 font-mono text-xs">
                <i data-lucide="file" class="w-4 h-4 text-emerald-600"></i>
                <span id="checked-filename-span"></span>
              </div>
            </div>

            ${submission.checkedCopyFileName ? `
              <div class="mt-2 text-xs text-slate-600 flex items-center justify-between">
                <span>Current checked copy: <strong class="text-emerald-700">${submission.checkedCopyFileName}</strong></span>
                <a href="${submission.checkedCopyPdfData}" download="${submission.checkedCopyFileName}" class="text-blue-600 hover:underline">Download Current</a>
              </div>
            ` : ''}
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm">
              Save & Return Evaluated Copy
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  handleCheckedFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      window.app.showToast('Validation Error: Only PDF files (.pdf) are allowed.', 'error');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      window.app.showToast('File too large: Max allowed size is 10 MB.', 'error');
      e.target.value = '';
      return;
    }

    this.selectedCheckedPdfFile = file;

    const preview = document.getElementById('checked-file-preview');
    const span = document.getElementById('checked-filename-span');
    const text = document.getElementById('checked-dropzone-text');

    if (preview && span) {
      span.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
      preview.classList.remove('hidden');
      if (text) text.classList.add('hidden');
    }
  }

  saveEvaluation(e) {
    e.preventDefault();
    const submissionId = this.activeGradingSubmissionId;
    const submission = window.store.getSubmissions().find(s => s.id === submissionId);
    if (!submission) return;

    const marks = parseFloat(document.getElementById('eval-marks').value);
    const pointsAwarded = parseFloat(document.getElementById('eval-points').value) || 0;
    const status = document.getElementById('eval-status').value;
    const feedback = document.getElementById('eval-feedback').value.trim();
    const currentUser = window.auth.getCurrentUser();

    submission.marksObtained = marks;
    submission.pointsAwarded = pointsAwarded;
    submission.status = status;
    submission.adminFeedback = feedback;
    submission.evaluatedBy = currentUser ? currentUser.name : 'Faculty Evaluator';
    submission.evaluatedAt = new Date().toISOString();

    const notifyStudent = () => {
      const asg = window.store.getAssignmentById(submission.assignmentId);
      window.store.addNotification({
        userId: submission.studentId,
        type: 'points_received',
        title: 'Paper Evaluated & Points Awarded',
        message: `Your paper "${asg ? asg.title : 'Test Paper'}" was checked by faculty! Marks: ${marks}/${asg ? asg.maximumMarks : 100}, Points: +${pointsAwarded} XP.`,
        link: 'assignments',
        metadata: { submissionId: submission.id }
      });
      // Record authoritative XP transaction in store
      if (window.store && typeof window.store.recordXpTransaction === 'function' && pointsAwarded > 0) {
        window.store.recordXpTransaction({
          idempotencyKey: `paper_submission_${submission.id}`,
          userId: submission.studentId,
          sourceType: 'paper_submission',
          sourceId: submission.assignmentId,
          activityName: asg ? asg.title : 'Test Paper Evaluation',
          points: pointsAwarded,
          resultStatus: `Score: ${marks}/${asg ? asg.maximumMarks : 100} M`,
          metadata: { marksObtained: marks, maximumMarks: asg ? asg.maximumMarks : 100, submissionId: submission.id }
        });
      }
      // Backend sync
      fetch('/api/papers/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser ? currentUser.token : ''}` },
        body: JSON.stringify(submission)
      }).catch(() => {});
    };

    // If new checked copy PDF file was selected, read and save base64
    if (this.selectedCheckedPdfFile) {
      const reader = new FileReader();
      reader.onload = () => {
        submission.checkedCopyFileName = this.selectedCheckedPdfFile.name;
        submission.checkedCopyPdfData = reader.result;
        window.store.updateSubmission(submission);
        notifyStudent();
        window.app.closeModal('admin-generic-modal');
        window.app.showToast(`Checked copy, marks (${marks}) and points (+${pointsAwarded} XP) returned to student!`, 'success');
        this.render();
      };
      reader.readAsDataURL(this.selectedCheckedPdfFile);
    } else {
      window.store.updateSubmission(submission);
      notifyStudent();
      window.app.closeModal('admin-generic-modal');
      window.app.showToast(`Evaluation saved. Marks: ${marks}, Points: +${pointsAwarded} XP`, 'success');
      this.render();
    }
  }

  openUploadTestModal() {
    const subjects = window.store.getSubjects();
    const modalContent = document.getElementById('admin-generic-modal-content');
    if (!modalContent) return;

    this.selectedQuestionPdfFile = null;

    modalContent.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <h3 class="text-base font-bold text-slate-900">Upload Test Question Paper (PDF)</h3>
          <button onclick="window.app.closeModal('admin-generic-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="window.teacherPortal.saveQuestionPaper(event)" class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Test / Assignment Title</label>
            <input type="text" id="tp-title" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Advanced Accounting Mock Test Paper 1">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Subject</label>
              <select id="tp-subject" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
                ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Chapter / Topic</label>
              <input type="text" id="tp-topic" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="e.g. Ind AS 110 Consolidation">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Maximum Marks</label>
              <input type="number" id="tp-marks" min="10" required value="100" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Submission Deadline</label>
              <input type="date" id="tp-deadline" required value="${new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Instructions / Description</label>
            <textarea id="tp-desc" rows="3" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs" placeholder="Guidelines for students..."></textarea>
          </div>

          <!-- Question Paper PDF File Input -->
          <div>
            <label class="block font-bold text-slate-900 mb-1">Upload Question Paper File (PDF)</label>
            <input 
              type="file" 
              id="tp-file" 
              accept="application/pdf,.pdf" 
              required
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50"
              onchange="window.teacherPortal.handleQuestionFileSelect(event)"
            >
            <span class="text-[11px] text-slate-400 mt-1 block">Students will download this PDF to solve the test.</span>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onclick="window.app.closeModal('admin-generic-modal')" class="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-6 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
              Upload & Publish Paper
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('admin-generic-modal');
  }

  handleQuestionFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      window.app.showToast('Validation Error: Only PDF files (.pdf) are allowed.', 'error');
      e.target.value = '';
      return;
    }
    this.selectedQuestionPdfFile = file;
  }

  saveQuestionPaper(e) {
    e.preventDefault();
    if (!this.selectedQuestionPdfFile) {
      window.app.showToast('Please select a Question Paper PDF.', 'warning');
      return;
    }

    const title = document.getElementById('tp-title').value.trim();
    const subjectId = document.getElementById('tp-subject').value;
    const topic = document.getElementById('tp-topic').value.trim();
    const maximumMarks = parseInt(document.getElementById('tp-marks').value, 10);
    const deadline = new Date(document.getElementById('tp-deadline').value).toISOString();
    const description = document.getElementById('tp-desc').value.trim();

    const reader = new FileReader();
    reader.onload = async () => {
      const newAsg = {
        id: 'asg-' + Date.now(),
        title,
        subjectId,
        topic,
        maximumMarks,
        deadline,
        description,
        isPublished: true,
        questionPdfName: this.selectedQuestionPdfFile.name,
        questionPdfData: reader.result,
        createdAt: new Date().toISOString()
      };

      try {
        const saved = await window.store.persistAssignment(newAsg);
        window.store.addAssignment({ ...newAsg, ...saved });
        window.app.closeModal('admin-generic-modal');
        window.app.showToast('Question Paper PDF published successfully for students!', 'success');
      } catch (err) {
        window.app.showToast(`Could not publish the paper: ${err.message}`, 'error');
      }
      this.render();
    };

    reader.readAsDataURL(this.selectedQuestionPdfFile);
  }
}

window.teacherPortal = new TeacherPortal();
