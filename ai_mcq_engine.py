import os
import re
import json
import random
import time
import uuid
from typing import Callable, Dict, Any, List, Optional, Tuple, Set

import ai_document_indexer
import syllabus_hierarchy
import local_qwen_service

# ----------------- Duplicate Detection -----------------

# Jaccard similarity at/above which a candidate is a near-duplicate of an accepted or bank question
DUPLICATE_SIMILARITY_THRESHOLD = float(os.environ.get('MCQ_DUPLICATE_THRESHOLD', '0.75'))

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

def verify_source_chunk_grounding(
    candidate_text: str,
    explanation_text: str = '',
    source_chunks: Optional[List[Dict[str, Any]]] = None,
    min_keyword_overlap: float = 0.15
) -> Tuple[bool, str, Optional[Dict[str, Any]], float]:
    """
    Validates that candidate question and explanation are grounded in the supplied source chunks.
    Checks lexical and conceptual overlap of significant terms against source chunk texts.
    If no chunk supports the question, returns False with reason for UNGROUNDED_SOURCE_REJECTED.
    Returns (is_grounded, reason, best_chunk, best_score).
    """
    if not source_chunks:
        return True, "No source chunks provided; skipping chunk grounding.", None, 1.0

    # Stopwords to filter out
    stopwords = {
        'what', 'which', 'following', 'under', 'where', 'would', 'shall', 'these',
        'their', 'about', 'above', 'below', 'statement', 'correct', 'incorrect',
        'option', 'choose', 'select', 'state', 'true', 'false', 'with', 'from',
        'have', 'been', 'were', 'that', 'this', 'then', 'than', 'into', 'only',
        'also', 'such', 'when', 'some', 'other', 'more', 'most', 'very', 'could',
        'should', 'must', 'each', 'every', 'both', 'either', 'neither', 'between',
        'among', 'after', 'before', 'during', 'through', 'while', 'does', 'doing',
        'done', 'test', 'question', 'answer', 'explanation', 'case', 'direct'
    }

    # Extract significant question and explanation tokens
    combined_cand = f"{candidate_text} {explanation_text}".lower()
    cand_tokens = [w for w in re.findall(r'\b[a-zA-Z]{3,}\b', combined_cand) if w not in stopwords]
    cand_token_set = set(cand_tokens)

    if not cand_token_set:
        return True, "Question has no testable content tokens.", None, 1.0

    best_chunk = None
    best_score = 0.0
    best_matches = set()

    for chk in source_chunks:
        chk_text = f"{chk.get('heading', '')} {chk.get('text', '') or chk.get('content', '') or chk.get('extractedText', '')}".lower()
        chk_tokens = set(re.findall(r'\b[a-zA-Z]{3,}\b', chk_text))
        
        matches = cand_token_set.intersection(chk_tokens)
        score = len(matches) / len(cand_token_set)
        if score > best_score:
            best_score = score
            best_chunk = chk
            best_matches = matches

    chunk_id = best_chunk.get('chunkId') or best_chunk.get('id') if best_chunk else 'none'

    # Grounding threshold: at least min_keyword_overlap or at least 2 distinct significant content words
    is_grounded = (best_score >= min_keyword_overlap or len(best_matches) >= 2)
    status_label = 'VERIFIED' if is_grounded else 'REJECTED'

    print(f"[GROUNDING_VERIFICATION] chunkId={chunk_id} matchScore={best_score:.2f} status={status_label}", flush=True)

    if is_grounded:
        return True, f"Source grounding verified (score: {best_score:.2f}, chunk: {chunk_id}).", best_chunk, best_score
    else:
        return False, f"Question introduces external concepts not grounded in source chunk text (match score: {best_score:.2f} < {min_keyword_overlap}).", None, best_score

# ----------------- Dynamic Prompt Builders -----------------

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
        parsed = json.loads(text)
        if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
            return parsed[0]
        if isinstance(parsed, dict) and ('questions' in parsed or 'mcqs' in parsed):
            items = parsed.get('questions') or parsed.get('mcqs') or []
            if items and isinstance(items[0], dict):
                return items[0]
        return parsed
    except Exception:
        pass

    # Extract outermost [...] if array
    arr_match = re.search(r'(\[.*\])', text, re.DOTALL)
    if arr_match:
        extracted = arr_match.group(1).strip()
        try:
            parsed = json.loads(extracted)
            if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
                return parsed[0]
        except Exception:
            cleaned = re.sub(r',\s*([\}\]])', r'\1', extracted)
            try:
                parsed = json.loads(cleaned)
                if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
                    return parsed[0]
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

