"""
Real MongoDB Atlas multi-instance scheduler check (opt-in; not part of the unit-test suite).

    set RUN_ATLAS_SCHEDULER_TEST=1
    python scripts/check_scheduler_atlas.py

Uses a throwaway database (excellenceca_reltest_<random>) on the project's Atlas cluster - never the
production 'excellenceca' database - and drops it at the end. Two local server processes share it.
"""
import json
import os
import secrets
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.environ.get('RUN_ATLAS_SCHEDULER_TEST') != '1':
    sys.exit('Set RUN_ATLAS_SCHEDULER_TEST=1 to run this check against the real Atlas cluster (it uses a throwaway database).')
INSTANCE = ("import sys; sys.path.insert(0, sys.argv[3]); import server; "
            "server.DATA_STORE_FILE = sys.argv[2]; server.run_server(int(sys.argv[1]))")
DB_NAME = 'excellenceca_reltest_' + secrets.token_hex(4)
CRON = secrets.token_urlsafe(24)
WORKER = secrets.token_urlsafe(24)
os.environ.update({'MONGODB_DB_NAME': DB_NAME, 'CRON_SECRET': CRON, 'AI_WORKER_SECRET': WORKER, 'PYTHONIOENCODING': 'utf-8'})
os.environ.pop('PYTHONPATH', None)
sys.path.insert(0, REPO)
import mongodb_manager  # noqa: E402  (reads MONGODB_DB_NAME at import)
import ai_scheduler     # noqa: E402

assert mongodb_manager.DATABASE_NAME == DB_NAME and DB_NAME != 'excellenceca'
db = mongodb_manager.get_database()
assert db is not None, 'Atlas not reachable'
print(f"[setup] test database: {DB_NAME}", flush=True)

work = tempfile.mkdtemp(prefix='atlas_sched_')
results = []


def check(name, cond, detail=''):
    results.append(bool(cond))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)


def iso(dt):
    return ai_scheduler.format_iso_utc(dt)


