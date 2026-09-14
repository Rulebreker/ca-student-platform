/**
 * store.js - Reactive Data Store with LocalStorage Persistence for ExcellenceCA
 * Supports 3 Roles: Student, Teacher, Admin
 * Features:
 * - Admin credentials (adminrulebreker@rulebrekerdothunter.com / eliterulebrker@220709)
 * - Student management with visible passwords and active/deactivate status
 * - Teacher management with dynamic privilege matrices
 * - Question Paper PDF upload & Evaluated/Checked Copy PDF upload workflow
 */

const STORAGE_KEYS = {
  USERS: 'excellenceca_users',
  SUBJECTS: 'excellenceca_subjects',
  LECTURES: 'excellenceca_lectures',
  TESTS: 'excellenceca_tests',
  QUESTIONS: 'excellenceca_questions',
  ATTEMPTS: 'excellenceca_attempts',
  ASSIGNMENTS: 'excellenceca_assignments',
  SUBMISSIONS: 'excellenceca_submissions',
  CURRENT_USER: 'excellenceca_current_user',
  BANNERS: 'excellenceca_banners',
  RANK_TIERS: 'excellenceca_rank_tiers',
  XP_SETTINGS: 'excellenceca_xp_settings',
  REFERRALS: 'excellenceca_referrals',
  BOOKMARKS: 'excellenceca_bookmarks',
  NOTIFICATIONS: 'excellenceca_notifications',
  XP_TRANSACTIONS: 'excellenceca_xp_transactions',
  REFERRAL_SETTINGS: 'excellenceca_referral_settings',
  XP_RESET_SETTINGS: 'excellenceca_xp_reset_settings',
  XP_RESET_HISTORY: 'excellenceca_xp_reset_history',
  SUBSCRIPTIONS: 'excellenceca_subscriptions',
  PAYMENT_SESSIONS: 'excellenceca_payment_sessions',
  PAYMENT_CHANNELS: 'excellenceca_payment_channels',
  SUBSCRIPTION_PLANS: 'excellenceca_subscription_plans',
  ADMIN_AUDIT_LOGS: 'excellenceca_admin_audit_logs'
};

const DEFAULT_RANK_TIERS = [
  { id: 'rookie_3', name: 'Rookie III', family: 'Rookie', minXp: 0, maxXp: 499, tierNumber: 3 },
  { id: 'rookie_2', name: 'Rookie II', family: 'Rookie', minXp: 500, maxXp: 999, tierNumber: 2 },
  { id: 'rookie_1', name: 'Rookie I', family: 'Rookie', minXp: 1000, maxXp: 1999, tierNumber: 1 },

  { id: 'scholar_3', name: 'Scholar III', family: 'Scholar', minXp: 2000, maxXp: 3499, tierNumber: 3 },
  { id: 'scholar_2', name: 'Scholar II', family: 'Scholar', minXp: 3500, maxXp: 4999, tierNumber: 2 },
  { id: 'scholar_1', name: 'Scholar I', family: 'Scholar', minXp: 5000, maxXp: 6999, tierNumber: 1 },

  { id: 'achiever_3', name: 'Achiever III', family: 'Achiever', minXp: 7000, maxXp: 9499, tierNumber: 3 },
  { id: 'achiever_2', name: 'Achiever II', family: 'Achiever', minXp: 9500, maxXp: 11999, tierNumber: 2 },
  { id: 'achiever_1', name: 'Achiever I', family: 'Achiever', minXp: 12000, maxXp: 14999, tierNumber: 1 },

  { id: 'elite_3', name: 'Elite III', family: 'Elite', minXp: 15000, maxXp: 17999, tierNumber: 3 },
  { id: 'elite_2', name: 'Elite II', family: 'Elite', minXp: 18000, maxXp: 20999, tierNumber: 2 },
  { id: 'elite_1', name: 'Elite I', family: 'Elite', minXp: 21000, maxXp: 24999, tierNumber: 1 },

  { id: 'master_3', name: 'Master III', family: 'Master', minXp: 25000, maxXp: 29999, tierNumber: 3 },
  { id: 'master_2', name: 'Master II', family: 'Master', minXp: 30000, maxXp: 34999, tierNumber: 2 },
  { id: 'master_1', name: 'Master I', family: 'Master', minXp: 35000, maxXp: 39999, tierNumber: 1 },

  { id: 'apex', name: 'Apex', family: 'Apex', minXp: 40000, maxXp: 49999, tierNumber: 1 },
  { id: 'titan', name: 'Titan', family: 'Titan', minXp: 50000, maxXp: 64999, tierNumber: 1 },
  { id: 'legend', name: 'Legend', family: 'Legend', minXp: 65000, maxXp: 79999, tierNumber: 1 },
  { id: 'sovereign', name: 'Sovereign', family: 'Sovereign', minXp: 80000, maxXp: Infinity, tierNumber: 1 }
];

const DEFAULT_XP_SETTINGS = {
  referralXp: 500
};

const DEFAULT_REFERRAL_SETTINGS = {
  referrerReward: 100,
  newStudentReward: 100
};

const DEFAULT_XP_RESET_SETTINGS = {
  enabled: false,
  scheduledTime: '',
  interval: 'once',
  nextReset: null,
  lastReset: null
};

const DEFAULT_BANNERS = [
  {
    id: 'bnr-1',
    title: 'ICAI Exam Pattern 2026: Updated Syllabus & Case Study Papers',
    subtitle: 'New assessment pattern implemented for CA Foundation & CA Inter students.',
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80',
    linkUrl: '#tests',
    tag: 'Academic Notice',
    isVisible: true,
    createdAt: '2026-09-01T10:00:00.000Z'
  },
  {
    id: 'bnr-2',
    title: 'All India CA Mock Test Series — Registrations Now Open',
    subtitle: 'Real exam timer, negative marking, and complete step-by-step faculty solutions.',
    imageUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80',
    linkUrl: '#tests',
    tag: 'Mock Exam Series',
    isVisible: true,
    createdAt: '2026-09-05T12:00:00.000Z'
  },
  {
    id: 'bnr-3',
    title: 'Faculty Answer Sheet Checking: Upload PDF Solutions for Expert Review',
    subtitle: 'Get your computations reviewed with red-ink marks, examiner remarks, and corrections.',
    imageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&auto=format&fit=crop&q=80',
    linkUrl: '#assignments',
    tag: 'Evaluation Center',
    isVisible: true,
    createdAt: '2026-09-10T09:00:00.000Z'
  }
];

const DEFAULT_SUBJECTS = [
  // CA Foundation
  { id: 'sub-1', code: 'PAPER-1', name: 'Accounting', level: 'CA Foundation', icon: 'calculator' },
  { id: 'sub-2', code: 'PAPER-2', name: 'Business Law', level: 'CA Foundation', icon: 'scale' },
  { id: 'sub-3', code: 'PAPER-3', name: 'Business Economics', level: 'CA Foundation', icon: 'trending-up' },
  { id: 'sub-4', code: 'PAPER-4', name: 'Quantitative Aptitude', level: 'CA Foundation', icon: 'bar-chart-2' },
  // CA Intermediate
  { id: 'sub-inter-1', code: 'INTER-P1', name: 'Advanced Accounting', level: 'CA Intermediate', icon: 'calculator' },
  { id: 'sub-inter-2', code: 'INTER-P2', name: 'Corporate and Other Laws', level: 'CA Intermediate', icon: 'scale' },
  { id: 'sub-inter-3', code: 'INTER-P3', name: 'Taxation', level: 'CA Intermediate', icon: 'receipt' },
  { id: 'sub-inter-4', code: 'INTER-P4', name: 'Cost and Management Accounting', level: 'CA Intermediate', icon: 'pie-chart' },
  { id: 'sub-inter-5', code: 'INTER-P5', name: 'Auditing and Ethics', level: 'CA Intermediate', icon: 'shield-check' },
  { id: 'sub-inter-6', code: 'INTER-P6', name: 'Financial Management and Strategic Management', level: 'CA Intermediate', icon: 'trending-up' },
  // CA Final
  { id: 'sub-final-1', code: 'FINAL-P1', name: 'Financial Reporting', level: 'CA Final', icon: 'file-text' },
  { id: 'sub-final-2', code: 'FINAL-P2', name: 'Advanced Financial Management', level: 'CA Final', icon: 'trending-up' },
  { id: 'sub-final-3', code: 'FINAL-P3', name: 'Advanced Auditing, Assurance and Professional Ethics', level: 'CA Final', icon: 'shield-check' },
  { id: 'sub-final-4', code: 'FINAL-P4', name: 'Direct Tax Laws & International Taxation', level: 'CA Final', icon: 'receipt' },
  { id: 'sub-final-5', code: 'FINAL-P5', name: 'Indirect Tax Laws', level: 'CA Final', icon: 'briefcase' }
];


const DEFAULT_REFERRALS = [
  {
    id: 'ref-seed-1',
    referrerId: 'usr-student-2',
    referrerName: 'Priya Patel',
    referrerUsername: 'priya_patel',
    referredId: 'usr-student-6',
    referredName: 'Aman Singh',
    referredUsername: 'aman_singh',
    examLevel: 'CA INTER',
    pointsAwarded: 100,
    createdAt: '2026-08-25T14:00:00.000Z'
  },
  {
    id: 'ref-seed-2',
    referrerId: 'usr-student-1',
    referrerName: 'Rohan Sharma',
    referrerUsername: 'rohan_sharma',
    referredId: 'usr-student-7',
    referredName: 'Sneha Gupta',
    referredUsername: 'sneha_gupta',
    examLevel: 'CA FOUNDATION',
    pointsAwarded: 100,
    createdAt: '2026-08-26T10:30:00.000Z'
  },
  {
    id: 'ref-seed-3',
    referrerId: 'usr-student-5',
    referrerName: 'Kavita Singhal',
    referrerUsername: 'kavita_singhal',
    referredId: 'usr-student-14',
    referredName: 'Manish Tiwari',
    referredUsername: 'manish_tiwari',
    examLevel: 'CA INTER',
    pointsAwarded: 100,
    createdAt: '2026-09-05T10:15:00.000Z'
  }
];

