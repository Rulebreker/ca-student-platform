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
    this._isMergingSubjects = false;
    this._isMergingNotifications = false;
    this._isMergingBookmarks = false;
    this._isMergingXpTransactions = false;
    this._isMergingReferrals = false;
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

      // 4. Attach dedicated real-time listener to current user session if authenticated
      const curUser = window.store ? window.store.getCurrentUser() : null;
      if (curUser && curUser.id) {
        this.attachCurrentUserListener(curUser.id);
      }
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

      // Check if subjects collection exists
      this.db.ref('subjects').once('value').then(sSnap => {
        if (!sSnap.val()) {
          console.info('[FirebaseSync] Seeding initial subjects into cloud database...');
          const localSubjs = window.store ? window.store.getSubjects() : [];
          if (localSubjs && localSubjs.length) {
            const map = {};
            localSubjs.forEach(s => {
              if (s && s.id) map[s.id] = s;
            });
            this.db.ref('subjects').set(map);
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

    // --- SUBJECTS REALTIME LISTENER ---
    this.db.ref('subjects').on('value', snap => {
      if (this._isMergingSubjects) return;
      const val = snap.val();
      const remoteSubjects = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteSubjects(remoteSubjects);
    }, err => {
      console.warn('[FirebaseSync] Subjects listener error:', err);
    });

    // --- NOTIFICATIONS REALTIME LISTENER ---
    this.db.ref('notifications').on('value', snap => {
      if (this._isMergingNotifications) return;
      const val = snap.val();
      const remoteNotifs = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteNotifications(remoteNotifs);
    }, err => {
      console.warn('[FirebaseSync] Notifications listener error:', err);
    });

    // --- BOOKMARKS REALTIME LISTENER ---
    this.db.ref('bookmarks').on('value', snap => {
      if (this._isMergingBookmarks) return;
      const val = snap.val();
      const remoteBms = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteBookmarks(remoteBms);
    }, err => {
      console.warn('[FirebaseSync] Bookmarks listener error:', err);
    });

    // --- XP TRANSACTIONS REALTIME LISTENER ---
    this.db.ref('xp_transactions').on('value', snap => {
      if (this._isMergingXpTransactions) return;
      const val = snap.val();
      const remoteTxs = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteXpTransactions(remoteTxs);
    }, err => {
      console.warn('[FirebaseSync] XP transactions listener error:', err);
    });

    // --- REFERRALS REALTIME LISTENER ---
    this.db.ref('referrals').on('value', snap => {
      if (this._isMergingReferrals) return;
      const val = snap.val();
      const remoteRefs = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      this.mergeRemoteReferrals(remoteRefs);
    }, err => {
      console.warn('[FirebaseSync] Referrals listener error:', err);
    });

    // --- XP RESET SETTINGS REALTIME LISTENER ---
    this.db.ref('xp_reset_settings').on('value', snap => {
      const val = snap.val();
      if (val && window.store && typeof window.store.saveXpResetSettings === 'function') {
        window.store.saveXpResetSettings(val);
        if (window.adminDashboard && window.adminDashboard.currentTab === 'xp-reset') {
          window.adminDashboard.renderXpResetSettings();
        }
      }
    });

    // --- XP RESET HISTORY REALTIME LISTENER ---
    this.db.ref('xp_reset_history').on('value', snap => {
      const val = snap.val();
      if (val && window.store) {
        const list = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
        list.sort((a, b) => new Date(b.resetAt || b.timestamp || 0) - new Date(a.resetAt || a.timestamp || 0));
        localStorage.setItem('excellenceca_xp_reset_history', JSON.stringify(list.slice(0, 100)));
        if (window.adminDashboard && window.adminDashboard.currentTab === 'xp-reset') {
          window.adminDashboard.renderXpResetSettings();
        }
      }
    });

    // --- SUBSCRIPTIONS REALTIME LISTENER ---
    this.db.ref('subscriptions').on('value', snap => {
      const val = snap.val();
      if (val && window.store) {
        window.store.saveSubscriptions(val);
        if (window.subscriptionManager && typeof window.subscriptionManager.onSubscriptionUpdate === 'function') {
          window.subscriptionManager.onSubscriptionUpdate();
        }
        if (window.studentDashboard && typeof window.studentDashboard.renderPassBadge === 'function') {
          window.studentDashboard.renderPassBadge();
        }
        if (window.adminDashboard && window.adminDashboard.currentTab === 'subscriptions') {
          window.adminDashboard.renderSubscriptions();
        }
      }
    });

    // --- PAYMENT SESSIONS REALTIME LISTENER ---
    this.db.ref('payment_sessions').on('value', snap => {
      const val = snap.val();
      if (val && window.store) {
        const sessions = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
        window.store.savePaymentSessions(sessions);
        if (window.subscriptionManager && typeof window.subscriptionManager.onPaymentSessionsUpdate === 'function') {
          window.subscriptionManager.onPaymentSessionsUpdate();
        }
        if (window.adminDashboard && window.adminDashboard.currentTab === 'payments') {
          window.adminDashboard.renderPaymentVerifications();
        }
      }
    });

    // --- PAYMENT CHANNELS REALTIME LISTENER ---
    this.db.ref('payment_channels').on('value', snap => {
      const val = snap.val();
      if (val && window.store) {
        const channels = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
        window.store.savePaymentChannels(channels);
        if (window.adminDashboard && window.adminDashboard.currentTab === 'payment-channels') {
          window.adminDashboard.renderPaymentChannels();
        }
      }
    });

    // --- SUBSCRIPTION PLANS REALTIME LISTENER ---
    this.db.ref('subscription_plans').on('value', snap => {
      const val = snap.val();
      if (val && window.store) {
        window.store.saveSubscriptionPlans(val);
        if (window.adminDashboard && window.adminDashboard.currentTab === 'plans-config') {
          window.adminDashboard.renderPlanConfig();
        }
      }
    });

    // --- ADMIN AUDIT LOGS REALTIME LISTENER ---
    this.db.ref('admin_audit_logs').on('value', snap => {
      const val = snap.val();
      if (val && window.store) {
        const logs = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
        window.store.saveAdminAuditLogs(logs);
        if (window.adminDashboard && window.adminDashboard.currentTab === 'audit-logs') {
          window.adminDashboard.renderAuditLogs();
        }
      }
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
            if (k === 'password' && !ru[k] && existing.password) return;
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

        // Real-time synchronization of current active user session
        const current = window.store ? window.store.getCurrentUser() : null;
        if (current && current.role === 'student') {
          const freshCurrent = localUsers.find(u => u.id === current.id);
          if (freshCurrent && (freshCurrent.isActive === false || freshCurrent.isDeleted === true)) {
            console.warn('[FirebaseSync] Logged-in student account was deleted or deactivated by admin. Revoking session.');
            if (window.auth && typeof window.auth.handleSessionRevoked === 'function') {
              const reason = freshCurrent.isActive === false ? 
                'Your account has been deactivated by the administrator.' : 
                'Your account has been deleted by the administrator.';
              window.auth.handleSessionRevoked(reason);
              return;
            }
          } else if (freshCurrent) {
            if (!freshCurrent.password && current.password) {
              freshCurrent.password = current.password;
            }
            window.store.setCurrentUser(freshCurrent);
            if (window.auth) window.auth.currentUser = freshCurrent;
            this.updateUserPointsUi(freshCurrent);
          }
        } else if (current) {
          const freshCurrent = localUsers.find(u => u.id === current.id);
          if (freshCurrent) {
            window.store.setCurrentUser(freshCurrent);
            if (window.auth) window.auth.currentUser = freshCurrent;
          }
        }

        // Real-time update for Student Dashboard & Profile
        if (window.app) {
          if (window.app.currentView === 'dashboard' && window.studentDashboard && typeof window.studentDashboard.render === 'function') {
            window.studentDashboard.render();
          }
          if (window.app.currentView === 'profile' && typeof window.app.renderProfilePage === 'function') {
            window.app.renderProfilePage();
          }
        }

        // Real-time update for Leaderboard
        if (window.leaderboardManager) {
          if (typeof window.leaderboardManager.calculateAllStandings === 'function') {
            window.leaderboardManager.calculateAllStandings();
          }
          if (window.app && window.app.currentView === 'leaderboard' && typeof window.leaderboardManager.render === 'function') {
            window.leaderboardManager.render();
          }
        }

        // Real-time update for Admin Dashboard
        if (window.adminDashboard && window.auth && window.auth.isAdmin()) {
          if (window.adminDashboard.currentTab === 'students') {
            window.adminDashboard.renderStudents();
          } else if (window.adminDashboard.currentTab === 'overview') {
            window.adminDashboard.renderOverview();
          } else if (window.adminDashboard.currentTab === 'xp-management') {
            if (window.adminDashboard._currentXpStudent) {
              window.adminDashboard._xpSearchStudent(window.adminDashboard._currentXpStudent.username || window.adminDashboard._currentXpStudent.id);
            }
            const tbody = document.getElementById('admin-xp-history-tbody');
            if (tbody && typeof window.adminDashboard._renderXpAuditRows === 'function') {
              tbody.innerHTML = window.adminDashboard._renderXpAuditRows();
            }
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

  mergeRemoteSubjects(remoteSubjects) {
    if (!window.store) return;
    this._isMergingSubjects = true;

    try {
      const localSubjs = window.store.getSubjects();
      const remoteIds = new Set(remoteSubjects.map(rs => rs && rs.id).filter(Boolean));
      let changed = false;

      // 1. Remove deleted subjects if remote list is provided
      let filteredSubjs = localSubjs.filter(ls => {
        if (remoteSubjects.length === 0) return true;
        return remoteIds.has(ls.id);
      });
      if (filteredSubjs.length !== localSubjs.length) {
        changed = true;
      }

      // 2. Add or update subjects from remote
      remoteSubjects.forEach(rs => {
        if (!rs || !rs.id) return;
        const idx = filteredSubjs.findIndex(ls => ls.id === rs.id);
        if (idx === -1) {
          filteredSubjs.push(rs);
          changed = true;
        } else {
          const existing = filteredSubjs[idx];
          let sModified = false;
          Object.keys(rs).forEach(k => {
            if (JSON.stringify(existing[k]) !== JSON.stringify(rs[k])) {
              existing[k] = rs[k];
              sModified = true;
            }
          });
          if (sModified) changed = true;
        }
      });

      if (changed) {
        window.store.saveSubjects(filteredSubjs);

        // Update Admin Dashboard Subjects tab if open
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'subjects') {
          window.adminDashboard.renderSubjects();
        }
        // Update Student Test filters if tests tab is open
        if (window.testEngine && typeof window.testEngine.renderTestList === 'function') {
          const curView = window.app ? window.app.currentView : '';
          if (curView === 'tests') {
            window.testEngine.renderTestList();
          }
        }
        // Update Student Papers filters if assignments tab is open
        if (window.assignmentPortal && typeof window.assignmentPortal.render === 'function') {
          const curView = window.app ? window.app.currentView : '';
          if (curView === 'assignments') {
            window.assignmentPortal.render();
          }
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging subjects:', e);
    } finally {
      this._isMergingSubjects = false;
    }
  }

  mergeRemoteNotifications(remoteNotifs) {
    if (!window.store) return;
    this._isMergingNotifications = true;

    try {
      const localNotifs = window.store.getNotifications();
      let changed = false;

      remoteNotifs.forEach(rn => {
        if (!rn || !rn.id) return;
        const idx = localNotifs.findIndex(ln => ln.id === rn.id);
        if (idx === -1) {
          localNotifs.unshift(rn);
          changed = true;
        } else {
          const existing = localNotifs[idx];
          let nModified = false;
          Object.keys(rn).forEach(k => {
            if (JSON.stringify(existing[k]) !== JSON.stringify(rn[k])) {
              existing[k] = rn[k];
              nModified = true;
            }
          });
          if (nModified) changed = true;
        }
      });

      if (changed) {
        localNotifs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        window.store.saveNotifications(localNotifs);

        if (window.app && typeof window.app.updateNotificationBadge === 'function') {
          window.app.updateNotificationBadge();
        }
        if (window.app && typeof window.app.renderNotificationsList === 'function') {
          window.app.renderNotificationsList();
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging notifications:', e);
    } finally {
      this._isMergingNotifications = false;
    }
  }

  mergeRemoteBookmarks(remoteBookmarks) {
    if (!window.store) return;
    this._isMergingBookmarks = true;

    try {
      const localBms = window.store.getBookmarks();
      const remoteIds = new Set(remoteBookmarks.map(rb => rb && (rb.id || `${rb.userId}_${rb.itemId}`)).filter(Boolean));
      let changed = false;

      // 1. Remove deleted bookmarks if remote list is provided
      let filteredBms = localBms.filter(lb => {
        if (remoteBookmarks.length === 0) return true;
        const key = lb.id || `${lb.userId}_${lb.itemId}`;
        return remoteIds.has(key);
      });
      if (filteredBms.length !== localBms.length) {
        changed = true;
      }

      // 2. Add or update bookmarks
      remoteBookmarks.forEach(rb => {
        if (!rb || (!rb.id && (!rb.userId || !rb.itemId))) return;
        const rbKey = rb.id || `${rb.userId}_${rb.itemId}`;
        const idx = filteredBms.findIndex(lb => (lb.id && lb.id === rb.id) || (lb.userId === rb.userId && lb.itemId === rb.itemId));
        if (idx === -1) {
          filteredBms.unshift(rb);
          changed = true;
        }
      });

      if (changed) {
        window.store.saveBookmarks(filteredBms);

        // Re-render student views if active
        if (window.app && window.app.currentView === 'tests' && window.testEngine && typeof window.testEngine.renderTestList === 'function') {
          window.testEngine.renderTestList();
        }
        if (window.app && window.app.currentView === 'assignments' && window.assignmentPortal && typeof window.assignmentPortal.render === 'function') {
          window.assignmentPortal.render();
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging bookmarks:', e);
    } finally {
      this._isMergingBookmarks = false;
    }
  }

  mergeRemoteXpTransactions(remoteTxs) {
    if (!window.store) return;
    this._isMergingXpTransactions = true;
    try {
      let localTxs = window.store.getXpTransactions();
      let changed = false;
      remoteTxs.forEach(rtx => {
        if (!rtx || !rtx.id) return;
        const idx = localTxs.findIndex(ltx => ltx.id === rtx.id || (ltx.idempotencyKey && rtx.idempotencyKey && ltx.idempotencyKey === rtx.idempotencyKey));
        if (idx === -1) {
          localTxs.unshift(rtx);
          changed = true;
        } else if (localTxs[idx].points !== rtx.points) {
          localTxs[idx] = { ...localTxs[idx], ...rtx };
          changed = true;
        }
      });
      if (changed) {
        localTxs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        window.store.saveXpTransactions(localTxs);
        if (window.app && typeof window.app.renderProfilePage === 'function') {
          const u = window.auth ? window.auth.getCurrentUser() : null;
          if (u && window.app.currentView === 'profile') window.app.renderProfilePage();
        }
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'xp-management') {
          const tbody = document.getElementById('admin-xp-history-tbody');
          if (tbody && typeof window.adminDashboard._renderXpAuditRows === 'function') {
            tbody.innerHTML = window.adminDashboard._renderXpAuditRows();
          }
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging XP transactions:', e);
    } finally {
      this._isMergingXpTransactions = false;
    }
  }

  mergeRemoteReferrals(remoteRefs) {
    if (!window.store) return;
    this._isMergingReferrals = true;
    try {
      let localRefs = window.store.getReferrals();
      let changed = false;
      remoteRefs.forEach(rr => {
        if (!rr || !rr.id) return;
        const idx = localRefs.findIndex(lr => lr.id === rr.id);
        if (idx === -1) {
          localRefs.unshift(rr);
          changed = true;
        } else {
          localRefs[idx] = { ...localRefs[idx], ...rr };
          changed = true;
        }
      });
      if (changed) {
        localRefs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        window.store.saveReferrals(localRefs);

        // Real-time update for student profile page (referral card & table)
        if (window.app && window.app.currentView === 'profile' && typeof window.app.renderProfilePage === 'function') {
          window.app.renderProfilePage();
        }
        // Real-time update for admin referral audit tab
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'referrals') {
          window.adminDashboard.renderReferrals();
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error merging referrals:', e);
    } finally {
      this._isMergingReferrals = false;
    }
  }

  attachCurrentUserListener(userId) {
    if (!this.db || !userId) return;
    this.detachUserListeners();

    try {
      this._currentUserRef = this.db.ref('users/' + userId);
      this._currentUserRef.on('value', snap => {
        const val = snap.val();
        const current = window.store ? window.store.getCurrentUser() : null;
        if (!current || current.id !== userId) return;

        // If snapshot is null, user might not yet exist in Firebase or is propagating; do not false-revoke active session
        if (!val) return;

        if (val.isActive === false || val.isDeleted === true) {
          console.warn('[FirebaseSync] Direct user listener detected deactivation/deletion for user:', userId);
          if (window.auth && typeof window.auth.handleSessionRevoked === 'function') {
            const reason = val.isActive === false ? 
              'Your account has been deactivated by the administrator.' : 
              'Your account has been deleted by the administrator.';
            window.auth.handleSessionRevoked(reason);
          }
          return;
        }

        // Account is active; update current user in store & auth preserving local password, and refresh points UI
        const merged = {
          ...current,
          ...val,
          password: current.password || val.password
        };
        window.store.setCurrentUser(merged);
        if (window.auth) window.auth.currentUser = merged;
        this.updateUserPointsUi(merged);
      }, err => {
        console.warn('[FirebaseSync] Current user listener error:', err);
      });
    } catch (e) {
      console.warn('[FirebaseSync] Could not attach current user listener:', e);
    }
  }

  detachUserListeners() {
    if (this._currentUserRef) {
      try {
        this._currentUserRef.off();
      } catch (e) {}
      this._currentUserRef = null;
    }
  }

  updateUserPointsUi(user) {
    if (!user) return;
    const refPointsEl = document.getElementById('profile-page-referral-points');
    if (refPointsEl) {
      refPointsEl.textContent = user.referralPoints !== undefined ? user.referralPoints : 0;
    }
    const refCountEl = document.getElementById('profile-page-referral-count');
    if (refCountEl) {
      refCountEl.textContent = user.referralCount !== undefined ? user.referralCount : 0;
    }
    if (window.app && window.app.currentView === 'profile' && typeof window.app.renderProfilePage === 'function') {
      window.app.renderProfilePage();
    }
    if (window.app && window.app.currentView === 'dashboard' && window.studentDashboard && typeof window.studentDashboard.render === 'function') {
      window.studentDashboard.render();
    }
  }

  // --- WRITE OPERATIONS TO CLOUD ---

  saveUser(user) {
    if (!this.db || !user || !user.id) return Promise.resolve();
    return this.db.ref('users/' + user.id).set(user).catch(err => {
      console.warn('[FirebaseSync] saveUser error:', err);
    });
  }

  saveReferral(refRecord) {
    if (!this.db || !refRecord || !refRecord.id) return Promise.resolve();
    return this.db.ref('referrals/' + refRecord.id).set(refRecord).catch(err => {
      console.warn('[FirebaseSync] saveReferral error:', err);
    });
  }

  saveXpResetSettings(settings) {
    if (!this.db || !settings) return Promise.resolve();
    return this.db.ref('xp_reset_settings').set(settings).catch(err => {
      console.warn('[FirebaseSync] saveXpResetSettings error:', err);
    });
  }

  saveXpResetEvent(event) {
    if (!this.db || !event || !event.id) return Promise.resolve();
    return this.db.ref('xp_reset_history/' + event.id).set(event).catch(err => {
      console.warn('[FirebaseSync] saveXpResetEvent error:', err);
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

  saveSubject(subject) {
    if (!this.db || !subject || !subject.id) return Promise.resolve();
    return this.db.ref('subjects/' + subject.id).set(subject).catch(err => {
      console.warn('[FirebaseSync] saveSubject error:', err);
    });
  }

  deleteSubject(subjectId) {
    if (!this.db || !subjectId) return Promise.resolve();
    return this.db.ref('subjects/' + subjectId).remove().catch(err => {
      console.warn('[FirebaseSync] deleteSubject error:', err);
    });
  }

  saveNotification(notification) {
    if (!this.db || !notification || !notification.id) return Promise.resolve();
    return this.db.ref('notifications/' + notification.id).set(notification).catch(err => {
      console.warn('[FirebaseSync] saveNotification error:', err);
    });
  }

  markNotificationRead(notificationId) {
    if (!this.db || !notificationId) return Promise.resolve();
    return this.db.ref('notifications/' + notificationId + '/read').set(true).catch(err => {
      console.warn('[FirebaseSync] markNotificationRead error:', err);
    });
  }

  markAllNotificationsRead(userId) {
    if (!this.db) return Promise.resolve();
    return this.db.ref('notifications').once('value').then(snap => {
      const val = snap.val();
      if (!val) return;
      const updates = {};
      Object.keys(val).forEach(k => {
        if (val[k] && (!userId || val[k].userId === userId)) {
          updates[`${k}/read`] = true;
        }
      });
      if (Object.keys(updates).length > 0) {
        return this.db.ref('notifications').update(updates);
      }
    }).catch(err => {
      console.warn('[FirebaseSync] markAllNotificationsRead error:', err);
    });
  }

  deleteNotification(notificationId) {
    if (!this.db || !notificationId) return Promise.resolve();
    return this.db.ref('notifications/' + notificationId).remove().catch(err => {
      console.warn('[FirebaseSync] deleteNotification error:', err);
    });
  }

  clearNotifications(userId) {
    if (!this.db || !userId) return Promise.resolve();
    return this.db.ref('notifications').once('value').then(snap => {
      const val = snap.val();
      if (!val) return;
      const updates = {};
      Object.keys(val).forEach(k => {
        if (val[k] && val[k].userId === userId) {
          updates[k] = null;
        }
      });
      if (Object.keys(updates).length > 0) {
        return this.db.ref('notifications').update(updates);
      }
    }).catch(err => {
      console.warn('[FirebaseSync] clearNotifications error:', err);
    });
  }

  saveXpTransaction(transaction) {
    if (!this.db || !transaction || !transaction.id) return Promise.resolve();
    return this.db.ref('xp_transactions/' + transaction.id).set(transaction).catch(err => {
      console.warn('[FirebaseSync] saveXpTransaction error:', err);
    });
  }

  saveBookmark(bookmark) {
    if (!this.db || !bookmark || !bookmark.id) return Promise.resolve();
    return this.db.ref('bookmarks/' + bookmark.id).set(bookmark).catch(err => {
      console.warn('[FirebaseSync] saveBookmark error:', err);
    });
  }

  deleteBookmark(bookmarkId) {
    if (!this.db || !bookmarkId) return Promise.resolve();
    return this.db.ref('bookmarks/' + bookmarkId).remove().catch(err => {
      console.warn('[FirebaseSync] deleteBookmark error:', err);
    });
  }

  saveSubscription(sub) {
    if (!this.db || !sub || !sub.userId) return Promise.resolve();
    return this.db.ref('subscriptions/' + sub.userId).set(sub).catch(err => {
      console.warn('[FirebaseSync] saveSubscription error:', err);
    });
  }

  savePaymentSession(session) {
    if (!this.db || !session || !session.paymentSessionId) return Promise.resolve();
    return this.db.ref('payment_sessions/' + session.paymentSessionId).set(session).catch(err => {
      console.warn('[FirebaseSync] savePaymentSession error:', err);
    });
  }

  savePaymentChannels(channels) {
    if (!this.db || !channels) return Promise.resolve();
    const map = {};
    channels.forEach(c => { if (c && c.id) map[c.id] = c; });
    return this.db.ref('payment_channels').set(map).catch(err => {
      console.warn('[FirebaseSync] savePaymentChannels error:', err);
    });
  }

  saveSubscriptionPlans(plans) {
    if (!this.db || !plans) return Promise.resolve();
    return this.db.ref('subscription_plans').set(plans).catch(err => {
      console.warn('[FirebaseSync] saveSubscriptionPlans error:', err);
    });
  }

  saveAdminAuditLog(log) {
    if (!this.db || !log || !log.id) return Promise.resolve();
    return this.db.ref('admin_audit_logs/' + log.id).set(log).catch(err => {
      console.warn('[FirebaseSync] saveAdminAuditLog error:', err);
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
