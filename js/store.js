/**
 * Store.js - Reactive Data Store with LocalStorage Persistence
 * Implements Bubble-like Data Types: User, Subject, Lecture, Test, Question, TestAttempt, Assignment, AssignmentSubmission
 */

const STORAGE_KEYS = {
  USERS: 'ca_platform_users',
  SUBJECTS: 'ca_platform_subjects',
  LECTURES: 'ca_platform_lectures',
  TESTS: 'ca_platform_tests',
  QUESTIONS: 'ca_platform_questions',
  ATTEMPTS: 'ca_platform_attempts',
  ASSIGNMENTS: 'ca_platform_assignments',
  SUBMISSIONS: 'ca_platform_submissions',
  CURRENT_USER: 'ca_platform_current_user'
};

const DEFAULT_SUBJECTS = [
  { id: 'sub-1', code: 'PAPER-1', name: 'Advanced Accounting', level: 'CA Inter', icon: 'calculator' },
  { id: 'sub-2', code: 'PAPER-2', name: 'Corporate & Other Laws', level: 'CA Inter', icon: 'scale' },
  { id: 'sub-3', code: 'PAPER-3', name: 'Cost & Management Accounting', level: 'CA Inter', icon: 'trending-up' },
  { id: 'sub-4', code: 'PAPER-4', name: 'Taxation (Income Tax & GST)', level: 'CA Inter', icon: 'file-text' },
  { id: 'sub-5', code: 'PAPER-5', name: 'Auditing & Ethics', level: 'CA Inter', icon: 'shield-check' },
  { id: 'sub-6', code: 'PAPER-6', name: 'Financial Management', level: 'CA Inter', icon: 'dollar-sign' }
];

const DEFAULT_USERS = [
  {
    id: 'usr-student-1',
    name: 'Rohan Sharma',
    email: 'rohan.sharma@castudent.in',
    password: 'password123',
    role: 'student',
    caLevel: 'CA Inter',
    registrationNo: 'NRO-0459201',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
  },
  {
    id: 'usr-student-2',
    name: 'Priya Patel',
    email: 'priya.patel@castudent.in',
    password: 'password123',
    role: 'student',
    caLevel: 'CA Inter',
    registrationNo: 'WRO-0782190',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80'
  },
  {
    id: 'usr-student-3',
    name: 'Amit Roy',
    email: 'amit.roy@castudent.in',
    password: 'password123',
    role: 'student',
    caLevel: 'CA Foundation',
    registrationNo: 'ERO-0312894',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'
  },
  {
    id: 'usr-admin-1',
    name: 'CA Sanjeev Verma, FCA',
    email: 'admin@caexcellence.edu',
    password: 'adminpassword',
    role: 'admin',
    caLevel: 'Senior Faculty & Admin',
    registrationNo: 'FCA-088312',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80'
  }
];

const DEFAULT_LECTURES = [
  {
    id: 'lec-1',
    title: 'Ind AS 115: 5-Step Model for Revenue Recognition with Practical Scenarios',
    subjectId: 'sub-1',
    chapter: 'Accounting Standards & Ind AS',
    description: 'Master the core 5-step framework under Ind AS 115: Identifying contracts, identifying performance obligations, determining transaction price, allocation, and revenue recognition over time vs at a point in time.',
    videoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', // Clean embed URL
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
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-09-30T23:59:59.000Z'
  },
  {
    id: 'tst-2',
    title: 'Companies Act 2013: Board Meetings & Resolutions Challenge',
    subjectId: 'sub-2',
    chapter: 'Board Meetings & Management',
    description: 'Test your understanding of quorum, notices, circular resolutions, and committee requirements under the Companies Act 2013. Standard negative marking applies.',
    durationMinutes: 12,
    totalQuestions: 5,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 2,
    isPublished: true,
    startDate: '2026-09-05T00:00:00.000Z',
    endDate: '2026-10-15T23:59:59.000Z'
  },
  {
    id: 'tst-3',
    title: 'GST Input Tax Credit (ITC) Section 16 & 17 Practice Test',
    subjectId: 'sub-4',
    chapter: 'Input Tax Credit',
    description: 'Test on conditions for taking ITC, blocked credit under Section 17(5), and documentary evidence under CGST Act. Positive marking: +2.0, Negative marks: -0.5.',
    durationMinutes: 10,
    totalQuestions: 4,
    marksPerCorrect: 2.0,
    negativeMarksPerWrong: 0.5,
    maxAttempts: 2,
    isPublished: true,
    startDate: '2026-09-08T00:00:00.000Z',
    endDate: '2026-10-20T23:59:59.000Z'
  }
];

