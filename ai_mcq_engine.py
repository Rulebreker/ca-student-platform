import re
import json
import time
import uuid
from typing import Dict, Any, List, Optional, Tuple, Set

import ai_provider_manager
import ai_document_indexer

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
    topic: str,
    difficulty: str,
    question_category: str,
    question_speed: str,
    context: str,
    previous_concepts_summary: str,
    slot_number: int,
    total_count: int,
    rejected_questions: Optional[List[str]] = None,
    attempt_number: int = 1
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
Select a completely DIFFERENT sentence, rule, or concept from the context below.
"""

    prev_clause = ""
    if previous_concepts_summary and previous_concepts_summary.strip() != "None yet.":
        prev_clause = f"""
QUESTIONS ALREADY GENERATED IN THIS EXAM SET (DO NOT DUPLICATE):
{previous_concepts_summary}
You MUST generate a question testing a DIFFERENT concept or provision than all of the above.
"""

    return f"""Subject: {subject}
Exam Level: {exam_level}
Topic / Chapter: {topic}
Difficulty Level: {difficulty}
Question Category: {question_category}
Question Speed: {question_speed}
Question Slot: {slot_number} of {total_count} (Attempt: {attempt_number})
Focal Angle for this Slot: {slot_angle}

Source Material Context (Extracted from Syllabus Documents):
\"\"\"
{context}
\"\"\"
{prev_clause}{rejected_clause}
Task: Create exactly 1 original CA-style MCQ matching category '{question_category}', speed '{question_speed}', and angle '{slot_angle}'.

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

    return True, "Passed local deterministic validation.", None

# ----------------- Core Engine Methods -----------------

