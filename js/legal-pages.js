/**
 * legal-pages.js - About, Contact and legal/policy pages for ExcellenceCA
 * Routes: #about, #contact, #privacy-policy, #terms, #disclaimer, #cookie-policy, #refund-policy
 * (also reachable as /about, /contact, ... via server.py and vercel.json rewrites)
 *
 * Content reflects what the codebase actually does. Update it whenever data collection,
 * third-party services, or the payment/pass flow changes.
 *
 * When an advertising or analytics provider is integrated, update these sections to name the
 * real provider and the cookies/technologies it actually sets, and bump LEGAL_LAST_UPDATED:
 *   - privacy-policy: 'advertising-analytics', 'third-parties', 'cookies'
 *   - cookie-policy:  'what-we-use', 'analytics-advertising', 'third-party-requests', 'preferences'
 * If the provider needs consent, add real consent controls before changing 'preferences'.
 */

const LEGAL_SUPPORT_EMAIL = 'snapdoubt0@gmail.com';
const LEGAL_LAST_UPDATED = '29 September 2026';
const LEGAL_DEFAULT_TITLE = 'ExcellenceCA - Chartered Accountancy Learning & Test Platform';

const LEGAL_MAIL = `<a href="mailto:${LEGAL_SUPPORT_EMAIL}">${LEGAL_SUPPORT_EMAIL}</a>`;