const DEFAULT_QUESTIONS = [
  // Test 1 Questions (Ind AS 115)
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
    explanation: 'The 5 steps under Ind AS 115 are: (1) Identify contract with customer, (2) Identify performance obligations, (3) Determine transaction price, (4) Allocate transaction price, and (5) Recognize revenue. Estimating fair value of surrendered assets is an Ind AS 16 / Ind AS 38 concept, not part of Ind AS 115 5-step framework.'
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

  // Test 2 Questions (Companies Act 2013)
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
    explanation: 'Section 173(3) requires not less than 7 days notice in writing to every director at his address registered with the company. Shorter notice is permissible if at least one independent director is present.'
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
    explanation: 'Section 174(1) provides that the quorum for a Board meeting shall be 1/3rd of its total strength or two directors, whichever is higher, and any fraction of a number shall be rounded off as one.'
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
    explanation: 'Under Section 179(3) read with Rule 8 of Companies (Meetings of Board and its Powers) Rules, approval of annual financial statements and Board report MUST be passed at a physical/video Board meeting and cannot be passed by circular resolution.'
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
    text: 'In a company where the total strength of the Board is 9 directors, and 7 directors are interested in a contract, what is the valid quorum for discussing that contract under Section 174(3)?',
    optionA: 'No meeting can be held; must refer to General Meeting.',
    optionB: '2 disinterested directors present at the meeting.',
    optionC: 'The interested directors can vote with prior ROC permission.',
    optionD: 'Quorum must be at least 3 directors.',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Under Section 174(3), where the number of interested directors exceeds or is equal to 2/3rds of total strength, the remaining non-interested directors present (not being less than 2) shall constitute the quorum.'
  },

  // Test 3 Questions (GST ITC)
  {
    id: 'q-301',
    testId: 'tst-3',
    number: 1,
    text: 'Under Section 16(2) of CGST Act, which of the following is NOT a mandatory condition for availing Input Tax Credit (ITC)?',
    optionA: 'Registered person is in possession of a tax invoice or debit note.',
    optionB: 'Registered person has received the goods or services.',
    optionC: 'Supplier has paid the tax to the Government credit.',
    optionD: 'The recipient has paid the invoice value to the supplier within 30 days of invoice date.',
    correctOption: 'D',
    marks: 2.0,
    explanation: 'Under the proviso to Section 16(2), the recipient has 180 days (not 30 days) from the date of invoice to make payment to the supplier, failing which ITC is added back to output tax liability along with interest.'
  },
  {
    id: 'q-302',
    testId: 'tst-3',
    number: 2,
    text: 'Under Section 17(5) of the CGST Act, ITC is blocked on motor vehicles for transportation of persons having approved seating capacity of:',
    optionA: 'Not more than 13 persons (including driver), subject to specified business exceptions.',
    optionB: 'More than 20 persons only.',
    optionC: 'All vehicles irrespective of seating capacity without exception.',
    optionD: 'Only electric four-wheelers.',
    correctOption: 'A',
    marks: 2.0,
    explanation: 'Section 17(5)(a) blocks ITC on motor vehicles for transportation of persons having approved seating capacity of not more than 13 persons (including the driver), except when used for making taxable supplies like further supply, passenger transportation, or driving school training.'
  },
  {
    id: 'q-303',
    testId: 'tst-3',
    number: 3,
    text: 'Can a registered person claim ITC on goods destroyed, stolen, lost, written off, or disposed of by way of gift or free samples under Section 17(5)(h)?',
    optionA: 'Yes, full ITC is allowed if police complaint is registered.',
    optionB: 'No, ITC is explicitly blocked under Section 17(5)(h).',
    optionC: 'Allowed only up to 50% of the GST paid.',
    optionD: 'Allowed with approval from Jurisdictional Commissioner.',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Section 17(5)(h) explicitly blocks ITC in respect of goods lost, stolen, destroyed, written off, or disposed of by way of gift or free samples.'
  },
  {
    id: 'q-304',
    testId: 'tst-3',
    number: 4,
    text: 'What is the statutory time limit under Section 16(4) for claiming ITC in respect of any invoice or debit note pertaining to a financial year?',
    optionA: '31st December following the end of financial year or filing of annual return, whichever is earlier.',
    optionB: '30th November following the end of financial year or filing of relevant annual return, whichever is earlier.',
    optionC: '30th September of the subsequent financial year strictly.',
    optionD: 'No time limit as long as invoice appears in GSTR-2B.',
    correctOption: 'B',
    marks: 2.0,
    explanation: 'Finance Act amended Section 16(4) to extend the deadline up to 30th day of November following the end of the financial year or the date of furnishing the annual return, whichever is earlier.'
  }
];