procs = []
try:

    ports = [8021, 8022]
    for i, port in enumerate(ports):
        store = os.path.join(work, f'store_{i}.json')
        with open(store, 'w', encoding='utf-8') as f:
            json.dump({'users': {}, 'ai_scheduled_tasks': [], 'tests': [], 'questions': [], 'ai_generation_jobs': []}, f)
        log = open(os.path.join(work, f'instance_{i}.log'), 'w', encoding='utf-8')
        procs.append((subprocess.Popen([sys.executable, '-u', '-c', INSTANCE, str(port), store, REPO],
                                       cwd=REPO, stdout=log, stderr=subprocess.STDOUT, env=os.environ.copy()), log))
    for port in ports:
        for _ in range(60):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=3)
                break
            except Exception:
                time.sleep(0.5)
    print('[setup] both instances up', flush=True)

    def call(port, path, method='GET', headers=None, body=None):
        req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', method=method, headers=headers or {},
                                     data=json.dumps(body).encode() if body is not None else (b'{}' if method == 'POST' else None))
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b'{}')

    # a worker is online (heartbeat through instance 0) so the AI task can be dispatched
    st, _ = call(8021, '/api/admin/ai/worker/heartbeat', 'POST', {'X-Worker-Token': WORKER, 'Content-Type': 'application/json'},
                 {'workerId': 'rel-worker', 'latencyMs': 5, 'ollamaHealthy': True, 'model': 'qwen3:8b'})
    check('Qwen worker authentication (X-Worker-Token heartbeat)', st == 200, st)

    # seed the due tasks only now (instances up, worker online), so the race below is what processes them
    now = datetime.now(timezone.utc)
    ist_weekday = now.astimezone(ai_scheduler.IST_TZ).weekday()
    due = iso(now - timedelta(seconds=5))
    base = {'enabled': True, 'executionCount': 0, 'createdAt': iso(now), 'updatedAt': iso(now - timedelta(minutes=1)),
            'examLevel': 'CA Foundation', 'subject': 'Business Economics', 'chapter': 'Theory of Demand and Supply',
            'topic': 'Theory of Demand and Supply', 'questionCount': 2, 'durationMinutes': 10, 'liveDurationMinutes': 60}
    tasks = [
        dict(base, id='rel-ai', name='Reliability AI daily', scheduleType='recurring', dailyTime='06:00', status='scheduled',
             nextRunAt=due, isLiveEvent=False, testSource='ai_generate'),
        dict(base, id='rel-host', name='Reliability weekly existing test', scheduleType='weekly', weekdays=[ist_weekday],
             dailyTime='06:00', status='scheduled', nextRunAt=due, isLiveEvent=True, testSource='existing_test',
             existingTestId='rel-test-1', existingTestTitle='Reliability Mock'),
        dict(base, id='rel-stuck', name='Reliability stuck processing', scheduleType='recurring', dailyTime='06:00',
             status='processing', activeJobId='job-missing', nextRunAt=due, isLiveEvent=False, testSource='ai_generate',
             updatedAt=iso(now - timedelta(hours=2)), processingSince=iso(now - timedelta(hours=2))),
    ]
    for t in tasks:
        db['ai_scheduled_tasks'].replace_one({'_id': t['id']}, dict(t, _id=t['id']), upsert=True)
    db['tests'].replace_one({'_id': 'rel-test-1'}, {'_id': 'rel-test-1', 'id': 'rel-test-1', 'title': 'Reliability Mock',
                                                   'totalQuestions': 2, 'isPublished': False, 'status': 'Draft',
                                                   'updatedAt': iso(now)}, upsert=True)
    print('[setup] seeded 3 tasks + 1 test', flush=True)

    # ---- race: many simultaneous ticks on both instances
    bearer = {'Authorization': f'Bearer {CRON}', 'Content-Type': 'application/json'}
    responses = []
    for rnd in range(3):
        barrier = threading.Barrier(6)

        def fire(port, method):
            barrier.wait()
            responses.append(call(port, '/api/admin/ai/scheduler/tick', method, bearer))
        threads = [threading.Thread(target=fire, args=(p, m)) for p in ports for m in ('GET', 'POST', 'GET')]
        for th in threads:
            th.start()
        for th in threads:
            th.join()
    actions = [(r.get('taskId'), r.get('action')) for st, body in responses for r in (body.get('results') or [])]
    print('[race] tick actions:', actions, flush=True)
    check('all ticks authorised with Bearer CRON_SECRET', all(st == 200 for st, _ in responses), [st for st, _ in responses])
    time.sleep(1)
    logs_now = ''.join(open(os.path.join(work, f'instance_{i}.log'), encoding='utf-8', errors='replace').read() for i in range(2))
    q_logs = sum(1 for l in logs_now.splitlines() if '[AI_JOB_QUEUED]' in l)
    h_logs = sum(1 for l in logs_now.splitlines() if '[SCHEDULER_HOST_EXISTING]' in l and 'rel-test-1' in l)
    r_logs = sum(1 for l in logs_now.splitlines() if '[SCHEDULER_RECOVERY' in l and 'SKIPPED' not in l) + sum(1 for l in logs_now.splitlines() if '[SCHEDULER_RECOVERED]' in l and 'stuck' in l)
    ai_resp = actions.count(('rel-ai', 'queued_generation'))
    check('AI task dispatched exactly once (all instances, all triggers)', ai_resp <= 1 and q_logs == 1, f'responses={ai_resp} logs={q_logs}')
    check('existing test hosted exactly once', h_logs == 1, f'logs={h_logs}')
    check('stuck task recovered exactly once', r_logs == 1, f'logs={r_logs}')

    jobs = list(db['ai_generation_jobs'].find({'scheduledTaskId': 'rel-ai'}))
    ai = db['ai_scheduled_tasks'].find_one({'_id': 'rel-ai'})
    host = db['ai_scheduled_tasks'].find_one({'_id': 'rel-host'})
    stuck = db['ai_scheduled_tasks'].find_one({'_id': 'rel-stuck'})
    test = db['tests'].find_one({'_id': 'rel-test-1'})
    check('Atlas: exactly one generation job for the AI task', len(jobs) == 1, len(jobs))
    check('Atlas: AI task processing that job', ai['status'] == 'processing' and jobs and ai.get('activeJobId') == jobs[0]['id'], (ai['status'], ai.get('activeJobId')))
    check('Atlas: existing-test task live, executionCount 1', host['status'] == 'live' and host['executionCount'] == 1, (host['status'], host['executionCount']))
    check('Atlas: test is live', test.get('isLive') is True and test.get('status') == 'Live', (test.get('isLive'), test.get('status')))
    check('Atlas: stuck task rescheduled, one failure, one recovery', stuck['status'] == 'scheduled' and stuck.get('failureCount') == 1
          and len(stuck.get('recoveryHistory') or []) == 1, (stuck['status'], stuck.get('failureCount'), len(stuck.get('recoveryHistory') or [])))

    logs = ''.join(open(os.path.join(work, f'instance_{i}.log'), encoding='utf-8', errors='replace').read() for i in range(2))
    lost = logs.count('[SCHEDULER_RACE_AVOIDED]') + logs.count('[SCHEDULER_RECOVERY_SKIPPED]')
    check('losing instances detected the lost claim and stood down', lost >= 1, f'{lost} lost claim(s) logged')
    for i in range(2):
        per = open(os.path.join(work, f'instance_{i}.log'), encoding='utf-8', errors='replace').read()
        print(f'[race] instance {i}: queued={per.count("[AI_JOB_QUEUED]")} hosted={per.count("[SCHEDULER_HOST_EXISTING]")} '
              f'race_avoided={per.count("[SCHEDULER_RACE_AVOIDED]")} recovery_skipped={per.count("[SCHEDULER_RECOVERY_SKIPPED]")}', flush=True)

    # ---- more ticks later: nothing is repeated, executionCount stays 1
    for port in ports:
        call(port, '/api/admin/ai/scheduler/tick', 'GET', bearer)
    host2 = db['ai_scheduled_tasks'].find_one({'_id': 'rel-host'})
    check('no duplicate executionCount after further ticks', host2['executionCount'] == 1 and
          db['ai_generation_jobs'].count_documents({'scheduledTaskId': 'rel-ai'}) == 1)

    # ---- performance: with nothing due the tick skips the refresh
    st, body = call(8022, '/api/admin/ai/scheduler/tick', 'GET', bearer)
    check('nothing due -> tick skipped (no full refresh)', st == 200 and body.get('skipped') == 'nothing_due', body.get('skipped'))

    # ---- cross-instance job lifecycle: claim on instance 1, complete on instance 0
    wh = {'X-Worker-Token': WORKER, 'Content-Type': 'application/json'}
    st, claimed = call(8022, '/api/admin/ai/worker/claim', 'POST', wh, {'workerId': 'rel-worker'})
    job = (claimed or {}).get('job') or {}
    qs = [{'id': f'rel-q-{i}', 'text': f'Reliability question {i}?', 'question': f'Reliability question {i}?',
           'optionA': 'a', 'optionB': 'b', 'optionC': 'c', 'optionD': 'd', 'correctOption': 'A',
           'subject': 'Business Economics', 'chapterId': job.get('chapterId'), 'negativeMarks': 0.5} for i in (1, 2)]
    st2, done = call(8021, '/api/admin/ai/worker/complete', 'POST', wh, {'workerId': 'rel-worker', 'jobId': job.get('id'), 'questions': qs, 'metrics': {}})
    ai_after = db['ai_scheduled_tasks'].find_one({'_id': 'rel-ai'})
    check('job claimed on one instance and completed on the other', st == 200 and job.get('id') and st2 == 200, (st, st2, done.get('error')))
    check('AI task outcome applied once (scheduled, executionCount 1)', ai_after['status'] == 'scheduled' and ai_after['executionCount'] == 1,
          (ai_after['status'], ai_after['executionCount']))

    # ---- security on the real instances
    st, body = call(8021, f'/api/admin/ai/scheduler/tick?token={CRON}', 'GET')
    check('?token= rejected (401)', st == 401, st)
    st, _ = call(8021, '/api/admin/ai/scheduler/tick', 'GET', {'Authorization': 'Bearer wrong'})
    check('wrong secret refused (403)', st == 403, st)
    st, _ = call(8022, '/api/admin/ai/scheduler/tick', 'POST', {'X-Worker-Token': WORKER})
    check('worker secret header accepted on tick', st == 200, st)
    logs = ''.join(open(os.path.join(work, f'instance_{i}.log'), encoding='utf-8', errors='replace').read() for i in range(2))
    check('secrets never appear in server logs', CRON not in logs and WORKER not in logs)
finally:
    for p, log in procs:
        p.terminate()
        try:
            p.wait(timeout=10)
        except Exception:
            p.kill()
        log.close()
    client = mongodb_manager.get_mongo_client()
    if client is not None and DB_NAME.startswith('excellenceca_reltest_'):
        client.drop_database(DB_NAME)
        print(f'[cleanup] dropped test database {DB_NAME}; still present: {DB_NAME in client.list_database_names()}', flush=True)

print(f"\n{sum(results)}/{len(results)} checks passed")
