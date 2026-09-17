import os
import json
import time
import re
import urllib.request
import urllib.error
import base64
from typing import Dict, Any, List, Optional, Tuple

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_SERVERLESS = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))
STORAGE_BASE = '/tmp' if IS_SERVERLESS else BASE_DIR
PRIVATE_STORAGE_DIR = os.path.join(STORAGE_BASE, 'private_storage')
SECRETS_FILE = os.path.join(PRIVATE_STORAGE_DIR, 'ai_secrets.json')

# Standard browser User-Agent for providers that enforce Cloudflare browser checks (e.g. Groq)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

# Cooldown and health tracking in memory
_provider_cooldowns: Dict[str, float] = {}
_provider_failures: Dict[str, int] = {}
_provider_latencies: Dict[str, float] = {}

DEFAULT_PROVIDERS = [
    {
        'id': 'gemini_1',
        'name': 'Google Gemini (Account 1 - Primary)',
        'provider': 'gemini',
        'model': 'gemini-3-flash-preview',
        'fallback_model': 'gemini-flash-latest',
        'priority': 1,
        'enabled': True,
        'roles': ['generation', 'validation'],
        'status': 'healthy'
    },
    {
        'id': 'gemini_2',
        'name': 'Google Gemini (Account 2 - Secondary)',
        'provider': 'gemini',
        'model': 'gemini-3-flash-preview',
        'fallback_model': 'gemini-flash-latest',
        'priority': 2,
        'enabled': True,
        'roles': ['generation', 'validation'],
        'status': 'healthy'
    },
    {
        'id': 'openrouter',
        'name': 'OpenRouter (Llama 3.3 70B)',
        'provider': 'openrouter',
        'model': 'meta-llama/llama-3.3-70b-instruct',
        'fallback_model': 'google/gemini-2.0-flash-exp:free',
        'priority': 3,
        'enabled': True,
        'roles': ['generation', 'validation'],
        'status': 'healthy'
    },
    {
        'id': 'groq',
        'name': 'Groq (Qwen 3.8 27B / Llama 3.3 70B)',
        'provider': 'groq',
        'model': 'qwen/qwen3.8-27b',
        'fallback_model': 'llama-3.3-70b-versatile',
        'priority': 4,
        'enabled': True,
        'roles': ['generation', 'validation'],
        'status': 'healthy'
    },
    {
        'id': 'mistral_ocr',
        'name': 'Mistral OCR (Document Intelligence)',
        'provider': 'mistral',
        'model': 'mistral-ocr-latest',
        'fallback_model': 'mistral-ocr-latest',
        'priority': 1,
        'enabled': True,
        'roles': ['ocr'],
        'status': 'healthy'
    }
]

def load_secrets() -> Dict[str, str]:
    """Load API secrets from environment variables or secure private storage."""
    raw = {}
    
    # 1. Environment variables
    env_keys = ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY']
    for env_k in env_keys:
        val = os.environ.get(env_k)
        if val:
            raw[env_k] = val.strip()

    # 2. File-based private storage
    if os.path.exists(SECRETS_FILE):
        try:
            with open(SECRETS_FILE, 'r', encoding='utf-8') as f:
                f_secrets = json.load(f)
                for k, v in f_secrets.items():
                    if k not in raw and v:
                        raw[k] = str(v).strip()
        except Exception as e:
            print(f"[AI_PROVIDER_SECRETS_WARNING] Error reading {SECRETS_FILE}: {e}", flush=True)

    # 3. Check bundled storage if in serverless / fallback
    bundled_secrets = os.path.join(BASE_DIR, 'private_storage', 'ai_secrets.json')
    if os.path.exists(bundled_secrets) and bundled_secrets != SECRETS_FILE:
        try:
            with open(bundled_secrets, 'r', encoding='utf-8') as f:
                f_secrets = json.load(f)
                for k, v in f_secrets.items():
                    if k not in raw and v:
                        raw[k] = str(v).strip()
        except Exception:
            pass

    # Map aliases and canonical provider IDs
    secrets = dict(raw)
    
    mapping = {
        'gemini_1': ['GEMINI_API_KEY_1', 'gemini_1', 'gemini1'],
        'gemini_2': ['GEMINI_API_KEY_2', 'gemini_2', 'gemini2'],
        'mistral': ['MISTRAL_API_KEY', 'mistral', 'mistral_ocr'],
        'mistral_ocr': ['MISTRAL_API_KEY', 'mistral_ocr', 'mistral'],
        'openrouter': ['OPENROUTER_API_KEY', 'openrouter'],
        'groq': ['GROQ_API_KEY', 'groq']
    }
    
    for canon_id, candidates in mapping.items():
        if canon_id not in secrets:
            for cand in candidates:
                if raw.get(cand):
                    secrets[canon_id] = raw[cand]
                    break

    return secrets