const DEFAULT_ATTEMPTS = [
  {
    id: 'att-1',
    testId: 'tst-1',
    userId: 'usr-student-2', // Priya Patel
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
    userId: 'usr-student-3', // Amit Roy
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
  },
  {
    id: 'att-3',
    testId: 'tst-2',
    userId: 'usr-student-2', // Priya Patel
    userName: 'Priya Patel',
    attemptNumber: 1,
    status: 'Completed',
    startedAt: '2026-09-10T11:00:00.000Z',
    submittedAt: '2026-09-10T11:10:30.000Z',
    timeTakenSeconds: 630,
    correctCount: 4,
    wrongCount: 1,
    unattemptedCount: 0,
    grossMarks: 8.0,
    negativePenalty: 0.5,
    finalScore: 7.5,
    percentage: 75.0,
    userAnswers: { 'q-201': 'B', 'q-202': 'A', 'q-203': 'B', 'q-204': 'B', 'q-205': 'A' }
  }
];

const DEFAULT_ASSIGNMENTS = [
  {
    id: 'asg-1',
    title: 'Practical Case Study: Computation of Total Income & Tax Liability under Default vs Concessional Regime (AY 2025-26)',
    subjectId: 'sub-4',
    topic: 'Direct Taxation / Individuals & HUF',
    description: `### Case Context:
Mr. Rajesh Aggarwal (Age 48, Resident) is a CFO at an IT MNC. During PY 2024-25, he earned Salary (Basic + DA + HRA + Special Allowance), Interest from Fixed Deposits, Long Term Capital Gains on listed equity shares (Section 112A), and Short Term Capital Gains under Section 111A. He made investments under Section 80C and paid health insurance under Section 80D.

### Required:
1. Compute Total Income under the Default New Tax Regime (Section 115BAC).
2. Compute Total Income under the Normal / Old Tax Provisions with eligible chapter VI-A deductions.
3. Determine tax liability including health & education cess and rebate under Section 87A.
4. Advise Mr. Aggarwal on the most beneficial tax regime to select.

**Submission Format:**
Prepare your step-by-step computation neatly with working notes and export to **PDF format**. Maximum file size: 10 MB.`,
    deadline: '2026-09-25T23:59:59.000Z',
    maximumMarks: 50,
    isPublished: true,
    createdAt: '2026-09-02T10:00:00.000Z'
  },
  {
    id: 'asg-2',
    title: 'Preparation of Consolidated Balance Sheet under Ind AS 110 with Non-Controlling Interest & Goodwill',
    subjectId: 'sub-1',
    topic: 'Group Accounts & Business Combinations',
    description: `### Problem Assignment:
Alpha Ltd acquires 75% equity shares of Beta Ltd on 1st October 2024. beta Ltd had fair value adjustments on plant and machinery of ₹ 20,00,000 on acquisition date. Non-controlling interest is to be measured at proportionate fair value of identifiable net assets.

### Requirements:
1. Calculation of Purchase Consideration and Net Identifiable Assets.
2. Calculation of Non-Controlling Interest (NCI) as on Acquisition Date and Balance Sheet Date.
3. Calculation of Goodwill or Gain on Bargain Purchase under Ind AS 103.
4. Consolidated Balance Sheet of Alpha Ltd and Beta Ltd as on 31st March 2025.

**Upload Requirement:**
Neatly formatted PDF report with balance sheet schedules and working notes.`,
    deadline: '2026-09-30T23:59:59.000Z',
    maximumMarks: 100,
    isPublished: true,
    createdAt: '2026-09-04T12:00:00.000Z'
  },
  {
    id: 'asg-3',
    title: 'Statutory Audit Planning Memo & Materiality Thresholds (SA 320 & SA 315)',
    subjectId: 'sub-5',
    topic: 'Audit Planning & Risk Assessment',
    description: `Draft an Audit Planning Memorandum for a manufacturing company having turnover of ₹ 350 Crores. Set Overall Materiality, Performance Materiality, and Clearly Trivial Threshold following SA 320. Identify key risk of material misstatement (RoMM) at financial statement level and assertion level.

**Upload:** Single PDF submission under 10MB.`,
    deadline: '2026-10-05T23:59:59.000Z',
    maximumMarks: 40,
    isPublished: true,
    createdAt: '2026-09-06T09:30:00.000Z'
  }
];

