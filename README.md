# CA Student Learning & Test Platform
### Chartered Accountancy Online Examination, Video Lecture & Assignment Portal

A modern, responsive, high-performance web application designed specifically for CA (Chartered Accountancy) students and faculty administrators. This application is paired with a comprehensive **Bubble.io Implementation Blueprint** (`docs/BUBBLE_SPECIFICATION.md`) for 1:1 deployment in Bubble.

---

## 🌟 Key Modules & Features

### 1. Dual Role Architecture (Student & Admin)
- **Student Role**:
  - Sign up, login, forgot password.
  - Personalized student dashboard with tests attempted, average score, peak score, and current rank.
  - Video lecture streaming with chapter notes and related lectures playlist.
  - Timed MCQ test taking with positive (+2.0) and negative (-0.5) marking, live timer countdown, question palette (answered, marked for review, unvisited), and automatic submission on timer expiry.
  - Automatic results calculation with breakdown (gross marks, negative deductions, percentage, rank, and detailed ICAI conceptual solutions).
  - Test-specific and platform-wide leaderboards (privacy preserved, no email exposure).
  - Practical case assignment portal with client-side PDF file type validation, size limit checks (<10MB), submission tracking, and faculty feedback notes.
- **Faculty Admin Role**:
  - Overview analytics (total learners, active lectures, mock tests, test attempts, pending assignment grading queue).
  - Video Lecture Management (CRUD, publish/draft toggle, external video embeds like unlisted YouTube/Vimeo).
  - Test Management (CRUD, timer duration, marking scheme, max attempts, publish/draft toggle).
  - MCQ Question Builder (Add/edit questions, 4 options A/B/C/D, answer key selector, marks weight, and step-by-step ICAI explanation).
  - Assignment Management & PDF Grading Center (Inspect submitted PDFs, enter marks out of max, write faculty feedback, and update status).
  - Student Directory with individual audit logs and test attempt histories.

### 2. Fast Demo Switcher
- Instant 1-click role switcher directly in the top header navigation:
  - **🎓 Student**: Rohan Sharma (CA Inter, Reg No: `NRO-0459201`)
  - **🛡️ Admin**: CA Sanjeev Verma, FCA (Senior Faculty & Administrator)

### 3. Compliant Ad Placements
- Dedicated, non-intrusive AdSense-ready containers positioned in:
  - Header / Hero banner (728x90)
  - Student dashboard inline section divider
  - Lecture sidebar (300x250 medium rectangle) and video companion slot
  - Test catalog footer banner
- **Zero-Exam Distraction Guarantee**: Strictly **NO** advertisements or third-party banners during active MCQ test sessions to preserve test concentration.

---

## 🚀 How to Run Locally

This application requires **zero external dependencies** (no Node.js or Python runtime required). It runs immediately in any modern web browser:

1. Open File Explorer to:
   ```
   C:\Users\biswa\.gemini\antigravity\scratch\ca-student-platform\
   ```
2. Double-click **`index.html`** or right-click and choose **Open with Google Chrome** or **Microsoft Edge**.
3. The platform will launch instantly with pre-loaded mock data, video lectures, CA curriculum tests, and sample assignments!

---

## 📋 File Structure

```
ca-student-platform/
├── index.html                  # Single Page Application shell & navigation
├── README.md                   # Project documentation & testing guide
├── css/
│   └── styles.css              # Custom styling, palette colors, and ad container layouts
├── js/
│   ├── store.js                # Centralized state store with LocalStorage persistence & CA seed data
│   ├── auth.js                 # Authentication, role switching, session management
│   ├── student-dashboard.js    # Student metrics, available tests, lectures, recent attempts
│   ├── lecture-player.js       # Video player, subject filters, related lectures playlist
│   ├── test-engine.js          # Exam engine: instructions, timer, question palette, auto-submit, results
│   ├── leaderboard.js          # Test-specific and overall platform leaderboards
│   ├── assignment-portal.js    # Assignment instructions, PDF validation, upload & submissions table
│   ├── admin-dashboard.js      # Admin CRUD for lectures, tests, MCQs, and PDF grading center
│   └── app.js                  # Routing, modal controllers, and toast notifications
└── docs/
    └── BUBBLE_SPECIFICATION.md  # Complete Bubble.io Data Types, Privacy Rules, Option Sets & Workflows
```

---

## ☁️ Bubble.io Implementation Reference

If you want to configure or deploy this directly into your **Bubble.io** application, refer to [`docs/BUBBLE_SPECIFICATION.md`](docs/BUBBLE_SPECIFICATION.md) for:
- Exact 10 Data Types (`User`, `Student Profile`, `Subject`, `Lecture`, `Test`, `Question`, `Test Attempt`, `Student Answer`, `Assignment`, `Assignment Submission`).
- Option Sets (`User Role`, `CA Level`, `Attempt Status`, `Submission Status`).
- Strict Privacy Rules Matrix for student data isolation and test answer protection.
- Step-by-step Bubble Workflows for the countdown timer loop, auto-submission, negative mark calculations, and PDF file validations.
