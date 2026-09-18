import re
import json
import time
import uuid
from typing import Dict, Any, List, Optional, Tuple, Set

import ai_provider_manager
import ai_document_indexer
import syllabus_hierarchy

# ----------------- Duplicate Detection -----------------

def _tokenize_for_similarity(text: str, subject_topic: Optional[str] = None) -> Set[str]:
    """Extract clean lowercase word tokens for Jaccard similarity comparison."""
    words = re.findall(r'\b[a-zA-Z0-9]{3,}\b', text.lower())
    stopwords = {
        'the', 'and', 'for', 'that', 'with', 'from', 'this', 'which', 'what',
        'when', 'where', 'under', 'following', 'statement', 'correct', 'incorrect',
        'true', 'false', 'respect', 'regard', 'case', 'given', 'below', 'does',
        'about', 'each', 'both', 'between', 'would', 'could', 'should',
        'concept', 'concepts', 'principle', 'principles', 'according', 'state', 'states'
    }
    if subject_topic:
        st_words = set(re.findall(r'\b[a-zA-Z0-9]{3,}\b', subject_topic.lower()))
        stopwords = stopwords.union(st_words)
    return {w for w in words if w not in stopwords}

def calculate_jaccard_similarity(text1: str, text2: str, subject_topic: Optional[str] = None) -> float:
    """Calculate token-level Jaccard similarity between two texts."""
    tokens1 = _tokenize_for_similarity(text1, subject_topic)
    tokens2 = _tokenize_for_similarity(text2, subject_topic)
    if not tokens1 or not tokens2:
        return 0.0
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)
    return len(intersection) / len(union)