def mask_key(key: Optional[str]) -> str:
    """Mask key securely (e.g. AQ••••••••8qvA). Never expose full secret."""
    if not key:
        return 'Not Configured'
    clean = str(key).strip()
    if len(clean) <= 8:
        return '••••••••'
    return f"{clean[:2]}••••••••{clean[-4:]}"

def get_registered_providers(data: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Get providers list merged with user configurations stored in database."""
    base = [dict(p) for p in DEFAULT_PROVIDERS]
    if data and isinstance(data.get('ai_providers'), list):
        overrides = {p['id']: p for p in data['ai_providers'] if isinstance(p, dict) and 'id' in p}
        for bp in base:
            pid = bp['id']
            if pid in overrides:
                for field in ['priority', 'enabled', 'model', 'fallback_model', 'name']:
                    if field in overrides[pid]:
                        bp[field] = overrides[pid][field]
    return sorted(base, key=lambda x: x.get('priority', 99))

def get_sanitized_providers(data: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Return provider configurations safe for frontend display (masked keys, live health)."""
    providers = get_registered_providers(data)
    secrets = load_secrets()
    now = time.time()
    
    result = []
    for p in providers:
        pid = p['id']
        key = secrets.get(pid, '')
        has_key = bool(key and len(key) > 5)
        
        status = 'healthy'
        if not has_key:
            status = 'missing_key'
        elif not p.get('enabled', True):
            status = 'disabled'
        elif pid in _provider_cooldowns and _provider_cooldowns[pid] > now:
            remaining = int(_provider_cooldowns[pid] - now)
            status = f'cooling_down ({remaining}s)'
        elif _provider_failures.get(pid, 0) > 0:
            status = 'degraded'

        p_copy = dict(p)
        p_copy['maskedKey'] = mask_key(key)
        p_copy['hasKey'] = has_key
        p_copy['status'] = status
        p_copy['lastLatencyMs'] = _provider_latencies.get(pid, None)
        result.append(p_copy)
    return result

def mark_provider_failure(provider_id: str, error_msg: str, status_code: Optional[int] = None):
    """Mark a provider failure and apply exponential/circuit cooldown."""
    _provider_failures[provider_id] = _provider_failures.get(provider_id, 0) + 1
    cooldown = 30.0
    if status_code == 429 or '429' in str(error_msg):
        cooldown = 60.0
    elif status_code and 500 <= status_code < 600:
        cooldown = 45.0
    _provider_cooldowns[provider_id] = time.time() + cooldown
    print(f"[AI_GATEWAY_FAIL] Provider '{provider_id}' failed: {error_msg}. Cooling down for {cooldown}s.", flush=True)

def mark_provider_success(provider_id: str, latency_ms: float):
    """Mark a provider call success, reset failures, record latency."""
    _provider_failures[provider_id] = 0
    _provider_latencies[provider_id] = round(latency_ms, 1)
    if provider_id in _provider_cooldowns:
        del _provider_cooldowns[provider_id]

def _call_gemini_api(api_key: str, model: str, prompt: str, system_instruction: Optional[str] = None, json_mode: bool = False, timeout: float = 35.0) -> Tuple[str, float]:
    start = time.time()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    parts = []
    if prompt:
        parts.append({"text": prompt})
    
    contents = [{"role": "user", "parts": parts}]
    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2 if json_mode else 0.4,
            "maxOutputTokens": 4096
        }
    }
    
    if system_instruction:
        payload["system_instruction"] = {
            "parts": [{"text": system_instruction}]
        }
        
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    req_body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_body, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('User-Agent', USER_AGENT)

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        resp_bytes = resp.read()
        resp_json = json.loads(resp_bytes.decode('utf-8'))
        
    latency = (time.time() - start) * 1000.0
    
    try:
        cand = resp_json.get('candidates', [])[0]
        text = cand['content']['parts'][0]['text']
        return text, latency
    except (KeyError, IndexError) as e:
        raise ValueError(f"Malformed Gemini response: {resp_json}")

def _call_openrouter_api(api_key: str, model: str, prompt: str, system_instruction: Optional[str] = None, json_mode: bool = False, timeout: float = 35.0) -> Tuple[str, float]:
    start = time.time()
    url = "https://openrouter.ai/api/v1/chat/completions"
    
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.2 if json_mode else 0.4,
        "max_tokens": 4096
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    req_body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_body, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f"Bearer {api_key}")
    req.add_header('HTTP-Referer', 'https://excellenceca.vercel.app')
    req.add_header('X-Title', 'ExcellenceCA')
    req.add_header('User-Agent', USER_AGENT)

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        resp_bytes = resp.read()
        resp_json = json.loads(resp_bytes.decode('utf-8'))

    latency = (time.time() - start) * 1000.0

    try:
        text = resp_json['choices'][0]['message']['content']
        return text, latency
    except (KeyError, IndexError) as e:
        raise ValueError(f"Malformed OpenRouter response: {resp_json}")

