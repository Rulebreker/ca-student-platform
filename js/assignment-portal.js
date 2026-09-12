/**
 * assignment-portal.js - PDF Assignment Submissions & Management
 * Features:
 * - Formatted case descriptions & problem statements
 * - Strict PDF file type validation and size checking (<10MB)
 * - File upload via Drag & Drop or file dialog
 * - Submissions tracking, evaluation status, and admin feedback
 * - Privacy isolation (students only view their own submissions)
 */

class AssignmentPortal {
  constructor() {
    this.currentAssignmentId = null;
    this.selectedPdfFile = null;
  }

  render() {
    const user = window.auth.getCurrentUser();
    const assignments = window.store.getAssignments().filter(a => a.isPublished);
    const userSubmissions = user ? window.store.getSubmissionsByUser(user.id) : [];

    const listContainer = document.getElementById('assignment-list');
    if (!listContainer) return;

    if (assignments.length === 0) {
      listContainer.innerHTML = `
        <div class="col-span-full text-center py-16 bg-white rounded-xl border border-dashed border-slate-200 p-8">
          <i data-lucide="file-text" class="w-10 h-10 text-slate-400 mx-auto mb-3"></i>
          <h4 class="text-base font-bold text-slate-800">No assignments active</h4>
          <p class="text-xs text-slate-500 mt-1">Check back later for new practical case problems.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    listContainer.innerHTML = assignments.map(asg => {
      const subject = window.store.getSubjectById(asg.subjectId);
      const submission = userSubmissions.find(s => s.assignmentId === asg.id);
      const deadline = new Date(asg.deadline);
      const isPastDue = Date.now() > deadline.getTime();
      const deadlineStr = deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

      let statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Pending Submission</span>`;
      if (submission) {
        if (submission.status === 'Evaluated') {
          statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Evaluated (${submission.marksObtained}/${asg.maximumMarks} Marks)</span>`;
        } else if (submission.status === 'Needs Revision') {
          statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">Needs Revision</span>`;
        } else {
          statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">Submitted (Awaiting Grading)</span>`;
        }
      }

      return `
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                ${subject ? subject.name : 'CA Practical'}
              </span>
              ${statusBadge}
            </div>

            <h3 class="text-base font-bold text-slate-900 mb-2">${asg.title}</h3>
            <span class="text-xs text-slate-500 font-medium block mb-3">${asg.topic}</span>
            <div class="text-xs text-slate-600 line-clamp-3 mb-4 leading-relaxed">${asg.description.replace(/###/g, '').substring(0, 180)}...</div>
          </div>

          <div class="pt-4 border-t border-slate-100">
            <div class="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span class="flex items-center gap-1 ${isPastDue ? 'text-rose-600 font-bold' : ''}">
                <i data-lucide="calendar" class="w-3.5 h-3.5"></i> Due: ${deadlineStr}
              </span>
              <span class="font-bold text-slate-700">Max Marks: ${asg.maximumMarks}</span>
            </div>

            <button 
              onclick="window.assignmentPortal.openAssignmentModal('${asg.id}')"
              class="w-full py-2.5 text-xs font-bold rounded-lg ${
                submission 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
              } transition-colors"
            >
              ${submission ? 'View My Submission & Feedback' : 'Read Case & Submit PDF →'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.renderSubmissionsTable(userSubmissions);
    if (window.lucide) window.lucide.createIcons();
  }

  renderSubmissionsTable(userSubmissions) {
    const container = document.getElementById('my-submissions-table-container');
    if (!container) return;

    if (!userSubmissions || userSubmissions.length === 0) {
      container.innerHTML = `
        <p class="text-xs text-slate-400 py-4 text-center">You haven't submitted any assignments yet.</p>
      `;
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-3 px-4">Assignment</th>
              <th class="py-3 px-4">File Name</th>
              <th class="py-3 px-4">Submitted On</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4">Marks Awarded</th>
              <th class="py-3 px-4">Admin Feedback</th>
              <th class="py-3 px-4 text-right">Download</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${userSubmissions.map(sub => {
              const asg = window.store.getAssignmentById(sub.assignmentId);
              const dateStr = new Date(sub.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
              
              let statusPill = `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Submitted</span>`;
              if (sub.status === 'Evaluated') {
                statusPill = `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">Evaluated</span>`;
              } else if (sub.status === 'Needs Revision') {
                statusPill = `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-100 text-rose-800">Needs Revision</span>`;
              }

              return `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-4 font-semibold text-slate-900">${asg ? asg.title : 'CA Practical Problem'}</td>
                  <td class="py-3 px-4 text-xs font-mono text-slate-600">
                    <i data-lucide="file" class="w-3.5 h-3.5 inline text-rose-500 mr-1"></i>
                    ${sub.fileName}
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-600">${dateStr}</td>
                  <td class="py-3 px-4">${statusPill}</td>
                  <td class="py-3 px-4 font-bold ${sub.status === 'Evaluated' ? 'text-emerald-700' : 'text-slate-400'}">
                    ${sub.status === 'Evaluated' ? `${sub.marksObtained} / ${sub.maxMarks || asg.maximumMarks}` : '--'}
                  </td>
                  <td class="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                    ${sub.adminFeedback || '<span class="text-slate-400 italic">Evaluation pending</span>'}
                  </td>
                  <td class="py-3 px-4 text-right">
                    <a 
                      href="${sub.fileData}" 
                      download="${sub.fileName}"
                      class="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                    >
                      <i data-lucide="download" class="w-3.5 h-3.5"></i> PDF
                    </a>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  openAssignmentModal(asgId) {
    const asg = window.store.getAssignmentById(asgId);
    if (!asg) return;

    this.currentAssignmentId = asgId;
    this.selectedPdfFile = null;

    const user = window.auth.getCurrentUser();
    if (!user) {
      window.app.showAuthModal('login');
      return;
    }

    const subject = window.store.getSubjectById(asg.subjectId);
    const existingSubmission = window.store.getSubmissionsByUser(user.id).find(s => s.assignmentId === asg.id);

    const modalContent = document.getElementById('assignment-modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <!-- Header -->
        <div class="flex items-start justify-between border-b border-slate-200 pb-4 mb-6">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                ${subject ? subject.name : 'CA Practical'}
              </span>
              <span class="text-xs text-slate-500">• Max Marks: ${asg.maximumMarks}</span>
            </div>
            <h3 class="text-lg font-bold text-slate-900">${asg.title}</h3>
            <span class="text-xs text-slate-500 font-medium">Topic: ${asg.topic}</span>
          </div>
          <button onclick="window.app.closeModal('assignment-modal')" class="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Case Problem Description with Formatted Text -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6 text-xs leading-relaxed text-slate-800 space-y-3">
          <h4 class="font-bold text-slate-900 text-sm uppercase tracking-wider mb-2">Case Study Instructions:</h4>
          <div class="whitespace-pre-line">${asg.description}</div>
        </div>

        ${existingSubmission ? `
          <!-- Previous Submission Card -->
          <div class="border border-emerald-200 bg-emerald-50/50 rounded-xl p-5 mb-6">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <i data-lucide="check-circle" class="w-5 h-5 text-emerald-600"></i>
                <h4 class="text-sm font-bold text-emerald-900">Your Submitted Solution</h4>
              </div>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Status: ${existingSubmission.status}
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700 bg-white p-3.5 rounded-lg border border-emerald-100 mb-3">
              <div>
                <span class="text-slate-400 block text-[11px]">File Name:</span>
                <span class="font-mono font-medium truncate block">${existingSubmission.fileName}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[11px]">Submitted On:</span>
                <span>${new Date(existingSubmission.submittedAt).toLocaleString()}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[11px]">Marks Awarded:</span>
                <span class="font-bold text-emerald-700">
                  ${existingSubmission.status === 'Evaluated' ? `${existingSubmission.marksObtained} / ${asg.maximumMarks}` : 'Awaiting Faculty Grading'}
                </span>
              </div>
            </div>

            ${existingSubmission.adminFeedback ? `
              <div class="bg-white p-3 rounded-lg border border-emerald-100 text-xs">
                <span class="font-bold text-slate-800 block mb-1">Faculty / Evaluator Feedback:</span>
                <p class="text-slate-700 italic">"${existingSubmission.adminFeedback}"</p>
              </div>
            ` : ''}

            <div class="mt-4 flex items-center justify-between">
              <a 
                href="${existingSubmission.fileData}" 
                download="${existingSubmission.fileName}"
                class="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800"
              >
                <i data-lucide="download" class="w-4 h-4"></i> Download Submitted PDF
              </a>
              <span class="text-[11px] text-slate-500">You can upload a new PDF below to replace your previous solution.</span>
            </div>
          </div>
        ` : ''}

        <!-- PDF Upload Form -->
        <div class="border-t border-slate-200 pt-6">
          <h4 class="text-sm font-bold text-slate-900 mb-2">Upload Solution Document (PDF Only)</h4>
          <p class="text-xs text-slate-500 mb-4">Ensure your work includes working notes and schedules. Maximum file size: 10 MB.</p>

          <!-- Dropzone -->
          <div 
            id="pdf-dropzone"
            class="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-xl p-8 text-center transition-all cursor-pointer"
            onclick="document.getElementById('pdf-file-input').click()"
          >
            <input 
              type="file" 
              id="pdf-file-input" 
              accept="application/pdf,.pdf" 
              class="hidden"
              onchange="window.assignmentPortal.handleFileSelect(event)"
            >
            <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 mx-auto flex items-center justify-center mb-3">
              <i data-lucide="upload-cloud" class="w-6 h-6"></i>
            </div>
            <div id="dropzone-text">
              <p class="text-sm font-bold text-slate-800">Click to choose a PDF or drag and drop here</p>
              <p class="text-xs text-slate-500 mt-1">Accepts standard .pdf files up to 10MB</p>
            </div>
            <div id="file-preview-area" class="hidden mt-3 p-3 bg-white border border-blue-200 rounded-lg inline-flex items-center gap-3">
              <i data-lucide="file" class="w-5 h-5 text-rose-500"></i>
              <div class="text-left">
                <span id="preview-filename" class="text-xs font-bold text-slate-900 block font-mono"></span>
                <span id="preview-filesize" class="text-[11px] text-slate-500 block"></span>
              </div>
            </div>
          </div>

          <div class="mt-6 flex items-center justify-end gap-3">
            <button 
              onclick="window.app.closeModal('assignment-modal')"
              class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button 
              onclick="window.assignmentPortal.submitPdfSolution()"
              id="btn-submit-pdf"
              class="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              ${existingSubmission ? 'Re-upload & Update Solution' : 'Submit Assignment →'}
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.app.openModal('assignment-modal');
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Strict PDF validation
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      window.app.showToast('Validation Failed: Only PDF files (.pdf) are allowed.', 'error');
      e.target.value = '';
      return;
    }

    // Size check (max 10MB)
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      window.app.showToast('File too large: Maximum file size allowed is 10 MB.', 'error');
      e.target.value = '';
      return;
    }

    this.selectedPdfFile = file;

    // Update Dropzone UI
    const previewArea = document.getElementById('file-preview-area');
    const previewName = document.getElementById('preview-filename');
    const previewSize = document.getElementById('preview-filesize');
    const dropzoneText = document.getElementById('dropzone-text');

    if (previewArea && previewName && previewSize) {
      previewName.textContent = file.name;
      previewSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB • Valid PDF`;
      previewArea.classList.remove('hidden');
      if (dropzoneText) dropzoneText.classList.add('hidden');
    }
  }

  submitPdfSolution() {
    if (!this.selectedPdfFile) {
      window.app.showToast('Please select a valid PDF file before submitting.', 'warning');
      return;
    }

    const user = window.auth.getCurrentUser();
    if (!user) return;

    const asg = window.store.getAssignmentById(this.currentAssignmentId);
    if (!asg) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result;

      const submission = {
        id: 'subm-' + Date.now(),
        assignmentId: asg.id,
        studentId: user.id,
        studentName: user.name,
        fileName: this.selectedPdfFile.name,
        fileSizeKb: Math.round(this.selectedPdfFile.size / 1024),
        fileData: base64Data,
        submittedAt: new Date().toISOString(),
        status: 'Submitted',
        marksObtained: null,
        maxMarks: asg.maximumMarks,
        adminFeedback: null,
        evaluatedBy: null,
        evaluatedAt: null
      };

      window.store.addSubmission(submission);
      window.app.closeModal('assignment-modal');
      window.app.showToast('PDF solution uploaded successfully! Faculty will review and grade.', 'success');
      this.render();
    };

    reader.readAsDataURL(this.selectedPdfFile);
  }
}

window.assignmentPortal = new AssignmentPortal();