const LEGAL_PAGES = {
  about: {
    title: 'About ExcellenceCA',
    navLabel: 'About Us',
    group: 'company',
    icon: 'graduation-cap',
    eyebrow: 'About Us',
    intro: 'ExcellenceCA is an online practice and learning platform for Chartered Accountancy students preparing for the CA Foundation, CA Intermediate and CA Final examinations.',
    showUpdated: false,
    sections: [
      {
        id: 'what-we-do',
        heading: 'What ExcellenceCA is',
        html: `
          <p>ExcellenceCA brings exam-style practice for CA students into one place. Students can attempt timed MCQ tests, work on subject-wise test papers, submit answer sheets for evaluation and track their progress over time.</p>
          <p>The platform is built around one idea: regular, realistic practice is one of the most useful things a CA student can do before an exam. ExcellenceCA aims to make that practice easy to start, easy to repeat and easy to review.</p>
        `
      },
      {
        id: 'who-its-for',
        heading: 'Who it is for',
        html: `
          <p>ExcellenceCA is designed for students at every stage of the CA course:</p>
          <ul>
            <li><strong>CA Foundation</strong> students building conceptual clarity across the foundation papers.</li>
            <li><strong>CA Intermediate</strong> students practising subject-wise questions and full-length papers.</li>
            <li><strong>CA Final</strong> students revising under time pressure before their attempt.</li>
          </ul>
          <p>You choose your CA level when you register, and the platform shows practice content organised for that level.</p>
        `
      },
      {
        id: 'features',
        heading: 'What you can do on ExcellenceCA',
        features: [
          { icon: 'timer', title: 'Timed MCQ tests', text: 'Attempt MCQ tests with a countdown timer, a question palette, mark-for-review and negative marking, followed by results and explanations.' },
          { icon: 'file-text', title: 'Test papers', text: 'Download subject-wise question papers, upload your answer sheet as a PDF and receive marks, remarks and an evaluated copy.' },
          { icon: 'layers', title: 'Mock tests & practice', text: 'Practise chapter-wise and subject-wise questions, and attempt fuller mock-style tests to check your preparation.' },
          { icon: 'trophy', title: 'Progress & leaderboard', text: 'Earn XP for your practice activity, move through rank tiers and see where you stand among other students.' },
          { icon: 'badge-check', title: 'Optional passes', text: 'Free access covers core practice. Optional paid passes unlock premium questions, test papers and faster evaluation.' },
          { icon: 'bell', title: 'Notifications', text: 'Get in-app updates when your evaluated copy is ready, your pass is activated, or there is something new to attempt.' }
        ]
      },
      {
        id: 'approach',
        heading: 'Our approach to content',
        html: `
          <p>Practice questions and explanations on ExcellenceCA are prepared for learning and self-assessment. Some content may be prepared with the help of automated (AI-assisted) tools. We work to keep questions accurate and aligned with the CA syllabus, but no question bank is free of errors. If you spot a mistake, please tell us through the <a href="#contact">Contact Us</a> page so we can fix it.</p>
          <p>ExcellenceCA is an independent platform. It is not the Institute of Chartered Accountants of India (ICAI) and is not affiliated with or endorsed by ICAI. Please read our <a href="#disclaimer">Disclaimer</a> for details.</p>
        `
      },
      {
        id: 'get-in-touch',
        heading: 'Get in touch',
        html: `
          <p>Questions about the platform, your account, a pass or a practice question? Write to us at ${LEGAL_MAIL} or use the <a href="#contact">Contact Us</a> page.</p>
        `
      }
    ]
  },

  contact: {
    title: 'Contact Us',
    navLabel: 'Contact Us',
    group: 'company',
    icon: 'mail',
    eyebrow: 'Help & Support',
    intro: 'Have a question about your account, a pass, a payment or a practice question? Email the ExcellenceCA support team and we will get back to you.',
    showUpdated: false,
    custom: 'contact'
  },

  'privacy-policy': {
    title: 'Privacy Policy',
    navLabel: 'Privacy Policy',
    group: 'legal',
    icon: 'shield-check',
    eyebrow: 'Legal',
    intro: 'This Privacy Policy explains what information ExcellenceCA collects when you use the website, how it is used and stored, who it is shared with, and the choices you have.',
    showUpdated: true,
    sections: [
      {
        id: 'scope',
        heading: 'Scope',
        html: `
          <p>This policy applies to the ExcellenceCA website and platform, including student, faculty and administrator accounts. By using ExcellenceCA you agree to the practices described here. If you do not agree, please do not use the platform.</p>
        `
      },
      {
        id: 'information-we-collect',
        heading: 'Information we collect',
        html: `
          <h3>Account information</h3>
          <p>When you register, we collect your <strong>full name</strong>, <strong>username</strong>, <strong>email address</strong>, <strong>mobile number</strong>, your <strong>CA level</strong> (Foundation, Intermediate or Final), a password, and a referral code if you enter one. Your password is stored in hashed form, not as plain text. You may also add a profile picture from your profile settings.</p>
          <h3>Test, MCQ and learning activity</h3>
          <p>When you use the platform we record your test attempts, selected answers, scores, time taken, bookmarks, XP points and rank tier. When you work on test papers, we store the answer-sheet PDFs you upload together with the marks, remarks and evaluated copies returned by faculty or administrators.</p>
          <h3>Pass and payment information</h3>
          <p>If you buy a pass, we record the plan you chose, the amount, the payment session, the <strong>UPI transaction reference (UTR)</strong> you submit, the <strong>payment screenshot or receipt</strong> you upload, the verification outcome and your pass start and expiry dates. Payments are made through your own UPI app. ExcellenceCA does not collect or store your card details, bank account credentials or UPI PIN.</p>
          <h3>Support communication</h3>
          <p>If you email us, we receive your email address and whatever you include in your message.</p>
          <h3>Technical information</h3>
          <p>Like any website, our servers and the third-party services listed below receive standard technical information when your browser loads the site, such as your IP address, browser type and the pages requested. Our server may record this in operational logs for security and troubleshooting.</p>
        `
      },
      {
        id: 'how-we-use',
        heading: 'How we use your information',
        html: `
          <ul>
            <li>To create and manage your account, sign you in and keep your session secure.</li>
            <li>To show you practice content for your CA level and record your attempts, results and progress.</li>
            <li>To evaluate submitted answer sheets and return marks, remarks and evaluated copies.</li>
            <li>To calculate XP, rank tiers and leaderboard positions, and to run the referral programme.</li>
            <li>To verify pass payments, activate passes and manage pass validity.</li>
            <li>To send you in-app notifications and, when you request it, a password reset email.</li>
            <li>To respond to your support requests.</li>
            <li>To detect misuse, such as reused payment references or unauthorised account access.</li>
          </ul>
          <p>We do not sell your personal information.</p>
        `
      },
      {
        id: 'visibility',
        heading: 'What other users can see',
        html: `
          <p>The leaderboard shows your <strong>name or username</strong>, <strong>profile picture</strong> (if you set one), XP and rank to other signed-in users. Your email address, mobile number, uploaded answer sheets, evaluated copies and payment details are not shown to other students. Authorised faculty and administrators can access student records where needed to evaluate work, verify payments and support accounts.</p>
        `
      },
      {
        id: 'cookies',
        heading: 'Cookies and similar technologies',
        html: `
          <p>ExcellenceCA does not currently set its own cookies. The website uses your browser's <strong>local storage</strong> and <strong>session storage</strong> to keep you signed in, remember an in-progress test or payment session, and cache platform data so pages load faster. These are needed for the site to work.</p>
          <p>See our <a href="#cookie-policy">Cookie Policy</a> for the full list and how to clear this data.</p>
        `
      },
      {
        id: 'advertising-analytics',
        heading: 'Advertising and analytics',
        html: `
          <p>At the time of this update, ExcellenceCA <strong>does not run third-party advertising</strong> and <strong>does not use third-party analytics or tracking tools</strong> (such as advertising pixels or visitor analytics scripts).</p>
          <p>If we introduce advertising or analytics services in the future, including services such as Google AdSense that may use cookies to show ads, we will update this policy and our <a href="#cookie-policy">Cookie Policy</a> before or when they go live, and provide consent choices where the law requires them.</p>
        `
      },
      {
        id: 'third-parties',
        heading: 'Third-party services',
        html: `
          <p>We rely on the following service providers to run the platform. They process data only as needed to provide their service:</p>
          <ul>
            <li><strong>Vercel</strong> - website and API hosting.</li>
            <li><strong>MongoDB</strong> - database storage for accounts, activity, submissions, pass records and uploaded images.</li>
            <li><strong>Brevo</strong> - delivery of password reset emails.</li>
            <li><strong>QR Server (api.qrserver.com)</strong> - generating UPI payment QR codes; the payee UPI ID, amount and plan name are sent to create the QR image.</li>
            <li><strong>Content delivery networks</strong> - Google Fonts, the Tailwind CSS CDN, unpkg (icons) and cdnjs (PDF.js) deliver fonts, styles and scripts to your browser. Unsplash may serve the default profile image. These providers receive your IP address and browser information when your browser downloads these files.</li>
          </ul>
          <p>Your UPI payment itself is handled by your own UPI app, bank and the payment network, under their own terms and privacy policies.</p>
        `
      },
      {
        id: 'storage-security',
        heading: 'Data storage, retention and security',
        html: `
          <p>Your data is stored in our database and with the service providers listed above. We use measures such as hashed passwords, authenticated API access, role-based permissions for faculty and administrators, and single-use, time-limited password reset links.</p>
          <p>We keep account and activity data for as long as your account is active, and payment and pass records as long as needed to handle verification, disputes and our record-keeping obligations. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.</p>
        `
      },
      {
        id: 'your-rights',
        heading: 'Your rights and choices',
        html: `
          <ul>
            <li><strong>Access and correction:</strong> You can view and update your profile details from your profile page. Some fields, such as your username, can only be changed by an administrator.</li>
            <li><strong>Deletion:</strong> You can ask us to delete your account by emailing ${LEGAL_MAIL}. Account deletion is handled on request; there is no self-service delete option in the app. Deletion removes your account, test attempts and paper submissions from our database. We may keep limited payment records where needed for verification or disputes.</li>
            <li><strong>Browser data:</strong> You can clear data stored on your device at any time through your browser settings. This signs you out.</li>
            <li><strong>Questions or complaints:</strong> Email us and we will respond to your request.</li>
          </ul>
          <p>To make a request, email ${LEGAL_MAIL} from your registered email address so we can verify the account belongs to you.</p>
        `
      },
      {
        id: 'children',
        heading: 'Students under 18',
        html: `
          <p>Many CA Foundation students are under 18. If you are under 18, please use ExcellenceCA with the knowledge of a parent or guardian, and have them review this policy with you, particularly before buying a pass.</p>
        `
      },
      {
        id: 'changes',
        heading: 'Changes to this policy',
        html: `
          <p>We may update this policy when our services or data practices change. The "Last updated" date at the top of the page shows when it was last revised. Continuing to use ExcellenceCA after an update means you accept the revised policy.</p>
        `
      },
      {
        id: 'contact',
        heading: 'Contact',
        html: `<p>For privacy questions or requests, email ${LEGAL_MAIL}.</p>`
      }
    ]
  },

  terms: {
    title: 'Terms & Conditions',
    navLabel: 'Terms & Conditions',
    group: 'legal',
    icon: 'scroll-text',
    eyebrow: 'Legal',
    intro: 'These Terms & Conditions govern your use of the ExcellenceCA website and platform. Please read them carefully. By creating an account or using ExcellenceCA, you agree to them.',
    showUpdated: true,
    sections: [
      {
        id: 'use-of-platform',
        heading: 'Using the platform',
        html: `
          <p>ExcellenceCA provides online practice for CA students, including MCQ tests, test papers, answer-sheet evaluation, leaderboards and optional paid passes. You may use the platform for your own personal, non-commercial learning.</p>
          <p>You agree to use ExcellenceCA lawfully and in line with these Terms, our <a href="#privacy-policy">Privacy Policy</a> and any instructions shown on the platform.</p>
        `
      },
      {
        id: 'accounts',
        heading: 'User accounts',
        html: `
          <ul>
            <li>You must provide accurate registration details, including a valid email address and mobile number, and keep them up to date.</li>
            <li>You are responsible for keeping your password confidential and for activity under your account. Tell us promptly at ${LEGAL_MAIL} if you think your account has been misused.</li>
            <li>Accounts are personal. Do not share your login with others or let others use your account or pass.</li>
            <li>Faculty and administrator accounts are created only by ExcellenceCA. Public registration is for students.</li>
          </ul>
        `
      },
      {
        id: 'tests',
        heading: 'MCQ tests and test papers',
        html: `
          <ul>
            <li>Tests are timed. A test is submitted automatically when the timer runs out. Scores follow the marking scheme shown for that test, which may include negative marking.</li>
            <li>Results, explanations, XP and ranks are for self-assessment. They do not predict or represent your performance in any ICAI examination.</li>
            <li>Uploaded answer sheets must be your own work and must follow the file type and size limits shown on the upload screen.</li>
            <li>Evaluation times shown for a pass are targets. Delays can occur, and they do not entitle you to compensation.</li>
            <li>We may correct, update or remove questions, tests or papers, and may recalculate results, XP or ranks where an error is found.</li>
          </ul>
        `
      },
      {
        id: 'passes',
        heading: 'Paid passes',
        html: `
          <ul>
            <li>Some features are available only with a paid pass. The current plans, prices, validity periods and included features are shown on the <a href="#passes">Passes</a> page at the time of purchase.</li>
            <li>A pass is a one-time purchase for a fixed period. It does not renew automatically, and you are not charged again unless you choose to buy another pass.</li>
            <li>If you buy a pass while another pass is still active, the new pass's validity is added to your current expiry date.</li>
            <li>Access ends when the pass expires. We may change plan prices and features for future purchases; changes do not affect a pass you have already bought.</li>
          </ul>
        `
      },
      {
        id: 'payments',
        heading: 'Payments',
        html: `
          <ul>
            <li>Payments are made by UPI to the payee details shown at checkout. After paying, you submit the UPI transaction reference (UTR) and a screenshot or receipt.</li>
            <li>Each payment is verified manually. Your pass is activated only after the payment is verified. A payment may be rejected if it cannot be matched to a genuine transaction.</li>
            <li>Each UTR can be used only once. Submitting a false, edited or someone else's payment proof is prohibited and may lead to account suspension.</li>
            <li>Refunds and cancellations are covered by our <a href="#refund-policy">Refund & Cancellation Policy</a>.</li>
          </ul>
        `
      },
      {
        id: 'intellectual-property',
        heading: 'Content ownership and intellectual property',
        html: `
          <p>The ExcellenceCA name, logo, website design, software, and the practice questions, explanations, test papers and other materials we publish are owned by or licensed to ExcellenceCA. You may use them only to study on the platform.</p>
          <p>You may not copy, download in bulk, republish, sell, share or distribute platform content, including through screenshots, groups or other websites, without our written permission.</p>
          <p>You keep ownership of the answer sheets and other material you upload. You allow ExcellenceCA, its faculty and administrators to store, view and annotate that material in order to evaluate it and provide the service.</p>
          <p>References to ICAI, its syllabus or its examinations are for identification only. See the <a href="#disclaimer">Disclaimer</a>.</p>
        `
      },
      {
        id: 'prohibited',
        heading: 'Prohibited activities',
        html: `
          <p>You must not:</p>
          <ul>
            <li>share your account or pass, or access another person's account;</li>
            <li>submit false payment details, reuse a UTR, or try to activate a pass without paying;</li>
            <li>manipulate test results, XP, ranks, the leaderboard or the referral programme, including by creating fake accounts;</li>
            <li>copy, scrape or redistribute questions, explanations or papers;</li>
            <li>upload files that contain malware, or content that is unlawful, abusive or infringes someone else's rights;</li>
            <li>try to bypass security, access admin or faculty features without permission, or disrupt the platform;</li>
            <li>use automated tools to access or extract data from the platform.</li>
          </ul>
        `
      },
      {
        id: 'suspension',
        heading: 'Account suspension and termination',
        html: `
          <p>We may deactivate or suspend an account, cancel a pass, or remove content if we reasonably believe these Terms have been broken, if required by law, or to protect other users or the platform. A deactivated account cannot sign in.</p>
          <p>You may stop using ExcellenceCA at any time and may ask us to delete your account as described in the <a href="#privacy-policy">Privacy Policy</a>.</p>
        `
      },
      {
        id: 'availability',
        heading: 'Service availability',
        html: `
          <p>We try to keep ExcellenceCA available and working correctly, but we do not guarantee uninterrupted or error-free service. The platform may be unavailable during maintenance, updates, or problems with our hosting and service providers. We may add, change or remove features over time.</p>
        `
      },
      {
        id: 'liability',
        heading: 'Limitation of liability',
        html: `
          <p>ExcellenceCA is provided on an "as is" and "as available" basis for practice and learning. To the maximum extent permitted by law:</p>
          <ul>
            <li>we do not guarantee exam results, marks, ranks or passing any examination;</li>
            <li>we are not responsible for decisions you make based on platform content, which may contain errors;</li>
            <li>we are not liable for indirect or consequential losses, or for losses caused by events outside our reasonable control;</li>
            <li>our total liability to you for any claim relating to a paid pass is limited to the amount you paid for that pass.</li>
          </ul>
        `
      },
      {
        id: 'changes',
        heading: 'Changes to these terms',
        html: `
          <p>We may update these Terms from time to time. The "Last updated" date shows the latest version. Continuing to use ExcellenceCA after an update means you accept the revised Terms.</p>
        `
      },
      {
        id: 'contact',
        heading: 'Contact',
        html: `<p>Questions about these Terms can be sent to ${LEGAL_MAIL}.</p>`
      }
    ]
  },

  disclaimer: {
    title: 'Disclaimer',
    navLabel: 'Disclaimer',
    group: 'legal',
    icon: 'info',
    eyebrow: 'Legal',
    intro: 'Please read this disclaimer before relying on any content on ExcellenceCA.',
    showUpdated: true,
    sections: [
      {
        id: 'educational-platform',
        heading: 'An educational practice platform',
        html: `
          <p>ExcellenceCA is an independent online platform for practice and learning. Its MCQs, mock tests, test papers, explanations, evaluations and rankings are provided to help students practise and assess themselves.</p>
        `
      },
      {
        id: 'not-icai',
        heading: 'Not ICAI, and not affiliated with ICAI',
        html: `
          <p>ExcellenceCA is <strong>not</strong> the Institute of Chartered Accountants of India (ICAI). It is not affiliated with, authorised by or endorsed by ICAI. Nothing on the platform should be read as an official ICAI communication, publication, result or instruction.</p>
          <p>Terms such as "CA Foundation", "CA Intermediate", "CA Final" and "ICAI" are used only to describe the examinations our practice content is designed around.</p>
        `
      },
      {
        id: 'verify-official',
        heading: 'Verify exam information from official sources',
        html: `
          <p>Syllabus, exam dates, exam patterns, marking schemes, eligibility rules, applicable amendments and study material are decided by ICAI and can change. Always confirm exam-related information from ICAI's official website and official announcements. Do not rely only on ExcellenceCA for this information.</p>
        `
      },
      {
        id: 'content-accuracy',
        heading: 'Content accuracy',
        html: `
          <p>We work to keep questions, answers and explanations accurate, but errors or outdated content may occur. Some content may be prepared with the help of automated (AI-assisted) tools. Content reflects the law and standards as understood when it was prepared and may not include later amendments.</p>
          <p>If you believe something is wrong, please report it through the <a href="#contact">Contact Us</a> page.</p>
        `
      },
      {
        id: 'no-guarantee',
        heading: 'No guarantee of results',
        html: `
          <p>Scores, XP, ranks and leaderboard positions on ExcellenceCA reflect performance on our practice content only. They do not predict your marks, rank or result in any ICAI examination. ExcellenceCA does not guarantee that any student will pass an exam or achieve a particular rank.</p>
        `
      },
      {
        id: 'not-advice',
        heading: 'Not professional advice',
        html: `
          <p>Content on ExcellenceCA is for exam preparation only. It is not professional accounting, tax, legal or financial advice and should not be used as such.</p>
        `
      },
      {
        id: 'external-links',
        heading: 'External links',
        html: `
          <p>The platform may link to external websites. We do not control those websites and are not responsible for their content or practices.</p>
        `
      },
      {
        id: 'contact',
        heading: 'Contact',
        html: `<p>Questions about this disclaimer can be sent to ${LEGAL_MAIL}.</p>`
      }
    ]
  },

  'cookie-policy': {
    title: 'Cookie Policy',
    navLabel: 'Cookie Policy',
    group: 'legal',
    icon: 'cookie',
    eyebrow: 'Legal',
    intro: 'This policy explains how ExcellenceCA uses cookies, browser storage and similar technologies, and how you can control them.',
    showUpdated: true,
    sections: [
      {
        id: 'what-they-are',
        heading: 'What cookies and browser storage are',
        html: `
          <p><strong>Cookies</strong> are small text files that a website stores in your browser. <strong>Local storage</strong> and <strong>session storage</strong> are similar browser features that let a website save data on your device. Session storage is cleared when you close the tab; local storage stays until it is cleared.</p>
        `
      },
      {
        id: 'what-we-use',
        heading: 'What ExcellenceCA uses',
        html: `
          <p>ExcellenceCA <strong>does not currently set its own cookies</strong>. It uses local storage and session storage for the following <strong>essential</strong> purposes:</p>
          <ul>
            <li><strong>Sign-in session</strong> (<code>excellenceca_current_user</code>) - keeps you signed in and stores your session token.</li>
            <li><strong>Test in progress</strong> (<code>excellenceca_active_exam_session</code>) - lets you resume an active MCQ test if the page reloads.</li>
            <li><strong>Payment in progress</strong> (<code>eca_active_payment_session</code>) - remembers an open pass checkout so you can finish submitting payment details.</li>
            <li><strong>Referral code</strong> (<code>excellenceca_ref</code>, session storage) - remembers a referral code from a link until you register.</li>
            <li><strong>Platform data cache</strong> (keys starting with <code>excellenceca_</code>) - cached copies of tests, questions, notifications, rank tiers and similar data so pages load quickly, plus small markers such as your last seen rank tier.</li>
          </ul>
          <p>This data stays in your browser. Parts of it, such as your sign-in token, are sent to our servers only when the site needs them to load your data.</p>
        `
      },
      {
        id: 'analytics-advertising',
        heading: 'Analytics and advertising cookies',
        html: `
          <p>ExcellenceCA <strong>does not currently use</strong> analytics cookies, advertising cookies or tracking pixels, and does not show third-party ads.</p>
          <p>If this changes, for example if we start showing ads through an advertising network such as Google AdSense, those services may set cookies to show and measure ads. We will update this policy before or when they are introduced and provide consent choices where required by law.</p>
        `
      },
      {
        id: 'third-party-requests',
        heading: 'Third-party content',
        html: `
          <p>The site loads fonts, styles, icons and scripts from third-party providers (Google Fonts, the Tailwind CSS CDN, unpkg and cdnjs), and may load images from Unsplash and QR Server. These providers receive your IP address and browser information as part of a normal web request. Their handling of that data is governed by their own policies. See the <a href="#privacy-policy">Privacy Policy</a> for more on the services we use.</p>
        `
      },
      {
        id: 'preferences',
        heading: 'Your choices and cookie preferences',
        html: `
          <p>Because ExcellenceCA currently uses only essential storage, there are no optional analytics or advertising cookies to switch on or off, so the site does not show a cookie consent banner. The storage described above is needed for sign-in, tests and payments to work.</p>
          <p>You can still control browser storage yourself:</p>
          <ul>
            <li>Use your browser's settings to clear site data for ExcellenceCA. This signs you out and removes any in-progress test or checkout on that device.</li>
            <li>Use a private or incognito window, which clears storage when it is closed.</li>
            <li>Block site data in your browser. Sign-in and tests may not work correctly if you do.</li>
          </ul>
        `
      },
      {
        id: 'changes',
        heading: 'Changes to this policy',
        html: `<p>We will update this policy when the technologies we use change. The "Last updated" date shows the latest version.</p>`
      },
      {
        id: 'contact',
        heading: 'Contact',
        html: `<p>Questions about this policy can be sent to ${LEGAL_MAIL}.</p>`
      }
    ]
  },

  'refund-policy': {
    title: 'Refund & Cancellation Policy',
    navLabel: 'Refund & Cancellation',
    group: 'legal',
    icon: 'receipt',
    eyebrow: 'Legal',
    intro: 'This policy explains how cancellations and refunds work for ExcellenceCA paid passes, based on how pass purchases currently work on the platform.',
    showUpdated: true,
    sections: [
      {
        id: 'how-passes-work',
        heading: 'How passes work',
        html: `
          <ul>
            <li>ExcellenceCA passes (including trial passes) are <strong>one-time purchases</strong> that give access to certain features for a fixed number of days. Current plans, prices and validity are shown on the <a href="#passes">Passes</a> page.</li>
            <li>Passes <strong>do not renew automatically</strong>. We do not store any card, bank or UPI details, and you are never charged again without making a new payment yourself.</li>
            <li>You pay by UPI and then submit your UPI transaction reference (UTR) and a payment screenshot. Each payment is <strong>verified manually</strong>, and your pass is activated only after verification.</li>
            <li>If you buy a pass while another is active, the new validity is added to your current expiry date.</li>
          </ul>
        `
      },
      {
        id: 'cancellation',
        heading: 'Cancellation',
        html: `
          <ul>
            <li><strong>Before paying:</strong> You can close or cancel the checkout at any time before making the UPI payment. ExcellenceCA never debits money from you; a payment happens only when you complete it in your own UPI app.</li>
            <li><strong>After activation:</strong> Because passes do not auto-renew, there is no recurring subscription to cancel. Your pass stays active until its expiry date and then ends automatically.</li>
            <li><strong>Cancellation by ExcellenceCA:</strong> A pass may be cancelled if these terms are broken, for example for account sharing or false payment proof. See our <a href="#terms">Terms & Conditions</a>.</li>
          </ul>
        `
      },
      {
        id: 'refunds',
        heading: 'Refunds',
        html: `
          <p>ExcellenceCA does not have an automatic refund process or a fixed refund window. Refund requests are reviewed individually. To request a refund, email ${LEGAL_MAIL}. Please contact us if, for example:</p>
          <ul>
            <li>money was debited but your payment could not be verified and your pass was not activated;</li>
            <li>you paid more than once for the same purchase;</li>
            <li>you paid an amount different from the plan price shown at checkout.</li>
          </ul>
          <p>Submitting a request does not guarantee a refund, and we do not promise a fixed processing time. If a refund is approved, we will confirm the details with you by email.</p>
        `
      },
      {
        id: 'failed-payments',
        heading: 'Rejected or delayed payment verification',
        html: `
          <p>If your payment proof is submitted after the checkout timer ends, it is still reviewed manually. If a payment is rejected, you will see the reason in your notifications. If you believe the rejection is wrong, email us with the details listed below so we can check it again.</p>
          <p>Payments made through your UPI app are processed by your bank and the payment network. If money was debited but did not reach us, your bank or UPI app may also be able to help.</p>
        `
      },
      {
        id: 'how-to-request',
        heading: 'How to request a refund or cancellation',
        html: `
          <p>Email ${LEGAL_MAIL} from your registered email address and include:</p>
          <ul>
            <li>your ExcellenceCA username and registered email;</li>
            <li>the pass you purchased and the amount paid;</li>
            <li>the UPI transaction reference (UTR) and payment date;</li>
            <li>a screenshot of the payment, and a short description of the issue.</li>
          </ul>
        `
      },
      {
        id: 'changes',
        heading: 'Changes to this policy',
        html: `<p>We may update this policy when our pass or payment process changes. The version in effect when you made your purchase applies to that purchase.</p>`
      }
    ]
  }
};

