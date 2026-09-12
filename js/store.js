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
  REFERRALS: 'excellenceca_referrals'
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
  { id: 'sub-1', code: 'PAPER-1', name: 'Accounting', level: 'CA Foundation', icon: 'calculator' },
  { id: 'sub-2', code: 'PAPER-2', name: 'Business Law', level: 'CA Foundation', icon: 'scale' },
  { id: 'sub-3', code: 'PAPER-3', name: 'Business Economics', level: 'CA Foundation', icon: 'trending-up' },
  { id: 'sub-4', code: 'PAPER-4', name: 'Quantitative Aptitude', level: 'CA Foundation', icon: 'bar-chart-2' }
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
    id: 'asg-1',
    title: 'CA Foundation Accounting Mock Paper 1 - Final Assessment',
    subjectId: 'sub-1',
    subject: 'Accounting',
    topic: 'Partnership Accounts & Financial Statements',
    description: `### Examination Guidelines:
1. Attempt all questions with detailed step-by-step calculations and accounting notes.
2. Topics covered: Partnership Dissolution, Piecemeal Distribution, Final Accounts of Sole Proprietors, and Depreciation.
3. Maximum Marks: 100 | Time Allowed: 180 Minutes (3 Hours).
4. Download the official Question Paper PDF below, write solutions on ruled sheets, and submit a single scanned PDF.`,
    maximumMarks: 100,
    durationMinutes: 180,
    status: 'Published',
    isPublished: true,
    isLive: false,
    scheduledPublishTime: '2026-09-01T10:00:00.000Z',
    liveStartTime: null,
    liveEndTime: null,
    expiryTime: '2026-10-31T23:59:59.000Z',
    deadline: '2026-10-31T23:59:59.000Z',
    questionPdfId: 'qp_accounting_paper1.pdf',
    questionPdfName: 'CA_Foundation_Accounting_Mock1_QP.pdf',
    questionPdfData: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA4NSA+PgpzdHJlYW0KQlQKL0YxIDE4IFRmCjUwIDcyMCBUZApPZmZpY2lhbCBFeGNlbGxlbmNlQ0EgVGVzdCBRdWVzdGlvbiBQYXBlciAoUERGKQpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMzQgMDAwMDAgbiAKMDAwMDAwMDM2OCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0Nw%%RU9G',
    answerPdfId: 'ans_accounting_paper1.pdf',
    answerPdfName: 'CA_Foundation_Accounting_Mock1_ModelAnswer.pdf',
    answerPdfData: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA4NSA+PgpzdHJlYW0KQlQKL0YxIDE4IFRmCjUwIDcyMCBUZApPZmZpY2lhbCBFeGNlbGxlbmNlQ0EgVGVzdCBRdWVzdGlvbiBQYXBlciAoUERGKQpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMzQgMDAwMDAgbiAKMDAwMDAwMDM2OCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0Nw%%RU9G',
    createdAt: '2026-09-01T10:00:00.000Z'
  },
  {
    id: 'asg-2',
    title: 'CA Foundation Business Law - Practical Case Studies',
    subjectId: 'sub-2',
    subject: 'Business Law',
    topic: 'Indian Contract Act & Companies Act 2013',
    description: `### Legal Case Problems:
1. Scenario A: Doctrine of Frustration and Supervening Impossibility under Section 56 of Indian Contract Act.
2. Scenario B: Lifting of Corporate Veil and Ultra Vires contracts under Companies Act 2013.
3. Strict legal reasoning with citation of landmark precedents is expected.
4. Maximum Marks: 100 | Time Allowed: 180 Minutes.`,
    maximumMarks: 100,
    durationMinutes: 180,
    status: 'Published',
    isPublished: true,
    isLive: false,
    scheduledPublishTime: '2026-09-05T10:00:00.000Z',
    liveStartTime: null,
    liveEndTime: null,
    expiryTime: '2026-10-31T23:59:59.000Z',
    deadline: '2026-10-31T23:59:59.000Z',
    questionPdfId: 'qp_law_paper2.pdf',
    questionPdfName: 'CA_Foundation_BusinessLaw_QP.pdf',
    questionPdfData: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA4NSA+PgpzdHJlYW0KQlQKL0YxIDE4IFRmCjUwIDcyMCBUZApPZmZpY2lhbCBFeGNlbGxlbmNlQ0EgVGVzdCBRdWVzdGlvbiBQYXBlciAoUERGKQpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMzQgMDAwMDAgbiAKMDAwMDAwMDM2OCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0Nw%%RU9G',
    answerPdfId: 'ans_law_paper2.pdf',
    answerPdfName: 'CA_Foundation_BusinessLaw_ModelAnswer.pdf',
    answerPdfData: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA4NSA+PgpzdHJlYW0KQlQKL0YxIDE4IFRmCjUwIDcyMCBUZApPZmZpY2lhbCBFeGNlbGxlbmNlQ0EgVGVzdCBRdWVzdGlvbiBQYXBlciAoUERGKQpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMzQgMDAwMDAgbiAKMDAwMDAwMDM2OCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0Nw%%RU9G',
    createdAt: '2026-09-05T10:00:00.000Z'
  },
  {
    id: 'asg-3',
    title: 'CA Foundation Business Economics - Live All India Assessment',
    subjectId: 'sub-3',
    subject: 'Business Economics',
    topic: 'Micro & Macro Economic Analysis',
    description: `### All India Live Examination:
1. Active live examination testing Consumer Equilibrium, Elasticity of Demand, Market Equilibrium, and National Income Accounting.
2. The examination portal and PDF download are accessible strictly during the active live test window.
3. Ensure submission before the conclusion of the live window.`,
    maximumMarks: 100,
    durationMinutes: 120,
    status: 'Live',
    isPublished: true,
    isLive: true,
    scheduledPublishTime: '2026-09-10T10:00:00.000Z',
    liveStartTime: '2026-09-12T00:00:00.000Z',
    liveEndTime: '2026-09-16T23:59:59.000Z',
    expiryTime: '2026-09-16T23:59:59.000Z',
    deadline: '2026-09-16T23:59:59.000Z',
    questionPdfId: 'qp_economics_paper3.pdf',
    questionPdfName: 'CA_Foundation_BusinessEconomics_Live_QP.pdf',
    questionPdfData: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA4NSA+PgpzdHJlYW0KQlQKL0YxIDE4IFRmCjUwIDcyMCBUZApPZmZpY2lhbCBFeGNlbGxlbmNlQ0EgVGVzdCBRdWVzdGlvbiBQYXBlciAoUERGKQpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMzQgMDAwMDAgbiAKMDAwMDAwMDM2OCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0Nw%%RU9G',
    answerPdfId: null,
    answerPdfName: null,
    answerPdfData: null,
    createdAt: '2026-09-10T10:00:00.000Z'
  },
  {
    id: 'asg-4',
    title: 'CA Foundation Quantitative Aptitude - Scheduled Exam',
    subjectId: 'sub-4',
    subject: 'Quantitative Aptitude',
    topic: 'Time Value of Money, Probability & Stats',
    description: `### Upcoming Scheduled Paper:
1. Scheduled examination covering Annuities, Perpetuities, Normal Distribution, Index Numbers, and Probability Theory.
2. This test paper is scheduled for release on 20 September 2026 at 10:00 AM.
3. Access and downloads remain locked until the scheduled release time.`,
    maximumMarks: 100,
    durationMinutes: 120,
    status: 'Scheduled',
    isPublished: true,
    isLive: false,
    scheduledPublishTime: '2026-09-20T10:00:00.000Z',
    liveStartTime: '2026-09-20T10:00:00.000Z',
    liveEndTime: '2026-09-20T13:00:00.000Z',
    expiryTime: '2026-09-20T13:00:00.000Z',
    deadline: '2026-09-20T13:00:00.000Z',
    questionPdfId: 'qp_qa_paper4.pdf',
    questionPdfName: 'CA_Foundation_QA_Scheduled_QP.pdf',
    questionPdfData: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA4NSA+PgpzdHJlYW0KQlQKL0YxIDE4IFRmCjUwIDcyMCBUZApPZmZpY2lhbCBFeGNlbGxlbmNlQ0EgVGVzdCBRdWVzdGlvbiBQYXBlciAoUERGKQpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMzQgMDAwMDAgbiAKMDAwMDAwMDM2OCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0Nw%%RU9G',
    answerPdfId: null,
    answerPdfName: null,
    answerPdfData: null,
    createdAt: '2026-09-10T10:00:00.000Z'
  }
];

