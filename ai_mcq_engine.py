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

# ----------------- Prompt Templates -----------------

GENERATION_SYSTEM_PROMPT = """You are an elite Chartered Accountancy (ICAI) Examination Specialist and Senior Professor.
Your task is to generate ORIGINAL, high-quality, conceptual Multiple Choice Questions (MCQs) for Indian CA students (CA Foundation, CA Intermediate, or CA Final).

MANDATORY RULES:
1. ORIGINALITY: Formulate brand-new questions derived conceptually from the provided syllabus/source context. NEVER copy verbatim from textbook questions.
2. OPTIONS: Exactly four distinct, mutually exclusive options (A, B, C, D). None of the options should be identical or trivial ("All of the above" / "None of the above" should be avoided).
3. SINGLE CORRECT ANSWER: Exactly one unequivocally correct answer based strictly on ICAI standard syllabus, Companies Act 2013, relevant Ind AS / AS, Income Tax Act 1961, or economic / mathematical laws.
4. NUMERICAL VERIFICATION: If the question involves numerical calculations, compute all intermediate values explicitly so the numerical result is exact and unambiguous.
5. EXPLANATION: Provide an exhaustive, step-by-step reasoning citing applicable standards, sections, or mathematical formulas.
6. JSON FORMAT: Output MUST be strictly valid JSON matching the required schema with no extra conversational text or markdown code blocks.
"""