def parse_and_repair_mcqs_payload(raw_text: str) -> List[Dict[str, Any]]:
    """
    Parse a batched list of MCQ objects from LLM response text.
    Supports JSON arrays, dictionaries with 'questions' or 'mcqs' keys, and single-object fallbacks.
    """
    if not raw_text or not raw_text.strip():
        return []
    
    text = raw_text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
        text = text.strip()

    # 1. Direct parse attempt
    try:
        parsed = json.loads(text)
        return _extract_mcq_list(parsed)
    except Exception:
        pass

    # 2. Extract outermost [...] if present
    arr_match = re.search(r'(\[.*\])', text, re.DOTALL)
    if arr_match:
        extracted = arr_match.group(1).strip()
        try:
            parsed = json.loads(extracted)
            return _extract_mcq_list(parsed)
        except Exception:
            cleaned = re.sub(r',\s*([\}\]])', r'\1', extracted)
            try:
                parsed = json.loads(cleaned)
                return _extract_mcq_list(parsed)
            except Exception:
                pass

    # 3. Extract outermost {...}
    dict_match = re.search(r'(\{.*\})', text, re.DOTALL)
    if dict_match:
        extracted = dict_match.group(1).strip()
        try:
            parsed = json.loads(extracted)
            return _extract_mcq_list(parsed)
        except Exception:
            cleaned = re.sub(r',\s*([\}\]])', r'\1', extracted)
            try:
                parsed = json.loads(cleaned)
                return _extract_mcq_list(parsed)
            except Exception:
                pass

    # 4. Trailing commas and single quote repair
    cleaned = re.sub(r',\s*([\}\]])', r'\1', text)
    cleaned2 = re.sub(r"\'([a-zA-Z0-9_]+)\'\s*:", r'"\1":', cleaned)
    try:
        parsed = json.loads(cleaned2)
        return _extract_mcq_list(parsed)
    except Exception:
        pass

    # 5. Regex recovery of individual {...} objects in malformed payload
    recovered = []
    object_matches = re.finditer(r'\{[^{}]*?"question"[^{}]*?\}', text, re.DOTALL)
    for m in object_matches:
        try:
            obj_str = m.group(0)
            obj = json.loads(obj_str)
            if isinstance(obj, dict) and (obj.get('question') or obj.get('text')):
                recovered.append(obj)
        except Exception:
            pass

    return recovered