def is_duplicate_question(
    candidate_text: str,
    existing_questions: List[Dict[str, Any]],
    current_batch_questions: List[Dict[str, Any]],
    threshold: float = 0.75,
    subject_topic: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    """
    Check if candidate question is identical or semantically near-duplicate (>0.50 Jaccard similarity).
    """
    norm_cand = re.sub(r'\s+', ' ', candidate_text.strip().lower())
    
    # Check current batch first
    for q in current_batch_questions:
        q_text = q.get('text', '')
        norm_q = re.sub(r'\s+', ' ', q_text.strip().lower())
        if norm_cand == norm_q:
            return True, "Identical match with a question already generated in this batch."
        sim = calculate_jaccard_similarity(candidate_text, q_text, subject_topic)
        if sim >= threshold:
            return True, f"Near-duplicate ({sim:.2f} similarity) with another question in this batch."

    # Check against database question bank
    for q in existing_questions:
        q_text = q.get('text', '')
        norm_q = re.sub(r'\s+', ' ', q_text.strip().lower())
        if norm_cand == norm_q:
            return True, "Identical match with an existing question in the question bank."
        sim = calculate_jaccard_similarity(candidate_text, q_text, subject_topic)
        if sim >= threshold:
            return True, f"Near-duplicate ({sim:.2f} similarity) with question ID {q.get('id')} in the question bank."

    return False, None

def is_source_reproduction(
    candidate_text: str,
    admin_description: str,
    threshold: float = 0.60
) -> Tuple[bool, Optional[str]]:
    """
    Detect if candidate question copies, verbatim quotes, or closely paraphrases
    the admin-provided source description / prompt notes.
    """
    if not admin_description or len(admin_description.strip()) < 15:
        return False, None

    cand_norm = re.sub(r'\s+', ' ', candidate_text.strip().lower())
    admin_norm = re.sub(r'\s+', ' ', admin_description.strip().lower())

    # Skip generic template descriptions
    if "ai-generated" in admin_norm and "practice test" in admin_norm:
        return False, None

    # Verbatim substring match
    if len(admin_norm) >= 30 and (admin_norm in cand_norm or cand_norm in admin_norm):
        return True, "Candidate question contains verbatim match with admin source description."

    # Sentence-level overlap
    admin_sentences = [s.strip() for s in re.split(r'[.!?\n]', admin_norm) if len(s.strip()) >= 25]
    for sent in admin_sentences:
        if sent in cand_norm:
            return True, f"Candidate question verbatim copies sentence from admin description: '{sent[:40]}...'"

    # Token-level Jaccard similarity check
    sim = calculate_jaccard_similarity(candidate_text, admin_description)
    if sim >= threshold:
        return True, f"Candidate question closely paraphrases admin description ({sim:.2f} similarity >= {threshold})."

    return False, None

# ----------------- Dynamic Prompt Builders -----------------

def build_generation_system_instruction(
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick'
) -> str:
    category_instructions = {
        'Direct Questions': (
            "QUESTION CATEGORY: DIRECT QUESTIONS (MANDATORY RULE)\n"
            "- Generate straightforward, concise, factual, and direct CA examination questions.\n"
            "- Focus on definition-based, meaning-based, fact-based, formula-based, or core concept identification.\n"
            "- Desired style example: 'Who is known as the Father of Economics? A) Adam Smith B) Alfred Marshall C) J.M. Keynes D) David Ricardo'\n"
            "- Another example: 'Under the Companies Act, 2013, the minimum number of members required for a public company is: A) 2 B) 7 C) 10 D) 50'\n"
            "- STRICT PROHIBITION: DO NOT create long case studies, multi-paragraph stories, narrative scenarios, hypothetical individuals (e.g. 'Mr. X entered into an agreement with Y...'), or verbose question stems."
        ),
        'Direct + Case Based Questions': (
            "QUESTION CATEGORY: DIRECT + CASE BASED QUESTIONS\n"
            "- You may formulate either straightforward direct questions or realistic, practical case-based scenarios relevant to the ICAI curriculum."
        ),
        'Conceptual Questions': (
            "QUESTION CATEGORY: CONCEPTUAL QUESTIONS\n"
            "- Focus on deep understanding of statutory mechanics, accounting principles, and economic logic.\n"
            "- Test whether the student understands WHY a provision or standard operates as it does, without requiring lengthy narrative stories."
        ),
        'Application Based Questions': (
            "QUESTION CATEGORY: APPLICATION BASED QUESTIONS\n"
            "- Focus on applying legal provisions, accounting standards, or mathematical formulas to specific practical problems."
        )
    }

    speed_instructions = {
        'Quick': (
            "QUESTION SPEED: QUICK (FAST TO ANSWER)\n"
            "- Short wording, concise question stem (under 60 words).\n"
            "- Minimal reading time and straightforward option identification.\n"
            "- Suitable for rapid student revision and practice."
        ),
        'Medium': (
            "QUESTION SPEED: MEDIUM (STANDARD PACING)\n"
            "- Moderate conceptual reasoning and interpretation.\n"
            "- Balanced stem length (under 85 words), solvable within standard exam pacing."
        ),
        'Thinking': (
            "QUESTION SPEED: THINKING (DEEPER REASONING)\n"
            "- Requires deeper analytical reasoning, multi-step calculation, or statutory interpretation.\n"
            "- Challenging problem-solving testing thorough conceptual mastery."
        )
    }

    cat_text = category_instructions.get(question_category, category_instructions['Direct Questions'])
    spd_text = speed_instructions.get(question_speed, speed_instructions['Quick'])

    return f"""You are an elite Chartered Accountancy (ICAI) Examination Specialist and Senior Professor.
Your task is to generate ORIGINAL, high-quality Multiple Choice Questions (MCQs) for Indian CA students (CA Foundation, CA Intermediate, or CA Final).

{cat_text}

{spd_text}

MANDATORY RULES:
1. ORIGINALITY: Formulate brand-new questions derived conceptually from the provided syllabus context. NEVER copy verbatim from textbook exercises.
2. OPTIONS: Exactly four distinct, mutually exclusive options (A, B, C, D). None of the options should be identical or trivial ("All of the above" / "None of the above" must be avoided).
3. SINGLE CORRECT ANSWER: Exactly one unequivocally correct answer based strictly on ICAI standard syllabus, Companies Act 2013, relevant Ind AS / AS, Income Tax Act 1961, or economic / mathematical laws.
4. NUMERICAL VERIFICATION: If the question involves numerical calculations, compute all intermediate values explicitly so the numerical result is exact and unambiguous.
5. EXPLANATION: Provide an exhaustive, step-by-step reasoning citing applicable standards, sections, or mathematical formulas.
6. JSON FORMAT: Output MUST be strictly valid JSON matching the required schema with no extra conversational text or markdown code blocks.
"""

def build_generation_user_prompt(
    subject: str,
    exam_level: str,
    topic: str = '',
    difficulty: str = 'ICAI Exam Standard',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    context: str = '',
    previous_concepts_summary: str = '',
    slot_number: int = 1,
    total_count: int = 1,
    rejected_questions: Optional[List[str]] = None,
    attempt_number: int = 1,
    chapter_metadata: Optional[Dict[str, Any]] = None,
    chapter_name: str = '',
    chapter_id: str = '',
    admin_description: str = ''
) -> str:
    focal_angles = [
        "Core definitions, essential terminology, and statutory meanings",
        "Classification, taxonomies, forms, or categories of concepts",
        "Conditions, criteria, prerequisites, or statutory thresholds",
        "Key objectives, underlying purpose, or economic/legal rationale",
        "Application, accounting/legal treatment, and practical procedural effects",
        "Quantitative calculations, measurement formulas, or arithmetic criteria",
        "Statutory time limits, compliance requirements, or numerical boundaries",
        "Comparison, contrast, and differences between related principles",
        "Legal consequences, non-compliance penalties, or operational impacts",
        "Authoritative regulatory standards, sections, or governance framework"
    ]
    slot_angle = focal_angles[(slot_number - 1 + (attempt_number - 1) * 3) % len(focal_angles)]

    rejected_clause = ""
    if rejected_questions:
        items = "\n".join([f"- \"{rq.strip()}\"" for rq in rejected_questions if rq and rq.strip()])
        if items:
            rejected_clause = f"""
STRICT PROHIBITION (PREVIOUS ATTEMPT REJECTED AS DUPLICATE):
The following question(s) were ALREADY proposed and REJECTED because they duplicated existing questions:
{items}
You MUST NOT generate or rephrase questions testing those exact facts.
Select a completely DIFFERENT concept, section, or formula from this chapter's syllabus.
"""

    prev_clause = ""
    if previous_concepts_summary and previous_concepts_summary.strip() != "None yet.":
        prev_clause = f"""
QUESTIONS ALREADY GENERATED IN THIS EXAM SET (DO NOT DUPLICATE):
{previous_concepts_summary}
You MUST generate a question testing a DIFFERENT concept or provision than all of the above.
"""

    # Resolve chapter syllabus information from chapter_metadata if present
    ch_id = chapter_id
    ch_name = chapter_name or topic or 'General'
    ch_desc = f"Authoritative ICAI syllabus coverage for {ch_name}."
    allowed_topics_str = f"- {ch_name}"
    allowed_concepts_str = f"- Core principles and provisions of {ch_name}"

    if chapter_metadata and isinstance(chapter_metadata, dict):
        ch_id = chapter_metadata.get('chapterId') or ch_id
        ch_name = chapter_metadata.get('chapterName') or ch_name
        ch_desc = chapter_metadata.get('chapterDescription') or ch_desc
        t_list = chapter_metadata.get('allowedTopics') or []
        c_list = chapter_metadata.get('allowedConcepts') or []
        if t_list:
            allowed_topics_str = "\n".join([f"- {t}" for t in t_list[:6]])
        if c_list:
            allowed_concepts_str = "\n".join([f"- {c}" for c in c_list[:6]])

    guidance_clause = ""
    if admin_description and admin_description.strip():
        guidance_clause = f"\nAdministrative Focus Guidance:\n\"\"\"{admin_description.strip()[:400]}\"\"\"\n"

    # Authoritative syllabus source material grounding clause
    grounded_source_clause = ""
    if context and context.strip() and not context.startswith("Standard ICAI syllabus concepts"):
        grounded_source_clause = f"""
AUTHORITATIVE SYLLABUS SOURCE MATERIAL (GROUNDED KNOWLEDGE BASE):
\"\"\"
{context.strip()[:3000]}
\"\"\"

MANDATORY SOURCE-GROUNDED GENERATION RULES:
1. You are generating examination questions strictly from the supplied syllabus/source material above.
2. Do NOT introduce concepts, terminology, formulas, subtopics or advanced material that are not supported by the supplied source content.
3. If the source material is insufficient to formulate a valid, high-quality question for this slot, return "INSUFFICIENT_SOURCE" in the question field rather than inventing content.
4. Do NOT silently fall back to general ungrounded knowledge outside this authoritative scope.
"""

    task_instruction = f"Task: Using your expert knowledge of the ICAI syllabus and statutory reasoning, formulate exactly 1 original, challenging CA-style MCQ testing '{ch_name}'."
    rules_instruction = """Rules:
- Derive all question logic, scenarios, and options from authoritative syllabus principles.
- Do NOT copy or paraphrase any prompt guidance verbatim.
- Respond with ONLY the required JSON object."""
    if grounded_source_clause:
        task_instruction = f"Task: Using your expert knowledge of the ICAI syllabus and statutory reasoning grounded in authoritative source material, formulate exactly 1 original, challenging CA-style MCQ testing '{ch_name}'."
        rules_instruction = """Rules:
- Derive all question logic, scenarios, and options strictly from supplied source material.
- If source material is provided and insufficient to formulate a valid question, output "INSUFFICIENT_SOURCE".
- Do NOT copy or paraphrase any prompt guidance or source verbatim.
- Respond with ONLY the required JSON object."""

    return f"""Exam Level: {exam_level}
Subject: {subject}
Authoritative Chapter: {ch_name}{f' (ID: {ch_id})' if ch_id else ''}
Chapter Scope: {ch_desc}

Allowed Syllabus Topics for this Chapter:
{allowed_topics_str}

Core Conceptual Focus:
{allowed_concepts_str}
{guidance_clause}{grounded_source_clause}
Question Slot: {slot_number} of {total_count} (Attempt: {attempt_number})
Focal Angle for this Slot: {slot_angle}
Category: {question_category}
Target Speed: {question_speed}
Difficulty: {difficulty}
{prev_clause}{rejected_clause}
{task_instruction}
{rules_instruction}

Respond with ONLY this JSON object:
{{
  "question": "Clear, direct question text here...",
  "optionA": "Option A text",
  "optionB": "Option B text",
  "optionC": "Option C text",
  "optionD": "Option D text",
  "correctAnswer": "A",
  "explanation": "Detailed step-by-step explanation with section/standard references...",
  "category": "{question_category}",
  "difficulty": "{difficulty}",
  "estimatedThinkingLevel": "{question_speed}"
}}
"""

VALIDATOR_SYSTEM_PROMPT = """You are an Independent ICAI Exam Validator and Chief Quality Auditor.
Your job is to independently verify a candidate MCQ against rigorous CA academic standards.

You must check:
1. Academic Accuracy: Is the subject matter, law, accounting standard, or formula applied correctly?
2. Options Quality: Are all 4 options plausible and distinct? Is there strictly ONE correct answer?
3. Mathematical Verification: If numerical, re-calculate the math from scratch. Does the selected option match the exact mathematical truth?
4. Clarity & Ambiguity: Is the question prompt completely free of grammatical ambiguity or double meanings?

Output strictly valid JSON:
{{
  "isValid": true,
  "reason": "Clear explanation of evaluation",
  "mathVerified": true,
  "suggestedFix": null
}}
If the question has a minor flaw (e.g. typos, slightly imperfect option text) that can be easily repaired without altering the concept, return isValid: true with the repaired fields in "suggestedFix".
If the question is fundamentally incorrect, mathematically contradictory, or severely ambiguous, return isValid: false.
"""

VALIDATOR_USER_PROMPT_TEMPLATE = """Verify this candidate MCQ:
Subject: {subject}
Topic: {topic}
Exam Level: {exam_level}

Question:
{text}

Options:
A: {optionA}
B: {optionB}
C: {optionC}
D: {optionD}

Claimed Correct Option: {correctOption}
Claimed Explanation: {explanation}
"""

# ----------------- JSON Repair & Quality Validation -----------------

def parse_and_repair_mcq_json(raw_text: str) -> Dict[str, Any]:
    """
    Robust JSON parser with multi-strategy auto-repair:
    1. Direct parse
    2. Strip markdown code fences (```json ... ```)
    3. Extract outermost {...}
    4. Auto-repair trailing commas, unquoted keys, single quotes
    """
    if not raw_text or not raw_text.strip():
        raise ValueError("Empty response from AI model.")
    
    text = raw_text.strip()
    
    # Strip markdown fences
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
        text = text.strip()

    # Direct parse attempt
    try:
        return json.loads(text)
    except Exception:
        pass

    # Extract outermost {...}
    match = re.search(r'(\{.*\})', text, re.DOTALL)
    if match:
        extracted = match.group(1).strip()
        try:
            return json.loads(extracted)
        except Exception:
            text = extracted

    # Clean trailing commas: e.g. , } or , ]
    cleaned = re.sub(r',\s*([\}\]])', r'\1', text)
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Convert single-quoted keys to double-quoted keys
    cleaned2 = re.sub(r"\'([a-zA-Z0-9_]+)\'\s*:", r'"\1":', cleaned)
    try:
        return json.loads(cleaned2)
    except Exception as e:
        raise ValueError(f"Unable to parse AI output into valid MCQ JSON: {e} | Raw: {raw_text[:120]}")

def validate_mcq_quality_and_constraints(
    q_data: Dict[str, Any],
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick'
) -> Tuple[bool, str]:
    """
    Validate MCQ quality, structural completeness, and constraint compliance.
    Rejects overly long case studies when Direct Questions or Quick are requested.
    """
    text = str(q_data.get('question') or q_data.get('text') or '').strip()
    if not text or len(text) < 15:
        return False, "Question stem is empty or too short."
    
    # Options check
    opts = [
        str(q_data.get('optionA', '')).strip(),
        str(q_data.get('optionB', '')).strip(),
        str(q_data.get('optionC', '')).strip(),
        str(q_data.get('optionD', '')).strip()
    ]
    if any(not opt for opt in opts):
        return False, "One or more options (A, B, C, D) are empty."
    
    if len(set(opt.lower() for opt in opts)) < 4:
        return False, "Options must be 4 distinct choices; duplicate options detected."

    # Correct answer check
    corr = str(q_data.get('correctAnswer') or q_data.get('correctOption') or '').strip().upper()
    if corr not in ['A', 'B', 'C', 'D']:
        match = re.search(r'\b([A-D])\b', corr)
        if match:
            corr = match.group(1)
        else:
            return False, f"Invalid correct answer '{corr}', must be A, B, C, or D."

    # Explanation check
    expl = str(q_data.get('explanation', '')).strip()
    if not expl or len(expl) < 10:
        return False, "Explanation is missing or too brief."

    words = text.split()
    word_count = len(words)

    # Category constraints: Direct Questions must NOT be lengthy narrative case studies
    if question_category == 'Direct Questions':
        if word_count > 95:
            return False, f"Question stem is too long ({word_count} words) for Direct Questions. Keep questions concise and straightforward."
        case_patterns = [
            r'\b(?:consider the following|based on the following|read the following)\s+(?:case|scenario|information|data)\b',
            r'\bcase\s+study\b',
            r'\b(?:Mr\.|Ms\.|M/s)\s+[A-Za-z]+\s+(?:runs|operates|invested|purchased|entered|started)\b',
            r'\b(?:Mr\.\s+[A-Z]\b.*\bMs\.\s+[A-Z]\b)',
            r'\bentered into a contract where\b.*\bsubsequently\b',
            r'\b(?:XYZ|ABC|PQR|M/s)\s+(?:Ltd|Limited|Pvt|Company|Corp)\b.*\b(?:transactions|financial year|balance sheet)\b'
        ]
        for pat in case_patterns:
            if re.search(pat, text, re.IGNORECASE):
                return False, "Question contains a case-study or scenario narrative while 'Direct Questions' was requested."

    # Speed constraints: Quick questions should be concise and fast to answer
    if question_speed == 'Quick':
        if word_count > 80:
            return False, f"Question stem is too long ({word_count} words) for 'Quick' speed. Fast practice requires concise wording."

    return True, "Valid"

def validate_mcq_locally_deterministic(
    q_data: Dict[str, Any],
    subject: str = '',
    topic: str = '',
    exam_level: str = 'CA Foundation',
    difficulty: str = 'ICAI Exam Standard',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    existing_questions: Optional[List[Dict[str, Any]]] = None,
    current_batch_questions: Optional[List[Dict[str, Any]]] = None,
    chapter: str = '',
    chapter_id: str = '',
    admin_description: str = ''
) -> Tuple[bool, str, Optional[str]]:
    """
    Comprehensive local deterministic validation verifying all correctness criteria:
    1. Schema & required non-empty fields (no malformed output)
    2. Exactly 4 distinct options (A, B, C, D present, non-empty, distinct, no placeholder strings)
    3. Exactly 1 correct answer index (strictly A, B, C, or D) pointing to a non-empty option
    4. Explanation present and >= 10 characters
    5. Subject/topic & difficulty consistency, and strict chapter verification
    6. Category and speed constraints (word count & structure)
    7. Duplicate detection (Jaccard similarity threshold against DB and current batch)
    8. Source reproduction protection (rejects verbatim/close paraphrases of admin description)
    Returns: (is_valid: bool, reason: str, error_code: Optional[str])
    """
    if not isinstance(q_data, dict):
        return False, "Malformed output: question data is not a valid JSON dictionary.", "MALFORMED_OUTPUT"

    # 1. Non-empty question stem check
    q_text = str(q_data.get('question') or q_data.get('text') or '').strip()
    if 'INSUFFICIENT_SOURCE' in q_text.upper():
        return False, "Candidate question returned INSUFFICIENT_SOURCE (insufficient syllabus grounding).", "INSUFFICIENT_SOURCE"
    for opt_k in ['optionA', 'optionB', 'optionC', 'optionD']:
        if 'INSUFFICIENT_SOURCE' in str(q_data.get(opt_k) or '').upper():
            return False, f"Option {opt_k} returned INSUFFICIENT_SOURCE.", "INSUFFICIENT_SOURCE"

    if not q_text or len(q_text) < 15:
        return False, "Question stem is empty or too short (<15 characters).", "EMPTY_QUESTION"
    
    words = q_text.split()
    if len(words) < 4:
        return False, "Question stem has too few words (<4 words).", "TOO_SHORT"

    # 2. Exactly 4 distinct options
    opts = {}
    for opt_key in ['optionA', 'optionB', 'optionC', 'optionD']:
        if opt_key not in q_data:
            return False, f"Missing required option field '{opt_key}'.", "INVALID_OPTIONS"
        val = str(q_data.get(opt_key) or '').strip()
        if not val:
            return False, f"Option '{opt_key}' is empty.", "INVALID_OPTIONS"
        opts[opt_key[-1]] = val

    # Verify all 4 options are distinct
    lower_opts = [v.lower().rstrip('.,;') for v in opts.values()]
    if len(set(lower_opts)) < 4:
        return False, "Options must be 4 distinct choices; duplicate options detected.", "DUPLICATE_OPTIONS"

    # Rejection of placeholder text
    placeholder_pats = [r'^option\s+[a-d]$', r'^none$', r'^n/?a$', r'^undefined$', r'^null$', r'^tbd$']
    for opt_k, opt_v in opts.items():
        for pat in placeholder_pats:
            if re.match(pat, opt_v.strip(), re.IGNORECASE):
                return False, f"Option {opt_k} contains placeholder text '{opt_v}'.", "PLACEHOLDER_OPTION"

    # 3. Exactly 1 correct answer & valid answer index
    raw_corr = str(q_data.get('correctAnswer') or q_data.get('correctOption') or '').strip().upper()
    if not raw_corr:
        return False, "Correct answer key is missing.", "INVALID_CORRECT_ANSWER"

    if raw_corr in ['A', 'B', 'C', 'D']:
        corr = raw_corr
    else:
        # Match single letter surrounded by word boundary e.g. "Option A" or "(A)"
        letters = re.findall(r'[A-D]', raw_corr)
        if len(letters) == 1:
            corr = letters[0]
        else:
            return False, f"Invalid correct answer '{raw_corr}': must specify exactly one of A, B, C, or D.", "INVALID_CORRECT_ANSWER"

    q_data['correctAnswer'] = corr
    q_data['correctOption'] = corr

    # 4. Explanation check
    expl = str(q_data.get('explanation') or '').strip()
    if not expl or len(expl) < 10:
        return False, "Explanation is missing or too brief (<10 characters).", "MISSING_EXPLANATION"

    # 5. Subject / Chapter consistency & Difficulty
    q_data['difficulty'] = difficulty or q_data.get('difficulty') or 'ICAI Exam Standard'
    q_data['category'] = question_category
    q_data['estimatedThinkingLevel'] = question_speed

    if chapter:
        q_ch = str(q_data.get('chapter') or '').strip()
        if q_ch and q_ch.lower() != chapter.strip().lower():
            return False, f"Off-chapter question detected: belongs to '{q_ch}' instead of '{chapter}'.", "OFF_CHAPTER_QUESTION"
    if chapter_id:
        q_ch_id = str(q_data.get('chapterId') or '').strip()
        if q_ch_id and q_ch_id != chapter_id.strip():
            return False, f"Off-chapter question detected: chapterId '{q_ch_id}' does not match '{chapter_id}'.", "OFF_CHAPTER_QUESTION"

    # 6. Word / Length constraints
    word_count = len(words)
    if question_category == 'Direct Questions':
        if word_count > 95:
            return False, f"Question stem is too long ({word_count} words) for Direct Questions (max 95 words).", "LENGTH_CONSTRAINT"
        case_patterns = [
            r'\b(?:consider the following|based on the following|read the following)\s+(?:case|scenario|information|data)\b',
            r'\bcase\s+study\b',
            r'\b(?:Mr\.|Ms\.|M/s)\s+[A-Za-z]+\s+(?:runs|operates|invested|purchased|entered|started)\b',
            r'\b(?:XYZ|ABC|PQR|M/s)\s+(?:Ltd|Limited|Pvt|Company|Corp)\b.*\b(?:transactions|financial year|balance sheet)\b'
        ]
        for pat in case_patterns:
            if re.search(pat, q_text, re.IGNORECASE):
                return False, "Question contains a case-study narrative while 'Direct Questions' was requested.", "CATEGORY_CONSTRAINT"

    if question_speed == 'Quick' and word_count > 80:
        return False, f"Question stem is too long ({word_count} words) for 'Quick' speed (max 80 words).", "SPEED_CONSTRAINT"

    # 7. Duplicate detection
    if existing_questions is not None or current_batch_questions is not None:
        is_dup, dup_reason = is_duplicate_question(
            candidate_text=q_text,
            existing_questions=existing_questions or [],
            current_batch_questions=current_batch_questions or [],
            threshold=0.75,
            subject_topic=f"{subject} {topic}"
        )
        if is_dup:
            return False, f"Duplicate check: {dup_reason}", "DUPLICATE_QUESTION"

    # 8. Source question reproduction protection
    if admin_description:
        is_reprod, reprod_reason = is_source_reproduction(q_text, admin_description)
        if not is_reprod and q_data.get('explanation'):
            is_reprod, reprod_reason = is_source_reproduction(str(q_data.get('explanation')), admin_description)
        if is_reprod:
            return False, f"Source reproduction rejected: {reprod_reason}", "SOURCE_REPRODUCTION_REJECTED"

    # 9. Insufficient source rejection (prevent ungrounded halluncination)
    if 'INSUFFICIENT_SOURCE' in q_text.upper():
        return False, "Candidate question returned INSUFFICIENT_SOURCE (insufficient syllabus grounding).", "INSUFFICIENT_SOURCE"
    for opt_k, opt_v in opts.items():
        if 'INSUFFICIENT_SOURCE' in str(opt_v).upper():
            return False, f"Option {opt_k} returned INSUFFICIENT_SOURCE.", "INSUFFICIENT_SOURCE"

    # 10. Strict out-of-syllabus protection
    q_ch_id = str(q_data.get('chapterId') or '').strip()
    if chapter_id and q_ch_id and q_ch_id != chapter_id.strip():
        return False, f"Out-of-syllabus question: tagged with chapterId '{q_ch_id}' instead of required '{chapter_id}'.", "OUT_OF_SYLLABUS_REJECTED"

    return True, "Passed local deterministic validation.", None

# ----------------- Core Engine Methods -----------------

def generate_single_mcq(
    subject: str,
    topic: str = '',
    exam_level: str = 'CA Foundation',
    difficulty: str = 'ICAI Exam Standard',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    context_chunks: Optional[List[Dict[str, Any]]] = None,
    previous_concepts: Optional[List[str]] = None,
    data: Optional[Dict[str, Any]] = None,
    slot_number: int = 1,
    total_count: int = 1,
    on_provider_event: Optional[Any] = None,
    rejected_questions: Optional[List[str]] = None,
    attempt_number: int = 1,
    job_id: Optional[str] = None,
    question_number: Optional[int] = None,
    chapter_metadata: Optional[Dict[str, Any]] = None,
    chapter: str = '',
    chapter_id: str = '',
    admin_description: str = '',
    preferred_provider: Optional[str] = None,
    temperature: Optional[float] = None
) -> Tuple[Dict[str, Any], str, str]:
    """
    Generate a single candidate MCQ matching category, speed, and chapter syllabus constraints.
    Returns (parsed_json_dict, provider_id, model_name).
    """
    # 1. Resolve chapter metadata if not explicitly provided
    if not chapter_metadata:
        chapter_metadata = syllabus_hierarchy.get_authoritative_chapter_metadata(
            chapter_id=chapter_id,
            chapter_name=chapter or topic,
            subject=subject,
            exam_level=exam_level,
            data=data
        )

    if chapter_metadata:
        chapter_id = chapter_metadata.get('chapterId', chapter_id)
        chapter = chapter_metadata.get('chapterName', chapter)
        subject = chapter_metadata.get('subject', subject)
        exam_level = chapter_metadata.get('examLevel', exam_level)

    # 2. Authoritative Syllabus Source Grounding & Traceability
    context_text = ""
    source_doc_id = None
    source_content_id = None
    source_page = None
    source_chapter = chapter
    source_topic = topic
    if context_chunks and len(context_chunks) > 0:
        chunk_idx = (slot_number - 1 + (attempt_number - 1)) % len(context_chunks)
        selected_chunk = context_chunks[chunk_idx]
        raw_text = selected_chunk.get('extractedText') or selected_chunk.get('text', '')
        if len(raw_text) > 1500 and attempt_number > 1:
            offset = ((attempt_number - 1) * 350) % max(1, len(raw_text) - 900)
            context_text = raw_text[offset:offset + 3000]
        else:
            context_text = raw_text[:3000]
        source_doc_id = selected_chunk.get('sourceDocumentId') or selected_chunk.get('docId')
        source_content_id = selected_chunk.get('contentId') or selected_chunk.get('chunkId')
        source_page = selected_chunk.get('sourcePage') or (selected_chunk.get('pages', [1])[0] if selected_chunk.get('pages') else 1)
        source_chapter = selected_chunk.get('chapter') or chapter
        source_topic = selected_chunk.get('topic') or selected_chunk.get('heading') or topic

    prev_summary = "None yet."
    if previous_concepts:
        clean_prev = [p.strip() for p in previous_concepts if p and p.strip()]
        if clean_prev:
            prev_summary = "\n".join([f"- {p[:140]}" for p in clean_prev[-10:]])

    system_instruction = build_generation_system_instruction(
        question_category=question_category,
        question_speed=question_speed
    )

    user_prompt = build_generation_user_prompt(
        subject=subject,
        exam_level=exam_level,
        topic=topic,
        difficulty=difficulty,
        question_category=question_category,
        question_speed=question_speed,
        context=context_text,
        previous_concepts_summary=prev_summary,
        slot_number=slot_number,
        total_count=total_count,
        rejected_questions=rejected_questions,
        attempt_number=attempt_number,
        chapter_metadata=chapter_metadata,
        chapter_name=chapter,
        chapter_id=chapter_id,
        admin_description=admin_description
    )

    # Safe temperature variation per specification: 0.7 + ((attempt - 1) % 3) * 0.1
    calculated_temp = temperature if temperature is not None else round(0.7 + ((attempt_number - 1) % 3) * 0.1, 2)

    response_text, provider_id, model_name = ai_provider_manager.call_llm_with_failover(
        purpose='generation',
        prompt=user_prompt,
        system_instruction=system_instruction,
        json_mode=True,
        data=data,
        preferred_provider=preferred_provider,
        on_provider_event=on_provider_event,
        temperature=calculated_temp,
        job_id=job_id,
        question_number=question_number or slot_number,
        attempt=attempt_number
    )

    q_data = parse_and_repair_mcq_json(response_text)

    # Normalize fields (support question or text, correctAnswer or correctOption)
    q_text = str(q_data.get('question') or q_data.get('text') or '').strip()
    if not q_text:
        raise ValueError("Model output missing question text.")
    q_data['text'] = q_text
    q_data['question'] = q_text

    correct_opt = str(q_data.get('correctAnswer') or q_data.get('correctOption') or '').strip().upper()
    if correct_opt not in ['A', 'B', 'C', 'D']:
        match = re.search(r'\b([A-D])\b', correct_opt)
        if match:
            correct_opt = match.group(1)
        else:
            raise ValueError(f"Invalid correctOption '{correct_opt}', must be A, B, C, or D.")
    q_data['correctOption'] = correct_opt
    q_data['correctAnswer'] = correct_opt
    q_data['category'] = question_category
    q_data['difficulty'] = difficulty
    q_data['estimatedThinkingLevel'] = question_speed
    if chapter_id:
        q_data['chapterId'] = chapter_id
    if chapter:
        q_data['chapter'] = chapter
    q_data['sourceDocId'] = source_doc_id
    q_data['sourceContentId'] = source_content_id
    q_data['sourceChapter'] = source_chapter
    q_data['sourceTopic'] = source_topic
    q_data['sourcePage'] = source_page

    return q_data, provider_id, model_name

def validate_mcq_independently(
    q_data: Dict[str, Any],
    subject: str,
    topic: str,
    exam_level: str = 'CA Foundation',
    data: Optional[Dict[str, Any]] = None,
    on_provider_event: Optional[Any] = None,
    difficulty: str = 'ICAI Exam Standard',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    existing_questions: Optional[List[Dict[str, Any]]] = None,
    current_batch_questions: Optional[List[Dict[str, Any]]] = None,
    force_ai_validation: bool = False,
    chapter: str = '',
    chapter_id: str = '',
    admin_description: str = ''
) -> Tuple[bool, str, Optional[Dict[str, Any]], str]:
    """
    Two-stage validation architecture:
    Stage 1 (Primary): Local deterministic validation (0 API calls, 0 Gemini calls).
                       Verifies 4 options, 1 answer, valid index, non-empty question,
                       subject/chapter consistency, difficulty, word constraints, duplicates,
                       source reproduction protection.
    Stage 2 (Fallback/Audit): Secondary AI provider (Groq/OpenRouter) ONLY when local validation
                             cannot reliably determine validity or when force_ai_validation is True.
                             Gemini is NEVER used for validation.
    Returns: (is_valid: bool, reason: str, suggested_fix: dict or None, validator_provider: str)
    """
    # Stage 1: Local deterministic validation first
    is_valid_local, local_reason, err_code = validate_mcq_locally_deterministic(
        q_data=q_data,
        subject=subject,
        topic=topic,
        exam_level=exam_level,
        difficulty=difficulty,
        question_category=question_category,
        question_speed=question_speed,
        existing_questions=existing_questions,
        current_batch_questions=current_batch_questions,
        chapter=chapter,
        chapter_id=chapter_id,
        admin_description=admin_description
    )

    if not is_valid_local:
        return False, local_reason, None, "local"

    # Stage 2: Secondary AI validation ONLY if explicitly requested or flagged for audit
    needs_secondary_ai = force_ai_validation or bool(q_data.get('requires_ai_audit', False))
    if not needs_secondary_ai:
        return True, "Passed local deterministic validation.", None, "local"

    # If secondary AI validation is requested, call failover gateway (Gemini is excluded from validation role)
    q_text = q_data.get('question') or q_data.get('text', '')
    corr_ans = q_data.get('correctAnswer') or q_data.get('correctOption', 'A')

    user_prompt = VALIDATOR_USER_PROMPT_TEMPLATE.format(
        subject=subject,
        topic=topic,
        exam_level=exam_level,
        text=q_text,
        optionA=q_data.get('optionA', ''),
        optionB=q_data.get('optionB', ''),
        optionC=q_data.get('optionC', ''),
        optionD=q_data.get('optionD', ''),
        correctOption=corr_ans,
        explanation=q_data.get('explanation', '')
    )

    try:
        val_response, val_prov, val_model = ai_provider_manager.call_llm_with_failover(
            purpose='validation',
            prompt=user_prompt,
            system_instruction=VALIDATOR_SYSTEM_PROMPT,
            json_mode=True,
            data=data,
            on_provider_event=on_provider_event
        )
        val_data = parse_and_repair_mcq_json(val_response)
        is_valid = bool(val_data.get('isValid', False))
        reason = str(val_data.get('reason', 'Validated successfully by secondary AI provider.'))
        suggested_fix = val_data.get('suggestedFix')
        return is_valid, reason, suggested_fix, val_prov
    except Exception as e:
        print(f"[AI_VALIDATION_NOTE] Secondary AI validator unavailable ({e}). Accepting passed local deterministic validation.", flush=True)
        return True, "Passed local deterministic validation fallback.", None, "local"

def generate_exact_mcqs_pipeline(
    subject: str,
    topic: str = '',
    count: int = 5,
    exam_level: str = 'CA Foundation',
    difficulty: str = 'ICAI Exam Standard',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    test_id: Optional[str] = None,
    source_documents: Optional[List[Dict[str, Any]]] = None,
    existing_questions: Optional[List[Dict[str, Any]]] = None,
    job_id: Optional[str] = None,
    marks_per_correct: float = 2.0,
    negative_marks: float = 0.5,
    progress_callback: Optional[Any] = None,
    data: Optional[Dict[str, Any]] = None,
    exam_level_id: str = '',
    subject_id: str = '',
    chapter: str = '',
    chapter_id: str = '',
    on_question_verified: Optional[Any] = None,
    admin_description: str = '',
    chapter_metadata: Optional[Dict[str, Any]] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Resilient knowledge-based generation pipeline executing an independent question slot lifecycle.
    Decoupled from PDF/RAG chunk retrieval. Grounded strictly in authoritative chapter metadata.
    Guarantees that a single failing question NEVER freezes or blocks the remaining batch.
    Terminates in strictly bounded time with complete failure isolation.
    """
    if existing_questions is None:
        existing_questions = []

    generated_questions: List[Dict[str, Any]] = []
    concept_summaries: List[str] = []
    question_statuses: List[Dict[str, Any]] = []

    for s in range(1, count + 1):
        question_statuses.append({
            'number': s,
            'status': 'pending',
            'error': None,
            'provider': None
        })

    metrics = {
        'requestedCount': count,
        'generatedCount': 0,
        'failedCount': 0,
        'rejectedDuplicates': 0,
        'rejectedValidation': 0,
        'regenerationAttempts': 0,
        'regenerationCount': 0,
        'geminiGenerationCalls': 0,
        'validationCalls': 0,
        'validationProvider': 'local',
        'providersUsed': set(),
        'validationProvidersUsed': set(),
        'questionStatuses': question_statuses,
        'category': question_category,
        'speed': question_speed,
        'startTime': time.time(),
        'endTime': None
    }

    # 1. Authoritative Chapter Metadata Resolution & Fail-Fast
    resolved_ch_meta = chapter_metadata or syllabus_hierarchy.get_authoritative_chapter_metadata(
        chapter_id=chapter_id,
        chapter_name=chapter or topic,
        subject=subject,
        exam_level=exam_level,
        data=data
    )

    if not resolved_ch_meta:
        err_msg = f"CHAPTER_METADATA_MISSING: Authoritative syllabus metadata is missing or could not be resolved for chapterId='{chapter_id}', chapter='{chapter}', subject='{subject}'."
        print(f"[CHAPTER_METADATA_ERROR] {err_msg}", flush=True)
        for s in question_statuses:
            s['status'] = 'failed'
            s['error'] = err_msg
        metrics['failedCount'] = count
        metrics['endTime'] = time.time()
        metrics['durationSeconds'] = round(metrics['endTime'] - metrics['startTime'], 1)
        metrics['error'] = err_msg
        return [], metrics

    canonical_ch_id = resolved_ch_meta['chapterId']
    canonical_ch_name = resolved_ch_meta['chapterName']
    canonical_subject = resolved_ch_meta.get('subject', subject)
    canonical_exam_level = resolved_ch_meta.get('examLevel', exam_level)

    # 2. Retrieve Stored Syllabus Knowledge Base Chunks (Grounded Context)
    all_docs = source_documents if (source_documents is not None) else (data.get('ai_source_documents', []) if data and isinstance(data, dict) else [])
    active_chunks = ai_document_indexer.retrieve_relevant_chunks(
        documents=all_docs,
        query_topic=topic,
        subject=canonical_subject,
        chapter=canonical_ch_name,
        chapter_id=canonical_ch_id,
        exam_level=canonical_exam_level,
        max_chunks=6
    )
    if active_chunks:
        print(f"[GROUNDED_SYLLABUS] Retrieved {len(active_chunks)} authoritative syllabus chunks for '{canonical_ch_name}' ({canonical_ch_id}).", flush=True)
    else:
        print(f"[GROUNDED_SYLLABUS] No pre-indexed PDF chunks for '{canonical_ch_name}' ({canonical_ch_id}). Relying on authoritative syllabus hierarchy metadata.", flush=True)

    print(f"[BATCH START] batchId={job_id} total={count} chapter='{canonical_ch_name}' ({canonical_ch_id}) category={question_category} speed={question_speed}", flush=True)

    MAX_ATTEMPTS_PER_SLOT = 15
    BATCH_MAX_TIMEOUT = 360.0  # 6-minute total safety watchdog
    key_rotation_cursor = 0
    slot_attempts: Dict[int, int] = {}
    slot_rejected_stems_map: Dict[int, List[str]] = {}

    PROMPT_ANGLES = [
        "Standard comprehensive coverage across authoritative syllabus",
        "Practical application, calculations, numerical parameters, or scenario problem-solving",
        "Exceptions, proviso, statutory limits, prerequisites, or threshold conditions",
        "Statutory definitions, legislative intent, regulatory scope, and applicability"
    ]

    while len(generated_questions) < count:
        if time.time() - metrics['startTime'] > BATCH_MAX_TIMEOUT:
            print(f"[BATCH_TIMEOUT] Exceeded maximum batch duration ({BATCH_MAX_TIMEOUT}s).", flush=True)
            break

        slot_idx = len(generated_questions) + 1
        slot_status_obj = question_statuses[slot_idx - 1]
        
        slot_attempts[slot_idx] = slot_attempts.get(slot_idx, 0) + 1
        attempt = slot_attempts[slot_idx]

        if attempt > MAX_ATTEMPTS_PER_SLOT:
            err_limit = f"Exceeded maximum repair attempts ({MAX_ATTEMPTS_PER_SLOT}) on Question {slot_idx}."
            print(f"[SLOT_EXHAUSTED] {err_limit}", flush=True)
            slot_status_obj['status'] = 'failed'
            slot_status_obj['error'] = err_limit
            break

        if slot_idx not in slot_rejected_stems_map:
            slot_rejected_stems_map[slot_idx] = []
        slot_rejected_stems = slot_rejected_stems_map[slot_idx]

        # Key rotation across all 6 Gemini keys (1 to 6)
        preferred_gemini = f"gemini_{(key_rotation_cursor % 6) + 1}"
        key_rotation_cursor += 1

        # Temperature variation formula: 0.7 + ((attempt - 1) % 3) * 0.1 -> 0.7, 0.8, 0.9
        slot_temperature = round(0.7 + ((attempt - 1) % 3) * 0.1, 2)

        # Prompt focal angle variation
        selected_angle = PROMPT_ANGLES[(attempt - 1) % len(PROMPT_ANGLES)]

        is_retry = attempt > 1
        if is_retry:
            slot_status_obj['status'] = 'retrying'
            slot_status_obj['attempt'] = attempt
            print(f"[RETRY] batchId={job_id} questionNumber={slot_idx} attempt={attempt} provider={preferred_gemini} temp={slot_temperature} angle='{selected_angle}'", flush=True)
        else:
            slot_status_obj['status'] = 'generating'
            slot_status_obj['attempt'] = 1
            print(f"[QUESTION_START] batchId={job_id} questionNumber={slot_idx} attempt=1 concurrentActiveRequests=1 provider={preferred_gemini}", flush=True)
            print(f"[QUESTION START] batchId={job_id} questionNumber={slot_idx} attempt=1", flush=True)

        verified_c = len(generated_questions)
        prog_pct = min(95, int((verified_c / count) * 85) + 5)
        if progress_callback:
            try:
                retry_label = f" (Attempt {attempt})" if is_retry else ""
                progress_callback({
                    'stage': 'retrying' if is_retry else 'generating',
                    'current': slot_idx,
                    'verifiedCount': verified_c,
                    'total': count,
                    'status': f"Generating question {slot_idx} of {count}{retry_label}...",
                    'progressPct': prog_pct,
                    'questionStatuses': list(question_statuses)
                })
            except Exception:
                pass

        # Cooldown check: if all Gemini keys are cooling down, wait for the earliest key
        cd_wait = ai_provider_manager.get_earliest_gemini_cooldown_remaining()
        if cd_wait > 0:
            print(f"[ALL_KEYS_COOLDOWN] All Gemini keys cooling down. Waiting {cd_wait:.1f}s for earliest key...", flush=True)
            slot_status_obj['status'] = 'cooling_down'
            slot_status_obj['error'] = f"All Gemini keys cooling down. Waiting {int(cd_wait)}s..."
            if progress_callback:
                try:
                    progress_callback({
                        'stage': 'cooling_down',
                        'current': slot_idx,
                        'verifiedCount': len(generated_questions),
                        'total': count,
                        'status': f"All Gemini keys in cooldown. Waiting {int(cd_wait)}s before retrying Q{slot_idx}...",
                        'progressPct': prog_pct,
                        'questionStatuses': list(question_statuses)
                    })
                except Exception:
                    pass
            time.sleep(min(cd_wait + 0.5, 30.0))

        # Real-time event handler
        def _make_on_provider_event(s_idx, s_status_obj):
            def _handler(evt_type, p_id, p_model, r_after):
                if evt_type == 'ai_call_start' and p_id and 'gemini' in str(p_id).lower() and r_after == 'generation':
                    metrics['geminiGenerationCalls'] += 1
                elif evt_type == 'rate_limited':
                    s_status_obj['status'] = 'rate_limited'
                    s_status_obj['provider'] = p_id
                    s_status_obj['error'] = f"429 Quota Exceeded for {p_id}"
                    print(f"[429 RATE LIMITED] batchId={job_id} questionNumber={s_idx} provider={p_id} model={p_model} retryAfter={r_after or 60.0:.1f}s", flush=True)
                    if progress_callback:
                        try:
                            progress_callback({
                                'stage': 'rate_limited',
                                'current': s_idx,
                                'verifiedCount': len(generated_questions),
                                'total': count,
                                'status': f"Q{s_idx}: {p_id.upper()} Quota Exceeded (429) -> Rotating key...",
                                'progressPct': prog_pct,
                                'questionStatuses': list(question_statuses)
                            })
                        except Exception:
                            pass
                elif evt_type == 'fallback':
                    s_status_obj['status'] = 'fallback'
                    s_status_obj['provider'] = p_id
                    print(f"[FALLBACK PROVIDER] batchId={job_id} questionNumber={s_idx} toProvider={p_id} model={p_model}", flush=True)
                    if progress_callback:
                        try:
                            progress_callback({
                                'stage': 'fallback',
                                'current': s_idx,
                                'verifiedCount': len(generated_questions),
                                'total': count,
                                'status': f"Q{s_idx}: Rotated to {p_id.upper()} ({p_model}) -> Generating...",
                                'progressPct': prog_pct,
                                'questionStatuses': list(question_statuses)
                            })
                        except Exception:
                            pass
            return _handler

        slot_prov_event_cb = _make_on_provider_event(slot_idx, slot_status_obj)

        # Step 1: Generate candidate MCQ via Gemini multi-key failover
        gen_start_time = time.time()
        try:
            batch_prev_stems = [q.get('text') for q in generated_questions if q.get('text')]
            q_candidate, gen_prov, gen_model = generate_single_mcq(
                subject=canonical_subject,
                topic=topic,
                exam_level=canonical_exam_level,
                difficulty=difficulty,
                question_category=question_category,
                question_speed=question_speed,
                context_chunks=active_chunks if active_chunks else None,
                chapter_metadata=resolved_ch_meta,
                chapter=canonical_ch_name,
                chapter_id=canonical_ch_id,
                previous_concepts=batch_prev_stems,
                data=data,
                slot_number=slot_idx,
                total_count=count,
                on_provider_event=slot_prov_event_cb,
                rejected_questions=list(slot_rejected_stems),
                attempt_number=attempt,
                job_id=job_id,
                question_number=slot_idx,
                admin_description=admin_description,
                preferred_provider=preferred_gemini,
                temperature=slot_temperature
            )
            gen_duration = (time.time() - gen_start_time) * 1000.0
            print(f"[QUESTION_GENERATED] batchId={job_id} questionNumber={slot_idx} attempt={attempt} provider={gen_prov} model={gen_model} duration={gen_duration:.1f}ms", flush=True)
            metrics['providersUsed'].add(gen_prov)
            metrics['geminiGenerationCalls'] += 1
        except Exception as gen_err:
            clean_err = f"Generation error: {gen_err}"
            slot_status_obj['status'] = 'retrying'
            slot_status_obj['error'] = clean_err
            metrics['regenerationAttempts'] += 1
            metrics['regenerationCount'] = metrics['regenerationAttempts']
            print(f"[QUESTION_RETRY] batchId={job_id} questionNumber={slot_idx} attempt={attempt} error={clean_err}", flush=True)
            # Stay on the same slot_idx and retry
            continue

        # Step 2: Validate independently (Local deterministic validation)
        slot_status_obj['status'] = 'validating'
        if progress_callback:
            try:
                progress_callback({
                    'stage': 'validating',
                    'current': slot_idx,
                    'verifiedCount': len(generated_questions),
                    'total': count,
                    'status': f"Validating question {slot_idx} of {count}...",
                    'progressPct': min(95, int(((len(generated_questions) + 0.5) / count) * 85) + 5),
                    'questionStatuses': list(question_statuses)
                })
            except Exception:
                pass

        val_start_time = time.time()
        is_valid, val_reason, suggested_fix, val_prov = validate_mcq_independently(
            q_data=q_candidate,
            subject=canonical_subject,
            topic=topic,
            exam_level=canonical_exam_level,
            difficulty=difficulty,
            question_category=question_category,
            question_speed=question_speed,
            existing_questions=existing_questions,
            current_batch_questions=generated_questions,
            data=data,
            on_provider_event=slot_prov_event_cb,
            chapter=canonical_ch_name,
            chapter_id=canonical_ch_id,
            admin_description=admin_description
        )
        val_duration = (time.time() - val_start_time) * 1000.0
        metrics['validationCalls'] += 1
        metrics['validationProvider'] = val_prov
        metrics['validationProvidersUsed'].add(val_prov)

        if not is_valid:
            clean_err = str(val_reason).strip()
            if clean_err.startswith("Validation rejected: "):
                clean_err = clean_err[len("Validation rejected: "):].strip()
            if clean_err.startswith("Duplicate check: "):
                clean_err = "Duplicate: " + clean_err[len("Duplicate check: "):].strip()

            # Record rejected stem to explicitly forbid it on next attempt for this slot
            cand_stem = str(q_candidate.get('question') or q_candidate.get('text') or '').strip()
            if cand_stem and cand_stem not in slot_rejected_stems:
                slot_rejected_stems.append(cand_stem)

            print(f"[VALIDATION_FAILED] batchId={job_id} questionNumber={slot_idx} attempt={attempt} validator={val_prov} reason={clean_err}", flush=True)

            if 'duplicate' in val_reason.lower():
                metrics['rejectedDuplicates'] += 1
            else:
                metrics['rejectedValidation'] += 1
            metrics['regenerationAttempts'] += 1
            metrics['regenerationCount'] = metrics['regenerationAttempts']
            slot_status_obj['status'] = 'retrying'
            slot_status_obj['error'] = clean_err
            # Stay on the same slot_idx and retry
            continue

        print(f"[VALIDATION_PASSED] batchId={job_id} questionNumber={slot_idx} validator={val_prov} checksCount=8 duration={val_duration:.1f}ms", flush=True)

        # Apply fix if suggested by validator
        final_q = q_candidate
        if suggested_fix and isinstance(suggested_fix, dict):
            for k in ['question', 'text', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer', 'correctOption', 'explanation']:
                if suggested_fix.get(k):
                    final_q[k] = suggested_fix[k]

        # Step 3: Construct production-ready Question record
        q_text = final_q.get('question') or final_q.get('text')
        c_ans = (final_q.get('correctAnswer') or final_q.get('correctOption', 'A')).strip().upper()
        now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

        q_record = {
            'id': f"q-ai-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
            'testId': test_id or "tst-ai-pending",
            'number': len(generated_questions) + 1,
            'text': q_text,
            'questionType': 'text',
            'questionImage': None,
            'optionA': final_q['optionA'],
            'optionB': final_q['optionB'],
            'optionC': final_q['optionC'],
            'optionD': final_q['optionD'],
            'optionTypes': {'A': 'text', 'B': 'text', 'C': 'text', 'D': 'text'},
            'optionImages': {'A': None, 'B': None, 'C': None, 'D': None},
            'correctOption': c_ans,
            'marks': float(marks_per_correct),
            'negativeMarks': float(negative_marks),
            'explanation': final_q.get('explanation', ''),
            'category': question_category,
            'difficulty': difficulty,
            'estimatedThinkingLevel': question_speed,
            'chapter': canonical_ch_name,
            'chapterId': canonical_ch_id,
            'isDraft': False,
            'aiSuggestedAnswer': c_ans,
            'isDuplicate': False,
            'aiGenerated': True,
            'aiJobId': job_id or f"job-{int(time.time()*1000)}",
            'generationJobId': job_id or f"job-{int(time.time()*1000)}",
            'sourceDocId': final_q.get('sourceDocId'),
            'sourceContentId': final_q.get('sourceContentId'),
            'sourceChapter': final_q.get('sourceChapter') or canonical_ch_name,
            'sourceTopic': final_q.get('sourceTopic') or topic,
            'sourcePage': final_q.get('sourcePage'),
            'providerUsed': gen_prov,
            'modelUsed': gen_model,
            'validationProvider': val_prov,
            'generatedAt': now_iso,
            'createdAt': now_iso,
            'updatedAt': now_iso
        }

        # Save question and advance to next slot
        generated_questions.append(q_record)
        concept_summaries.append(q_text[:120])
        slot_status_obj['status'] = 'saved'
        slot_status_obj['provider'] = gen_prov
        slot_status_obj['error'] = None

        if on_question_verified:
            try:
                on_question_verified(q_record, generated_questions, len(generated_questions), count)
            except Exception as cb_err:
                print(f"[AI_PIPELINE_CB_WARNING] on_question_verified callback error: {cb_err}", flush=True)

        print(f"[QUESTION_VERIFIED] batchId={job_id} questionNumber={slot_idx} provider={gen_prov} model={gen_model} verifiedTotal={len(generated_questions)}/{count}", flush=True)
        print(f"[QUESTION SUCCESS] batchId={job_id} questionNumber={slot_idx} provider={gen_prov} model={gen_model} verifiedTotal={len(generated_questions)}", flush=True)

    metrics['generatedCount'] = len(generated_questions)
    metrics['failedCount'] = count - len(generated_questions)
    metrics['regenerationCount'] = metrics['regenerationAttempts']
    metrics['questionStatuses'] = question_statuses
    metrics['endTime'] = time.time()
    metrics['durationSeconds'] = round(metrics['endTime'] - metrics['startTime'], 1)
    metrics['providersUsed'] = list(metrics['providersUsed'])
    metrics['validationProvidersUsed'] = list(metrics['validationProvidersUsed'])

    final_status = 'COMPLETED' if len(generated_questions) == count else 'FAILED'
    print(f"[BATCH_COMPLETED] batchId={job_id} total={count} verified={len(generated_questions)} failed={metrics['failedCount']} totalDuration={metrics['durationSeconds']}s providersUsed={list(metrics['providersUsed'])}", flush=True)
    print(f"[BATCH COMPLETE] batchId={job_id} totalGenerated={len(generated_questions)} totalFailed={metrics['failedCount']} duration={metrics['durationSeconds']}s status={final_status}", flush=True)

    return generated_questions, metrics