const DEFAULT_SUBMISSIONS = [
  {
    id: 'subm-1',
    assignmentId: 'asg-1',
    studentId: 'usr-student-2', // Priya Patel
    studentName: 'Priya Patel',
    fileName: 'PriyaPatel_Tax_Computation_AY2025-26.pdf',
    fileSizeKb: 1240,
    fileData: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...', // Simulated PDF payload
    submittedAt: '2026-09-08T15:20:00.000Z',
    status: 'Evaluated',
    marksObtained: 46,
    maxMarks: 50,
    adminFeedback: 'Excellent working notes on Section 112A threshold and 87A rebate calculation! Clean presentation.',
    evaluatedBy: 'usr-admin-1',
    evaluatedAt: '2026-09-09T11:00:00.000Z'
  }
];

/**
 * Storage Abstraction Layer
 */
class AppStore {
  constructor() {
    this.initData();
  }

  initData() {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SUBJECTS)) {
      localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(DEFAULT_SUBJECTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LECTURES)) {
      localStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(DEFAULT_LECTURES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TESTS)) {
      localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(DEFAULT_TESTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.QUESTIONS)) {
      localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(DEFAULT_QUESTIONS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ATTEMPTS)) {
      localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(DEFAULT_ATTEMPTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS)) {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(DEFAULT_ASSIGNMENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SUBMISSIONS)) {
      localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(DEFAULT_SUBMISSIONS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) {
      // Default to Demo Student (Rohan Sharma)
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(DEFAULT_USERS[0]));
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
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(DEFAULT_USERS[0]));
  }

  // Users & Auth
  getUsers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  }
  saveUsers(users) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
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
    // Also delete associated questions
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
  }

  // Assignments
  getAssignments() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS) || '[]');
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

  // Submissions
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
    // remove previous submission if re-submitting
    const filtered = submissions.filter(s => !(s.assignmentId === subm.assignmentId && s.studentId === subm.studentId));
    filtered.unshift(subm);
    this.saveSubmissions(filtered);
  }
  updateSubmission(subm) {
    const submissions = this.getSubmissions().map(s => s.id === subm.id ? subm : s);
    this.saveSubmissions(submissions);
  }
}

// Global Store Instance
window.store = new AppStore();
