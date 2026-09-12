/**
 * Auth.js - Authentication & Session Management
 * Supports Student / Admin login, registration, password recovery, and quick demo role switching.
 */

class AuthManager {
  constructor() {
    this.currentUser = window.store.getCurrentUser();
  }

  getCurrentUser() {
    this.currentUser = window.store.getCurrentUser();
    return this.currentUser;
  }

  isLoggedIn() {
    return !!this.getCurrentUser();
  }

  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  }

  isStudent() {
    const user = this.getCurrentUser();
    return user && user.role === 'student';
  }

  login(email, password) {
    const users = window.store.getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password);
    if (!user) {
      return { success: false, error: 'Invalid email address or password. Please try again.' };
    }
    this.currentUser = user;
    window.store.setCurrentUser(user);
    this.onAuthChange();
    return { success: true, user };
  }

  register(fullName, email, password, confirmPassword, role = 'student') {
    if (!fullName || !email || !password) {
      return { success: false, error: 'All fields are required.' };
    }
    if (password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    const users = window.store.getUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase().trim())) {
      return { success: false, error: 'An account with this email already exists.' };
    }

    const newUser = {
      id: 'usr-' + Date.now(),
      name: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      role: role,
      caLevel: role === 'admin' ? 'Faculty Admin' : 'CA Inter',
      registrationNo: 'CRO-' + Math.floor(100000 + Math.random() * 900000),
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'
    };

    users.push(newUser);
    window.store.saveUsers(users);
    this.currentUser = newUser;
    window.store.setCurrentUser(newUser);
    this.onAuthChange();
    return { success: true, user: newUser };
  }

  logout() {
    this.currentUser = null;
    window.store.setCurrentUser(null);
    this.onAuthChange();
    window.app.navigate('dashboard');
  }

  switchRole(targetRole) {
    const users = window.store.getUsers();
    let targetUser;
    if (targetRole === 'admin') {
      targetUser = users.find(u => u.role === 'admin') || users[3];
    } else {
      targetUser = users.find(u => u.role === 'student') || users[0];
    }

    if (targetUser) {
      this.currentUser = targetUser;
      window.store.setCurrentUser(targetUser);
      this.onAuthChange();
      window.app.showToast(`Switched view to ${targetUser.role.toUpperCase()}: ${targetUser.name}`, 'info');
      window.app.navigate(targetRole === 'admin' ? 'admin' : 'dashboard');
    }
  }

  onAuthChange() {
    // Update global UI elements
    const user = this.getCurrentUser();
    const userDisplay = document.getElementById('user-display-name');
    const userRoleBadge = document.getElementById('user-role-badge');
    const userAvatar = document.getElementById('user-avatar');
    const adminNavTab = document.getElementById('nav-admin');
    const studentNavs = document.querySelectorAll('.student-only-nav');

    if (user) {
      if (userDisplay) userDisplay.textContent = user.name;
      if (userRoleBadge) {
        userRoleBadge.textContent = user.role.toUpperCase();
        userRoleBadge.className = `px-2 py-0.5 text-xs font-semibold rounded-full ${
          user.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
        }`;
      }
      if (userAvatar) userAvatar.src = user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120';
      
      // Role-based navigation visibility
      if (adminNavTab) {
        adminNavTab.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
      }
      studentNavs.forEach(el => {
        el.style.display = user.role === 'student' ? 'inline-flex' : 'inline-flex';
      });
    } else {
      if (adminNavTab) adminNavTab.style.display = 'none';
    }
  }
}

window.auth = new AuthManager();
