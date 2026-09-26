"""
ai_provider_manager.py
======================
Status and connection testing for the ONLY MCQ generation engine:
Local Qwen3 8B via Ollama, reached through the outbound Local Qwen Worker.

The former cloud providers (Gemini, Groq, OpenRouter, Mistral) together with their
API-key vault, rotation, cooldowns and failover gateway have been removed.

Production (serverless) never contacts Ollama: health comes exclusively from the worker
heartbeat. A local development server may additionally probe its own Ollama daemon.
"""

import os
from typing import Any, Dict, List, Optional

import local_qwen_service

IS_SERVERLESS = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))

LOCAL_QWEN_PROVIDER = {
    'id': 'local_qwen',
    'name': 'Local Qwen3 8B (Ollama)',
    'provider': 'ollama',
    'model': 'qwen3:8b',
    'roles': ['generation', 'validation'],
    'enabled': True,
    'priority': 1
}
DEFAULT_PROVIDERS = [dict(LOCAL_QWEN_PROVIDER)]


def _worker_status(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    import ai_job_manager  # local import: ai_job_manager is heavier and imported lazily
    return ai_job_manager.get_worker_status(data)


def get_registered_providers(data: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    return [dict(LOCAL_QWEN_PROVIDER)]


def get_sanitized_providers(data: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """The single Local Qwen provider card, annotated with live worker status."""
    worker = _worker_status(data)
    card = dict(LOCAL_QWEN_PROVIDER)
    card['model'] = worker.get('model') or card['model']
    card['online'] = bool(worker.get('online'))
    card['status'] = 'healthy' if card['online'] else worker.get('status', 'offline')
    card['lastLatencyMs'] = worker.get('lastLatencyMs')
    card['details'] = {'isServerless': IS_SERVERLESS, 'worker_status': worker}
    return [card]


def test_provider_connection(provider_id: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Test Connection for Local Qwen. Uses the worker heartbeat (latency is the worker's own
    Ollama round-trip). latency_ms is None when unavailable - this function never raises.
    """
    if provider_id != 'local_qwen':
        return {'success': False, 'latency_ms': None, 'status': 'Removed',
                'error': f"Provider '{provider_id}' is no longer supported. MCQs are generated only by Local Qwen3 8B."}

    worker = _worker_status(data)
    base = {'model': worker.get('model') or 'qwen3:8b', 'worker': worker}
    if worker.get('online'):
        return dict(base, success=True, latency_ms=worker.get('lastLatencyMs'), status='Worker Online',
                    message=f"Local Qwen Worker {worker.get('workerId')} is online; heartbeat "
                            f"{worker.get('lastHeartbeatSecondsAgo')}s ago, Ollama healthy.")
    if worker.get('workerOnline'):
        return dict(base, success=False, latency_ms=worker.get('lastLatencyMs'), status='Ollama Offline',
                    error=f"Worker {worker.get('workerId')} is connected but its local Ollama is not ready. "
                          "Start Ollama (`ollama serve`) and make sure qwen3:8b is pulled.")

    if not IS_SERVERLESS:
        # Local development only: this server runs on the same machine as Ollama.
        is_online, info = local_qwen_service.check_ollama_health(timeout=5.0)
        if is_online and info.get('modelAvailable'):
            return dict(base, success=False, latency_ms=info.get('latencyMs'), status='Worker Offline',
                        error="Ollama is running locally, but the Local Qwen Worker is not connected. Start "
                              "`python local_qwen_worker.py --server http://localhost:8000` to generate MCQs.")

    return dict(base, success=False, latency_ms=None, status='Worker Offline',
                error="Local Qwen Worker is offline. Start `python local_qwen_worker.py` on the administrator machine.")
