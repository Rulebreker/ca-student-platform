import os
import json
import time
import re
import urllib.request
import urllib.error
import base64
import hashlib
import hmac
import secrets
import random
import threading
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import local_qwen_service

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_SERVERLESS = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))
STORAGE_BASE = '/tmp' if IS_SERVERLESS else BASE_DIR
PRIVATE_STORAGE_DIR = os.path.join(STORAGE_BASE, 'private_storage')
SECRETS_FILE = os.path.join(PRIVATE_STORAGE_DIR, 'ai_secrets.json')

FIREBASE_RTDB_URL = "https://excellenceca-45a9d-default-rtdb.firebaseio.com"

# Standard browser User-Agent for providers that enforce Cloudflare browser checks (e.g. Groq)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

# Cooldown, family, and health tracking in memory
_family_cooldowns: Dict[str, float] = {}

class _CooldownDict(dict):
    def clear(self):
        super().clear()
        _family_cooldowns.clear()

_provider_cooldowns: Dict[str, float] = _CooldownDict()
_provider_failures: Dict[str, Any] = {}
_provider_latencies: Dict[str, float] = {}
_memory_secrets_cache: Dict[str, str] = {}

# Server-side pacing tracking
_last_provider_call_time: Dict[str, float] = {}
_pacing_lock = threading.Lock()

PROVIDER_FAMILIES = {
    'gemini_1': 'gemini_1',
    'gemini_2': 'gemini_2',
    'gemini_3': 'gemini_3',
    'gemini_4': 'gemini_4',
    'gemini_5': 'gemini_5',
    'gemini_6': 'gemini_6',
    'groq': 'groq',
    'openrouter': 'openrouter',
    'mistral_ocr': 'mistral'
}

def get_provider_family(provider_id: str, provider_engine: str = '') -> str:
    if provider_id in PROVIDER_FAMILIES:
        return PROVIDER_FAMILIES[provider_id]
    if provider_engine:
        return provider_engine
    p_lower = str(provider_id).lower()
    if 'gemini' in p_lower:
        return p_lower
    if 'groq' in p_lower:
        return 'groq'
    if 'openrouter' in p_lower:
        return 'openrouter'
    return provider_id

def get_provider_health(provider_id: str, enabled: bool = True) -> str:
    """Return authoritative health state: 'healthy', 'rate_limited', 'temporarily_unavailable', 'cooling_down', 'disabled'."""
    if not enabled:
        return 'disabled'
    now = time.time()
    family = get_provider_family(provider_id)
    if _family_cooldowns.get(family, 0) > now or _provider_cooldowns.get(provider_id, 0) > now:
        f_type = _provider_failures.get(f"{provider_id}_type") or _provider_failures.get(f"{family}_type")
        if f_type == 'rate_limited':
            return 'rate_limited'
        if f_type == 'temporarily_unavailable':
            return 'temporarily_unavailable'
        return 'cooling_down'
    return 'healthy'

def apply_server_side_pacing(provider_id: str, data: Optional[Dict[str, Any]] = None):
    """
    Enforce controlled server-side inter-request delay between consecutive calls to the SAME provider/family.
    Prevents RPM and burst pressure. Does NOT apply when switching to a different provider.
    """
    pacing_cfg = (data.get('ai_pacing_config') if data and isinstance(data, dict) else {}) or {}
    base_delay = float(pacing_cfg.get('min_delay_seconds', 2.0))
    jitter_min = float(pacing_cfg.get('jitter_min_seconds', 0.5))
    jitter_max = float(pacing_cfg.get('jitter_max_seconds', 1.0))
    target_delay = base_delay + random.uniform(jitter_min, jitter_max)

    family = get_provider_family(provider_id)
    pace_key = family
    with _pacing_lock:
        last_time = _last_provider_call_time.get(pace_key, 0)
        now = time.time()
        elapsed = now - last_time
        if last_time > 0 and elapsed < target_delay:
            sleep_time = target_delay - elapsed
            time.sleep(sleep_time)
        _last_provider_call_time[pace_key] = time.time()

class RateLimitError(RuntimeError):
    """Raised when an AI provider returns HTTP 429 or quota exceeded."""
    def __init__(self, provider_id: str, model: str, retry_after: float = 60.0, message: str = ""):
        msg = message or f"Provider '{provider_id}' rate limited (model: {model}). Retry after {retry_after:.1f}s."
        super().__init__(msg)
        self.provider_id = provider_id
        self.model = model
        self.retry_after = retry_after
        self.message = msg

# Vault encryption constants (PBKDF2-HMAC-SHA256 authenticated cipher)
VAULT_SALT = b"ExcellenceCA_AI_Secrets_Vault_Master_Salt_2026"
VAULT_PASSPHRASE = b"ExcellenceCA_AI_Production_HMAC_Secret_Token_v2"

DEFAULT_PROVIDERS = [
    {
        'id': 'local_qwen',
        'name': 'Local Qwen3 8B (Ollama)',
        'provider': 'ollama',
        'model': 'qwen3:8b',
        'fallback_model': 'qwen3:8b',
        'priority': 1,
        'enabled': True,
        'purpose': 'generation',
        'roles': ['generation', 'validation'],
        'status': 'healthy',
        'endpoint': 'http://127.0.0.1:11434',
        'maskedKey': 'LOCAL-DAEMON'
    },
    {
        'id': 'mistral_ocr',
        'name': 'Mistral OCR (Document Intelligence)',
        'provider': 'mistral',
        'model': 'mistral-ocr-latest',
        'fallback_model': 'local-fallback',
        'priority': 2,
        'enabled': True,
        'purpose': 'ocr',
        'roles': ['ocr'],
        'status': 'healthy'
    }
]

