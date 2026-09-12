/**
 * auth.js - Authentication & Role-Based Access Control for ExcellenceCA
 * Supports 3 Roles: Student, Teacher, Admin
 * Features:
 * - Login via Email OR Username
 * - Mandatory Unique Username validation
 * - Strong Password Security enforcement (min 8 chars, mixed chars, weak pattern check)
 * - Profile Password Change with old password validation
 * - Working Referral Engine (awards 100 points to referrer)
 * - Safe logout redirecting to Homepage
 */

class AuthManager {
  constructor() {
    this.currentUser = window.store ? window.store.getCurrentUser() : null;
  }

  getCurrentUser() {
    this.currentUser = window.store ? window.store.getCurrentUser() : null;
    return this.currentUser;
  }

  isLoggedIn() {
    return !!this.getCurrentUser();
  }

  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  }

  isTeacher() {
    const user = this.getCurrentUser();
    return user && user.role === 'teacher';
  }

  isStudent() {
    const user = this.getCurrentUser();
    return user && user.role === 'student';
  }

  hasPrivilege(privilegeKey) {
    if (this.isAdmin()) return true;
    const user = this.getCurrentUser();
    if (!user || user.role !== 'teacher') return false;
    return !!(user.privileges && user.privileges[privilegeKey]);
  }

  validatePasswordStrength(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required.' };
    }
    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long.' };
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigitOrSymbol = /[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    if (!hasLetter || !hasDigitOrSymbol) {
      return { 
        valid: false, 
        error: 'Password must be strong: include at least one letter and at least one number or special character.' 
      };
    }
    const commonWeak = ['12345678', '123456789', 'password', 'password123', 'qwertyuiop', 'admin1234', 'student123'];
    if (commonWeak.includes(password.toLowerCase().trim())) {
      return { valid: false, error: 'This password is too common and weak. Please choose a stronger password.' };
    }
    return { valid: true };
  }

  validateUsername(username) {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required.' };
    }
    const clean = username.trim();
    if (!/^[a-zA-Z0-9]+$/.test(clean)) {
      return { 
        valid: false, 
        error: 'Username must contain only alphanumeric characters (letters and numbers). Spaces, symbols, and special characters are not allowed.' 
      };
    }
    if (clean.length > 10) {
      return { valid: false, error: 'Username cannot exceed 10 characters in length.' };
    }
    if (clean.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters long.' };
    }

    const users = window.store.getUsers();
    const cleanLower = clean.toLowerCase();
    const isTaken = users.some(u => u.username && u.username.toLowerCase() === cleanLower);
    if (isTaken) {
      return { valid: false, error: 'Username already exists. Please choose another username.' };
    }
    return { valid: true, cleanUsername: clean };
  }

  login(identifier, password) {
    if (!identifier || !password) {
      return { success: false, error: 'Please enter your email/username and password.' };
    }

    const cleanId = identifier.trim().toLowerCase();
    const users = window.store.getUsers();
    
    // Match by email OR username (case-insensitive)
    const user = users.find(u => 
      (u.email && u.email.toLowerCase() === cleanId) || 
      (u.username && u.username.toLowerCase() === cleanId)
    );
    
    if (!user || user.password !== password) {
      return { success: false, error: 'Invalid credentials. Please check your username/email and password.' };
    }

    if (user.isActive === false) {
      return { 
        success: false, 
        error: 'Your account has been deactivated by the Administrator. Please contact faculty support.' 
      };
    }

    this.currentUser = user;
    window.store.setCurrentUser(user);
    this.onAuthChange();
    return { success: true, user };
  }

  register(username, fullName, email, phone, caLevel, password, confirmPassword, role = 'student', state = 'Uttar Pradesh', district = 'Meerut', referredBy = '') {
    // Security check: Never allow public registration of admin or teacher roles
    if (role && (role.toLowerCase() === 'admin' || role.toLowerCase() === 'teacher')) {
      return { 
        success: false, 
        error: 'Security Policy Violation: Public administrator or faculty registration is prohibited. Only authorized personnel may provision administrative access.' 
      };
    }

    if (!fullName || !email || !phone || !password) {
      return { success: false, error: 'All fields (Username, Name, Email, Phone, Password) are required.' };
    }

    // 1. Username validation (strict alphanumeric, max 10 chars, case-insensitive uniqueness)
    const uValidation = this.validateUsername(username);
    if (!uValidation.valid) {
      return { success: false, error: uValidation.error };
    }
    const cleanUsername = uValidation.cleanUsername;

    // 2. Email uniqueness
    const users = window.store.getUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase().trim())) {
      return { success: false, error: 'An account with this email address already exists. Please sign in instead.' };
    }

    // 3. Phone validation
    const cleanPhone = phone.trim();
    if (cleanPhone.length < 8) {
      return { success: false, error: 'Please enter a valid mobile number (e.g. +91 98765 43210 or 10-digit number).' };
    }

    // 4. Exam Level validation
    const validLevels = ['CA FOUNDATION', 'CA INTER', 'CA INTERMEDIATE', 'CA FINAL'];
    const normLevel = caLevel ? caLevel.toUpperCase().trim() : '';
    if (!validLevels.includes(normLevel)) {
      return { success: false, error: 'Please select your CA Exam Level (CA FOUNDATION, CA INTERMEDIATE, or CA FINAL).' };
    }

    // 5. Password security validation
    if (password !== confirmPassword) {
      return { success: false, error: 'New password and confirmation do not match.' };
    }
    const pValidation = this.validatePasswordStrength(password);
    if (!pValidation.valid) {
      return { success: false, error: pValidation.error };
    }

    // Referral code resolution: strip optional leading '@' and match case-insensitively
    const cleanReferredBy = (referredBy || '').trim().replace(/^@/, '').toLowerCase();
    let referrer = null;
    if (cleanReferredBy) {
      referrer = users.find(u => 
        (u.username && u.username.toLowerCase() === cleanReferredBy)
      );
    }

    const newUser = {
      id: 'usr-' + Date.now(),
      username: cleanUsername,
      name: fullName.trim(),
      email: email.toLowerCase().trim(),
      phone: cleanPhone,
      caLevel: normLevel.includes('INTER') ? 'CA INTER' : normLevel,
      password: password,
      role: role,
      state: state || 'Uttar Pradesh',
      district: district || 'Meerut',
      city: district || 'Meerut',
      isActive: true,
      referralCount: 0,
      referralPoints: 0,
      referredBy: referrer ? referrer.username : null,
      baseXp: 0,
      subjectXp: { 'Accounting': 0, 'Business Law': 0, 'Business Economics': 0, 'Quantitative Aptitude': 0 },
      achievementBadges: ['First Solve'],
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    };

    // Process referral reward (100 points to referrer, prevent duplicate counting)
    if (referrer && referrer.id !== newUser.id) {
      const existingRefs = window.store.getReferrals ? window.store.getReferrals() : [];
      const alreadyReferred = existingRefs.some(r => 
        r.referredId === newUser.id || 
        (r.referredUsername && r.referredUsername.toLowerCase() === newUser.username.toLowerCase())
      );
      if (!alreadyReferred) {
        referrer.referralPoints = (referrer.referralPoints || 0) + 100;
        referrer.referralCount = (referrer.referralCount || 0) + 1;

        // Log referral record
        if (window.store.addReferral) {
          window.store.addReferral({
            id: 'ref-' + Date.now(),
            referrerId: referrer.id,
            referrerName: referrer.name,
            referrerUsername: referrer.username,
            referredId: newUser.id,
            referredName: newUser.name,
            referredUsername: newUser.username,
            examLevel: newUser.caLevel,
            pointsAwarded: 100,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    users.push(newUser);
    window.store.saveUsers(users);
    this.currentUser = newUser;
    window.store.setCurrentUser(newUser);
    this.onAuthChange();

    return { 
      success: true, 
      user: newUser,
      referredBy: referrer ? referrer.name : null
    };
  }

  changePassword(userId, oldPassword, newPassword, confirmPassword) {
    const user = this.getCurrentUser();
    if (!user || user.id !== userId) {
      return { success: false, error: 'Authentication required to update password.' };
    }

    if (!oldPassword) {
      return { success: false, error: 'Current password is required.' };
    }

    if (user.password !== oldPassword) {
      return { success: false, error: 'Incorrect current password. Please verify and try again.' };
    }

    if (oldPassword === newPassword) {
      return { success: false, error: 'New password cannot be the same as your current password.' };
    }

    if (newPassword !== confirmPassword) {
      return { success: false, error: 'New password and confirmation do not match.' };
    }

    const pVal = this.validatePasswordStrength(newPassword);
    if (!pVal.valid) {
      return { success: false, error: pVal.error };
    }

    user.password = newPassword;
    window.store.updateUser(user);
    this.currentUser = user;

    return { success: true };
  }

  logout() {
    this.currentUser = null;
    window.store.setCurrentUser(null);
    this.onAuthChange();
    if (window.app) {
      window.app.navigate('home');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#home');
      } else {
        window.location.hash = 'home';
      }
      window.app.showToast('You have been securely signed out.', 'info');
    }
  }

  switchRole(targetRole) {
    const users = window.store.getUsers();
    let targetUser;

    if (targetRole === 'admin') {
      targetUser = users.find(u => u.role === 'admin' && (u.email === 'adminrulebreker@rulebrekerdothunter.com' || u.username === 'adminrulebreker@rulebrekerdothunter.com')) || users.find(u => u.role === 'admin');
    } else if (targetRole === 'teacher') {
      targetUser = users.find(u => u.role === 'teacher') || users.find(u => u.role === 'admin');
    } else {
      targetUser = users.find(u => u.role === 'student' && u.isActive) || users[0];
    }

    if (targetUser) {
      this.currentUser = targetUser;
      window.store.setCurrentUser(targetUser);
      this.onAuthChange();
      window.app.showToast(`Switched view to ${targetUser.role.toUpperCase()}: ${targetUser.name}`, 'info');

      if (targetRole === 'admin') {
        window.app.navigate('admin');
      } else if (targetRole === 'teacher') {
        window.app.navigate('teacher');
      } else {
        window.app.navigate('dashboard');
      }
    }
  }

  onAuthChange() {
    const user = this.getCurrentUser();
    const userDisplay = document.getElementById('user-display-name');
    const userRoleBadge = document.getElementById('user-role-badge');
    const userAvatar = document.getElementById('user-avatar');
    const adminNavTab = document.getElementById('nav-admin');
    const teacherNavTab = document.getElementById('nav-teacher');
    const navRegister = document.getElementById('nav-register');
    const navLogin = document.getElementById('nav-login');
    const navUserContainer = document.getElementById('nav-user-container');
    const navGuestActions = document.getElementById('nav-guest-actions');
    const mobileNavRegister = document.getElementById('mobile-nav-register');
    const mobileNavProfile = document.getElementById('mobile-nav-profile');

    if (user) {
      if (userDisplay) userDisplay.textContent = user.name;
      if (userRoleBadge) {
        userRoleBadge.textContent = user.role.toUpperCase();
        if (user.role === 'admin') {
          userRoleBadge.className = 'px-2 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200';
        } else if (user.role === 'teacher') {
          userRoleBadge.className = 'px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200';
        } else {
          userRoleBadge.className = 'px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200';
        }
      }
      if (userAvatar) userAvatar.src = user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120';
      
      // Logged in: HIDE register link and guest actions from dashboard/navbar
      if (navRegister) navRegister.style.display = 'none';
      if (mobileNavRegister) mobileNavRegister.style.display = 'none';
      if (mobileNavProfile) mobileNavProfile.style.display = 'block';
      if (navLogin) navLogin.style.display = 'none';
      if (navGuestActions) navGuestActions.style.display = 'none';
      if (navUserContainer) navUserContainer.style.display = 'flex';

      if (adminNavTab) {
        adminNavTab.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
      }
      if (teacherNavTab) {
        teacherNavTab.style.display = (user.role === 'teacher' || user.role === 'admin') ? 'inline-flex' : 'none';
      }
    } else {
      // Logged out: SHOW login & register buttons, HIDE user profile container
      if (navRegister) navRegister.style.display = 'inline-flex';
      if (mobileNavRegister) mobileNavRegister.style.display = 'block';
      if (mobileNavProfile) mobileNavProfile.style.display = 'none';
      if (navLogin) navLogin.style.display = 'inline-flex';
      if (navGuestActions) navGuestActions.style.display = 'flex';
      if (navUserContainer) navUserContainer.style.display = 'none';
      if (adminNavTab) adminNavTab.style.display = 'none';
      if (teacherNavTab) teacherNavTab.style.display = 'none';
    }
  }
}

window.auth = new AuthManager();
