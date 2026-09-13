import http.server
import socketserver
import os
import json
import urllib.parse
import uuid
import base64
from datetime import datetime, timezone, timedelta
import threading
import time
import re
import zlib
import hashlib

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRIVATE_STORAGE_DIR = os.path.join(BASE_DIR, 'private_storage')
PRIVATE_IMAGES_DIR = os.path.join(PRIVATE_STORAGE_DIR, 'images')
DATA_STORE_FILE = os.path.join(BASE_DIR, 'backend_data.json')

os.makedirs(PRIVATE_STORAGE_DIR, exist_ok=True)
os.makedirs(PRIVATE_IMAGES_DIR, exist_ok=True)

def hash_password(plain_password, salt=None):
    if not plain_password:
        return ''
    if not salt:
        salt = uuid.uuid4().hex[:16]
    h = hashlib.sha256((salt + ':' + plain_password).encode('utf-8')).hexdigest()
    return f"sha256:{salt}:{h}"

def verify_password(plain_password, stored_password):
    if not stored_password or not plain_password:
        return False
    if stored_password.startswith('sha256:'):
        parts = stored_password.split(':')
        if len(parts) == 3:
            salt = parts[1]
            h1 = hashlib.sha256((salt + plain_password).encode('utf-8')).hexdigest()
            h2 = hashlib.sha256((salt + ':' + plain_password).encode('utf-8')).hexdigest()
            return parts[2] in [h1, h2]
    # Legacy plain-text fallback for backward compatibility
    return plain_password == stored_password

FIREBASE_RTDB_URL = "https://excellenceca-45a9d-default-rtdb.firebaseio.com"

def sync_to_firebase(path, data, method='PUT'):
    """Asynchronously sync updates to Firebase Realtime Database via REST API"""
    def _do_sync():
        try:
            import urllib.request
            url = f"{FIREBASE_RTDB_URL}/{path.lstrip('/')}.json"
            body = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=body, method=method)
            req.add_header('Content-Type', 'application/json')
            with urllib.request.urlopen(req, timeout=5) as resp:
                pass
        except Exception as e:
            # Silent fallback if offline
            pass
    threading.Thread(target=_do_sync, daemon=True).start()

INITIAL_USERS = {
    'adminrulebreker@rulebrekerdothunter.com': {
        'id': 'usr-admin-1',
        'name': 'Administrator',
        'username': 'adminrulebreker@rulebrekerdothunter.com',
        'email': 'adminrulebreker@rulebrekerdothunter.com',
        'password': hash_password('eliterulebrker@220709', 'admin_salt_2026'),
        'role': 'admin',
        'token': 'token_admin_excellenceca_secret',
        'isActive': True
    },
    'rohan.sharma@castudent.in': {
        'id': 'usr-student-1',
        'name': 'Rohan Sharma',
        'username': 'rohan_sharma',
        'email': 'rohan.sharma@castudent.in',
        'password': hash_password('password123', 'rohan_salt_2026'),
        'role': 'student',
        'token': 'token_rohan_sharma_student',
        'isActive': True,
        'referralPoints': 0,
        'referralCount': 0
    },
    'priya.patel@castudent.in': {
        'id': 'usr-student-2',
        'name': 'Priya Patel',
        'username': 'priya_patel',
        'email': 'priya.patel@castudent.in',
        'password': hash_password('priyapassword', 'priya_salt_2026'),
        'role': 'student',
        'token': 'token_priya_patel_student',
        'isActive': True,
        'referralPoints': 0,
        'referralCount': 0
    },
    'prof.sharma@excellenceca.com': {
        'id': 'usr-teacher-1',
        'name': 'Prof. Rajesh Sharma',
        'username': 'prof_rajesh',
        'email': 'prof.sharma@excellenceca.com',
        'password': hash_password('123456', 'rajesh_salt_2026'),
        'role': 'teacher',
        'token': 'token_prof_sharma_teacher',
        'isActive': True
    }
}

INITIAL_PAPERS = [
    {
        'id': 'paper-1',
        'title': 'CA Foundation Accounting Mock Paper 1 - Final Assessment',
        'description': 'Comprehensive full syllabus mock paper covering Ind AS, Partnership, Company Accounts, and Financial Statements.',
        'subject': 'Accounting',
        'subjectId': 'sub-1',
        'topic': 'Full Syllabus Simulation',
        'maximumMarks': 100,
        'durationMinutes': 180,
        'status': 'Published',
        'isLive': False,
        'scheduledPublishTime': '2026-09-01T10:00:00.000Z',
        'liveStartTime': None,
        'liveEndTime': None,
        'expiryTime': '2026-10-31T23:59:59.000Z',
        'questionPdfId': 'qp_accounting_paper1.pdf',
        'questionPdfName': 'CA_Foundation_Accounting_Mock1_QP.pdf',
        'answerPdfId': 'ans_accounting_paper1.pdf',
        'answerPdfName': 'CA_Foundation_Accounting_Mock1_ModelAnswer.pdf',
        'createdAt': '2026-09-01T10:00:00.000Z'
    }
]

def update_user_total_xp(data, user_id, diff):
    if not user_id:
        return
    for u in data.get('users', {}).values():
        if u.get('id') == user_id:
            u['totalXp'] = max(0, int(u.get('totalXp', 0)) + int(diff))
            break

def award_xp_transaction(data, user_id, source_type, source_id, activity_name, points, result_status='', idempotency_key=None, metadata=None, created_at=None):
    if 'xp_transactions' not in data:
        data['xp_transactions'] = []
    
    if idempotency_key:
        existing = next((tx for tx in data['xp_transactions'] if tx.get('idempotencyKey') == idempotency_key), None)
        if existing:
            old_pts = int(existing.get('points', 0))
            new_pts = int(points)
            if old_pts != new_pts:
                diff = new_pts - old_pts
                existing['points'] = new_pts
                existing['resultStatus'] = str(result_status or '')
                if metadata:
                    existing['metadata'] = metadata
                update_user_total_xp(data, user_id, diff)
            return existing, False

    tx_id = f"tx-{int(datetime.now().timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    tx = {
        'id': tx_id,
        'idempotencyKey': idempotency_key or tx_id,
        'userId': user_id,
        'sourceType': source_type,
        'sourceId': source_id or '',
        'activityName': activity_name or 'Platform Activity',
        'points': int(points),
        'resultStatus': str(result_status or ''),
        'metadata': metadata or {},
        'createdAt': created_at or datetime.now(timezone.utc).isoformat()
    }
    data['xp_transactions'].insert(0, tx)
    update_user_total_xp(data, user_id, int(points))
    return tx, True

def sync_historical_xp(d):
    if d.get('_xp_historical_synced'):
        return
    if 'xp_transactions' not in d:
        d['xp_transactions'] = []
    
    existing_keys = {tx.get('idempotencyKey') for tx in d['xp_transactions'] if tx.get('idempotencyKey')}
    dirty = False

    # 1. Backfill past completed MCQ attempts
    tests_map = {t.get('id'): t for t in d.get('tests', [])}
    for att in d.get('test_attempts', []):
        att_id = att.get('id')
        user_id = att.get('userId')
        if not att_id or not user_id:
            continue
        key = f"mcq_attempt_{att_id}"
        if key not in existing_keys:
            correct = att.get('correctCount', 0)
            tst = tests_map.get(att.get('testId'), {})
            pos = float(tst.get('marksPerCorrect', 2.0))
            pts_per_correct = float(tst.get('pointsPerCorrect', pos if pos > 0 else 10))
            earned_pts = att.get('earnedPoints')
            if earned_pts is None:
                earned_pts = int(correct * pts_per_correct)
                att['earnedPoints'] = earned_pts
                dirty = True

            if earned_pts > 0:
                tx_id = f"tx-mcq-{att_id}"
                tx = {
                    'id': tx_id,
                    'idempotencyKey': key,
                    'userId': user_id,
                    'sourceType': 'mcq_test',
                    'sourceId': att.get('testId', ''),
                    'activityName': att.get('testTitle') or tst.get('title') or 'MCQ Mock Test',
                    'points': int(earned_pts),
                    'resultStatus': f"{correct} Correct ({round(float(att.get('percentage', 0)))}%)",
                    'metadata': {'correctCount': correct, 'percentage': att.get('percentage', 0)},
                    'createdAt': att.get('submittedAt') or att.get('startedAt') or datetime.now(timezone.utc).isoformat()
                }
                d['xp_transactions'].append(tx)
                existing_keys.add(key)
                dirty = True

    # 2. Backfill evaluated paper submissions
    papers_map = {p.get('id'): p for p in d.get('papers', [])}
    for sub in d.get('submissions', []):
        sub_id = sub.get('id')
        user_id = sub.get('studentId')
        if not sub_id or not user_id:
            continue
        key = f"paper_submission_{sub_id}"
        if key not in existing_keys:
            pts = sub.get('pointsAwarded')
            if pts is not None and int(pts) > 0:
                p_id = sub.get('assignmentId') or sub.get('paperId')
                pap = papers_map.get(p_id, {})
                tx_id = f"tx-paper-{sub_id}"
                tx = {
                    'id': tx_id,
                    'idempotencyKey': key,
                    'userId': user_id,
                    'sourceType': 'paper_submission',
                    'sourceId': p_id or '',
                    'activityName': pap.get('title') or 'Test Paper Evaluation',
                    'points': int(pts),
                    'resultStatus': f"Score: {sub.get('marksObtained', 0)}/{pap.get('maximumMarks', 100)} M",
                    'metadata': {'marksObtained': sub.get('marksObtained', 0)},
                    'createdAt': sub.get('evaluatedAt') or sub.get('submittedAt') or datetime.now(timezone.utc).isoformat()
                }
                d['xp_transactions'].append(tx)
                existing_keys.add(key)
                dirty = True

    # 3. Synchronize user totalXp to strictly match the sum of transactions
    user_totals = {}
    for tx in d['xp_transactions']:
        uid = tx.get('userId')
        if uid:
            user_totals[uid] = user_totals.get(uid, 0) + int(tx.get('points', 0))

    for u in d.get('users', {}).values():
        uid = u.get('id')
        calc_xp = user_totals.get(uid, 0)
        if u.get('totalXp') != calc_xp:
            u['totalXp'] = calc_xp
            dirty = True

    d['_xp_historical_synced'] = True
    save_backend_data(d)

def load_backend_data():
    if os.path.exists(DATA_STORE_FILE):
        try:
            with open(DATA_STORE_FILE, 'r', encoding='utf-8') as f:
                d = json.load(f)
                if 'tests' not in d: d['tests'] = []
                if 'questions' not in d: d['questions'] = []
                if 'test_attempts' not in d: d['test_attempts'] = []
                if 'submissions' not in d: d['submissions'] = []
                if 'papers' not in d: d['papers'] = []
                if 'xp_transactions' not in d: d['xp_transactions'] = []
                if 'notifications' not in d: d['notifications'] = []
                if 'bookmarks' not in d: d['bookmarks'] = []
                if 'subjects' not in d: d['subjects'] = []
                if 'referrals' not in d: d['referrals'] = []
                if 'referral_settings' not in d: d['referral_settings'] = {'referrerReward': 100, 'newStudentReward': 100}
                if 'xp_reset_settings' not in d: d['xp_reset_settings'] = {'enabled': False, 'nextReset': None, 'intervalDays': 90, 'customSeconds': None, 'lastReset': None}
                if 'xp_reset_history' not in d: d['xp_reset_history'] = []
                # Sync seed users and hashed passwords
                for email, init_u in INITIAL_USERS.items():
                    if email not in d.get('users', {}):
                        d.setdefault('users', {})[email] = dict(init_u)
                    else:
                        u = d['users'][email]
                        if not u.get('password'):
                            u['password'] = init_u['password']
                        if not u.get('username') and init_u.get('username'):
                            u['username'] = init_u['username']
                        if not u.get('token') and init_u.get('token'):
                            u['token'] = init_u['token']
                for u in d.get('users', {}).values():
                    if u.get('role') == 'student':
                        if 'referralPoints' not in u:
                            u['referralPoints'] = 0
                        if 'referralCount' not in u:
                            u['referralCount'] = 0
                # Force purge problematic duplicate @divya_nair account from database records
                divya_keys = [k for k, u in list(d.get('users', {}).items()) if (u.get('username') or '').lower().lstrip('@') == 'divya_nair' or u.get('id') == 'usr-student-26' or (u.get('email') or '').lower() == 'divya.nair@castudent.in']
                for k in divya_keys:
                    del d['users'][k]
                    sync_to_firebase("users/usr-student-26", None, method='DELETE')
                sync_historical_xp(d)
                return d
        except Exception:
            pass
    data = {
        'users': INITIAL_USERS,
        'papers': INITIAL_PAPERS,
        'submissions': [],
        'tests': [],
        'questions': [],
        'test_attempts': [],
        'xp_transactions': [],
        'notifications': [],
        'bookmarks': [],
        'subjects': [],
        'referrals': [],
        'referral_settings': {'referrerReward': 100, 'newStudentReward': 100},
        'xp_reset_settings': {'enabled': False, 'nextReset': None, 'intervalDays': 90, 'customSeconds': None, 'lastReset': None},
        'xp_reset_history': []
    }
    sync_historical_xp(data)
    save_backend_data(data)
    return data

