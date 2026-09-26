"""
job_repository.py
=================
Storage boundary for MCQ generation jobs and Local Qwen Worker status.

ai_job_manager owns the job state machine; it reads and writes jobs ONLY through this
repository. The current implementation keeps jobs inside the backend data store dict
(persisted via save_callback and mirrored via sync_callback). The planned MySQL
implementation must provide the same methods, and must make the read-modify-write
sequences that ai_job_manager performs under STORE_LOCK atomic across serverless
instances (e.g. `UPDATE ... WHERE id=? AND status=? AND worker_id=?` for claims/leases).
"""

import threading
from typing import Any, Callable, Dict, List, Optional

# Serialises load -> mutate -> save of jobs/worker status within one server process.
STORE_LOCK = threading.RLock()

MAX_JOBS_RETAINED = 50


class JobRepository:
    def __init__(
        self,
        data: Optional[Dict[str, Any]],
        save_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        sync_callback: Optional[Callable[..., None]] = None
    ):
        self.data = data if isinstance(data, dict) else {}
        self.save_callback = save_callback
        self.sync_callback = sync_callback

    # ---- jobs -----------------------------------------------------------
    def list_jobs(self) -> List[Dict[str, Any]]:
        jobs = self.data.get('ai_generation_jobs', [])
        if isinstance(jobs, dict):
            jobs = list(jobs.values())
            self.data['ai_generation_jobs'] = jobs
        elif not isinstance(jobs, list):
            jobs = []
            self.data['ai_generation_jobs'] = jobs
        return [j for j in jobs if isinstance(j, dict) and j.get('id')]

    def get(self, job_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not job_id:
            return None
        return next((j for j in self.list_jobs() if j.get('id') == job_id), None)

    def save(self, job: Dict[str, Any], active_statuses=()) -> None:
        """Upsert a job, keep the newest MAX_JOBS_RETAINED (never dropping active jobs), persist."""
        self.list_jobs()  # normalise container
        jobs = self.data['ai_generation_jobs']
        idx = next((i for i, j in enumerate(jobs) if isinstance(j, dict) and j.get('id') == job['id']), None)
        if idx is None:
            jobs.insert(0, job)
        else:
            jobs[idx] = job
        if len(jobs) > MAX_JOBS_RETAINED:
            ordered = sorted(jobs, key=lambda j: j.get('createdTs', 0) or 0, reverse=True)
            keep = ordered[:MAX_JOBS_RETAINED]
            keep_ids = {j.get('id') for j in keep}
            keep += [j for j in ordered[MAX_JOBS_RETAINED:] if j.get('status') in active_statuses and j.get('id') not in keep_ids]
            self.data['ai_generation_jobs'] = keep
        self.persist()
        self.mirror(f"ai_generation_jobs/{job['id']}", job)

    # ---- worker status --------------------------------------------------
    def get_worker_status(self) -> Optional[Dict[str, Any]]:
        w = self.data.get('ai_worker_status')
        return w if isinstance(w, dict) else None

    def save_worker_status(self, status: Dict[str, Any]) -> None:
        self.data['ai_worker_status'] = status
        self.persist()
        self.mirror('ai_worker_status', status)

    # ---- generic persistence -------------------------------------------
    def persist(self) -> None:
        if self.save_callback:
            self.save_callback(self.data)

    def mirror(self, path: str, value: Any, method: str = 'PUT') -> None:
        """Mirror a single document to the configured cloud store (best effort)."""
        if not self.sync_callback:
            return
        try:
            self.sync_callback(path, value, method=method, sync=False)
        except Exception as e:
            print(f"[JOB_REPO_MIRROR_WARN] {path}: {e}", flush=True)