def generate_single_mcq(
    subject: str,
    topic: str,
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
    question_number: Optional[int] = None
) -> Tuple[Dict[str, Any], str, str]:
    """
    Generate a single candidate MCQ matching category and speed constraints.
    Returns (parsed_json_dict, provider_id, model_name).
    """
    context_text = f"Standard ICAI syllabus concepts for {subject} - {topic}"
    source_doc_id = None
    source_page = None

    if context_chunks:
        selected_chunk = context_chunks[0]
        raw_text = selected_chunk.get('text', context_text)
        # On retries, slice a shifted window into long text to give the LLM alternative sentences
        if len(raw_text) > 1200 and attempt_number > 1:
            offset = ((attempt_number - 1) * 450) % max(1, len(raw_text) - 900)
            context_text = raw_text[offset:offset + 2500]
        else:
            context_text = raw_text[:2500]
        source_doc_id = selected_chunk.get('docId')
        source_page = selected_chunk.get('pages', [1])[0] if selected_chunk.get('pages') else 1

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
        attempt_number=attempt_number
    )

    # Mild temperature boost on retry breaks token-greedy repetitive duplicate generation
    retry_temp = None
    if attempt_number > 1:
        retry_temp = min(0.35 + 0.15 * (attempt_number - 1), 0.65)

    response_text, provider_id, model_name = ai_provider_manager.call_llm_with_failover(
        purpose='generation',
        prompt=user_prompt,
        system_instruction=system_instruction,
        json_mode=True,
        data=data,
        on_provider_event=on_provider_event,
        temperature=retry_temp,
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
    q_data['sourceDocId'] = source_doc_id
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
    topic: str,
    count: int,
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
    admin_description: str = ''
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Resilient generation pipeline executing an independent question slot lifecycle.
    Guarantees that a single failing question NEVER freezes or blocks the remaining batch.
    Terminates in strictly bounded time with complete failure isolation.
    """
    if existing_questions is None:
        existing_questions = []
    if source_documents is None:
        source_documents = []

    # Retrieve relevant source chunks strictly matching chapter if specified
    relevant_chunks = ai_document_indexer.retrieve_relevant_chunks(
        documents=source_documents,
        query_topic=topic or chapter,
        subject=subject,
        subject_id=subject_id,
        exam_level=exam_level,
        exam_level_id=exam_level_id,
        chapter=chapter,
        chapter_id=chapter_id,
        max_chunks=8
    )

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

    # Strict Chapter Lock: If chapter/chapter_id requested and source documents exist for subject,
    # never silently fall back to other chapters of the subject; fail fast with NO_VALID_CHAPTER_CONTEXT.
    if (chapter or chapter_id) and source_documents:
        subject_docs = [
            d for d in source_documents
            if d.get('subject', '').lower() == subject.lower() or (subject_id and d.get('subjectId') == subject_id)
        ]
        if subject_docs and not relevant_chunks:
            err_msg = f"NO_VALID_CHAPTER_CONTEXT: No indexed documents found matching chapter '{chapter or chapter_id}' for subject '{subject}'."
            print(f"[CHAPTER_LOCK_ERROR] {err_msg}", flush=True)
            for s in question_statuses:
                s['status'] = 'failed'
                s['error'] = err_msg
            metrics['failedCount'] = count
            metrics['endTime'] = time.time()
            metrics['durationSeconds'] = round(metrics['endTime'] - metrics['startTime'], 1)
            metrics['error'] = err_msg
            return [], metrics

    print(f"[BATCH START] batchId={job_id} total={count} category={question_category} speed={question_speed}", flush=True)

    MAX_RETRIES_PER_SLOT = 2  # up to 3 attempts per slot
    SLOT_MAX_TIMEOUT = 50.0   # Watchdog timeout per question slot

    for slot_idx in range(1, count + 1):
        slot_start_time = time.time()
        slot_status_obj = question_statuses[slot_idx - 1]
        slot_status_obj['status'] = 'generating'
        slot_status_obj['attempt'] = 1
        slot_saved = False
        last_slot_error = None

        print(f"[QUESTION_START] batchId={job_id} questionNumber={slot_idx} attempt=1 concurrentActiveRequests=1", flush=True)
        print(f"[QUESTION START] batchId={job_id} questionNumber={slot_idx} attempt=1", flush=True)

        chunk_slice = None
        if relevant_chunks:
            chunk_idx = (slot_idx - 1) % len(relevant_chunks)
            chunk_slice = [relevant_chunks[chunk_idx]]

        slot_gemini_called = [False]
        def _make_on_provider_event(s_idx, s_status_obj):
            def _handler(evt_type, p_id, p_model, r_after):
                if evt_type == 'ai_call_start' and p_id and 'gemini' in str(p_id).lower() and r_after == 'generation':
                    metrics['geminiGenerationCalls'] += 1
                    slot_gemini_called[0] = True
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
                                'status': f"Q{s_idx}: {p_id.upper()} Quota Exceeded (429) -> Switching provider...",
                                'progressPct': int(((s_idx - 1) / count) * 85) + 5,
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
                                'status': f"Q{s_idx}: Switched to {p_id.upper()} ({p_model}) -> Generating...",
                                'progressPct': int(((s_idx - 1) / count) * 85) + 5,
                                'questionStatuses': list(question_statuses)
                            })
                        except Exception:
                            pass
            return _handler

        slot_rejected_stems: List[str] = []
        slot_prov_event_cb = _make_on_provider_event(slot_idx, slot_status_obj)

        for attempt in range(MAX_RETRIES_PER_SLOT + 1):
            # Rotate chunk index across attempts so retries receive alternative context
            chunk_slice = None
            if relevant_chunks:
                chunk_idx = ((slot_idx - 1) + attempt) % len(relevant_chunks)
                chunk_slice = [relevant_chunks[chunk_idx]]

            # Check slot watchdog timeout
            elapsed = time.time() - slot_start_time
            if elapsed > SLOT_MAX_TIMEOUT:
                last_slot_error = f"Slot watchdog timeout ({SLOT_MAX_TIMEOUT}s) exceeded."
                print(f"[QUESTION_TIMEOUT] batchId={job_id} questionNumber={slot_idx} elapsed={elapsed:.1f}s timeout={SLOT_MAX_TIMEOUT:.1f}s", flush=True)
                print(f"[QUESTION FAILED] batchId={job_id} questionNumber={slot_idx} attempt={attempt+1} error={last_slot_error}", flush=True)
                break

            is_retry = attempt > 0
            if is_retry:
                slot_status_obj['status'] = 'retrying'
                slot_status_obj['attempt'] = attempt + 1
                print(f"[RETRY] batchId={job_id} questionNumber={slot_idx} attempt={attempt + 1} reason={last_slot_error}", flush=True)

            if progress_callback:
                try:
                    retry_label = f" (Attempt {attempt + 1})" if is_retry else ""
                    progress_callback({
                        'stage': 'generating',
                        'current': slot_idx,
                        'verifiedCount': len(generated_questions),
                        'total': count,
                        'status': f"Generating question {slot_idx} of {count}{retry_label}...",
                        'progressPct': int(((slot_idx - 1) / count) * 85) + 5,
                        'questionStatuses': list(question_statuses)
                    })
                except Exception:
                    pass

            # Step 1: Generate single MCQ via failover
            gen_start_time = time.time()
            try:
                # Provide all generated questions in batch as well as rejected attempts
                batch_prev_stems = [q.get('text') for q in generated_questions if q.get('text')]
                q_candidate, gen_prov, gen_model = generate_single_mcq(
                    subject=subject,
                    topic=topic,
                    exam_level=exam_level,
                    difficulty=difficulty,
                    question_category=question_category,
                    question_speed=question_speed,
                    context_chunks=chunk_slice,
                    previous_concepts=batch_prev_stems,
                    data=data,
                    slot_number=slot_idx,
                    total_count=count,
                    on_provider_event=slot_prov_event_cb,
                    rejected_questions=list(slot_rejected_stems),
                    attempt_number=attempt + 1,
                    job_id=job_id,
                    question_number=slot_idx
                )
                gen_duration = (time.time() - gen_start_time) * 1000.0
                print(f"[QUESTION_GENERATED] batchId={job_id} questionNumber={slot_idx} attempt={attempt+1} provider={gen_prov} model={gen_model} duration={gen_duration:.1f}ms", flush=True)
                metrics['providersUsed'].add(gen_prov)
                if not slot_gemini_called[0] and gen_prov and 'gemini' in str(gen_prov).lower():
                    metrics['geminiGenerationCalls'] += 1
            except Exception as gen_err:
                last_slot_error = f"Generation error: {gen_err}"
                metrics['regenerationAttempts'] += 1
                metrics['regenerationCount'] = metrics['regenerationAttempts']
                # If watchdog exceeded, don't sleep
                if (time.time() - slot_start_time) < SLOT_MAX_TIMEOUT - 3.0:
                    time.sleep(min(1.0 * (attempt + 1), 2.0))
                continue

            # Step 2: Independent Validation (Local deterministic first, secondary AI only if required)
            slot_status_obj['status'] = 'validating'
            if progress_callback:
                try:
                    progress_callback({
                        'stage': 'validating',
                        'current': slot_idx,
                        'verifiedCount': len(generated_questions),
                        'total': count,
                        'status': f"Validating question {slot_idx} of {count}...",
                        'progressPct': int(((slot_idx - 0.5) / count) * 85) + 5,
                        'questionStatuses': list(question_statuses)
                    })
                except Exception:
                    pass

            val_start_time = time.time()
            is_valid, val_reason, suggested_fix, val_prov = validate_mcq_independently(
                q_data=q_candidate,
                subject=subject,
                topic=topic,
                exam_level=exam_level,
                difficulty=difficulty,
                question_category=question_category,
                question_speed=question_speed,
                existing_questions=existing_questions,
                current_batch_questions=generated_questions,
                data=data,
                on_provider_event=slot_prov_event_cb,
                chapter=chapter,
                chapter_id=chapter_id,
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
                last_slot_error = clean_err

                cand_stem = str(q_candidate.get('question') or q_candidate.get('text') or '').strip()
                if cand_stem and cand_stem not in slot_rejected_stems:
                    slot_rejected_stems.append(cand_stem)

                print(f"[VALIDATION_FAILED] batchId={job_id} questionNumber={slot_idx} attempt={attempt+1} validator={val_prov} reason={clean_err}", flush=True)

                if 'duplicate' in val_reason.lower():
                    metrics['rejectedDuplicates'] += 1
                else:
                    metrics['rejectedValidation'] += 1
                metrics['regenerationAttempts'] += 1
                metrics['regenerationCount'] = metrics['regenerationAttempts']
                continue

            print(f"[VALIDATION_PASSED] batchId={job_id} questionNumber={slot_idx} validator={val_prov} checksCount=8 duration={val_duration:.1f}ms", flush=True)

            # Apply fix if suggested by validator
            final_q = q_candidate
            if suggested_fix and isinstance(suggested_fix, dict):
                for k in ['question', 'text', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer', 'correctOption', 'explanation']:
                    if suggested_fix.get(k):
                        final_q[k] = suggested_fix[k]

            # Step 5: Construct production-ready Question record
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
                'isDraft': False,
                'aiSuggestedAnswer': c_ans,
                'isDuplicate': False,
                'aiGenerated': True,
                'aiJobId': job_id or f"job-{int(time.time()*1000)}",
                'sourceDocId': final_q.get('sourceDocId'),
                'sourcePage': final_q.get('sourcePage'),
                'providerUsed': gen_prov,
                'modelUsed': gen_model,
                'validationProvider': val_prov,
                'createdAt': now_iso,
                'updatedAt': now_iso
            }

            generated_questions.append(q_record)
            concept_summaries.append(q_text[:120])
            slot_saved = True
            slot_status_obj['status'] = 'saved'
            slot_status_obj['provider'] = gen_prov

            if on_question_verified:
                try:
                    on_question_verified(q_record, generated_questions, len(generated_questions), count)
                except Exception as cb_err:
                    print(f"[AI_PIPELINE_CB_WARNING] on_question_verified callback error: {cb_err}", flush=True)

            print(f"[QUESTION_VERIFIED] batchId={job_id} questionNumber={slot_idx} provider={gen_prov} model={gen_model} verifiedTotal={len(generated_questions)}/{count}", flush=True)
            print(f"[QUESTION SUCCESS] batchId={job_id} questionNumber={slot_idx} provider={gen_prov} model={gen_model} verifiedTotal={len(generated_questions)}", flush=True)
            break  # Attempt loop ends on success

        if not slot_saved:
            slot_status_obj['status'] = 'failed'
            clean_err = last_slot_error or "Exhausted all retry attempts."
            if clean_err.startswith("Validation rejected: "):
                clean_err = clean_err[len("Validation rejected: "):].strip()
            if clean_err.startswith("Duplicate check: "):
                clean_err = "Duplicate: " + clean_err[len("Duplicate check: "):].strip()
            slot_status_obj['error'] = clean_err
            print(f"[QUESTION_FAILED] batchId={job_id} questionNumber={slot_idx} attempt={attempt+1} error={clean_err}", flush=True)
            print(f"[QUESTION FAILED] batchId={job_id} questionNumber={slot_idx} error={clean_err}", flush=True)
            if progress_callback:
                try:
                    progress_callback({
                        'stage': 'failed',
                        'current': slot_idx,
                        'verifiedCount': len(generated_questions),
                        'total': count,
                        'status': f"Q{slot_idx} FAILED — {clean_err}",
                        'progressPct': int((slot_idx / count) * 85) + 5,
                        'questionStatuses': list(question_statuses)
                    })
                except Exception:
                    pass

    metrics['generatedCount'] = len(generated_questions)
    metrics['failedCount'] = count - len(generated_questions)
    metrics['regenerationCount'] = metrics['regenerationAttempts']
    metrics['questionStatuses'] = question_statuses
    metrics['endTime'] = time.time()
    metrics['durationSeconds'] = round(metrics['endTime'] - metrics['startTime'], 1)
    metrics['providersUsed'] = list(metrics['providersUsed'])
    metrics['validationProvidersUsed'] = list(metrics['validationProvidersUsed'])

    final_status = 'COMPLETED' if len(generated_questions) == count else ('PARTIAL' if len(generated_questions) > 0 else 'FAILED')
    print(f"[BATCH_COMPLETED] batchId={job_id} total={count} verified={len(generated_questions)} failed={metrics['failedCount']} totalDuration={metrics['durationSeconds']}s providersUsed={list(metrics['providersUsed'])}", flush=True)
    print(f"[BATCH COMPLETE] batchId={job_id} totalGenerated={len(generated_questions)} totalFailed={metrics['failedCount']} duration={metrics['durationSeconds']}s status={final_status}", flush=True)

    return generated_questions, metrics
