import os
import time
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

import ai_job_manager

_scheduler_running = False
_scheduler_thread = None

DEFAULT_AUTOPILOT_CONFIG = {
    'enabled': False,
    'dailyTime': '20:00',
    'timezoneOffsetHours': 5.5, # IST default
    'subject': 'Accounting',
    'subjectId': 'sub-1',
    'topic': 'Daily Comprehensive Exam Practice',
    'examLevel': 'CA Foundation',
    'difficulty': 'ICAI Exam Standard',
    'questionCount': 5,
    'durationMinutes': 15,
    'autoPublish': True,
    'allowedPlans': ['free', 'trial', 'pro', 'elite'],
    'lastRunDate': None,
    'lastRunJobId': None,
    'nextRunTime': None
}

def get_autopilot_config(data: Dict[str, Any]) -> Dict[str, Any]:
    if 'ai_autopilot_config' not in data or not isinstance(data.get('ai_autopilot_config'), dict):
        data['ai_autopilot_config'] = dict(DEFAULT_AUTOPILOT_CONFIG)
    return data['ai_autopilot_config']

def update_autopilot_config(new_config: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
    cfg = get_autopilot_config(data)
    for k in ['enabled', 'dailyTime', 'timezoneOffsetHours', 'subject', 'subjectId', 'topic', 'examLevel', 'difficulty', 'questionCount', 'durationMinutes', 'autoPublish', 'allowedPlans']:
        if k in new_config:
            cfg[k] = new_config[k]
    return cfg

def start_autopilot_scheduler(load_data_fn, save_data_fn, firebase_sync_fn):
    """Start background scheduler loop if not already running."""
    global _scheduler_running, _scheduler_thread
    if _scheduler_running:
        return

    _scheduler_running = True
    _scheduler_thread = threading.Thread(
        target=_autopilot_worker_loop,
        args=(load_data_fn, save_data_fn, firebase_sync_fn),
        daemon=True
    )
    _scheduler_thread.start()
    print("[AI_SCHEDULER] Background Auto-Pilot worker thread started.", flush=True)

def _autopilot_worker_loop(load_data_fn, save_data_fn, firebase_sync_fn):
    while _scheduler_running:
        try:
            time.sleep(30) # Poll every 30 seconds
            data = load_data_fn()
            cfg = get_autopilot_config(data)
            
            if not cfg.get('enabled'):
                continue

            # Calculate target time in configured timezone (default IST UTC+5:30)
            offset_hours = float(cfg.get('timezoneOffsetHours', 5.5))
            target_tz = timezone(timedelta(hours=offset_hours))
            now_local = datetime.now(target_tz)
            today_str = now_local.strftime('%Y-%m-%d')
            current_hhmm = now_local.strftime('%H:%M')

            daily_time = cfg.get('dailyTime', '20:00')

            # If today's job hasn't run and current time >= dailyTime
            if cfg.get('lastRunDate') != today_str and current_hhmm >= daily_time:
                print(f"[AI_SCHEDULER] Triggering Auto-Pilot generation for {today_str} at {current_hhmm} (Target: {daily_time}).", flush=True)
                
                job_title = f"Auto-Pilot: {cfg.get('subject')} - {today_str}"
                params = {
                    'title': job_title,
                    'subject': cfg.get('subject', 'Accounting'),
                    'subjectId': cfg.get('subjectId', 'sub-1'),
                    'topic': cfg.get('topic', 'Comprehensive Practice'),
                    'examLevel': cfg.get('examLevel', 'CA Foundation'),
                    'difficulty': cfg.get('difficulty', 'ICAI Exam Standard'),
                    'count': int(cfg.get('questionCount', 5)),
                    'durationMinutes': int(cfg.get('durationMinutes', 15)),
                    'autoPublish': bool(cfg.get('autoPublish', True)),
                    'allowedPlans': cfg.get('allowedPlans', ['free', 'trial', 'pro', 'elite'])
                }

                success, err, job_record = ai_job_manager.create_generation_job(
                    params=params,
                    data=data,
                    save_callback=save_data_fn,
                    firebase_sync_callback=firebase_sync_fn
                )

                if success and job_record:
                    cfg['lastRunDate'] = today_str
                    cfg['lastRunJobId'] = job_record['id']
                    save_data_fn(data)
                    if firebase_sync_fn:
                        firebase_sync_fn("ai_autopilot_config", cfg, method='PUT', sync=True)
                    print(f"[AI_SCHEDULER] Successfully dispatched Auto-Pilot job {job_record['id']}.", flush=True)
                else:
                    print(f"[AI_SCHEDULER_ERR] Failed to dispatch job: {err}", flush=True)

        except Exception as e:
            print(f"[AI_SCHEDULER_LOOP_ERROR] {e}", flush=True)
            time.sleep(10)
