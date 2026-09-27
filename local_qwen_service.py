"""
local_qwen_service.py
=====================
Centralized Local AI generation service for ExcellenceCA.
Uses Ollama running locally at http://127.0.0.1:11434 with model 'qwen3:8b'.

Features:
- Configurable base URL, model, and timeout via environment variables.
- Direct JSON structured output via Ollama /api/chat with think=False.
- Strict schema validation, option normalization, and deduplication.
- Health checks and connection latency measurements.
- Zero external cloud AI fallback dependencies.
"""

import os
import sys
import json
import time
import re
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional, Tuple

OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').rstrip('/')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'qwen3:8b')
OLLAMA_TIMEOUT = float(os.environ.get('OLLAMA_TIMEOUT', '360.0'))

DEFAULT_SYSTEM_PROMPT = """You are an expert Chartered Accountancy (CA) examination question creator and subject matter authority.
Your task is to generate high-quality Multiple Choice Questions (MCQs) for the Institute of Chartered Accountants of India (ICAI) curriculum.

STRICT INSTRUCTIONS:
1. Generate MCQs strictly relevant to the specified Subject, Chapter, and CA Exam Level.
2. Do not drift into unrelated topics or mix syllabus from other chapters.
3. Each question must have exactly four distinct options labeled "A", "B", "C", and "D".
4. Exactly one option must be the correct answer. The "answer" field must be one of "A", "B", "C", or "D".
5. For mathematical/quantitative problems, calculate accurately. Verify the arithmetic in the explanation.
6. Provide a detailed, pedagogical explanation showing step-by-step reasoning or legal/accounting rationale.
7. Return strictly valid JSON ONLY with the exact schema requested. Do not include markdown codeblocks (```json), commentary, or thought tags.
"""

def get_ollama_config() -> Dict[str, Any]:
    """Return current configuration."""
    return {
        'baseUrl': OLLAMA_BASE_URL,
        'model': OLLAMA_MODEL,
        'timeout': OLLAMA_TIMEOUT
    }

def check_ollama_health(timeout: float = 5.0) -> Tuple[bool, Dict[str, Any]]:
    """
    Check if the local Ollama service is running and has the configured model available.
    Returns (is_online, details_dict).
    """
    url = f"{OLLAMA_BASE_URL}/api/tags"
    t0 = time.time()
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed_ms = round((time.time() - t0) * 1000, 1)
            raw = resp.read().decode('utf-8')
            data = json.loads(raw)
            models = [m.get('name') for m in data.get('models', []) if isinstance(m, dict)]
            
            # Check if configured model or prefix matches
            model_found = any(
                m == OLLAMA_MODEL or m.startswith(f"{OLLAMA_MODEL}:") or OLLAMA_MODEL.startswith(f"{m}:")
                for m in models
            )
            
            return True, {
                'online': True,
                'latencyMs': elapsed_ms,
                'configuredModel': OLLAMA_MODEL,
                'modelAvailable': model_found,
                'availableModels': models,
                'endpoint': OLLAMA_BASE_URL
            }
    except Exception as e:
        elapsed_ms = round((time.time() - t0) * 1000, 1)
        return False, {
            'online': False,
            'latencyMs': elapsed_ms,
            'configuredModel': OLLAMA_MODEL,
            'modelAvailable': False,
            'error': str(e),
            'endpoint': OLLAMA_BASE_URL
        }

def build_mcq_user_prompt(
    subject: str,
    chapter: str,
    count: int = 5,
    exam_level: str = 'CA Foundation',
    difficulty: str = 'Medium',
    topic: str = '',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    admin_description: str = '',
    previous_concepts: Optional[List[str]] = None,
    syllabus_scope: str = '',
    rejected_stems: Optional[List[str]] = None,
    diversification: str = ''
) -> str:
    """Build structured prompt for Qwen3 8B."""
    avoid_block = ""
    if previous_concepts and len(previous_concepts) > 0:
        cleaned = [f"- {c.strip()[:100]}" for c in previous_concepts[-20:] if c.strip()]
        if cleaned:
            avoid_block = ("\nThese questions ALREADY EXIST. Do NOT repeat or paraphrase any of them; "
                           "test a different concept, rule or example instead:\n" + "\n".join(cleaned))
    rejected_clean = [f"- {c.strip()[:140]}" for c in (rejected_stems or [])[-12:] if c and c.strip()]
    if rejected_clean:
        avoid_block += ("\nDO NOT REPEAT - these candidates were just REJECTED (duplicate or invalid). Do not "
                        "reproduce, reword or test the same fact as any of them:\n" + "\n".join(rejected_clean))
    if diversification and diversification.strip():
        avoid_block += f"\nReplacement questions: {diversification.strip()}"

    topic_str = f" - Sub-topic: {topic}" if topic and topic.strip() else ""
    extra_instructions = f"\nAdditional Admin Guidelines: {admin_description.strip()}" if admin_description and admin_description.strip() else ""
    scope_block = f"\nICAI Syllabus Scope (stay strictly within it):\n{syllabus_scope.strip()}" if syllabus_scope and syllabus_scope.strip() else ""

    prompt = f"""Generate exactly {count} multiple choice questions (MCQs) for:
Exam Level: {exam_level}
Subject: {subject}
Chapter: {chapter}{topic_str}
Difficulty Standard: {difficulty}
Question Type: {question_category} ({question_speed})
{scope_block}
{extra_instructions}
{avoid_block}

CRITICAL RULES:
- Every question must be directly from "{subject} -> {chapter}".
- Each question must test a DIFFERENT specific rule, fact, formula or example. Prefer concrete stems
  (a small numerical, "Which of the following is NOT...", cause-and-effect, identify-the-example)
  over generic "Which of the following best describes X?" stems.
- Exactly 4 options per question (keys: "A", "B", "C", "D").
- Answer must be the single uppercase letter: "A", "B", "C", or "D".
- Explanation must thoroughly verify why that option is correct. In the explanation refer to options
  by their content, never by their letter (options are re-ordered after generation).
- Return output as a single JSON object matching this schema:
{{
  "mcqs": [
    {{
      "question": "Clear and self-contained question statement",
      "options": {{
        "A": "First option text",
        "B": "Second option text",
        "C": "Third option text",
        "D": "Fourth option text"
      }},
      "answer": "A",
      "explanation": "Detailed explanation showing complete steps or legal/accounting rationale",
      "subject": "{subject}",
      "chapter": "{chapter}",
      "difficulty": "{difficulty}"
    }}
  ]
}}
"""
    return prompt.strip()

