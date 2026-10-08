/**
 * server-sync.js - Server-backed data refresh for ExcellenceCA
 *
 * All shared data lives on the server (MongoDB Atlas); the browser refreshes it by polling authenticated API endpoints every
 * POLL_INTERVAL_MS while the tab is visible (the timer is stopped while it is hidden), when the tab
 * becomes visible again, and on demand (serverSync.refreshNow()).
 * The merge functions below merge a server list into the local store and re-render the affected views.
 * Session revocation is handled by the auth.js session watchdog (/api/auth/verify); a 401/403 from a
 * sync request triggers an immediate check.
 *
 * This is the single tab-visibility handler for background refreshes: on becoming visible (at most once
 * per VISIBILITY_REFRESH_COOLDOWN_MS) it syncs, verifies the session and recovers an open payment session.
 */

const SERVER_SYNC_POLL_INTERVAL_MS = 120000;
const VISIBILITY_REFRESH_COOLDOWN_MS = 60000;
// Admin-only data is synced only while the admin view is open (audit logs only on their own tab)
const ADMIN_AUDIT_LOG_TAB = 'audit-logs';

class ServerSyncManager {
  constructor() {
    this.isInitialized = false;
    this._pollTimer = null;
    this._inFlight = false;
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
    this._profileRenderTimer = null;
    this._running = false;
    this._lastRefreshAt = 0;
    this._lastVisibilityRefreshAt = 0;
    this._lastAdminRefreshAt = 0;
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') this._onTabVisible();
      else this._clearTimer();   // hidden tabs make no periodic requests
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
    this.start();
  }

  start() {
    this._running = true;
    this.refreshNow();
    this._scheduleTimer();
  }

  stop() {
    this._running = false;
    this._clearTimer();
  }

  _scheduleTimer() {
    this._clearTimer();
    if (!this._running || document.hidden) return;
    this._pollTimer = setInterval(() => {
      if (document.hidden) { this._clearTimer(); return; }
      this.refreshNow();
    }, SERVER_SYNC_POLL_INTERVAL_MS);
  }