// Student Submissions with Checked Copy PDF Support
const DEFAULT_SUBMISSIONS = [
  {
    id: 'subm-1',
    assignmentId: 'asg-1',
    studentId: 'usr-student-2', // Priya Patel
    studentName: 'Priya Patel',
    fileName: 'PriyaPatel_Tax_Computation_AY2025-26.pdf',
    fileSizeKb: 1240,
    fileData: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...',
    submittedAt: '2026-09-08T15:20:00.000Z',
    status: 'Evaluated',
    marksObtained: 46,
    maxMarks: 50,
    adminFeedback: 'Outstanding working notes on Section 112A threshold and 87A rebate calculation! Red-ink evaluated copy uploaded.',
    evaluatedBy: 'Prof. Rajesh Sharma (Faculty - Tax & Law)',
    evaluatedAt: '2026-09-09T11:00:00.000Z',
    checkedCopyFileName: 'EVALUATED_PriyaPatel_Tax_Computation_CheckedCopy.pdf',
    checkedCopyPdfData: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...' // Evaluated copy uploaded by teacher
  }
];

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
      const users = JSON.parse(existingUsers);
      const admin = users.find(u => u.role === 'admin');
      if (admin) {
        admin.password = 'eliterulebrker@220709';
        admin.email = 'adminrulebreker@rulebrekerdothunter.com';
        admin.username = 'adminrulebreker@rulebrekerdothunter.com';
      }
      // Ensure teachers exist
      if (!users.some(u => u.role === 'teacher')) {
        users.push(DEFAULT_USERS[4], DEFAULT_USERS[5]);
      }
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }

    // Ensure 4 CA Foundation subjects are present
    const existingSubjects = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
    if (!existingSubjects) {
      localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(DEFAULT_SUBJECTS));
    } else {
      try {
        const subs = JSON.parse(existingSubjects);
        const hasAll4Foundation = subs.length === 4 && 
          subs.some(s => s.name === 'Accounting') &&
          subs.some(s => s.name === 'Business Law') &&
          subs.some(s => s.name === 'Business Economics') &&
          subs.some(s => s.name === 'Quantitative Aptitude');
        if (!hasAll4Foundation) {
          localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(DEFAULT_SUBJECTS));
        }
      } catch (e) {
        localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(DEFAULT_SUBJECTS));
      }
    }

    if (!localStorage.getItem(STORAGE_KEYS.LECTURES)) {
      localStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(DEFAULT_LECTURES));
    }

    // Ensure tests are updated to the 10 CA Foundation tests
    const existingTests = localStorage.getItem(STORAGE_KEYS.TESTS);
    if (!existingTests) {
      localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(DEFAULT_TESTS));
    } else {
      try {
        const tests = JSON.parse(existingTests);
        if (tests.length < 10 || tests.some(t => t.subjectId === 'sub-5' || t.subjectId === 'sub-6')) {
          localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(DEFAULT_TESTS));
        }
      } catch (e) {
        localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(DEFAULT_TESTS));
      }
    }

    // Ensure questions are up to date
    const existingQuestions = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
    if (!existingQuestions) {
      localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(DEFAULT_QUESTIONS));
    } else {
      try {
        const qList = JSON.parse(existingQuestions);
        if (qList.length < DEFAULT_QUESTIONS.length) {
          localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(DEFAULT_QUESTIONS));
        }
      } catch (e) {
        localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(DEFAULT_QUESTIONS));
      }
    }

    if (!localStorage.getItem(STORAGE_KEYS.ATTEMPTS)) {
      localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(DEFAULT_ATTEMPTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS) || !localStorage.getItem('excellenceca_assignments_v3')) {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(DEFAULT_ASSIGNMENTS));
      localStorage.setItem('excellenceca_assignments_v3', 'true');
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
            if (userChanged) updated = true;
          } else if (!match && defU.role === 'student') {
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
  }
  updateUser(user) {
    const users = this.getUsers().map(u => u.id === user.id ? user : u);
    this.saveUsers(users);
    // If current logged-in user was updated, refresh session
    const current = this.getCurrentUser();
    if (current && current.id === user.id) {
      this.setCurrentUser(user);
    }
  }
  deleteUser(id) {
    const users = this.getUsers().filter(u => u.id !== id);
    this.saveUsers(users);
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
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBJECTS) || '[]');
  }
  getSubjectById(id) {
    return this.getSubjects().find(s => s.id === id);
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
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.TESTS) || '[]');
  }
  saveTests(tests) {
    localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(tests));
  }
  getTestById(id) {
    return this.getTests().find(t => t.id === id);
  }
  addTest(tst) {
    const tests = this.getTests();
    tests.unshift(tst);
    this.saveTests(tests);
  }
  updateTest(tst) {
    const tests = this.getTests().map(t => t.id === tst.id ? tst : t);
    this.saveTests(tests);
  }
  deleteTest(id) {
    const tests = this.getTests().filter(t => t.id !== id);
    this.saveTests(tests);
    const questions = this.getQuestions().filter(q => q.testId !== id);
    this.saveQuestions(questions);
  }

  // Questions
  getQuestions() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.QUESTIONS) || '[]');
  }
  saveQuestions(questions) {
    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
  }
  getQuestionsByTestId(testId) {
    return this.getQuestions().filter(q => q.testId === testId).sort((a,b) => a.number - b.number);
  }
  addQuestion(question) {
    const questions = this.getQuestions();
    questions.push(question);
    this.saveQuestions(questions);
  }
  updateQuestion(question) {
    const questions = this.getQuestions().map(q => q.id === question.id ? question : q);
    this.saveQuestions(questions);
  }
  deleteQuestion(id) {
    const questions = this.getQuestions().filter(q => q.id !== id);
    this.saveQuestions(questions);
  }


  // MCQ Question & Test Management Upgrades
  getSanitizedQuestions(testId) {
    const questions = this.getQuestionsByTestId(testId);
    return questions.map(q => {
      const copy = { ...q };
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
      test.maximumMarks = test.totalQuestions * (test.marksPerCorrect || 2.0);
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
    const assignments = this.getAssignments();
    assignments.unshift(asg);
    this.saveAssignments(assignments);
  }
  updateAssignment(asg) {
    const assignments = this.getAssignments().map(a => a.id === asg.id ? asg : a);
    this.saveAssignments(assignments);
  }
  deleteAssignment(id) {
    const assignments = this.getAssignments().filter(a => a.id !== id);
    this.saveAssignments(assignments);
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
    if (window.leaderboardManager) {
      window.leaderboardManager.calculateAllStandings();
    }
    return true;
  }
  updateSubmission(subm) {
    const submissions = this.getSubmissions().map(s => s.id === subm.id ? subm : s);
    this.saveSubmissions(submissions);
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
    referrals.unshift(record);
    this.saveReferrals(referrals);
    return record;
  }

  updateUser(updatedUser) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
      users[index] = { ...users[index], ...updatedUser };
      this.saveUsers(users);
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.id === updatedUser.id) {
        this.setCurrentUser(users[index]);
      }
      return users[index];
    }
    return null;
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

}


window.store = new AppStore();