const DEFAULT_USERS = [
  // Students across all 19 gaming tiers and locations
  {
    id: 'usr-student-1',
    name: 'Rohan Sharma',
    username: 'rohan_sharma',
    referralPoints: 200,
    email: 'rohan.sharma@castudent.in',
    password: 'password123',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'NRO-0459201',
    phone: '+91 98765 43210',
    isActive: true,
    state: 'Uttar Pradesh',
    city: 'Meerut',
    district: 'Meerut',
    subjectXp: {'Accounting': 7200, 'Business Law': 6800, 'Business Economics': 7500, 'Quantitative Aptitude': 6950},
    baseXp: 28450,
    referralCount: 2,
    previousRank: 29,
    achievementBadges: ['First Solve', '7 Day Streak'],
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-15T10:00:00.000Z'
  },
  {
    id: 'usr-student-2',
    name: 'Priya Patel',
    username: 'priya_patel',
    referralPoints: 300,
    email: 'priya.patel@castudent.in',
    password: 'priyapassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'WRO-0782190',
    phone: '+91 98111 22334',
    isActive: true,
    state: 'Maharashtra',
    city: 'Mumbai',
    district: 'Mumbai Suburban',
    subjectXp: {'Accounting': 21500, 'Business Law': 20200, 'Business Economics': 20800, 'Quantitative Aptitude': 19950},
    baseXp: 82450,
    referralCount: 3,
    previousRank: 1,
    achievementBadges: ['First Solve', 'Question Crusher', 'Perfect Run', 'Referral Champion', 'XP Hunter'],
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-18T14:30:00.000Z'
  },
  {
    id: 'usr-student-5',
    name: 'Kavita Singhal',
    username: 'kavita_singhal',
    referralPoints: 200,
    email: 'kavita.singhal@castudent.in',
    password: 'kavitapassword',
    role: 'student',
    caLevel: 'CA FINAL',
    registrationNo: 'NRO-0891234',
    phone: '+91 98222 33445',
    isActive: true,
    state: 'Delhi',
    city: 'New Delhi',
    district: 'New Delhi',
    subjectXp: {'Accounting': 18000, 'Business Law': 17500, 'Business Economics': 16900, 'Quantitative Aptitude': 16800},
    baseXp: 69200,
    referralCount: 2,
    previousRank: 3,
    achievementBadges: ['Question Crusher', '7 Day Streak', 'XP Hunter'],
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-10T09:00:00.000Z'
  },
  {
    id: 'usr-student-3',
    name: 'Amit Roy',
    username: 'amit_roy',
    referralPoints: 100,
    email: 'amit.roy@castudent.in',
    password: 'amitpassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'ERO-0312894',
    phone: '+91 97234 56789',
    isActive: true,
    state: 'West Bengal',
    city: 'Kolkata',
    district: 'Kolkata',
    subjectXp: {'Accounting': 14200, 'Business Law': 13800, 'Business Economics': 13500, 'Quantitative Aptitude': 12900},
    baseXp: 54100,
    referralCount: 1,
    previousRank: 2,
    achievementBadges: ['First Solve', 'XP Hunter'],
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-20T09:15:00.000Z'
  },
  {
    id: 'usr-student-4',
    name: 'Neha Verma',
    username: 'vikram_singhania',
    referralPoints: 100,
    email: 'neha.verma@castudent.in',
    password: 'nehapassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'SRO-0567890',
    phone: '+91 99887 66554',
    isActive: true,
    state: 'Uttar Pradesh',
    city: 'Lucknow',
    district: 'New Delhi',
    subjectXp: {'Accounting': 11200, 'Business Law': 10800, 'Business Economics': 10500, 'Quantitative Aptitude': 10000},
    baseXp: 43800,
    referralCount: 2,
    previousRank: 5,
    achievementBadges: ['Question Crusher'],
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-22T11:00:00.000Z'
  },
  {
    id: 'usr-student-6',
    name: 'Aman Singh',
    username: 'aman_singh',
    referralPoints: 100,
    email: 'aman.singh@castudent.in',
    password: 'amanpassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'WRO-0994512',
    phone: '+91 98450 12345',
    isActive: true,
    state: 'Gujarat',
    city: 'Ahmedabad',
    district: 'Ahmedabad',
    subjectXp: {'Accounting': 8500, 'Business Law': 8200, 'Business Economics': 7900, 'Quantitative Aptitude': 7800},
    baseXp: 32400,
    referralCount: 1,
    previousRank: 7,
    achievementBadges: ['First Solve', 'Question Crusher'],
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-25T14:00:00.000Z'
  },
  {
    id: 'usr-student-7',
    name: 'Sneha Gupta',
    username: 'sneha_gupta',
    referralPoints: 100,
    email: 'sneha.gupta@castudent.in',
    password: 'snehapassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'NRO-0661299',
    phone: '+91 97111 88990',
    isActive: true,
    state: 'Uttar Pradesh',
    city: 'Meerut',
    district: 'Meerut',
    subjectXp: {'Accounting': 450, 'Business Law': 420, 'Business Economics': 390, 'Quantitative Aptitude': 350},
    baseXp: 26500,
    referralCount: 1,
    previousRank: 8,
    achievementBadges: ['7 Day Streak'],
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-26T10:30:00.000Z'
  },
  {
    id: 'usr-student-8',
    name: 'Rahul Sharma',
    username: 'rahul_sharma',
    referralPoints: 100,
    email: 'rahul.sharma@castudent.in',
    password: 'rahulpassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'CRO-0412890',
    phone: '+91 99222 44556',
    isActive: true,
    state: 'Rajasthan',
    city: 'Jaipur',
    district: 'Jaipur',
    subjectXp: {'Accounting': 5800, 'Business Law': 5900, 'Business Economics': 5600, 'Quantitative Aptitude': 5610},
    baseXp: 22910,
    referralCount: 1,
    previousRank: 9,
    achievementBadges: ['XP Hunter'],
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-28T16:00:00.000Z'
  },
  {
    id: 'usr-student-9',
    name: 'Vikram Malhotra',
    username: 'neha_verma',
    referralPoints: 0,
    email: 'vikram.malhotra@castudent.in',
    password: 'vikrampassword',
    role: 'student',
    caLevel: 'CA FINAL',
    registrationNo: 'WRO-0338910',
    phone: '+91 98333 11223',
    isActive: true,
    state: 'Maharashtra',
    city: 'Pune',
    district: 'Pune',
    subjectXp: {'Accounting': 4900, 'Business Law': 4800, 'Business Economics': 4700, 'Quantitative Aptitude': 4600},
    baseXp: 19420,
    referralCount: 1,
    previousRank: 11,
    achievementBadges: ['Question Crusher'],
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-29T12:00:00.000Z'
  },
  {
    id: 'usr-student-10',
    name: 'Ananya Joshi',
    username: 'aditya_verma',
    referralPoints: 0,
    email: 'ananya.joshi@castudent.in',
    password: 'ananyapassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'SRO-0112948',
    phone: '+91 98444 55667',
    isActive: true,
    state: 'Karnataka',
    city: 'Bengaluru',
    district: 'Bengaluru Urban',
    subjectXp: {'Accounting': 4200, 'Business Law': 4100, 'Business Economics': 4000, 'Quantitative Aptitude': 3900},
    baseXp: 16100,
    referralCount: 0,
    previousRank: 12,
    achievementBadges: ['First Solve'],
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-01T11:00:00.000Z'
  },
  {
    id: 'usr-student-11',
    name: 'Divya Nair',
    username: 'ritu_nambiar',
    referralPoints: 100,
    email: 'divya.nair@castudent.in',
    password: 'divyapassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'SRO-0773901',
    phone: '+91 94471 23456',
    isActive: true,
    state: 'Kerala',
    city: 'Kochi',
    district: 'Ernakulam',
    subjectXp: {'Accounting': 3500, 'Business Law': 3400, 'Business Economics': 3300, 'Quantitative Aptitude': 3300},
    baseXp: 13500,
    referralCount: 1,
    previousRank: 14,
    achievementBadges: ['Referral Champion'],
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-02T15:00:00.000Z'
  },
  {
    id: 'usr-student-12',
    name: 'Arjun Mehta',
    username: 'arjun_mehta',
    referralPoints: 0,
    email: 'arjun.mehta@castudent.in',
    password: 'arjunpassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'WRO-0881923',
    phone: '+91 98250 99887',
    isActive: true,
    state: 'Gujarat',
    city: 'Surat',
    district: 'Surat',
    subjectXp: {'Accounting': 2600, 'Business Law': 2550, 'Business Economics': 2550, 'Quantitative Aptitude': 2500},
    baseXp: 10200,
    referralCount: 0,
    previousRank: 15,
    achievementBadges: ['XP Hunter'],
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-03T09:30:00.000Z'
  },
  {
    id: 'usr-student-13',
    name: 'Pooja Deshmukh',
    username: 'pooja_deshmukh',
    referralPoints: 0,
    email: 'pooja.deshmukh@castudent.in',
    password: 'poojapassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'WRO-0552918',
    phone: '+91 97666 44332',
    isActive: true,
    state: 'Maharashtra',
    city: 'Nagpur',
    district: 'Nagpur',
    subjectXp: {'Accounting': 2100, 'Business Law': 2050, 'Business Economics': 2000, 'Quantitative Aptitude': 1950},
    baseXp: 8100,
    referralCount: 0,
    previousRank: 17,
    achievementBadges: [],
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-04T13:45:00.000Z'
  },
  {
    id: 'usr-student-14',
    name: 'Manish Tiwari',
    username: 'manish_tiwari',
    referralPoints: 0,
    email: 'manish.tiwari@castudent.in',
    password: 'manishpassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'CRO-0667123',
    phone: '+91 94250 11223',
    isActive: true,
    state: 'Madhya Pradesh',
    city: 'Indore',
    district: 'Indore',
    subjectXp: {'Accounting': 1500, 'Business Law': 1450, 'Business Economics': 1450, 'Quantitative Aptitude': 1400},
    baseXp: 5800,
    referralCount: 0,
    previousRank: 19,
    achievementBadges: ['First Solve'],
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-05T10:15:00.000Z'
  },
  {
    id: 'usr-student-15',
    name: 'Tanvi Shah',
    username: 'tanvi_shah',
    referralPoints: 0,
    email: 'tanvi.shah@castudent.in',
    password: 'tanvipassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'WRO-0221945',
    phone: '+91 98980 55443',
    isActive: true,
    state: 'Gujarat',
    city: 'Vadodara',
    district: 'Vadodara',
    subjectXp: {'Accounting': 1100, 'Business Law': 1050, 'Business Economics': 1000, 'Quantitative Aptitude': 950},
    baseXp: 4100,
    referralCount: 0,
    previousRank: 21,
    achievementBadges: [],
    avatar: 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-06T14:20:00.000Z'
  },
  {
    id: 'usr-student-16',
    name: 'Rishi Saxena',
    username: 'karthik_raman',
    referralPoints: 0,
    email: 'rishi.saxena@castudent.in',
    password: 'rishipassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'NRO-0331892',
    phone: '+91 95599 33221',
    isActive: true,
    state: 'Uttar Pradesh',
    city: 'Kanpur',
    district: 'Chennai',
    subjectXp: {'Accounting': 650, 'Business Law': 620, 'Business Economics': 600, 'Quantitative Aptitude': 580},
    baseXp: 2800,
    referralCount: 0,
    previousRank: 23,
    achievementBadges: [],
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-07T11:40:00.000Z'
  },
  {
    id: 'usr-student-17',
    name: 'Deepak Kumar',
    username: 'divya_agarwal',
    referralPoints: 0,
    email: 'deepak.kumar@castudent.in',
    password: 'deepakpassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'ERO-0991823',
    phone: '+91 91234 56780',
    isActive: true,
    state: 'Bihar',
    city: 'Patna',
    district: 'Lucknow',
    subjectXp: {'Accounting': 420, 'Business Law': 380, 'Business Economics': 410, 'Quantitative Aptitude': 360},
    baseXp: 1400,
    referralCount: 0,
    previousRank: 26,
    achievementBadges: [],
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-08T09:00:00.000Z'
  },
  {
    id: 'usr-student-18',
    name: 'Sanya Kapoor',
    username: 'harpreet_kaur',
    referralPoints: 0,
    email: 'sanya.kapoor@castudent.in',
    password: 'sanyapassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'NRO-0223419',
    phone: '+91 98150 99881',
    isActive: true,
    state: 'Punjab',
    city: 'Ludhiana',
    district: 'Ludhiana',
    subjectXp: {'Accounting': 200, 'Business Law': 190, 'Business Economics': 180, 'Quantitative Aptitude': 180},
    baseXp: 750,
    referralCount: 0,
    previousRank: 27,
    achievementBadges: [],
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-09T16:30:00.000Z'
  },
  {
    id: 'usr-student-19',
    name: 'Mohit Bansal',
    username: 'mohit_bansal',
    referralPoints: 0,
    email: 'mohit.bansal@castudent.in',
    password: 'mohitpassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'NRO-0119823',
    phone: '+91 98120 44556',
    isActive: true,
    state: 'Haryana',
    city: 'Gurugram',
    district: 'Gurugram',
    subjectXp: {'Accounting': 390, 'Business Law': 350, 'Business Economics': 320, 'Quantitative Aptitude': 290},
    baseXp: 250,
    referralCount: 0,
    previousRank: 30,
    achievementBadges: [],
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-10T12:00:00.000Z'
  },
  {
    id: 'usr-student-20',
    name: 'Sneha Agarwal',
    username: 'sneha_agarwal',
    referralPoints: 100,
    email: 'sneha.agarwal@castudent.in',
    password: 'snehapassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'NRO-0992341',
    phone: '+91 98333 11223',
    isActive: true,
    state: 'Uttar Pradesh',
    city: 'Agra',
    district: 'Agra',
    subjectXp: {'Accounting': 450, 'Business Law': 380, 'Business Economics': 410, 'Quantitative Aptitude': 360},
    baseXp: 350,
    referralCount: 1,
    previousRank: 28,
    achievementBadges: ['First Solve'],
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-10T14:00:00.000Z'
  },
  {
    id: 'usr-student-21',
    name: 'Aditya Varma',
    username: 'aditya_varma',
    referralPoints: 0,
    email: 'aditya.varma@castudent.in',
    password: 'adityapassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'SRO-0451290',
    phone: '+91 98444 22334',
    isActive: true,
    state: 'Karnataka',
    city: 'Bengaluru',
    district: 'Bengaluru Urban',
    subjectXp: {'Accounting': 1200, 'Business Law': 1100, 'Business Economics': 1050, 'Quantitative Aptitude': 980},
    baseXp: 950,
    referralCount: 0,
    previousRank: 25,
    achievementBadges: ['First Solve'],
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-10T15:30:00.000Z'
  },
  {
    id: 'usr-student-22',
    name: 'Ananya Reddy',
    username: 'ananya_reddy',
    referralPoints: 200,
    email: 'ananya.reddy@castudent.in',
    password: 'ananyapassword',
    role: 'student',
    caLevel: 'CA FINAL',
    registrationNo: 'SRO-0789123',
    phone: '+91 98555 33445',
    isActive: true,
    state: 'Telangana',
    city: 'Hyderabad',
    district: 'Hyderabad',
    subjectXp: {'Accounting': 3200, 'Business Law': 3100, 'Business Economics': 2950, 'Quantitative Aptitude': 3000},
    baseXp: 2800,
    referralCount: 2,
    previousRank: 18,
    achievementBadges: ['First Solve', '7 Day Streak'],
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-10T16:00:00.000Z'
  },
  {
    id: 'usr-student-23',
    name: 'Rahul Deshmukh',
    username: 'rahul_deshmukh',
    referralPoints: 0,
    email: 'rahul.deshmukh@castudent.in',
    password: 'rahulpassword',
    role: 'student',
    caLevel: 'CA FOUNDATION',
    registrationNo: 'WRO-0661245',
    phone: '+91 98666 44556',
    isActive: true,
    state: 'Maharashtra',
    city: 'Pune',
    district: 'Pune',
    subjectXp: {'Accounting': 600, 'Business Law': 550, 'Business Economics': 520, 'Quantitative Aptitude': 480},
    baseXp: 450,
    referralCount: 0,
    previousRank: 26,
    achievementBadges: ['First Solve'],
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-10T18:00:00.000Z'
  },
  {
    id: 'usr-student-24',
    name: 'Pooja Iyer',
    username: 'pooja_iyer',
    referralPoints: 100,
    email: 'pooja.iyer@castudent.in',
    password: 'poojapassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'SRO-0339182',
    phone: '+91 98777 55667',
    isActive: true,
    state: 'Tamil Nadu',
    city: 'Chennai',
    district: 'Chennai',
    subjectXp: {'Accounting': 2400, 'Business Law': 2200, 'Business Economics': 2100, 'Quantitative Aptitude': 1950},
    baseXp: 2100,
    referralCount: 1,
    previousRank: 21,
    achievementBadges: ['First Solve'],
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-11T09:00:00.000Z'
  },
  {
    id: 'usr-student-25',
    name: 'Karan Malhotra',
    username: 'karan_malhotra',
    referralPoints: 0,
    email: 'karan.malhotra@castudent.in',
    password: 'karanpassword',
    role: 'student',
    caLevel: 'CA FINAL',
    registrationNo: 'NRO-0552199',
    phone: '+91 98888 66778',
    isActive: true,
    state: 'Punjab',
    city: 'Ludhiana',
    district: 'Ludhiana',
    subjectXp: {'Accounting': 4100, 'Business Law': 3900, 'Business Economics': 4050, 'Quantitative Aptitude': 3800},
    baseXp: 3900,
    referralCount: 0,
    previousRank: 15,
    achievementBadges: ['First Solve', 'Question Crusher'],
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-11T11:00:00.000Z'
  },
  {
    id: 'usr-student-27',
    name: 'Vicky Jain',
    username: 'vicky_jain',
    referralPoints: 0,
    email: 'vicky.jain@castudent.in',
    password: 'vickypassword',
    role: 'student',
    caLevel: 'CA INTER',
    registrationNo: 'CRO-0891274',
    phone: '+91 99000 88990',
    isActive: false,
    state: 'Madhya Pradesh',
    city: 'Indore',
    district: 'Indore',
    subjectXp: {'Accounting': 1500, 'Business Law': 1400, 'Business Economics': 1350, 'Quantitative Aptitude': 1200},
    baseXp: 1300,
    referralCount: 0,
    previousRank: 24,
    achievementBadges: ['First Solve'],
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-09-11T15:00:00.000Z'
  },

  // Teachers / Faculty
  {
    id: 'usr-teacher-1',
    name: 'Prof. Rajesh Sharma (Faculty - Tax & Law)',
    username: 'prof_rajesh',
    referralPoints: 0,
    email: 'rajesh.teacher@excellenceca.com',
    password: '123456',
    role: 'teacher',
    caLevel: 'Senior Faculty',
    registrationNo: 'FAC-TAX-01',
    phone: '+91 94123 45678',
    isActive: true,
    assignedSubjects: ['sub-2', 'sub-4'],
    privileges: {
      canUploadTests: true,
      canGradeCopies: true,
      canUploadLectures: true,
      canViewStudents: true
    },
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-01T10:00:00.000Z'
  },
  {
    id: 'usr-teacher-2',
    name: 'CA Meenakshi Sundaram (Faculty - Accounts & Audit)',
    username: 'meenakshi_ca',
    referralPoints: 0,
    email: 'meenakshi.teacher@excellenceca.com',
    password: '123456',
    role: 'teacher',
    caLevel: 'Faculty Evaluator',
    registrationNo: 'FAC-ACC-02',
    phone: '+91 93222 33445',
    isActive: true,
    assignedSubjects: ['sub-1', 'sub-5'],
    privileges: {
      canUploadTests: false, // Customized privilege
      canGradeCopies: true,
      canUploadLectures: false,
      canViewStudents: false
    },
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-08-05T12:00:00.000Z'
  },

  // Admin User (Password: eliterulebrker@220709)
  {
    id: 'usr-admin-1',
    name: 'CA Sanjeev Verma (Admin)',
    username: 'adminrulebreker@rulebrekerdothunter.com',
    referralPoints: 0,
    email: 'adminrulebreker@rulebrekerdothunter.com',
    password: 'eliterulebrker@220709',
    role: 'admin',
    caLevel: 'Super Administrator',
    registrationNo: 'FCA-088312',
    phone: '+91 98000 11223',
    isActive: true,
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
    createdAt: '2026-07-01T10:00:00.000Z'
  }
];

const DEFAULT_LECTURES = [
  {
    id: 'lec-1',
    title: 'Ind AS 115: 5-Step Model for Revenue Recognition with Practical Scenarios',
    subjectId: 'sub-1',
    chapter: 'Accounting Standards & Ind AS',
    description: 'Master the core 5-step framework under Ind AS 115: Identifying contracts, identifying performance obligations, determining transaction price, allocation, and revenue recognition over time vs at a point in time.',
    videoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    thumbnail: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
    durationMinutes: 48,
    isPublished: true,
    views: 342,
    createdAt: '2026-09-01T10:00:00.000Z'
  },
  {
    id: 'lec-2',
    title: 'Companies Act 2013: Board Meetings & Secretarial Standards (SS-1)',
    subjectId: 'sub-2',
    chapter: 'Management & Administration',
    description: 'Deep dive into Section 173 of Companies Act 2013: Notice requirements, quorum calculation, voting by video conferencing, and audit committee requirements under Section 177.',
    videoUrl: 'https://www.youtube-nocookie.com/embed/kJQP7kiw5Fk',
    thumbnail: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&auto=format&fit=crop&q=80',
    durationMinutes: 55,
    isPublished: true,
    views: 512,
    createdAt: '2026-09-03T14:30:00.000Z'
  },
  {
    id: 'lec-3',
    title: 'GST: In-depth Analysis of Section 16 & 17 Apportionment & Blocked Credits',
    subjectId: 'sub-4',
    chapter: 'Input Tax Credit (ITC)',
    description: 'Comprehensive line-by-line coverage of eligibility conditions under Section 16 and blocked credit items under Section 17(5) with recent CBIC notifications and circulars.',
    videoUrl: 'https://www.youtube-nocookie.com/embed/fJ9rUzIMcZQ',
    thumbnail: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=600&auto=format&fit=crop&q=80',
    durationMinutes: 62,
    isPublished: true,
    views: 684,
    createdAt: '2026-09-05T09:15:00.000Z'
  },
  {
    id: 'lec-4',
    title: 'Standard Costing: Material & Labour Variance Mastery with Reconciliation',
    subjectId: 'sub-3',
    chapter: 'Standard Costing & Variance Analysis',
    description: 'Learn rapid calculation formulas for Material Price, Usage, Mix and Yield variances, along with direct reconciliation with Financial Profit and Standard Profit.',
    videoUrl: 'https://www.youtube-nocookie.com/embed/9bZkp7q19f0',
    thumbnail: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=80',
    durationMinutes: 42,
    isPublished: true,
    views: 420,
    createdAt: '2026-09-07T11:20:00.000Z'
  },
  {
    id: 'lec-5',
    title: 'Auditing Standards: SA 500 Audit Evidence & SA 505 External Confirmations',
    subjectId: 'sub-5',
    chapter: 'Audit Evidence & Procedures',
    description: 'Understanding sufficiency and appropriateness of audit evidence, reliability of external confirmations, handling negative vs positive confirmation requests and non-responses.',
    videoUrl: 'https://www.youtube-nocookie.com/embed/L_LUpnjgPso',
    thumbnail: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&auto=format&fit=crop&q=80',
    durationMinutes: 50,
    isPublished: true,
    views: 310,
    createdAt: '2026-09-08T16:45:00.000Z'
  }
];

