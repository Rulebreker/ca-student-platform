/**
 * firebase-sync.js - Real-time Cross-Device Cloud Synchronization for ExcellenceCA
 * Powered by Google Firebase Realtime Database
 * 
 * Features:
 * - Instant synchronization of registered students across phones, tablets, and laptops
 * - Real-time PDF question paper distribution from Admin to Students
 * - Live student submission and faculty grading synchronization
 * - Resilient offline fallback to localStorage when disconnected
 */

class FirebaseSyncManager {
  constructor() {
    this.isInitialized = false;
    this.isConnected = false;
    this.db = null;
    this._isMergingUsers = false;
    this._isMergingAssignments = false;
    this._isMergingSubmissions = false;
    this._isMergingTests = false;
    this._isMergingQuestions = false;
    this._knownUserIds = new Set();
  }

  init() {
    if (this.isInitialized) return;

    if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
      console.info('[FirebaseSync] Firebase SDK or config not present. Operating in local storage mode.');
      return;
    }

    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      this.db = firebase.database();
      this.isInitialized = true;
      console.info('[FirebaseSync] Initialized successfully with project:', window.FIREBASE_CONFIG.projectId);

      // 1. Connection status listener
      this.db.ref('.info/connected').on('value', snap => {
        this.isConnected = snap.val() === true;
        this.updateConnectionUi();
      });

      // 2. Initial seed migration if Firebase RTDB is completely fresh
      this.checkAndSeedDatabase();

