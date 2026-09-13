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

/**
 * Synchronous SHA-256 implementation compatible with RFC 6234 and Python hashlib.sha256
 */
function sha256Sync(str) {
  var utf8 = [];
  for (var i = 0; i < str.length; i++) {
    var charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    }
  }

  function rightRotate(n, count) { return (n >>> count) | (n << (32 - count)); }

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  var H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  var l = utf8.length;
  utf8.push(0x80);
  while ((utf8.length % 64) !== 56) utf8.push(0);
  var bitLenHi = Math.floor(l / 0x20000000);
  var bitLenLo = (l * 8) >>> 0;
  for (var b = 24; b >= 0; b -= 8) utf8.push((bitLenHi >>> b) & 0xff);
  for (var b = 24; b >= 0; b -= 8) utf8.push((bitLenLo >>> b) & 0xff);

  var W = new Array(64);
  for (var i = 0; i < utf8.length; i += 64) {
    for (var t = 0; t < 16; t++) {
      W[t] = (utf8[i + t * 4] << 24) | (utf8[i + t * 4 + 1] << 16) | (utf8[i + t * 4 + 2] << 8) | (utf8[i + t * 4 + 3]);
    }
    for (var t = 16; t < 64; t++) {
      var s0 = rightRotate(W[t - 15], 7) ^ rightRotate(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      var s1 = rightRotate(W[t - 2], 17) ^ rightRotate(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (((W[t - 16] + s0) >>> 0) + ((W[t - 7] + s1) >>> 0)) >>> 0;
    }

    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

    for (var t = 0; t < 64; t++) {
      var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      var ch = (e & f) ^ ((~e) & g);
      var temp1 = (((h + S1) >>> 0) + ((ch + K[t]) >>> 0) + W[t]) >>> 0;
      var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  var hex = '';
  for (var i = 0; i < 8; i++) {
    hex += ('00000000' + H[i].toString(16)).slice(-8);
  }
  return hex;
}

function generateSalt(len = 16) {
  const chars = '0123456789abcdef';
  let salt = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(len / 2));
    crypto.getRandomValues(bytes);
    for (let b of bytes) salt += ('0' + b.toString(16)).slice(-2);
    return salt.slice(0, len);
  } else {
    for (let i = 0; i < len; i++) {
      salt += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return salt;
  }
}

class AuthManager {
  constructor() {
    this.currentUser = window.store ? window.store.getCurrentUser() : null;
  }

  hashPassword(plainPassword, salt = null) {
    if (!plainPassword) return '';
    const s = salt || generateSalt(16);
    const hash = sha256Sync(s + ':' + plainPassword);
    return `sha256:${s}:${hash}`;
  }

  verifyPassword(plainPassword, storedPassword) {
    if (!plainPassword || !storedPassword) return false;
    const stored = String(storedPassword);
    if (stored.startsWith('sha256:')) {
      const parts = stored.split(':');
      if (parts.length === 3) {
        const salt = parts[1];
        const expectedHash = parts[2];
        const computedHash1 = sha256Sync(salt + ':' + plainPassword);
        const computedHash2 = sha256Sync(salt + plainPassword);
        return computedHash1 === expectedHash || computedHash2 === expectedHash;
      }
    }
    // Backward compatibility: support legacy plain-text passwords
    return plainPassword === storedPassword;
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
      return { success: false, error: 'Login Failed: Please enter your email/username and password.' };
    }

    const cleanId = String(identifier || '').trim().toLowerCase();
    const rawPass = String(password || '');
    const users = window.store.getUsers();
    
    // Match by email OR username (case-insensitive & trimmed)
    const user = users.find(u => 
      (u.email && u.email.trim().toLowerCase() === cleanId) || 
      (u.username && u.username.trim().toLowerCase() === cleanId)
    );
    
    if (!user || !this.verifyPassword(rawPass, user.password)) {
      return { success: false, error: 'Login Failed: Invalid username or password.' };
    }

    if (user.isActive === false) {
      return { 
        success: false, 
        error: 'Login Failed: Your account has been deactivated by the Administrator. Please contact faculty support.' 
      };
    }

    // Transparently upgrade legacy plain-text password to salted SHA-256 hash
    if (!user.password || !String(user.password).startsWith('sha256:')) {
      user.password = this.hashPassword(rawPass);
      window.store.updateUser(user);
    }

    // Ensure session token
    if (!user.token) {
      user.token = `token_${user.role || 'student'}_${Date.now()}`;
      window.store.updateUser(user);
    }

    this.currentUser = user;
    window.store.setCurrentUser(user);
    this.onAuthChange();

    // Asynchronously synchronize session token with backend if server is reachable
    if (typeof fetch !== 'undefined') {
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanId, password: rawPass })
      }).then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.token && user) {
            user.token = data.token;
            window.store.setCurrentUser(user);
          }
        }).catch(() => {});
    }

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
    const cleanReferredBy = (referredBy || '').trim().replace(/^@+/, '').toLowerCase();
    let referrer = null;
    if (cleanReferredBy) {
      referrer = users.find(u => 
        (u.username && u.username.replace(/^@+/, '').toLowerCase() === cleanReferredBy) ||
        (u.id && u.id.toLowerCase() === cleanReferredBy)
      );
      if (!referrer) {
        return { success: false, error: 'Invalid referral code. Please enter a valid referral code or leave the field blank.' };
      }
    }

    const hashedPassword = this.hashPassword(password);
    const userToken = `token_student_${Date.now()}`;

    const newUser = {
      id: 'usr-' + Date.now(),
      username: cleanUsername,
      name: fullName.trim(),
      email: email.toLowerCase().trim(),
      phone: cleanPhone,
      caLevel: normLevel.includes('INTER') ? 'CA INTER' : normLevel,
      password: hashedPassword,
      token: userToken,
      role: role,
      state: state || 'Uttar Pradesh',
      district: district || 'Meerut',
      city: district || 'Meerut',
      isActive: true,
      referralCount: 0,
      referralPoints: 0,
      referredBy: referrer ? referrer.username.replace(/^@+/, '') : null,
      baseXp: 0,
      subjectXp: { 'Accounting': 0, 'Business Law': 0, 'Business Economics': 0, 'Quantitative Aptitude': 0 },
      achievementBadges: ['First Solve'],
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    };

    // Process referral reward (dynamic, configurable by admin)
    if (referrer && referrer.id !== newUser.id) {
      const existingRefs = window.store.getReferrals ? window.store.getReferrals() : [];
      const alreadyReferred = existingRefs.some(r => 
        r.referredId === newUser.id || 
        (r.referredUsername && r.referredUsername.replace(/^@+/, '').toLowerCase() === newUser.username.toLowerCase())
      );
      if (!alreadyReferred) {
        // Fetch dynamic reward settings
        const refSettings = window.store.getReferralSettings ? window.store.getReferralSettings() : { referrerReward: 100, newStudentReward: 100 };
        const referrerReward = Number(refSettings.referrerReward) || 100;
        const newStudentReward = Number(refSettings.newStudentReward) || 100;

        // 1. Credit Referrer Points
        referrer.referralPoints = (referrer.referralPoints || 0) + referrerReward;
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        // IMPORTANT: DO NOT add to referrer.totalXp — referralPoints are separate
        window.store.updateUser(referrer);
        if (window.firebaseSync && typeof window.firebaseSync.saveUser === 'function') {
          window.firebaseSync.saveUser(referrer);
        }

        // 2. Credit New Student Referral Reward
        newUser.referralPoints = newStudentReward;
        // IMPORTANT: DO NOT add to newUser.totalXp

        // 3. Log referral record
        const refRecord = {
          id: 'ref-' + Date.now(),
          referrerId: referrer.id,
          referrerName: referrer.name,
          referrerUsername: referrer.username.replace(/^@+/, ''),
          referredId: newUser.id,
          referredName: newUser.name,
          referredUsername: newUser.username.replace(/^@+/, ''),
          examLevel: newUser.caLevel,
          referrerReward: referrerReward,
          referredReward: newStudentReward,
          pointsAwarded: referrerReward,
          status: 'completed',
          createdAt: new Date().toISOString()
        };
        if (window.store.addReferral) {
          window.store.addReferral(refRecord);
        }

        // 4. Real-time notification to referrer
        if (window.store.addNotification) {
          window.store.addNotification({
            userId: referrer.id,
            type: 'referral',
            title: 'Referral Bonus Credited! 🎉',
            message: `${newUser.name} (@${newUser.username}) registered using your link! You earned +${referrerReward} Referral Points.`,
            link: 'profile',
            metadata: { referredUserId: newUser.id, points: referrerReward }
          });
          // 5. Notification to new student about their reward
          window.store.addNotification({
            userId: newUser.id,
            type: 'referral',
            title: 'Referral Bonus for You! 🎁',
            message: `You joined using ${referrer.name}'s referral code and earned +${newStudentReward} Referral Points!`,
            link: 'profile',
            metadata: { referrerUserId: referrer.id, points: newStudentReward }
          });
        }
      }
    }

    // Welcome notification to newly registered student
    if (window.store.addNotification) {
      window.store.addNotification({
        userId: newUser.id,
        type: 'general',
        title: 'Welcome to ExcellenceCA! 🎓',
        message: 'Your account is active. Start practicing MCQ Tests and downloading Question Papers!',
        link: 'dashboard'
      });
    }

    users.unshift(newUser);
    window.store.saveUsers(users);
    if (window.firebaseSync && typeof window.firebaseSync.saveUser === 'function') {
      window.firebaseSync.saveUser(newUser);
    }
    this.currentUser = newUser;
    window.store.setCurrentUser(newUser);
    this.onAuthChange();

    // Asynchronously persist student registration to backend if online
    if (typeof fetch !== 'undefined') {
      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newUser.id,
          username: cleanUsername,
          name: fullName.trim(),
          email: newUser.email,
          phone: cleanPhone,
          caLevel: newUser.caLevel,
          password: password,
          role: 'student',
          referralCode: cleanReferredBy || ''
        })
      }).then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.token) {
            newUser.token = data.token;
            window.store.setCurrentUser(newUser);
            if (window.store.updateUser) {
              window.store.updateUser(newUser);
            }
          }
        }).catch(() => {});
    }

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

    if (!this.verifyPassword(oldPassword, user.password)) {
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

    user.password = this.hashPassword(newPassword);
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
    const mobileNavTeacher = document.getElementById('mobile-nav-teacher');
    const mobileNavAdmin = document.getElementById('mobile-nav-admin');

    // Homepage Hero Buttons & CTA
    const heroSignInBtn = document.getElementById('hero-signin-btn');
    const heroRegisterBtn = document.getElementById('hero-register-btn');
    const heroDashboardBtn = document.getElementById('hero-dashboard-btn');
    const homepageEnrollLink = document.getElementById('homepage-enroll-link');

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
      if (mobileNavProfile) mobileNavProfile.style.display = 'flex';
      if (navLogin) navLogin.style.display = 'none';
      if (navGuestActions) navGuestActions.style.display = 'none';
      if (navUserContainer) navUserContainer.style.display = 'flex';

      // Logged in: HIDE Homepage Sign In & Register buttons, SHOW Go to Dashboard CTA
      if (heroSignInBtn) heroSignInBtn.classList.add('hidden');
      if (heroRegisterBtn) heroRegisterBtn.classList.add('hidden');
      if (heroDashboardBtn) {
        heroDashboardBtn.classList.remove('hidden');
        if (user.role === 'admin') {
          heroDashboardBtn.innerHTML = '<i data-lucide="shield" class="w-4 h-4"></i> Open Admin Portal';
        } else if (user.role === 'teacher') {
          heroDashboardBtn.innerHTML = '<i data-lucide="user-check" class="w-4 h-4"></i> Open Faculty Portal';
        } else {
          heroDashboardBtn.innerHTML = '<i data-lucide="layout-dashboard" class="w-4 h-4"></i> Go to Dashboard';
        }
      }
      if (homepageEnrollLink) {
        homepageEnrollLink.innerHTML = 'Go to Dashboard <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>';
      }

      if (adminNavTab) {
        adminNavTab.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
      }
      if (mobileNavAdmin) {
        mobileNavAdmin.style.display = user.role === 'admin' ? 'flex' : 'none';
      }
      if (teacherNavTab) {
        teacherNavTab.style.display = (user.role === 'teacher' || user.role === 'admin') ? 'inline-flex' : 'none';
      }
      if (mobileNavTeacher) {
        mobileNavTeacher.style.display = (user.role === 'teacher' || user.role === 'admin') ? 'flex' : 'none';
      }
    } else {
      // Logged out: SHOW login & register buttons, HIDE user profile container
      if (navRegister) navRegister.style.display = 'inline-flex';
      if (mobileNavRegister) mobileNavRegister.style.display = 'flex';
      if (mobileNavProfile) mobileNavProfile.style.display = 'none';
      if (navLogin) navLogin.style.display = 'inline-flex';
      if (navGuestActions) navGuestActions.style.display = 'flex';
      if (navUserContainer) navUserContainer.style.display = 'none';
      if (adminNavTab) adminNavTab.style.display = 'none';
      if (mobileNavAdmin) mobileNavAdmin.style.display = 'none';
      if (teacherNavTab) teacherNavTab.style.display = 'none';
      if (mobileNavTeacher) mobileNavTeacher.style.display = 'none';

      // Logged out: SHOW Homepage Sign In & Register buttons, HIDE Go to Dashboard
      if (heroSignInBtn) heroSignInBtn.classList.remove('hidden');
      if (heroRegisterBtn) heroRegisterBtn.classList.remove('hidden');
      if (heroDashboardBtn) heroDashboardBtn.classList.add('hidden');
      if (homepageEnrollLink) {
        homepageEnrollLink.innerHTML = 'Enroll now for free <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>';
      }
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }

    if (window.app && typeof window.app.updateNotificationBadge === 'function') {
      window.app.updateNotificationBadge();
    }
  }
}

window.auth = new AuthManager();