def _call_groq_api(api_key: str, model: str, prompt: str, system_instruction: Optional[str] = None, json_mode: bool = False, timeout: float = 35.0) -> Tuple[str, float]:
    start = time.time()
    url = "https://api.groq.com/openai/v1/chat/completions"
    
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.2 if json_mode else 0.4,
        "max_tokens": 4096
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    req_body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_body, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f"Bearer {api_key}")
    req.add_header('User-Agent', USER_AGENT)

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        resp_bytes = resp.read()
        resp_json = json.loads(resp_bytes.decode('utf-8'))

    latency = (time.time() - start) * 1000.0

    try:
        text = resp_json['choices'][0]['message']['content']
        return text, latency
    except (KeyError, IndexError) as e:
        raise ValueError(f"Malformed Groq response: {resp_json}")

def call_mistral_ocr(pdf_bytes: bytes, filename: str = 'document.pdf', timeout: float = 60.0) -> Dict[str, Any]:
    secrets = load_secrets()
    api_key = secrets.get('mistral_ocr') or secrets.get('mistral')
    if not api_key:
        raise ValueError("Mistral OCR API key not configured.")

    b64_pdf = base64.b64encode(pdf_bytes).decode('utf-8')
    data_uri = f"data:application/pdf;base64,{b64_pdf}"
    
    url = "https://api.mistral.ai/v1/ocr"
    payload = {
        "model": "mistral-ocr-latest",
        "document": {
            "type": "document_url",
            "document_url": data_uri
        }
    }
    
    start = time.time()
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f"Bearer {api_key}")
    req.add_header('User-Agent', USER_AGENT)
    
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_bytes = resp.read()
            resp_json = json.loads(resp_bytes.decode('utf-8'))
        
        latency = (time.time() - start) * 1000.0
        mark_provider_success('mistral_ocr', latency)
        
        pages = []
        for i, p in enumerate(resp_json.get('pages', [])):
            markdown = p.get('markdown', '').strip()
            pages.append({
                'page_number': i + 1,
                'markdown': markdown,
                'images': p.get('images', [])
            })
        
        full_text = "\n\n".join([p['markdown'] for p in pages if p.get('markdown')])
        return {
            'success': True,
            'pages': pages,
            'page_count': len(pages),
            'full_text': full_text,
            'latency_ms': latency,
            'engine': 'mistral-ocr-latest'
        }
    except Exception as e:
        mark_provider_failure('mistral_ocr', str(e))
        print(f"[MISTRAL_OCR_WARNING] Remote OCR call failed ({e}). Attempting local fallback...", flush=True)
        extracted_text = _extract_local_pdf_text(pdf_bytes)
        if extracted_text and len(extracted_text.strip()) > 30:
            return {
                'success': True,
                'pages': [{'page_number': 1, 'markdown': extracted_text, 'images': []}],
                'page_count': 1,
                'full_text': extracted_text,
                'latency_ms': (time.time() - start) * 1000.0,
                'engine': 'local-fallback'
            }
        raise RuntimeError(f"Mistral OCR failed: {str(e)}")

def _extract_local_pdf_text(pdf_bytes: bytes) -> str:
    try:
        import pypdf
        import io
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pages_text = [page.extract_text() or '' for page in reader.pages]
        return "\n\n".join(pages_text)
    except Exception:
        pass
    
    try:
        import zlib
        text_chunks = []
        streams = re.findall(rb'stream[\r\n]+([\s\S]*?)[\r\n]+endstream', pdf_bytes)
        for s in streams:
            try:
                decomp = zlib.decompress(s)
                matches = re.findall(rb'\((.*?)\)\s*Tj', decomp)
                for m in matches:
                    text_chunks.append(m.decode('latin-1', errors='ignore'))
            except Exception:
                pass
        return " ".join(text_chunks)
    except Exception:
        return ""

