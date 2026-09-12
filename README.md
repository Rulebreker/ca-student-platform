# ExcellenceCA - Chartered Accountancy Learning & Examination Platform

A modern, responsive web application designed for CA (Chartered Accountancy) students, teachers/evaluators, and administrators. This platform supports complete online examination workflows, lecture streaming, question paper PDF uploads, student answer sheet submissions, checked copy returns, and granular privilege management.

---

## 🔑 Login Accounts & Credentials

Access the application by opening `index.html` in your browser. You can use the **1-Click Fast Role Switcher** in the top navigation or log in with these credentials:

| Role | Email | Password | Direct URL / Route |
|---|---|---|---|
| **🛡️ Administrator** | `admin@excellenceca.com` | `123456` | `index.html#admin` |
| **👨‍🏫 Faculty / Teacher** | `rajesh.teacher@excellenceca.com` | `123456` | `index.html#teacher` |
| **🎓 Student** | `rohan.sharma@castudent.in` | `password123` | `index.html#dashboard` |

---

## 🌟 Key Platform Modules & Workflows

### 1. Direct URLs & Hash-Based Routing
- **Admin Portal**: `index.html#admin`
- **Teacher Portal**: `index.html#teacher`
- **Student Dashboard**: `index.html#dashboard`
- **MCQ Mock Tests**: `index.html#tests`
- **Test Papers & Assignments**: `index.html#assignments`
- **Leaderboards**: `index.html#leaderboard`
- **Video Lectures**: `index.html#lectures`

### 2. Comprehensive Student Management (Admin)
- **Visible Passwords**: Admin can view every student's password directly in the directory.
- **Add New Student**: Register students with name, email, custom password, CA level, and registration number.
- **Account Activation Toggle**: Instantly **Activate** or **Deactivate** any student. Deactivated students cannot log in.
- **Reset Password**: Admin can change any student's password at any time.
- **Remove Student**: Delete student record with confirmation.

### 3. Faculty / Teacher Management & Privilege Controls
- **Invite Teachers**: Register faculty members and assign specific subjects.
- **Adjustable Privileges Matrix**: Admin can customize each teacher's permissions:
  - `Can Grade Student Copies`: Allows evaluating answer sheets and uploading checked copy PDFs.
  - `Can Upload Question Papers`: Allows posting test papers & MCQs for their subjects.
  - `Can Upload Video Lectures`: Allows adding video classes.
  - `Can View Student Directory`: Allows inspecting student details.

### 4. End-to-End PDF Examination & Checked Copy Workflow
1. **Question Paper PDF Upload**: Admin or privileged Teacher uploads an official Question Paper PDF for any subject (e.g. Advanced Accounting, Taxation, Law).
2. **Student Download & Solution**: Students download the Question Paper PDF from their portal and prepare their solution.
3. **Student Answer Sheet Upload**: Students upload their handwritten or typed solution as a PDF (<10MB).
4. **Copy Evaluation & Return**: Admin or Teacher inspects the student's answer sheet, inputs marks, adds constructive remarks, and **uploads the Evaluated / Checked Copy (PDF)**.
5. **Student Result Reflection**: The student's dashboard immediately reflects the score and displays a download button for their **Checked Copy (PDF)** with red-ink markings!

### 5. MCQ Examination Engine
- Timed practice tests with negative marking (+2.0 / -0.5).
- Live countdown timer with auto-submit on `00:00`.
- Question Palette (Answered, Marked for Review, Unvisited, Current).
- Instant automatic results with full ICAI conceptual explanations.
- Strictly **ZERO ads** during active examination.

### 6. Website Updates Banner / Slider System
- **Centralized Component**: Replaces all legacy sponsored banners with a single responsive announcement hero.
- **Dynamic Mode Detection**:
  - **1 Active Image**: Displays as a clean static banner.
  - **2+ Active Images**: Automatically transitions to a smooth horizontal slider/carousel with left/right navigation arrows, hover-pause, and pagination dots.
- **Admin Control Suite**: Admin can upload banner images, edit titles/tags/links, delete banners, and toggle banner visibility with live synchronized updates across the website.

### 7. Common Global Footer
- **Brand & Copyright**: Dynamic year calculation (`© [Current Year] ExcellenceCA. All rights reserved.`).
- **Policy & Help Modals**: Direct popups for `Partnership / Sponsor`, `Privacy Policy`, and `Support`.
- **Social Media Connectivity**: Integrated icons for `YouTube`, `Instagram`, and `X (Twitter)`.
- **Clean Structure**: Zero internal navigation links cluttering the footer.

---

## 🚀 How to Run Locally

1. Open File Explorer to:
   ```
   C:\Users\biswa\.gemini\antigravity\scratch\ca-student-platform\
   ```
2. Double-click **`index.html`** or open with **Google Chrome** or **Microsoft Edge**.
3. Access:
   - Registration Page: `index.html#register`
   - Student Dashboard: `index.html#dashboard`
   - Teacher Portal: `index.html#teacher`
   - Admin Dashboard: `index.html#admin` (Password: `123456`)