const DEFAULT_TESTS = [
  // 1. Accounting (3 tests)
  {
    id: 'tst-1',
    title: 'Ind AS 115 Revenue Recognition Speed Assessment',
    subjectId: 'sub-1',
    chapter: 'Accounting Standards / Ind AS',
    description: 'Comprehensive 5-question mock test testing your grasp on variable consideration, performance obligations, and contract modifications under Ind AS 115. Positive marking: +2.0, Negative marking: -0.5.',
    durationMinutes: 10,
    totalQuestions: 5,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 3,
    isPublished: true,
    attemptsCount: 142,
    createdAt: '2026-09-08T10:00:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-30T23:59:59.000Z'
  },
  {
    id: 'tst-4',
    title: 'Bank Reconciliation Statement (BRS) & Cash Book Practice Test',
    subjectId: 'sub-1',
    chapter: 'Bank Reconciliation Statement',
    description: 'Solve adjustments of uncredited cheques, bank charges, direct debits, and timing differences to reconcile balance as per Cash Book and Pass Book.',
    durationMinutes: 12,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 3,
    isPublished: true,
    attemptsCount: 98,
    createdAt: '2026-09-05T14:30:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-30T23:59:59.000Z'
  },
  {
    id: 'tst-5',
    title: 'Partnership Accounts: Goodwill Valuation & Profit Sharing Mock Test',
    subjectId: 'sub-1',
    chapter: 'Partnership Accounts',
    description: 'Focus on admission, retirement, sacrifice and gaining ratio calculations, super profit method, and revaluation account treatment under partnership fundamentals.',
    durationMinutes: 15,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 2,
    isPublished: true,
    attemptsCount: 65,
    createdAt: '2026-09-02T09:15:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-30T23:59:59.000Z'
  },

  // 2. Business Law (2 tests)
  {
    id: 'tst-2',
    title: 'The Indian Contract Act 1872: Essential Elements & Performance Challenge',
    subjectId: 'sub-2',
    chapter: 'The Indian Contract Act 1872',
    description: 'Test your understanding of offer, acceptance, lawful consideration, free consent, capacity of parties, and discharge of contracts under the Indian Contract Act 1872. Standard negative marking applies.',
    durationMinutes: 12,
    totalQuestions: 5,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 2,
    isPublished: true,
    attemptsCount: 184,
    createdAt: '2026-09-09T11:00:00.000Z',
    startDate: '2026-09-05T00:00:00.000Z',
    endDate: '2026-10-15T23:59:59.000Z'
  },
  {
    id: 'tst-6',
    title: 'The Sale of Goods Act 1930 & Commercial Mercantile Law',
    subjectId: 'sub-2',
    chapter: 'Sale of Goods & Mercantile Law',
    description: 'Critical MCQs covering conditions & warranties, doctrine of Caveat Emptor, rights of an unpaid seller, and transfer of property in goods.',
    durationMinutes: 10,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 3,
    isPublished: true,
    attemptsCount: 76,
    createdAt: '2026-09-03T16:00:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-30T23:59:59.000Z'
  },

  // 3. Business Economics (3 tests)
  {
    id: 'tst-3',
    title: 'Theory of Demand and Supply & Elasticity Assessment',
    subjectId: 'sub-3',
    chapter: 'Demand, Supply & Consumer Behaviour',
    description: 'Master price elasticity, cross elasticity, law of diminishing marginal utility, indifference curve analysis, and market equilibrium shifts.',
    durationMinutes: 10,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 2,
    isPublished: true,
    attemptsCount: 120,
    createdAt: '2026-09-07T08:00:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-20T23:59:59.000Z'
  },
  {
    id: 'tst-7',
    title: 'Theory of Production and Cost Analysis Mock Paper',
    subjectId: 'sub-3',
    chapter: 'Production & Cost',
    description: 'Covers law of variable proportions, returns to scale, short-run vs long-run cost curves, isoquants, and optimum factor combination.',
    durationMinutes: 12,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 2,
    isPublished: true,
    attemptsCount: 88,
    createdAt: '2026-09-06T12:00:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-30T23:59:59.000Z'
  },
  {
    id: 'tst-8',
    title: 'Price Determination in Different Markets & Business Cycles',
    subjectId: 'sub-3',
    chapter: 'Market Structures & Business Cycles',
    description: 'Detailed assessment on Perfect Competition, Monopoly, Monopolistic Competition, Oligopoly kinked demand curve, and phases of business cycles.',
    durationMinutes: 10,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 3,
    isPublished: true,
    attemptsCount: 52,
    createdAt: '2026-09-01T15:30:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-30T23:59:59.000Z'
  },

  // 4. Quantitative Aptitude (2 tests)
  {
    id: 'tst-9',
    title: 'Ratio, Proportion, Indices and Logarithms Speed Challenge',
    subjectId: 'sub-4',
    chapter: 'Ratio, Indices & Logarithms',
    description: 'Quick computation test testing algebraic simplifications, properties of logarithms, laws of indices, and continued proportions.',
    durationMinutes: 12,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 3,
    isPublished: true,
    attemptsCount: 160,
    createdAt: '2026-09-10T13:45:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-30T23:59:59.000Z'
  },
  {
    id: 'tst-10',
    title: 'Mathematics of Finance: Simple & Compound Interest and Annuity',
    subjectId: 'sub-4',
    chapter: 'Mathematics of Finance',
    description: 'Practical computation problems on effective rate of interest, future value and present value of ordinary annuity, and sinking fund concepts.',
    durationMinutes: 15,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 2,
    isPublished: true,
    attemptsCount: 110,
    createdAt: '2026-09-04T10:20:00.000Z',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-30T23:59:59.000Z'
  }
];

const DEFAULT_QUESTIONS = [
  // tst-1: Ind AS 115 Revenue Recognition
  {
    id: 'q-101',
    testId: 'tst-1',
    number: 1,
    text: 'Under Ind AS 115, which of the following is NOT one of the 5 steps in the revenue recognition model?',
    optionA: 'Identify the contract(s) with a customer',
    optionB: 'Determine the transaction price',
    optionC: 'Estimate the fair value of non-monetary assets surrendered',
    optionD: 'Allocate transaction price to performance obligations',
    correctOption: 'C',
    marks: 2.0,
    explanation: 'The 5 steps under Ind AS 115 are: (1) Identify contract with customer, (2) Identify performance obligations, (3) Determine transaction price, (4) Allocate transaction price, and (5) Recognize revenue. Estimating fair value of surrendered assets is an Ind AS 16 / Ind AS 38 concept, not part of Ind AS 115.'
  },
  {
    id: 'q-102',
    testId: 'tst-1',
    number: 2,
    text: 'A contract modification is accounted for as a separate contract under Ind AS 115 if:',
    optionA: 'The scope increases because of distinct goods/services and the price reflects standalone selling prices.',
    optionB: 'The customer requests a 10% discount on the remaining goods.',
    optionC: 'The remaining goods are not distinct from goods transferred prior to modification.',
    optionD: 'The entity chooses to treat it as a cumulative catch-up adjustment.',
    correctOption: 'A',
    marks: 2.0,
    explanation: 'According to paragraph 20 of Ind AS 115, a contract modification is treated as a separate contract if the scope increases due to addition of promised goods/services that are distinct AND the price increases by an amount reflecting standalone selling prices.'
  },
  {
    id: 'q-103',
    testId: 'tst-1',
    number: 3,
    text: 'Under Ind AS 115, variable consideration is included in transaction price only to the extent that:',
    optionA: 'Management expects an audit sign-off by the statutory auditor.',
    optionB: 'It is highly probable that a significant reversal in cumulative revenue will not occur when uncertainty is resolved.',
    optionC: 'The customer signs a formal bank guarantee for the bonus amount.',
    optionD: 'The variable amount exceeds 25% of the fixed contract value.',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Paragraph 56 of Ind AS 115 outlines the constraint on variable consideration: it is included only if it is highly probable that a significant reversal in the amount of cumulative revenue recognized will not occur once uncertainty is resolved.'
  },
  {
    id: 'q-104',
    testId: 'tst-1',
    number: 4,
    text: 'Which indicator suggests that performance obligation is satisfied over time rather than at a point in time?',
    optionA: 'The customer has physical possession of the asset.',
    optionB: 'The customer has legal title to the asset.',
    optionC: 'The entity’s performance does not create an asset with alternative use and entity has an enforceable right to payment for performance completed to date.',
    optionD: 'The customer has accepted the goods after factory trial run.',
    correctOption: 'C',
    marks: 2.0,
    explanation: 'Ind AS 115 Paragraph 35(c) states that an entity transfers control over time if the performance does not create an asset with an alternative use to the entity AND the entity has an enforceable right to payment for performance completed to date.'
  },
  {
    id: 'q-105',
    testId: 'tst-1',
    number: 5,
    text: 'Incremental costs of obtaining a contract with a customer are capitalized under Ind AS 115 if:',
    optionA: 'The costs are incurred regardless of whether the contract is obtained.',
    optionB: 'The entity expects to recover those costs.',
    optionC: 'The amortization period is 6 months or less and entity expenses them immediately.',
    optionD: 'The costs consist of general administrative overheads.',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Ind AS 115 Paragraph 91 requires entities to recognize as an asset the incremental costs of obtaining a contract if the entity expects to recover them (e.g. sales commission paid only upon winning the contract).'
  },

  // tst-2: Companies Act 2013
  {
    id: 'q-201',
    testId: 'tst-2',
    number: 1,
    text: 'What is the minimum notice period required for calling a meeting of the Board of Directors under Section 173(3) of the Companies Act 2013?',
    optionA: '14 clear days',
    optionB: '7 days',
    optionC: '21 clear days',
    optionD: '3 days',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Section 173(3) requires not less than 7 days notice in writing to every director at his address registered with the company.'
  },
  {
    id: 'q-202',
    testId: 'tst-2',
    number: 2,
    text: 'What is the required statutory quorum for a Board meeting of a public company under Section 174(1)?',
    optionA: '1/3rd of total strength or 2 directors, whichever is higher.',
    optionB: '1/4th of total strength or 3 directors, whichever is lower.',
    optionC: '5 directors present in person.',
    optionD: 'Half of total strength including the Chairman.',
    correctOption: 'A',
    marks: 2.0,
    explanation: 'Section 174(1) provides that the quorum for a Board meeting shall be 1/3rd of its total strength or two directors, whichever is higher.'
  },
  {
    id: 'q-203',
    testId: 'tst-2',
    number: 3,
    text: 'Which matter CANNOT be approved through a circular resolution passed under Section 175?',
    optionA: 'Noting the declaration of independence by independent directors',
    optionB: 'Approval of annual financial statements and Board’s report',
    optionC: 'Allotment of shares within authorized capital',
    optionD: 'Opening of a new bank current account',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Under Section 179(3) read with Rule 8 of Companies Rules, approval of annual financial statements and Board report MUST be passed at a physical/video Board meeting and cannot be passed by circular resolution.'
  },
  {
    id: 'q-204',
    testId: 'tst-2',
    number: 4,
    text: 'Under Section 173(1), what is the maximum permissible gap between two consecutive Board meetings?',
    optionA: '90 days',
    optionB: '120 days',
    optionC: '60 days',
    optionD: '180 days',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Section 173(1) mandates at least four Board meetings every year with not more than 120 days intervening between two consecutive meetings.'
  },
  {
    id: 'q-205',
    testId: 'tst-2',
    number: 5,
    text: 'In a company where the total strength of the Board is 9 directors, and 7 directors are interested in a contract, what is the valid quorum under Section 174(3)?',
    optionA: 'No meeting can be held; must refer to General Meeting.',
    optionB: '2 disinterested directors present at the meeting.',
    optionC: 'The interested directors can vote with prior ROC permission.',
    optionD: 'Quorum must be at least 3 directors.',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Under Section 174(3), where the number of interested directors exceeds or is equal to 2/3rds of total strength, the remaining non-interested directors present (not being less than 2) shall constitute the quorum.'
  },

  // tst-3: Theory of Demand and Supply (Business Economics)
  {
    id: 'q-301',
    testId: 'tst-3',
    number: 1,
    text: 'When the percentage change in quantity demanded is less than the percentage change in price, the demand is said to be:',
    optionA: 'Unitary elastic',
    optionB: 'Relatively inelastic',
    optionC: 'Perfectlys elastic',
    optionD: 'Relatively elastic',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'When elasticity of demand Ep < 1, percentage change in quantity demanded is less than percentage change in price, indicating relatively inelastic demand.'
  },
  {
    id: 'q-302',
    testId: 'tst-3',
    number: 2,
    text: 'If two goods are complementary goods (e.g. pen and ink), the cross elasticity of demand between them will be:',
    optionA: 'Positive',
    optionB: 'Negative',
    optionC: 'Zero',
    optionD: 'Infinity',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Complementary goods have a negative cross price elasticity because an increase in the price of one leads to a decrease in the demand for the other.'
  },
  {
    id: 'q-303',
    testId: 'tst-3',
    number: 3,
    text: 'The point of satiety in consumer utility theory occurs when:',
    optionA: 'Total utility is minimum',
    optionB: 'Marginal utility is zero',
    optionC: 'Marginal utility is maximum',
    optionD: 'Average utility is equal to price',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'The point of satiety is the state where total utility reaches its maximum and marginal utility becomes zero.'
  },
  {
    id: 'q-304',
    testId: 'tst-3',
    number: 4,
    text: 'An indifference curve is convex to the origin because of:',
    optionA: 'Law of increasing marginal utility',
    optionB: 'Diminishing Marginal Rate of Substitution (MRS)',
    optionC: 'Constant returns to scale',
    optionD: 'Monotonic preference assumption only',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'The convexity of an indifference curve reflects the diminishing marginal rate of substitution between two commodities.'
  },

  // tst-4: Bank Reconciliation Statement (Accounting)
  {
    id: 'q-401',
    testId: 'tst-4',
    number: 1,
    text: 'When preparing a Bank Reconciliation Statement starting with Debit Balance as per Cash Book, cheques issued but not presented for payment should be:',
    optionA: 'Deducted',
    optionB: 'Added',
    optionC: 'Ignored',
    optionD: 'Doubled and deducted',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Cheques issued were deducted from Cash Book but bank has not yet debited them, so the Pass Book balance is higher. Hence, we add back.'
  },
  {
    id: 'q-402',
    testId: 'tst-4',
    number: 2,
    text: 'A debit balance in the customer’s account in the Bank Pass Book indicates:',
    optionA: 'Favourable bank balance',
    optionB: 'Bank Overdraft',
    optionC: 'Cash in hand',
    optionD: 'Error in customer ledger',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'From the bank’s perspective, a debit balance indicates the customer owes money to the bank, which signifies a Bank Overdraft.'
  },
  {
    id: 'q-403',
    testId: 'tst-4',
    number: 3,
    text: 'Direct collection of interest and dividends by the bank on behalf of the customer causes:',
    optionA: 'Pass Book balance to be higher than Cash Book balance',
    optionB: 'Cash Book balance to be higher than Pass Book balance',
    optionC: 'No difference in balances',
    optionD: 'An overdraft in Pass Book',
    correctOption: 'A',
    marks: 2.0,
    explanation: 'Direct collection is credited in the Pass Book immediately, making Pass Book balance higher until recorded in the Cash Book.'
  },
  {
    id: 'q-404',
    testId: 'tst-4',
    number: 4,
    text: 'Under the Diminishing Balance Method, depreciation is calculated on the:',
    optionA: 'Original cost of the asset',
    optionB: 'Written Down Value (WDV) at beginning of year',
    optionC: 'Scrap value of the asset',
    optionD: 'Replacement market cost',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Under WDV or diminishing balance method, depreciation is computed on the reducing book value at the beginning of each financial year.'
  },

  // tst-5: Partnership Accounts (Accounting)
  {
    id: 'q-501',
    testId: 'tst-5',
    number: 1,
    text: 'In the absence of an explicit Partnership Agreement, what rate of interest is allowed on advances/loans given by a partner to the firm?',
    optionA: '12% per annum',
    optionB: '6% per annum',
    optionC: 'No interest is allowed',
    optionD: 'Bank base lending rate',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Under Section 13(d) of the Indian Partnership Act 1932, a partner is entitled to interest at 6% p.a. on any loan or advance given beyond capital.'
  },
  {
    id: 'q-502',
    testId: 'tst-5',
    number: 2,
    text: 'The Sacrificing Ratio of existing partners at the time of admission of a new partner is defined as:',
    optionA: 'New Profit Ratio - Old Profit Ratio',
    optionB: 'Old Profit Ratio - New Profit Ratio',
    optionC: 'Capital Ratio - Gaining Ratio',
    optionD: 'Old Ratio multiplied by New Ratio',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Sacrificing Ratio = Old Profit Sharing Ratio - New Profit Sharing Ratio.'
  },
  {
    id: 'q-503',
    testId: 'tst-5',
    number: 3,
    text: 'Super Profit under goodwill valuation is calculated as:',
    optionA: 'Average Profit - Normal Profit',
    optionB: 'Normal Profit - Capital Employed',
    optionC: 'Weighted Profit divided by Normal Rate',
    optionD: 'Net Profit before tax minus dividends',
    correctOption: 'A',
    marks: 2.0,
    explanation: 'Super Profit = Actual/Average Maintainable Profit - Normal Profit.'
  },
  {
    id: 'q-504',
    testId: 'tst-5',
    number: 4,
    text: 'Profit or loss arising on the revaluation of assets and liabilities upon admission of a partner is credited or debited to:',
    optionA: 'All partners including new partner in new ratio',
    optionB: 'Old partners’ capital accounts in old profit sharing ratio',
    optionC: 'Sacrificing partners only in sacrificing ratio',
    optionD: 'Reserve capital account',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Revaluation profit/loss pertains to the period prior to the admission of the new partner, hence belongs strictly to old partners in their old ratio.'
  },

  // tst-6: Sale of Goods & Commercial Law (Business Law)
  {
    id: 'q-601',
    testId: 'tst-6',
    number: 1,
    text: 'Under the Sale of Goods Act 1930, a Condition is a stipulation:',
    optionA: 'Collateral to the main purpose of the contract',
    optionB: 'Essential to the main purpose of the contract',
    optionC: 'Optional and non-binding',
    optionD: 'Governed solely by customs of trade',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Section 12(2) defines a Condition as a stipulation essential to the main purpose of the contract, breach of which gives rise to a right to treat the contract as repudiated.'
  },
  {
    id: 'q-602',
    testId: 'tst-6',
    number: 2,
    text: 'The Latin maxim "Caveat Emptor" under commercial law implies:',
    optionA: 'Let the seller beware',
    optionB: 'Let the buyer beware',
    optionC: 'Let the agent beware',
    optionD: 'Goods must match market price',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Caveat Emptor signifies "Let the buyer beware"—the buyer must satisfy himself about the quality and fitness of goods before purchase.'
  },
  {
    id: 'q-603',
    testId: 'tst-6',
    number: 3,
    text: 'An unpaid seller of goods can exercise his Right of Lien when:',
    optionA: 'The goods are sold on credit and credit term has not expired',
    optionB: 'He is in possession of the goods as agent or bailee for buyer',
    optionC: 'The buyer has obtained lawful possession of the goods',
    optionD: 'The goods have been handed over to a common carrier without reservation',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Under Section 47, an unpaid seller can retain possession of goods (Right of Lien) until payment if the goods are still in his actual possession.'
  },
  {
    id: 'q-604',
    testId: 'tst-6',
    number: 4,
    text: 'Which characteristic of an incorporated company ensures that the death or insolvency of members does NOT affect its existence?',
    optionA: 'Limited liability',
    optionB: 'Perpetual succession',
    optionC: 'Separate property ownership',
    optionD: 'Capacity to sue',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Perpetual succession means members may come and go, but the company continues in existence until dissolved by law.'
  },

  // tst-7: Production & Cost Analysis (Business Economics)
  {
    id: 'q-701',
    testId: 'tst-7',
    number: 1,
    text: 'In the Law of Variable Proportions, Stage II (Stage of Diminishing Returns) ends where:',
    optionA: 'Marginal product equals zero and total product is maximum',
    optionB: 'Average product is maximum',
    optionC: 'Marginal product is equal to average product',
    optionD: 'Total product begins to rise steeply',
    correctOption: 'A',
    marks: 2.0,
    explanation: 'Stage II concludes where MP = 0, at which point Total Product reaches its absolute maximum.'
  },
  {
    id: 'q-702',
    testId: 'tst-7',
    number: 2,
    text: 'The mathematical shape of the Average Fixed Cost (AFC) curve is a:',
    optionA: 'U-shaped curve',
    optionB: 'Rectangular Hyperbola',
    optionC: 'Straight horizontal line',
    optionD: 'Inverted S-curve',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Since TFC = AFC × Q remains constant, the AFC curve forms a rectangular hyperbola asymptotic to both axes.'
  },
  {
    id: 'q-703',
    testId: 'tst-7',
    number: 3,
    text: 'When Marginal Cost (MC) is less than Average Cost (AC), the Average Cost curve is:',
    optionA: 'Rising',
    optionB: 'Falling',
    optionC: 'At its minimum',
    optionD: 'Horizontal',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Whenever MC is below AC, it pulls AC downwards; hence Average Cost is falling.'
  },
  {
    id: 'q-704',
    testId: 'tst-7',
    number: 4,
    text: 'Returns to Scale is a concept applicable strictly to the:',
    optionA: 'Short-run production period',
    optionB: 'Long-run production period',
    optionC: 'Very short market period',
    optionD: 'Fixed proportion technology only',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Returns to scale examines how output responds when ALL input factors are varied simultaneously in the long run.'
  },

  // tst-8: Market Structures & Business Cycles (Business Economics)
  {
    id: 'q-801',
    testId: 'tst-8',
    number: 1,
    text: 'Under Perfect Competition, the demand curve faced by an individual firm is:',
    optionA: 'Downward sloping',
    optionB: 'Perfectlys elastic (Horizontal)',
    optionC: 'Perfectlys inelastic (Vertical)',
    optionD: 'Kinked at market price',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'In pure competition, the firm is a price taker, facing a perfectly horizontal demand curve where P = AR = MR.'
  },
  {
    id: 'q-802',
    testId: 'tst-8',
    number: 2,
    text: 'Paul Sweezy’s Kinked Demand Curve model is formulated to explain:',
    optionA: 'Product differentiation in monopolistic competition',
    optionB: 'Price rigidity under Oligopoly',
    optionC: 'Price discrimination under Monopoly',
    optionD: 'Collusion in cartels',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'The kinked demand curve explains why oligopoly firms maintain rigid prices despite cost variations.'
  },
  {
    id: 'q-803',
    testId: 'tst-8',
    number: 3,
    text: 'In the phases of a Business Cycle, the highest point of economic expansion is designated as:',
    optionA: 'Trough',
    optionB: 'Peak (Boom)',
    optionC: 'Contraction',
    optionD: 'Recovery',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'The Peak or Boom represents the turning point where economic activity reaches maximum capacity before contraction begins.'
  },
  {
    id: 'q-804',
    testId: 'tst-8',
    number: 4,
    text: 'Under Monopoly market structure, Marginal Revenue (MR) is always:',
    optionA: 'Equal to Average Revenue (AR)',
    optionB: 'Less than Average Revenue (AR)',
    optionC: 'Greater than Average Revenue (AR)',
    optionD: 'Constant and horizontal',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'To sell an additional unit, a monopolist must lower the price of all units, meaning MR lies below AR (price).'
  },

  // tst-9: Ratio, Proportion, Indices & Logarithms (Quantitative Aptitude)
  {
    id: 'q-901',
    testId: 'tst-9',
    number: 1,
    text: 'If a : b = 2 : 3 and b : c = 4 : 5, then the compound ratio a : b : c is equal to:',
    optionA: '8 : 12 : 15',
    optionB: '6 : 8 : 15',
    optionC: '2 : 4 : 5',
    optionD: '4 : 6 : 10',
    correctOption: 'A',
    marks: 2.0,
    explanation: 'Multiply a:b by 4 to get 8:12, and b:c by 3 to get 12:15. Thus, a : b : c = 8 : 12 : 15.'
  },
  {
    id: 'q-902',
    testId: 'tst-9',
    number: 2,
    text: 'What is the numerical value of log₂(32)?',
    optionA: '4',
    optionB: '5',
    optionC: '6',
    optionD: '16',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Since 32 = 2⁵, log₂(2⁵) = 5 × log₂(2) = 5 × 1 = 5.'
  },
  {
    id: 'q-903',
    testId: 'tst-9',
    number: 3,
    text: 'The sub-duplicate ratio of 49 : 81 is:',
    optionA: '7 : 9',
    optionB: '2401 : 6561',
    optionC: '9 : 7',
    optionD: '343 : 729',
    correctOption: 'A',
    marks: 2.0,
    explanation: 'Sub-duplicate ratio of a : b is √a : √b. Hence, √49 : √81 = 7 : 9.'
  },
  {
    id: 'q-904',
    testId: 'tst-9',
    number: 4,
    text: 'If x = (25)^(1/2) × (8)^(1/3), the value of x is:',
    optionA: '7',
    optionB: '10',
    optionC: '20',
    optionD: '15',
    correctOption: 'B',
    marks: 2.0,
    explanation: '√25 = 5 and ∛8 = 2. Therefore, 5 × 2 = 10.'
  },

  // tst-10: Mathematics of Finance (Quantitative Aptitude)
  {
    id: 'q-1001',
    testId: 'tst-10',
    number: 1,
    text: 'What is the effective annual rate of interest corresponding to a nominal rate of 6% per annum compounded semi-annually?',
    optionA: '6.00%',
    optionB: '6.09%',
    optionC: '6.15%',
    optionD: '6.36%',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Effective Rate = (1 + i/m)^m - 1 = (1 + 0.06/2)² - 1 = (1.03)² - 1 = 1.0609 - 1 = 6.09%.'
  },
  {
    id: 'q-1002',
    testId: 'tst-10',
    number: 2,
    text: 'The difference between simple interest and compound interest on ₹ 10,000 for 2 years at 10% per annum is:',
    optionA: '₹ 50',
    optionB: '₹ 100',
    optionC: '₹ 150',
    optionD: '₹ 200',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Difference for 2 years = P × (r/100)² = 10,000 × (0.10)² = 10,000 × 0.01 = ₹ 100.'
  },
  {
    id: 'q-1003',
    testId: 'tst-10',
    number: 3,
    text: 'An annuity in which cash payments are made at the END of each period is known as:',
    optionA: 'Annuity Due',
    optionB: 'Ordinary Annuity (Immediate Annuity)',
    optionC: 'Perpetuity',
    optionD: 'Deferred Annuity Due',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'An annuity where payments occur at the end of each payment period is defined as an Ordinary Annuity or Immediate Annuity.'
  },
  {
    id: 'q-1004',
    testId: 'tst-10',
    number: 4,
    text: 'A sinking fund is primarily established by an organization for:',
    optionA: 'Funding day-to-day office stationary purchases',
    optionB: 'Accumulating funds to redeem a long-term liability or replace an asset',
    optionC: 'Paying interim quarterly dividends to shareholders',
    optionD: 'Paying income tax advance penalties',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'A sinking fund is created by periodically setting aside amounts to accumulate a specific capital sum needed to pay off a bond or replace machinery.'
  }
];