def call_llm_with_failover(
    purpose: str = 'generation',
    prompt: str = '',
    system_instruction: Optional[str] = None,
    json_mode: bool = True,
    data: Optional[Dict[str, Any]] = None,
    preferred_provider: Optional[str] = None,
    timeout: float = 35.0
) -> Tuple[str, str, str]:
    providers = get_registered_providers(data)
    secrets = load_secrets()
    now = time.time()
    
    candidates = []
    for p in providers:
        pid = p['id']
        if not p.get('enabled', True):
            continue
        if purpose not in p.get('roles', []):
            continue
        key = secrets.get(pid)
        if not key:
            continue
        candidates.append(p)

    if not candidates:
        raise RuntimeError(f"No configured or enabled AI providers available for purpose '{purpose}'. Please configure API keys in Admin Settings.")

    if preferred_provider:
        candidates.sort(key=lambda x: 0 if x['id'] == preferred_provider else x.get('priority', 99))
    else:
        candidates.sort(key=lambda x: x.get('priority', 99))

    errors = []
    
    for prov in candidates:
        pid = prov['id']
        key = secrets.get(pid, '')
        model = prov.get('model', '')
        fallback_model = prov.get('fallback_model', '')
        
        if pid in _provider_cooldowns and _provider_cooldowns[pid] > now and len(candidates) > 1:
            print(f"[AI_FAILOVER_SKIP] Provider '{pid}' in cooldown. Skipping to next candidate.", flush=True)
            continue
            
        print(f"[AI_GATEWAY_TRY] Attempting '{purpose}' via provider '{pid}' (model: {model})...", flush=True)
        
        models_to_try = [model]
        if fallback_model and fallback_model != model:
            models_to_try.append(fallback_model)
            
        for current_model in models_to_try:
            try:
                if prov['provider'] == 'gemini':
                    text, latency = _call_gemini_api(key, current_model, prompt, system_instruction, json_mode, timeout=timeout)
                elif prov['provider'] == 'openrouter':
                    text, latency = _call_openrouter_api(key, current_model, prompt, system_instruction, json_mode, timeout=timeout)
                elif prov['provider'] == 'groq':
                    text, latency = _call_groq_api(key, current_model, prompt, system_instruction, json_mode, timeout=timeout)
                else:
                    raise ValueError(f"Unknown provider engine: {prov['provider']}")

                if not text or not text.strip():
                    raise ValueError("Empty response received from model.")
                    
                if json_mode:
                    clean_text = text.strip()
                    if clean_text.startswith("```"):
                        clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
                        clean_text = re.sub(r"\s*```$", "", clean_text)
                    json.loads(clean_text)
                    text = clean_text

                mark_provider_success(pid, latency)
                print(f"[AI_GATEWAY_SUCCESS] Provider '{pid}' (model: {current_model}) responded in {latency:.1f}ms.", flush=True)
                return text, pid, current_model

            except Exception as e:
                err_str = str(e)
                status_code = getattr(e, 'code', None)
                print(f"[AI_GATEWAY_ERR] Provider '{pid}' with model '{current_model}' failed: {err_str}", flush=True)
                errors.append(f"{pid}({current_model}): {err_str}")
                mark_provider_failure(pid, err_str, status_code)
                continue
                
    raise RuntimeError(f"All AI providers failed for '{purpose}'. Errors: " + " | ".join(errors))

def test_provider_connection(provider_id: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    providers = get_registered_providers(data)
    prov = next((p for p in providers if p['id'] == provider_id), None)
    if not prov:
        return {'success': False, 'error': f"Provider '{provider_id}' not found."}
        
    secrets = load_secrets()
    key = secrets.get(provider_id)
    if not key:
        return {'success': False, 'error': f"API Key for '{provider_id}' is not set."}

    model = prov.get('model', '')
    prompt = "Ping test. Respond with valid JSON: {\"status\": \"ok\", \"message\": \"pong\"}"
    system_instruction = "You are a test agent. Output strictly valid JSON."

    try:
        start = time.time()
        if prov['provider'] == 'gemini':
            text, latency = _call_gemini_api(key, model, prompt, system_instruction, json_mode=True, timeout=12.0)
        elif prov['provider'] == 'openrouter':
            text, latency = _call_openrouter_api(key, model, prompt, system_instruction, json_mode=True, timeout=12.0)
        elif prov['provider'] == 'groq':
            text, latency = _call_groq_api(key, model, prompt, system_instruction, json_mode=True, timeout=12.0)
        elif prov['provider'] == 'mistral':
            sample_pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 700 Td (ExcellenceCA OCR Test) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000216 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n310\n%%EOF\n"
            ocr_res = call_mistral_ocr(sample_pdf, filename='ping_test.pdf', timeout=15.0)
            latency = ocr_res.get('latency_ms', (time.time() - start) * 1000.0)
            mark_provider_success(provider_id, latency)
            return {
                'success': True,
                'latency_ms': round(latency, 1),
                'model': model,
                'message': f"OCR successfully verified ({ocr_res.get('engine')})."
            }
        else:
            return {'success': False, 'error': f"Unknown provider type: {prov['provider']}"}

        mark_provider_success(provider_id, latency)
        return {
            'success': True,
            'latency_ms': round(latency, 1),
            'model': model,
            'raw_response': text[:100]
        }
    except Exception as e:
        mark_provider_failure(provider_id, str(e))
        return {
            'success': False,
            'latency_ms': None,
            'model': model,
            'error': str(e)
        }