  _clearTimer() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = null;
  }

  /** The one visibility refresh path: sync, session check and payment-session recovery, with a cooldown. */
  _onTabVisible() {
    if (!this._running) return;
    this._scheduleTimer();
    // polled admin tab (subscriptions / payments): one immediate refresh, own 60 s cooldown
    if (window.adminDashboard && typeof window.adminDashboard.onBrowserTabVisible === 'function') {
      window.adminDashboard.onBrowserTabVisible();
    }
    const now = Date.now();
    if (now - Math.max(this._lastRefreshAt, this._lastVisibilityRefreshAt) < VISIBILITY_REFRESH_COOLDOWN_MS) return;
    this._lastVisibilityRefreshAt = now;
    this.refreshNow();   // also refreshes the student's subscription (syncMySubscription)
    if (window.auth && typeof window.auth.verifySessionNow === 'function') window.auth.verifySessionNow();
    if (window.subscriptionManager && typeof window.subscriptionManager.checkAndRecoverActiveSession === 'function') {
      window.subscriptionManager.checkAndRecoverActiveSession();
    }
  }

  _authHeaders() {
    const user = window.store ? window.store.getCurrentUser() : null;
    const token = user ? (user.token || '') : '';
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async _get(path) {
    try {
      const resp = await fetch(`${path}${path.includes('?') ? '&' : '?'}_t=${Date.now()}`, { headers: this._authHeaders() });
      if (resp.status === 401 || resp.status === 403) {
        // the session may have been revoked: let the auth watchdog check (and sign out) right away
        if (window.auth && typeof window.auth.verifySessionNow === 'function') window.auth.verifySessionNow();
      }
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null; // offline: keep the local copy
    }
  }

  _adminViewOpen() {
    return !!(window.app && window.app.currentView === 'admin');
  }

  /** Pull shared data from the server and merge it into the local store. */
  async refreshNow() {
    if (this._inFlight || !window.store) return;
    const user = window.store.getCurrentUser();
    if (!user || !user.id) return;
    this._inFlight = true;
    this._lastRefreshAt = Date.now();
    try {
      const isAdmin = user.role === 'admin';
      const [tests, papers, subjects] = await Promise.all([
        this._get('/api/tests'),
        this._get('/api/papers'),
        this._get('/api/subjects'),
      ]);
      if (tests && Array.isArray(tests.tests)) this.mergeRemoteTests(tests.tests);
      if (papers && Array.isArray(papers.papers)) this.mergeRemoteAssignments(papers.papers);
      if (subjects && Array.isArray(subjects.subjects)) this.mergeRemoteSubjects(subjects.subjects);

      if (isAdmin) {
        if (this._adminViewOpen()) {
          this._lastAdminRefreshAt = Date.now();
          const onAuditTab = window.adminDashboard && window.adminDashboard.currentTab === ADMIN_AUDIT_LOG_TAB;
          const [users, submissions, audit, xpReset] = await Promise.all([
            this._get('/api/admin/users'),
            this._get('/api/papers/submissions'),
            onAuditTab ? this._get('/api/admin/audit-logs') : Promise.resolve(null),
            this._get('/api/admin/xp-reset/settings'),
          ]);
          if (users && Array.isArray(users.users)) this.mergeRemoteUsers(users.users);
          if (submissions && Array.isArray(submissions.submissions)) this.mergeRemoteSubmissions(submissions.submissions);
          if (audit && Array.isArray(audit.logs)) window.store.saveAdminAuditLogs(audit.logs);
          if (xpReset && xpReset.settings && typeof window.store.saveXpResetSettings === 'function') {
            window.store.saveXpResetSettings(xpReset.settings);
          }
        }
      } else if (window.subscriptionManager && typeof window.subscriptionManager.syncMySubscription === 'function') {
        window.subscriptionManager.syncMySubscription();
      }
    } finally {
      this._inFlight = false;
    }
  }

  /** Called when the admin view opens: refresh admin data now unless it was refreshed within the cooldown. */
  onAdminViewOpened() {
    if (!this._running || Date.now() - this._lastAdminRefreshAt < VISIBILITY_REFRESH_COOLDOWN_MS) return;
    this.refreshNow();
  }

  // Debounced profile re-render: coalesces several merges into one 100ms render
  _debouncedProfileRender() {
    if (this._profileRenderTimer) clearTimeout(this._profileRenderTimer);
    this._profileRenderTimer = setTimeout(() => {
      this._profileRenderTimer = null;
      if (window.app && window.app.currentView === 'profile' && typeof window.app.renderProfilePage === 'function') {
        window.app.renderProfilePage();
      }
    }, 100);
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
            console.warn('[ServerSync] Logged-in student account was deleted or deactivated by admin. Revoking session.');
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
            freshCurrent.token = current.token; // the server never returns session tokens in user lists
            window.store.setCurrentUser(freshCurrent);
            if (window.auth) window.auth.currentUser = freshCurrent;
            this.updateUserPointsUi(freshCurrent);
          }
        } else if (current) {
          const found = localUsers.find(u => u.id === current.id);
          if (found) {
            const freshCurrent = { ...found, token: current.token };
            window.store.setCurrentUser(freshCurrent);
            if (window.auth) window.auth.currentUser = freshCurrent;
          }
        }

        // Real-time update for Student Dashboard & Profile
        if (window.app) {
          if (window.app.currentView === 'dashboard' && window.studentDashboard && typeof window.studentDashboard.render === 'function') {
            window.studentDashboard.render();
          }
          if (window.app.currentView === 'profile') {
            this._debouncedProfileRender();
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
          } else if (window.adminDashboard.currentTab === 'teachers') {
            window.adminDashboard.renderTeachers();
          }
          if (newStudentArrived && window.app && window.app.showToast) {
            window.app.showToast(`New Student Registered Live: ${newStudentArrived.name} (${newStudentArrived.caLevel || 'CA'})`, 'info');
          }
        }
      }
    } catch (e) {
      console.warn('[ServerSync] Error merging users:', e);
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

      // 1. Remove local assignments that were deleted on the server
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
      console.warn('[ServerSync] Error merging assignments:', e);
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
      console.warn('[ServerSync] Error merging submissions:', e);
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

      // Use Map keyed by ID to strictly enforce unique tests
      const tMap = new Map();

      // 1. Keep valid local tests that still exist in remote (or all local if remote is empty)
      if (remoteTests.length > 0) {
        localTests.forEach(lt => {
          if (lt && lt.id && remoteIds.has(lt.id)) {
            tMap.set(lt.id, lt);
          }
        });
        if (tMap.size !== localTests.length) {
          changed = true;
        }
      } else {
        localTests.forEach(lt => {
          if (lt && lt.id) {
            tMap.set(lt.id, lt);
          }
        });
      }

      // 2. Add or update tests from remote
      remoteTests.forEach(rt => {
        if (!rt || !rt.id) return;
        if (!tMap.has(rt.id)) {
          tMap.set(rt.id, rt);
          changed = true;
        } else {
          const existing = tMap.get(rt.id);
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
        const dedupedTests = Array.from(tMap.values());
        window.store.saveTests(dedupedTests);

        // Re-render student MCQ test list if student is viewing tests
        if (window.testEngine && typeof window.testEngine.renderTestList === 'function') {
          const curView = window.app ? window.app.currentView : '';
          if (curView === 'tests') {
            window.testEngine.renderTestList();
          }
        }

        // Re-render admin MCQ tests tab if admin is viewing it and not actively saving a test
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'mcq-tests') {
          if (!window.adminDashboard._isSavingTest) {
            window.adminDashboard.renderMCQTests();
          }
        }
      }
    } catch (e) {
      console.warn('[ServerSync] Error merging tests:', e);
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

      // Use Map keyed by ID to strictly enforce unique questions
      const qMap = new Map();

      // 1. Keep valid local questions that still exist in remote (or all local if remote is empty)
      if (remoteQuestions.length > 0) {
        localQs.forEach(lq => {
          if (lq && lq.id && remoteIds.has(lq.id)) {
            qMap.set(lq.id, lq);
          }
        });
        if (qMap.size !== localQs.length) {
          changed = true;
        }
      } else {
        localQs.forEach(lq => {
          if (lq && lq.id) {
            qMap.set(lq.id, lq);
          }
        });
      }

      // 2. Add or update questions from remote
      remoteQuestions.forEach(rq => {
        if (!rq || !rq.id) return;
        if (!qMap.has(rq.id)) {
          qMap.set(rq.id, rq);
          changed = true;
        } else {
          const existing = qMap.get(rq.id);
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
        const dedupedQs = Array.from(qMap.values());
        window.store.saveQuestions(dedupedQs);

        // If admin is currently in question builder list view (NOT editing or saving a question form),
        // refresh the question list. Guard against _isEditingQuestion and _isSavingQuestion.
        if (window.adminDashboard && window.adminDashboard.activeTestQuestionsId
            && !window.adminDashboard._isEditingQuestion
            && !window.adminDashboard._isSavingQuestion) {
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
      console.warn('[ServerSync] Error merging questions:', e);
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
      console.warn('[ServerSync] Error merging subjects:', e);
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
      console.warn('[ServerSync] Error merging notifications:', e);
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
      console.warn('[ServerSync] Error merging bookmarks:', e);
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
          if (u && window.app.currentView === 'profile') this._debouncedProfileRender();
        }
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'xp-management') {
          const tbody = document.getElementById('admin-xp-history-tbody');
          if (tbody && typeof window.adminDashboard._renderXpAuditRows === 'function') {
            tbody.innerHTML = window.adminDashboard._renderXpAuditRows();
          }
        }
      }
    } catch (e) {
      console.warn('[ServerSync] Error merging XP transactions:', e);
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
        if (window.app && window.app.currentView === 'profile') {
          this._debouncedProfileRender();
        }
        // Real-time update for admin referral audit tab
        if (window.adminDashboard && window.auth && window.auth.isAdmin() && window.adminDashboard.currentTab === 'referrals') {
          window.adminDashboard.renderReferrals();
        }
      }
    } catch (e) {
      console.warn('[ServerSync] Error merging referrals:', e);
    } finally {
      this._isMergingReferrals = false;
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
    if (window.app && window.app.currentView === 'profile') {
      this._debouncedProfileRender();
    }
    if (window.app && window.app.currentView === 'dashboard' && window.studentDashboard && typeof window.studentDashboard.render === 'function') {
      window.studentDashboard.render();
    }
  }

}

window.serverSync = new ServerSyncManager();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.serverSync.init());
} else {
  window.serverSync.init();
}