const LEGAL_CONTACT_TOPICS = [
  { value: 'Payment / Pass', icon: 'credit-card', title: 'Payments & passes', text: 'Payment verification, a pass not activating, UTR issues, duplicate payments or refund requests. Please include your UTR and payment date.' },
  { value: 'Account', icon: 'user-cog', title: 'Account & sign-in', text: 'Trouble signing in, updating your profile, a deactivated account or an account deletion request.' },
  { value: 'Technical issue', icon: 'wrench', title: 'Technical issues', text: 'Pages not loading, test submission problems, PDF upload errors or anything that looks broken. Tell us your device and browser.' },
  { value: 'Content', icon: 'book-open-check', title: 'Content & questions', text: 'Report an incorrect answer or explanation, or a problem with a test paper. Mention the test name and question number.' },
  { value: 'Privacy', icon: 'shield', title: 'Privacy requests', text: 'Questions about your data, or requests to access, correct or delete it.' },
  { value: 'General', icon: 'message-circle', title: 'Everything else', text: 'Feedback, suggestions, partnership enquiries or any other question about ExcellenceCA.' }
];

class LegalPages {
  constructor() {
    this.routes = Object.keys(LEGAL_PAGES);
  }

  isLegalRoute(viewName) {
    return Object.prototype.hasOwnProperty.call(LEGAL_PAGES, viewName);
  }