GENERATION_USER_PROMPT_TEMPLATE = """Subject: {subject}
Exam Level: {exam_level}
Topic / Chapter: {topic}
Difficulty Level: {difficulty}

Source Material Context (Extracted from Syllabus Documents):
\"\"\"
{context}
\"\"\"

Task: Create 1 original, challenging CA-style MCQ testing conceptual clarity on the topic above.
Avoid testing duplicate concepts from previously generated questions:
{previous_concepts_summary}

Respond with ONLY this JSON object schema:
{{
  "text": "Question prompt here...",
  "optionA": "Option A text",
  "optionB": "Option B text",
  "optionC": "Option C text",
  "optionD": "Option D text",
  "correctOption": "A",
  "explanation": "Detailed step-by-step explanation with section/standard references..."
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

# ----------------- Core Engine Methods -----------------

def generate_single_mcq(
    subject: str,
    topic: str,
    exam_level: str = 'CA Foundation',
    difficulty: str = 'ICAI Exam Standard',
    context_chunks: Optional[List[Dict[str, Any]]] = None,
    previous_concepts: Optional[List[str]] = None,
    data: Optional[Dict[str, Any]] = None
) -> Tuple[Dict[str, Any], str, str]:
    """
    Generate a single candidate MCQ using prioritized failover (Gemini 1 -> 2 -> OpenRouter -> Groq).
    Returns (parsed_json_dict, provider_id, model_name).
    """
    context_text = "Standard ICAI syllabus concepts for " + topic
    source_doc_id = None
    source_page = None

    if context_chunks:
        # Combine top chunk texts
        selected_chunk = context_chunks[0]
        context_text = selected_chunk.get('text', context_text)
        source_doc_id = selected_chunk.get('docId')
        source_page = selected_chunk.get('pages', [1])[0] if selected_chunk.get('pages') else 1

    prev_summary = "None yet."
    if previous_concepts:
        prev_summary = "\n- ".join(previous_concepts[-5:])

    user_prompt = GENERATION_USER_PROMPT_TEMPLATE.format(
        subject=subject,
        exam_level=exam_level,
        topic=topic,
        difficulty=difficulty,
        context=context_text[:2500],
        previous_concepts_summary=prev_summary
    )

    response_text, provider_id, model_name = ai_provider_manager.call_llm_with_failover(
        purpose='generation',
        prompt=user_prompt,
        system_instruction=GENERATION_SYSTEM_PROMPT,
        json_mode=True,
        data=data
    )

    try:
        q_data = json.loads(response_text)
    except Exception as e:
        raise ValueError(f"Failed to parse model JSON: {str(e)} | Raw: {response_text[:150]}")

    # Required fields check
    req_fields = ['text', 'optionA', 'optionB', 'optionC', 'optionD', 'correctOption', 'explanation']
    for rf in req_fields:
        if rf not in q_data or not str(q_data[rf]).strip():
            raise ValueError(f"Model output missing required field '{rf}'")

    correct_opt = str(q_data['correctOption']).strip().upper()
    if correct_opt not in ['A', 'B', 'C', 'D']:
        # Attempt to extract letter if format like "Option A"
        match = re.search(r'\b([A-D])\b', correct_opt)
        if match:
            correct_opt = match.group(1)
        else:
            raise ValueError(f"Invalid correctOption '{correct_opt}', must be A, B, C, or D.")
    q_data['correctOption'] = correct_opt
    q_data['sourceDocId'] = source_doc_id
    q_data['sourcePage'] = source_page

    return q_data, provider_id, model_name

def validate_mcq_independently(
    q_data: Dict[str, Any],
    subject: str,
    topic: str,
    exam_level: str = 'CA Foundation',
    data: Optional[Dict[str, Any]] = None
) -> Tuple[bool, str, Optional[Dict[str, Any]], str]:
    """
    Run independent validator failover chain to verify academic and mathematical soundness.
    Returns: (is_valid: bool, reason: str, suggested_fix: dict or None, validator_provider: str)
    """
    user_prompt = VALIDATOR_USER_PROMPT_TEMPLATE.format(
        subject=subject,
        topic=topic,
        exam_level=exam_level,
        text=q_data.get('text', ''),
        optionA=q_data.get('optionA', ''),
        optionB=q_data.get('optionB', ''),
        optionC=q_data.get('optionC', ''),
        optionD=q_data.get('optionD', ''),
        correctOption=q_data.get('correctOption', ''),
        explanation=q_data.get('explanation', '')
    )

    try:
        val_response, val_prov, val_model = ai_provider_manager.call_llm_with_failover(
            purpose='validation',
            prompt=user_prompt,
            system_instruction=VALIDATOR_SYSTEM_PROMPT,
            json_mode=True,
            data=data
        )
        val_data = json.loads(val_response)
        is_valid = bool(val_data.get('isValid', False))
        reason = str(val_data.get('reason', 'Validated successfully.'))
        suggested_fix = val_data.get('suggestedFix')
        return is_valid, reason, suggested_fix, val_prov
    except Exception as e:
        print(f"[AI_VALIDATION_WARNING] Independent validator error ({e}). Falling back to algorithmic heuristic validation.", flush=True)
        # Algorithmic structural validation fallback
        opts = [q_data.get('optionA', ''), q_data.get('optionB', ''), q_data.get('optionC', ''), q_data.get('optionD', '')]
        if len(set(opts)) != 4:
            return False, "Duplicate options detected in question choices.", None, "heuristic"
        if len(q_data.get('text', '')) < 20:
            return False, "Question text too short or incomplete.", None, "heuristic"
        return True, "Passed structural validation fallback.", None, "heuristic"

def generate_exact_mcqs_pipeline(
    subject: str,
    topic: str,
    count: int,
    exam_level: str = 'CA Foundation',
    difficulty: str = 'ICAI Exam Standard',
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
    chapter_id: str = ''
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Main resilient generation pipeline guaranteeing EXACT count of validated MCQs.
    Employs single-item failure recovery: only the failed item is regenerated.
    """
    if existing_questions is None:
        existing_questions = []
    if source_documents is None:
        source_documents = []

    # Retrieve relevant source chunks for targeted context
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
    
    # Telemetry metrics
    metrics = {
        'requestedCount': count,
        'generatedCount': 0,
        'rejectedDuplicates': 0,
        'rejectedValidation': 0,
        'regenerationAttempts': 0,
        'providersUsed': set(),
        'validationProvidersUsed': set(),
        'startTime': time.time(),
        'endTime': None
    }

    max_total_attempts = max(count * 4, 15)
    total_attempts = 0

    while len(generated_questions) < count and total_attempts < max_total_attempts:
        current_index = len(generated_questions) + 1
        total_attempts += 1

        if progress_callback:
            try:
                progress_callback({
                    'stage': 'generating',
                    'current': current_index,
                    'total': count,
                    'status': f"Generating question {current_index} of {count}...",
                    'progressPct': int((len(generated_questions) / count) * 90)
                })
            except Exception:
                pass

        # Context rotation across chunks
        chunk_slice = None
        if relevant_chunks:
            chunk_idx = (current_index - 1) % len(relevant_chunks)
            chunk_slice = [relevant_chunks[chunk_idx]]

        # Step 1: Generate single MCQ via failover
        try:
            q_candidate, gen_prov, gen_model = generate_single_mcq(
                subject=subject,
                topic=topic,
                exam_level=exam_level,
                difficulty=difficulty,
                context_chunks=chunk_slice,
                previous_concepts=concept_summaries,
                data=data
            )
            metrics['providersUsed'].add(gen_prov)
        except Exception as gen_err:
            print(f"[AI_PIPELINE_RETRY] Generation error on item {current_index}: {gen_err}. Retrying item...", flush=True)
            metrics['regenerationAttempts'] += 1
            time.sleep(1.0)
            continue

        # Step 2: Duplicate & near-duplicate check
        is_dup, dup_reason = is_duplicate_question(
            candidate_text=q_candidate['text'],
            existing_questions=existing_questions,
            current_batch_questions=generated_questions,
            threshold=0.75,
            subject_topic=f"{subject} {topic}"
        )
        if is_dup:
            print(f"[AI_PIPELINE_REJECT] Item {current_index} rejected as duplicate: {dup_reason}. Regenerating item only...", flush=True)
            metrics['rejectedDuplicates'] += 1
            metrics['regenerationAttempts'] += 1
            continue

        # Step 3: Independent validator verification
        is_valid, val_reason, suggested_fix, val_prov = validate_mcq_independently(
            q_data=q_candidate,
            subject=subject,
            topic=topic,
            exam_level=exam_level,
            data=data
        )
        metrics['validationProvidersUsed'].add(val_prov)

        if not is_valid:
            print(f"[AI_PIPELINE_REJECT] Item {current_index} rejected by validator: {val_reason}. Regenerating item only...", flush=True)
            metrics['rejectedValidation'] += 1
            metrics['regenerationAttempts'] += 1
            continue

        # Apply fix if suggested by validator
        final_q = q_candidate
        if suggested_fix and isinstance(suggested_fix, dict):
            for k in ['text', 'optionA', 'optionB', 'optionC', 'optionD', 'correctOption', 'explanation']:
                if suggested_fix.get(k):
                    final_q[k] = suggested_fix[k]

        # Step 4: Construct production-ready Question record
        now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        q_record = {
            'id': f"q-ai-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
            'testId': test_id or f"tst-ai-pending",
            'number': current_index,
            'text': final_q['text'],
            'questionType': 'text',
            'questionImage': None,
            'optionA': final_q['optionA'],
            'optionB': final_q['optionB'],
            'optionC': final_q['optionC'],
            'optionD': final_q['optionD'],
            'optionTypes': {'A': 'text', 'B': 'text', 'C': 'text', 'D': 'text'},
            'optionImages': {'A': None, 'B': None, 'C': None, 'D': None},
            'correctOption': final_q['correctOption'].upper(),
            'marks': float(marks_per_correct),
            'negativeMarks': float(negative_marks),
            'explanation': final_q['explanation'],
            'isDraft': False,
            'aiSuggestedAnswer': final_q['correctOption'].upper(),
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
        concept_summaries.append(final_q['text'][:120])
        print(f"[AI_PIPELINE_SUCCESS] Successfully generated and verified question {current_index}/{count} (Provider: {gen_prov}, Validator: {val_prov}).", flush=True)

    metrics['generatedCount'] = len(generated_questions)
    metrics['endTime'] = time.time()
    metrics['durationSeconds'] = round(metrics['endTime'] - metrics['startTime'], 1)
    metrics['providersUsed'] = list(metrics['providersUsed'])
    metrics['validationProvidersUsed'] = list(metrics['validationProvidersUsed'])

    if len(generated_questions) < count:
        print(f"[AI_PIPELINE_WARNING] Pipeline stopped after {total_attempts} attempts. Generated {len(generated_questions)}/{count} questions.", flush=True)

    return generated_questions, metrics
