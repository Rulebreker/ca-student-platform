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

    // Check if users collection exists in Firebase
    this.db.ref('users').once('value').then(snap => {
      const val = snap.val();
      if (!val) {
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
    }).catch(err => {
      console.warn('[FirebaseSync] Check seed users warning:', err);
    });

    // Check if assignments collection exists
    this.db.ref('assignments').once('value').then(snap => {
      const val = snap.val();
      if (!val) {
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
    }).catch(err => {
      console.warn('[FirebaseSync] Check seed assignments warning:', err);
    });
  }

  attachListeners() {
    if (!this.db) return;

    // --- USERS REALTIME LISTENER ---
    this.db.ref('users').on('value', snap => {
      const val = snap.val();
      if (!val || this._isMergingUsers) return;

      const remoteUsers = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
      if (!remoteUsers.length) return;

      this.mergeRemoteUsers(remoteUsers);
    }, err => {
      console.warn('[FirebaseSync] Users listener error:', err);
    });

    // --- ASSIGNMENTS REALTIME LISTENER ---
    this.db.ref('assignments').on('value', snap => {
      const val = snap.val();
      if (!val || this._isMergingAssignments) return;

      const remoteAssignments = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
      if (!remoteAssignments.length) return;

      this.mergeRemoteAssignments(remoteAssignments);
    }, err => {
      console.warn('[FirebaseSync] Assignments listener error:', err);
    });

    // --- SUBMISSIONS REALTIME LISTENER ---
    this.db.ref('submissions').on('value', snap => {
      const val = snap.val();
      if (!val || this._isMergingSubmissions) return;

      const remoteSubs = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
      if (!remoteSubs.length) return;

      this.mergeRemoteSubmissions(remoteSubs);
    }, err => {
      console.warn('[FirebaseSync] Submissions listener error:', err);
    });
  }

  mergeRemoteUsers(remoteUsers) {
    if (!window.store) return;
    this._isMergingUsers = true;

    try {
      const localUsers = window.store.getUsers();
      let changed = false;
      let newStudentArrived = null;

      // Populate known set on first run
      if (this._knownUserIds.size === 0) {
        localUsers.forEach(u => this._knownUserIds.add(u.id));
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
      let changed = false;

      remoteAssignments.forEach(ra => {
        if (!ra || !ra.id) return;
        const idx = localAsgs.findIndex(la => la.id === ra.id);
        if (idx === -1) {
          localAsgs.unshift(ra);
          changed = true;
        } else {
          const existing = localAsgs[idx];
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
        window.store.saveAssignments(localAsgs);

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
}

// Global Singleton
window.firebaseSync = new FirebaseSyncManager();

// Automatically initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.firebaseSync.init());
} else {
  window.firebaseSync.init();
}