  render(viewName) {
    const page = LEGAL_PAGES[viewName];
    const container = document.getElementById('legal-page-container');
    if (!page || !container) return;

    document.title = `${page.title} | ExcellenceCA`;

    const body = page.custom === 'contact' ? this._renderContact() : this._renderSections(page);
    const toc = page.sections && page.sections.length > 3 ? this._renderToc(page) : '';

    container.innerHTML = `
      <div class="max-w-6xl mx-auto">
        ${this._renderHeader(page)}
        <div class="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-6 lg:gap-8 mt-6 sm:mt-8">
          <aside class="hidden lg:block">
            <div class="sticky top-24 space-y-5">
              ${toc}
              ${this._renderPageNav(viewName)}
            </div>
          </aside>
          <div class="min-w-0 space-y-4 sm:space-y-5">
            ${body}
            ${this._renderRelated(viewName)}
          </div>
        </div>
      </div>
    `;

    if (page.custom === 'contact') this._bindContactForm();
    if (window.lucide) window.lucide.createIcons();
  }

  resetTitle() {
    document.title = LEGAL_DEFAULT_TITLE;
  }

  scrollToSection(id) {
    const el = document.getElementById(`legal-sec-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  _renderHeader(page) {
    return `
      <div class="bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden border border-blue-900/40">
        <div class="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" aria-hidden="true"></div>
        <div class="relative max-w-3xl">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-200 border border-blue-400/30 mb-4">
            <i data-lucide="${page.icon}" class="w-3.5 h-3.5"></i>
            ${page.eyebrow}
          </div>
          <h1 class="text-2xl sm:text-4xl font-black tracking-tight leading-tight">${page.title}</h1>
          <p class="text-sm sm:text-base text-slate-300 mt-3 leading-relaxed">${page.intro}</p>
          ${page.showUpdated ? `<p class="text-xs text-slate-400 mt-4 flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> Last updated: ${LEGAL_LAST_UPDATED}</p>` : ''}
        </div>
      </div>
    `;
  }

  _renderSections(page) {
    return page.sections.map((sec, i) => `
      <section id="legal-sec-${sec.id}" class="legal-section bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-sm">
        <h2 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-baseline gap-2.5">
          ${page.group === 'legal' ? `<span class="text-xs font-black text-blue-600 tabular-nums">${String(i + 1).padStart(2, '0')}</span>` : ''}
          <span>${sec.heading}</span>
        </h2>
        ${sec.features ? this._renderFeatures(sec.features) : `<div class="legal-prose mt-3">${sec.html}</div>`}
      </section>
    `).join('');
  }

  _renderFeatures(features) {
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        ${features.map(f => `
          <div class="border border-slate-200 bg-slate-50/60 rounded-xl p-4">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center flex-shrink-0">
                <i data-lucide="${f.icon}" class="w-4 h-4"></i>
              </div>
              <h3 class="text-sm font-bold text-slate-900">${f.title}</h3>
            </div>
            <p class="text-xs sm:text-[13px] text-slate-600 leading-relaxed mt-2">${f.text}</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderToc(page) {
    return `
      <nav aria-label="On this page" class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">On this page</div>
        <ul class="space-y-0.5">
          ${page.sections.map(sec => `
            <li>
              <button type="button" onclick="window.legalPages.scrollToSection('${sec.id}')" class="w-full text-left text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg px-2 py-1.5 transition-colors">${sec.heading}</button>
            </li>
          `).join('')}
        </ul>
      </nav>
    `;
  }

  _renderPageNav(activeView) {
    const link = (key) => {
      const p = LEGAL_PAGES[key];
      const active = key === activeView;
      return `
        <li>
          <a href="#${key}" ${active ? 'aria-current="page"' : ''} class="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 transition-colors ${active ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50 font-medium'}">
            <i data-lucide="${p.icon}" class="w-3.5 h-3.5 flex-shrink-0"></i> ${p.navLabel}
          </a>
        </li>
      `;
    };
    return `
      <nav aria-label="Policies and information" class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">ExcellenceCA</div>
        <ul class="space-y-0.5 mb-3">${this.routes.filter(k => LEGAL_PAGES[k].group === 'company').map(link).join('')}</ul>
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Legal</div>
        <ul class="space-y-0.5">${this.routes.filter(k => LEGAL_PAGES[k].group === 'legal').map(link).join('')}</ul>
      </nav>
    `;
  }

  _renderRelated(activeView) {
    const others = this.routes.filter(k => k !== activeView);
    return `
      <div class="lg:hidden bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">More from ExcellenceCA</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${others.map(k => `
            <a href="#${k}" class="flex items-center gap-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors">
              <i data-lucide="${LEGAL_PAGES[k].icon}" class="w-4 h-4 text-slate-400 flex-shrink-0"></i> ${LEGAL_PAGES[k].navLabel}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderContact() {
    return `
      <section class="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center flex-shrink-0">
              <i data-lucide="mail" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] font-black uppercase tracking-wider text-slate-400">Support email</div>
              <a href="mailto:${LEGAL_SUPPORT_EMAIL}" class="text-base sm:text-lg font-bold text-blue-600 hover:underline break-anywhere">${LEGAL_SUPPORT_EMAIL}</a>
            </div>
          </div>
          <button type="button" id="legal-copy-email" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
            <i data-lucide="copy" class="w-4 h-4"></i> <span>Copy email</span>
          </button>
        </div>
        <p class="text-xs text-slate-500 mt-4 leading-relaxed">Email is the only official support channel for ExcellenceCA. Please write from your registered email address so we can find your account.</p>
      </section>

      <section class="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-sm">
        <h2 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight">What we can help with</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          ${LEGAL_CONTACT_TOPICS.map(t => `
            <div class="border border-slate-200 bg-slate-50/60 rounded-xl p-4">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center flex-shrink-0">
                  <i data-lucide="${t.icon}" class="w-4 h-4"></i>
                </div>
                <h3 class="text-sm font-bold text-slate-900">${t.title}</h3>
              </div>
              <p class="text-xs sm:text-[13px] text-slate-600 leading-relaxed mt-2">${t.text}</p>
            </div>
          `).join('')}
        </div>
        <p class="text-xs text-slate-500 mt-4 leading-relaxed">
          Forgot your password? You can reset it yourself from the <a href="#forgot-password" class="text-blue-600 font-semibold hover:underline">password reset page</a>.
          For payment issues, see our <a href="#refund-policy" class="text-blue-600 font-semibold hover:underline">Refund & Cancellation Policy</a>.
        </p>
      </section>

      <section class="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-sm">
        <h2 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Write to us</h2>
        <p class="text-xs text-slate-500 mt-1 leading-relaxed">Fill in the details below and select <strong class="text-slate-700">Open in email app</strong>. Your email app opens with the message ready to send to ${LEGAL_SUPPORT_EMAIL}. Nothing is sent until you press send in your email app.</p>
        <form id="legal-contact-form" class="mt-5 space-y-4" novalidate>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="legal-contact-name" class="block text-xs font-bold text-slate-700 mb-1.5">Your name</label>
              <input id="legal-contact-name" type="text" autocomplete="name" maxlength="100" required class="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            </div>
            <div>
              <label for="legal-contact-email" class="block text-xs font-bold text-slate-700 mb-1.5">Registered email</label>
              <input id="legal-contact-email" type="email" autocomplete="email" maxlength="150" required class="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            </div>
          </div>
          <div>
            <label for="legal-contact-topic" class="block text-xs font-bold text-slate-700 mb-1.5">Topic</label>
            <select id="legal-contact-topic" class="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              ${LEGAL_CONTACT_TOPICS.map(t => `<option value="${t.value}">${t.title}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="legal-contact-message" class="block text-xs font-bold text-slate-700 mb-1.5">Message</label>
            <textarea id="legal-contact-message" rows="6" maxlength="1500" required class="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Describe your question or issue. For payments, include the UTR and payment date."></textarea>
          </div>
          <p id="legal-contact-error" class="hidden text-xs font-semibold text-rose-600" role="alert"></p>
          <div class="flex flex-col sm:flex-row sm:items-center gap-3">
            <button type="submit" class="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-colors">
              <i data-lucide="send" class="w-4 h-4"></i> Open in email app
            </button>
            <span class="text-[11px] text-slate-500">No email app? Copy the address above and write to us from any email service.</span>
          </div>
        </form>
      </section>
    `;
  }

  _bindContactForm() {
    const user = window.auth && typeof window.auth.getCurrentUser === 'function' ? window.auth.getCurrentUser() : null;
    const nameEl = document.getElementById('legal-contact-name');
    const emailEl = document.getElementById('legal-contact-email');
    if (user) {
      if (nameEl && user.name) nameEl.value = user.name;
      if (emailEl && user.email) emailEl.value = user.email;
    }

    const copyBtn = document.getElementById('legal-copy-email');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(LEGAL_SUPPORT_EMAIL);
          window.app.showToast('Support email copied to clipboard.', 'success');
        } catch (e) {
          window.app.showToast(`Could not copy automatically. Our email is ${LEGAL_SUPPORT_EMAIL}`, 'info');
        }
      });
    }

    const form = document.getElementById('legal-contact-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('legal-contact-error');
      const name = nameEl.value.trim();
      const email = emailEl.value.trim();
      const topic = document.getElementById('legal-contact-topic').value;
      const message = document.getElementById('legal-contact-message').value.trim();

      let error = '';
      if (!name) error = 'Please enter your name.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Please enter a valid email address.';
      else if (message.length < 10) error = 'Please describe your question in a little more detail.';

      if (error) {
        errorEl.textContent = error;
        errorEl.classList.remove('hidden');
        return;
      }
      errorEl.classList.add('hidden');

      const username = user && user.username ? `\nUsername: ${user.username}` : '';
      const subject = `[${topic}] Support request from ${name}`;
      const body = `${message}\n\n---\nName: ${name}\nRegistered email: ${email}${username}`;
      window.location.href = `mailto:${LEGAL_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }
}

window.legalPages = new LegalPages();