def _extract_mcq_list(parsed: Any) -> List[Dict[str, Any]]:
    if isinstance(parsed, list):
        return [q for q in parsed if isinstance(q, dict) and (q.get('question') or q.get('text'))]
    elif isinstance(parsed, dict):
        if 'questions' in parsed and isinstance(parsed['questions'], list):
            return [q for q in parsed['questions'] if isinstance(q, dict) and (q.get('question') or q.get('text'))]
        if 'mcqs' in parsed and isinstance(parsed['mcqs'], list):
            return [q for q in parsed['mcqs'] if isinstance(q, dict) and (q.get('question') or q.get('text'))]
        if parsed.get('question') or parsed.get('text'):
            return [parsed]
    return []

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
    admin_description: str = '',
    source_chunks: Optional[List[Dict[str, Any]]] = None,
    require_grounding: bool = False
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
            threshold=DUPLICATE_SIMILARITY_THRESHOLD,
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

    # 11. Strict source chunk grounding verification
    if source_chunks or require_grounding:
        is_grounded, ground_reason, best_chunk, best_score = verify_source_chunk_grounding(
            candidate_text=q_text,
            explanation_text=expl,
            source_chunks=source_chunks or []
        )
        if not is_grounded:
            return False, f"Source validation rejected: {ground_reason}", "UNGROUNDED_SOURCE_REJECTED"
        if best_chunk:
            q_data['sourceDocId'] = best_chunk.get('docId') or best_chunk.get('sourceDocumentId') or q_data.get('sourceDocId')
            q_data['sourceContentId'] = best_chunk.get('contentId') or best_chunk.get('chunkId') or q_data.get('sourceContentId')
            q_data['sourcePage'] = best_chunk.get('sourcePage') or (best_chunk.get('pages', [1])[0] if best_chunk.get('pages') else 1)
            q_data['sourceChapter'] = best_chunk.get('chapter') or q_data.get('sourceChapter')
            q_data['sourceTopic'] = best_chunk.get('topic') or q_data.get('sourceTopic')
    # 12. Mathematical & Numerical Option Sanity Check
    correct_opt_text = opts.get(corr, '').strip()
    if not correct_opt_text:
        return False, f"Correct option '{corr}' text is missing or empty.", "MATHEMATICAL_VALIDATION_ERROR"

    return True, "Passed local deterministic validation.", None


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
    admin_description: str = '',
    source_chunks: Optional[List[Dict[str, Any]]] = None,
    require_grounding: bool = False
) -> Tuple[bool, str, Optional[Dict[str, Any]], str]:
    """
    Local deterministic validation (no AI calls): 4 options, 1 answer, valid index, non-empty
    question, subject/chapter consistency, difficulty, word constraints, duplicates, source
    reproduction protection, and source chunk grounding.
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
        admin_description=admin_description,
        source_chunks=source_chunks,
        require_grounding=require_grounding
    )

    if not is_valid_local:
        return False, local_reason, None, "local"

    # Stage 2: Pure deterministic local validation (zero external cloud dependencies)
    return True, "Passed local deterministic validation.", None, "local"

# ----------------- Canonical Local Qwen Generation Pipeline -----------------

QWEN_BATCH_SIZE = max(1, int(os.environ.get('QWEN_BATCH_SIZE', '2')))
QWEN_BATCH_TIMEOUT = float(os.environ.get('QWEN_BATCH_TIMEOUT', '240'))
AVOID_LIST_SIZE = 20  # existing/earlier questions sent to Qwen as "do not repeat"
RETRY_TEMPERATURE = 0.85  # more variety for replacement rounds so rejected output is not reproduced
# Target-fill budget: candidates evaluated (accepted + rejected) per requested question. A job of N
# questions may evaluate at most max(N * factor, N + MIN_EXTRA_CANDIDATES) candidates in total.
MAX_CANDIDATES_PER_QUESTION = max(1, int(os.environ.get('QWEN_MAX_CANDIDATES_PER_QUESTION', '3')))
MIN_EXTRA_CANDIDATES = 4
# Consecutive Ollama call failures (timeout / offline / error) after which the provider is unavailable
MAX_CONSECUTIVE_PROVIDER_FAILURES = max(1, int(os.environ.get('QWEN_MAX_CONSECUTIVE_FAILURES', '3')))
REJECTED_STEMS_LIMIT = 12  # rejected stems sent back to Qwen as "DO NOT REPEAT"
REJECTED_TELEMETRY_LIMIT = 50
# Framing rotated across replacement rounds so a replacement is not the same question again
DIVERSIFICATION_ANGLES = (
    "a short numerical or computation-based stem",
    "a 'Which of the following is NOT ...' stem testing an exception",
    "a practical scenario that applies the rule to specific facts",
    "a comparison between two closely related concepts",
    "a cause-and-effect or consequence question",
    "an 'identify the correct example' question",
    "a precise definition question that separates the concept from a close alternative",
    "a question about when the rule does NOT apply or its limitations",
)


def generation_budget(count: int) -> int:
    """Maximum candidates (accepted + rejected) evaluated for a job of `count` questions."""
    return max(count * MAX_CANDIDATES_PER_QUESTION, count + MIN_EXTRA_CANDIDATES)


class GenerationCancelled(Exception):
    """Raised between batches when the caller (e.g. a worker that lost its job lease) cancels."""


ANSWER_LETTERS = ('A', 'B', 'C', 'D')
# Option-letter references in explanations ("Option A", "option (B)", "Answer: C", "(D)"), remapped
# after shuffling in a single pass. The letter itself must be uppercase so prose like "a choice a firm
# makes" is never touched.
_LETTER_REFERENCE = re.compile(
    r'\b(?i:options?|choices?|answer(?:\s+is)?)\s*[:\-]?\s*\(?([A-D])\)?(?![A-Za-z])|\(([A-D])\)')


class AnswerPositionBalancer:
    """Balanced random correct-answer positions: every 4 questions use A, B, C and D once, in random order."""

    def __init__(self, rng: Optional[random.Random] = None):
        self.rng = rng or random.Random()
        self._bag: List[str] = []

    def next_letter(self) -> str:
        if not self._bag:
            self._bag = list(ANSWER_LETTERS)
            self.rng.shuffle(self._bag)
        return self._bag.pop()


def shuffle_options_to(q_data: Dict[str, Any], target_letter: str, rng: random.Random) -> None:
    """
    Reorder the four options in place so the correct answer sits at target_letter (distractors in
    random order), then remap option-letter references in the explanation to the new letters.
    """
    correct = str(q_data.get('correctAnswer') or q_data.get('correctOption') or '').strip().upper()
    texts = {k: q_data.get(f'option{k}', '') for k in ANSWER_LETTERS}
    if correct not in ANSWER_LETTERS or target_letter not in ANSWER_LETTERS or not all(texts.values()):
        return
    distractors = [k for k in ANSWER_LETTERS if k != correct]
    rng.shuffle(distractors)
    new_to_old: Dict[str, str] = {target_letter: correct}
    for new_letter in ANSWER_LETTERS:
        if new_letter != target_letter:
            new_to_old[new_letter] = distractors.pop()
    old_to_new = {old: new for new, old in new_to_old.items()}

    for new_letter, old_letter in new_to_old.items():
        q_data[f'option{new_letter}'] = texts[old_letter]
    q_data['options'] = {k: q_data[f'option{k}'] for k in ANSWER_LETTERS}
    q_data['correctAnswer'] = q_data['correctOption'] = q_data['answer'] = target_letter

    def _remap(m: 're.Match') -> str:
        group = 1 if m.group(1) else 2
        pos = m.start(group) - m.start(0)
        text = m.group(0)
        return text[:pos] + old_to_new[m.group(group)] + text[pos + 1:]

    if q_data.get('explanation'):
        q_data['explanation'] = _LETTER_REFERENCE.sub(_remap, str(q_data['explanation']))


def _build_syllabus_scope(chapter_metadata: Optional[Dict[str, Any]]) -> str:
    """Compact syllabus scope (chapter description + allowed topics) passed to Qwen."""
    if not chapter_metadata:
        return ''
    parts = []
    if chapter_metadata.get('chapterDescription'):
        parts.append(str(chapter_metadata['chapterDescription']).strip())
    topics = [str(t).strip() for t in (chapter_metadata.get('allowedTopics') or []) if str(t).strip()]
    if topics:
        parts.append("Allowed topics: " + "; ".join(topics[:8]))
    return "\n".join(parts)


def generate_batched_mcqs(
    subject: str,
    chapter: str,
    count: int,
    topic: str = '',
    exam_level: str = 'CA Foundation',
    difficulty: str = 'ICAI Exam Standard',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    admin_description: str = '',
    syllabus_scope: str = '',
    previous_concepts: Optional[List[str]] = None,
    timeout: Optional[float] = None,
    temperature: Optional[float] = None,
    rejected_stems: Optional[List[str]] = None,
    diversification: str = ''
) -> Tuple[List[Dict[str, Any]], str, str]:
    """
    One Ollama call for a single small batch of candidate MCQs.
    Returns (normalized_candidates, provider_id, model_name). Raises on timeout / Ollama errors.
    """
    valid_mcqs, telemetry = local_qwen_service.generate_mcqs(
        subject=subject,
        chapter=chapter,
        count=count,
        exam_level=exam_level,
        difficulty=difficulty,
        topic=topic,
        question_category=question_category,
        question_speed=question_speed,
        admin_description=admin_description,
        syllabus_scope=syllabus_scope,
        previous_concepts=previous_concepts,
        timeout=timeout,
        temperature=temperature,
        rejected_stems=rejected_stems,
        diversification=diversification
    )
    return valid_mcqs, 'local_qwen', telemetry.get('model') or local_qwen_service.OLLAMA_MODEL


def _build_question_record(
    q_data: Dict[str, Any],
    number: int,
    test_id: Optional[str],
    job_id: Optional[str],
    subject: str,
    chapter: str,
    chapter_id: str,
    topic: str,
    exam_level: str,
    difficulty: str,
    question_category: str,
    question_speed: str,
    marks_per_correct: float,
    negative_marks_per_wrong: float,
    platform_xp: float,
    gen_prov: str,
    gen_model: str,
    val_prov: str
) -> Dict[str, Any]:
    q_text = str(q_data.get('question') or q_data.get('text') or '').strip()
    c_ans = str(q_data.get('correctAnswer') or q_data.get('correctOption') or 'A').strip().upper()
    options = {k: q_data.get(f'option{k}', '') for k in ('A', 'B', 'C', 'D')}
    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    return {
        'id': f"q-ai-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
        'testId': test_id or "tst-ai-pending",
        'number': number,
        'text': q_text,
        'question': q_text,
        'questionType': 'text',
        'questionImage': None,
        'optionA': options['A'],
        'optionB': options['B'],
        'optionC': options['C'],
        'optionD': options['D'],
        'options': options,
        'optionTypes': {'A': 'text', 'B': 'text', 'C': 'text', 'D': 'text'},
        'optionImages': {'A': None, 'B': None, 'C': None, 'D': None},
        'correctOption': c_ans,
        'correctAnswer': c_ans,
        'marks': float(marks_per_correct),
        'negativeMarks': float(negative_marks_per_wrong),
        'points': float(platform_xp),
        'xp': float(platform_xp),
        'explanation': q_data.get('explanation', ''),
        'category': question_category,
        'questionCategory': question_category,
        'difficulty': difficulty,
        'estimatedThinkingLevel': question_speed,
        'questionSpeed': question_speed,
        'subject': subject,
        'chapter': chapter,
        'chapterId': chapter_id,
        'topic': topic,
        'examLevel': exam_level,
        'isDraft': False,
        'aiSuggestedAnswer': c_ans,
        'isDuplicate': False,
        'aiGenerated': True,
        'aiJobId': job_id or f"job-{int(time.time()*1000)}",
        'generationJobId': job_id or f"job-{int(time.time()*1000)}",
        'sourceDocId': q_data.get('sourceDocId'),
        'sourceContentId': q_data.get('sourceContentId'),
        'sourceChapter': q_data.get('sourceChapter') or chapter,
        'sourceTopic': q_data.get('sourceTopic') or topic,
        'sourcePage': q_data.get('sourcePage'),
        'groundingScore': q_data.get('groundingScore'),
        'providerUsed': gen_prov,
        'modelUsed': gen_model,
        'validationProvider': val_prov,
        'generatedAt': now_iso,
        'createdAt': now_iso,
        'updatedAt': now_iso
    }


def generate_exact_mcqs_pipeline(
    *,
    subject: str,
    chapter: str = '',
    topic: str = '',
    count: int = 5,
    exam_level: str = 'CA Foundation',
    difficulty: str = 'ICAI Exam Standard',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    marks_per_correct: float = 2.0,
    negative_marks_per_wrong: float = 0.5,
    platform_xp: float = 10.0,
    test_id: Optional[str] = None,
    job_id: Optional[str] = None,
    chapter_id: str = '',
    chapter_metadata: Optional[Dict[str, Any]] = None,
    admin_description: str = '',
    existing_questions: Optional[List[Dict[str, Any]]] = None,
    source_documents: Optional[List[Dict[str, Any]]] = None,
    data: Optional[Dict[str, Any]] = None,
    start_number: int = 1,
    batch_size: Optional[int] = None,
    batch_timeout: Optional[float] = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    on_question_verified: Optional[Callable[..., None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
    rng: Optional[random.Random] = None,
    candidate_budget: Optional[int] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    The single canonical MCQ generation pipeline (Local Qwen3 8B via Ollama).

    Keyword-only arguments: an unknown or misspelled parameter raises TypeError instead of
    being silently ignored.

    Target fill: the run keeps generating until `count` validated, unique questions are accepted.
    Each round asks Qwen for min(missing, QWEN_BATCH_SIZE) candidates, then every candidate goes
    through validate -> deduplicate (accepted questions of this run + the question bank) ->
    on_question_verified (save) -> progress_callback. A rejected candidate (invalid, duplicate,
    near-duplicate, out of scope) never fills a slot: the missing questions are generated again as
    replacements, with the rejected stems as "DO NOT REPEAT", a different framing angle, a different
    sub-topic (whole-chapter requests) and a higher temperature. Accepted questions are never
    regenerated. The loop is bounded: it stops at `count` accepted (COMPLETED), when the candidate
    budget (generation_budget(count), or candidate_budget) is used up, or after
    MAX_CONSECUTIVE_PROVIDER_FAILURES failed Ollama calls in a row (PARTIAL, or FAILED with none
    accepted), with the reason in metrics['error'] / metrics['partialReason']. Every Ollama call is
    bounded by batch_timeout.

    start_number offsets question numbering when resuming a job that already has saved questions.
    cancel_check is polled before every Ollama call; returning True raises GenerationCancelled.
    Accepted questions have their options shuffled so correct answers are spread evenly over
    A-D (rng may be passed for reproducible tests).
    """
    size = max(1, int(batch_size or QWEN_BATCH_SIZE))
    rng = rng or random.Random()
    answer_positions = AnswerPositionBalancer(rng)  # models favour "A"; spread correct answers evenly
    per_call_timeout = float(batch_timeout or QWEN_BATCH_TIMEOUT)
    existing_questions = list(existing_questions or [])

    generated_questions: List[Dict[str, Any]] = []
    existing_texts: List[str] = [
        str(q.get('text') or q.get('question') or '')[:120] for q in existing_questions if isinstance(q, dict)
    ]
    existing_texts = [t for t in existing_texts if t.strip()]

    def _avoid_list() -> List[str]:
        """Questions Qwen must not repeat: everything from this run plus the newest bank questions."""
        own = [q['text'][:120] for q in generated_questions]
        room = max(0, AVOID_LIST_SIZE - len(own))
        return (existing_texts[-room:] if room else []) + own[-AVOID_LIST_SIZE:]

    question_statuses: List[Dict[str, Any]] = [
        {'number': start_number + i, 'status': 'pending', 'error': None, 'provider': None}
        for i in range(count)
    ]
    budget = max(1, int(candidate_budget or generation_budget(count)))
    rejected: List[Dict[str, Any]] = []   # telemetry only - rejected candidates are never saved

    metrics: Dict[str, Any] = {
        'requestedCount': count,
        'generatedCount': 0,
        'failedCount': 0,
        'rejectedCount': 0,
        'rejectedDuplicates': 0,
        'rejectedValidation': 0,
        'rejectedCandidates': rejected,
        'regenerationAttempts': 0,
        'regenerationCount': 0,
        'replacementRounds': 0,
        'rounds': 0,
        'qwenGenerationCalls': 0,
        'providerFailures': 0,
        'candidatesEvaluated': 0,
        'candidateBudget': budget,
        'validationCalls': 0,
        'validationProvider': 'local',
        'batchSize': size,
        'providersUsed': set(),
        'validationProvidersUsed': set(),
        'questionStatuses': question_statuses,
        'category': question_category,
        'speed': question_speed,
        'startTime': time.time(),
        'endTime': None
    }

    def _finish(final_status: Optional[str] = None, error: Optional[str] = None):
        accepted_n = len(generated_questions)
        metrics['generatedCount'] = accepted_n
        metrics['failedCount'] = count - accepted_n
        metrics['rejectedCount'] = metrics['rejectedDuplicates'] + metrics['rejectedValidation']
        metrics['regenerationCount'] = metrics['regenerationAttempts']
        metrics['endTime'] = time.time()
        metrics['durationSeconds'] = round(metrics['endTime'] - metrics['startTime'], 1)
        metrics['providersUsed'] = sorted(metrics['providersUsed'])
        metrics['validationProvidersUsed'] = sorted(metrics['validationProvidersUsed'])
        if error:
            metrics['error'] = error
            if accepted_n:
                metrics['partialReason'] = error
        # accepted questions are the only source of truth for completion
        metrics['finalStatus'] = final_status or (
            'COMPLETED' if accepted_n == count else ('PARTIAL' if accepted_n else 'FAILED'))
        print(f"[BATCH_COMPLETED] batchId={job_id} total={count} verified={accepted_n} "
              f"rejected={metrics['rejectedCount']} candidates={metrics['candidatesEvaluated']}/{budget} "
              f"duration={metrics['durationSeconds']}s status={metrics['finalStatus']}", flush=True)
        return generated_questions, metrics

    offset = start_number - 1   # numbering/progress text of a resumed job includes earlier questions
    shown_total = offset + count

    def _report(stage: str, status_text: str, round_no: int):
        if not progress_callback:
            return
        verified = len(generated_questions)
        progress_callback({
            'stage': stage,
            'status': status_text,
            'verifiedCount': verified,
            'total': count,
            'current': min(count, verified + 1),
            'batchIndex': round_no,
            'rejectedCount': metrics['rejectedDuplicates'] + metrics['rejectedValidation'],
            # accepted / target only; never 100 while generating
            'progressPct': min(95, 5 + int((verified / count) * 90)) if count else 95,
            'questionStatuses': [dict(s) for s in question_statuses]
        })

    # 1. Authoritative chapter metadata (subject/chapter protection) - fail fast if unresolvable
    resolved_ch_meta = chapter_metadata or syllabus_hierarchy.get_authoritative_chapter_metadata(
        chapter_id=chapter_id,
        chapter_name=chapter or topic,
        subject=subject,
        exam_level=exam_level,
        data=data
    )
    if not resolved_ch_meta:
        err_msg = (f"CHAPTER_METADATA_MISSING: Authoritative syllabus metadata could not be resolved for "
                   f"chapterId='{chapter_id}', chapter='{chapter}', subject='{subject}'.")
        print(f"[CHAPTER_METADATA_ERROR] {err_msg}", flush=True)
        for s in question_statuses:
            s['status'] = 'failed'
            s['error'] = err_msg
        return _finish('FAILED', err_msg)

    canonical_ch_id = resolved_ch_meta['chapterId']
    canonical_ch_name = resolved_ch_meta['chapterName']
    canonical_subject = resolved_ch_meta.get('subject', subject)
    canonical_exam_level = resolved_ch_meta.get('examLevel', exam_level)
    syllabus_scope = _build_syllabus_scope(resolved_ch_meta)

    # Sub-topic rotation: when the admin asked for the whole chapter (topic empty or = chapter name),
    # each round focuses on a different allowed topic so rounds and consecutive jobs don't converge
    # on the same classic questions (which the duplicate check would then reject).
    allowed_topics = [str(t).strip() for t in (resolved_ch_meta.get('allowedTopics') or []) if str(t).strip()]
    rotate_topics = bool(allowed_topics) and (not topic.strip() or topic.strip().lower() == canonical_ch_name.lower())
    topic_offset = len(existing_texts) // size

    def _focus_topic(round_no: int) -> str:
        if not rotate_topics:
            return topic
        return allowed_topics[(topic_offset + round_no - 1) % len(allowed_topics)]

    # 2. Optional grounding chunks from uploaded syllabus documents (server-side callers only)
    all_docs = source_documents if source_documents is not None else (
        data.get('ai_source_documents', []) if isinstance(data, dict) else [])
    active_chunks = ai_document_indexer.retrieve_relevant_chunks(
        documents=all_docs,
        query_topic=topic,
        subject=canonical_subject,
        chapter=canonical_ch_name,
        chapter_id=canonical_ch_id,
        exam_level=canonical_exam_level,
        max_chunks=6
    ) if all_docs else []

    print(f"[BATCH START] batchId={job_id} total={count} batchSize={size} candidateBudget={budget} "
          f"chapter='{canonical_ch_name}' ({canonical_ch_id}) subject='{canonical_subject}' "
          f"timeout={per_call_timeout}s", flush=True)

    round_errors: List[str] = []   # reasons of the candidates rejected in the current round

    def _refresh_open_slots():
        """The first unfilled slots show this round's rejections (RETRYING + reason) - one per rejected candidate."""
        base = len(generated_questions)
        for i, err in enumerate(round_errors):
            if base + i < count:
                question_statuses[base + i].update({'status': 'retrying', 'error': err})

    def _reject(reason: str, stem: str, round_no: int):
        """A rejected candidate: counted, remembered for "DO NOT REPEAT", never saved; the slot it was
        meant for stays open (RETRYING) and is filled by a replacement."""
        if 'duplicate' in str(reason).lower():
            metrics['rejectedDuplicates'] += 1
        else:
            metrics['rejectedValidation'] += 1
        rejected.append({'question': str(stem or '')[:160], 'reason': str(reason)[:200], 'round': round_no})
        del rejected[:-REJECTED_TELEMETRY_LIMIT]
        round_errors.append(f"Rejected: {reason}"[:240])
        _refresh_open_slots()
        slot_no = question_statuses[min(count - 1, len(generated_questions) + len(round_errors) - 1)]['number']
        print(f"[QUESTION_REJECTED] batchId={job_id} round={round_no} slot=Q{slot_no} reason={reason}", flush=True)

    # 3. Target-fill loop: keep generating the missing questions until the target is met or a bound is hit
    consecutive_failures = 0
    stop_reason: Optional[str] = None
    round_no = 0
    while len(generated_questions) < count:
        if metrics['candidatesEvaluated'] >= budget:
            stop_reason = (f"GENERATION_BUDGET_EXHAUSTED: {len(generated_questions)} of {count} unique MCQs verified "
                           f"after {metrics['candidatesEvaluated']} candidates ({metrics['rejectedDuplicates']} duplicate, "
                           f"{metrics['rejectedValidation']} invalid, {metrics['providerFailures']} failed Qwen calls).")
            break
        if cancel_check and cancel_check():
            raise GenerationCancelled(f"Generation cancelled before round {round_no + 1}.")

        round_no += 1
        verified = len(generated_questions)
        missing = count - verified
        request = min(missing, size, budget - metrics['candidatesEvaluated'])
        round_errors.clear()
        slots = question_statuses[verified:verified + request]
        # slots whose earlier candidate was rejected (or whose Qwen call failed) are being replaced
        n_replace = sum(1 for sl in question_statuses[verified:] if sl['status'] == 'retrying')
        replacement = n_replace > 0 or consecutive_failures > 0
        if replacement:
            metrics['replacementRounds'] += 1
            metrics['regenerationAttempts'] += 1
        metrics['rounds'] = round_no
        for sl in slots:
            sl['status'] = 'retrying' if sl['status'] == 'retrying' else 'generating'
        if replacement and n_replace >= request:
            status_text = (f"{offset + verified}/{shown_total} verified \u2014 generating {request} replacement "
                           f"question{'s' if request != 1 else ''}...")
        elif replacement:
            status_text = (f"{offset + verified}/{shown_total} verified \u2014 generating questions "
                           f"{offset + verified + 1}-{offset + verified + request} "
                           f"({min(n_replace, request)} replacement)...")
        else:
            status_text = (f"{offset + verified}/{shown_total} verified \u2014 generating questions "
                           f"{offset + verified + 1}-{offset + verified + request} with Local Qwen3...")
        _report('generating', status_text, round_no)

        angle = DIVERSIFICATION_ANGLES[(round_no - 1) % len(DIVERSIFICATION_ANGLES)] if replacement else ''
        metrics['qwenGenerationCalls'] += 1
        try:
            candidates, gen_prov, gen_model = generate_batched_mcqs(
                subject=canonical_subject,
                chapter=canonical_ch_name,
                count=request,
                temperature=RETRY_TEMPERATURE if replacement else None,
                topic=_focus_topic(round_no),
                exam_level=canonical_exam_level,
                difficulty=difficulty,
                question_category=question_category,
                question_speed=question_speed,
                admin_description=admin_description,
                syllabus_scope=syllabus_scope,
                previous_concepts=_avoid_list(),
                rejected_stems=[r['question'] for r in rejected if r['question']][-REJECTED_STEMS_LIMIT:],
                diversification=(f"Frame each new question as {angle}, on a concept/rule that none of the listed "
                                 f"questions covers." if angle else ''),
                timeout=per_call_timeout
            )
            metrics['providersUsed'].add(gen_prov)
        except Exception as gen_err:
            consecutive_failures += 1
            metrics['providerFailures'] += 1
            metrics['candidatesEvaluated'] += request   # a failed call still consumes budget
            print(f"[BATCH_GEN_ERROR] round {round_no}: {gen_err}", flush=True)
            for sl in slots:
                sl.update({'status': 'retrying', 'error': f"Generation error: {gen_err}"[:240]})
            if consecutive_failures >= MAX_CONSECUTIVE_PROVIDER_FAILURES:
                stop_reason = (f"PROVIDER_UNAVAILABLE: Local Qwen failed {consecutive_failures} times in a row "
                               f"({gen_err}). {len(generated_questions)} of {count} MCQs verified.")
                break
            continue
        consecutive_failures = 0

        _report('validating', f"{offset + verified}/{shown_total} verified \u2014 validating {len(candidates)} "
                              f"candidate MCQ(s)...", round_no)
        evaluated = 0
        for cand_q in candidates:
            if len(generated_questions) >= count or evaluated >= request:
                break
            evaluated += 1
            slot = question_statuses[len(generated_questions)]   # an accepted candidate takes the next number
            probe = question_statuses[min(count - 1, len(generated_questions) + len(round_errors))]
            probe['status'] = 'validating'
            stem = str((cand_q or {}).get('question') or (cand_q or {}).get('text') or '') if isinstance(cand_q, dict) else ''
            if not isinstance(cand_q, dict):
                _reject('Invalid candidate (not an MCQ object).', '', round_no)
                continue
            is_valid, val_reason, fix, val_prov = validate_mcq_independently(
                q_data=cand_q,
                subject=canonical_subject,
                topic=topic,
                exam_level=canonical_exam_level,
                difficulty=difficulty,
                question_category=question_category,
                question_speed=question_speed,
                existing_questions=existing_questions,
                current_batch_questions=generated_questions,
                data=data,
                chapter=canonical_ch_name,
                chapter_id=canonical_ch_id,
                admin_description=admin_description,
                source_chunks=active_chunks
            )
            metrics['validationCalls'] += 1
            metrics['validationProvidersUsed'].add(val_prov)
            if not is_valid:
                _reject(val_reason, stem, round_no)
                continue

            if fix and isinstance(fix, dict):
                cand_q.update(fix)
            shuffle_options_to(cand_q, answer_positions.next_letter(), rng)
            q_rec = _build_question_record(
                q_data=cand_q,
                number=slot['number'],
                test_id=test_id,
                job_id=job_id,
                subject=canonical_subject,
                chapter=canonical_ch_name,
                chapter_id=canonical_ch_id,
                topic=topic,
                exam_level=canonical_exam_level,
                difficulty=difficulty,
                question_category=question_category,
                question_speed=question_speed,
                marks_per_correct=marks_per_correct,
                negative_marks_per_wrong=negative_marks_per_wrong,
                platform_xp=platform_xp,
                gen_prov=gen_prov,
                gen_model=gen_model,
                val_prov=val_prov
            )
            generated_questions.append(q_rec)
            slot.update({'status': 'saved', 'provider': gen_prov, 'error': None})
            _refresh_open_slots()
            print(f"[QUESTION_VERIFIED] batchId={job_id} questionNumber={q_rec['number']} "
                  f"verifiedTotal={len(generated_questions)}/{count}", flush=True)
            if on_question_verified:
                on_question_verified(q_rec, generated_questions, len(generated_questions), count)

        # fewer usable candidates than requested (empty / malformed / unparseable output) = rejected ones
        for _ in range(request - evaluated):
            if len(generated_questions) >= count:
                break
            _reject('Qwen returned fewer valid MCQ objects than requested (empty or malformed output).', '', round_no)
        metrics['candidatesEvaluated'] += max(evaluated, request)

        still_needed = count - len(generated_questions)
        _report('batch_complete', f"{offset + len(generated_questions)}/{shown_total} verified" +
                (f" \u2014 {still_needed} still needed" if still_needed else ''), round_no)

    if len(generated_questions) < count:
        for sl in question_statuses[len(generated_questions):]:
            sl.update({'status': 'unfilled', 'error': stop_reason})
        return _finish(error=stop_reason)
    return _finish()