const DEFAULT_ATTEMPTS = [
  {
    id: 'att-1',
    testId: 'tst-1',
    userId: 'usr-student-2',
    userName: 'Priya Patel',
    attemptNumber: 1,
    status: 'Completed',
    startedAt: '2026-09-08T10:00:00.000Z',
    submittedAt: '2026-09-08T10:08:15.000Z',
    timeTakenSeconds: 495,
    correctCount: 5,
    wrongCount: 0,
    unattemptedCount: 0,
    grossMarks: 10.0,
    negativePenalty: 0.0,
    finalScore: 10.0,
    percentage: 100.0,
    userAnswers: { 'q-101': 'C', 'q-102': 'A', 'q-103': 'B', 'q-104': 'C', 'q-105': 'B' }
  },
  {
    id: 'att-2',
    testId: 'tst-1',
    userId: 'usr-student-3',
    userName: 'Amit Roy',
    attemptNumber: 1,
    status: 'Completed',
    startedAt: '2026-09-09T14:10:00.000Z',
    submittedAt: '2026-09-09T14:18:40.000Z',
    timeTakenSeconds: 520,
    correctCount: 4,
    wrongCount: 1,
    unattemptedCount: 0,
    grossMarks: 8.0,
    negativePenalty: 0.5,
    finalScore: 7.5,
    percentage: 75.0,
    userAnswers: { 'q-101': 'C', 'q-102': 'A', 'q-103': 'B', 'q-104': 'C', 'q-105': 'A' }
  }
];