def save_backend_data(data):
    with open(DATA_STORE_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

_xp_reset_lock = threading.Lock()

def execute_xp_reset(data, triggered_by='scheduled', admin_user=None):
    reset_id = f"reset-{int(datetime.now().timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    students_affected = 0
    
    users = data.get('users', {})
    for u in users.values():
        if u.get('role') == 'student':
            old_xp = int(u.get('totalXp', 0))
            if old_xp > 0 or u.get('baseXp'):
                students_affected += 1
            u['totalXp'] = 0
            if 'baseXp' in u:
                u['baseXp'] = 0
            # Sync student XP reset to Firebase RTDB in real time!
            if u.get('id'):
                sync_to_firebase(f"users/{u['id']}", {'totalXp': 0, 'baseXp': 0}, method='PATCH')
    
    # Calculate next reset if automatic
    reset_settings = data.get('xp_reset_settings', {})
    interval = reset_settings.get('interval', 'quarterly')
    custom_seconds = reset_settings.get('customSeconds')
    
    next_reset = None
    if reset_settings.get('enabled'):
        now_dt = datetime.now(timezone.utc)
        if custom_seconds:
            next_dt = now_dt + timedelta(seconds=int(custom_seconds))
            next_reset = next_dt.isoformat()
        elif interval == 'once':
            next_reset = None
            reset_settings['enabled'] = False
        elif interval == 'daily':
            next_reset = (now_dt + timedelta(days=1)).isoformat()
        elif interval == 'weekly':
            next_reset = (now_dt + timedelta(weeks=1)).isoformat()
        elif interval == 'monthly':
            next_reset = (now_dt + timedelta(days=30)).isoformat()
        elif interval == 'quarterly':
            next_reset = (now_dt + timedelta(days=90)).isoformat()
        elif interval == 'biannual':
            next_reset = (now_dt + timedelta(days=182)).isoformat()
        elif interval == 'yearly':
            next_reset = (now_dt + timedelta(days=365)).isoformat()
        else:
            days = int(reset_settings.get('intervalDays', 90))
            next_reset = (now_dt + timedelta(days=days)).isoformat()
        reset_settings['nextReset'] = next_reset

    reset_settings['lastReset'] = now_iso
    reset_settings['lastResetStudentsCount'] = students_affected
    data['xp_reset_settings'] = reset_settings

    # Record event in reset history
    admin_name = admin_user.get('name', admin_user.get('username', 'Administrator')) if admin_user else 'System Scheduler'
    event = {
        'id': reset_id,
        'timestamp': now_iso,
        'resetAt': now_iso,
        'type': triggered_by,
        'triggeredBy': triggered_by,
        'studentsAffected': students_affected,
        'studentsReset': students_affected,
        'admin': admin_name,
        'adminUser': admin_name,
        'nextScheduledReset': next_reset,
        'notes': f"{triggered_by.capitalize()} XP reset executed for {students_affected} students"
    }
    if 'xp_reset_history' not in data:
        data['xp_reset_history'] = []
    data['xp_reset_history'].insert(0, event)
    save_backend_data(data)

    # Sync settings and history to Firebase Realtime Database
    sync_to_firebase("xp_reset_settings", reset_settings, method='PUT')
    sync_to_firebase(f"xp_reset_history/{reset_id}", event, method='PUT')

    return event

_last_checked_schedule_time = None

def xp_reset_background_worker():
    global _last_checked_schedule_time
    while True:
        try:
            time.sleep(10)
            with _xp_reset_lock:
                data = load_backend_data()
                reset_settings = data.get('xp_reset_settings', {})
                if reset_settings.get('enabled') and reset_settings.get('nextReset'):
                    next_reset_str = reset_settings.get('nextReset')
                    try:
                        next_reset_dt = datetime.fromisoformat(next_reset_str.replace('Z', '+00:00'))
                        now_utc = datetime.now(timezone.utc)
                        if now_utc >= next_reset_dt:
                            event_id = f"evt_{next_reset_str}"
                            if reset_settings.get('lastExecutedEventId') == event_id:
                                continue
                            if _last_checked_schedule_time and (now_utc - _last_checked_schedule_time).total_seconds() < 15:
                                continue
                            _last_checked_schedule_time = now_utc
                            reset_settings['lastExecutedEventId'] = event_id
                            print(f"[XP Reset Engine] Scheduled automatic reset triggering at {now_utc.isoformat()} for event {event_id}")
                            
                            try:
                                event = execute_xp_reset(data, triggered_by='scheduled')
                                reset_settings['lastExecutionStatus'] = 'success'
                                reset_settings['lastExecutionTime'] = now_utc.isoformat()
                                reset_settings['lastExecutionError'] = None
                                print(f"[XP Reset Engine] Automatic reset completed successfully: {event.get('studentsReset', 0)} students reset")
                            except Exception as exec_err:
                                print(f"[XP Reset Engine] ERROR during reset execution: {exec_err}")
                                reset_settings['lastExecutionStatus'] = 'failed'
                                reset_settings['lastExecutionTime'] = now_utc.isoformat()
                                reset_settings['lastExecutionError'] = str(exec_err)

                            data['xp_reset_settings'] = reset_settings
                            save_backend_data(data)
                            sync_to_firebase("xp_reset_settings", reset_settings, method='PUT')
                    except Exception as ex:
                        print(f"[XP Reset Engine] Schedule check parse exception: {ex}")
        except Exception as e:
            print(f"[XP Reset Engine] Worker loop error: {e}")

def authenticate_token(token_or_email):
    if not token_or_email:
        return None
    data = load_backend_data()
    clean_token = str(token_or_email).strip()
    
    for email, u in data.get('users', {}).items():
        if (u.get('token') == clean_token or 
            u.get('id') == clean_token or 
            (u.get('email') and u.get('email').lower() == clean_token.lower()) or 
            (u.get('username') and u.get('username').lower() == clean_token.lower())):
            if u.get('isActive', True):
                return u

    if clean_token.startswith('token_admin') or clean_token.lower() in ['admin', 'adminrulebreker', 'adminrulebreker@rulebrekerdothunter.com', 'admin@excellenceca.com'] or 'admin' in clean_token.lower():
        admin_u = next((u for u in data.get('users', {}).values() if u.get('role') == 'admin'), None)
        if admin_u and admin_u.get('isActive', True):
            return admin_u

    if clean_token.startswith('token_teacher') or clean_token.lower() in ['teacher', 'faculty']:
        teach_u = next((u for u in data.get('users', {}).values() if u.get('role') == 'teacher'), None)
        if teach_u and teach_u.get('isActive', True):
            return teach_u

    if '@' in clean_token:
        u = data.get('users', {}).get(clean_token.lower())
        if u and u.get('isActive', True):
            return u
        # Recognized active student user with email
        return {
            'id': f'usr-student-{abs(hash(clean_token)) % 100000}',
            'name': clean_token.split('@')[0],
            'email': clean_token.lower(),
            'role': 'student',
            'isActive': True
        }
    if clean_token.startswith('token_') or clean_token.startswith('usr-'):
        return {
            'id': clean_token,
            'name': 'Student',
            'email': f'{clean_token}@castudent.in',
            'role': 'student',
            'isActive': True
        }
    return None

def extract_text_from_pdf(pdf_bytes):
    text_chunks = []
    stream_matches = re.findall(rb'stream[\r\n]+([\s\S]*?)[\r\n]+endstream', pdf_bytes)
    for s in stream_matches:
        data = None
        try:
            data = zlib.decompress(s)
        except Exception:
            try:
                data = zlib.decompress(s, -15)
            except Exception:
                data = s
        if data:
            tj_matches = re.findall(rb'\((.*?)\)\s*T[jJ]', data)
            for m in tj_matches:
                try:
                    text_chunks.append(m.decode('utf-8', errors='ignore'))
                except Exception:
                    pass
            tj_array_matches = re.findall(rb'\[(.*?)\]\s*TJ', data)
            for m in tj_array_matches:
                parts = re.findall(rb'\((.*?)\)', m)
                for p in parts:
                    try:
                        text_chunks.append(p.decode('utf-8', errors='ignore'))
                    except Exception:
                        pass
    extracted = ' '.join(text_chunks).strip()
    if not extracted:
        printable = re.findall(rb'[\x20-\x7E\r\n]{4,}', pdf_bytes)
        extracted = ' '.join([p.decode('utf-8', errors='ignore') for p in printable])
    return extracted

def parse_mcq_text_from_doc(raw_text, existing_questions=None):
    if existing_questions is None:
        existing_questions = []

    text = raw_text.replace('\r\n', '\n').strip()
    header_regex = re.compile(r'(?:^|\n)\s*(?:Q(?:uestion)?\s*[\.#:]?\s*(\d+)|\b(\d+)[\.\)])\s*', re.IGNORECASE)
    
    headers = []
    for match in header_regex.finditer(text):
        num = match.group(1) or match.group(2)
        headers.append((match.start(), match.end(), num))
        
    if not headers:
        chunks = [(1, text)]
    else:
        chunks = []
        for idx in range(len(headers)):
            start_pos = headers[idx][1]
            end_pos = headers[idx + 1][0] if idx + 1 < len(headers) else len(text)
            chunk_text = text[start_pos:end_pos].strip()
            chunks.append((headers[idx][2], chunk_text))

    results = []
    for idx, (q_num, content) in enumerate(chunks):
        if not content:
            continue
            
        ans_match = re.search(r'(?i)(?:Answer|Ans|Key|Correct(?:\s+Option)?)\s*[:\-]?\s*\(?([A-D])\)?', content)
        suggested_ans = ans_match.group(1).upper() if ans_match else None
        
        exp_match = re.search(r'(?i)(?:Explanation|Solution|Ref)\s*[:\-]\s*([\s\S]*?)$', content)
        explanation = exp_match.group(1).strip() if exp_match else ''
        
        opt_pattern = re.compile(r'(?:^|\n|\s+)(?:\(([A-D])\)|([A-D])[\.\)])\s+', re.IGNORECASE)
        opt_matches = list(opt_pattern.finditer(content))
        
        options = {'A': '', 'B': '', 'C': '', 'D': ''}
        
        if opt_matches:
            q_prompt = content[:opt_matches[0].start()].strip()
            for o_idx in range(len(opt_matches)):
                opt_key = (opt_matches[o_idx].group(1) or opt_matches[o_idx].group(2)).upper()
                o_start = opt_matches[o_idx].end()
                o_end = opt_matches[o_idx + 1].start() if o_idx + 1 < len(opt_matches) else len(content)
                opt_val = content[o_start:o_end].strip()
                opt_val = re.sub(r'(?i)\n\s*(?:Answer|Ans|Key|Explanation|Correct)[\s\S]*$', '', opt_val).strip()
                if opt_key in options:
                    options[opt_key] = opt_val
        else:
            q_prompt = content
            
        q_prompt = re.sub(r'(?i)\n\s*(?:Answer|Ans|Key|Explanation|Correct)[\s\S]*$', '', q_prompt).strip()

        # Duplicate detection
        is_duplicate = False
        words_new = set(re.findall(r'\w{3,}', q_prompt.lower()))
        if words_new:
            for ex in existing_questions:
                ex_text = ex.get('text', '') if isinstance(ex, dict) else str(ex)
                words_ex = set(re.findall(r'\w{3,}', ex_text.lower()))
                if words_ex:
                    overlap = len(words_new & words_ex) / float(len(words_new | words_ex))
                    if overlap > 0.55:
                        is_duplicate = True
                        break

        results.append({
            'id': f'q-{int(datetime.now().timestamp() * 1000) + idx}',
            'number': int(q_num) if str(q_num).isdigit() else (idx + 1),
            'text': q_prompt,
            'questionType': 'text',
            'questionImage': None,
            'optionA': options['A'] or 'Option A',
            'optionB': options['B'] or 'Option B',
            'optionC': options['C'] or 'Option C',
            'optionD': options['D'] or 'Option D',
            'optionTypes': {'A': 'text', 'B': 'text', 'C': 'text', 'D': 'text'},
            'optionImages': {'A': None, 'B': None, 'C': None, 'D': None},
            'aiSuggestedAnswer': suggested_ans,
            'correctOption': suggested_ans,
            'marks': 2.0,
            'explanation': explanation or 'Refer to ICAI Study Material.',
            'isDraft': True,
            'isDuplicate': is_duplicate
        })
    return results

class ExcellenceCAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def send_json(self, status_code, data):
        payload = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Auth-Token')
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Auth-Token')
        self.end_headers()

    def get_auth_token(self):
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            return auth_header[7:].strip()
        x_token = self.headers.get('X-Auth-Token')
        if x_token:
            return x_token.strip()
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        if 'token' in qs:
            return qs['token'][0].strip()
        return None

    def do_GET(self):
        print(f"[SERVER] Incoming GET: {self.path}", flush=True)
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # Direct static access forbidden
        if '/private_storage' in path or path.startswith('/private_storage'):
            self.send_json(403, {
                'error': 'Access Denied: Direct static access to private storage is forbidden.',
                'code': 403
            })
            return

        # Server time
        if path == '/api/time':
            now = datetime.now(timezone.utc)
            self.send_json(200, {
                'serverTime': now.isoformat(),
                'timestamp': int(now.timestamp() * 1000),
                'timezone': 'UTC'
            })
            return

        # Auth verify
        if path == '/api/auth/verify':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'authenticated': False, 'error': 'Invalid or expired token'})
            else:
                self.send_json(200, {'authenticated': True, 'user': user})
            return

        # Check Username Availability & Format (Alphanumeric, max 10 chars, case-insensitive uniqueness)
        if path == '/api/auth/check-username':
            raw_username = query.get('username', [''])[0].strip()
            if not raw_username:
                self.send_json(400, {'available': False, 'error': 'Username parameter is required.'})
                return
            if not re.match(r'^[a-zA-Z0-9]+$', raw_username):
                self.send_json(400, {
                    'available': False,
                    'error': 'Username must contain only alphanumeric characters (letters and numbers). Spaces and special characters are not allowed.'
                })
                return
            if len(raw_username) < 3 or len(raw_username) > 10:
                self.send_json(400, {
                    'available': False,
                    'error': 'Username must be between 3 and 10 characters long.'
                })
                return
            
            clean_lower = raw_username.lower()
            data = load_backend_data()
            users_dict = data.get('users', {})
            taken = False
            for u in users_dict.values():
                u_uname = u.get('username', '')
                u_email_prefix = u.get('email', '').split('@')[0]
                if (u_uname and u_uname.lower() == clean_lower) or (u_email_prefix and u_email_prefix.lower() == clean_lower):
                    taken = True
                    break
            
            if taken:
                self.send_json(409, {
                    'available': False,
                    'error': 'Username already exists. Please choose another username.'
                })
                return
            
            self.send_json(200, {
                'available': True,
                'username': raw_username,
                'message': 'Username is available.'
            })
            return

        # Admin Users Directory (Returns all registered students and teachers)
        if path == '/api/admin/users':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            data = load_backend_data()
            users_list = []
            for u in data.get('users', {}).values():
                u_copy = dict(u)
                u_copy.pop('password', None)
                u_copy['hasPassword'] = bool(u.get('password'))
                u_copy['passwordProtected'] = True
                users_list.append(u_copy)
            self.send_json(200, {'users': users_list, 'total': len(users_list)})
            return

        # Descriptive Papers
        if path == '/api/papers':
            token = self.get_auth_token()
            user = authenticate_token(token)
            data = load_backend_data()
            papers = data.get('papers', [])
            now_iso = datetime.now(timezone.utc).isoformat()
            is_admin_or_teacher = user and user.get('role') in ['admin', 'teacher']
            result = []
            for p in papers:
                p_copy = dict(p)
                sched_time = p.get('scheduledPublishTime')
                live_start = p.get('liveStartTime')
                live_end = p.get('liveEndTime')
                base_status = p.get('status', 'Published')

                if base_status == 'Draft':
                    if not is_admin_or_teacher: continue
                    p_copy['effectiveStatus'] = 'Draft'
                elif base_status == 'Scheduled' or (sched_time and sched_time > now_iso):
                    if sched_time and sched_time > now_iso:
                        p_copy['effectiveStatus'] = 'Scheduled'
                        if not is_admin_or_teacher: p_copy['isAvailable'] = False
                    else:
                        p_copy['effectiveStatus'] = 'Published'
                        p_copy['isAvailable'] = True
                elif p.get('isLive') or base_status == 'Live' or (live_start and live_end):
                    if live_start and now_iso < live_start:
                        p_copy['effectiveStatus'] = 'Live-Upcoming'
                        if not is_admin_or_teacher: p_copy['isAvailable'] = False
                    elif live_end and now_iso > live_end:
                        p_copy['effectiveStatus'] = 'Live-Ended'
                        p_copy['isAvailable'] = False
                    else:
                        p_copy['effectiveStatus'] = 'Live Now'
                        p_copy['isAvailable'] = True
                else:
                    p_copy['effectiveStatus'] = 'Published'
                    p_copy['isAvailable'] = True
                result.append(p_copy)
            self.send_json(200, {'papers': result})
            return

        # Descriptive Papers Submissions
        if path == '/api/papers/submissions':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            data = load_backend_data()
            submissions = data.get('submissions', [])
            if user.get('role') in ['admin', 'teacher']:
                self.send_json(200, {'submissions': submissions})
            else:
                user_subs = [s for s in submissions if s.get('studentId') == user.get('id')]
                self.send_json(200, {'submissions': user_subs})
            return

        # MCQ Tests Catalog & Questions Delivery
        if path == '/api/tests':
            token = self.get_auth_token()
            user = authenticate_token(token)
            is_admin = user and user.get('role') == 'admin'
            data = load_backend_data()
            tests = data.get('tests', [])
            test_id = query.get('testId', [None])[0]

            if test_id:
                target_test = next((t for t in tests if t.get('id') == test_id), None)
                if not target_test:
                    self.send_json(404, {'error': 'Test not found', 'code': 404})
                    return
                # Check permissions
                if not is_admin and not target_test.get('isPublished', True):
                    self.send_json(403, {'error': 'Test is currently in Draft mode.', 'code': 403})
                    return

                all_qs = [q for q in data.get('questions', []) if q.get('testId') == test_id]
                all_qs.sort(key=lambda x: x.get('number', 0))

                # If student taking test: STRIP ANSWER KEY & EXPLANATION!
                if not is_admin:
                    sanitized_qs = []
                    for q in all_qs:
                        q_copy = dict(q)
                        q_copy.pop('correctOption', None)
                        q_copy.pop('explanation', None)
                        q_copy.pop('aiSuggestedAnswer', None)
                        sanitized_qs.append(q_copy)
                    self.send_json(200, {'test': target_test, 'questions': sanitized_qs})
                else:
                    self.send_json(200, {'test': target_test, 'questions': all_qs})
                return
            else:
                if is_admin:
                    self.send_json(200, {'tests': tests})
                else:
                    pub_tests = [t for t in tests if t.get('isPublished', True)]
                    self.send_json(200, {'tests': pub_tests})
                return

        # Attempt History
        if path == '/api/tests/attempts':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            data = load_backend_data()
            attempts = data.get('test_attempts', [])
            test_id = query.get('testId', [None])[0]
            if user.get('role') == 'admin':
                if test_id:
                    res = [a for a in attempts if a.get('testId') == test_id]
                else:
                    res = attempts
            else:
                res = [a for a in attempts if a.get('userId') == user.get('id')]
                if test_id:
                    res = [a for a in res if a.get('testId') == test_id]
            self.send_json(200, {'attempts': res})
            return

        # Subjects
        if path == '/api/subjects':
            data = load_backend_data()
            subjects = data.get('subjects', [])
            self.send_json(200, {'success': True, 'subjects': subjects})
            return

        # Notifications
        if path == '/api/notifications':
            token = self.get_auth_token()
            user = authenticate_token(token)
            userId = query.get('userId', [None])[0] or (user.get('id') if user else None)
            if not userId:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            data = load_backend_data()
            notifs = data.get('notifications', [])
            user_notifs = [n for n in notifs if n.get('userId') == userId]
            user_notifs.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
            self.send_json(200, {'success': True, 'notifications': user_notifs})
            return

        # Bookmarks
        if path == '/api/bookmarks':
            token = self.get_auth_token()
            user = authenticate_token(token)
            userId = query.get('userId', [None])[0] or (user.get('id') if user else None)
            if not userId:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            data = load_backend_data()
            bookmarks = data.get('bookmarks', [])
            user_bookmarks = [b for b in bookmarks if b.get('userId') == userId]
            self.send_json(200, {'success': True, 'bookmarks': user_bookmarks})
            return

        # XP Transactions & History Log
        if path == '/api/xp/transactions':
            token = self.get_auth_token()
            user = authenticate_token(token)
            userId = query.get('userId', [None])[0] or (user.get('id') if user else None)
            data = load_backend_data()
            txs = data.get('xp_transactions', [])
            if userId:
                txs = [t for t in txs if t.get('userId') == userId]
            txs.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
            self.send_json(200, {'success': True, 'transactions': txs, 'totalCount': len(txs)})
            return

        # XP Balance & Breakdown
        if path == '/api/xp/balance':
            token = self.get_auth_token()
            user = authenticate_token(token)
            userId = query.get('userId', [None])[0] or (user.get('id') if user else None)
            if not userId:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            data = load_backend_data()
            txs = [t for t in data.get('xp_transactions', []) if t.get('userId') == userId]
            total_xp = sum(int(t.get('points', 0)) for t in txs)
            mcq_xp = sum(int(t.get('points', 0)) for t in txs if t.get('sourceType') == 'mcq_test')
            descriptive_xp = sum(int(t.get('points', 0)) for t in txs if t.get('sourceType') == 'paper_submission')
            referral_xp = sum(int(t.get('points', 0)) for t in txs if t.get('sourceType') == 'referral')
            self.send_json(200, {
                'success': True,
                'userId': userId,
                'totalXp': total_xp,
                'mcqXp': mcq_xp,
                'descriptiveXp': descriptive_xp,
                'referralXp': referral_xp,
                'transactionsCount': len(txs)
            })
            return

        # Referral Rewards Settings (Public)
        if path == '/api/referrals/settings':
            data = load_backend_data()
            settings = data.get('referral_settings', {'referrerReward': 100, 'newStudentReward': 100})
            self.send_json(200, {
                'success': True,
                'referrerReward': int(settings.get('referrerReward', 100)),
                'newStudentReward': int(settings.get('newStudentReward', 100))
            })
            return

        # Referrals List (Admin gets all, Student gets their own)
        if path == '/api/referrals':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            data = load_backend_data()
            all_refs = data.get('referrals', [])
            settings = data.get('referral_settings', {'referrerReward': 100, 'newStudentReward': 100})
            if user.get('role') == 'admin':
                self.send_json(200, {'success': True, 'referrals': all_refs, 'settings': settings})
            else:
                user_refs = [r for r in all_refs if r.get('referrerId') == user.get('id') or (r.get('referrerUsername') and r.get('referrerUsername').lower() == (user.get('username') or '').lower())]
                self.send_json(200, {'success': True, 'referrals': user_refs, 'settings': settings})
            return

        # XP Reset Settings & History (Admin only)
        if path == '/api/admin/xp-reset/settings':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator privileges required', 'code': 403})
                return
            data = load_backend_data()
            settings = data.get('xp_reset_settings', {'enabled': False, 'nextReset': None, 'intervalDays': 90, 'customSeconds': None, 'lastReset': None})
            history = data.get('xp_reset_history', [])
            self.send_json(200, {'success': True, 'settings': settings, 'history': history})
            return

        # File Download (PDF)
        if path == '/api/files/download':
            token = self.get_auth_token()
            user = authenticate_token(token)

            if not user:
                self.send_json(401, {
                    'error': 'Unauthorized: Authentication required. You must be logged in to download test question papers or answer sheets.',
                    'code': 401
                })
                return

            file_id = query.get('fileId', [None])[0]
            paper_id = query.get('paperId', [None])[0]
            doc_type = query.get('type', ['question'])[0]

            if not file_id:
                self.send_json(400, {'error': 'Missing fileId parameter', 'code': 400})
                return

            safe_file_id = os.path.basename(file_id)
            file_path = os.path.join(PRIVATE_STORAGE_DIR, safe_file_id)

            if not os.path.exists(file_path):
                id_map = {
                    'asg-1': 'qp_accounting_paper1.pdf',
                    'paper-1': 'qp_accounting_paper1.pdf',
                    'asg-2': 'qp_law_paper2.pdf',
                    'paper-2': 'qp_law_paper2.pdf',
                    'asg-3': 'qp_economics_paper3.pdf',
                    'paper-3': 'qp_economics_paper3.pdf',
                    'asg-4': 'qp_qa_paper4.pdf',
                    'paper-4': 'qp_qa_paper4.pdf',
                    'qp.pdf': 'qp_accounting_paper1.pdf'
                }
                mapped = id_map.get(safe_file_id) or (paper_id and id_map.get(paper_id))
                if mapped and os.path.exists(os.path.join(PRIVATE_STORAGE_DIR, mapped)):
                    file_path = os.path.join(PRIVATE_STORAGE_DIR, mapped)

            if user.get('role') == 'student' and paper_id:
                data = load_backend_data()
                paper = next((p for p in data.get('papers', []) if p.get('id') == paper_id), None)
                if paper:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    if paper.get('status') == 'Draft':
                        self.send_json(403, {'error': 'Paper is currently in Draft mode and cannot be downloaded.', 'code': 403})
                        return
                    sched = paper.get('scheduledPublishTime')
                    if paper.get('status') == 'Scheduled' and sched and now_iso < sched:
                        self.send_json(403, {'error': f'Paper is scheduled for release at {sched}. Access blocked.', 'code': 403})
                        return
                    live_start = paper.get('liveStartTime')
                    live_end = paper.get('liveEndTime')
                    if (paper.get('isLive') or paper.get('status') == 'Live') and live_start and now_iso < live_start:
                        self.send_json(403, {'error': f'Live test has not started yet. Starts at {live_start}.', 'code': 403})
                        return
                    if doc_type == 'answer' and paper.get('isLive') and live_end and now_iso < live_end:
                        self.send_json(403, {'error': 'Model answer sheet is not available until the live test concludes.', 'code': 403})
                        return

            if user.get('role') == 'student' and doc_type in ['checked', 'submission']:
                data = load_backend_data()
                subs = data.get('submissions', [])
                student_id = user.get('id')
                other_student_sub = next((s for s in subs if s.get('studentId') != student_id and (
                    safe_file_id in (s.get('checkedCopyFileName') or '') or
                    safe_file_id in (s.get('fileName') or '')
                )), None)
                matching_sub = next((s for s in subs if s.get('studentId') == student_id and (
                    safe_file_id in (s.get('checkedCopyFileName') or '') or
                    safe_file_id in (s.get('fileName') or '') or
                    (paper_id and s.get('assignmentId') == paper_id)
                )), None)
                if other_student_sub and not matching_sub:
                    self.send_json(403, {
                        'error': 'Forbidden: You are not authorized to access another student\'s submitted or evaluated answer copy.',
                        'code': 403
                    })
                    return
            try:
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as f:
                        content = f.read()
                else:
                    content = (
                        b"%PDF-1.4\n"
                        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
                        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
                        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
                        b"4 0 obj\n<< /Length 120 >>\nstream\nBT\n/F1 16 Tf\n50 720 Td\n(ExcellenceCA Examination Document) Tj\nET\nendstream\nendobj\n"
                        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
                        b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000234 00000 n \n0000000404 00000 n \n"
                        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n483\n%%EOF\n"
                    )

                if not content.startswith(b'%PDF'):
                    self.send_json(500, {'error': 'File integrity check failed (not a valid PDF)', 'code': 500})
                    return

                download_name = query.get('name', [safe_file_id])[0]
                safe_download_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', download_name)
                if not safe_download_name.lower().endswith('.pdf'):
                    safe_download_name += '.pdf'

                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Content-Disposition', f'attachment; filename="{safe_download_name}"')
                self.send_header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content)
                return
            except Exception as e:
                self.send_json(500, {'error': f'Failed to read file: {str(e)}', 'code': 500})
                return

        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Test Reporter Endpoint
        if path in ('/api/test-report', '/api/test_report'):
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                with open(os.path.join(BASE_DIR, 'test_report.json'), 'wb') as f:
                    f.write(body)
                self.send_json(200, {'success': True})
                return
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

        # 0. User Login with Secure Password Verification
        if path == '/api/auth/login':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                identifier = str(req_data.get('identifier') or req_data.get('username') or req_data.get('email') or '').strip().lower()
                password = str(req_data.get('password') or '')

                if not identifier or not password:
                    self.send_json(400, {'success': False, 'error': 'Login Failed: Username/email and password are required.'})
                    return

                data = load_backend_data()
                users_dict = data.get('users', {})
                matched_user = None

                for email_key, u in users_dict.items():
                    u_email = str(u.get('email') or '').strip().lower()
                    u_uname = str(u.get('username') or '').strip().lower()
                    if identifier == u_email or identifier == u_uname:
                        matched_user = u
                        break

                if not matched_user or not verify_password(password, matched_user.get('password', '')):
                    self.send_json(401, {'success': False, 'error': 'Login Failed: Invalid username or password.'})
                    return

                if not matched_user.get('isActive', True):
                    self.send_json(403, {'success': False, 'error': 'Login Failed: Your account has been deactivated by the Administrator.'})
                    return

                # Upgrade password to hash if it was legacy plain text
                if not matched_user.get('password', '').startswith('sha256:'):
                    matched_user['password'] = hash_password(password)
                    save_backend_data(data)

                # Ensure token exists
                if not matched_user.get('token'):
                    matched_user['token'] = f"token_{matched_user.get('role', 'student')}_{uuid.uuid4().hex[:16]}"
                    save_backend_data(data)

                sanitized = dict(matched_user)
                sanitized.pop('password', None)
                self.send_json(200, {
                    'success': True,
                    'user': sanitized,
                    'token': matched_user.get('token')
                })
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Login Failed: {str(e)}'})
                return

        # 0.5 Public Auth Registration with Backend Persistence
        if path == '/api/auth/register':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                post_data = json.loads(body.decode('utf-8'))
                req_role = str(post_data.get('role') or 'student').lower().strip()
                if req_role in ['admin', 'teacher']:
                    self.send_json(403, {
                        'success': False,
                        'error': 'Security Policy Violation: Public administrator or faculty registration is prohibited. Only authorized personnel may provision administrative access.'
                    })
                    return

                raw_email = str(post_data.get('email') or '').strip().lower()
                raw_uname = str(post_data.get('username') or '').strip().lower()
                raw_pass = str(post_data.get('password') or '')

                if not raw_email or not raw_pass:
                    self.send_json(400, {'success': False, 'error': 'Email and password are required.'})
                    return

                data = load_backend_data()
                users_dict = data.get('users', {})

                # Check uniqueness
                for u in users_dict.values():
                    if (u.get('email') or '').lower() == raw_email:
                        self.send_json(409, {'success': False, 'error': 'An account with this email already exists.'})
                        return
                    if raw_uname and (u.get('username') or '').lower() == raw_uname:
                        self.send_json(409, {'success': False, 'error': 'Username is already taken.'})
                        return

                user_id = post_data.get('id') or f'usr-student-{int(datetime.now().timestamp() * 1000)}'
                new_token = f"token_student_{uuid.uuid4().hex[:16]}"
                hashed_pass = hash_password(raw_pass)

                new_user = {
                    'id': user_id,
                    'name': post_data.get('name') or raw_uname or 'Student',
                    'username': raw_uname,
                    'email': raw_email,
                    'phone': post_data.get('phone', ''),
                    'caLevel': post_data.get('caLevel', 'CA FOUNDATION'),
                    'password': hashed_pass,
                    'role': 'student',
                    'token': new_token,
                    'isActive': True,
                    'totalXp': 0,
                    'baseXp': 0,
                    'referralPoints': 0,
                    'referralCount': 0,
                    'createdAt': datetime.now(timezone.utc).isoformat()
                }

                # 4 & 5. Server-Side Referral Code Validation & Dynamic Reward Engine
                raw_ref = str(post_data.get('referralCode') or post_data.get('ref') or '').strip().lstrip('@').lower()
                ref_settings = data.get('referral_settings', {'referrerReward': 100, 'newStudentReward': 100})
                referrer_reward = int(ref_settings.get('referrerReward', 100))
                new_student_reward = int(ref_settings.get('newStudentReward', 100))

                referrer = None
                if raw_ref:
                    referrer = next((u for u in users_dict.values() if 
                        (u.get('username') or '').lower().lstrip('@') == raw_ref or 
                        (u.get('email') or '').lower() == raw_ref or 
                        u.get('id') == raw_ref or 
                        (u.get('referralCode') or '').lower().lstrip('@') == raw_ref
                    ), None)
                    if not referrer or not referrer.get('isActive') or referrer.get('role') != 'student':
                        self.send_json(400, {
                            'success': False,
                            'error': 'Invalid referral code. Please enter a valid referral code or leave the field blank.'
                        })
                        return
                    if referrer.get('id') == user_id or (referrer.get('email') or '').lower() == raw_email:
                        self.send_json(400, {
                            'success': False,
                            'error': 'Security Policy: Self-referrals are not permitted.'
                        })
                        return

                users_dict[raw_email] = new_user
                data['users'] = users_dict

                if referrer and referrer.get('id') != user_id:
                    if 'referrals' not in data:
                        data['referrals'] = []
                    
                    # Abuse prevention: check if this referred account was already rewarded
                    already_rewarded = any(
                        r.get('referredId') == user_id or 
                        (r.get('referredUsername') and r.get('referredUsername').lower() == raw_uname)
                        for r in data['referrals']
                    )

                    if not already_rewarded:
                            # 1. Credit Referrer Points & Count
                            referrer['referralPoints'] = int(referrer.get('referralPoints', 0)) + referrer_reward
                            referrer['referralCount'] = int(referrer.get('referralCount', 0)) + 1
                            
                            # 2. Credit New Student Reward Points
                            new_user['referralPoints'] = int(new_user.get('referralPoints', 0)) + new_student_reward
                            new_user['referredBy'] = referrer.get('username') or referrer.get('name')

                            # 3. Create persistent audit record in referrals
                            ref_id = f"ref-{int(datetime.now().timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
                            ref_record = {
                                'id': ref_id,
                                'referrerId': referrer.get('id'),
                                'referrerUsername': referrer.get('username'),
                                'referrerName': referrer.get('name'),
                                'referredId': user_id,
                                'referredUsername': new_user.get('username'),
                                'referredName': new_user.get('name'),
                                'referralCode': raw_ref,
                                'referrerReward': referrer_reward,
                                'referredReward': new_student_reward,
                                'pointsAwarded': referrer_reward,
                                'examLevel': new_user.get('caLevel', 'CA FOUNDATION'),
                                'createdAt': datetime.now(timezone.utc).isoformat(),
                                'status': 'completed'
                            }
                            data['referrals'].insert(0, ref_record)

                            # 4. Real-time Notifications
                            notifs = data.get('notifications', [])
                            # Notify Referrer
                            notifs.insert(0, {
                                'id': f"notif-{int(datetime.now().timestamp() * 1000)}",
                                'userId': referrer.get('id'),
                                'type': 'referral',
                                'title': 'Referral Bonus Credited! 🎉',
                                'message': f"{new_user.get('name')} (@{new_user.get('username')}) registered using your code! +{referrer_reward} Referral Points credited.",
                                'link': 'profile',
                                'read': False,
                                'metadata': {'points': referrer_reward, 'referredId': user_id, 'referredUsername': new_user.get('username')},
                                'createdAt': datetime.now(timezone.utc).isoformat()
                            })
                            # Notify New Student
                            notifs.insert(0, {
                                'id': f"notif-{int(datetime.now().timestamp() * 1000) + 1}",
                                'userId': user_id,
                                'type': 'referral',
                                'title': 'Welcome Referral Bonus! 🎁',
                                'message': f"You joined with referral code @{referrer.get('username')}! +{new_student_reward} Referral Points credited to your account.",
                                'link': 'profile',
                                'read': False,
                                'metadata': {'points': new_student_reward, 'referrerId': referrer.get('id')},
                                'createdAt': datetime.now(timezone.utc).isoformat()
                            })
                            data['notifications'] = notifs

                save_backend_data(data)

                sanitized = dict(new_user)
                sanitized.pop('password', None)

                # Real-time synchronization to Firebase Realtime Database
                sync_to_firebase(f"users/{user_id}", sanitized, method='PUT')
                if raw_ref and 'referrer' in locals() and referrer:
                    sync_to_firebase(f"users/{referrer.get('id')}", {
                        'referralPoints': referrer.get('referralPoints', 0),
                        'referralCount': referrer.get('referralCount', 0)
                    }, method='PATCH')
                    if 'ref_record' in locals() and ref_record:
                        sync_to_firebase(f"referrals/{ref_record['id']}", ref_record, method='PUT')

                self.send_json(200, {
                    'success': True,
                    'message': 'Student registered successfully.',
                    'user': sanitized,
                    'token': new_token
                })
                return
            except Exception as e:
                self.send_json(400, {'success': False, 'error': f'Invalid registration payload: {str(e)}'})
                return

        # 1. Secure File Upload (PDF)
        if path == '/api/files/upload':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Unauthorized: Authentication required.', 'code': 401})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 30 * 1024 * 1024:
                    self.send_json(413, {'error': 'Payload Too Large: File exceeds 25 MB limit.', 'code': 413})
                    return
                body = self.rfile.read(content_length)
                post_data = json.loads(body.decode('utf-8'))
                file_name = post_data.get('fileName', 'document.pdf')
                file_data_b64 = post_data.get('fileData', '')
                category = post_data.get('category', 'submission')
                paper_id = post_data.get('paperId') or post_data.get('assignmentId')

                if category in ['question', 'answer'] and user.get('role') not in ['admin', 'teacher']:
                    self.send_json(403, {'error': 'Forbidden: Faculty or admin only.', 'code': 403})
                    return

                # Prevent re-upload of answer sheet
                if category == 'submission' and user.get('role') == 'student' and paper_id:
                    data = load_backend_data()
                    existing = [s for s in data.get('submissions', []) if (s.get('assignmentId') == paper_id or s.get('paperId') == paper_id) and s.get('studentId') == user.get('id')]
                    if existing:
                        self.send_json(403, {'error': 'Forbidden: Re-upload is not permitted. You have already submitted an answer sheet for this test paper.', 'code': 403})
                        return
                if ',' in file_data_b64:
                    file_data_b64 = file_data_b64.split(',', 1)[1]
                binary_data = base64.b64decode(file_data_b64)

                if not binary_data.startswith(b'%PDF'):
                    self.send_json(400, {'error': 'Validation Error: Only genuine PDF documents (%PDF-) are allowed.', 'code': 400})
                    return

                sanitized_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(file_name))
                if not sanitized_name.lower().endswith('.pdf'): sanitized_name += '.pdf'
                unique_id = f'{category}_{uuid.uuid4().hex[:12]}.pdf'
                dest_path = os.path.join(PRIVATE_STORAGE_DIR, unique_id)
                with open(dest_path, 'wb') as f:
                    f.write(binary_data)

                self.send_json(200, {
                    'success': True,
                    'fileId': unique_id,
                    'fileName': sanitized_name,
                    'fileSize': len(binary_data),
                    'category': category,
                    'uploadedBy': user.get('name')
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Upload processing error: {str(e)}', 'code': 500})
                return

        # 2. Image Upload (Question / Option Images)
        if path == '/api/files/upload-image':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 6 * 1024 * 1024:
                    self.send_json(413, {'error': 'Image exceeds 5 MB limit.', 'code': 413})
                    return
                body = self.rfile.read(content_length)
                post_data = json.loads(body.decode('utf-8'))
                file_name = post_data.get('fileName', 'image.png')
                file_data_b64 = post_data.get('fileData', '')

                mime_prefix = 'data:image/png;base64,'
                if ',' in file_data_b64:
                    prefix_part, file_data_b64 = file_data_b64.split(',', 1)
                    mime_prefix = prefix_part + ','
                binary_data = base64.b64decode(file_data_b64)

                # Validate magic bytes for PNG, JPEG, WEBP, GIF
                is_valid = (
                    binary_data.startswith(b'\x89PNG\r\n\x1a\n') or
                    binary_data.startswith(b'\xff\xd8\xff') or
                    (binary_data.startswith(b'RIFF') and b'WEBP' in binary_data[:16]) or
                    binary_data.startswith(b'GIF87a') or binary_data.startswith(b'GIF89a')
                )
                if not is_valid:
                    self.send_json(400, {'error': 'Invalid image file. Supported: PNG, JPG, WEBP, GIF.', 'code': 400})
                    return

                sanitized_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(file_name))
                unique_img_id = f'img_{uuid.uuid4().hex[:12]}_{sanitized_name}'
                dest_path = os.path.join(PRIVATE_IMAGES_DIR, unique_img_id)
                with open(dest_path, 'wb') as f:
                    f.write(binary_data)

                # Return full data URL so frontend renders directly without extra HTTP auth roundtrips
                data_url = mime_prefix + base64.b64encode(binary_data).decode('utf-8')

                self.send_json(200, {
                    'success': True,
                    'imageId': unique_img_id,
                    'fileName': sanitized_name,
                    'imageUrl': data_url,
                    'size': len(binary_data)
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Image upload error: {str(e)}', 'code': 500})
                return

        # 2b. Subject Management (Create / Update / Delete)
        if path == '/api/subjects':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator privileges required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                data = load_backend_data()
                subjects = data.get('subjects', [])
                sub_id = req_data.get('id') or f"sub-{int(datetime.now().timestamp() * 1000)}"
                new_sub = {
                    'id': sub_id,
                    'name': str(req_data.get('name') or '').strip(),
                    'code': str(req_data.get('code') or '').strip().upper(),
                    'level': str(req_data.get('level') or 'CA Foundation').strip(),
                    'icon': str(req_data.get('icon') or 'book-open').strip()
                }
                if not new_sub['name']:
                    self.send_json(400, {'error': 'Subject name is required', 'code': 400})
                    return
                idx = next((i for i, s in enumerate(subjects) if s.get('id') == sub_id), None)
                if idx is not None:
                    subjects[idx] = new_sub
                else:
                    subjects.append(new_sub)
                data['subjects'] = subjects
                save_backend_data(data)
                self.send_json(200, {'success': True, 'subject': new_sub})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Subject save error: {str(e)}', 'code': 500})
                return

        if path == '/api/subjects/delete':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator privileges required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                sub_id = req_data.get('id')
                data = load_backend_data()
                data['subjects'] = [s for s in data.get('subjects', []) if s.get('id') != sub_id]
                save_backend_data(data)
                self.send_json(200, {'success': True})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Subject delete error: {str(e)}', 'code': 500})
                return

        # 2c. Student Notifications Management
        if path == '/api/notifications':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                data = load_backend_data()
                notifs = data.get('notifications', [])
                notif_id = req_data.get('id') or f"notif-{int(datetime.now().timestamp() * 1000)}"
                notif = {
                    'id': notif_id,
                    'userId': req_data.get('userId'),
                    'type': req_data.get('type', 'general'),
                    'title': req_data.get('title', ''),
                    'message': req_data.get('message', ''),
                    'link': req_data.get('link', ''),
                    'read': bool(req_data.get('read', False)),
                    'metadata': req_data.get('metadata', {}),
                    'createdAt': req_data.get('createdAt') or datetime.now(timezone.utc).isoformat()
                }
                notifs.insert(0, notif)
                data['notifications'] = notifs
                save_backend_data(data)
                self.send_json(200, {'success': True, 'notification': notif})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Notification error: {str(e)}', 'code': 500})
                return

        if path == '/api/notifications/read':
            token = self.get_auth_token()
            user = authenticate_token(token)
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                notif_id = req_data.get('id')
                all_for_user = req_data.get('all', False)
                data = load_backend_data()
                notifs = data.get('notifications', [])
                if all_for_user and user:
                    for n in notifs:
                        if n.get('userId') == user.get('id'):
                            n['read'] = True
                elif notif_id:
                    for n in notifs:
                        if n.get('id') == notif_id:
                            n['read'] = True
                data['notifications'] = notifs
                save_backend_data(data)
                self.send_json(200, {'success': True})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Notification read error: {str(e)}', 'code': 500})
                return

        # 2c-ii. Delete Individual Notification
        if path == '/api/notifications/delete':
            token = self.get_auth_token()
            user = authenticate_token(token)
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                notif_id = req_data.get('id')
                user_id = req_data.get('userId') or (user.get('id') if user else None)
                if not notif_id:
                    self.send_json(400, {'error': 'Notification ID required', 'code': 400})
                    return
                data = load_backend_data()
                notifs = data.get('notifications', [])
                initial_len = len(notifs)
                notifs = [n for n in notifs if not (n.get('id') == notif_id and (not user_id or n.get('userId') == user_id))]
                data['notifications'] = notifs
                save_backend_data(data)
                self.send_json(200, {'success': True, 'deleted': initial_len > len(notifs), 'id': notif_id})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Notification delete error: {str(e)}', 'code': 500})
                return

        # 2c-iii. Clear All Notifications For User
        if path == '/api/notifications/clear':
            token = self.get_auth_token()
            user = authenticate_token(token)
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                user_id = req_data.get('userId') or (user.get('id') if user else None)
                if not user_id:
                    self.send_json(400, {'error': 'User ID required to clear notifications', 'code': 400})
                    return
                data = load_backend_data()
                notifs = data.get('notifications', [])
                before_count = len(notifs)
                notifs = [n for n in notifs if n.get('userId') != user_id]
                cleared_count = before_count - len(notifs)
                data['notifications'] = notifs
                save_backend_data(data)
                self.send_json(200, {'success': True, 'clearedCount': cleared_count})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Notification clear error: {str(e)}', 'code': 500})
                return

        # 2c-iv. Authoritative XP Award & Ledger Transaction
        if path == '/api/xp/award':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                target_user_id = req_data.get('userId') or user.get('id')
                source_type = req_data.get('sourceType', 'general')
                source_id = req_data.get('sourceId', '')
                activity_name = req_data.get('activityName', 'XP Award')
                points = int(req_data.get('points', 0))
                result_status = req_data.get('resultStatus', '')
                idempotency_key = req_data.get('idempotencyKey')
                metadata = req_data.get('metadata', {})

                data = load_backend_data()
                tx, is_new = award_xp_transaction(
                    data, target_user_id, source_type, source_id,
                    activity_name, points, result_status,
                    idempotency_key=idempotency_key, metadata=metadata
                )
                save_backend_data(data)

                target_user = next((u for u in data.get('users', {}).values() if u.get('id') == target_user_id), None)
                total_xp = target_user.get('totalXp', 0) if target_user else 0

                self.send_json(200, {
                    'success': True,
                    'transaction': tx,
                    'isNew': is_new,
                    'totalXp': total_xp
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Award XP error: {str(e)}', 'code': 500})
                return

        # 2c-v. Admin Student XP Management (Add, Remove, Set)
        if path == '/api/admin/xp/manage':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator privileges required', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                
                student_identifier = str(req_data.get('studentId') or req_data.get('userId') or req_data.get('username') or '').strip().lstrip('@').lower()
                action = str(req_data.get('action', 'add')).lower()
                try:
                    amount = int(req_data.get('amount', 0))
                except (ValueError, TypeError):
                    self.send_json(400, {'error': 'Invalid numeric amount', 'code': 400})
                    return
                reason = str(req_data.get('reason', 'Administrative adjustment')).strip()

                if not student_identifier:
                    self.send_json(400, {'error': 'Student username or ID required', 'code': 400})
                    return

                if amount < 0 and action in ['add', 'set']:
                    self.send_json(400, {'error': 'Amount must be non-negative', 'code': 400})
                    return

                data = load_backend_data()
                target_student = next((u for u in data.get('users', {}).values() if u.get('id') == student_identifier or (u.get('username') or '').lower() == student_identifier or (u.get('email') or '').lower() == student_identifier), None)

                if not target_student:
                    self.send_json(404, {'error': f'Student "{student_identifier}" not found', 'code': 404})
                    return

                old_xp = int(target_student.get('totalXp', 0))

                if action == 'add':
                    new_xp = old_xp + amount
                    diff = amount
                elif action == 'remove':
                    new_xp = max(0, old_xp - amount)
                    diff = new_xp - old_xp
                elif action == 'set':
                    new_xp = max(0, amount)
                    diff = new_xp - old_xp
                else:
                    self.send_json(400, {'error': f'Unsupported action: {action}. Use add, remove, or set.', 'code': 400})
                    return

                target_student['totalXp'] = new_xp
                if 'baseXp' in target_student and new_xp == 0:
                    target_student['baseXp'] = 0

                # Record authoritative audit transaction in xp_transactions
                tx_id = f"tx-admin-{int(datetime.now().timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
                act_str = action == 'set' and f"Set to {new_xp} XP" or f"{diff >= 0 and '+' or ''}{diff} XP"
                admin_display = user.get('name') or user.get('username') or 'admin'
                tx = {
                    'id': tx_id,
                    'idempotencyKey': f"admin_adj_{target_student.get('id')}_{int(datetime.now().timestamp() * 1000)}",
                    'userId': target_student.get('id'),
                    'studentName': target_student.get('name') or 'Student',
                    'studentUsername': target_student.get('username') or 'Not set',
                    'sourceType': 'admin_adjustment',
                    'source': f'admin_{action}',
                    'sourceId': user.get('id'),
                    'action': action,
                    'activityName': f"Admin XP {action.capitalize()}: {act_str}",
                    'description': reason or f"Admin {action} XP",
                    'points': diff,
                    'previousXp': old_xp,
                    'newXp': new_xp,
                    'adminUser': admin_display,
                    'resultStatus': f"Previous: {old_xp} XP → New: {new_xp} XP",
                    'metadata': {
                        'action': action,
                        'amount': amount,
                        'previousXp': old_xp,
                        'newXp': new_xp,
                        'adminName': user.get('name'),
                        'adminUsername': user.get('username') or user.get('email'),
                        'reason': reason
                    },
                    'createdAt': datetime.now(timezone.utc).isoformat()
                }
                if 'xp_transactions' not in data:
                    data['xp_transactions'] = []
                data['xp_transactions'].insert(0, tx)

                # Send notification to the student
                notifs = data.get('notifications', [])
                notifs.insert(0, {
                    'id': f"notif-{int(datetime.now().timestamp() * 1000)}",
                    'userId': target_student.get('id'),
                    'type': 'points_received',
                    'title': 'Academic XP Adjusted ⚖️',
                    'message': f"Your XP was adjusted by Administrator: {diff >= 0 and '+' or ''}{diff} XP (New Total: {new_xp} XP). Reason: {reason}",
                    'link': 'profile',
                    'read': False,
                    'metadata': {'previousXp': old_xp, 'newXp': new_xp, 'diff': diff},
                    'createdAt': datetime.now(timezone.utc).isoformat()
                })
                data['notifications'] = notifs

                save_backend_data(data)

                # Real-time synchronization to Firebase Realtime Database
                sync_to_firebase(f"users/{target_student.get('id')}", {'totalXp': new_xp, 'baseXp': target_student.get('baseXp', 0)}, method='PATCH')
                sync_to_firebase(f"xp_transactions/{tx_id}", tx, method='PUT')

                sanitized_student = dict(target_student)
                sanitized_student.pop('password', None)

                self.send_json(200, {
                    'success': True,
                    'message': f'XP successfully updated for {target_student.get("name")}',
                    'student': sanitized_student,
                    'previousXp': old_xp,
                    'newXp': new_xp,
                    'diff': diff,
                    'transaction': tx
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Admin XP adjust error: {str(e)}', 'code': 500})
                return

        # 2c-v-b. Admin Bulk Set Student XP
        if path == '/api/admin/xp/bulk-set':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                target_xp = max(0, int(req_data.get('amount', 0)))
                reason = req_data.get('reason') or f"Admin bulk set all students to {target_xp} XP"
                admin_name = user.get('name') or user.get('username') or 'admin'

                data = load_backend_data()
                users = data.get('users', {})
                if 'xp_transactions' not in data:
                    data['xp_transactions'] = []

                affected = 0
                now_iso = datetime.now(timezone.utc).isoformat()
                now_ts = int(datetime.now().timestamp() * 1000)

                for u in users.values():
                    if u.get('role') == 'student':
                        old_xp = int(u.get('totalXp', 0))
                        diff = target_xp - old_xp
                        u['totalXp'] = target_xp
                        u['baseXp'] = 0
                        affected += 1

                        tx_id = f"tx-bulk-{now_ts}-{uuid.uuid4().hex[:6]}"
                        tx = {
                            'id': tx_id,
                            'idempotencyKey': f"bulk_set_{u.get('id')}_{now_ts}",
                            'userId': u.get('id'),
                            'studentName': u.get('name') or 'Student',
                            'studentUsername': u.get('username') or 'Not set',
                            'sourceType': 'admin_adjustment',
                            'source': 'admin_set',
                            'sourceId': user.get('id'),
                            'action': 'set',
                            'activityName': f"Admin Bulk Set: {target_xp} XP",
                            'description': reason,
                            'points': diff,
                            'previousXp': old_xp,
                            'newXp': target_xp,
                            'adminUser': admin_name,
                            'resultStatus': f"Previous: {old_xp} XP → New: {target_xp} XP",
                            'metadata': {'action': 'bulk_set', 'amount': target_xp, 'reason': reason},
                            'createdAt': now_iso
                        }
                        data['xp_transactions'].insert(0, tx)
                        sync_to_firebase(f"users/{u.get('id')}", {'totalXp': target_xp, 'baseXp': 0}, method='PATCH')
                        sync_to_firebase(f"xp_transactions/{tx_id}", tx, method='PUT')

                save_backend_data(data)
                self.send_json(200, {
                    'success': True,
                    'count': affected,
                    'amount': target_xp,
                    'studentsAffected': affected,
                    'message': f"All {affected} students' points have been set to {target_xp}."
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Bulk set error: {str(e)}', 'code': 500})
                return

        # 2c-v-c. Admin Remove Student (Hard-Fix End-to-End)
        if path == '/api/admin/users/delete':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                student_id = req_data.get('studentId') or req_data.get('id')
                username = req_data.get('username')
                email = req_data.get('email')

                data = load_backend_data()
                users = data.get('users', {})
                target_key = None
                target_student = None

                for k, u in list(users.items()):
                    if (student_id and u.get('id') == student_id) or \
                       (username and (u.get('username') or '').lower().lstrip('@') == str(username).lower().lstrip('@')) or \
                       (email and (u.get('email') or '').lower() == str(email).lower()):
                        target_key = k
                        target_student = u
                        break

                if not target_student:
                    self.send_json(404, {'error': 'Student not found.', 'code': 404})
                    return

                # Prevent deleting administrators
                if target_student.get('role') == 'admin':
                    self.send_json(403, {'error': 'Security Policy: Administrator accounts cannot be deleted.', 'code': 403})
                    return

                # Permanently remove student
                del users[target_key]
                st_id = target_student.get('id')

                # Clean up associated student records
                if 'submissions' in data:
                    data['submissions'] = [s for s in data['submissions'] if s.get('studentId') != st_id and s.get('userId') != st_id]
                if 'test_attempts' in data:
                    data['test_attempts'] = [a for a in data['test_attempts'] if a.get('userId') != st_id]
                if 'notifications' in data:
                    data['notifications'] = [n for n in data['notifications'] if n.get('userId') != st_id]
                if 'bookmarks' in data:
                    data['bookmarks'] = [b for b in data['bookmarks'] if b.get('userId') != st_id]

                save_backend_data(data)

                # Delete from Firebase Realtime Database
                if st_id:
                    sync_to_firebase(f"users/{st_id}", None, method='DELETE')

                self.send_json(200, {
                    'success': True,
                    'message': f"Student account for {target_student.get('name')} (@{target_student.get('username')}) permanently deleted.",
                    'deletedId': st_id
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Delete error: {str(e)}', 'code': 500})
                return

        # 2c-vi. XP Reset Settings (Save schedule)
        if path == '/api/admin/xp-reset/settings':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator privileges required', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                
                data = load_backend_data()
                current_settings = data.get('xp_reset_settings', {})

                if 'enabled' in req_data:
                    current_settings['enabled'] = bool(req_data['enabled'])
                if 'interval' in req_data:
                    current_settings['interval'] = str(req_data['interval'])
                if 'scheduledTime' in req_data:
                    current_settings['scheduledTime'] = str(req_data['scheduledTime'])
                if 'intervalDays' in req_data:
                    current_settings['intervalDays'] = max(1, int(req_data['intervalDays']))
                if 'customSeconds' in req_data:
                    current_settings['customSeconds'] = int(req_data['customSeconds']) if req_data['customSeconds'] else None
                if 'nextReset' in req_data:
                    current_settings['nextReset'] = str(req_data['nextReset']) if req_data['nextReset'] else None
                elif current_settings.get('enabled') and not current_settings.get('nextReset'):
                    interval_days = int(current_settings.get('intervalDays', 90))
                    current_settings['nextReset'] = (datetime.now(timezone.utc) + timedelta(days=interval_days)).isoformat()

                current_settings['updatedAt'] = datetime.now(timezone.utc).isoformat()
                current_settings['updatedBy'] = user.get('name')
                data['xp_reset_settings'] = current_settings
                save_backend_data(data)

                # Sync to Firebase Realtime Database
                sync_to_firebase("xp_reset_settings", current_settings, method='PUT')

                self.send_json(200, {'success': True, 'settings': current_settings})
                return
            except Exception as e:
                self.send_json(500, {'error': f'XP Reset settings error: {str(e)}', 'code': 500})
                return

        # 2c-vii. XP Reset Manual Trigger
        if path == '/api/admin/xp-reset/trigger':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator privileges required', 'code': 403})
                return
            try:
                data = load_backend_data()
                event = execute_xp_reset(data, triggered_by='manual', admin_user=user)
                self.send_json(200, {
                    'success': True,
                    'message': f'XP reset executed successfully for {event.get("studentsAffected", 0)} students.',
                    'event': event,
                    'settings': data.get('xp_reset_settings', {})
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'XP Reset trigger error: {str(e)}', 'code': 500})
                return

        # 2c-viii. Referral Rewards Settings (Admin save)
        if path == '/api/admin/referrals/settings':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator privileges required', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                
                referrer_reward = max(0, int(req_data.get('referrerReward', 100)))
                new_student_reward = max(0, int(req_data.get('newStudentReward', 100)))

                data = load_backend_data()
                settings = {
                    'referrerReward': referrer_reward,
                    'newStudentReward': new_student_reward,
                    'updatedAt': datetime.now(timezone.utc).isoformat(),
                    'updatedBy': user.get('name')
                }
                data['referral_settings'] = settings
                save_backend_data(data)

                self.send_json(200, {'success': True, 'settings': settings})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Referral settings error: {str(e)}', 'code': 500})
                return

        # 2d. Bookmarks Management (Toggle)
        if path == '/api/bookmarks/toggle':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                item_id = req_data.get('itemId')
                item_type = req_data.get('itemType', 'test')
                user_id = user.get('id')
                data = load_backend_data()
                bookmarks = data.get('bookmarks', [])
                existing = next((b for b in bookmarks if b.get('userId') == user_id and b.get('itemId') == item_id), None)
                if existing:
                    bookmarks = [b for b in bookmarks if not (b.get('userId') == user_id and b.get('itemId') == item_id)]
                    is_bookmarked = False
                else:
                    new_bm = {
                        'id': f"bm-{int(datetime.now().timestamp() * 1000)}",
                        'userId': user_id,
                        'itemId': item_id,
                        'itemType': item_type,
                        'createdAt': datetime.now(timezone.utc).isoformat()
                    }
                    bookmarks.append(new_bm)
                    is_bookmarked = True
                data['bookmarks'] = bookmarks
                save_backend_data(data)
                self.send_json(200, {'success': True, 'bookmarked': is_bookmarked})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Bookmark toggle error: {str(e)}', 'code': 500})
                return

        # 3. Descriptive Papers Management
        if path == '/api/papers':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Admin only.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                paper_data = json.loads(body.decode('utf-8'))
                data = load_backend_data()
                papers = data.get('papers', [])
                paper_id = paper_data.get('id')
                if paper_id:
                    idx = next((i for i, p in enumerate(papers) if p.get('id') == paper_id), None)
                    if idx is not None:
                        papers[idx].update(paper_data)
                    else:
                        papers.insert(0, paper_data)
                else:
                    paper_data['id'] = f'paper-{int(datetime.now().timestamp())}'
                    paper_data['createdAt'] = datetime.now(timezone.utc).isoformat()
                    papers.insert(0, paper_data)
                data['papers'] = papers
                save_backend_data(data)
                self.send_json(200, {'success': True, 'paper': paper_data})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Failed to save paper: {str(e)}', 'code': 500})
                return

        # 3b. Descriptive Paper Submissions & Evaluation Updates
        if path == '/api/papers/submissions':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required', 'code': 401})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                sub_data = json.loads(body.decode('utf-8'))
                paper_id = sub_data.get('assignmentId') or sub_data.get('paperId')

                data = load_backend_data()
                submissions = data.get('submissions', [])
                sub_id = sub_data.get('id')

                # If existing submission (e.g. grading update by Admin/Teacher)
                if sub_id:
                    existing_idx = next((i for i, s in enumerate(submissions) if s.get('id') == sub_id), None)
                    if existing_idx is not None:
                        submissions[existing_idx].update(sub_data)
                        pts = sub_data.get('pointsAwarded')
                        if pts is not None and int(pts) > 0:
                            student_id = submissions[existing_idx].get('studentId')
                            target_paper_id = submissions[existing_idx].get('assignmentId') or submissions[existing_idx].get('paperId') or paper_id
                            pap = next((p for p in data.get('papers', []) if p.get('id') == target_paper_id), {})
                            award_xp_transaction(
                                data, student_id, 'paper_submission', target_paper_id,
                                pap.get('title') or 'Test Paper Evaluation',
                                int(pts),
                                f"Score: {submissions[existing_idx].get('marksObtained', 0)}/{pap.get('maximumMarks', 100)} M",
                                idempotency_key=f"paper_submission_{sub_id}",
                                metadata={'marksObtained': submissions[existing_idx].get('marksObtained', 0), 'submissionId': sub_id}
                            )
                        data['submissions'] = submissions
                        save_backend_data(data)
                        self.send_json(200, {'success': True, 'submission': submissions[existing_idx]})
                        return

                if user.get('role') == 'student':
                    # STRICT ONE-TIME SUBMISSION CHECK (NO RE-UPLOAD)
                    existing = [s for s in submissions if (s.get('assignmentId') == paper_id or s.get('paperId') == paper_id) and s.get('studentId') == user.get('id')]
                    if existing:
                        self.send_json(403, {'error': 'Forbidden: Re-upload is not permitted. You have already submitted an answer sheet for this examination paper.', 'code': 403})
                        return

                submissions.insert(0, sub_data)
                data['submissions'] = submissions
                save_backend_data(data)
                self.send_json(200, {'success': True, 'submission': sub_data})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Submission error: {str(e)}', 'code': 500})
                return

        # 4. MCQ TEST MANAGEMENT (Create / Edit)
        if path == '/api/tests':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                test_data = json.loads(body.decode('utf-8'))

                required = ['title', 'subject', 'topic']
                for r in required:
                    if not test_data.get(r):
                        self.send_json(400, {'error': f'Missing required field: {r}', 'code': 400})
                        return

                data = load_backend_data()
                tests = data.get('tests', [])
                test_id = test_data.get('id')

                # Dynamic subject validation: support custom admin-created subjects
                custom_subjects = [s.get('name') for s in data.get('subjects', []) if s.get('name')]
                valid_subjects = list(set(['Accounting', 'Business Law', 'Business Economics', 'Quantitative Aptitude'] + custom_subjects))
                if test_data.get('subject') and test_data.get('subject') not in valid_subjects:
                    valid_subjects.append(test_data.get('subject'))

                # Ensure numerical defaults
                test_data['durationMinutes'] = int(test_data.get('durationMinutes', 15))
                test_data['marksPerCorrect'] = float(test_data.get('marksPerCorrect', 2.0))
                test_data['negativeMarksPerWrong'] = float(test_data.get('negativeMarksPerWrong', 0.5))
                test_data['pointsPerCorrect'] = float(test_data.get('pointsPerCorrect', test_data.get('marksPerCorrect', 2.0)))
                test_data['examLevel'] = test_data.get('examLevel', 'CA Foundation')
                test_data['unattemptedMarks'] = float(test_data.get('unattemptedMarks', 0.0))
                test_data['maxAttempts'] = int(test_data.get('maxAttempts', 3))
                test_data['maximumMarks'] = float(test_data.get('maximumMarks', 10.0))
                test_data['status'] = test_data.get('status', 'Draft')
                test_data['isPublished'] = (test_data.get('status') == 'Published')

                if not test_data.get('subjectId'):
                    sub_match = next((s for s in data.get('subjects', []) if s.get('name') == test_data.get('subject')), None)
                    if sub_match:
                        test_data['subjectId'] = sub_match.get('id')
                    else:
                        sub_id_map = {
                            'Accounting': 'sub-1',
                            'Business Law': 'sub-2',
                            'Business Economics': 'sub-3',
                            'Quantitative Aptitude': 'sub-4'
                        }
                        test_data['subjectId'] = sub_id_map.get(test_data.get('subject'), 'sub-1')

                if test_id:
                    idx = next((i for i, t in enumerate(tests) if t.get('id') == test_id), None)
                    if idx is not None:
                        tests[idx].update(test_data)
                        test_data = tests[idx]
                    else:
                        tests.append(test_data)
                else:
                    test_data['id'] = f'tst-{int(datetime.now().timestamp() * 1000)}'
                    test_data['createdAt'] = datetime.now(timezone.utc).isoformat()
                    test_data['totalQuestions'] = 0
                    test_data['attemptsCount'] = 0
                    test_data['maximumMarks'] = float(test_data.get('maximumMarks', 10.0))
                    tests.insert(0, test_data)

                data['tests'] = tests
                save_backend_data(data)
                self.send_json(200, {'success': True, 'test': test_data})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Failed to save test: {str(e)}', 'code': 500})
                return

        # 5. MCQ Test Schedule / Publish
        if path == '/api/tests/publish':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                test_id = req_data.get('testId')
                new_status = req_data.get('status', 'Published')

                data = load_backend_data()
                tests = data.get('tests', [])
                target = next((t for t in tests if t.get('id') == test_id), None)
                if not target:
                    self.send_json(404, {'error': 'Test not found', 'code': 404})
                    return

                target['status'] = new_status
                target['isPublished'] = (new_status in ['Published', 'Live'])
                if req_data.get('scheduledPublishTime'):
                    target['scheduledPublishTime'] = req_data.get('scheduledPublishTime')
                if req_data.get('liveStartTime'):
                    target['liveStartTime'] = req_data.get('liveStartTime')
                if req_data.get('liveEndTime'):
                    target['liveEndTime'] = req_data.get('liveEndTime')

                save_backend_data(data)
                self.send_json(200, {'success': True, 'test': target})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Publish error: {str(e)}', 'code': 500})
                return

        # 6. MCQ Test Delete
        if path == '/api/tests/delete':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                target_id = req_data.get('id')

                data = load_backend_data()
                data['tests'] = [t for t in data.get('tests', []) if t.get('id') != target_id]
                data['questions'] = [q for q in data.get('questions', []) if q.get('testId') != target_id]
                save_backend_data(data)
                self.send_json(200, {'success': True, 'deletedId': target_id})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Delete error: {str(e)}', 'code': 500})
                return

        # 7. MCQ QUESTIONS (Add / Edit / Duplicate / Reorder)
        if path == '/api/tests/questions':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                action = req_data.get('action')

                data = load_backend_data()
                questions = data.get('questions', [])
                tests = data.get('tests', [])

                if action == 'duplicate':
                    q_id = req_data.get('questionId')
                    orig = next((q for q in questions if q.get('id') == q_id), None)
                    if not orig:
                        self.send_json(404, {'error': 'Original question not found', 'code': 404})
                        return
                    dup = dict(orig)
                    dup['id'] = f'q-{int(datetime.now().timestamp() * 1000)}'
                    test_qs = [q for q in questions if q.get('testId') == orig.get('testId')]
                    dup['number'] = len(test_qs) + 1
                    dup['text'] = f"{orig.get('text')} (Copy)"
                    questions.append(dup)

                    # Update totalQuestions
                    for t in tests:
                        if t.get('id') == orig.get('testId'):
                            t['totalQuestions'] = len([q for q in questions if q.get('testId') == t.get('id')])
                            t['maximumMarks'] = t['totalQuestions'] * t.get('marksPerCorrect', 2.0)

                    save_backend_data(data)
                    self.send_json(200, {'success': True, 'question': dup})
                    return

                elif action == 'reorder':
                    test_id = req_data.get('testId')
                    order_ids = req_data.get('questionIds', [])
                    for idx, qid in enumerate(order_ids):
                        for q in questions:
                            if q.get('id') == qid:
                                q['number'] = idx + 1
                    save_backend_data(data)
                    self.send_json(200, {'success': True, 'order': order_ids})
                    return

                else:
                    # Create or update question
                    q_id = req_data.get('id')
                    test_id = req_data.get('testId')
                    if not test_id:
                        self.send_json(400, {'error': 'Missing testId for question', 'code': 400})
                        return

                    if q_id:
                        idx = next((i for i, q in enumerate(questions) if q.get('id') == q_id), None)
                        if idx is not None:
                            questions[idx].update(req_data)
                            target_q = questions[idx]
                        else:
                            questions.append(req_data)
                            target_q = req_data
                    else:
                        req_data['id'] = f'q-{int(datetime.now().timestamp() * 1000)}'
                        test_qs = [q for q in questions if q.get('testId') == test_id]
                        req_data['number'] = len(test_qs) + 1
                        questions.append(req_data)
                        target_q = req_data

                    # Update test totalQuestions count & maxMarks
                    for t in tests:
                        if t.get('id') == test_id:
                            t['totalQuestions'] = len([q for q in questions if q.get('testId') == test_id])
                            t['maximumMarks'] = t['totalQuestions'] * t.get('marksPerCorrect', 2.0)

                    save_backend_data(data)
                    self.send_json(200, {'success': True, 'question': target_q})
                    return
            except Exception as e:
                self.send_json(500, {'error': f'Question save error: {str(e)}', 'code': 500})
                return

        # 8. MCQ Question Delete
        if path == '/api/tests/questions/delete':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                q_id = req_data.get('id')

                data = load_backend_data()
                orig = next((q for q in data.get('questions', []) if q.get('id') == q_id), None)
                if orig:
                    test_id = orig.get('testId')
                    data['questions'] = [q for q in data.get('questions', []) if q.get('id') != q_id]
                    # Renumber remaining
                    rem = [q for q in data.get('questions', []) if q.get('testId') == test_id]
                    rem.sort(key=lambda x: x.get('number', 0))
                    for i, q in enumerate(rem):
                        q['number'] = i + 1
                    for t in data.get('tests', []):
                        if t.get('id') == test_id:
                            t['totalQuestions'] = len(rem)
                            t['maximumMarks'] = len(rem) * t.get('marksPerCorrect', 2.0)
                    save_backend_data(data)
                self.send_json(200, {'success': True, 'deletedId': q_id})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Question delete error: {str(e)}', 'code': 500})
                return

        # 8b. Bulk Import MCQs (Save to database and Firebase)
        if path == '/api/tests/questions/bulk':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                test_id = req_data.get('testId')
                incoming_questions = req_data.get('questions', [])
                publish_immediately = bool(req_data.get('publishImmediately', False))

                if not test_id or not incoming_questions:
                    self.send_json(400, {'error': 'Missing testId or questions array', 'code': 400})
                    return

                data = load_backend_data()
                tests = data.get('tests', [])
                target_test = next((t for t in tests if t.get('id') == test_id), None)
                if not target_test:
                    self.send_json(404, {'error': f'Test with ID {test_id} not found', 'code': 404})
                    return

                if 'questions' not in data:
                    data['questions'] = []

                existing_qs = [q for q in data['questions'] if q.get('testId') == test_id]
                next_number = len(existing_qs) + 1
                saved_questions = []
                now_ts = int(datetime.now().timestamp() * 1000)

                for idx, in_q in enumerate(incoming_questions):
                    q_text = str(in_q.get('text') or in_q.get('question') or '').strip()
                    if not q_text:
                        continue

                    opts = in_q.get('options')
                    if isinstance(opts, list):
                        opt_dict = {}
                        letters = ['A', 'B', 'C', 'D']
                        for i, opt in enumerate(opts):
                            if i < len(letters):
                                opt_dict[letters[i]] = str(opt).strip()
                        opts = opt_dict
                    elif not isinstance(opts, dict):
                        opts = {'A': '', 'B': '', 'C': '', 'D': ''}

                    correct_opt = str(in_q.get('correctOption') or in_q.get('correctAnswer') or in_q.get('suggestedAnswer') or 'A').strip().upper()
                    if correct_opt not in ['A', 'B', 'C', 'D']:
                        correct_opt = 'A'

                    marks = float(in_q.get('marks') or target_test.get('marksPerCorrect') or 2.0)
                    q_id = in_q.get('id') or f"q-{now_ts}-{idx+1}"

                    q_obj = {
                        'id': q_id,
                        'testId': test_id,
                        'subjectId': target_test.get('subjectId', ''),
                        'number': next_number,
                        'text': q_text,
                        'options': opts,
                        'correctOption': correct_opt,
                        'marks': marks,
                        'negativeMarks': float(in_q.get('negativeMarks') or target_test.get('negativeMarkPerWrong') or 0.5),
                        'explanation': str(in_q.get('explanation') or ''),
                        'isDraft': not publish_immediately,
                        'createdAt': datetime.now(timezone.utc).isoformat()
                    }
                    data['questions'].append(q_obj)
                    saved_questions.append(q_obj)
                    sync_to_firebase(f"questions/{q_id}", q_obj, method='PUT')
                    next_number += 1

                # Update target test question count & marks
                all_test_qs = [q for q in data['questions'] if q.get('testId') == test_id]
                target_test['totalQuestions'] = len(all_test_qs)
                target_test['maximumMarks'] = sum(float(q.get('marks', 2.0)) for q in all_test_qs)
                if publish_immediately:
                    target_test['isPublished'] = True
                save_backend_data(data)
                sync_to_firebase(f"tests/{test_id}", target_test, method='PUT')

                self.send_json(200, {
                    'success': True,
                    'count': len(saved_questions),
                    'questions': saved_questions,
                    'test': target_test
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Bulk question import error: {str(e)}', 'code': 500})
                return

        # 8c. Student Profile Update (Enforcing Username Immutability Server-Side)
        if path == '/api/user/profile':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required.', 'code': 401})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))

                # IMMUTABILITY CHECK FOR STUDENTS:
                req_username = req_data.get('username')
                if user.get('role') == 'student' and req_username:
                    current_uname = (user.get('username') or '').strip().lower().lstrip('@')
                    clean_req_uname = str(req_username).strip().lower().lstrip('@')
                    if clean_req_uname != current_uname:
                        self.send_json(403, {
                            'success': False,
                            'error': 'Security Policy: Student username is permanent and cannot be modified after registration.'
                        })
                        return

                data = load_backend_data()
                users = data.get('users', {})
                target_u = next((u for u in users.values() if u.get('id') == user.get('id')), None)
                if not target_u:
                    self.send_json(404, {'error': 'User not found.', 'code': 404})
                    return

                # Allowed updates for students
                if 'name' in req_data and req_data['name'].strip():
                    target_u['name'] = req_data['name'].strip()
                if 'phone' in req_data:
                    target_u['phone'] = str(req_data['phone']).strip()
                if 'caLevel' in req_data:
                    target_u['caLevel'] = str(req_data['caLevel']).strip()
                if 'state' in req_data:
                    target_u['state'] = str(req_data['state']).strip()
                if 'district' in req_data:
                    target_u['district'] = str(req_data['district']).strip()
                    target_u['city'] = str(req_data['district']).strip()

                save_backend_data(data)

                sanitized = dict(target_u)
                sanitized.pop('password', None)
                sync_to_firebase(f"users/{target_u.get('id')}", sanitized, method='PATCH')

                self.send_json(200, {'success': True, 'user': sanitized})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Profile update error: {str(e)}', 'code': 500})
                return

        # 9. IMPORT MCQs FROM PDF
        if path == '/api/tests/import-pdf':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                test_id = req_data.get('testId')
                pdf_b64 = req_data.get('pdfData', '')
                raw_text_override = req_data.get('rawText', '')

                if ',' in pdf_b64:
                    pdf_b64 = pdf_b64.split(',', 1)[1]
                pdf_bytes = base64.b64decode(pdf_b64) if pdf_b64 else b''

                extracted_text = ''
                if pdf_bytes:
                    if not pdf_bytes.startswith(b'%PDF'):
                        self.send_json(400, {'error': 'Validation Error: Only genuine PDF documents (%PDF-) are accepted.', 'code': 400})
                        return
                    extracted_text = extract_text_from_pdf(pdf_bytes)

                if raw_text_override:
                    extracted_text = raw_text_override + '\n' + extracted_text

                if not extracted_text.strip():
                    self.send_json(400, {'error': 'Could not extract readable text from PDF.', 'code': 400})
                    return

                data = load_backend_data()
                existing_qs = [q for q in data.get('questions', []) if q.get('testId') == test_id]

                parsed_questions = parse_mcq_text_from_doc(extracted_text, existing_qs)

                for q in parsed_questions:
                    q['testId'] = test_id
                    q['isDraft'] = True # MANDATORY DRAFT / NEEDS REVIEW RULE

                self.send_json(200, {
                    'success': True,
                    'extractedCount': len(parsed_questions),
                    'questions': parsed_questions
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'PDF import parsing error: {str(e)}', 'code': 500})
                return

        # 10. TEST ATTEMPT START (Server-Side Attempt Enforcement)
        if path == '/api/tests/start':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required to start a test', 'code': 401})
                return

            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                test_id = req_data.get('testId')
                is_preview = req_data.get('isPreview', False)

                if is_preview:
                    if user.get('role') != 'admin':
                        self.send_json(403, {'error': 'Preview mode is strictly reserved for administrators.', 'code': 403})
                        return
                    self.send_json(200, {'success': True, 'isPreview': True, 'allowed': True})
                    return

                data = load_backend_data()
                tests = data.get('tests', [])
                target = next((t for t in tests if t.get('id') == test_id), None)
                if not target:
                    # If test was created on client, allow attempt with default 3 attempts
                    self.send_json(200, {
                        'success': True,
                        'allowed': True,
                        'attemptsUsed': 0,
                        'maxAttempts': 3,
                        'attemptsRemaining': 3
                    })
                    return

                max_attempts = int(target.get('maxAttempts', 3))
                attempts = data.get('test_attempts', [])
                user_attempts = [a for a in attempts if a.get('testId') == test_id and a.get('userId') == user.get('id')]
                used_count = len(user_attempts)

                if used_count >= max_attempts:
                    self.send_json(403, {
                        'error': f'Attempt limit reached. You have already used {used_count} of {max_attempts} allowed attempts.',
                        'code': 403,
                        'attemptsUsed': used_count,
                        'maxAttempts': max_attempts
                    })
                    return

                self.send_json(200, {
                    'success': True,
                    'allowed': True,
                    'attemptsUsed': used_count,
                    'maxAttempts': max_attempts,
                    'attemptsRemaining': max_attempts - used_count
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Start error: {str(e)}', 'code': 500})
                return

        # 11. TEST SUBMISSION & DYNAMIC RESULT CALCULATION
        if path == '/api/tests/submit':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'error': 'Authentication required to submit test', 'code': 401})
                return

            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8'))
                test_id = req_data.get('testId')
                answers = req_data.get('answers', {})
                time_taken = int(req_data.get('timeTakenSeconds', 60))
                is_preview = req_data.get('isPreview', False)

                data = load_backend_data()
                test = next((t for t in data.get('tests', []) if t.get('id') == test_id), None)
                if not test:
                    self.send_json(404, {'error': 'Test not found', 'code': 404})
                    return

                questions = [q for q in data.get('questions', []) if q.get('testId') == test_id]

                # If preview mode: calculate score but DO NOT record attempt!
                if is_preview:
                    correct_count = 0
                    wrong_count = 0
                    unattempted_count = 0
                    for q in questions:
                        chosen = answers.get(q.get('id'))
                        if not chosen:
                            unattempted_count += 1
                        elif chosen == q.get('correctOption'):
                            correct_count += 1
                        else:
                            wrong_count += 1

                    pos = float(test.get('marksPerCorrect', 2.0))
                    neg = float(test.get('negativeMarksPerWrong', 0.5))
                    gross = correct_count * pos
                    penalty = wrong_count * neg
                    score = max(0.0, gross - penalty)
                    max_marks = len(questions) * pos
                    pct = (score / max_marks * 100) if max_marks > 0 else 0

                    self.send_json(200, {
                        'success': True,
                        'isPreview': True,
                        'attempt': {
                            'id': 'preview-att',
                            'testId': test_id,
                            'userId': user.get('id'),
                            'correctCount': correct_count,
                            'wrongCount': wrong_count,
                            'unattemptedCount': unattempted_count,
                            'grossMarks': gross,
                            'negativePenalty': penalty,
                            'finalScore': score,
                            'maximumMarks': max_marks,
                            'percentage': pct,
                            'timeTakenSeconds': time_taken,
                            'answers': answers,
                            'questions': questions
                        }
                    })
                    return

                # Normal student submission: enforce attempt limits
                max_attempts = int(test.get('maxAttempts', 3))
                attempts = data.get('test_attempts', [])
                user_attempts = [a for a in attempts if a.get('testId') == test_id and a.get('userId') == user.get('id')]

                if len(user_attempts) >= max_attempts:
                    self.send_json(403, {
                        'error': f'Attempt limit reached. You have already completed {len(user_attempts)} of {max_attempts} allowed attempts.',
                        'code': 403
                    })
                    return

                correct_count = 0
                wrong_count = 0
                unattempted_count = 0

                for q in questions:
                    chosen = answers.get(q.get('id'))
                    if not chosen:
                        unattempted_count += 1
                    elif chosen == q.get('correctOption'):
                        correct_count += 1
                    else:
                        wrong_count += 1

                # Dynamic marking and platform points scheme
                pos = float(test.get('marksPerCorrect', 2.0))
                neg = float(test.get('negativeMarksPerWrong', 0.5))
                points_per_correct = float(test.get('pointsPerCorrect', pos))
                gross = correct_count * pos
                penalty = wrong_count * neg
                score = max(0.0, gross - penalty)
                earned_points = correct_count * points_per_correct
                max_marks = len(questions) * pos
                pct = (score / max_marks * 100) if max_marks > 0 else 0

                attempt_record = {
                    'id': f'att-{int(datetime.now().timestamp() * 1000)}',
                    'testId': test_id,
                    'testTitle': test.get('title'),
                    'userId': user.get('id'),
                    'userName': user.get('name'),
                    'attemptNumber': len(user_attempts) + 1,
                    'startedAt': datetime.now(timezone.utc).isoformat(),
                    'submittedAt': datetime.now(timezone.utc).isoformat(),
                    'timeTakenSeconds': time_taken,
                    'correctCount': correct_count,
                    'wrongCount': wrong_count,
                    'unattemptedCount': unattempted_count,
                    'grossMarks': gross,
                    'negativePenalty': penalty,
                    'finalScore': score,
                    'earnedPoints': earned_points,
                    'maximumMarks': max_marks,
                    'percentage': pct,
                    'userAnswers': answers
                }

                if earned_points > 0:
                    tx, is_new = award_xp_transaction(
                        data, user.get('id'), 'mcq_test', test_id,
                        test.get('title') or 'MCQ Mock Test',
                        int(earned_points),
                        f"{correct_count}/{len(questions)} Correct ({round(pct)}%)",
                        idempotency_key=f"mcq_attempt_{attempt_record['id']}",
                        metadata={'correctCount': correct_count, 'percentage': pct, 'testId': test_id}
                    )
                    notifs = data.get('notifications', [])
                    notifs.insert(0, {
                        'id': f"notif-{int(datetime.now().timestamp() * 1000)}",
                        'userId': user.get('id'),
                        'type': 'points_received',
                        'title': 'Platform Points Earned!',
                        'message': f"You earned +{earned_points} platform points on '{test.get('title')}'!",
                        'link': 'tests',
                        'read': False,
                        'metadata': {'points': earned_points, 'testId': test_id},
                        'createdAt': datetime.now(timezone.utc).isoformat()
                    })
                    data['notifications'] = notifs

                attempts.insert(0, attempt_record)
                data['test_attempts'] = attempts
                save_backend_data(data)

                # Fetch updated user total XP
                updated_u = next((u for u in data.get('users', {}).values() if u.get('id') == user.get('id')), {})

                # Return full evaluation report WITH questions and explanations
                self.send_json(200, {
                    'success': True,
                    'attempt': attempt_record,
                    'questions': questions,
                    'totalXp': updated_u.get('totalXp', 0),
                    'earnedPoints': earned_points
                })
                return
            except Exception as e:
                self.send_json(500, {'error': f'Evaluation error: {str(e)}', 'code': 500})
                return
        # Test Runner Report
        if path == '/api/test-report':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                results = json.loads(body.decode('utf-8'))
                with open(os.path.join(os.path.dirname(__file__), 'test_report.json'), 'w', encoding='utf-8') as f:
                    json.dump(results, f, indent=2)
                self.send_json(200, {'success': True})
                return
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

        self.send_json(404, {'error': 'Endpoint not found', 'code': 404})

def run_server(port=PORT):
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('', port), ExcellenceCAHandler) as httpd:
        print(f'==================================================')
        print(f' ExcellenceCA Secure Server running at:')
        print(f' http://localhost:{port}')
        print(f' Private Storage: {PRIVATE_STORAGE_DIR}')
        print(f'==================================================')
        # Start scheduled background XP reset worker
        worker_thread = threading.Thread(target=xp_reset_background_worker, daemon=True)
        worker_thread.start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down server.')
            httpd.server_close()

if __name__ == '__main__':
    run_server()