def parse_and_validate_mcqs_json(raw_text: str) -> List[Dict[str, Any]]:
    """
    Parse model output and extract list of valid MCQ dicts.
    Handles potential markdown fences, extra whitespace, or nested JSON structures.
    """
    if not raw_text or not raw_text.strip():
        return []

    clean_text = raw_text.strip()
    
    # Strip markdown codeblocks if model included them
    if clean_text.startswith("```"):
        clean_text = re.sub(r'^```(?:json)?\s*', '', clean_text)
        clean_text = re.sub(r'\s*```$', '', clean_text)
        clean_text = clean_text.strip()

    # Find JSON boundaries
    start_brace = clean_text.find('{')
    start_bracket = clean_text.find('[')
    
    data = None
    if start_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
        end_brace = clean_text.rfind('}')
        if end_brace != -1:
            snippet = clean_text[start_brace:end_brace + 1]
            try:
                data = json.loads(snippet)
            except Exception:
                pass
    elif start_bracket != -1:
        end_bracket = clean_text.rfind(']')
        if end_bracket != -1:
            snippet = clean_text[start_bracket:end_bracket + 1]
            try:
                data = json.loads(snippet)
            except Exception:
                pass

    if data is None:
        # Fallback to direct parse
        try:
            data = json.loads(clean_text)
        except Exception as e:
            raise ValueError(f"Failed to parse JSON from local Qwen output: {e}. Output was: {clean_text[:200]}...")

    raw_list = []
    if isinstance(data, dict):
        if 'mcqs' in data and isinstance(data['mcqs'], list):
            raw_list = data['mcqs']
        elif 'questions' in data and isinstance(data['questions'], list):
            raw_list = data['questions']
        else:
            # Check if dictionary has single question fields
            if 'question' in data or 'text' in data:
                raw_list = [data]
            else:
                for k, v in data.items():
                    if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                        raw_list = v
                        break
    elif isinstance(data, list):
        raw_list = data

    return raw_list

def normalize_mcq(
    raw_q: Dict[str, Any],
    default_subject: str = '',
    default_chapter: str = '',
    default_difficulty: str = 'Medium'
) -> Optional[Dict[str, Any]]:
    """
    Validate and normalize an individual MCQ dict.
    Returns normalized dict or None if invalid.
    """
    if not isinstance(raw_q, dict):
        return None

    # Question text
    q_text = str(raw_q.get('question') or raw_q.get('text') or '').strip()
    if not q_text or len(q_text) < 5:
        return None

    # Options parsing
    opts = raw_q.get('options')
    norm_options = {}

    if isinstance(opts, dict):
        for k in ['A', 'B', 'C', 'D']:
            val = str(opts.get(k) or opts.get(k.lower()) or '').strip()
            if val:
                norm_options[k] = val
    elif isinstance(opts, list) and len(opts) >= 4:
        for idx, k in enumerate(['A', 'B', 'C', 'D']):
            val = str(opts[idx]).strip()
            if val:
                norm_options[k] = val
    else:
        # Check flat fields optionA, optionB, etc.
        for k in ['A', 'B', 'C', 'D']:
            val = str(raw_q.get(f"option{k}") or raw_q.get(f"option_{k}") or raw_q.get(f"option{k.lower()}") or '').strip()
            if val:
                norm_options[k] = val

    # Must have exactly 4 options
    if len(norm_options) != 4 or any(not norm_options[k] for k in ['A', 'B', 'C', 'D']):
        return None

    # Option uniqueness check (prevent all 4 options being the same)
    unique_vals = {v.lower().strip() for v in norm_options.values()}
    if len(unique_vals) < 3:  # At least 3 unique values
        return None

    # Answer resolution
    raw_ans = str(raw_q.get('answer') or raw_q.get('correctAnswer') or raw_q.get('correctOption') or '').strip().upper()
    correct_opt = None
    if raw_ans in ['A', 'B', 'C', 'D']:
        correct_opt = raw_ans
    else:
        # Match answer text to one of the options
        clean_ans = raw_ans.lower()
        for k, v in norm_options.items():
            if v.lower() == clean_ans or (len(clean_ans) > 2 and clean_ans in v.lower()):
                correct_opt = k
                break

    if not correct_opt:
        return None

    # Explanation
    explanation = str(raw_q.get('explanation') or raw_q.get('solution') or raw_q.get('rationale') or '').strip()
    if not explanation:
        explanation = f"Option {correct_opt} is the correct answer according to ICAI curriculum standards."

    return {
        'question': q_text,
        'text': q_text,
        'options': norm_options,
        'optionA': norm_options['A'],
        'optionB': norm_options['B'],
        'optionC': norm_options['C'],
        'optionD': norm_options['D'],
        'answer': correct_opt,
        'correctAnswer': correct_opt,
        'correctOption': correct_opt,
        'explanation': explanation,
        'subject': str(raw_q.get('subject') or default_subject).strip(),
        'chapter': str(raw_q.get('chapter') or default_chapter).strip(),
        'difficulty': str(raw_q.get('difficulty') or default_difficulty).strip()
    }