      // 3. Setup real-time listeners for all collections
      this.attachListeners();
    } catch (err) {
      console.error('[FirebaseSync] Initialization error:', err);
    }
  }

  updateConnectionUi() {
    const badges = document.querySelectorAll('.cloud-sync-indicator');
    badges.forEach(badge => {
      if (this.isConnected) {
        badge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Cloud Sync: Live Connected
          </span>
        `;
      } else {
        badge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
            Cloud Sync: Connecting...
          </span>
        `;
      }
    });
  }

  checkAndSeedDatabase() {
    if (!this.db) return;

    // Check meta to see if cloud database has already been initialized
    this.db.ref('meta/initialized').once('value').then(snap => {
      if (snap.val() === true) {
        // Cloud database is already initialized; never overwrite or resurrect deleted items
        return;
      }

      console.info('[FirebaseSync] Initializing fresh cloud database...');
      this.db.ref('meta').set({ initialized: true, version: 2 });

      // Check if users collection exists in Firebase
      this.db.ref('users').once('value').then(userSnap => {
        if (!userSnap.val()) {
          console.info('[FirebaseSync] Seeding initial users into cloud database...');
          const localUsers = window.store ? window.store.getUsers() : [];
          if (localUsers && localUsers.length) {
            const map = {};
            localUsers.forEach(u => {
              if (u && u.id) map[u.id] = u;
            });
            this.db.ref('users').set(map);
          }
        }
      });

      // Check if assignments collection exists
      this.db.ref('assignments').once('value').then(asgSnap => {
        if (!asgSnap.val()) {
          console.info('[FirebaseSync] Seeding initial test papers into cloud database...');
          const localAsgs = window.store ? window.store.getAssignments() : [];
          if (localAsgs && localAsgs.length) {
            const map = {};
            localAsgs.forEach(a => {
              if (a && a.id) map[a.id] = a;
            });
            this.db.ref('assignments').set(map);
          }
        }
      });

      // Check if tests collection exists
      this.db.ref('tests').once('value').then(tstSnap => {
        if (!tstSnap.val()) {
          console.info('[FirebaseSync] Seeding initial mock tests into cloud database...');
          const localTests = window.store ? window.store.getTests() : [];
          if (localTests && localTests.length) {
            const map = {};
            localTests.forEach(t => {
              if (t && t.id) map[t.id] = t;
            });
            this.db.ref('tests').set(map);
          }
        }
      });

      // Check if questions collection exists
      this.db.ref('questions').once('value').then(qSnap => {
        if (!qSnap.val()) {
          console.info('[FirebaseSync] Seeding initial questions into cloud database...');
          const localQs = window.store ? window.store.getQuestions() : [];
          if (localQs && localQs.length) {
            const map = {};
            localQs.forEach(q => {
              if (q && q.id) map[q.id] = q;
            });
            this.db.ref('questions').set(map);
          }
        }
      });
    }).catch(err => {
      console.warn('[FirebaseSync] Check seed warning:', err);
    });
  }

  attachListeners() {
    if (!this.db) return;

    // --- USERS REALTIME LISTENER ---
    this.db.ref('users').on('value', snap => {
      if (this._isMergingUsers) return;
      const val = snap.val();
      const remoteUsers = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteUsers(remoteUsers);
    }, err => {
      console.warn('[FirebaseSync] Users listener error:', err);
    });

    // --- ASSIGNMENTS REALTIME LISTENER ---
    this.db.ref('assignments').on('value', snap => {
      if (this._isMergingAssignments) return;
      const val = snap.val();
      const remoteAssignments = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteAssignments(remoteAssignments);
    }, err => {
      console.warn('[FirebaseSync] Assignments listener error:', err);
    });

    // --- SUBMISSIONS REALTIME LISTENER ---
    this.db.ref('submissions').on('value', snap => {
      if (this._isMergingSubmissions) return;
      const val = snap.val();
      const remoteSubs = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteSubmissions(remoteSubs);
    }, err => {
      console.warn('[FirebaseSync] Submissions listener error:', err);
    });

    // --- TESTS REALTIME LISTENER ---
    this.db.ref('tests').on('value', snap => {
      if (this._isMergingTests) return;
      const val = snap.val();
      const remoteTests = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteTests(remoteTests);
    }, err => {
      console.warn('[FirebaseSync] Tests listener error:', err);
    });

    // --- QUESTIONS REALTIME LISTENER ---
    this.db.ref('questions').on('value', snap => {
      if (this._isMergingQuestions) return;
      const val = snap.val();
      const remoteQs = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteQuestions(remoteQs);
    }, err => {
      console.warn('[FirebaseSync] Questions listener error:', err);
    });
  }

  mergeRemoteUsers(remoteUsers) {
    if (!window.store) return;
    this._isMergingUsers = true;

    try {
      let localUsers = window.store.getUsers();
      let changed = false;
      let newStudentArrived = null;

      // Populate known set on first run
      if (this._knownUserIds.size === 0) {
        localUsers.forEach(u => this._knownUserIds.add(u.id));
      }

      // Synchronize deleted student accounts
      if (remoteUsers.length > 0) {
        const remoteIds = new Set(remoteUsers.map(ru => ru && ru.id).filter(Boolean));
        const originalCount = localUsers.length;
        localUsers = localUsers.filter(lu => {
          if (!lu || !lu.id) return false;
          if (lu.role === 'admin' || lu.id.includes('admin')) return true;
          return remoteIds.has(lu.id);
        });
        if (localUsers.length !== originalCount) {
          changed = true;
        }
      }

      remoteUsers.forEach(ru => {
        if (!ru || !ru.id) return;
        const idx = localUsers.findIndex(lu => lu.id === ru.id || (lu.email && ru.email && lu.email.toLowerCase() === ru.email.toLowerCase()));
        if (idx === -1) {
          localUsers.unshift(ru);
          changed = true;
          if (!this._knownUserIds.has(ru.id)) {
            this._knownUserIds.add(ru.id);
            if (ru.role === 'student') {
              newStudentArrived = ru;
            }
          }
        } else {
          // Update if changed
          const existing = localUsers[idx];
          let userModified = false;
          Object.keys(ru).forEach(k => {
            if (JSON.stringify(existing[k]) !== JSON.stringify(ru[k])) {
              existing[k] = ru[k];
              userModified = true;
            }
          });
          if (userModified) changed = true;
        }
      });

      if (changed) {
        // Sort newest first
        localUsers.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        window.store.saveUsers(localUsers);

        // Notify Admin Dashboard if currently rendered
        if (window.adminDashboard && window.auth && window.auth.isAdmin()) {
          if (window.adminDashboard.currentTab === 'students') {
            window.adminDashboard.renderStudents();
          } else if (window.adminDashboard.currentTab === 'overview') {
            window.adminDashboard.renderOverview();
          }
          if (newStudentArrived && window.app && window.app.showToast) {
            window.app.showToast(`New Student Registered Live: ${newStudentArrived.name} (${newStudentArrived.caLevel || 'CA'})`, 'info');
          }
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging users:', e);
    } finally {
      this._isMergingUsers = false;
    }
  }

  mergeRemoteAssignments(remoteAssignments) {
    if (!window.store) return;
    this._isMergingAssignments = true;

    try {
      const localAsgs = window.store.getAssignments();
      const remoteIds = new Set(remoteAssignments.map(ra => ra && ra.id).filter(Boolean));
      let changed = false;

      // 1. Remove local assignments that were deleted in Firebase
      let filteredAsgs = localAsgs.filter(la => remoteIds.has(la.id));
      if (filteredAsgs.length !== localAsgs.length) {
        changed = true;
      }

      // 2. Add or update assignments from remote
      remoteAssignments.forEach(ra => {
        if (!ra || !ra.id) return;
        const idx = filteredAsgs.findIndex(la => la.id === ra.id);
        if (idx === -1) {
          filteredAsgs.unshift(ra);
          changed = true;
        } else {
          const existing = filteredAsgs[idx];
          let asgModified = false;
          Object.keys(ra).forEach(k => {
            if (JSON.stringify(existing[k]) !== JSON.stringify(ra[k])) {
              existing[k] = ra[k];
              asgModified = true;
            }
          });
          if (asgModified) changed = true;
        }
      });

      if (changed) {
        window.store.saveAssignments(filteredAsgs);

        // Re-render student assignment portal if active
        if (window.assignmentPortal && typeof window.assignmentPortal.render === 'function') {
          const curView = window.app ? window.app.currentView : '';
          if (curView === 'assignments') {
            window.assignmentPortal.render();
          }
        }

        // Re-render admin papers tab if active
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'papers') {
          window.adminDashboard.renderTestPapers();
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging assignments:', e);
    } finally {
      this._isMergingAssignments = false;
    }
  }

  mergeRemoteSubmissions(remoteSubs) {
    if (!window.store) return;
    this._isMergingSubmissions = true;

    try {
      const localSubs = window.store.getSubmissions();
      let changed = false;

      remoteSubs.forEach(rs => {
        if (!rs || !rs.id) return;
        const idx = localSubs.findIndex(ls => ls.id === rs.id);
        if (idx === -1) {
          localSubs.unshift(rs);
          changed = true;
        } else {
          const existing = localSubs[idx];
          let subModified = false;
          Object.keys(rs).forEach(k => {
            if (JSON.stringify(existing[k]) !== JSON.stringify(rs[k])) {
              existing[k] = rs[k];
              subModified = true;
            }
          });
          if (subModified) changed = true;
        }
      });

      if (changed) {
        window.store.saveSubmissions(localSubs);

        // Re-render grading center if admin or teacher
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'grading') {
          window.adminDashboard.renderGradingCenter();
        }
        if (window.teacherPortal && window.auth && window.auth.isTeacher()) {
          window.teacherPortal.render();
        }
        if (window.assignmentPortal && typeof window.assignmentPortal.renderSubmittedAssignments === 'function') {
          window.assignmentPortal.renderSubmittedAssignments();
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging submissions:', e);
    } finally {
      this._isMergingSubmissions = false;
    }
  }

  mergeRemoteTests(remoteTests) {
    if (!window.store) return;
    this._isMergingTests = true;

    try {
      const localTests = window.store.getTests();
      const remoteIds = new Set(remoteTests.map(rt => rt && rt.id).filter(Boolean));
      let changed = false;

      // 1. Remove any local tests that were deleted in Firebase
      let filteredTests = localTests.filter(lt => remoteIds.has(lt.id));
      if (filteredTests.length !== localTests.length) {
        changed = true;
      }

      // 2. Add or update tests from remote
      remoteTests.forEach(rt => {
        if (!rt || !rt.id) return;
        const idx = filteredTests.findIndex(lt => lt.id === rt.id);
        if (idx === -1) {
          filteredTests.unshift(rt);
          changed = true;
        } else {
          const existing = filteredTests[idx];
          let testModified = false;
          Object.keys(rt).forEach(k => {
            if (JSON.stringify(existing[k]) !== JSON.stringify(rt[k])) {
              existing[k] = rt[k];
              testModified = true;
            }
          });
          if (testModified) changed = true;
        }
      });

      if (changed) {
        window.store.saveTests(filteredTests);

        // Re-render student MCQ test list if student is viewing tests
        if (window.testEngine && typeof window.testEngine.renderTestList === 'function') {
          const curView = window.app ? window.app.currentView : '';
          if (curView === 'tests') {
            window.testEngine.renderTestList();
          }
        }

        // Re-render admin MCQ tests tab if admin is viewing it
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'mcq-tests') {
          window.adminDashboard.renderMCQTests();
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging tests:', e);
    } finally {
      this._isMergingTests = false;
    }
  }

  mergeRemoteQuestions(remoteQuestions) {
    if (!window.store) return;
    this._isMergingQuestions = true;

    try {
      const localQs = window.store.getQuestions();
      const remoteIds = new Set(remoteQuestions.map(rq => rq && rq.id).filter(Boolean));
      let changed = false;

      // 1. Remove any local questions that were deleted in Firebase
      let filteredQs = localQs.filter(lq => remoteIds.has(lq.id));
      if (filteredQs.length !== localQs.length) {
        changed = true;
      }

      // 2. Add or update questions from remote
      remoteQuestions.forEach(rq => {
        if (!rq || !rq.id) return;
        const idx = filteredQs.findIndex(lq => lq.id === rq.id);
        if (idx === -1) {
          filteredQs.push(rq);
          changed = true;
        } else {
          const existing = filteredQs[idx];
          let qModified = false;
          Object.keys(rq).forEach(k => {
            if (JSON.stringify(existing[k]) !== JSON.stringify(rq[k])) {
              existing[k] = rq[k];
              qModified = true;
            }
          });
          if (qModified) changed = true;
        }
      });

      if (changed) {
        window.store.saveQuestions(filteredQs);

        // If admin is currently in question builder for a test, update view
        if (window.adminDashboard && window.adminDashboard.activeTestQuestionsId) {
          window.adminDashboard.openQuestionBuilder(window.adminDashboard.activeTestQuestionsId);
        }

        // If student is viewing tests, refresh question count / test details
        if (window.testEngine && typeof window.testEngine.renderTestList === 'function') {
          const curView = window.app ? window.app.currentView : '';
          if (curView === 'tests') {
            window.testEngine.renderTestList();
          }
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging questions:', e);
    } finally {
      this._isMergingQuestions = false;
    }
  }

  // --- WRITE OPERATIONS TO CLOUD ---

  saveUser(user) {
    if (!this.db || !user || !user.id) return Promise.resolve();
    return this.db.ref('users/' + user.id).set(user).catch(err => {
      console.warn('[FirebaseSync] saveUser error:', err);
    });
  }

  deleteUser(userId) {
    if (!this.db || !userId) return Promise.resolve();
    return this.db.ref('users/' + userId).remove().catch(err => {
      console.warn('[FirebaseSync] deleteUser error:', err);
    });
  }

  saveAssignment(assignment) {
    if (!this.db || !assignment || !assignment.id) return Promise.resolve();
    return this.db.ref('assignments/' + assignment.id).set(assignment).catch(err => {
      console.warn('[FirebaseSync] saveAssignment error:', err);
    });
  }

  deleteAssignment(assignmentId) {
    if (!this.db || !assignmentId) return Promise.resolve();
    return this.db.ref('assignments/' + assignmentId).remove().catch(err => {
      console.warn('[FirebaseSync] deleteAssignment error:', err);
    });
  }

  saveSubmission(submission) {
    if (!this.db || !submission || !submission.id) return Promise.resolve();
    return this.db.ref('submissions/' + submission.id).set(submission).catch(err => {
      console.warn('[FirebaseSync] saveSubmission error:', err);
    });
  }

  saveTest(test) {
    if (!this.db || !test || !test.id) return Promise.resolve();
    return this.db.ref('tests/' + test.id).set(test).catch(err => {
      console.warn('[FirebaseSync] saveTest error:', err);
    });
  }

  deleteTest(testId) {
    if (!this.db || !testId) return Promise.resolve();
    return this.db.ref('tests/' + testId).remove().then(() => {
      // Also cascade delete all questions with this testId in Firebase
      return this.db.ref('questions').once('value').then(snap => {
        const val = snap.val();
        if (!val) return;
        const updates = {};
        Object.keys(val).forEach(key => {
          if (val[key] && val[key].testId === testId) {
            updates[key] = null;
          }
        });
        if (Object.keys(updates).length > 0) {
          return this.db.ref('questions').update(updates);
        }
      });
    }).catch(err => {
      console.warn('[FirebaseSync] deleteTest error:', err);
    });
  }

  saveQuestion(question) {
    if (!this.db || !question || !question.id) return Promise.resolve();
    return this.db.ref('questions/' + question.id).set(question).catch(err => {
      console.warn('[FirebaseSync] saveQuestion error:', err);
    });
  }

  deleteQuestion(questionId) {
    if (!this.db || !questionId) return Promise.resolve();
    return this.db.ref('questions/' + questionId).remove().catch(err => {
      console.warn('[FirebaseSync] deleteQuestion error:', err);
    });
  }
}

// Global Singleton
window.firebaseSync = new FirebaseSyncManager();

// Automatically initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.firebaseSync.init());
} else {
  window.firebaseSync.init();
}
