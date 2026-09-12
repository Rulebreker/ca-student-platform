# Bubble.io Architecture & Implementation Blueprint
## ELITECA - CA Student Learning & Test Platform

This document provides the complete, field-by-field and rule-by-rule blueprint for building and deploying the **CA Student Learning & Test Platform** directly inside [Bubble.io](https://bubble.io).

---

## 1. Database Architecture (Data Types & Fields)

In Bubble, navigate to **Data > Data Types**. Create the following 10 Data Types:

### 1.1 `User` (Built-in Bubble Type)
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `email` | text (built-in) | No | User login email |
| `role` | Option Set: `User Role` | No | `Student` or `Admin` |
| `full_name` | text | No | Student or Admin's full name |
| `phone_number` | text | No | Optional contact number |
| `student_profile` | `Student Profile` | No | Link to detailed student record |
| `avatar_image` | image | No | Profile photo (optional) |
| `is_active` | yes/no | No | Account status flag (Default: `yes`) |

---

### 1.2 `Student Profile`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `user` | `User` | No | Linked user account |
| `ca_level` | Option Set: `CA Level` | No | `Foundation`, `Inter`, `Final` |
| `registration_number` | text | No | Student ICAI registration no. (optional) |
| `tests_attempted_count`| number | No | Cached total tests attempted |
| `average_score` | number | No | Running average test percentage |
| `best_score` | number | No | Highest test percentage achieved |
| `total_points` | number | No | Aggregated points for overall leaderboard |
| `current_rank` | number | No | Cached platform rank |

---

### 1.3 `Subject`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `name` | text | No | e.g., "Advanced Accounting" |
| `ca_level` | Option Set: `CA Level` | No | CA Foundation, Inter, Final |
| `code` | text | No | e.g., "PAPER-1", "PAPER-4" |
| `description` | text | No | Brief curriculum overview |
| `icon_class` | text | No | Icon name for display |
| `is_active` | yes/no | No | Default: `yes` |

---

### 1.4 `Lecture`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `title` | text | No | Lecture title |
| `subject` | `Subject` | No | Related Subject |
| `chapter_topic` | text | No | Chapter / Topic name |
| `description` | text | No | Detailed syllabus notes |
| `thumbnail` | image | No | Cover image for card |
| `video_url` | text | No | External URL (Unlisted YouTube / Vimeo / Iframe) |
| `duration_minutes` | number | No | Estimated length |
| `is_published` | yes/no | No | Default: `no` until published |
| `created_by` | `User` | No | Admin author |
| `view_count` | number | No | Total student views |

---

### 1.5 `Test`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `title` | text | No | Name of the exam (e.g. "Ind AS 115 Mock Test") |
| `subject` | `Subject` | No | Linked Subject |
| `chapter_topic` | text | No | Chapter or topic scope |
| `description_instructions`| text | No | Rules, guidelines, marking criteria |
| `start_date_time` | date | No | When test opens for attempts |
| `end_date_time` | date | No | When test closes |
| `duration_minutes` | number | No | Exam timer duration in minutes |
| `total_questions` | number | No | Count of questions |
| `marks_per_correct` | number | No | Positive marks (e.g., `2.0`) |
| `negative_marks_per_wrong`| number | No | Deduction for incorrect answers (e.g., `0.5`) |
| `max_attempts` | number | No | Max tries per student (Default: `1` or `3`) |
| `is_published` | yes/no | No | Published status flag |
| `questions` | List of `Question` | Yes | List of associated MCQs |

---

### 1.6 `Question`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `test` | `Test` | No | Parent Test |
| `question_number` | number | No | Display order (1, 2, 3...) |
| `question_text` | text | No | Rich question prompt |
| `option_a` | text | No | Choice A text |
| `option_b` | text | No | Choice B text |
| `option_c` | text | No | Choice C text |
| `option_d` | text | No | Choice D text |
| `correct_option` | text | No | "A", "B", "C", or "D" |
| `marks` | number | No | Weight for this question |
| `explanation` | text | No | Step-by-step reasoning / Ind AS reference |

---

### 1.7 `Test Attempt`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `student` | `User` | No | Student who took the test |
| `test` | `Test` | No | The Test taken |
| `attempt_number` | number | No | 1st, 2nd, etc. |
| `status` | Option Set: `Attempt Status` | No | `In Progress`, `Completed`, `Timed Out` |
| `started_at` | date | No | Start timestamp |
| `submitted_at` | date | No | Submission timestamp |
| `time_taken_seconds` | number | No | Elapsed seconds |
| `correct_count` | number | No | Total correct answers |
| `wrong_count` | number | No | Total incorrect answers |
| `unattempted_count` | number | No | Skipped questions |
| `gross_marks` | number | No | Marks before deductions |
| `negative_penalty` | number | No | Total negative deduction |
| `final_score` | number | No | Calculated score (`gross_marks - negative_penalty`) |
| `percentage` | number | No | `(final_score / total_marks) * 100` |
| `rank` | number | No | Calculated rank on this test |

---

### 1.8 `Student Answer`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `test_attempt` | `Test Attempt` | No | Linked attempt |
| `question` | `Question` | No | Question answered |
| `selected_option` | text | No | "A", "B", "C", "D", or empty |
| `is_marked_for_review`| yes/no | No | Review bookmark flag |
| `is_correct` | yes/no | No | Evaluated flag |
| `marks_awarded` | number | No | Marks won or deducted |

---

### 1.9 `Assignment`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `title` | text | No | Assignment title |
| `subject` | `Subject` | No | Associated Subject |
| `topic` | text | No | Chapter/topic |
| `description_instructions`| text | No | Detailed problem statement (formatted) |
| `deadline` | date | No | Due date and time |
| `maximum_marks` | number | No | Total marks available (e.g., `50` or `100`) |
| `is_published` | yes/no | No | Publication flag |
| `created_by` | `User` | No | Admin user |

---

### 1.10 `Assignment Submission`
| Field Name | Field Type | List? | Description |
|---|---|---|---|
| `assignment` | `Assignment` | No | Parent Assignment |
| `student` | `User` | No | Submitting student |
| `pdf_file` | file | No | Uploaded PDF document (stored in Bubble S3 / CDN) |
| `file_name` | text | No | Original file name |
| `file_size_bytes` | number | No | Byte size (max 10MB verified) |
| `submitted_at` | date | No | Submission timestamp |
| `status` | Option Set: `Submission Status` | No | `Submitted`, `Evaluated`, `Needs Revision` |
| `marks_obtained` | number | No | Graded marks |
| `admin_feedback` | text | No | Evaluator notes |
| `evaluated_by` | `User` | No | Admin who graded |
| `evaluated_at` | date | No | Evaluation timestamp |

---

## 2. Option Sets (Data > Option Sets)

### 2.1 `User Role`
- **Options**: `Student`, `Admin`
- **Attributes**: `display_name` (text)

### 2.2 `CA Level`
- **Options**: `CA Foundation`, `CA Inter`, `CA Final`
- **Attributes**: `code` (text)

### 2.3 `Attempt Status`
- **Options**: `In Progress`, `Completed`, `Timed Out`

### 2.4 `Submission Status`
- **Options**: `Submitted`, `Evaluated`, `Needs Revision`
- **Attributes**: `badge_color` (text: `#d97706`, `#059669`, `#dc2626`)

---

## 3. Privacy Rules Matrix (Data > Privacy)

Bubble's Privacy Rules are paramount for compliance and security. Configure each Data Type as follows:

| Data Type | Rule Name | When Condition | View Permissions | Find in Searches |
|---|---|---|---|---|
| **`User`** | Admin Access | `Current User's role is Admin` | All fields visible | Yes |
| | Self Access | `This User is Current User` | All fields visible | Yes |
| | Public / Leaderboard | `Everyone Else` | `full_name`, `avatar_image` ONLY (`email` hidden) | Yes |
| **`Question`** | Admin Access | `Current User's role is Admin` | All fields visible | Yes |
| | Active Test Taking | `Current User's role is Student` | `question_text`, `option_a/b/c/d`, `marks` (`correct_option` & `explanation` HIDDEN) | Yes |
| | After Submission | `This Question's test's Test Attempts contains Current User's completed attempt` | All fields visible including `correct_option` & `explanation` | Yes |
| **`Test Attempt`** | Admin Access | `Current User's role is Admin` | All fields visible | Yes |
| | Student Own Attempt | `This Test Attempt's student is Current User` | All fields visible | Yes |
| | Leaderboard Public | `Everyone Else` | `student's full_name`, `final_score`, `percentage`, `time_taken_seconds`, `rank` | Yes |
| **`Assignment Submission`** | Admin Access | `Current User's role is Admin` | All fields visible (can view & download PDF) | Yes |
| | Student Own Submission | `This Submission's student is Current User` | All fields visible | Yes |
| | Other Students | `Everyone Else` | **NO ACCESS** (files and marks blocked) | No |

---

## 4. Page Architecture & Navigation

In Bubble, configure a Single Page Application (SPA) layout with URL parameters (e.g. `?v=dashboard`, `?v=lectures`, `?v=tests`, `?v=test-take&id=123`, `?v=assignments`, `?v=leaderboard`, `?v=admin`):

1. **Header Reusable Element (`header_nav`)**:
   - Logo & Brand Title ("ELITECA").
   - Navigation links with conditional active styles.
   - User Profile dropdown with Avatar, Name, Role badge, and Logout action.
2. **Page Containers (Conditional Visibility based on `Get 'v' from page URL`)**:
   - `Group_Student_Dashboard` (v is empty or `v = dashboard`)
   - `Group_Lecture_Catalog` (`v = lectures`)
   - `Group_Lecture_Detail` (`v = lecture-view`)
   - `Group_Test_Catalog` (`v = tests`)
   - `Group_Active_Exam` (`v = test-take`)
   - `Group_Test_Result` (`v = test-result`)
   - `Group_Assignments` (`v = assignments`)
   - `Group_Leaderboard` (`v = leaderboard`)
   - `Group_Admin_Portal` (`v = admin` and `Current User's role is Admin`)

---

## 5. Workflows (Step-by-Step)

### 5.1 Test Engine: Countdown Timer & Auto-Submission
1. **On Test Start**:
   - Set custom state on page: `TimeRemainingSeconds = Parent Test's duration_minutes * 60`.
   - Set custom state: `CurrentQuestionIndex = 1`.
   - Create a new `Test Attempt`: `test = Current Test`, `student = Current User`, `status = In Progress`, `started_at = Current date/time`.
2. **Timer Loop (Every 1 second)**:
   - Use the standard "Do every 1 second" event or the *Bubble Toolbox Javascript to Bubble* timer.
   - Set state `TimeRemainingSeconds = TimeRemainingSeconds - 1`.
   - Condition: `When TimeRemainingSeconds <= 0`:
     - Trigger custom workflow `Submit_Test_Attempt`.
3. **Submit Test Attempt Workflow**:
   - Stop timer.
   - Calculate counts:
     - `correct_count = Count of Student Answers where is_correct is yes`.
     - `wrong_count = Count of Student Answers where selected_option is not empty and is_correct is no`.
     - `unattempted_count = Total Questions - (correct_count + wrong_count)`.
   - Calculate Marks:
     - `gross_marks = correct_count * Test's marks_per_correct`.
     - `negative_penalty = wrong_count * Test's negative_marks_per_wrong`.
     - `final_score = gross_marks - negative_penalty`.
     - `percentage = (final_score / (Total Questions * Test's marks_per_correct)) * 100`.
   - Update `Test Attempt`: set `status = Completed`, `submitted_at = Current date/time`, `final_score`, `percentage`.
   - Update Student Profile running averages and rank.
   - Redirect to `?v=test-result&attempt_id=...`.

### 5.2 Assignment PDF Upload & Validation
1. **File Uploader Element**:
   - Type: File Uploader.
   - Conditional workflow: `When File Uploader's value is changed`:
     - Check: `This file's name:split by('.'):last:lowercase is "pdf"` (or MIME check).
     - Check size: `This file's size < 10485760` (10 MB).
     - If invalid: Show alert "Please upload a valid PDF under 10MB" and Reset Input.
2. **On Submit Button Click**:
   - Create a new `Assignment Submission`:
     - `assignment = Current Assignment`
     - `student = Current User`
     - `pdf_file = FileUploader's value`
     - `file_name = FileUploader's value:filename`
     - `status = Submitted`
     - `submitted_at = Current date/time`
   - Show Toast "Assignment submitted successfully!".

---

## 6. Monetization & Google AdSense Setup

To integrate ads without degrading student exam concentration:

1. **Ad Placements**:
   - **Header / Hero Banner** (`728x90` or Responsive): In `Group_Student_Dashboard` and `Group_Leaderboard`.
   - **Lecture Sidebar / Below Player** (`300x250`): In `Group_Lecture_Detail`.
   - **Content Section Divider** (`728x90`): In `Group_Test_Catalog`.
2. **Strict Test Isolation**:
   - In `Group_Active_Exam`, **NO AdSense elements or scripts exist**.
   - Condition: If `Get 'v' from URL is "test-take"`, ad containers are set to `This element is visible: NO` and collapse when hidden.
3. **AdSense Code Snippet**:
   Place inside an HTML element:
   ```html
   <ins class="adsbygoogle"
        style="display:block"
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
        data-ad-slot="1234567890"
        data-ad-format="auto"
        data-full-width-responsive="true"></ins>
   <script>
        (adsbygoogle = window.adsbygoogle || []).push({});
   </script>
   ```