# ----------------------------------------------------------------------
# SECURE SERVER-SIDE VAULT ENCRYPTION & CREDENTIAL STORE
# ----------------------------------------------------------------------

def _derive_vault_keys() -> Tuple[bytes, bytes]:
    """Derive 32-byte encryption key and 32-byte MAC key using PBKDF2-HMAC-SHA256."""
    derived = hashlib.pbkdf2_hmac('sha256', VAULT_PASSPHRASE, VAULT_SALT, 10000, dklen=64)
    return derived[:32], derived[32:]

def _encrypt_vault_payload(data_dict: Dict[str, Any]) -> str:
    """Encrypt a dictionary into an authenticated ciphertext string."""
    enc_key, mac_key = _derive_vault_keys()
    plaintext = json.dumps(data_dict).encode('utf-8')
    iv = secrets.token_bytes(16)
    
    # Counter-based stream cipher using SHA-256
    blocks = []
    for counter in range((len(plaintext) + 31) // 32):
        block_key = hashlib.sha256(enc_key + iv + counter.to_bytes(4, 'big')).digest()
        blocks.append(block_key)
    keystream = b"".join(blocks)[:len(plaintext)]
    ciphertext = bytes(p ^ k for p, k in zip(plaintext, keystream))
    
    # Compute HMAC-SHA256 over iv + ciphertext
    tag = hmac.new(mac_key, iv + ciphertext, hashlib.sha256).digest()
    packed = iv + tag + ciphertext
    return base64.b64encode(packed).decode('ascii')

def _decrypt_vault_payload(b64_payload: str) -> Dict[str, Any]:
    """Decrypt an authenticated ciphertext string back into a dictionary."""
    enc_key, mac_key = _derive_vault_keys()
    raw = base64.b64decode(b64_payload.strip())
    if len(raw) < 48:
        raise ValueError("Invalid vault payload length.")
    
    iv = raw[:16]
    tag = raw[16:48]
    ciphertext = raw[48:]
    
    expected_tag = hmac.new(mac_key, iv + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise ValueError("Vault payload HMAC verification failed.")
        
    blocks = []
    for counter in range((len(ciphertext) + 31) // 32):
        block_key = hashlib.sha256(enc_key + iv + counter.to_bytes(4, 'big')).digest()
        blocks.append(block_key)
    keystream = b"".join(blocks)[:len(ciphertext)]
    plaintext = bytes(c ^ k for c, k in zip(ciphertext, keystream))
    return json.loads(plaintext.decode('utf-8'))

def load_secrets() -> Dict[str, str]:
    """
    Load API secrets with priority:
    1. Environment variables
    2. Local file-based storage
    3. In-memory cache
    4. Decrypted Firebase RTDB vault (_server_vault/ai_credentials)
    """
    raw = {}
    
    # 1. Environment variables
    env_keys = [
        'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3',
        'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5', 'GEMINI_API_KEY_6',
        'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY'
    ]
    for env_k in env_keys:
        val = os.environ.get(env_k)
        if val:
            raw[env_k] = val.strip()

    # 2. File-based storage
    if os.path.exists(SECRETS_FILE):
        try:
            with open(SECRETS_FILE, 'r', encoding='utf-8') as f:
                f_secrets = json.load(f)
                for k, v in f_secrets.items():
                    if k not in raw and v:
                        raw[k] = str(v).strip()
        except Exception as e:
            print(f"[AI_SECRETS_WARN] Error reading {SECRETS_FILE}: {e}", flush=True)

    # 3. Check memory cache
    global _memory_secrets_cache
    for k, v in _memory_secrets_cache.items():
        if k not in raw and v:
            raw[k] = str(v).strip()

    # 4. Check encrypted Firebase vault if any primary key is missing
    missing_primary = not (raw.get('GEMINI_API_KEY_1') or raw.get('gemini_1'))
    if missing_primary or not (raw.get('MISTRAL_API_KEY') or raw.get('mistral_ocr')):
        try:
            vault_url = f"{FIREBASE_RTDB_URL}/_server_vault/ai_credentials.json"
            req = urllib.request.Request(vault_url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if isinstance(data, dict) and 'payload' in data:
                    decrypted = _decrypt_vault_payload(data['payload'])
                    _memory_secrets_cache.update(decrypted)
                    for k, v in decrypted.items():
                        if k not in raw and v:
                            raw[k] = str(v).strip()
        except Exception:
            pass

    # Map aliases and canonical provider IDs
    secrets_map = dict(raw)
    mapping = {
        'gemini_1': ['GEMINI_API_KEY_1', 'gemini_1', 'gemini1'],
        'gemini_2': ['GEMINI_API_KEY_2', 'gemini_2', 'gemini2'],
        'gemini_3': ['GEMINI_API_KEY_3', 'gemini_3', 'gemini3'],
        'gemini_4': ['GEMINI_API_KEY_4', 'gemini_4', 'gemini4'],
        'gemini_5': ['GEMINI_API_KEY_5', 'gemini_5', 'gemini5'],
        'gemini_6': ['GEMINI_API_KEY_6', 'gemini_6', 'gemini6'],
        'mistral': ['MISTRAL_API_KEY', 'mistral', 'mistral_ocr'],
        'mistral_ocr': ['MISTRAL_API_KEY', 'mistral_ocr', 'mistral'],
        'openrouter': ['OPENROUTER_API_KEY', 'openrouter'],
        'groq': ['GROQ_API_KEY', 'groq']
    }
    
    for canon_id, candidates in mapping.items():
        if canon_id not in secrets_map:
            for cand in candidates:
                if raw.get(cand):
                    secrets_map[canon_id] = raw[cand]
                    break

    return secrets_map

def save_provider_credential(provider_id: str, api_key: str, sync_firebase: bool = True):
    """
    Save provider credential securely:
    - Update local private storage
    - Update in-memory cache
    - Sync encrypted payload to Firebase RTDB server vault
    """
    clean_key = str(api_key).strip() if api_key else ''
    if not clean_key:
        return

    secrets_dict = load_secrets()
    secrets_dict[provider_id] = clean_key

    mapping = {
        'gemini_1': ['GEMINI_API_KEY_1'],
        'gemini_2': ['GEMINI_API_KEY_2'],
        'gemini_3': ['GEMINI_API_KEY_3'],
        'gemini_4': ['GEMINI_API_KEY_4'],
        'gemini_5': ['GEMINI_API_KEY_5'],
        'gemini_6': ['GEMINI_API_KEY_6'],
        'mistral_ocr': ['MISTRAL_API_KEY'],
        'mistral': ['MISTRAL_API_KEY'],
        'openrouter': ['OPENROUTER_API_KEY'],
        'groq': ['GROQ_API_KEY']
    }
    for canon, candidates in mapping.items():
        if provider_id == canon or provider_id in candidates:
            secrets_dict[canon] = clean_key
            for c in candidates:
                secrets_dict[c] = clean_key

    # Update in-memory cache
    global _memory_secrets_cache
    _memory_secrets_cache.update(secrets_dict)

    # Save to local file
    try:
        os.makedirs(os.path.dirname(SECRETS_FILE), exist_ok=True)
        with open(SECRETS_FILE, 'w', encoding='utf-8') as f:
            json.dump(secrets_dict, f, indent=2)
    except Exception as e:
        print(f"[AI_SECRETS_SAVE_WARN] Could not write to {SECRETS_FILE}: {e}")

    # Sync encrypted to Firebase RTDB
    if sync_firebase:
        try:
            encrypted_b64 = _encrypt_vault_payload(secrets_dict)
            vault_url = f"{FIREBASE_RTDB_URL}/_server_vault/ai_credentials.json"
            payload = {
                'payload': encrypted_b64,
                'updatedAt': datetime.now(timezone.utc).isoformat()
            }
            body = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(vault_url, data=body, method='PUT')
            req.add_header('Content-Type', 'application/json')
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                pass
            print(f"[AI_VAULT_SYNC] Successfully persisted encrypted credentials to Firebase vault.", flush=True)
        except Exception as e:
            print(f"[AI_VAULT_SYNC_WARN] Failed to sync encrypted vault to Firebase: {e}", flush=True)

def mask_key(key: Optional[str]) -> str:
    """Mask key securely according to specification: ••••••••••••8F3A. Never expose full secret."""
    if not key:
        return 'Not Configured'
    clean = str(key).strip()
    if len(clean) < 4:
        return '••••••••'
    return f"••••••••••••{clean[-4:]}"

# ----------------------------------------------------------------------
# PROVIDER CONFIGURATION & CRUD
# ----------------------------------------------------------------------

def _map_purpose_to_roles(purpose: str) -> List[str]:
    p = str(purpose or '').strip().lower()
    if p in ('ocr', 'pdf/ocr', 'pdf_ocr'):
        return ['ocr']
    elif p in ('validation', 'mcq_validation', 'mcq validation'):
        return ['validation']
    elif p in ('generation', 'mcq_generation', 'mcq generation'):
        return ['generation']
    else:
        return ['generation', 'validation']

def get_registered_providers(data: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Get providers list merged with user configurations stored in database."""
    base = [dict(p) for p in DEFAULT_PROVIDERS]
    if data and isinstance(data.get('ai_providers'), list):
        custom_or_modified = data['ai_providers']
        merged_map = {bp['id']: dict(bp) for bp in base}
        
        for p in custom_or_modified:
            if isinstance(p, dict) and p.get('id'):
                pid = p['id']
                if pid in merged_map:
                    merged_map[pid].update(p)
                else:
                    merged_map[pid] = dict(p)

        # Architectural guarantee: Groq and OpenRouter are strictly excluded from generation role
        for p in merged_map.values():
            if p.get('provider') in ('groq', 'openrouter') or p.get('id') in ('groq', 'openrouter'):
                if 'generation' in p.get('roles', []):
                    p['roles'] = [r for r in p['roles'] if r != 'generation']
                if p.get('purpose') in ('generation', 'generation_validation'):
                    p['purpose'] = 'validation'
            if p.get('provider') == 'groq' or p.get('id') == 'groq':
                if p.get('priority', 0) < 9:
                    p['priority'] = 9

        def _prov_sort(prov_dict):
            is_groq = (prov_dict.get('provider') == 'groq' or prov_dict.get('id') == 'groq')
            return (1 if is_groq else 0, prov_dict.get('priority', 99))

        return sorted(list(merged_map.values()), key=_prov_sort)

    def _base_sort(prov_dict):
        is_groq = (prov_dict.get('provider') == 'groq' or prov_dict.get('id') == 'groq')
        return (1 if is_groq else 0, prov_dict.get('priority', 99))

    return sorted(base, key=_base_sort)

def get_sanitized_providers(data: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Return provider configurations safe for frontend display (masked keys, real health)."""
    providers = get_registered_providers(data)
    secrets_map = load_secrets()
    now = time.time()
    
    result = []
    for p in providers:
        pid = p['id']
        if p.get('provider') == 'ollama' or pid == 'local_qwen':
            is_online, health_info = local_qwen_service.check_ollama_health(timeout=2.0)
            p_copy = dict(p)
            p_copy['maskedKey'] = 'LOCAL-DAEMON'
            p_copy['hasKey'] = True
            p_copy['status'] = 'Configured — Healthy' if is_online else 'Configured — Connection Failed'
            p_copy['online'] = is_online
            p_copy['lastLatencyMs'] = health_info.get('latencyMs')
            p_copy['error'] = health_info.get('error')
            result.append(p_copy)
            continue

        key = secrets_map.get(pid, '')
        has_key = bool(key and len(key) > 5)
        
        status = 'Configured — Healthy'
        if not has_key:
            status = 'Not Configured'
        elif not p.get('enabled', True):
            status = 'Disabled'
        elif pid in _provider_cooldowns and _provider_cooldowns[pid] > now:
            remaining = int(_provider_cooldowns[pid] - now)
            status = f'Configured — Cooling Down ({remaining}s)'
        elif _provider_failures.get(pid, 0) > 0:
            status = 'Configured — Connection Failed'

        p_copy = dict(p)
        p_copy['maskedKey'] = mask_key(key)
        p_copy['hasKey'] = has_key
        p_copy['status'] = status
        p_copy['lastLatencyMs'] = _provider_latencies.get(pid, None)
        result.append(p_copy)
    return result

def add_provider(data: Dict[str, Any], provider_payload: Dict[str, Any], api_key: Optional[str] = None) -> Dict[str, Any]:
    providers = get_registered_providers(data)
    pid = provider_payload.get('id') or f"custom_{int(time.time()*1000)}"
    name = provider_payload.get('name') or 'Custom AI Provider'
    prov_type = provider_payload.get('provider') or 'openrouter'
    model = provider_payload.get('model') or 'custom-model'
    purpose = provider_payload.get('purpose') or 'generation_validation'
    priority = int(provider_payload.get('priority', len(providers) + 1))
    enabled = bool(provider_payload.get('enabled', True))

    new_prov = {
        'id': pid,
        'name': name,
        'provider': prov_type,
        'model': model,
        'fallback_model': provider_payload.get('fallback_model', ''),
        'priority': priority,
        'enabled': enabled,
        'purpose': purpose,
        'roles': _map_purpose_to_roles(purpose),
        'status': 'healthy'
    }

    # Filter out duplicate ID if exists
    updated = [p for p in providers if p['id'] != pid]
    updated.append(new_prov)
    data['ai_providers'] = sorted(updated, key=lambda x: x.get('priority', 99))

    if api_key and api_key.strip():
        save_provider_credential(pid, api_key.strip())

    return new_prov

def update_provider(data: Dict[str, Any], provider_id: str, updates: Dict[str, Any], api_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
    providers = get_registered_providers(data)
    target = next((p for p in providers if p['id'] == provider_id), None)
    if not target:
        return None

    for f in ['name', 'model', 'fallback_model', 'priority', 'enabled', 'purpose', 'provider']:
        if f in updates:
            target[f] = updates[f]

    if 'purpose' in updates:
        target['roles'] = _map_purpose_to_roles(updates['purpose'])

    if 'priority' in target:
        target['priority'] = int(target['priority'])

    data['ai_providers'] = sorted(providers, key=lambda x: x.get('priority', 99))

    if api_key and api_key.strip() and not api_key.strip().startswith('••••'):
        save_provider_credential(provider_id, api_key.strip())

    return target

def delete_provider(data: Dict[str, Any], provider_id: str) -> bool:
    providers = get_registered_providers(data)
    filtered = [p for p in providers if p['id'] != provider_id]
    if len(filtered) < len(providers):
        data['ai_providers'] = filtered
        return True
    return False

def mark_provider_failure(provider_id: str, error_msg: str, status_code: Optional[int] = None, retry_after: Optional[float] = None):
    """Mark a provider failure and apply exponential/family circuit cooldown."""
    _provider_failures[provider_id] = _provider_failures.get(provider_id, 0) + 1
    now = time.time()
    family = get_provider_family(provider_id)

    is_429 = (status_code == 429 or '429' in str(error_msg) or 'RESOURCE_EXHAUSTED' in str(error_msg) or 'quota' in str(error_msg).lower())
    if is_429:
        cooldown = max(float(retry_after or 60.0), 30.0)
        _provider_failures[f"{provider_id}_type"] = 'rate_limited'
        _provider_failures[f"{family}_type"] = 'rate_limited'
        _provider_cooldowns[provider_id] = now + cooldown
        _family_cooldowns[family] = now + cooldown

        # Apply family-level cooldown to all sister providers in the same family (e.g. gemini_1 & gemini_2)
        for pid, fam in PROVIDER_FAMILIES.items():
            if fam == family:
                _provider_cooldowns[pid] = now + cooldown
        print(f"[COOLDOWN_STARTED] provider={provider_id} family={family} duration={cooldown:.1f}s error={error_msg}", flush=True)
        print(f"[429 RATE LIMITED] Provider '{provider_id}' family '{family}' quota exhausted: {error_msg}. Cooling down for {cooldown:.1f}s.", flush=True)
        return

    is_5xx = (status_code and 500 <= status_code < 600) or any(code in str(error_msg) for code in ['500', '502', '503', '504', 'timed out', 'timeout'])
    if is_5xx:
        cooldown = 45.0
        _provider_failures[f"{provider_id}_type"] = 'temporarily_unavailable'
        _provider_failures[f"{family}_type"] = 'temporarily_unavailable'
        _provider_cooldowns[provider_id] = now + cooldown
        _family_cooldowns[family] = now + cooldown
        for pid, fam in PROVIDER_FAMILIES.items():
            if fam == family:
                _provider_cooldowns[pid] = now + cooldown
        print(f"[COOLDOWN_STARTED] provider={provider_id} family={family} duration={cooldown:.1f}s error={error_msg}", flush=True)
        print(f"[AI_GATEWAY_FAIL] Provider '{provider_id}' 5xx error: {error_msg}. Cooling down for {cooldown:.1f}s.", flush=True)
        return

    cooldown = 30.0
    _provider_cooldowns[provider_id] = now + cooldown
    print(f"[AI_GATEWAY_FAIL] Provider '{provider_id}' failed: {error_msg}. Cooling down for {cooldown:.1f}s.", flush=True)

def mark_provider_success(provider_id: str, latency_ms: float):
    """Mark a provider call success, reset failures, record latency."""
    _provider_failures[provider_id] = 0
    _provider_failures.pop(f"{provider_id}_type", None)
    _provider_latencies[provider_id] = round(latency_ms, 1)
    if provider_id in _provider_cooldowns:
        del _provider_cooldowns[provider_id]
    family = get_provider_family(provider_id)
    if family in _family_cooldowns:
        del _family_cooldowns[family]

def get_earliest_gemini_cooldown_remaining() -> float:
    """Return the minimum seconds remaining until at least one configured Gemini key finishes cooldown."""
    now = time.time()
    gemini_pids = ['gemini_1', 'gemini_2', 'gemini_3', 'gemini_4', 'gemini_5', 'gemini_6']
    secrets_map = load_secrets()
    active_gemini = [p for p in gemini_pids if secrets_map.get(p)]
    if not active_gemini:
        return 0.0

    remaining_times = []
    for pid in active_gemini:
        cd = _provider_cooldowns.get(pid, 0)
        fam = get_provider_family(pid)
        f_cd = _family_cooldowns.get(fam, 0)
        eff_cd = max(cd, f_cd)
        if eff_cd <= now:
            return 0.0  # At least one Gemini key is healthy and available right now
        remaining_times.append(eff_cd - now)

    return min(remaining_times) if remaining_times else 0.0

# ----------------------------------------------------------------------
# DIRECT HTTP PROVIDER CLIENTS
# ----------------------------------------------------------------------

def _call_gemini_api(api_key: str, model: str, prompt: str, system_instruction: Optional[str] = None, json_mode: bool = False, timeout: float = 12.0, temperature: Optional[float] = None) -> Tuple[str, float]:
    start = time.time()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    parts = []
    if prompt:
        parts.append({"text": prompt})
    
    contents = [{"role": "user", "parts": parts}]
    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature if temperature is not None else (0.2 if json_mode else 0.4),
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

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_bytes = resp.read()
            resp_json = json.loads(resp_bytes.decode('utf-8'))
    except urllib.error.HTTPError as e:
        raw_err = ""
        try:
            raw_err = e.read().decode('utf-8')
        except Exception:
            pass
        if e.code == 429 or 'RESOURCE_EXHAUSTED' in raw_err or 'Quota exceeded' in raw_err:
            retry_delay = 60.0
            retry_header = e.headers.get('Retry-After') if e.headers else None
            if retry_header:
                try:
                    retry_delay = max(float(retry_header), 5.0)
                except ValueError:
                    pass
            if raw_err:
                m = re.search(r'retry in\s+([\d\.]+)\s*s', raw_err, re.IGNORECASE)
                if m:
                    try:
                        retry_delay = max(float(m.group(1)), 5.0)
                    except ValueError:
                        pass
                m_delay = re.search(r'"retryDelay":\s*"(\d+)s"', raw_err)
                if m_delay:
                    try:
                        retry_delay = max(float(m_delay.group(1)), 5.0)
                    except ValueError:
                        pass
            raise RateLimitError(
                provider_id='gemini',
                model=model,
                retry_after=retry_delay,
                message=f"Gemini 429 RESOURCE_EXHAUSTED for model {model}. Quota exceeded. Retry in {retry_delay:.1f}s."
            )
        raise
        
    latency = (time.time() - start) * 1000.0
    
    try:
        cand = resp_json.get('candidates', [])[0]
        text = cand['content']['parts'][0]['text']
        return text, latency
    except (KeyError, IndexError) as e:
        raise ValueError(f"Malformed Gemini response: {resp_json}")

def _call_openrouter_api(api_key: str, model: str, prompt: str, system_instruction: Optional[str] = None, json_mode: bool = False, timeout: float = 18.0, temperature: Optional[float] = None) -> Tuple[str, float]:
    start = time.time()
    url = "https://openrouter.ai/api/v1/chat/completions"
    
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature if temperature is not None else (0.2 if json_mode else 0.4),
        "max_tokens": 4096
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    req_body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_body, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f"Bearer {api_key}")
    req.add_header('HTTP-Referer', "https://excellenceca.vercel.app")
    req.add_header('X-Title', "ExcellenceCA Automated AI MCQ Studio")
    req.add_header('User-Agent', USER_AGENT)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_bytes = resp.read()
            resp_json = json.loads(resp_bytes.decode('utf-8'))
    except urllib.error.HTTPError as e:
        raw_err = ""
        try:
            raw_err = e.read().decode('utf-8')
        except Exception:
            pass
        if e.code == 429 or 'rate_limit' in raw_err.lower() or 'quota' in raw_err.lower():
            retry_delay = 60.0
            retry_header = e.headers.get('Retry-After') if e.headers else None
            if retry_header:
                try:
                    retry_delay = max(float(retry_header), 5.0)
                except ValueError:
                    pass
            raise RateLimitError(
                provider_id='openrouter',
                model=model,
                retry_after=retry_delay,
                message=f"OpenRouter 429 Rate Limit for model {model}. Retry in {retry_delay:.1f}s."
            )
        raise
        
    latency = (time.time() - start) * 1000.0
    
    try:
        text = resp_json['choices'][0]['message']['content']
        return text, latency
    except (KeyError, IndexError) as e:
        raise ValueError(f"Malformed OpenRouter response: {resp_json}")

def _call_groq_api(api_key: str, model: str, prompt: str, system_instruction: Optional[str] = None, json_mode: bool = False, timeout: float = 18.0, temperature: Optional[float] = None) -> Tuple[str, float]:
    start = time.time()
    url = "https://api.groq.com/openai/v1/chat/completions"
    
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature if temperature is not None else (0.2 if json_mode else 0.4),
        "max_tokens": 4096
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    req_body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_body, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f"Bearer {api_key}")
    req.add_header('User-Agent', USER_AGENT)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_bytes = resp.read()
            resp_json = json.loads(resp_bytes.decode('utf-8'))
    except urllib.error.HTTPError as e:
        raw_err = ""
        try:
            raw_err = e.read().decode('utf-8')
        except Exception:
            pass
        if e.code == 429 or 'rate_limit' in raw_err.lower() or 'quota' in raw_err.lower():
            retry_delay = 60.0
            retry_header = e.headers.get('Retry-After') if e.headers else None
            if retry_header:
                try:
                    retry_delay = max(float(retry_header), 5.0)
                except ValueError:
                    pass
            raise RateLimitError(
                provider_id='groq',
                model=model,
                retry_after=retry_delay,
                message=f"Groq 429 Rate Limit for model {model}. Retry in {retry_delay:.1f}s."
            )
        raise
        
    latency = (time.time() - start) * 1000.0
    
    try:
        text = resp_json['choices'][0]['message']['content']
        return text, latency
    except (KeyError, IndexError) as e:
        raise ValueError(f"Malformed Groq response: {resp_json}")

def call_mistral_ocr(pdf_bytes: bytes, filename: str = 'document.pdf', timeout: float = 60.0) -> Dict[str, Any]:
    secrets_map = load_secrets()
    api_key = secrets_map.get('mistral_ocr') or secrets_map.get('mistral')
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

# ----------------------------------------------------------------------
# FAILOVER GATEWAY
# ----------------------------------------------------------------------

def call_llm_with_failover(
    purpose: str = 'generation',
    prompt: str = '',
    system_instruction: Optional[str] = None,
    json_mode: bool = True,
    data: Optional[Dict[str, Any]] = None,
    preferred_provider: Optional[str] = None,
    timeout: float = 12.0,
    on_provider_event: Optional[Any] = None,
    temperature: Optional[float] = None,
    job_id: Optional[str] = None,
    question_number: Optional[int] = None,
    attempt: Optional[int] = None
) -> Tuple[str, str, str]:
    # Authoritative Local Qwen delegation for MCQ generation and validation
    is_online, health_info = local_qwen_service.check_ollama_health(timeout=2.0)
    if is_online or preferred_provider == 'local_qwen':
        if not is_online:
            raise RuntimeError(f"Local AI is offline. Ollama is not reachable at {local_qwen_service.OLLAMA_BASE_URL}.")
        payload = {
            "model": local_qwen_service.OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system_instruction or local_qwen_service.DEFAULT_SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            "stream": False,
            "format": "json" if json_mode else None,
            "think": False,
            "options": {"temperature": temperature if temperature is not None else 0.6}
        }
        url = f"{local_qwen_service.OLLAMA_BASE_URL}/api/chat"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=max(timeout, 60.0)) as resp:
                data_resp = json.loads(resp.read().decode('utf-8'))
                text = data_resp.get('message', {}).get('content', '')
                return text, 'local_qwen', 'qwen3:8b'
        except Exception as q_err:
            print(f"[LOCAL_QWEN_GATEWAY_ERROR] {q_err}", flush=True)
            raise RuntimeError(f"Local Qwen generation failed: {q_err}")

    providers = get_registered_providers(data)
    secrets_map = load_secrets()
    now = time.time()
    gateway_start = now
    GATEWAY_MAX_TOTAL_TIMEOUT = 45.0
    
    candidates = []
    for p in providers:
        pid = p['id']
        if not p.get('enabled', True):
            continue
        if purpose not in p.get('roles', []):
            continue
        if purpose == 'generation' and (p.get('provider') != 'gemini' or pid.startswith('groq') or pid.startswith('openrouter')):
            continue  # HARD ENFORCEMENT: Gemini only for generation (zero Groq / zero OpenRouter)
        key = secrets_map.get(pid)
        if not key:
            continue
        candidates.append(p)

    if not candidates:
        raise RuntimeError(f"No configured or enabled AI providers available for purpose '{purpose}'. Please configure API keys in Admin Settings.")

    # Canonical priority: Preferred provider -> Gemini keys by priority (1 to 6) -> OpenRouter -> Groq strictly LAST
    def _sort_key(prov):
        if preferred_provider and prov['id'] == preferred_provider:
            return (-1, 0)
        p_id = prov['id']
        family = get_provider_family(p_id, prov.get('provider', ''))
        is_groq = (family == 'groq' or prov.get('provider') == 'groq' or p_id == 'groq')
        family_rank = 99 if is_groq else (0 if 'gemini' in family else ({'openrouter': 1, 'mistral': 2}.get(family, 10)))
        prov_priority = 999 if is_groq else prov.get('priority', 50)
        return (family_rank, prov_priority)

    candidates.sort(key=_sort_key)

    errors = []
    
    for prov_idx, prov in enumerate(candidates):
        if time.time() - gateway_start > GATEWAY_MAX_TOTAL_TIMEOUT:
            print(f"[AI_GATEWAY_TIMEOUT] Total failover time exceeded {GATEWAY_MAX_TOTAL_TIMEOUT}s.", flush=True)
            break

        pid = prov['id']
        key = secrets_map.get(pid, '')
        model = prov.get('model', '')
        fallback_model = prov.get('fallback_model', '')
        family = get_provider_family(pid, prov.get('provider', ''))
        
        now = time.time()
        # Health-aware skip: Check both individual provider cooldown AND family-level cooldown
        if (_provider_cooldowns.get(pid, 0) > now or _family_cooldowns.get(family, 0) > now) and len(candidates) > 1:
            remaining = max(_provider_cooldowns.get(pid, 0) - now, _family_cooldowns.get(family, 0) - now)
            print(f"[PROVIDER_SKIPPED] provider={pid} family={family} reason=cooling_down remaining={remaining:.1f}s", flush=True)
            print(f"[AI_FAILOVER_SKIP] Provider '{pid}' (family: {family}) in cooldown ({remaining:.1f}s remaining). Skipping to next candidate.", flush=True)
            continue
            
        print(f"[AI_GATEWAY_TRY] Attempting '{purpose}' via provider '{pid}' (family: {family}, model: {model})...", flush=True)
        
        models_to_try = [model]
        if fallback_model and fallback_model != model:
            models_to_try.append(fallback_model)
            
        provider_rate_limited = False
        provider_succeeded = False

        for current_model in models_to_try:
            if time.time() - gateway_start > GATEWAY_MAX_TOTAL_TIMEOUT or provider_succeeded:
                break

            # Transient retry loop (max 1 retry for transient 5xx, network timeout, or connection resets)
            max_transient_retries = 1
            for transient_attempt in range(max_transient_retries + 1):
                if time.time() - gateway_start > GATEWAY_MAX_TOTAL_TIMEOUT:
                    break

                try:
                    # Enforce server-side API pacing between calls to the same provider/family
                    apply_server_side_pacing(pid, data)

                    print(f"[API_CALL_STARTED] batchId={job_id or 'none'} questionNumber={question_number or 0} attempt={attempt or 1} provider={pid} model={current_model} providerFamily={family}", flush=True)
                    print(f"[AI REQUEST START] purpose={purpose} provider={pid} model={current_model}", flush=True)
                    if on_provider_event:
                        try:
                            on_provider_event('ai_call_start', pid, current_model, purpose)
                        except Exception:
                            pass

                    if prov['provider'] == 'gemini':
                        text, latency = _call_gemini_api(key, current_model, prompt, system_instruction, json_mode, timeout=timeout, temperature=temperature)
                    elif prov['provider'] == 'openrouter':
                        text, latency = _call_openrouter_api(key, current_model, prompt, system_instruction, json_mode, timeout=timeout, temperature=temperature)
                    elif prov['provider'] == 'groq':
                        text, latency = _call_groq_api(key, current_model, prompt, system_instruction, json_mode, timeout=timeout, temperature=temperature)
                    else:
                        raise ValueError(f"Unknown provider engine: {prov['provider']}")

                    mark_provider_success(pid, latency)
                    print(f"[API_CALL_COMPLETED] batchId={job_id or 'none'} questionNumber={question_number or 0} attempt={attempt or 1} provider={pid} model={current_model} duration={latency:.1f}ms httpStatus=200", flush=True)
                    print(f"[AI RESPONSE RECEIVED] purpose={purpose} provider={pid} model={current_model} duration={latency:.1f}ms", flush=True)
                    print(f"[AI_GATEWAY_SUCCESS] Provider '{pid}' (model: {current_model}) responded in {latency:.1f}ms.", flush=True)
                    provider_succeeded = True
                    return text, pid, current_model

                except RateLimitError as rle:
                    err_str = str(rle)
                    mark_provider_failure(pid, err_str, status_code=429, retry_after=rle.retry_after)
                    errors.append(f"[{pid}/{current_model}]: {err_str}")
                    print(f"[RATE_LIMITED] batchId={job_id or 'none'} questionNumber={question_number or 0} provider={pid} model={current_model} retryAfter={rle.retry_after:.1f}s", flush=True)
                    print(f"[429 RATE LIMITED] Provider '{pid}' model '{current_model}' quota exhausted. Retry after {rle.retry_after:.1f}s. Breaking to next candidate provider...", flush=True)
                    if on_provider_event:
                        try:
                            on_provider_event('rate_limited', pid, current_model, rle.retry_after)
                        except Exception:
                            pass
                    provider_rate_limited = True
                    # Critical: Break immediately on 429 without retrying models on exhausted key
                    break

                except Exception as e:
                    err_str = str(e)
                    status_code = getattr(e, 'code', None)
                    is_timeout = any(code in err_str.lower() for code in ['timed out', 'timeout', 'timeouterror'])
                    if is_timeout:
                        mark_provider_failure(pid, f"Timeout after {timeout:.1f}s", status_code=504)
                        errors.append(f"[{pid}/{current_model}]: Timeout after {timeout:.1f}s")
                        print(f"[TIMEOUT_ROTATE] Provider '{pid}' timed out after {timeout:.1f}s. Marking cooldown and rotating to next Gemini key immediately.", flush=True)
                        break

                    is_transient = (
                        (status_code and 500 <= status_code < 600) or
                        any(code in err_str for code in ['500', '502', '503', 'ConnectionResetError', 'RemoteDisconnected'])
                    )
                    if is_transient and transient_attempt < max_transient_retries:
                        backoff = 1.0 + random.uniform(0.2, 0.5)
                        print(f"[TRANSIENT_RETRY] provider={pid} model={current_model} error={err_str}. Retrying in {backoff:.2f}s...", flush=True)
                        time.sleep(backoff)
                        continue

                    mark_provider_failure(pid, err_str, status_code)
                    errors.append(f"[{pid}/{current_model}]: {err_str}")
                    print(f"[AI_GATEWAY_RETRY] Failed {pid}/{current_model}: {err_str}. Cascading to fallback...", flush=True)
                    break

            if provider_rate_limited or pid in _provider_cooldowns or _family_cooldowns.get(family, 0) > time.time():
                break

        if provider_rate_limited or not provider_succeeded:
            # Check if there is a next provider to fallback to
            next_candidates = [
                c for c in candidates[prov_idx + 1:] 
                if _provider_cooldowns.get(c['id'], 0) <= time.time() and _family_cooldowns.get(get_provider_family(c['id']), 0) <= time.time()
            ]
            if next_candidates:
                next_prov = next_candidates[0]
                print(f"[FALLBACK_SELECTED] fromProvider={pid} toProvider={next_prov['id']} toModel={next_prov.get('model')}", flush=True)
                print(f"[FALLBACK PROVIDER] Provider '{pid}' was rate limited or failed. Immediately switching to fallback provider '{next_prov['id']}' ({next_prov.get('model')}).", flush=True)
                if on_provider_event:
                    try:
                        on_provider_event('fallback', next_prov['id'], next_prov.get('model'), None)
                    except Exception:
                        pass
                
    raise RuntimeError(f"All AI providers failed for '{purpose}'. Errors: " + " | ".join(errors))

# ----------------------------------------------------------------------
# TEST PROVIDER LIVE CONNECTION
# ----------------------------------------------------------------------

def test_provider_connection(provider_id: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Test live provider connection by sending a real minimal test request.
    Never claims 'Healthy' unless an actual provider request succeeds.
    """
    providers = get_registered_providers(data)
    prov = next((p for p in providers if p['id'] == provider_id), None)
    if not prov:
        return {'success': False, 'error': f"Provider '{provider_id}' not found in registry."}

    if prov.get('provider') == 'ollama' or provider_id == 'local_qwen':
        is_online, health_info = local_qwen_service.check_ollama_health(timeout=5.0)
        if is_online:
            lat = health_info.get('latencyMs', 50.0)
            mark_provider_success('local_qwen', lat)
            return {
                'success': True,
                'latency_ms': lat,
                'model': 'qwen3:8b',
                'status': 'Configured — Healthy',
                'message': 'Local Ollama Qwen3 8B daemon is online and responsive.'
            }
        else:
            mark_provider_failure('local_qwen', health_info.get('error', 'Unreachable'))
            return {
                'success': False,
                'latency_ms': None,
                'model': 'qwen3:8b',
                'status': 'Configured — Connection Failed',
                'error': 'Local AI is offline. Start Ollama on the generation machine and try again.'
            }

    secrets_map = load_secrets()
    key = secrets_map.get(provider_id)
    if not key:
        return {
            'success': False, 
            'error': f"API Key for '{prov.get('name')}' is not configured. Please add an API key in Provider Settings.",
            'status': 'Not Configured'
        }

    model = prov.get('model', '')
    prompt = "Ping test. Respond with valid JSON: {\"status\": \"ok\", \"message\": \"pong\"}"
    system_instruction = "You are a test agent. Output strictly valid JSON."

    try:
        start = time.time()
        if prov['provider'] == 'gemini':
            text, latency = _call_gemini_api(key, model, prompt, system_instruction, json_mode=True, timeout=15.0)
        elif prov['provider'] == 'openrouter':
            text, latency = _call_openrouter_api(key, model, prompt, system_instruction, json_mode=True, timeout=15.0)
        elif prov['provider'] == 'groq':
            text, latency = _call_groq_api(key, model, prompt, system_instruction, json_mode=True, timeout=15.0)
        elif prov['provider'] == 'mistral':
            sample_pdf = b"%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>endobj\n4 0 obj<< /Length 36 >>stream\nBT /F1 12 Tf 50 700 Td (Ping) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000216 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n302\n%%EOF\n"
            ocr_res = call_mistral_ocr(sample_pdf, filename='ping_test.pdf', timeout=20.0)
            latency = ocr_res.get('latency_ms', (time.time() - start) * 1000.0)
            mark_provider_success(provider_id, latency)
            return {
                'success': True,
                'latency_ms': round(latency, 1),
                'model': model,
                'status': 'Configured — Healthy',
                'message': f"OCR verified successfully ({ocr_res.get('engine')})."
            }
        else:
            return {'success': False, 'error': f"Unknown provider type: {prov['provider']}"}

        mark_provider_success(provider_id, latency)
        return {
            'success': True,
            'latency_ms': round(latency, 1),
            'model': model,
            'status': 'Configured — Healthy',
            'raw_response': text[:100]
        }
    except Exception as e:
        mark_provider_failure(provider_id, str(e))
        return {
            'success': False,
            'latency_ms': None,
            'model': model,
            'status': 'Configured — Connection Failed',
            'error': str(e)
        }