def generate_mcqs(
    subject: str,
    chapter: str,
    count: int = 5,
    exam_level: str = 'CA Foundation',
    difficulty: str = 'Medium',
    topic: str = '',
    question_category: str = 'Direct Questions',
    question_speed: str = 'Quick',
    admin_description: str = '',
    previous_concepts: Optional[List[str]] = None,
    timeout: Optional[float] = None,
    syllabus_scope: str = '',
    temperature: Optional[float] = None,
    rejected_stems: Optional[List[str]] = None,
    diversification: str = ''
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Generate multiple MCQs via local Ollama Qwen3 8B.
    Returns (list_of_normalized_mcqs, telemetry_dict).
    Raises RuntimeError if Ollama is unreachable.
    """
    active_timeout = timeout or OLLAMA_TIMEOUT

    # Pre-flight health check
    is_online, health_info = check_ollama_health(timeout=3.0)
    if not is_online:
        raise RuntimeError(
            f"Local AI is offline. Ollama is not reachable at {OLLAMA_BASE_URL}. "
            "Please ensure the Ollama daemon is running and try again."
        )

    user_prompt = build_mcq_user_prompt(
        subject=subject,
        chapter=chapter,
        count=count,
        exam_level=exam_level,
        difficulty=difficulty,
        topic=topic,
        question_category=question_category,
        question_speed=question_speed,
        admin_description=admin_description,
        previous_concepts=previous_concepts,
        syllabus_scope=syllabus_scope,
        rejected_stems=rejected_stems,
        diversification=diversification
    )

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": DEFAULT_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False,
        "format": "json",
        "think": False,
        "options": {
            "temperature": 0.6 if temperature is None else float(temperature),
            "top_p": 0.95
        }
    }

    url = f"{OLLAMA_BASE_URL}/api/chat"
    req_body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=req_body,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=active_timeout) as resp:
            elapsed_sec = round(time.time() - t0, 2)
            raw_response = resp.read().decode('utf-8')
            res_obj = json.loads(raw_response)
            
            message = res_obj.get('message', {})
            content = message.get('content', '')
            
            raw_mcqs = parse_and_validate_mcqs_json(content)
            
            valid_mcqs = []
            for item in raw_mcqs:
                norm = normalize_mcq(
                    item,
                    default_subject=subject,
                    default_chapter=chapter,
                    default_difficulty=difficulty
                )
                if norm:
                    valid_mcqs.append(norm)

            telemetry = {
                'provider': 'LOCAL',
                'providerId': 'local_qwen',
                'model': OLLAMA_MODEL,
                'runtime': 'Ollama',
                'endpoint': OLLAMA_BASE_URL,
                'latencySeconds': elapsed_sec,
                'requestedCount': count,
                'rawGeneratedCount': len(raw_mcqs),
                'validCount': len(valid_mcqs),
                'evalCount': res_obj.get('eval_count'),
                'promptEvalCount': res_obj.get('prompt_eval_count')
            }

            return valid_mcqs, telemetry

    except urllib.error.URLError as e:
        elapsed_sec = round(time.time() - t0, 2)
        if isinstance(e.reason, TimeoutError) or 'timed out' in str(e).lower():
            raise TimeoutError(
                f"Local Qwen generation timed out after {active_timeout}s at {OLLAMA_BASE_URL}. "
                "The model might still be processing. Consider reducing batch count."
            )
        raise RuntimeError(f"Local Qwen connection failed at {OLLAMA_BASE_URL}: {e.reason}")
    except Exception as e:
        elapsed_sec = round(time.time() - t0, 2)
        raise RuntimeError(f"Local Qwen generation failed ({elapsed_sec}s): {str(e)}")