// Descriptive Tests & Assignments with Question Paper PDF & Answer Sheet PDF support
const DEFAULT_ASSIGNMENTS = [
  {
    "createdAt": "2026-09-14T17:58:15.574Z",
    "deadline": "2026-10-14T17:58:15.574Z",
    "description": "Practice descriptive questions from Chapter 1 \u2013 Indian Regulatory Framework, covering IBBI, SEBI, RBI, Ministry of Finance, and the Judiciary.",
    "durationMinutes": 25,
    "examLevel": "CA Foundation",
    "expiryTime": "2026-10-14T17:58:15.574Z",
    "hideFromNonEligible": false,
    "id": "asg-1789408695574",
    "isLive": false,
    "isPublished": true,
    "maximumMarks": 20,
    "questionPdfData": "data:application/pdf;base64,JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUiAvRjMgNCAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YxIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKMyAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYS1Cb2xkIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMiAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EtT2JsaXF1ZSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjMgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iago1IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgNTk1LjI3NTYgODQxLjg4OTggXSAvUGFyZW50IDggMCBSIC9SZXNvdXJjZXMgPDwKL0V4dEdTdGF0ZSA8PAovZ1JMczAgPDwKL2NhIC4xOAo+Pgo+PiAvRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNiAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDggMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9BdXRob3IgKFwoYW5vbnltb3VzXCkpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyNjA5MTQxNzUwNDArMDAnMDAnKSAvQ3JlYXRvciAoXCh1bnNwZWNpZmllZFwpKSAvS2V5d29yZHMgKCkgL01vZERhdGUgKEQ6MjAyNjA5MTQxNzUwNDArMDAnMDAnKSAvUHJvZHVjZXIgKFJlcG9ydExhYiBQREYgTGlicmFyeSAtIFwob3BlbnNvdXJjZVwpKSAKICAvU3ViamVjdCAoXCh1bnNwZWNpZmllZFwpKSAvVGl0bGUgKFwoYW5vbnltb3VzXCkpIC9UcmFwcGVkIC9GYWxzZQo+PgplbmRvYmoKOCAwIG9iago8PAovQ291bnQgMSAvS2lkcyBbIDUgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iago5IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDE1MTIKPj4Kc3RyZWFtCkdhdWBSOWlMKDMmQUBaY3FBPyg2QEVGW0tGJV4rUU1RSWEjOD5jKmJscDNVJ0BXOlttbTE8L1E1Q1FpOU1BJHNCVyJgR2JuOnI5NXBOcyo5Nyk/X15jMltaPkpETDkkMC45WCRLK1VwVDMiM089cTtDSzI7Kk1qST5AclEjamE2IXMwIWJedD9CYXAsbDFqdCFDO0RtUy1XdVo4T100a0NpUF9iYVdZK0FSNywhWS9TNjxlamdyIVlyNnM/STM2Pl9MZiopO20+cGYkQ0g1UG1KTUZsWz81ZFFOPyQhdDdBXUkrbS5KcW9ycDVdXGplYkcqUiojVEctYidnZFtlXjZia2dzOGxtZGdeYDI3UT5gMDIrRTxoLkUjXWtZJWdFWSxdKDVHO3FrZ0wsIU0qSU05WkEyNnE/PltQT3JZZyclN0tpQjxMbDhvbWRaU20hP2IxNEhvQE1PRW1ibVshKCZXWEttZS1CLVlWWU1BbDxka2dwXFhIbnFmZFAnO1BQP2YlcUg6SEFLXWE2I2thXzQ1U0gjdUY5OyhDL3UpakosLlExYEgpUyMuPWkqViVWS3JoJU8qZmwtcXNCMjE9PEwuVzxBY08xJjp0S2FMclIlPHFAdURmTTgpQUMpZ0cnNyU8Xm5mMjctZFtDYkA5YiJoXS1zX2kpPCxwLXA8PkY1ZFBZP0I2cWJaPDtLc0hFLTplXio2PzZfJ2JzaFpkWChIJEg8QyREXjRSYDI6YiNPT0tKdDZiPGQ0WCc+WVomM3FaTEgyV0BsVDluWmMuZE0xIlk7Z04pTGRnV0QwJS1iTjpcRV4raXI/UmJBXzM5Vz43Lzl1OSNpPGRGPFkuZGM+JVswNEA+P15cZ0JVYWVsb01QSzhUTy5fXVY3aik+RGAoQUdcXj1pJnJeLztuUmA0YjpOP11KTyhAQ3ApN1syVDNoKC1JIyUyPydCUjNaPz5QVFlJRy9pK1ljJ1lmalVvVGs4UFlwIV03I2RXUk10c3A3YyYzME0iVUxOUTFEUidjNUtnK09bOUczTCE4Z3RpOzYmWVFrSE1NcDpzITNPKm1BQGpqPWdGWGZZXSJVXm8mXig9Xl9WNlNvM1QlW0omPFhjImtPSnEmLnNWOWI+PFRKVlRYbDVFcDUsW1Y4bGovKE0iJk9QXGEyOi46ayJdLzFbM01FVDRJXFIvL0JoJ2NSJVteLTlUMCtQbUUmT14uKD50RydLI2FZIUNKVHFiLVtfamZ0JSNaNnRUTiI7V1VuUzhhNFwhLnQ4YzA5dXEkSWlHNXNNRjcvQ1orIi05QlE8Ol9kYWRbJkdiS2VVPUFmNXIobyg1ViU9XiM2ZmcwJjdBJCkuYXBhXUBoaUNrJjdmPVwtVi8tZ19sbFwjay1pJjRXPlhuMlgvOERTW08rOnNgR0VZOFZmJkI6Rz0wUiktREZpIjdBQiZrZ2VFWWFfRiJNQFUvPCFHa2p0WzJEQ0RLclZqY0lub0IwODRCXWEsQDBoPVpuOjhVKHA1L1NwQCkmMkZzayMlZl5MZSU4PzwobjhxaUk4LFdhKlQ6XjldaVwqP2UyVVhAWy5BSG9cPCRjMUc9KmdiSWNlOShwYlk/W1NtKU84TjNSdDlxYlBaNUdITlJeWTkyISU5Y0AvMlF0K0NtKlskSWBsOz1xYmNROCNDWDM+aFtlQiZbImpCJnUkSUVEQlRgV2ZCSmpSdV0pWGBlU08yQyFKby9Dai9xZml0QT1wRWtubSxaNy9WLlRRNFc9RHRgQF0tRi5Hbk9ZIk9cbEgsTkAkLWxLPm46SSJMbmRgVilsSDwxNGlbTzFvJ0I6Pj1rcXRobzhhbCY9YCYtODhSazdgRl1UdVlESjZjbWJ1K1gwITNmUkNYI0BmYWIiPjhcOidrLHIhOSJzR0glRWFeJ0dwOjgpNj5sNFZZTE1EQyspdTQ0b2hEczMqK1FbQGIraW42cT5dR2JDLzpGST9gZXFOYVQ2J1UvSTRSP1lzSyokIm5eSWMyU2N+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDEwCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMTEyIDAwMDAwIG4gCjAwMDAwMDAyMTkgMDAwMDAgbiAKMDAwMDAwMDMzMSAwMDAwMCBuIAowMDAwMDAwNDQ2IDAwMDAwIG4gCjAwMDAwMDA2ODcgMDAwMDAgbiAKMDAwMDAwMDc1NSAwMDAwMCBuIAowMDAwMDAxMDM1IDAwMDAwIG4gCjAwMDAwMDEwOTQgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8ZmYyZTY1YWE0NzczZDliODg5OWE0MDY5ZjU2YzQ0NWY+PGZmMmU2NWFhNDc3M2Q5Yjg4OTlhNDA2OWY1NmM0NDVmPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA3IDAgUgovUm9vdCA2IDAgUgovU2l6ZSAxMAo+PgpzdGFydHhyZWYKMjY5NwolJUVPRgo=",
    "questionPdfId": "question_44004558fc09.pdf",
    "questionPdfName": "ExcellenceCA_Law_IRF_Test1.pdf",
    "requiredTier": "free",
    "status": "Published",
    "subject": "Business Law",
    "subjectId": "sub-2",
    "title": "Indian Regulatory Framework \u2014 Descriptive Practice Test 1",
    "topic": "Indian Regulatory Framework"
  },
  {
    "createdAt": "2026-09-14T18:04:04.746Z",
    "deadline": "2026-10-14T18:04:04.746Z",
    "description": "Practice descriptive questions on types of laws, history of law, Code of Hammurabi, Twelve Tables of Rome, and the role and functions of MCA.",
    "durationMinutes": 25,
    "examLevel": "CA Foundation",
    "expiryTime": "2026-10-14T18:04:04.746Z",
    "hideFromNonEligible": false,
    "id": "asg-1789409044746",
    "isLive": false,
    "isPublished": true,
    "maximumMarks": 15,
    "questionPdfData": "data:application/pdf;base64,JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUiAvRjMgNCAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YxIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKMyAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYS1Cb2xkIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMiAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EtT2JsaXF1ZSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjMgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iago1IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgNTk1LjI3NTYgODQxLjg4OTggXSAvUGFyZW50IDggMCBSIC9SZXNvdXJjZXMgPDwKL0V4dEdTdGF0ZSA8PAovZ1JMczAgPDwKL2NhIC4xOAo+Pgo+PiAvRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNiAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDggMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9BdXRob3IgKFwoYW5vbnltb3VzXCkpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyNjA5MTQxNzU4MzkrMDAnMDAnKSAvQ3JlYXRvciAoXCh1bnNwZWNpZmllZFwpKSAvS2V5d29yZHMgKCkgL01vZERhdGUgKEQ6MjAyNjA5MTQxNzU4MzkrMDAnMDAnKSAvUHJvZHVjZXIgKFJlcG9ydExhYiBQREYgTGlicmFyeSAtIFwob3BlbnNvdXJjZVwpKSAKICAvU3ViamVjdCAoXCh1bnNwZWNpZmllZFwpKSAvVGl0bGUgKFwoYW5vbnltb3VzXCkpIC9UcmFwcGVkIC9GYWxzZQo+PgplbmRvYmoKOCAwIG9iago8PAovQ291bnQgMSAvS2lkcyBbIDUgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iago5IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDE0NDUKPj4Kc3RyZWFtCkdhdWBSOTJqazEmQUlgZHFBPyhGK2ojbWBGMz84QWI4KWNzMTo7bUslakZqYGNUJCk7RnBNKDdPNUg3Pms7PGFRVT1gJ2FFcFQrKHFnNV1wSkR1QFtobl4jYkV1dGxmKSkpUiEmTVFLUm9adUtsXlw7ZnE/ZjwtK10tPSFHNDouZD0jODRJSDQ1TiU9aGpiSnNgZT1xdE11Y2RMLmBMPXIyRmwiLCpmISxlQDBEMFwmZG86XTBlT11PYjwnKXQ4MFMnPj5bZFVcRkE8a10tO0AybTBRPmgnTF0yTV1JcmI0aG06IWkzcFVrZ2kpZmUnbWF1K2NHNmw6YVxFRkttZ01mRGFaaWg6dWBfamEpWicyQ3QlMTchVEs7RihqLSdoS21qKUFtblY2Uk0+VWQ1PzdWW0dzK2VdXU8uNzAjPEJUMGRfYT1wSzE7U1gjb2FkbC45aj8/YjYzQllGImAzPl1tNUZETGBoRmtBUyY/YkVINkNjRlxUITJFUSRnTUw/W0BVMGVROzBkU0BcW2hETC5YPkNeRiZZKkZNNnReSUtgcSovclxVQi0wWC9CUWxnRS8pZWtOO00lVTByTnAvXD4xMTFCZjNmJClMbGdRVTdtLEJZM2FdLXRpXkQ5MD9Tb0hWUCNlKG0uJ1MpRm88bjlLPV48O1skQm5HVF1PJlVMNW4sVWIkL3RkR15kJUFmUEspRF8xbDRIOFtqJFFfTlBtaTtMKmFePSRLbkNeXUs9VUpdaVwtaihaPVcxNmVZJ15BamMkR3BCRDhsVnM9OjBtMVZeKnVbYWRQSV4hUUssLCRWQVJycjxbUlBGWSxpXC8jcE9VV2EvQzkwTU4sZDRDSTxsWmViMFZYLjBSaUIuWzBZVGY2S11ARTRaYk1tSmJEMjY2bUNcU1xUamVgKnQjWmUzOSZbTWZXaERmZjVILyYuVyhbIj8/I2w0Jl5YUGBtLzc3NUUkSWUlZD48USJFZyNpJVQwIihhIiNxXWg0NUQhOjRTRm9dW1owUXFCT21vZjVBIigiMlc6JlNQbUBlTCRyNmhLc2o1Imw8cG9vTz9gOjRyPDYtOiIkVSFWY0UhKGhxL1kqNGR1RGd1J3Q0dEtsWVosP2xCNitoLlFndFtua1U5SV1oP051P0UnZWI1ZktvQzQtUHJgSzZkZ24+M25bbGtDXFksa1txZDhbOVpPKEhbMihCTV4wN1pjVUo4J0FGUHU0L2BfZnVjam10UTJjcT9lIkpxUVVIXyRGYFJQRkBqWmhdI0lwYDJDN0pwR19sPV9cOkc5VDFoZ1RjMktDMzJZLDdUXlBjRy5adU5lImV1PGRBUSRuPUsqMzJUZCVxVjMqcFdxWkw4NipAY05HUVgpczEtUDthMiVCLHJHb0pAXlNDcFNmXltpJl10M3A1dUcwbmBldDsuPiJwOFcnP1M2XnBiOFtQS15UYV9iLWdyUWAlZ15jRk5xblQ0QUMmKjoqKyFySydDQXUtRE0vbksrKycsMUxxc1c2KWtfKTE1V1hqV0RjKSc9ViZQbzpOWicxLipfQWotMz9ZISdDaSxmXSNJIyZvaWVHSFglRmA9bS5OVGY/KTltPz9DZ1A7Z0BzSS1CSklmLWBubj4wODZNdS5RZlItZmBWWWVAaWpaLzhnWHRvUjFYczQyOiE+IzZvWlUkbV9FWjZvRElJKUkuR0FqKUdoLyhYNXIyX3QuXjRzIzFBPy1VbzpgdTA5PmdiJlZwaTMsR0RTOGVNcylmZk1LXDJGJzc4UWpqQVlYTzdHblQlKyVfOUxRQHRMbikraj5dSitlNjlWTUp1NWgvLyVkayxJbFVOb2pMOyY5JlcjLmkxZDNKdVNCX1NELjFhRTwmQE0xdCU0NG4zLSFwXDlramZKXyQvMGM4MzBgWUJZZjhyckRkUVEwbn4+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgMTAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAxMTIgMDAwMDAgbiAKMDAwMDAwMDIxOSAwMDAwMCBuIAowMDAwMDAwMzMxIDAwMDAwIG4gCjAwMDAwMDA0NDYgMDAwMDAgbiAKMDAwMDAwMDY4NyAwMDAwMCBuIAowMDAwMDAwNzU1IDAwMDAwIG4gCjAwMDAwMDEwMzUgMDAwMDAgbiAKMDAwMDAwMTA5NCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzwwM2NhZTU1NzliYTZmNGY5MWRjZjUyYmMxMjc0NjZlND48MDNjYWU1NTc5YmE2ZjRmOTFkY2Y1MmJjMTI3NDY2ZTQ+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDcgMCBSCi9Sb290IDYgMCBSCi9TaXplIDEwCj4+CnN0YXJ0eHJlZgoyNjMwCiUlRU9GCg==",
    "questionPdfId": "question_623d77f2ecc9.pdf",
    "questionPdfName": "ExcellenceCA_Law_IRF_Test2.pdf",
    "requiredTier": "free",
    "status": "Published",
    "subject": "Business Law",
    "subjectId": "sub-2",
    "title": "Indian Regulatory Framework \u2014 Descriptive Practice Test 2",
    "topic": "Indian Regulatory Framework"
  }
];

const DEFAULT_SUBMISSIONS = [];

class AppStore {
  constructor() {
    this.initData();
  }

  initData() {
    // Reset/seed if fresh or update admin password
    const existingUsers = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!existingUsers) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    } else {
      // Ensure admin password and username/email are updated and teachers exist
      let users = JSON.parse(existingUsers);
      
      // Force Purge problematic account @divya_nair if present in localStorage
      users = users.filter(u => u.id !== 'usr-student-26' && u.username !== 'divya_nair' && u.email !== 'divya.nair@castudent.in');
      
      const admin = users.find(u => u.role === 'admin');
      if (admin) {
        admin.password = 'eliterulebrker@220709';
        admin.email = 'adminrulebreker@rulebrekerdothunter.com';
        admin.username = 'adminrulebreker@rulebrekerdothunter.com';
        if (!admin.token) admin.token = 'token_admin_excellenceca_secret';
      }
      // Ensure teachers exist
      if (!users.some(u => u.role === 'teacher')) {
        const teachers = DEFAULT_USERS.filter(u => u.role === 'teacher');
        users.push(...teachers);
      }
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

      // Also clean from current user if logged in as divya_nair
      try {
        const cu = JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER) || 'null');
        if (cu && (cu.id === 'usr-student-26' || cu.username === 'divya_nair' || cu.email === 'divya.nair@castudent.in')) {
          localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        }
      } catch (e) {}
    }

    // Ensure subjects are seeded once with default subjects, preserving custom subjects
    const existingSubjects = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
    const subjectsSeeded = localStorage.getItem('excellenceca_subjects_seeded_v2');
    if (!existingSubjects || !subjectsSeeded) {
      localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(DEFAULT_SUBJECTS));
      localStorage.setItem('excellenceca_subjects_seeded_v2', 'true');
    }

    if (!localStorage.getItem(STORAGE_KEYS.BOOKMARKS)) {
      localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.LECTURES)) {
      localStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(DEFAULT_LECTURES));
    }

    // Ensure tests are seeded once and respect admin deletions
    const existingTests = localStorage.getItem(STORAGE_KEYS.TESTS);
    const testsSeededVersion = localStorage.getItem('excellenceca_tests_seeded_v2');
    if (!existingTests || !testsSeededVersion) {
      localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(DEFAULT_TESTS));
      localStorage.setItem('excellenceca_tests_seeded_v2', 'true');
    }

    // Ensure questions are seeded once and respect admin deletions
    const existingQuestions = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
    const questionsSeededVersion = localStorage.getItem('excellenceca_questions_seeded_v2');
    if (!existingQuestions || !questionsSeededVersion) {
      localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(DEFAULT_QUESTIONS));
      localStorage.setItem('excellenceca_questions_seeded_v2', 'true');
    }

    if (!localStorage.getItem(STORAGE_KEYS.ATTEMPTS)) {
      localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(DEFAULT_ATTEMPTS));
    }
    // Clean up legacy mock assignments, ensuring only the 2 protected tests and newly created papers remain
    if (!localStorage.getItem('excellenceca_assignments_v4')) {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(DEFAULT_ASSIGNMENTS));
      localStorage.setItem('excellenceca_assignments_v4', 'true');
    } else {
      try {
        const storedAsgs = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS) || '[]');
        const obsoleteIds = new Set(['asg-1', 'asg-2', 'asg-3', 'asg-4', 'paper-1', 'paper-2', 'paper-3', 'paper-4', 'paper-test-future-live', 'paper-test-past-live', 'paper-sched-demo', 'paper-live-demo']);
        const cleaned = storedAsgs.filter(a => a && a.id && !obsoleteIds.has(a.id));
        if (cleaned.length !== storedAsgs.length) {
          localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(cleaned.length ? cleaned : DEFAULT_ASSIGNMENTS));
        }
      } catch (e) {}
    }
    if (!localStorage.getItem(STORAGE_KEYS.SUBMISSIONS)) {
      localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(DEFAULT_SUBMISSIONS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.BANNERS)) {
      localStorage.setItem(STORAGE_KEYS.BANNERS, JSON.stringify(DEFAULT_BANNERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.RANK_TIERS)) {
      localStorage.setItem(STORAGE_KEYS.RANK_TIERS, JSON.stringify(DEFAULT_RANK_TIERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.XP_SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.XP_SETTINGS, JSON.stringify(DEFAULT_XP_SETTINGS));
    }

    if (!localStorage.getItem(STORAGE_KEYS.XP_TRANSACTIONS)) {
      const initialTx = [];
      DEFAULT_USERS.forEach(st => {
        if (st.role === 'student' && st.baseXp) {
          initialTx.push({
            id: 'tx-base-' + st.id,
            idempotencyKey: 'baseline_' + st.id,
            userId: st.id,
            sourceType: 'baseline',
            sourceId: 'enrollment',
            activityName: 'Academic Baseline & Enrollment Credit',
            points: Math.round(Number(st.baseXp)),
            resultStatus: 'Curriculum Verification Completed',
            metadata: { level: st.caLevel },
            createdAt: st.createdAt || '2026-08-15T10:00:00.000Z'
          });
        }
      });
      DEFAULT_REFERRALS.forEach(ref => {
        initialTx.push({
          id: 'tx-ref-' + ref.id,
          idempotencyKey: 'referral_' + ref.referredId,
          userId: ref.referrerId,
          sourceType: 'referral',
          sourceId: ref.referredId,
          activityName: 'Referral Bonus: ' + ref.referredName,
          points: ref.pointsAwarded || 100,
          resultStatus: 'Student Enrolled',
          metadata: { referredUsername: ref.referredUsername },
          createdAt: ref.createdAt
        });
      });
      localStorage.setItem(STORAGE_KEYS.XP_TRANSACTIONS, JSON.stringify(initialTx));
    }

    // Sync / enrich existing users with student location and XP data
    const existingStoredUsers = localStorage.getItem(STORAGE_KEYS.USERS);
    if (existingStoredUsers) {
      try {
        const uList = JSON.parse(existingStoredUsers);
        let updated = false;
        DEFAULT_USERS.forEach(defU => {
          const match = uList.find(x => x.id === defU.id);
          if (match) {
            let userChanged = false;
            if (!match.state || match.baseXp === undefined) {
              match.state = defU.state || 'Uttar Pradesh';
              match.city = defU.city || 'Meerut';
              match.baseXp = defU.baseXp !== undefined ? defU.baseXp : 0;
              match.referralCount = defU.referralCount || 0;
              match.previousRank = defU.previousRank || null;
              match.achievementBadges = defU.achievementBadges || [];
              userChanged = true;
            }
            if (!match.username || match.referralPoints === undefined) {
              match.username = defU.username || defU.email.split('@')[0];
              match.referralPoints = defU.referralPoints !== undefined ? defU.referralPoints : (defU.referralCount || 0) * 100;
              userChanged = true;
            }
            if (!match.district || !match.subjectXp) {
              match.district = defU.district || defU.city || 'Meerut';
              match.subjectXp = defU.subjectXp || {};
              userChanged = true;
            }
            if (defU.role === 'admin') {
              match.email = defU.email;
              match.username = defU.username;
              match.password = defU.password;
              match.name = defU.name;
              userChanged = true;
            }
            if (userChanged) updated = true;
          } else if (!match) {
            uList.push(defU);
            updated = true;
          }
        });
        if (updated) {
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(uList));
        }
      } catch (e) {}
    }

    // Unauthenticated by default so visitors see the clean Homepage
    if (!localStorage.getItem(STORAGE_KEYS.REFERRALS)) {
      localStorage.setItem(STORAGE_KEYS.REFERRALS, JSON.stringify(DEFAULT_REFERRALS));
    }
  }

  resetToDefault() {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(DEFAULT_SUBJECTS));
    localStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(DEFAULT_LECTURES));
    localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(DEFAULT_TESTS));
    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(DEFAULT_QUESTIONS));
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(DEFAULT_ATTEMPTS));
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(DEFAULT_ASSIGNMENTS));
    localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(DEFAULT_SUBMISSIONS));
    localStorage.setItem(STORAGE_KEYS.BANNERS, JSON.stringify(DEFAULT_BANNERS));
    localStorage.setItem(STORAGE_KEYS.RANK_TIERS, JSON.stringify(DEFAULT_RANK_TIERS));
    localStorage.setItem(STORAGE_KEYS.XP_SETTINGS, JSON.stringify(DEFAULT_XP_SETTINGS));
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(DEFAULT_USERS[0]));
  }

  // Key-value store helpers for local storage
  get(key, defaultValue = null) {
    try {
      const storageKey = STORAGE_KEYS[key.toUpperCase()] || (key.startsWith('excellenceca_') ? key : `excellenceca_${key}`);
      const val = localStorage.getItem(storageKey);
      if (val === null || val === undefined) return defaultValue;
      return JSON.parse(val);
    } catch (e) {
      console.warn(`[AppStore] Failed to read key ${key}:`, e);
      return defaultValue;
    }
  }

  set(key, value) {
    try {
      const storageKey = STORAGE_KEYS[key.toUpperCase()] || (key.startsWith('excellenceca_') ? key : `excellenceca_${key}`);
      if (value === null || value === undefined) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(value));
      }
    } catch (e) {
      console.warn(`[AppStore] Failed to write key ${key}:`, e);
    }
  }

  // Users
  getUsers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  }
  saveUsers(users) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
  getStudents() {
    return this.getUsers().filter(u => u.role === 'student');
  }
  getTeachers() {
    return this.getUsers().filter(u => u.role === 'teacher');
  }
  getUserById(id) {
    return this.getUsers().find(u => u.id === id);
  }
  addUser(user) {
    const users = this.getUsers();
    users.unshift(user);
    this.saveUsers(users);
    if (window.firebaseSync && typeof window.firebaseSync.saveUser === 'function') {
      window.firebaseSync.saveUser(user);
    }
  }
  updateUser(user) {
    if (!user || !user.id) return null;
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === user.id);
    let updated;
    if (index !== -1) {
      const existing = users[index];
      // Security Policy: Student username cannot be modified once set unless by admin
      const isAdmin = (window.auth && typeof window.auth.isAdmin === 'function') ? window.auth.isAdmin() : false;
      let finalUsername = existing.username;
      if (isAdmin && user.username) {
        finalUsername = user.username;
      }
      users[index] = { ...existing, ...user, username: finalUsername };
      updated = users[index];
    } else {
      users.unshift(user);
      updated = user;
    }
    this.saveUsers(users);
    if (window.firebaseSync && typeof window.firebaseSync.saveUser === 'function') {
      window.firebaseSync.saveUser(updated);
    }
    // If current logged-in user was updated, refresh session
    const current = this.getCurrentUser();
    if (current && current.id === updated.id) {
      this.setCurrentUser(updated);
      if (window.auth) window.auth.currentUser = updated;
    }
    return updated;
  }
  deleteUser(id) {
    const user = this.getUserById(id);
    const users = this.getUsers().filter(u => u.id !== id);
    this.saveUsers(users);
    if (window.firebaseSync && typeof window.firebaseSync.deleteUser === 'function') {
      window.firebaseSync.deleteUser(id);
    }
    // Call backend API to permanently remove student, wipe attempts/submissions, and sync deletion to Firebase
    if (typeof fetch !== 'undefined') {
      const currentUser = window.auth ? window.auth.getCurrentUser() : null;
      const token = currentUser ? (currentUser.token || currentUser.email) : '';
      fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ studentId: id, username: user ? user.username : undefined, email: user ? user.email : undefined })
      }).catch(err => console.warn('Backend user deletion error:', err));
    }
  }
  toggleUserStatus(id) {
    const user = this.getUserById(id);
    if (user) {
      user.isActive = !user.isActive;
      this.updateUser(user);
      return user.isActive;
    }
    return false;
  }

  // Current session
  getCurrentUser() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER) || 'null');
  }
  setCurrentUser(user) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  }

  // Subjects
  getSubjects() {
    const raw = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
    if (!raw) return DEFAULT_SUBJECTS;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge missing default subjects so Intermediate and Final subjects are always available
        const existingIds = new Set(parsed.map(s => s.id));
        const missingDefaults = DEFAULT_SUBJECTS.filter(s => !existingIds.has(s.id));
        if (missingDefaults.length > 0) {
          const merged = [...parsed, ...missingDefaults];
          this.saveSubjects(merged);
          return merged;
        }
        return parsed;
      }
      return DEFAULT_SUBJECTS;
    } catch (e) {
      return DEFAULT_SUBJECTS;
    }
  }
  getDescriptiveSubjectsByLevel(level) {
    const norm = String(level || 'CA Foundation').trim().toUpperCase();
    const all = this.getSubjects();
    if (norm.includes('FOUNDATION')) {
      // For CA Foundation descriptive papers, only valid descriptive subjects (Accounts / Accounting and Business Law) must be shown
      // Exclude MCQ-only subjects: Business Economics and Quantitative Aptitude
      return all.filter(s => {
        const sLevel = String(s.level || '').toUpperCase();
        const sName = String(s.name || '').toLowerCase();
        const isFoundation = sLevel.includes('FOUNDATION') || !s.level;
        const isDescriptive = (sName.includes('account') || sName.includes('law')) &&
                              !sName.includes('econ') && !sName.includes('quant') && !sName.includes('math');
        return isFoundation && isDescriptive;
      });
    } else if (norm.includes('INTER')) {
      return all.filter(s => {
        const sLevel = String(s.level || '').toUpperCase();
        return sLevel.includes('INTER');
      });
    } else if (norm.includes('FINAL')) {
      return all.filter(s => {
        const sLevel = String(s.level || '').toUpperCase();
        return sLevel.includes('FINAL');
      });
    }
    // For 'all' levels in descriptive test papers: return only descriptive subjects across all levels, omitting MCQ-only subjects like Economics and Quantitative Aptitude
    return all.filter(s => {
      const sName = String(s.name || '').toLowerCase();
      return !sName.includes('econ') && !sName.includes('quant') && !sName.includes('math');
    });
  }
  saveSubjects(subjects) {
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
  }
  getSubjectById(id) {
    if (!id) return null;
    return this.getSubjects().find(s => s.id === id || (s.name && s.name.toLowerCase() === String(id).toLowerCase()));
  }
  addSubject(subject) {
    if (!subject) return;
    const subjects = this.getSubjects();
    const existingIdx = subjects.findIndex(s => s.id === subject.id || (s.name && s.name.toLowerCase() === subject.name.toLowerCase()));
    if (existingIdx >= 0) {
      subjects[existingIdx] = subject;
    } else {
      subjects.push(subject);
    }
    this.saveSubjects(subjects);
    if (window.firebaseSync && typeof window.firebaseSync.saveSubject === 'function') {
      window.firebaseSync.saveSubject(subject);
    }
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || user.email) : '';
    fetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(subject)
    }).catch(() => {});
    return subject;
  }
  deleteSubject(id) {
    const subjects = this.getSubjects().filter(s => s.id !== id);
    this.saveSubjects(subjects);
    if (window.firebaseSync && typeof window.firebaseSync.deleteSubject === 'function') {
      window.firebaseSync.deleteSubject(id);
    }
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || user.email) : '';
    fetch('/api/subjects/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id })
    }).catch(() => {});
  }

  // Bookmarks (MCQ Tests & Test Papers)
  getBookmarks(userId = null) {
    const raw = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
    let list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
    if (userId) {
      return list.filter(b => b.userId === userId);
    }
    return list;
  }
  saveBookmarks(bookmarks) {
    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(bookmarks));
  }
  isBookmarked(userId, itemId) {
    if (!userId || !itemId) return false;
    return this.getBookmarks(userId).some(b => b.itemId === itemId);
  }
  toggleBookmark(userId, itemId, itemType = 'test') {
    if (!userId || !itemId) return false;
    let list = this.getBookmarks();
    const existingIdx = list.findIndex(b => b.userId === userId && b.itemId === itemId);
    let isNowBookmarked = false;
    let targetBm = null;

    if (existingIdx >= 0) {
      targetBm = list[existingIdx];
      list.splice(existingIdx, 1);
      isNowBookmarked = false;
      if (window.firebaseSync && typeof window.firebaseSync.deleteBookmark === 'function') {
        window.firebaseSync.deleteBookmark(targetBm.id || `${userId}_${itemId}`);
      }
    } else {
      targetBm = {
        id: 'bm-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        userId,
        itemId,
        itemType,
        createdAt: new Date().toISOString()
      };
      list.unshift(targetBm);
      isNowBookmarked = true;
      if (window.firebaseSync && typeof window.firebaseSync.saveBookmark === 'function') {
        window.firebaseSync.saveBookmark(targetBm);
      }
    }

    this.saveBookmarks(list);

    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || user.email) : '';
    fetch('/api/bookmarks/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ itemId, itemType })
    }).catch(() => {});

    return isNowBookmarked;
  }

  // Notifications
  getNotifications(userId = null) {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    let list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
    if (userId) {
      list = list.filter(n => n.userId === userId);
    }
    return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  saveNotifications(notifications) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  }
  addNotification(notif) {
    if (!notif) return;
    const notifObj = {
      id: notif.id || 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: notif.userId,
      type: notif.type || 'general',
      title: notif.title || '',
      message: notif.message || '',
      link: notif.link || '',
      read: false,
      metadata: notif.metadata || {},
      createdAt: notif.createdAt || new Date().toISOString()
    };
    const list = this.getNotifications();
    list.unshift(notifObj);
    this.saveNotifications(list);

    if (window.firebaseSync && typeof window.firebaseSync.saveNotification === 'function') {
      window.firebaseSync.saveNotification(notifObj);
    }

    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notifObj)
    }).catch(() => {});

    if (window.app && typeof window.app.updateNotificationBadge === 'function') {
      window.app.updateNotificationBadge();
    }

    return notifObj;
  }
  addNotificationsBulk(notifications) {
    if (!Array.isArray(notifications) || notifications.length === 0) return [];
    const nowIso = new Date().toISOString();
    const nowTs = Date.now();
    const preparedList = notifications.map((notif, idx) => ({
      id: notif.id || 'notif-' + nowTs + '-' + idx + '-' + Math.random().toString(36).substring(2, 6),
      userId: notif.userId,
      type: notif.type || 'general',
      title: notif.title || '',
      message: notif.message || '',
      link: notif.link || '',
      read: false,
      metadata: notif.metadata || {},
      createdAt: notif.createdAt || nowIso
    }));

    const list = this.getNotifications();
    list.unshift(...preparedList);
    this.saveNotifications(list);

    fetch('/api/notifications/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifications: preparedList })
    }).catch(() => {});

    if (window.app && typeof window.app.updateNotificationBadge === 'function') {
      window.app.updateNotificationBadge();
    }

    return preparedList;
  }
  markNotificationRead(id) {
    const list = this.getNotifications();
    const item = list.find(n => n.id === id);
    if (item) {
      item.read = true;
      this.saveNotifications(list);
      if (window.firebaseSync && typeof window.firebaseSync.markNotificationRead === 'function') {
        window.firebaseSync.markNotificationRead(id);
      }
      const user = window.auth ? window.auth.getCurrentUser() : null;
      const token = user ? (user.token || user.email) : '';
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id })
      }).catch(() => {});
      if (window.app && typeof window.app.updateNotificationBadge === 'function') {
        window.app.updateNotificationBadge();
      }
    }
  }
  markAllNotificationsRead(userId) {
    const list = this.getNotifications();
    list.forEach(n => {
      if (!userId || n.userId === userId) {
        n.read = true;
      }
    });
    this.saveNotifications(list);
    if (window.firebaseSync && typeof window.firebaseSync.markAllNotificationsRead === 'function') {
      window.firebaseSync.markAllNotificationsRead(userId);
    }
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || user.email) : '';
    fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ all: true })
    }).catch(() => {});
    if (window.app && typeof window.app.updateNotificationBadge === 'function') {
      window.app.updateNotificationBadge();
    }
  }
  getUnreadNotificationCount(userId) {
    if (!userId) return 0;
    return this.getNotifications(userId).filter(n => !n.read).length;
  }
  deleteNotification(id, userId) {
    if (!id) return;
    let list = this.getNotifications();
    list = list.filter(n => n.id !== id);
    this.saveNotifications(list);

    if (window.firebaseSync && typeof window.firebaseSync.deleteNotification === 'function') {
      window.firebaseSync.deleteNotification(id);
    }

    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || user.email) : '';
    fetch('/api/notifications/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id, userId: userId || (user ? user.id : '') })
    }).catch(() => {});

    if (window.app && typeof window.app.updateNotificationBadge === 'function') {
      window.app.updateNotificationBadge();
    }
  }
  clearAllNotifications(userId) {
    let list = this.getNotifications();
    list = list.filter(n => userId && n.userId !== userId);
    this.saveNotifications(list);

    if (window.firebaseSync && typeof window.firebaseSync.clearNotifications === 'function') {
      window.firebaseSync.clearNotifications(userId);
    }

    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || user.email) : '';
    fetch('/api/notifications/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ userId: userId || (user ? user.id : '') })
    }).catch(() => {});

    if (window.app && typeof window.app.updateNotificationBadge === 'function') {
      window.app.updateNotificationBadge();
    }
  }

  // ==========================================
  // AUTHORITATIVE XP & REWARD POINTS LEDGER
  // ==========================================
  getXpTransactions(userId = null) {
    const raw = localStorage.getItem(STORAGE_KEYS.XP_TRANSACTIONS);
    let list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
    if (userId) {
      list = list.filter(t => t.userId === userId);
    }
    return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  saveXpTransactions(transactions) {
    localStorage.setItem(STORAGE_KEYS.XP_TRANSACTIONS, JSON.stringify(transactions));
  }
  recordXpTransaction(tx) {
    if (!tx || !tx.userId || tx.points === undefined || tx.points === null) return null;
    const list = this.getXpTransactions();
    
    // Idempotency protection
    if (tx.idempotencyKey) {
      const existing = list.find(t => t.idempotencyKey === tx.idempotencyKey);
      if (existing) {
        if (existing.points !== tx.points) {
          const diff = tx.points - existing.points;
          existing.points = tx.points;
          existing.resultStatus = tx.resultStatus || existing.resultStatus;
          this.saveXpTransactions(list);
          if (!tx.skipUserAdjustment && tx.sourceType !== 'admin_adjustment') {
            this.adjustUserTotalXp(tx.userId, diff);
          }
        }
        return existing;
      }
    }

    const targetUser = this.getUserById(tx.userId);
    const txObj = {
      id: tx.id || 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      idempotencyKey: tx.idempotencyKey || null,
      userId: tx.userId,
      studentName: tx.studentName || (targetUser ? targetUser.name : 'Student'),
      studentUsername: tx.studentUsername || (targetUser ? (targetUser.username || 'Not set') : 'Not set'),
      sourceType: tx.sourceType || tx.source || 'general',
      source: tx.source || tx.sourceType || 'general',
      sourceId: tx.sourceId || '',
      action: tx.action || (tx.source && tx.source.startsWith('admin_') ? tx.source.replace('admin_', '') : 'add'),
      activityName: tx.activityName || tx.description || 'Platform Activity',
      description: tx.description || tx.activityName || 'Platform Activity',
      points: Math.round(Number(tx.points || 0)),
      previousXp: tx.previousXp !== undefined ? Number(tx.previousXp) : (targetUser ? Number(targetUser.totalXp || 0) : 0),
      newXp: tx.newXp !== undefined ? Number(tx.newXp) : (targetUser ? Number(targetUser.totalXp || 0) : 0),
      adminUser: tx.adminUser || 'admin',
      resultStatus: tx.resultStatus || '',
      metadata: tx.metadata || {},
      createdAt: tx.createdAt || new Date().toISOString()
    };

    list.unshift(txObj);
    this.saveXpTransactions(list);

    if (!tx.skipUserAdjustment && tx.sourceType !== 'admin_adjustment') {
      this.adjustUserTotalXp(tx.userId, txObj.points);
    }

    if (window.firebaseSync && typeof window.firebaseSync.saveXpTransaction === 'function') {
      window.firebaseSync.saveXpTransaction(txObj);
    }

    const user = window.auth ? window.auth.getCurrentUser() : null;
    const token = user ? (user.token || user.email) : '';
    fetch('/api/xp/award', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(txObj)
    }).catch(() => {});

    return txObj;
  }
  adjustUserTotalXp(userId, diff) {
    if (!userId || !diff) return;
    const users = this.getUsers();
    const u = users.find(usr => usr.id === userId);
    if (u) {
      u.totalXp = Math.max(0, (u.totalXp !== undefined ? Number(u.totalXp) : (Number(u.baseXp || 0))) + Number(diff));
      this.updateUser(u);
    }
  }
  getUserTotalXp(userId) {
    if (!userId) return 0;
    const u = this.getUserById(userId);
    if (u && u.totalXp !== undefined && u.totalXp !== null) {
      return Number(u.totalXp);
    }
    const txs = this.getXpTransactions(userId);
    if (txs && txs.length > 0) {
      const sum = txs.reduce((acc, t) => acc + Number(t.points || 0), 0);
      if (u) {
        u.totalXp = sum;
        this.updateUser(u);
      }
      return sum;
    }
    return u ? Number(u.baseXp || 0) : 0;
  }
  resolveTier(totalXp, rankTiers = null) {
    const tiers = rankTiers || this.getRankTiers() || DEFAULT_RANK_TIERS;
    if (!tiers || tiers.length === 0) {
      return {
        currentTier: { id: 'rookie_3', name: 'Rookie III', family: 'Rookie', minXp: 0, maxXp: 499 },
        nextTier: null,
        xpToNext: 0,
        progressPercent: 100,
        isMaxRank: false,
        progressText: '0 XP'
      };
    }

    let currentTier = tiers[0];
    let currentIndex = 0;

    for (let i = 0; i < tiers.length; i++) {
      if (totalXp >= tiers[i].minXp) {
        currentTier = tiers[i];
        currentIndex = i;
      }
    }

    const isMaxRank = currentIndex === tiers.length - 1;
    const nextTier = !isMaxRank ? tiers[currentIndex + 1] : null;

    let xpToNext = 0;
    let progressPercent = 100;

    if (!isMaxRank && nextTier) {
      xpToNext = Math.max(0, nextTier.minXp - totalXp);
      const range = nextTier.minXp - currentTier.minXp;
      const progress = totalXp - currentTier.minXp;
      progressPercent = range > 0 ? Math.min(100, Math.max(0, Math.round((progress / range) * 100))) : 100;
    }

    const progressText = isMaxRank
      ? `${totalXp.toLocaleString()} XP — Max Rank Reached`
      : `${totalXp.toLocaleString()} / ${nextTier.minXp.toLocaleString()} XP — ${xpToNext.toLocaleString()} XP needed for next level`;

    return {
      currentTier,
      nextTier,
      xpToNext,
      progressPercent,
      isMaxRank,
      progressText
    };
  }

  // Lectures
  getLectures() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.LECTURES) || '[]');
  }
  saveLectures(lectures) {
    localStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(lectures));
  }
  addLecture(lec) {
    const lectures = this.getLectures();
    lectures.unshift(lec);
    this.saveLectures(lectures);
  }
  updateLecture(lec) {
    const lectures = this.getLectures().map(l => l.id === lec.id ? lec : l);
    this.saveLectures(lectures);
  }
  deleteLecture(id) {
    const lectures = this.getLectures().filter(l => l.id !== id);
    this.saveLectures(lectures);
  }

  // Tests
  getTests() {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.TESTS) || '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const deduped = [];
    let hasDuplicates = false;
    for (const t of raw) {
      if (t && t.id) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          deduped.push(t);
        } else {
          hasDuplicates = true;
        }
      }
    }
    if (hasDuplicates) {
      localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(deduped));
    }
    return deduped;
  }
  saveTests(tests) {
    if (!Array.isArray(tests)) tests = [];
    const seen = new Set();
    const deduped = [];
    for (const t of tests) {
      if (t && t.id && !seen.has(t.id)) {
        seen.add(t.id);
        deduped.push(t);
      }
    }
    localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(deduped));
  }
  getTestById(id) {
    return this.getTests().find(t => t.id === id);
  }
  addTest(tst) {
    if (!tst || !tst.id) return;
    const tests = this.getTests();
    const existingIndex = tests.findIndex(t => t.id === tst.id);
    if (existingIndex >= 0) {
      tests[existingIndex] = { ...tests[existingIndex], ...tst };
    } else {
      tests.unshift(tst);
    }
    this.saveTests(tests);
    if (window.firebaseSync && typeof window.firebaseSync.saveTest === 'function') {
      window.firebaseSync.saveTest(tst);
    }
  }
  updateTest(tst) {
    if (!tst || !tst.id) return;
    const tests = this.getTests();
    const existingIndex = tests.findIndex(t => t.id === tst.id);
    if (existingIndex >= 0) {
      tests[existingIndex] = { ...tests[existingIndex], ...tst };
    } else {
      tests.unshift(tst);
    }
    this.saveTests(tests);
    if (window.firebaseSync && typeof window.firebaseSync.saveTest === 'function') {
      window.firebaseSync.saveTest(tst);
    }
  }
  deleteTest(id) {
    const tests = this.getTests().filter(t => t.id !== id);
    this.saveTests(tests);
    const questions = this.getQuestions().filter(q => q.testId !== id);
    this.saveQuestions(questions);
    if (window.firebaseSync && typeof window.firebaseSync.deleteTest === 'function') {
      window.firebaseSync.deleteTest(id);
    }
  }

  // Questions
  getQuestions() {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.QUESTIONS) || '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const deduped = [];
    let hasDuplicates = false;
    for (const q of raw) {
      if (q && q.id) {
        if (!seen.has(q.id)) {
          seen.add(q.id);
          deduped.push(q);
        } else {
          hasDuplicates = true;
        }
      }
    }
    if (hasDuplicates) {
      localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(deduped));
    }
    return deduped;
  }
  saveQuestions(questions) {
    if (!Array.isArray(questions)) questions = [];
    const seen = new Set();
    const deduped = [];
    for (const q of questions) {
      if (q && q.id && !seen.has(q.id)) {
        seen.add(q.id);
        deduped.push(q);
      }
    }
    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(deduped));
  }
  getQuestionsByTestId(testId) {
    return this.getQuestions().filter(q => q.testId === testId).sort((a,b) => a.number - b.number);
  }
  addQuestion(question) {
    if (!question || !question.id) return;
    const questions = this.getQuestions();
    const existingIndex = questions.findIndex(q => q.id === question.id);
    if (existingIndex >= 0) {
      questions[existingIndex] = { ...questions[existingIndex], ...question };
    } else {
      questions.push(question);
    }
    this.saveQuestions(questions);
    if (window.firebaseSync && typeof window.firebaseSync.saveQuestion === 'function') {
      window.firebaseSync.saveQuestion(question);
    }
  }
  updateQuestion(question) {
    if (!question || !question.id) return;
    const questions = this.getQuestions();
    const existingIndex = questions.findIndex(q => q.id === question.id);
    if (existingIndex >= 0) {
      questions[existingIndex] = { ...questions[existingIndex], ...question };
    } else {
      questions.push(question);
    }
    this.saveQuestions(questions);
    if (window.firebaseSync && typeof window.firebaseSync.saveQuestion === 'function') {
      window.firebaseSync.saveQuestion(question);
    }
  }
  deleteQuestion(id) {
    if (!id) return;
    const questions = this.getQuestions().filter(q => q.id !== id);
    this.saveQuestions(questions);
    if (window.firebaseSync && typeof window.firebaseSync.deleteQuestion === 'function') {
      window.firebaseSync.deleteQuestion(id);
    }
  }


  // MCQ Question & Test Management Upgrades
  getSanitizedQuestions(testId) {
    const questions = this.getQuestionsByTestId(testId);
    const user = window.auth ? window.auth.getCurrentUser() : null;
    const entitlements = user ? this.getUserEntitlements(user.id) : null;
    const userTier = entitlements ? entitlements.tier.toLowerCase() : 'free';
    const tierLevels = { none: 0, free: 0, trial: 1, core: 2, plus: 3, elite: 4, teacher: 99, admin: 99 };
    const userLevel = tierLevels[userTier] ?? 0;

    return questions.map(q => {
      const copy = { ...q };
      const reqTier = (copy.requiredTier || 'free').toLowerCase();
      const reqLevel = tierLevels[reqTier] ?? 0;
      copy.requiredTier = reqTier;

      if (userLevel < reqLevel) {
        copy.isLocked = true;
        copy.text = `This question requires an active ${reqTier.charAt(0).toUpperCase() + reqTier.slice(1)} Pass or higher.`;
        copy.questionType = 'text';
        copy.questionImage = null;
        copy.optionA = '';
        copy.optionB = '';
        copy.optionC = '';
        copy.optionD = '';
        copy.optionTypes = { A: 'text', B: 'text', C: 'text', D: 'text' };
        copy.optionImages = { A: null, B: null, C: null, D: null };
      } else {
        copy.isLocked = false;
      }
      delete copy.correctOption;
      delete copy.explanation;
      delete copy.aiSuggestedAnswer;
      return copy;
    });
  }

  duplicateQuestion(questionId) {
    const q = this.getQuestions().find(x => x.id === questionId);
    if (!q) return null;
    const testQs = this.getQuestionsByTestId(q.testId);
    const newQ = {
      ...q,
      id: 'q-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      number: testQs.length + 1,
      text: q.text + ' (Copy)',
      isDraft: false,
      isDuplicate: false
    };
    this.addQuestion(newQ);
    const test = this.getTestById(q.testId);
    if (test) {
      test.totalQuestions = (test.totalQuestions || 0) + 1;
      this.updateTest(test);
    }
    return newQ;
  }

  reorderQuestions(testId, questionIds) {
    const allQuestions = this.getQuestions();
    questionIds.forEach((id, index) => {
      const q = allQuestions.find(x => x.id === id);
      if (q && q.testId === testId) {
        q.number = index + 1;
      }
    });
    this.saveQuestions(allQuestions);
  }

  getTestAttempts(testId, userId = null) {
    let attempts = this.getAttempts().filter(a => a.testId === testId);
    if (userId) {
      attempts = attempts.filter(a => a.userId === userId);
    }
    return attempts;
  }

  // Test Attempts
  getAttempts() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTEMPTS) || '[]');
  }
  saveAttempts(attempts) {
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(attempts));
  }
  getAttemptsByUser(userId) {
    return this.getAttempts().filter(a => a.userId === userId);
  }
  getAttemptsByTest(testId) {
    return this.getAttempts().filter(a => a.testId === testId);
  }
  recordAttempt(attempt) {
    const attempts = this.getAttempts();
    attempts.unshift(attempt);
    this.saveAttempts(attempts);
    if (window.leaderboardManager) {
      window.leaderboardManager.calculateAllStandings();
    }
  }

  // Assignments / Descriptive Test Papers (With Question PDF)
  getAssignments() {
    const data = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
    if (!data) {
      this.saveAssignments(DEFAULT_ASSIGNMENTS);
      return DEFAULT_ASSIGNMENTS;
    }
    try {
      const arr = JSON.parse(data);
      if (Array.isArray(arr) && arr.length > 0) return arr;
      this.saveAssignments(DEFAULT_ASSIGNMENTS);
      return DEFAULT_ASSIGNMENTS;
    } catch (e) {
      return DEFAULT_ASSIGNMENTS;
    }
  }
  saveAssignments(assignments) {
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
  }
  getAssignmentById(id) {
    return this.getAssignments().find(a => a.id === id);
  }
  addAssignment(asg) {
    if (!asg) return;
    Object.keys(asg).forEach(k => {
      if (asg[k] === undefined) asg[k] = null;
    });
    const assignments = this.getAssignments();
    assignments.unshift(asg);
    this.saveAssignments(assignments);
    if (window.firebaseSync && typeof window.firebaseSync.saveAssignment === 'function') {
      try {
        window.firebaseSync.saveAssignment(asg);
      } catch (fbErr) {
        console.warn('[Store] Firebase sync saveAssignment error:', fbErr);
      }
    }
  }
  updateAssignment(asg) {
    if (!asg) return;
    Object.keys(asg).forEach(k => {
      if (asg[k] === undefined) asg[k] = null;
    });
    const assignments = this.getAssignments().map(a => a.id === asg.id ? asg : a);
    this.saveAssignments(assignments);
    if (window.firebaseSync && typeof window.firebaseSync.saveAssignment === 'function') {
      try {
        window.firebaseSync.saveAssignment(asg);
      } catch (fbErr) {
        console.warn('[Store] Firebase sync updateAssignment error:', fbErr);
      }
    }
  }
  deleteAssignment(id) {
    const assignments = this.getAssignments().filter(a => a.id !== id);
    this.saveAssignments(assignments);
    // Clean up corresponding submissions locally
    const submissions = this.getSubmissions().filter(s => s.assignmentId !== id && s.paperId !== id);
    this.saveSubmissions(submissions);
    if (window.firebaseSync && typeof window.firebaseSync.deleteAssignment === 'function') {
      window.firebaseSync.deleteAssignment(id);
    }
  }

  // Submissions (With Checked Copy PDF uploaded by Admin/Teacher)
  getSubmissions() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBMISSIONS) || '[]');
  }
  saveSubmissions(submissions) {
    localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(submissions));
  }
  getSubmissionsByUser(userId) {
    return this.getSubmissions().filter(s => s.studentId === userId);
  }
  getSubmissionsByAssignment(asgId) {
    return this.getSubmissions().filter(s => s.assignmentId === asgId);
  }
  addSubmission(subm) {
    const submissions = this.getSubmissions();
    const existing = submissions.find(s => s.assignmentId === subm.assignmentId && s.studentId === subm.studentId);
    if (existing) {
      console.warn('[Store] Duplicate submission blocked: re-upload not permitted for student', subm.studentId, 'on assignment', subm.assignmentId);
      return false;
    }
    submissions.unshift(subm);
    this.saveSubmissions(submissions);
    if (window.firebaseSync && typeof window.firebaseSync.saveSubmission === 'function') {
      window.firebaseSync.saveSubmission(subm);
    }
    if (window.leaderboardManager) {
      window.leaderboardManager.calculateAllStandings();
    }
    return true;
  }
  updateSubmission(subm) {
    const submissions = this.getSubmissions().map(s => s.id === subm.id ? subm : s);
    this.saveSubmissions(submissions);
    if (window.firebaseSync && typeof window.firebaseSync.saveSubmission === 'function') {
      window.firebaseSync.saveSubmission(subm);
    }
    if (window.leaderboardManager) {
      window.leaderboardManager.calculateAllStandings();
    }
  }

  // Website Updates Banners
  getBanners() {
    const data = localStorage.getItem(STORAGE_KEYS.BANNERS);
    if (!data) {
      this.saveBanners(DEFAULT_BANNERS);
      return DEFAULT_BANNERS;
    }
    try {
      const banners = JSON.parse(data);
      if (Array.isArray(banners) && banners.length > 0) return banners;
      this.saveBanners(DEFAULT_BANNERS);
      return DEFAULT_BANNERS;
    } catch (e) {
      return DEFAULT_BANNERS;
    }
  }
  saveBanners(banners) {
    localStorage.setItem(STORAGE_KEYS.BANNERS, JSON.stringify(banners));
  }
  getBannerById(id) {
    return this.getBanners().find(b => b.id === id);
  }
  addBanner(banner) {
    const banners = this.getBanners();
    banners.unshift(banner);
    this.saveBanners(banners);
  }
  updateBanner(banner) {
    const banners = this.getBanners().map(b => b.id === banner.id ? banner : b);
    this.saveBanners(banners);
  }
  deleteBanner(id) {
    const banners = this.getBanners().filter(b => b.id !== id);
    this.saveBanners(banners);
  }
  toggleBannerVisibility(id) {
    const banners = this.getBanners();
    const b = banners.find(item => item.id === id);
    if (b) {
      b.isVisible = !b.isVisible;
      this.saveBanners(banners);
      return b.isVisible;
    }
    return false;
  }

  // Rank Tiers & XP Rules Configuration
  getRankTiers() {
    const data = localStorage.getItem(STORAGE_KEYS.RANK_TIERS);
    if (!data) {
      this.saveRankTiers(DEFAULT_RANK_TIERS);
      return DEFAULT_RANK_TIERS;
    }
    try {
      const arr = JSON.parse(data);
      if (Array.isArray(arr) && arr.length > 0) return arr;
      this.saveRankTiers(DEFAULT_RANK_TIERS);
      return DEFAULT_RANK_TIERS;
    } catch (e) {
      return DEFAULT_RANK_TIERS;
    }
  }

  saveRankTiers(tiers) {
    localStorage.setItem(STORAGE_KEYS.RANK_TIERS, JSON.stringify(tiers));
  }

  resetRankTiersToDefault() {
    this.saveRankTiers(DEFAULT_RANK_TIERS);
    return DEFAULT_RANK_TIERS;
  }

  getXpSettings() {
    const data = localStorage.getItem(STORAGE_KEYS.XP_SETTINGS);
    if (!data) {
      this.saveXpSettings(DEFAULT_XP_SETTINGS);
      return DEFAULT_XP_SETTINGS;
    }
    try {
      return { ...DEFAULT_XP_SETTINGS, ...JSON.parse(data) };
    } catch (e) {
      return DEFAULT_XP_SETTINGS;
    }
  }

  saveXpSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.XP_SETTINGS, JSON.stringify(settings));
  }


  // Referral System Management
  getReferrals() {
    const data = localStorage.getItem(STORAGE_KEYS.REFERRALS);
    return data ? JSON.parse(data) : DEFAULT_REFERRALS;
  }

  saveReferrals(referrals) {
    localStorage.setItem(STORAGE_KEYS.REFERRALS, JSON.stringify(referrals));
  }

  addReferral(record) {
    const referrals = this.getReferrals();
    // Idempotency: avoid duplicate referral ID
    if (record.id && referrals.some(r => r.id === record.id)) {
      return record;
    }
    referrals.unshift(record);
    this.saveReferrals(referrals);
    if (window.firebaseSync && typeof window.firebaseSync.saveReferral === 'function') {
      window.firebaseSync.saveReferral(record);
    }
    return record;
  }

  // Dynamic Exam Levels Discovery
  getExamLevels() {
    const levels = new Set(['CA Foundation', 'CA Intermediate', 'CA Final']);
    this.getSubjects().forEach(s => {
      if (s.level) levels.add(this.normalizeExamLevel(s.level));
    });
    this.getStudents().forEach(st => {
      if (st.caLevel) levels.add(this.normalizeExamLevel(st.caLevel));
    });
    return Array.from(levels);
  }

  normalizeExamLevel(rawLevel) {
    if (!rawLevel) return '';
    const upper = String(rawLevel).toUpperCase().trim();
    if (upper.includes('FOUNDATION')) return 'CA Foundation';
    if (upper.includes('INTER')) return 'CA Intermediate';
    if (upper.includes('FINAL')) return 'CA Final';
    return rawLevel;
  }

  // ─── Referral Settings (Dynamic Reward Configuration) ───────────────────────
  getReferralSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.REFERRAL_SETTINGS);
      return data ? JSON.parse(data) : { ...DEFAULT_REFERRAL_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_REFERRAL_SETTINGS };
    }
  }

  saveReferralSettings(settings) {
    const merged = { ...DEFAULT_REFERRAL_SETTINGS, ...settings };
    localStorage.setItem(STORAGE_KEYS.REFERRAL_SETTINGS, JSON.stringify(merged));
    return merged;
  }

  // ─── XP Reset Settings (Schedule) ────────────────────────────────────────────
  getXpResetSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.XP_RESET_SETTINGS);
      return data ? JSON.parse(data) : { ...DEFAULT_XP_RESET_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_XP_RESET_SETTINGS };
    }
  }

  saveXpResetSettings(settings) {
    const merged = { ...DEFAULT_XP_RESET_SETTINGS, ...settings };
    localStorage.setItem(STORAGE_KEYS.XP_RESET_SETTINGS, JSON.stringify(merged));
    if (window.firebaseSync && typeof window.firebaseSync.saveXpResetSettings === 'function') {
      window.firebaseSync.saveXpResetSettings(merged);
    }
    return merged;
  }

  // ─── XP Reset History ─────────────────────────────────────────────────────────
  getXpResetHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.XP_RESET_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  recordXpResetEvent(event) {
    const history = this.getXpResetHistory();
    const item = {
      id: event.id || `xpreset-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      triggeredBy: event.triggeredBy || 'admin',
      adminUser: event.adminUser || '',
      studentsReset: event.studentsReset || 0,
      resetAt: event.resetAt || new Date().toISOString(),
      notes: event.notes || ''
    };
    history.unshift(item);
    // Keep last 100 events
    localStorage.setItem(STORAGE_KEYS.XP_RESET_HISTORY, JSON.stringify(history.slice(0, 100)));
    if (window.firebaseSync && typeof window.firebaseSync.saveXpResetEvent === 'function') {
      window.firebaseSync.saveXpResetEvent(item);
    }
    return item;
  }

  // ─── Admin XP Adjustment ──────────────────────────────────────────────────────
  adminAdjustStudentXp(studentId, action, amount, reason, adminUser) {
    if (!studentId || !action) return { success: false, error: 'Invalid parameters' };
    const user = this.getUserById(studentId);
    if (!user) return { success: false, error: 'Student not found' };

    const prevXp = Number(user.totalXp !== undefined ? user.totalXp : (user.baseXp || 0));
    let newXp;

    if (action === 'add') {
      newXp = prevXp + Number(amount);
    } else if (action === 'remove') {
      newXp = Math.max(0, prevXp - Number(amount));
    } else if (action === 'set') {
      newXp = Math.max(0, Number(amount));
    } else {
      return { success: false, error: 'Unknown action' };
    }

    user.totalXp = newXp;
    user.baseXp = newXp;
    this.updateUser(user);

    // Record audit transaction
    this.recordXpTransaction({
      userId: studentId,
      studentName: user.name || 'Student',
      studentUsername: user.username || 'Not set',
      points: newXp - prevXp,
      sourceType: 'admin_adjustment',
      source: `admin_${action}`,
      action: action,
      activityName: `Admin XP ${action.toUpperCase()}: ${newXp - prevXp >= 0 ? '+' : ''}${newXp - prevXp} XP`,
      description: reason || `Admin ${action} XP`,
      reason: reason || `Admin ${action} XP`,
      adminUser: adminUser || 'admin',
      previousXp: prevXp,
      newXp: newXp,
      skipUserAdjustment: true,
      createdAt: new Date().toISOString()
    });

    // Also call backend if online
    if (typeof fetch !== 'undefined') {
      const currentUser = window.auth ? window.auth.getCurrentUser() : null;
      const token = currentUser ? (currentUser.token || currentUser.email) : '';
      fetch('/api/admin/xp/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ studentId, action, amount: Number(amount), reason: reason || `Admin ${action} XP` })
      }).catch(() => {});
    }

    return { success: true, previousXp: prevXp, newXp, user };
  }

  adminBulkSetStudentXp(amount, reason, adminUser) {
    const targetXp = Math.max(0, parseInt(amount, 10) || 0);
    const users = this.getUsers();
    const students = users.filter(u => u.role === 'student');
    const now = new Date().toISOString();

    students.forEach(st => {
      const prevXp = Number(st.totalXp !== undefined ? st.totalXp : (st.baseXp || 0));
      st.totalXp = targetXp;
      st.baseXp = targetXp;

      this.recordXpTransaction({
        userId: st.id,
        studentName: st.name || 'Student',
        studentUsername: st.username || 'Not set',
        points: targetXp - prevXp,
        sourceType: 'admin_bulk_set',
        source: 'admin_bulk_set',
        action: 'bulk_set',
        activityName: `Bulk Set XP: ${targetXp} XP`,
        description: reason || `Admin bulk set XP to ${targetXp}`,
        reason: reason || `Admin bulk set XP to ${targetXp}`,
        adminUser: adminUser || 'admin',
        previousXp: prevXp,
        newXp: targetXp,
        skipUserAdjustment: true,
        createdAt: now
      });

      if (window.firebaseSync && typeof window.firebaseSync.saveUser === 'function') {
        window.firebaseSync.saveUser(st);
      }
    });

    this.saveUsers(users);

    // Call backend API
    if (typeof fetch !== 'undefined') {
      const currentUser = window.auth ? window.auth.getCurrentUser() : null;
      const token = currentUser ? (currentUser.token || currentUser.email) : '';
      fetch('/api/admin/xp/bulk-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ amount: targetXp, reason: reason || 'Admin bulk set' })
      }).catch(err => console.warn('Backend bulk-set sync error:', err));
    }

    return { success: true, count: students.length, targetXp };
  }

  // --- SUBSCRIPTIONS & ENTITLEMENTS ---

  getSubscriptions() {
    return this.get('subscriptions', {});
  }

  saveSubscriptions(subscriptions) {
    this.set('subscriptions', subscriptions);
  }

  getUserSubscription(userId) {
    if (!userId) return null;
    const subs = this.getSubscriptions();
    return subs[userId] || null;
  }

  saveSubscription(subscription) {
    if (!subscription || !subscription.userId) return;
    const subs = this.getSubscriptions();
    subs[subscription.userId] = subscription;
    this.saveSubscriptions(subs);
    if (window.firebaseSync && typeof window.firebaseSync.saveSubscription === 'function') {
      window.firebaseSync.saveSubscription(subscription);
    }
  }

  deleteSubscription(userId) {
    if (!userId) return;
    const subs = this.getSubscriptions();
    if (subs[userId]) {
      delete subs[userId];
      this.saveSubscriptions(subs);
    }
  }

  // --- PAYMENT SESSIONS ---

  getPaymentSessions(userId = null) {
    const sessions = this.get('payment_sessions', []);
    if (userId) {
      return sessions.filter(s => s.userId === userId);
    }
    return sessions;
  }

  savePaymentSessions(sessions) {
    this.set('payment_sessions', sessions);
  }

  addPaymentSession(session) {
    if (!session || !session.paymentSessionId) return;
    const sessions = this.getPaymentSessions();
    const idx = sessions.findIndex(s => s.paymentSessionId === session.paymentSessionId);
    if (idx !== -1) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    this.savePaymentSessions(sessions);
    if (window.firebaseSync && typeof window.firebaseSync.savePaymentSession === 'function') {
      window.firebaseSync.savePaymentSession(session);
    }
  }

  updatePaymentSession(session) {
    this.addPaymentSession(session);
  }

  // --- PAYMENT CHANNELS ---

  getPaymentChannels() {
    return this.get('payment_channels', [
      {
        id: 'chan-primary-1',
        name: 'Primary UPI (HDFC Bank)',
        upiId: 'excellenceca@okhdfcbank',
        qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=excellenceca@okhdfcbank%26pn=ExcellenceCA%26cu=INR',
        isPrimary: true,
        isActive: true,
        order: 1
      }
    ]);
  }

  savePaymentChannels(channels) {
    this.set('payment_channels', channels);
    if (window.firebaseSync && typeof window.firebaseSync.savePaymentChannels === 'function') {
      window.firebaseSync.savePaymentChannels(channels);
    }
  }

  // --- SUBSCRIPTION PLANS CATALOG ---

  getSubscriptionPlans() {
    return this.get('subscription_plans', null);
  }

  saveSubscriptionPlans(plans) {
    this.set('subscription_plans', plans);
    if (window.firebaseSync && typeof window.firebaseSync.saveSubscriptionPlans === 'function') {
      window.firebaseSync.saveSubscriptionPlans(plans);
    }
  }

  // --- ADMIN AUDIT LOGS ---

  getAdminAuditLogs() {
    return this.get('admin_audit_logs', []);
  }

  saveAdminAuditLogs(logs) {
    this.set('admin_audit_logs', logs);
  }

  addAdminAuditLog(log) {
    if (!log) return;
    const logs = this.getAdminAuditLogs();
    logs.unshift(log);
    if (logs.length > 500) logs.splice(500);
    this.saveAdminAuditLogs(logs);
    if (window.firebaseSync && typeof window.firebaseSync.saveAdminAuditLog === 'function') {
      window.firebaseSync.saveAdminAuditLog(log);
    }
  }

  // --- CLIENT ENTITLEMENT RESOLVER ---

  getUserEntitlements(userId) {
    const user = userId ? this.getUserById(userId) : this.getCurrentUser();
    if (!user) {
      return {
        tier: 'free',
        planId: 'free',
        planName: 'Free Tier',
        isSubscribed: false,
        isTrial: false,
        badge: 'Free Tier',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        permissions: {
          premium_mcq_access: false,
          premium_test_paper_access: false,
          live_mcq_daily_limit: 0,
          copy_check_sla_hours: 72,
          monthly_full_exam_access: false,
          weekly_full_exam_access: false,
          teacher_review_access: false
        },
        remainingDays: 0
      };
    }

    if (user.role === 'admin' || user.role === 'teacher') {
      return {
        tier: user.role,
        planId: `${user.role}_unlimited`,
        planName: user.role === 'admin' ? 'Administrator' : 'Faculty',
        isSubscribed: true,
        isTrial: false,
        badge: user.role === 'admin' ? 'Administrator' : 'Faculty',
        badgeClass: user.role === 'admin' ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-amber-100 text-amber-800 border-amber-200',
        permissions: {
          premium_mcq_access: true,
          premium_test_paper_access: true,
          live_mcq_daily_limit: 999,
          copy_check_sla_hours: 1,
          monthly_full_exam_access: true,
          weekly_full_exam_access: true,
          teacher_review_access: true
        },
        remainingDays: 999
      };
    }

    const sub = this.getUserSubscription(user.id);
    if (!sub || (sub.status !== 'active' && sub.status !== 'manually_granted')) {
      return {
        tier: 'free',
        planId: 'free',
        planName: 'Free Tier',
        status: sub ? sub.status : 'none',
        isSubscribed: false,
        isTrial: false,
        badge: 'Free Tier',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        permissions: {
          premium_mcq_access: false,
          premium_test_paper_access: false,
          live_mcq_daily_limit: 0,
          copy_check_sla_hours: 72,
          monthly_full_exam_access: false,
          weekly_full_exam_access: false,
          teacher_review_access: false
        },
        remainingDays: 0
      };
    }

    // Check expiry
    const now = new Date();
    let remainingDays = 0;
    if (sub.expiresAt) {
      const exp = new Date(sub.expiresAt);
      if (now >= exp) {
        return {
          tier: 'free',
          planId: sub.planId,
          planName: sub.planName || 'Expired Plan',
          status: 'expired',
          isSubscribed: false,
          isTrial: false,
          badge: 'Expired Pass',
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
          permissions: {
            premium_mcq_access: false,
            premium_test_paper_access: false,
            live_mcq_daily_limit: 0,
            copy_check_sla_hours: 72,
            monthly_full_exam_access: false,
            weekly_full_exam_access: false,
            teacher_review_access: false
          },
          remainingDays: 0
        };
      }
      remainingDays = Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)));
    }

    const plans = this.getSubscriptionPlans() || {};
    const plan = plans[sub.planId] || {};
    const tier = sub.planTier || plan.tier || 'core';
    const isTrial = tier === 'trial' || sub.isTrial === true;

    return {
      tier: tier,
      planId: sub.planId,
      planName: sub.planName || plan.name || 'Active Pass',
      status: sub.status,
      isSubscribed: true,
      isTrial: isTrial,
      badge: isTrial ? 'Trial Pass' : (tier === 'elite' ? 'Elite Pass' : tier === 'plus' ? 'Plus Pass' : 'Core Pass'),
      badgeClass: isTrial ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  (tier === 'elite' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                   tier === 'plus' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                   'bg-blue-100 text-blue-800 border-blue-200'),
      copyCheckSlaHours: plan.copyCheckSlaHours || (tier === 'elite' ? 12 : tier === 'plus' ? 24 : 48),
      permissions: plan.permissions || {
        premium_mcq_access: true,
        premium_test_paper_access: tier !== 'core',
        live_mcq_daily_limit: tier === 'elite' || isTrial ? 3 : tier === 'plus' ? 2 : 1,
        copy_check_sla_hours: tier === 'elite' || isTrial ? 12 : tier === 'plus' ? 24 : 48,
        monthly_full_exam_access: tier !== 'core',
        weekly_full_exam_access: tier === 'elite' || isTrial,
        teacher_review_access: true
      },
      startedAt: sub.startedAt,
      expiresAt: sub.expiresAt,
      remainingDays: remainingDays,
      subscriptionId: sub.id
    };
  }
}


window.store = new AppStore();
window.rankService = {
  getRankTiers: () => window.store.getRankTiers(),
  resolveTier: (totalXp, rankTiers) => window.store.resolveTier(totalXp, rankTiers),
  getUserTotalXp: (userId) => window.store.getUserTotalXp(userId),
  getXpTransactions: (userId) => window.store.getXpTransactions(userId),
  recordXpTransaction: (tx) => window.store.recordXpTransaction(tx)
};