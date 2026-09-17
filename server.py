import subscription_manager
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

# Support serverless / read-only filesystem environments (e.g. Vercel / AWS Lambda)
IS_SERVERLESS = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))
STORAGE_BASE = '/tmp' if IS_SERVERLESS else BASE_DIR

PRIVATE_STORAGE_DIR = os.path.join(STORAGE_BASE, 'private_storage')
PRIVATE_IMAGES_DIR = os.path.join(PRIVATE_STORAGE_DIR, 'images')
DATA_STORE_FILE = os.path.join(STORAGE_BASE, 'backend_data.json')

try:
    os.makedirs(PRIVATE_STORAGE_DIR, exist_ok=True)
    os.makedirs(PRIVATE_IMAGES_DIR, exist_ok=True)
except Exception as _storage_init_err:
    print(f"[STORAGE_INIT_WARNING] {_storage_init_err}", flush=True)

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

DANGEROUS_PATTERNS = [
    b'<script', b'javascript:', b'<?php', b'<!doctype', b'<html',
    b'<svg', b'onload=', b'onerror=', b'onclick=', b'onmouseover=',
    b'eval(', b'<iframe', b'<embed', b'<object'
]

def validate_and_sanitize_upload(raw_data_or_b64, allowed_types=None, max_size_bytes=10*1024*1024, original_filename=''):
    """
    Unified, strict security validator for uploaded files.
    - Decodes base64 if needed (supports data URI schemes)
    - Validates file size
    - Validates magic bytes (PDF: %PDF-, PNG: \\x89PNG, JPEG: \\xff\\xd8\\xff, WEBP: RIFF...WEBP, GIF: GIF87a/GIF89a)
    - Rejects SVG files completely (XSS vector)
    - Scans for embedded script/executable polyglot payload markers
    - Validates extension
    Returns: (is_valid: bool, error_msg: str, binary_data: bytes, detected_mime: str, safe_ext: str)
    """
    if allowed_types is None:
        allowed_types = ['image', 'pdf']

    if not raw_data_or_b64:
        return False, "File data is required.", None, None, None

    # Handle string (base64) or bytes
    if isinstance(raw_data_or_b64, str):
        b64_str = raw_data_or_b64.strip()
        if ',' in b64_str:
            b64_str = b64_str.split(',', 1)[1]
        try:
            binary_data = base64.b64decode(b64_str)
        except Exception as e:
            return False, f"Invalid base64 encoding: {str(e)}", None, None, None
    elif isinstance(raw_data_or_b64, bytes):
        binary_data = raw_data_or_b64
    else:
        return False, "Unsupported file data type.", None, None, None

    if len(binary_data) == 0:
        return False, "File is empty (0 bytes).", None, None, None

    if len(binary_data) > max_size_bytes:
        max_mb = max_size_bytes / (1024 * 1024)
        return False, f"File size ({len(binary_data)/(1024*1024):.1f} MB) exceeds maximum allowed limit of {max_mb:.0f} MB.", None, None, None

    # Identify file format by magic bytes
    detected_type = None
    detected_mime = None
    safe_ext = None

    if binary_data.startswith(b'%PDF-') or binary_data.startswith(b'%PDF'):
        detected_type = 'pdf'
        detected_mime = 'application/pdf'
        safe_ext = '.pdf'
    elif binary_data.startswith(b'\x89PNG\r\n\x1a\n'):
        detected_type = 'image'
        detected_mime = 'image/png'
        safe_ext = '.png'
    elif binary_data.startswith(b'\xff\xd8\xff'):
        detected_type = 'image'
        detected_mime = 'image/jpeg'
        safe_ext = '.jpg'
    elif binary_data.startswith(b'RIFF') and b'WEBP' in binary_data[:16]:
        detected_type = 'image'
        detected_mime = 'image/webp'
        safe_ext = '.webp'
    elif binary_data.startswith(b'GIF87a') or binary_data.startswith(b'GIF89a'):
        detected_type = 'image'
        detected_mime = 'image/gif'
        safe_ext = '.gif'
    elif binary_data.lstrip().startswith(b'<svg') or b'<svg' in binary_data[:256].lower() or (b'<?xml' in binary_data[:64].lower() and b'<svg' in binary_data[:512].lower()):
        return False, "Security Violation: SVG files are strictly prohibited due to script execution risks.", None, None, None

    if not detected_type:
        return False, "Unsupported or corrupted file format. File signature does not match allowed types.", None, None, None

    if detected_type not in allowed_types:
        return False, f"File type '{detected_type}' is not permitted for this upload. Allowed: {', '.join(allowed_types)}.", None, None, None

    # Check extension against detected format if original filename provided
    if original_filename:
        lower_name = original_filename.lower()
        # Block dangerous extensions
        dangerous_exts = ['.exe', '.php', '.phtml', '.sh', '.bat', '.cmd', '.js', '.vbs', '.py', '.rb', '.pl', '.html', '.htm', '.xhtml', '.svg', '.svgz', '.shtml', '.phar']
        if any(lower_name.endswith(d_ext) for d_ext in dangerous_exts):
            return False, "Security Violation: Prohibited file extension detected.", None, None, None

    # Polyglot inspection: scan buffer for dangerous payload signatures
    scan_slices = [binary_data[:4096], binary_data[-4096:]]
    if len(binary_data) <= 2 * 1024 * 1024:
        scan_slices = [binary_data]

    for s in scan_slices:
        s_lower = s.lower()
        for p in DANGEROUS_PATTERNS:
            if p in s_lower:
                if p in [b'<script', b'javascript:', b'<?php', b'<svg', b'onload=', b'onerror=', b'eval(']:
                    return False, "Security Violation: Potentially malicious script or embedded payload detected in file.", None, None, None
                elif detected_type == 'image' and p in [b'<!doctype', b'<html', b'<iframe']:
                    return False, "Security Violation: Polyglot HTML/script detected in image file.", None, None, None

    return True, None, binary_data, detected_mime, safe_ext

FIREBASE_RTDB_URL = "https://excellenceca-45a9d-default-rtdb.firebaseio.com"

def sync_to_firebase(path, data, method='PUT', sync=None):
    """Sync updates to Firebase Realtime Database via REST API.
    In serverless environments (Vercel / Lambda), background daemon threads freeze 
    immediately upon HTTP response, so we execute synchronously with a tight timeout."""
    def _do_sync():
        try:
            import urllib.request
            url = f"{FIREBASE_RTDB_URL}/{path.lstrip('/')}.json"
            if method == 'DELETE' and data is None:
                body = None
            else:
                body = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=body, method=method)
            req.add_header('Content-Type', 'application/json')
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                pass
        except Exception as e:
            # Silent fallback if offline / timed out
            pass

    should_sync = sync if sync is not None else IS_SERVERLESS
    if should_sync:
        _do_sync()
    else:
        threading.Thread(target=_do_sync, daemon=True).start()

INITIAL_USERS = {
    'adminrulebreker@rulebrekerdothunter.com': {
        'id': 'usr-admin-1',
        'name': 'Administrator',
        'username': 'adminrulebreker@rulebrekerdothunter.com',
        'email': 'adminrulebreker@rulebrekerdothunter.com',
        'password': 'sha256:admin_salt_2026:02a70c1f4315ebb55dfe203f4b059605c91d133c80bd664b13c607c4a7c94296',
        'role': 'admin',
        'token': 'token_admin_excellenceca_secret',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'rohan.sharma@castudent.in': {
        'id': 'usr-student-1',
        'name': 'Rohan Sharma',
        'username': 'rohan_sharma',
        'email': 'rohan.sharma@castudent.in',
        'password': 'sha256:rohan_salt_2026:4bc09285fc316fdb16fabcc092c15d15b9b9fbb7a19e926d55796dd509278baa',
        'role': 'student',
        'token': 'token_rohan_sharma_student',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 600,
        'referralCount': 6
    },
    'priya.patel@castudent.in': {
        'id': 'usr-student-2',
        'name': 'Priya Patel',
        'username': 'priya_patel',
        'email': 'priya.patel@castudent.in',
        'password': 'sha256:priya_salt_2026:d9d13c19c3b68e0af57d22a854944d6e0c3e42466e53cbae186bff1d054c43ce',
        'role': 'student',
        'token': 'token_priya_patel_student',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'prof.sharma@excellenceca.com': {
        'id': 'usr-teacher-1',
        'name': 'Prof. Rajesh Sharma',
        'username': 'prof_rajesh',
        'email': 'prof.sharma@excellenceca.com',
        'password': 'sha256:rajesh_salt_2026:d3ac2e3fe1e52245b0f37caad135b5eb170743d2c48ab54adaebcd9e44022723',
        'role': 'teacher',
        'token': 'token_prof_sharma_teacher',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'st_noref_1789296086@castudent.in': {
        'id': 'usr-student-1789296086486',
        'name': 'Clean Student',
        'username': 'st_noref_1789296086',
        'email': 'st_noref_1789296086@castudent.in',
        'password': 'sha256:4c749b6b6ed04f22:3e9667ccba8bd089bff60036393a418c097cc97e97eaa425733eeaeb75a1c53a',
        'role': 'student',
        'token': 'token_student_45c8b527756f41d5',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'st_withref_1789296086@castudent.in': {
        'id': 'usr-student-1789296086576',
        'name': 'Legitimately Updated Name',
        'username': 'st_withref_1789296086',
        'email': 'st_withref_1789296086@castudent.in',
        'password': 'sha256:3c98aece4255469e:d8665b62098e35658c811dc08b083583c1d099d4b255f5ac027110240c0bb85c',
        'role': 'student',
        'token': 'token_student_fb446ec67cec4e62',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 100,
        'referralCount': 0
    },
    'st_noref_1789296138@castudent.in': {
        'id': 'usr-student-1789296138597',
        'name': 'Clean Student',
        'username': 'st_noref_1789296138',
        'email': 'st_noref_1789296138@castudent.in',
        'password': 'sha256:74b3abd3c22c4df0:b86978ee82ea3d4b051ad8f474bb4da90ba9ee31e940b517b5cef9bffe522d38',
        'role': 'student',
        'token': 'token_student_bb27645521c74d22',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'st_withref_1789296138@castudent.in': {
        'id': 'usr-student-1789296138691',
        'name': 'Legitimately Updated Name',
        'username': 'st_withref_1789296138',
        'email': 'st_withref_1789296138@castudent.in',
        'password': 'sha256:ebd37c4e199047ea:caa60f3bba0c7aa1b2aafe6f16b3a7d43df88a9da6a95c4ed629104f74a5e315',
        'role': 'student',
        'token': 'token_student_887e944631b44502',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 100,
        'referralCount': 0
    },
    'st_noref_1789296215@castudent.in': {
        'id': 'usr-student-1789296215462',
        'name': 'Clean Student',
        'username': 'st_noref_1789296215',
        'email': 'st_noref_1789296215@castudent.in',
        'password': 'sha256:eb6ffc9961b04a88:5aa6c20f3adb8b37f489a0bf3604cf24afa05a89ca4c68bac721ba16a1a3c090',
        'role': 'student',
        'token': 'token_student_0a69e91aee2148aa',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'st_noref_1789296246@castudent.in': {
        'id': 'usr-student-1789296246354',
        'name': 'Clean Student',
        'username': 'st_noref_1789296246',
        'email': 'st_noref_1789296246@castudent.in',
        'password': 'sha256:fcf06ff46aa041ff:7819f4e588fce30ce06a93bcb2a9dd6e5a27d8f2d49e59fa2bf2a5470fb46cee',
        'role': 'student',
        'token': 'token_student_0620aef11fe7443f',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'ref_13c7af@castudent.in': {
        'id': 'usr-student-1789299436212',
        'name': 'Referrer Student 13c7af',
        'username': 'refa13c7af',
        'email': 'ref_13c7af@castudent.in',
        'password': 'sha256:908f55c165f549fc:aa96b22ab8d5dc0bdcf87c53c59450350d9543ac86252c813304dbd68fb13d47',
        'role': 'student',
        'token': 'token_student_191aef60a926419b',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 100,
        'referralCount': 1
    },
    'new_3e948b@castudent.in': {
        'id': 'usr-student-1789299436305',
        'name': 'Referred Student 3e948b',
        'username': 'newb3e948b',
        'email': 'new_3e948b@castudent.in',
        'password': 'sha256:b43e177d0c9640fa:ada380ca6e4903e95981cf46c1f6a936f830f4d9b60ab522154a3560a4e2e180',
        'role': 'student',
        'token': 'token_student_5321548147854509',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 100,
        'referralCount': 0
    },
    'st_noref_1789299442@castudent.in': {
        'id': 'usr-student-1789299442504',
        'name': 'Clean Student',
        'username': 'st_noref_1789299442',
        'email': 'st_noref_1789299442@castudent.in',
        'password': 'sha256:6ec75d40849e40ad:1fbd8667197fe4a7641b3e59b348a184700be404f3efa469fb393864cd756434',
        'role': 'student',
        'token': 'token_student_b603c2a0a7754408',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'testregstudent1@castudent.in': {
        'id': 'usr-student-1789301561074',
        'name': 'Test Reg Student',
        'username': 'testregstudent1',
        'email': 'testregstudent1@castudent.in',
        'password': 'sha256:2a5d8f2545534109:5dd7ff61539130917793218782108043d83d8fcedbc603b2f532240b2ea3f159',
        'role': 'student',
        'token': 'token_student_4107115c27ad45fe',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'kavita.singhal@castudent.in': {
        'id': 'usr-student-5',
        'name': 'Kavita Singhal',
        'username': 'kavita_singhal',
        'email': 'kavita.singhal@castudent.in',
        'password': 'sha256:kavita_singhal_salt_2026:a0222c9904779f0d87270849e1f11ec1febcccaf90c2509df5edaa5cfdf79c7c',
        'role': 'student',
        'token': 'token_student_kavita_singhal',
        'isActive': True,
        'caLevel': 'CA FINAL',
        'referralPoints': 200,
        'referralCount': 2
    },
    'amit.roy@castudent.in': {
        'id': 'usr-student-3',
        'name': 'Amit Roy',
        'username': 'amit_roy',
        'email': 'amit.roy@castudent.in',
        'password': 'sha256:amit_roy_salt_2026:7c5b7fc4f913780ac07603d512218983c27208658128697204c4dab2d4a86618',
        'role': 'student',
        'token': 'token_student_amit_roy',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 100,
        'referralCount': 1
    },
    'neha.verma@castudent.in': {
        'id': 'usr-student-4',
        'name': 'Neha Verma',
        'username': 'vikram_singhania',
        'email': 'neha.verma@castudent.in',
        'password': 'sha256:vikram_singhania_salt_2026:41caa0f0f0cde83ef2d31300657704705d59ca8432490fa734bfde9b1c9e4d10',
        'role': 'student',
        'token': 'token_student_vikram_singhania',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 100,
        'referralCount': 2
    },
    'aman.singh@castudent.in': {
        'id': 'usr-student-6',
        'name': 'Aman Singh',
        'username': 'aman_singh',
        'email': 'aman.singh@castudent.in',
        'password': 'sha256:aman_singh_salt_2026:7743ace5554a74eb62401265a11fe8797d49dd61d7cb286b4497d1e98d560621',
        'role': 'student',
        'token': 'token_student_aman_singh',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 100,
        'referralCount': 1
    },
    'sneha.gupta@castudent.in': {
        'id': 'usr-student-7',
        'name': 'Sneha Gupta',
        'username': 'sneha_gupta',
        'email': 'sneha.gupta@castudent.in',
        'password': 'sha256:sneha_gupta_salt_2026:b5a2e9b3b000f1857001a6c968005ce56e2de079d8f48a870b879f558ee78600',
        'role': 'student',
        'token': 'token_student_sneha_gupta',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 100,
        'referralCount': 1
    },
    'rahul.sharma@castudent.in': {
        'id': 'usr-student-8',
        'name': 'Rahul Sharma',
        'username': 'rahul_sharma',
        'email': 'rahul.sharma@castudent.in',
        'password': 'sha256:rahul_sharma_salt_2026:36b918badbdad0124c76847753972af08b49cb5212bec1a8a4202ff547f47071',
        'role': 'student',
        'token': 'token_student_rahul_sharma',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 100,
        'referralCount': 1
    },
    'vikram.malhotra@castudent.in': {
        'id': 'usr-student-9',
        'name': 'Vikram Malhotra',
        'username': 'neha_verma',
        'email': 'vikram.malhotra@castudent.in',
        'password': 'sha256:neha_verma_salt_2026:81b40f3e2924e7eaa4cde791f8e5bde8bffffb9afffa061fe2e0ae537cbefcca',
        'role': 'student',
        'token': 'token_student_neha_verma',
        'isActive': True,
        'caLevel': 'CA FINAL',
        'referralPoints': 0,
        'referralCount': 1
    },
    'ananya.joshi@castudent.in': {
        'id': 'usr-student-10',
        'name': 'Ananya Joshi',
        'username': 'aditya_verma',
        'email': 'ananya.joshi@castudent.in',
        'password': 'sha256:aditya_verma_salt_2026:ed49833af1e79635de90a3e67684ef5fae64d60f4e5681c2368be431f312a5d2',
        'role': 'student',
        'token': 'token_student_aditya_verma',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 0,
        'referralCount': 0
    },
    'divya.nair@castudent.in': {
        'id': 'usr-student-11',
        'name': 'Divya Nair',
        'username': 'ritu_nambiar',
        'email': 'divya.nair@castudent.in',
        'password': 'sha256:ritu_nambiar_salt_2026:63afeb73175b007bf336b397693c127457e1a4fb91d77c1c34e8364ea460bdf7',
        'role': 'student',
        'token': 'token_student_ritu_nambiar',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 100,
        'referralCount': 1
    },
    'arjun.mehta@castudent.in': {
        'id': 'usr-student-12',
        'name': 'Arjun Mehta',
        'username': 'arjun_mehta',
        'email': 'arjun.mehta@castudent.in',
        'password': 'sha256:arjun_mehta_salt_2026:85acc4620b7230ccb9ff55f99a9c8bd766cf65933b282115870b6835691a0d81',
        'role': 'student',
        'token': 'token_student_arjun_mehta',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 0,
        'referralCount': 0
    },
    'pooja.deshmukh@castudent.in': {
        'id': 'usr-student-13',
        'name': 'Pooja Deshmukh',
        'username': 'pooja_deshmukh',
        'email': 'pooja.deshmukh@castudent.in',
        'password': 'sha256:pooja_deshmukh_salt_2026:8c4402841a73e67d3cddb01e981939b13296aa4523ee9fcb047967b2bc12bf75',
        'role': 'student',
        'token': 'token_student_pooja_deshmukh',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'manish.tiwari@castudent.in': {
        'id': 'usr-student-14',
        'name': 'Manish Tiwari',
        'username': 'manish_tiwari',
        'email': 'manish.tiwari@castudent.in',
        'password': 'sha256:manish_tiwari_salt_2026:42c590bc22b1f7a6fc7338516c6189f7cbd8b04eade2755371b2536ac63820a8',
        'role': 'student',
        'token': 'token_student_manish_tiwari',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 0,
        'referralCount': 0
    },
    'tanvi.shah@castudent.in': {
        'id': 'usr-student-15',
        'name': 'Tanvi Shah',
        'username': 'tanvi_shah',
        'email': 'tanvi.shah@castudent.in',
        'password': 'sha256:tanvi_shah_salt_2026:12642d2d8c5caac0d94f2be33378cfbf6094e80553dadff7aaecfb407fc59800',
        'role': 'student',
        'token': 'token_student_tanvi_shah',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'rishi.saxena@castudent.in': {
        'id': 'usr-student-16',
        'name': 'Rishi Saxena',
        'username': 'karthik_raman',
        'email': 'rishi.saxena@castudent.in',
        'password': 'sha256:karthik_raman_salt_2026:609cb323179ba349ef8c1adc3a147e2b1f3aa57506634ab35627b68757fb64c8',
        'role': 'student',
        'token': 'token_student_karthik_raman',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 0,
        'referralCount': 0
    },
    'deepak.kumar@castudent.in': {
        'id': 'usr-student-17',
        'name': 'Deepak Kumar',
        'username': 'divya_agarwal',
        'email': 'deepak.kumar@castudent.in',
        'password': 'sha256:divya_agarwal_salt_2026:e09e08160408cced24a29045dac17d752b4654b1da2351de1bb6802900aa0395',
        'role': 'student',
        'token': 'token_student_divya_agarwal',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'sanya.kapoor@castudent.in': {
        'id': 'usr-student-18',
        'name': 'Sanya Kapoor',
        'username': 'harpreet_kaur',
        'email': 'sanya.kapoor@castudent.in',
        'password': 'sha256:harpreet_kaur_salt_2026:18fb66b40ab875d992db02e99ec26f872ad837f07c24d644cfaf9fd7fb98bb4b',
        'role': 'student',
        'token': 'token_student_harpreet_kaur',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'mohit.bansal@castudent.in': {
        'id': 'usr-student-19',
        'name': 'Mohit Bansal',
        'username': 'mohit_bansal',
        'email': 'mohit.bansal@castudent.in',
        'password': 'sha256:mohit_bansal_salt_2026:e66a3a38e121fcb5a030730fdb35cb181b2a6fb34494325bc577185c7024f7d3',
        'role': 'student',
        'token': 'token_student_mohit_bansal',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'sneha.agarwal@castudent.in': {
        'id': 'usr-student-20',
        'name': 'Sneha Agarwal',
        'username': 'sneha_agarwal',
        'email': 'sneha.agarwal@castudent.in',
        'password': 'sha256:sneha_agarwal_salt_2026:06a418d169228addb2c477e39fae5c360f7ef2bdf57e2eecfa8bc26d8b63e3a4',
        'role': 'student',
        'token': 'token_student_sneha_agarwal',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 100,
        'referralCount': 1
    },
    'aditya.varma@castudent.in': {
        'id': 'usr-student-21',
        'name': 'Aditya Varma',
        'username': 'aditya_varma',
        'email': 'aditya.varma@castudent.in',
        'password': 'sha256:aditya_varma_salt_2026:acae911ef9dce9f940652c469a7a9cd62c9749f94374222ade9caa9623b52110',
        'role': 'student',
        'token': 'token_student_aditya_varma',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 0,
        'referralCount': 0
    },
    'ananya.reddy@castudent.in': {
        'id': 'usr-student-22',
        'name': 'Ananya Reddy',
        'username': 'ananya_reddy',
        'email': 'ananya.reddy@castudent.in',
        'password': 'sha256:ananya_reddy_salt_2026:33b63c446bce9f4347cbb66e8db097be67639ec7ce1763b29bc4fe4fd38b9d6c',
        'role': 'student',
        'token': 'token_student_ananya_reddy',
        'isActive': True,
        'caLevel': 'CA FINAL',
        'referralPoints': 200,
        'referralCount': 2
    },
    'rahul.deshmukh@castudent.in': {
        'id': 'usr-student-23',
        'name': 'Rahul Deshmukh',
        'username': 'rahul_deshmukh',
        'email': 'rahul.deshmukh@castudent.in',
        'password': 'sha256:rahul_deshmukh_salt_2026:7e9e3e39612880d53e6946db0f4e938c90f4af2a45ca22c6dd2de4dae7531536',
        'role': 'student',
        'token': 'token_student_rahul_deshmukh',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'pooja.iyer@castudent.in': {
        'id': 'usr-student-24',
        'name': 'Pooja Iyer',
        'username': 'pooja_iyer',
        'email': 'pooja.iyer@castudent.in',
        'password': 'sha256:pooja_iyer_salt_2026:4b1922d4d03405ed69c110a7db94c334515280d5e1c311dacce4503f92f31b3d',
        'role': 'student',
        'token': 'token_student_pooja_iyer',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 100,
        'referralCount': 1
    },
    'karan.malhotra@castudent.in': {
        'id': 'usr-student-25',
        'name': 'Karan Malhotra',
        'username': 'karan_malhotra',
        'email': 'karan.malhotra@castudent.in',
        'password': 'sha256:karan_malhotra_salt_2026:43668b6771fcfec3ac8eccfdeea8542eaf6b17023a7e82bfc6bbab5b36013962',
        'role': 'student',
        'token': 'token_student_karan_malhotra',
        'isActive': True,
        'caLevel': 'CA FINAL',
        'referralPoints': 0,
        'referralCount': 0
    },
    'vicky.jain@castudent.in': {
        'id': 'usr-student-27',
        'name': 'Vicky Jain',
        'username': 'vicky_jain',
        'email': 'vicky.jain@castudent.in',
        'password': 'sha256:vicky_jain_salt_2026:8b4e16f2a5633fe8a2650dc2091d14f2de1523de49efe6185440fc92589d4973',
        'role': 'student',
        'token': 'token_student_vicky_jain',
        'isActive': True,
        'caLevel': 'CA INTER',
        'referralPoints': 0,
        'referralCount': 0
    },
    'rajesh.teacher@excellenceca.com': {
        'id': 'usr-teacher-1',
        'name': 'Prof. Rajesh Sharma',
        'username': 'prof_rajesh',
        'email': 'rajesh.teacher@excellenceca.com',
        'password': 'sha256:rajesh_salt_2026:d3ac2e3fe1e52245b0f37caad135b5eb170743d2c48ab54adaebcd9e44022723',
        'role': 'teacher',
        'token': 'token_prof_sharma_teacher',
        'isActive': True,
        'caLevel': 'CA FOUNDATION',
        'referralPoints': 0,
        'referralCount': 0
    },
    'meenakshi.teacher@excellenceca.com': {
        'id': 'usr-teacher-2',
        'name': 'CA Meenakshi Sundaram (Faculty - Accounts & Audit)',
        'username': 'meenakshi_ca',
        'email': 'meenakshi.teacher@excellenceca.com',
        'password': 'sha256:meenakshi_ca_salt_2026:a0fb15e0603dac46c516189539dfcea5b05953b0989746b1e40053e5921148a5',
        'role': 'teacher',
        'token': 'token_teacher_meenakshi_ca',
        'isActive': True,
        'caLevel': 'Faculty Evaluator',
        'referralPoints': 0,
        'referralCount': 0
    },
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

TIER_LEVELS = {
    'none': 0,
    'free': 0,
    'trial': 1,
    'core': 2,
    'plus': 3,
    'elite': 4,
    'teacher': 99,
    'admin': 99
}

def get_user_tier(user_id, data):
    if not user_id:
        return 'free'
    try:
        ent = subscription_manager.get_user_entitlements(user_id, data, sync_to_firebase)
        if ent and ent.get('isSubscribed'):
            tier = str(ent.get('tier', 'free')).lower()
            if tier in TIER_LEVELS:
                return tier
            plan_id = str(ent.get('planId', '')).lower()
            if 'elite' in plan_id: return 'elite'
            if 'plus' in plan_id: return 'plus'
            if 'core' in plan_id: return 'core'
            if 'trial' in plan_id: return 'trial'
    except Exception as e:
        print(f"[GET_USER_TIER_ERROR] {e}", flush=True)
    return 'free'

def check_tier_access(user_tier, required_tier):
    req = str(required_tier or 'free').strip().lower()
    if req in ('none', 'null', '', 'free'):
        return True
    u_level = TIER_LEVELS.get(str(user_tier or 'free').strip().lower(), 0)
    r_level = TIER_LEVELS.get(req, 0)
    return u_level >= r_level

def check_test_eligibility(user_tier, test):
    u_tier = str(user_tier or 'free').strip().lower()
    if u_tier in ('admin', 'teacher'):
        return True
    if not test:
        return False
    
    allowed_plans = test.get('allowedPlans')
    if isinstance(allowed_plans, list) and len(allowed_plans) > 0:
        plans = [str(p).strip().lower() for p in allowed_plans]
        if 'all' in plans:
            return True
        return u_tier in plans
    
    req_tier = str(test.get('requiredTier') or test.get('tier') or 'free').strip().lower()
    if req_tier in ('none', 'null', '', 'free'):
        return True
    return check_tier_access(u_tier, req_tier)

def check_test_visibility(user_tier, test):
    if not test:
        return False
    if check_test_eligibility(user_tier, test):
        return True
    if bool(test.get('hideFromNonEligible', False)):
        return False
    return True

def check_scheduled_mcq_tests(data, sync_fn=None):
    """
    Server-side background executor for scheduled MCQ tests.
    Checks all tests with status 'Scheduled'. When scheduledPublishTime arrives,
    transitions test to 'Live', syncs to Firebase RTDB,
    and dispatches idempotent notifications to eligible users based on tier.
    """
    tests = data.get('tests', [])
    if not tests:
        return False

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    dirty = False

    for test in tests:
        status = str(test.get('status', '')).strip()
        sched_str = test.get('scheduledPublishTime')
        if status == 'Scheduled' and sched_str:
            try:
                clean_sched = str(sched_str).replace('Z', '+00:00')
                sched_dt = datetime.fromisoformat(clean_sched)
                if sched_dt.tzinfo is None:
                    # Timezone-naive treated as Asia/Kolkata (+05:30)
                    ist_tz = timezone(timedelta(hours=5, minutes=30))
                    sched_dt = sched_dt.replace(tzinfo=ist_tz)

                if now_utc >= sched_dt:
                    test['status'] = 'Live'
                    test['isPublished'] = True
                    test['isLive'] = True
                    test['publishedAt'] = now_iso
                    dirty = True
                    print(f"[MCQ_SCHEDULE] Test '{test.get('title')}' ({test.get('id')}) transitioned to LIVE at {now_iso}", flush=True)

                    if sync_fn:
                        sync_fn(f"tests/{test['id']}", test)

                    # Dispatch idempotent notifications to eligible students
                    raw_users = data.get('users', [])
                    user_list = list(raw_users.values()) if isinstance(raw_users, dict) else (raw_users if isinstance(raw_users, list) else [])
                    notifs = data.setdefault('notifications', {})
                    if isinstance(notifs, list):
                        notifs_dict = {n.get('id', f"notif_{i}"): n for i, n in enumerate(notifs)}
                        data['notifications'] = notifs_dict
                        notifs = notifs_dict

                    for u in user_list:
                        if isinstance(u, dict) and u.get('role') == 'student':
                            u_tier = get_user_tier(u.get('id'), data)
                            if check_test_eligibility(u_tier, test):
                                notif_id = f"notif_mcq_live_{test['id']}_{u['id']}"
                                if notif_id not in notifs:
                                    notif_obj = {
                                        'id': notif_id,
                                        'userId': u['id'],
                                        'title': f"New Live Assessment: {test.get('title', 'MCQ Test')}",
                                        'message': f"The scheduled test '{test.get('title')}' is now LIVE! Begin your examination now.",
                                        'type': 'test_live',
                                        'testId': test['id'],
                                        'read': False,
                                        'createdAt': now_iso
                                    }
                                    notifs[notif_id] = notif_obj
                                    if sync_fn:
                                        sync_fn(f"notifications/{notif_id}", notif_obj)
            except Exception as e:
                print(f"[MCQ_SCHEDULE_ERROR] Error checking test {test.get('id')}: {e}", flush=True)

    return dirty

_backend_data_lock = threading.RLock()
_collection_last_synced = {}

def sync_collections_from_firebase(data, collections=None, min_interval=1.0):
    """
    Safely synchronizes dynamic collections from Firebase RTDB to prevent stale container state.
    Uses throttling (min_interval) to avoid redundant round-trips while guaranteeing fresh data.
    """
    if not data or not isinstance(data, dict):
        return data

    now = time.time()
    all_keys = ['users', 'subscriptions', 'payment_sessions', 'payment_channels', 'subscription_plans', 'notifications', 'admin_audit_logs', 'tests', 'questions', 'assignments', 'papers']
    target_keys = collections if collections else all_keys

    keys_to_fetch = [k for k in target_keys if (now - _collection_last_synced.get(k, 0)) >= min_interval]
    if not keys_to_fetch:
        return data

    import urllib.request
    updated = False
    for key in keys_to_fetch:
        try:
            req = urllib.request.Request(f"{FIREBASE_RTDB_URL}/{key}.json")
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                raw_bytes = resp.read()
                if not raw_bytes:
                    continue
                cloud_data = json.loads(raw_bytes.decode('utf-8'))
                if cloud_data is None:
                    continue

                if key == 'users':
                    if isinstance(cloud_data, dict):
                        users_dict = data.setdefault('users', {})
                        revoked_set = set(str(x).lower().strip() for x in data.get('revoked_users', []))
                        for uid, u in cloud_data.items():
                            if isinstance(u, dict):
                                u_email = str(u.get('email') or '').strip().lower()
                                u_id = str(u.get('id') or uid).strip()
                                u_uname = str(u.get('username') or '').strip().lower().lstrip('@')
                                if u_id.lower() in revoked_set or u_email in revoked_set or u_uname in revoked_set:
                                    continue
                                target_key = None
                                if u_email and u_email in users_dict:
                                    target_key = u_email
                                else:
                                    for k, exist_u in users_dict.items():
                                        if (exist_u.get('id') and exist_u.get('id') == u_id) or (u_email and exist_u.get('email') and exist_u.get('email').lower() == u_email):
                                            target_key = k
                                            break
                                if target_key:
                                    for f_k, f_v in u.items():
                                        if f_v is not None and (f_k != 'password' or f_v):
                                            if f_k == 'token' and (f_v in REVOKED_TOKENS or f_v in data.get('revoked_tokens', [])):
                                                continue
                                            users_dict[target_key][f_k] = f_v
                                else:
                                    k_name = u_email if u_email else u_id
                                    users_dict[k_name] = dict(u)
                        _collection_last_synced[key] = now
                        updated = True
                elif key in ['subscriptions', 'subscription_plans']:
                    if isinstance(cloud_data, dict):
                        data.setdefault(key, {}).update(cloud_data)
                        _collection_last_synced[key] = now
                        updated = True
                elif key == 'payment_sessions':
                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                    if items:
                        s_map = {s.get('paymentSessionId') or s.get('id'): s for s in data.get('payment_sessions', []) if isinstance(s, dict) and (s.get('paymentSessionId') or s.get('id'))}
                        for s in items:
                            if isinstance(s, dict):
                                sid = s.get('paymentSessionId') or s.get('id')
                                if sid:
                                    cur = s_map.get(sid)
                                    if cur and cur.get('status') in ('cancelled', 'approved', 'rejected', 'submitted') and s.get('status') == 'pending':
                                        continue
                                    s_map[sid] = s
                        data['payment_sessions'] = list(s_map.values())
                        _collection_last_synced[key] = now
                        updated = True
                elif key == 'payment_channels':
                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                    if items:
                        c_map = {c.get('id'): c for c in data.get('payment_channels', []) if isinstance(c, dict) and c.get('id')}
                        for c in items:
                            if isinstance(c, dict) and c.get('id'):
                                if 'subscriptionTier' not in c:
                                    c['subscriptionTier'] = 'all'
                                c_map[c['id']] = c
                        data['payment_channels'] = list(c_map.values())
                        _collection_last_synced[key] = now
                        updated = True
                elif key == 'notifications':
                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                    if items:
                        n_map = {n.get('id'): n for n in data.get('notifications', []) if isinstance(n, dict) and n.get('id')}
                        for n in items:
                            if isinstance(n, dict) and n.get('id'):
                                n_map[n['id']] = n
                        data['notifications'] = list(n_map.values())
                        _collection_last_synced[key] = now
                        updated = True
                elif key == 'admin_audit_logs':
                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                    if items:
                        l_map = {l.get('id'): l for l in data.get('admin_audit_logs', []) if isinstance(l, dict) and l.get('id')}
                        for l in items:
                            if isinstance(l, dict) and l.get('id'):
                                l_map[l['id']] = l
                        data['admin_audit_logs'] = list(l_map.values())
                        _collection_last_synced[key] = now
                        updated = True
                elif key == 'tests':
                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                    if items:
                        t_map = {t.get('id'): t for t in data.get('tests', []) if isinstance(t, dict) and t.get('id')}
                        for t in items:
                            if isinstance(t, dict) and t.get('id'):
                                tid = t.get('id')
                                cur = t_map.get(tid)
                                if cur:
                                    local_tq = int(cur.get('totalQuestions', 0))
                                    cloud_tq = int(t.get('totalQuestions', 0))
                                    cloud_updated = t.get('updatedAt') or t.get('createdAt') or ''
                                    local_updated = cur.get('updatedAt') or cur.get('createdAt') or ''
                                    if local_updated and cloud_updated and local_updated > cloud_updated:
                                        continue
                                    cur.update(t)
                                    if local_tq > cloud_tq:
                                        cur['totalQuestions'] = local_tq
                                else:
                                    t_map[tid] = t
                        data['tests'] = list(t_map.values())
                        _collection_last_synced[key] = now
                        updated = True
                elif key == 'questions':
                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                    if items:
                        q_map = {q.get('id'): q for q in data.get('questions', []) if isinstance(q, dict) and q.get('id')}
                        for q in items:
                            if isinstance(q, dict) and q.get('id'):
                                qid = q.get('id')
                                cur = q_map.get(qid)
                                if cur:
                                    cur.update(q)
                                else:
                                    q_map[qid] = q
                        data['questions'] = list(q_map.values())
                        _collection_last_synced[key] = now
                        updated = True
                elif key in ['assignments', 'papers']:
                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                    if items is not None:
                        p_map = {p.get('id'): p for p in items if isinstance(p, dict) and p.get('id')}
                        PROTECTED_IDS = ['asg-1789408695574', 'asg-1789409044746']
                        for p in data.get('papers', []):
                            if p.get('id') in PROTECTED_IDS and p.get('id') not in p_map:
                                p_map[p.get('id')] = p
                        data['papers'] = list(p_map.values())
                        data['assignments'] = list(p_map.values())
                        _collection_last_synced[key] = now
                        updated = True
        except Exception:
            pass

    if updated and os.path.exists(DATA_STORE_FILE):
        try:
            with open(DATA_STORE_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    return data

def load_backend_data(refresh_collections=None):
    with _backend_data_lock:
        if IS_SERVERLESS and not os.path.exists(DATA_STORE_FILE):
            bundled_seed = os.path.join(BASE_DIR, 'backend_data.json')
            if os.path.exists(bundled_seed):
                try:
                    import shutil
                    shutil.copyfile(bundled_seed, DATA_STORE_FILE)
                except Exception as _seed_err:
                    print(f"[SEED_COPY_WARNING] {_seed_err}", flush=True)
            try:
                if os.path.exists(DATA_STORE_FILE):
                    with open(DATA_STORE_FILE, 'r', encoding='utf-8') as f:
                        cur_data = json.load(f)
                    
                    import urllib.request
                    keys_to_fetch = ['users', 'subscriptions', 'payment_sessions', 'payment_channels', 'subscription_plans', 'notifications', 'admin_audit_logs', 'tests', 'questions', 'papers', 'assignments']
                    
                    for key in keys_to_fetch:
                        try:
                            req = urllib.request.Request(f"{FIREBASE_RTDB_URL}/{key}.json")
                            with urllib.request.urlopen(req, timeout=3.0) as resp:
                                raw_bytes = resp.read()
                                if not raw_bytes:
                                    continue
                                cloud_data = json.loads(raw_bytes.decode('utf-8'))
                                if not cloud_data:
                                    continue

                                if key == 'users':
                                    if isinstance(cloud_data, dict):
                                        users_dict = cur_data.setdefault('users', {})
                                        revoked_set = set(str(x).lower().strip() for x in cur_data.get('revoked_users', []))
                                        for uid, u in cloud_data.items():
                                            if isinstance(u, dict):
                                                u_email = str(u.get('email') or '').strip().lower()
                                                u_id = str(u.get('id') or uid).strip()
                                                u_uname = str(u.get('username') or '').strip().lower().lstrip('@')
                                                if u_id.lower() in revoked_set or u_email in revoked_set or u_uname in revoked_set:
                                                    continue
                                                target_key = None
                                                if u_email and u_email in users_dict:
                                                    target_key = u_email
                                                else:
                                                    for k, exist_u in users_dict.items():
                                                        if (exist_u.get('id') and exist_u.get('id') == u_id) or (u_email and exist_u.get('email') and exist_u.get('email').lower() == u_email):
                                                            target_key = k
                                                            break
                                                if target_key:
                                                    for f_k, f_v in u.items():
                                                        if f_v is not None and (f_k != 'password' or f_v):
                                                            if f_k == 'token' and (f_v in REVOKED_TOKENS or f_v in cur_data.get('revoked_tokens', [])):
                                                                continue
                                                            users_dict[target_key][f_k] = f_v
                                                else:
                                                    k_name = u_email if u_email else u_id
                                                    users_dict[k_name] = dict(u)
                                elif key in ['subscriptions', 'subscription_plans']:
                                    if isinstance(cloud_data, dict):
                                        cur_data.setdefault(key, {}).update(cloud_data)
                                elif key == 'payment_sessions':
                                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                                    if items:
                                        s_map = {s.get('paymentSessionId') or s.get('id'): s for s in cur_data.get('payment_sessions', []) if isinstance(s, dict)}
                                        for s in items:
                                            if isinstance(s, dict):
                                                sid = s.get('paymentSessionId') or s.get('id')
                                                if sid:
                                                    cur = s_map.get(sid)
                                                    if cur and cur.get('status') in ('cancelled', 'approved', 'rejected', 'submitted') and s.get('status') == 'pending':
                                                        continue
                                                    s_map[sid] = s
                                        cur_data['payment_sessions'] = list(s_map.values())
                                elif key == 'payment_channels':
                                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                                    if items:
                                        c_map = {c.get('id'): c for c in cur_data.get('payment_channels', []) if isinstance(c, dict) and c.get('id')}
                                        for c in items:
                                            if isinstance(c, dict) and c.get('id'):
                                                c_map[c['id']] = c
                                        cur_data['payment_channels'] = list(c_map.values())
                                elif key == 'notifications':
                                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                                    if items:
                                        n_map = {n.get('id'): n for n in cur_data.get('notifications', []) if isinstance(n, dict) and n.get('id')}
                                        for n in items:
                                            if isinstance(n, dict) and n.get('id'):
                                                n_map[n['id']] = n
                                        cur_data['notifications'] = list(n_map.values())
                                elif key == 'admin_audit_logs':
                                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                                    if items:
                                        l_map = {l.get('id'): l for l in cur_data.get('admin_audit_logs', []) if isinstance(l, dict) and l.get('id')}
                                        for l in items:
                                            if isinstance(l, dict) and l.get('id'):
                                                l_map[l['id']] = l
                                        cur_data['admin_audit_logs'] = list(l_map.values())
                                elif key == 'tests':
                                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                                    if items:
                                        t_map = {t.get('id'): t for t in cur_data.get('tests', []) if isinstance(t, dict) and t.get('id')}
                                        for t in items:
                                            if isinstance(t, dict) and t.get('id'):
                                                t_map[t['id']] = t
                                        cur_data['tests'] = list(t_map.values())
                                elif key == 'questions':
                                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                                    if items:
                                        q_map = {q.get('id'): q for q in cur_data.get('questions', []) if isinstance(q, dict) and q.get('id')}
                                        for q in items:
                                            if isinstance(q, dict) and q.get('id'):
                                                q_map[q['id']] = q
                                        cur_data['questions'] = list(q_map.values())
                                elif key in ['papers', 'assignments']:
                                    items = list(cloud_data.values()) if isinstance(cloud_data, dict) else (cloud_data if isinstance(cloud_data, list) else [])
                                    if items is not None:
                                        p_map = {p.get('id'): p for p in items if isinstance(p, dict) and p.get('id')}
                                        PROTECTED_IDS = ['asg-1789408695574', 'asg-1789409044746']
                                        for p in cur_data.get('papers', []):
                                            if p.get('id') in PROTECTED_IDS and p.get('id') not in p_map:
                                                p_map[p.get('id')] = p
                                        cur_data['papers'] = list(p_map.values())
                                        cur_data['assignments'] = list(p_map.values())
                        except Exception as err:
                            print(f"[COLD_START] Failed to fetch {key} from Firebase: {err}", flush=True)

                    with open(DATA_STORE_FILE, 'w', encoding='utf-8') as f:
                        json.dump(cur_data, f, indent=2)
            except Exception as _cloud_seed_err:
                print(f"[COLD_START] Cloud seed overall error: {_cloud_seed_err}", flush=True)

        if os.path.exists(DATA_STORE_FILE):
            d = None
            for attempt in range(5):
                try:
                    with open(DATA_STORE_FILE, 'r', encoding='utf-8') as f:
                        d = json.load(f)
                    break
                except Exception as read_err:
                    time.sleep(0.05)
                    d = None

            if d is not None:
                list_keys = ['tests', 'questions', 'test_attempts', 'submissions', 'papers', 'xp_transactions', 'notifications', 'bookmarks', 'subjects', 'referrals', 'payment_sessions', 'payment_channels', 'admin_audit_logs', 'xp_reset_history']
                for lk in list_keys:
                    if lk not in d:
                        d[lk] = []
                    elif isinstance(d[lk], dict):
                        d[lk] = list(d[lk].values())
                if 'referral_settings' not in d: d['referral_settings'] = {'referrerReward': 100, 'newStudentReward': 100}
                if 'xp_reset_settings' not in d: d['xp_reset_settings'] = {'enabled': False, 'nextReset': None, 'intervalDays': 90, 'customSeconds': None, 'lastReset': None}
                # Sync seed users and hashed passwords (skipping any permanently revoked accounts)
                revoked_set = set(str(x).lower().strip() for x in d.get('revoked_users', []))
                for email, init_u in INITIAL_USERS.items():
                    u_email = str(email or '').lower().strip()
                    u_id = str(init_u.get('id') or '').lower().strip()
                    u_uname = str(init_u.get('username') or '').lower().lstrip('@').strip()
                    if u_email in revoked_set or u_id in revoked_set or u_uname in revoked_set:
                        continue
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
                try:
                    sync_historical_xp(d)
                except Exception as xp_err:
                    print(f"[SYNC_XP_WARNING] {xp_err}", flush=True)

                if refresh_collections:
                    try:
                        sync_collections_from_firebase(d, collections=refresh_collections, min_interval=1.0)
                    except Exception:
                        pass

                return d
            else:
                print(f"[DATA_STORE_ERROR] Failed to read {DATA_STORE_FILE} after retries. Preserving existing file contents.", flush=True)
                return {}

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
    with _backend_data_lock:
        tmp_file = DATA_STORE_FILE + f".tmp.{os.getpid()}"
        with open(tmp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        try:
            os.replace(tmp_file, DATA_STORE_FILE)
        except OSError:
            time.sleep(0.05)
            os.replace(tmp_file, DATA_STORE_FILE)

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


def subscription_background_worker():
    """Background thread that automatically expires subscriptions, timed-out payment sessions, and publishes scheduled tests."""
    while True:
        try:
            time.sleep(10)
            data = load_backend_data()
            modified = subscription_manager.auto_expire_worker(data, sync_to_firebase)
            sched_modified = check_scheduled_mcq_tests(data, sync_to_firebase)
            if modified or sched_modified:
                save_backend_data(data)
        except Exception as e:
            print(f"[SUBSCRIPTION_WORKER_EXCEPTION] {e}", flush=True)

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

REVOKED_TOKENS = set()
REVOKED_USERS = set()

def authenticate_token(token_or_email):
    if not token_or_email:
        return None
    clean_token = str(token_or_email).strip()
    clean_uname = clean_token.lstrip('@').lower()
    if clean_token in REVOKED_TOKENS or clean_token.lower() in REVOKED_USERS or clean_uname in REVOKED_USERS:
        return None

    data = load_backend_data()
    persisted_revoked_tokens = set(data.get('revoked_tokens', []))
    persisted_revoked_users = set(data.get('revoked_users', []))
    if clean_token in persisted_revoked_tokens or clean_token.lower() in persisted_revoked_users or clean_uname in persisted_revoked_users:
        return None

    # 1. Authoritative lookup in stored users
    for email, u in data.get('users', {}).items():
        u_token = u.get('token') or ''
        u_id = u.get('id') or ''
        u_email = (u.get('email') or '').lower()
        u_uname = (u.get('username') or '').lstrip('@').lower()

        if (clean_token == u_token or 
            clean_token == u_id or 
            clean_token.lower() == u_email or 
            clean_uname == u_uname or 
            clean_token.lower() == u_uname):
            # Check revocation
            if (u_token and (u_token in REVOKED_TOKENS or u_token in persisted_revoked_tokens)) or \
               (u_id and (u_id.lower() in REVOKED_USERS or u_id.lower() in persisted_revoked_users)) or \
               (u_email and (u_email in REVOKED_USERS or u_email in persisted_revoked_users)) or \
               (u_uname and (u_uname in REVOKED_USERS or u_uname in persisted_revoked_users)):
                return None
            if u.get('isActive', True) and not u.get('isDeleted', False):
                return u
            return None

    # 2. Recognized administrator credentials
    if (clean_token == 'token_admin_excellenceca_secret' or 
        clean_token.startswith('token_admin_') or 
        clean_token == 'usr-admin-1' or 
        clean_token.lower() in ['admin', 'adminrulebreker', 'administrator', 'adminrulebreker@rulebrekerdothunter.com']):
        admin_u = next((u for u in data.get('users', {}).values() if u.get('role') == 'admin'), None)
        if admin_u and admin_u.get('isActive', True):
            return admin_u

    # 3. Recognized teacher credentials
    if clean_token == 'token_prof_sharma_teacher' or clean_token.lower() == 'prof.sharma@excellenceca.com':
        teach_u = next((u for u in data.get('users', {}).values() if u.get('role') == 'teacher'), None)
        if teach_u and teach_u.get('isActive', True):
            return teach_u

    # 4. Recognized standard student credentials
    if clean_token == 'token_rohan_sharma_student' or clean_token == 'usr-student-1':
        if ('usr-student-1' in persisted_revoked_users or 'usr-student-1' in REVOKED_USERS or 
            'token_rohan_sharma_student' in persisted_revoked_tokens or 'token_rohan_sharma_student' in REVOKED_TOKENS):
            return None
        st_u = next((u for u in data.get('users', {}).values() if u.get('id') == 'usr-student-1'), None)
        if st_u and st_u.get('isActive', True) and not st_u.get('isDeleted', False):
            return st_u

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
        if 'directory' not in kwargs:
            kwargs['directory'] = BASE_DIR
        super().__init__(*args, **kwargs)

    def _send_cors_headers(self):
        req_origin = self.headers.get('Origin', '') if hasattr(self, 'headers') and self.headers else ''
        
        # Allowed origins: production Vercel domain, Vercel preview deployments, and local development
        allowed_origin = None
        if req_origin:
            normalized_origin = req_origin.strip().rstrip('/')
            if (normalized_origin == 'https://excellenceca.vercel.app' or
                re.match(r'^https:\/\/[a-zA-Z0-9_\-]+\.vercel\.app$', normalized_origin) or
                re.match(r'^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$', normalized_origin) or
                normalized_origin == 'null'):
                allowed_origin = req_origin

        if allowed_origin:
            self.send_header('Access-Control-Allow-Origin', allowed_origin)
            self.send_header('Access-Control-Allow-Credentials', 'true')
        else:
            # Fallback for production frontend domain
            self.send_header('Access-Control-Allow-Origin', 'https://excellenceca.vercel.app')
            self.send_header('Access-Control-Allow-Credentials', 'true')

        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Auth-Token, Origin, Accept, Cache-Control')
        self.send_header('Access-Control-Max-Age', '86400')

    def send_json(self, status_code, data):
        payload = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(payload)
        try:
            self.wfile.flush()
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()
        try:
            self.wfile.flush()
        except Exception:
            pass

    def _get_request_path(self):
        matched_path = self.headers.get('x-matched-path') if hasattr(self, 'headers') and self.headers else None
        forwarded_uri = self.headers.get('x-forwarded-uri') if hasattr(self, 'headers') and self.headers else None
        req_path = matched_path or forwarded_uri or self.path
        if req_path.startswith('/api/index.py'):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != '/api/index.py' and parsed.path.startswith('/api/'):
                req_path = parsed.path
            elif forwarded_uri:
                req_path = forwarded_uri
        parsed_url = urllib.parse.urlparse(req_path)
        raw_path = parsed_url.path
        return raw_path.rstrip('/') if raw_path != '/' else '/'

    def get_auth_token(self):
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            return auth_header[7:].strip()
        x_token = self.headers.get('X-Auth-Token')
        if x_token:
            return x_token.strip()
        req_path = self.headers.get('x-matched-path') or self.headers.get('x-forwarded-uri') or self.path
        parsed = urllib.parse.urlparse(req_path)
        qs = urllib.parse.parse_qs(parsed.query)
        if 'token' in qs:
            return qs['token'][0].strip()
        return None

    def do_GET(self):
        print(f"[SERVER] Incoming GET: {self.path}", flush=True)
        raw_path = self._get_request_path()
        path = raw_path.rstrip('/') if raw_path != '/' else '/'
        effective_full = self.headers.get('x-matched-path') or self.headers.get('x-forwarded-uri') or self.path
        query = urllib.parse.parse_qs(urllib.parse.urlparse(effective_full).query)

        # 0. Health check endpoint
        if path == '/api/health':
            self.send_json(200, {
                'status': 'ok',
                'service': 'excellenceca-backend',
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
            return

        # Direct static access forbidden
        if '/private_storage' in path or path.startswith('/private_storage'):
            self.send_json(403, {
                'error': 'Access Denied: Direct static access to private storage is forbidden.',
                'code': 403
            })
            return

        # Secure Image Serving (QR Codes, Proofs, Uploads)
        if raw_path.startswith('/api/images/'):
            img_filename = os.path.basename(raw_path.replace('/api/images/', ''))
            ext = img_filename.lower().split('.')[-1] if '.' in img_filename else 'png'
            if ext in ('svg', 'svgz', 'html', 'htm', 'php', 'js', 'exe'):
                self.send_json(403, {'error': 'Forbidden file type.', 'code': 403})
                return
            img_path = os.path.join(PRIVATE_IMAGES_DIR, img_filename)
            if os.path.exists(img_path) and os.path.isfile(img_path):
                content_types = {
                    'png': 'image/png',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'webp': 'image/webp',
                    'gif': 'image/gif'
                }
                ctype = content_types.get(ext, 'image/png')
                try:
                    with open(img_path, 'rb') as f:
                        img_bytes = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', ctype)
                    self.send_header('Content-Length', str(len(img_bytes)))
                    self.send_header('X-Content-Type-Options', 'nosniff')
                    self.send_header('Cache-Control', 'public, max-age=86400')
                    self._send_cors_headers()
                    self.end_headers()
                    self.wfile.write(img_bytes)
                    return
                except Exception as e:
                    self.send_json(500, {'error': f'Image read error: {str(e)}'})
                    return
            else:
                self.send_json(404, {'error': 'Image not found', 'code': 404})
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
        if path in ('/api/auth/verify', '/api/auth/verify/'):
            token = self.get_auth_token()
            if not token:
                self.send_json(401, {'authenticated': False, 'error': 'Authorization token required', 'code': 401})
                return
            
            clean_token = str(token).strip()
            clean_uname = clean_token.lstrip('@').lower()
            data = load_backend_data()
            persisted_revoked_tokens = set(data.get('revoked_tokens', []))
            persisted_revoked_users = set(data.get('revoked_users', []))
            
            # Find matching user in database
            matched = None
            for email, u in data.get('users', {}).items():
                u_token = u.get('token') or ''
                u_id = u.get('id') or ''
                u_email = (u.get('email') or '').lower()
                u_uname = (u.get('username') or '').lstrip('@').lower()
                if (clean_token == u_token or 
                    clean_token == u_id or 
                    clean_token.lower() == u_email or 
                    clean_uname == u_uname or 
                    clean_token.lower() == u_uname):
                    matched = u
                    break

            if not matched:
                # Check legacy admin/teacher hardcodes
                if clean_token == 'token_admin_excellenceca_secret' or clean_uname in ['admin', 'adminrulebreker', 'adminrulebreker@rulebrekerdothunter.com']:
                    matched = next((u for u in data.get('users', {}).values() if u.get('role') == 'admin'), None)
                elif clean_token == 'token_prof_sharma_teacher' or clean_token.lower() == 'prof.sharma@excellenceca.com':
                    matched = next((u for u in data.get('users', {}).values() if u.get('role') == 'teacher'), None)

            if not matched:
                # If not found in memory/disk cache, refresh users from database to support newly issued tokens seamlessly
                refreshed_data = load_backend_data(refresh_collections=['users'])
                for email, u in refreshed_data.get('users', {}).items():
                    u_token = u.get('token') or ''
                    u_id = u.get('id') or ''
                    u_email = (u.get('email') or '').lower()
                    u_uname = (u.get('username') or '').lstrip('@').lower()
                    if (clean_token == u_token or 
                        clean_token == u_id or 
                        clean_token.lower() == u_email or 
                        clean_uname == u_uname or 
                        clean_token.lower() == u_uname):
                        matched = u
                        data = refreshed_data
                        persisted_revoked_tokens = set(data.get('revoked_tokens', []))
                        persisted_revoked_users = set(data.get('revoked_users', []))
                        break

            if not matched:
                self.send_json(401, {'authenticated': False, 'error': 'Invalid or expired token', 'code': 401})
                return

            # Check revocation
            u_token = matched.get('token') or ''
            u_id = (matched.get('id') or '').lower()
            u_email = (matched.get('email') or '').lower()
            if (clean_token in REVOKED_TOKENS or clean_token in persisted_revoked_tokens or
                u_token in REVOKED_TOKENS or u_token in persisted_revoked_tokens or
                u_id in REVOKED_USERS or u_id in persisted_revoked_users or
                u_email in REVOKED_USERS or u_email in persisted_revoked_users):
                self.send_json(401, {'authenticated': False, 'error': 'Session has been revoked or invalidated by administrator.', 'code': 401})
                return

            if matched.get('isDeleted', False):
                self.send_json(401, {'authenticated': False, 'error': 'Account has been removed.', 'code': 401})
                return

            if not matched.get('isActive', True):
                self.send_json(403, {'authenticated': False, 'deactivated': True, 'error': 'Account has been deactivated by administrator.', 'code': 403})
                return

            sanitized = dict(matched)
            sanitized.pop('password', None)
            self.send_json(200, {'authenticated': True, 'user': sanitized})
            return


        # ================================================================
        # SUBSCRIPTION, PAYMENT & ENTITLEMENT GET ENDPOINTS
        # ================================================================

        # 1. Public Plan Catalog
        if path == '/api/subscriptions/plans':
            token = self.get_auth_token()
            user = authenticate_token(token)
            data = load_backend_data()
            plans = subscription_manager.get_all_plans(data)
            is_trial_eligible = True
            if user:
                is_trial_eligible = subscription_manager.is_eligible_for_trial(user['id'], data)
            if 'subscription_plans' not in data or not data['subscription_plans']:
                data['subscription_plans'] = plans
                save_backend_data(data)
            self.send_json(200, {
                'success': True,
                'plans': plans,
                'isTrialEligible': is_trial_eligible
            })
            return

        # 2. Active Payment Channels (for student checkout)
        if path in ('/api/payments/channels', '/api/admin/payment-channels'):
            data = load_backend_data(refresh_collections=['payment_channels'])
            channels = subscription_manager.get_payment_channels(data)
            save_backend_data(data)
            self.send_json(200, {'success': True, 'channels': channels})
            return

        # 3. Authenticated Student Current Subscription, Entitlements & Payment History
        if path == '/api/subscriptions/my':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'success': False, 'error': 'Authentication required to view subscription details.', 'code': 401})
                return
            data = load_backend_data(refresh_collections=['subscriptions'])
            sub = subscription_manager.get_user_subscription(user['id'], data, sync_to_firebase)
            entitlements = subscription_manager.get_user_entitlements(user['id'], data, sync_to_firebase)
            user_sessions = [s for s in data.get('payment_sessions', []) if s.get('userId') == user['id']]
            self.send_json(200, {
                'success': True,
                'subscription': sub,
                'entitlements': entitlements,
                'paymentHistory': user_sessions
            })
            return

        # 3b. Authenticated Student Payment & Membership History
        if path == '/api/subscriptions/history':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'success': False, 'error': 'Authentication required.', 'code': 401})
                return
            data = load_backend_data(refresh_collections=['payment_sessions'])
            user_sessions = [s for s in data.get('payment_sessions', []) if s.get('userId') == user['id'] or (user.get('email') and s.get('userEmail') == user.get('email'))]
            self.send_json(200, {
                'success': True,
                'sessions': user_sessions,
                'history': user_sessions,
                'total': len(user_sessions)
            })
            return

        # 3c. Authenticated Student Active Payment Session Recovery
        if path == '/api/payments/active-session':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'success': False, 'error': 'Authentication required.', 'code': 401})
                return
            data = load_backend_data(refresh_collections=['payment_sessions'])
            sessions = data.get('payment_sessions', [])
            user_sessions = [s for s in sessions if s.get('userId') == user['id'] or (user.get('email') and s.get('userEmail') == user.get('email'))]

            now_utc = datetime.now(timezone.utc)
            active_session = None
            dirty = False

            # Check query param for a specific sessionId if provided
            req_session_id = query.get('sessionId', [None])[0] or query.get('paymentSessionId', [None])[0]

            for s in user_sessions:
                if req_session_id and (s.get('paymentSessionId') != req_session_id and s.get('id') != req_session_id):
                    continue
                if s.get('status') == 'pending' and s.get('expiresAt'):
                    try:
                        clean_exp = s['expiresAt'].replace('Z', '+00:00')
                        exp_dt = datetime.fromisoformat(clean_exp)
                        if exp_dt.tzinfo is None:
                            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                        if exp_dt > now_utc:
                            active_session = s
                            break
                        else:
                            s['status'] = 'expired'
                            sync_to_firebase(f"payment_sessions/{s.get('paymentSessionId') or s.get('id')}", s)
                            dirty = True
                    except Exception:
                        pass

            if dirty:
                save_backend_data(data)

            if active_session:
                try:
                    clean_exp = active_session['expiresAt'].replace('Z', '+00:00')
                    exp_dt = datetime.fromisoformat(clean_exp)
                    if exp_dt.tzinfo is None:
                        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                    rem_sec = max(0, int((exp_dt - now_utc).total_seconds()))
                except Exception:
                    rem_sec = 0
                self.send_json(200, {
                    'success': True,
                    'hasActiveSession': True,
                    'session': active_session,
                    'remainingSeconds': rem_sec
                })
            else:
                self.send_json(200, {
                    'success': True,
                    'hasActiveSession': False,
                    'session': None,
                    'remainingSeconds': 0
                })
            return

        # 4. Admin Subscriptions List & KPIs
        if path == '/api/admin/subscriptions':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            data = load_backend_data(refresh_collections=['subscriptions'])
            subscriptions = data.get('subscriptions', {})
            users_dict = data.get('users', {})
            enriched = []
            subs_map = {}
            for u_id, sub in subscriptions.items():
                st_user = next((u for u in users_dict.values() if u.get('id') == u_id), {})
                entitlements = subscription_manager.get_user_entitlements(u_id, data, sync_to_firebase)
                entry = {
                    'subscription': sub,
                    'entitlements': entitlements,
                    'student': {
                        'id': u_id,
                        'name': st_user.get('name', 'Student'),
                        'email': st_user.get('email', ''),
                        'phone': st_user.get('phone', ''),
                        'username': st_user.get('username', ''),
                        'caLevel': st_user.get('caLevel', ''),
                        'avatar': st_user.get('avatar', '')
                    }
                }
                enriched.append(entry)
                subs_map[u_id] = sub
            active_count = sum(1 for s in enriched if s['subscription'].get('status') in ('active', 'manually_granted') and not s['subscription'].get('isTrial'))
            trial_count = sum(1 for s in enriched if s['subscription'].get('status') in ('active', 'manually_granted') and s['subscription'].get('isTrial'))
            expired_count = sum(1 for s in enriched if s['subscription'].get('status') == 'expired')
            print(f"[ADMIN_SUBSCRIPTIONS] Serving {len(enriched)} subscriptions to admin {admin_u.get('email')}", flush=True)
            self.send_json(200, {
                'success': True,
                'subscriptions': subs_map,
                'subscriptionsList': enriched,
                'stats': {
                    'activeSubscriptions': active_count,
                    'activeTrials': trial_count,
                    'expiredSubscriptions': expired_count,
                    'totalSubscribers': len(enriched)
                }
            })
            return

        # 5. Admin Payments List & Stats
        if path == '/api/admin/payments':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            data = load_backend_data(refresh_collections=['payment_sessions', 'users'])
            sessions = data.get('payment_sessions', [])
            status_filter = query.get('status', [None])[0]
            if status_filter and status_filter != 'all':
                filtered = [s for s in sessions if s.get('status') == status_filter]
            else:
                filtered = sessions

            # Build authentic user lookup from database users
            raw_users = data.get('users', {})
            users_list = list(raw_users.values()) if isinstance(raw_users, dict) else (raw_users if isinstance(raw_users, list) else [])
            user_by_id = {}
            user_by_email = {}
            for u in users_list:
                if isinstance(u, dict):
                    uid = u.get('id')
                    uemail = str(u.get('email') or '').strip().lower()
                    if uid:
                        user_by_id[uid] = u
                    if uemail:
                        user_by_email[uemail] = u

            enriched_payments = []
            for s in filtered:
                if not isinstance(s, dict):
                    continue
                s_copy = dict(s)
                uid = s_copy.get('userId') or s_copy.get('studentId')
                uemail = str(s_copy.get('userEmail') or s_copy.get('studentEmail') or '').strip().lower()
                user_obj = user_by_id.get(uid) or user_by_email.get(uemail)
                if user_obj:
                    if user_obj.get('name'):
                        s_copy['studentName'] = user_obj.get('name')
                        s_copy['userName'] = user_obj.get('name')
                    if user_obj.get('username'):
                        s_copy['username'] = user_obj.get('username')
                    if user_obj.get('email'):
                        s_copy['studentEmail'] = user_obj.get('email')
                        s_copy['userEmail'] = user_obj.get('email')
                    if user_obj.get('id'):
                        s_copy['studentId'] = user_obj.get('id')
                        s_copy['userId'] = user_obj.get('id')
                enriched_payments.append(s_copy)

            stats = {
                'total': len(sessions),
                'pending': sum(1 for s in sessions if s.get('status') in ('pending_verification', 'late_payment')),
                'approved': sum(1 for s in sessions if s.get('status') == 'approved'),
                'rejected': sum(1 for s in sessions if s.get('status') == 'rejected'),
                'totalRevenue': sum(s.get('amount', 0) for s in sessions if s.get('status') == 'approved')
            }
            print(f"[ADMIN_PAYMENTS] Serving {len(enriched_payments)} payment sessions to admin {admin_u.get('email')} (filter={status_filter})", flush=True)
            self.send_json(200, {
                'success': True,
                'payments': enriched_payments,
                'stats': stats
            })
            return

        # 6. Admin Plan Catalog
        if path == '/api/admin/plans':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            data = load_backend_data()
            plans = subscription_manager.get_all_plans(data)
            self.send_json(200, {'success': True, 'plans': plans})
            return

        # 7. Admin Audit Logs
        if path == '/api/admin/audit-logs':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            data = load_backend_data()
            logs = data.get('admin_audit_logs', [])
            self.send_json(200, {'success': True, 'logs': logs})
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

        # Admin Users Directory (Returns all registered students and teachers directly from database)
        if path == '/api/admin/users':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return
            data = load_backend_data(refresh_collections=['users'])
            users_list = []
            revoked_set = set(str(x).lower().strip() for x in data.get('revoked_users', []))
            for u in data.get('users', {}).values():
                if not isinstance(u, dict):
                    continue
                u_id = str(u.get('id') or '').lower().strip()
                u_email = str(u.get('email') or '').lower().strip()
                u_uname = str(u.get('username') or '').lower().lstrip('@').strip()
                if u_id in revoked_set or u_email in revoked_set or u_uname in revoked_set:
                    continue
                if u.get('isDeleted', False):
                    continue
                u_copy = dict(u)
                u_copy.pop('password', None)
                u_copy.pop('token', None)
                u_copy['hasPassword'] = bool(u.get('password'))
                u_copy['passwordProtected'] = True
                users_list.append(u_copy)

            # Sort newest first for consistent presentation
            users_list.sort(key=lambda x: str(x.get('createdAt') or ''), reverse=True)
            students_count = len([u for u in users_list if u.get('role') == 'student'])
            teachers_count = len([u for u in users_list if u.get('role') == 'teacher'])
            active_students_count = len([u for u in users_list if u.get('role') == 'student' and u.get('isActive', True) is not False])

            self.send_json(200, {
                'users': users_list,
                'total': len(users_list),
                'students': students_count,
                'teachers': teachers_count,
                'activeStudents': active_students_count
            })
            return

        # Descriptive Papers
        if path == '/api/papers':
            token = self.get_auth_token()
            user = authenticate_token(token)
            data = load_backend_data(refresh_collections=['papers', 'assignments'])
            papers = data.get('papers', [])
            now_iso = datetime.now(timezone.utc).isoformat()
            is_admin_or_teacher = user and user.get('role') in ['admin', 'teacher']
            user_tier = get_user_tier(user.get('id') if user else None, data) if not is_admin_or_teacher else 'admin'
            result = []
            for p in papers:
                p_copy = dict(p)
                sched_time = p.get('scheduledPublishTime')
                live_start = p.get('liveStartTime')
                live_end = p.get('liveEndTime')
                base_status = p.get('status', 'Published')

                raw_req = p.get('requiredTier')
                if not raw_req or str(raw_req).strip().lower() in ('none', 'null', '', 'free'):
                    req_tier = 'free'
                else:
                    req_tier = str(raw_req).strip().lower()
                p_copy['requiredTier'] = req_tier
                
                # Check eligibility using allowedPlans if present or requiredTier fallback
                has_tier = is_admin_or_teacher or check_test_eligibility(user_tier, p)
                p_copy['isTierLocked'] = not has_tier

                hide_non_eligible = bool(p.get('hideFromNonEligible', False))
                if not has_tier and hide_non_eligible and not is_admin_or_teacher:
                    continue  # Hidden from non-eligible students

                if not has_tier:
                    p_copy['questionPdfId'] = None
                    p_copy['questionPdfName'] = None
                    p_copy['questionPdfData'] = None
                    p_copy['answerPdfId'] = None
                    p_copy['answerPdfName'] = None
                    p_copy['answerPdfData'] = None

                # Support untimed / infinite duration
                if p.get('isUntimed') or not p.get('hasTimeLimit', True) or p.get('durationMinutes') == 0:
                    p_copy['isUntimed'] = True
                    p_copy['hasTimeLimit'] = False
                    p_copy['durationMinutes'] = 0

                if base_status == 'Draft':
                    if not is_admin_or_teacher: continue
                    p_copy['effectiveStatus'] = 'Draft'
                elif base_status == 'Scheduled' or (sched_time and sched_time > now_iso):
                    if sched_time and sched_time > now_iso:
                        p_copy['effectiveStatus'] = 'Scheduled'
                        if not is_admin_or_teacher: p_copy['isAvailable'] = False
                    else:
                        p_copy['effectiveStatus'] = 'Published'
                elif base_status == 'Live' or p.get('isLive'):
                    if live_start and live_end:
                        if now_iso < live_start:
                            p_copy['effectiveStatus'] = 'Upcoming Live'
                            if not is_admin_or_teacher: p_copy['isAvailable'] = False
                        elif live_start <= now_iso <= live_end:
                            p_copy['effectiveStatus'] = 'Live Active'
                        else:
                            p_copy['effectiveStatus'] = 'Concluded'
                    else:
                        p_copy['effectiveStatus'] = 'Live Active'
                else:
                    p_copy['effectiveStatus'] = base_status

                result.append(p_copy)
            self.send_json(200, {'papers': result, 'userTier': user_tier})
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
            data = load_backend_data(refresh_collections=['tests', 'questions'])
            if check_scheduled_mcq_tests(data, sync_to_firebase):
                save_backend_data(data)
            tests = data.get('tests', [])
            test_id = query.get('testId', [None])[0]
            user_tier = get_user_tier(user.get('id') if user else None, data) if not is_admin else 'admin'

            if test_id:
                target_test = next((t for t in tests if t.get('id') == test_id), None)
                if not target_test:
                    self.send_json(404, {'error': 'Test not found', 'code': 404})
                    return
                # Check permissions
                if not is_admin and not (target_test.get('isPublished', True) or target_test.get('status') in ('Published', 'Live')):
                    self.send_json(403, {'error': 'Test is currently in Draft mode.', 'code': 403})
                    return

                # If student is ineligible and test is hidden, return 404 (zero trace)
                if not is_admin and not check_test_visibility(user_tier, target_test):
                    self.send_json(404, {'error': 'Test not found', 'code': 404})
                    return

                is_eligible = is_admin or check_test_eligibility(user_tier, target_test)
                if not is_admin and not is_eligible:
                    test_req_tier = str(target_test.get('requiredTier') or target_test.get('tier') or 'free').lower()
                    self.send_json(403, {
                        'error': 'Access Denied: You do not have an eligible subscription pass to attempt this test.',
                        'code': 403,
                        'requiredTier': test_req_tier,
                        'allowedPlans': target_test.get('allowedPlans') or [test_req_tier],
                        'isLocked': True
                    })
                    return

                all_qs = [q for q in data.get('questions', []) if q.get('testId') == test_id]
                all_qs.sort(key=lambda x: x.get('number', 0))

                # If student taking test: STRIP ANSWER KEY, EXPLANATIONS, AND LOCK HIGHER TIER QUESTIONS
                if not is_admin:
                    sanitized_qs = []
                    for q in all_qs:
                        q_copy = dict(q)
                        req_tier = str(q.get('requiredTier', 'free')).lower()
                        q_copy['requiredTier'] = req_tier
                        has_access = check_tier_access(user_tier, req_tier)

                        if not has_access:
                            q_copy['isLocked'] = True
                            q_copy['text'] = f"This question requires an active {req_tier.capitalize()} Pass or higher."
                            q_copy['questionType'] = 'text'
                            q_copy['questionImage'] = None
                            q_copy['optionA'] = ''
                            q_copy['optionB'] = ''
                            q_copy['optionC'] = ''
                            q_copy['optionD'] = ''
                            q_copy['optionTypes'] = {'A': 'text', 'B': 'text', 'C': 'text', 'D': 'text'}
                            q_copy['optionImages'] = {'A': None, 'B': None, 'C': None, 'D': None}
                            q_copy.pop('correctOption', None)
                            q_copy.pop('explanation', None)
                            q_copy.pop('aiSuggestedAnswer', None)
                        else:
                            q_copy['isLocked'] = False
                            q_copy.pop('correctOption', None)
                            q_copy.pop('explanation', None)
                            q_copy.pop('aiSuggestedAnswer', None)
                        sanitized_qs.append(q_copy)
                    self.send_json(200, {'test': target_test, 'questions': sanitized_qs, 'userTier': user_tier})
                else:
                    self.send_json(200, {'test': target_test, 'questions': all_qs, 'userTier': 'admin'})
                return
            else:
                if is_admin:
                    self.send_json(200, {'tests': tests, 'userTier': 'admin'})
                else:
                    pub_tests = [t for t in tests if t.get('isPublished', True) or t.get('status') in ('Published', 'Live')]
                    enriched_tests = []
                    for t in pub_tests:
                        if not check_test_visibility(user_tier, t):
                            continue  # Hidden completely from non-eligible students
                        is_eligible = check_test_eligibility(user_tier, t)
                        req_tier = str(t.get('requiredTier') or t.get('tier') or 'free').lower()
                        t_copy = dict(t)
                        t_copy['requiredTier'] = req_tier
                        t_copy['tier'] = req_tier
                        t_copy['isLocked'] = not is_eligible
                        enriched_tests.append(t_copy)
                    self.send_json(200, {'tests': enriched_tests, 'userTier': user_tier})
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

            if user.get('role') == 'student':
                data = load_backend_data()
                target_paper = None
                if paper_id:
                    target_paper = next((p for p in data.get('papers', []) if p.get('id') == paper_id), None)
                if not target_paper:
                    target_paper = next((p for p in data.get('papers', []) if (
                        p.get('id') == safe_file_id or
                        p.get('questionPdfId') == safe_file_id or
                        p.get('answerPdfId') == safe_file_id or
                        p.get('questionPdfName') == safe_file_id or
                        p.get('answerPdfName') == safe_file_id or
                        (mapped and (p.get('questionPdfId') == mapped or p.get('answerPdfId') == mapped))
                    )), None)

                if target_paper:
                    req_tier = str(target_paper.get('requiredTier') or 'free').lower()
                    user_tier = get_user_tier(user.get('id'), data)
                    if not check_tier_access(user_tier, req_tier):
                        self.send_json(403, {
                            'error': f'Access Denied: This test paper requires an active {req_tier.capitalize()} Pass or higher.',
                            'code': 403,
                            'requiredTier': req_tier,
                            'isTierLocked': True
                        })
                        return

                    now_iso = datetime.now(timezone.utc).isoformat()
                    if target_paper.get('status') == 'Draft':
                        self.send_json(403, {'error': 'Paper is currently in Draft mode and cannot be downloaded.', 'code': 403})
                        return
                    sched = target_paper.get('scheduledPublishTime')
                    if target_paper.get('status') == 'Scheduled' and sched and now_iso < sched:
                        self.send_json(403, {'error': f'Paper is scheduled for release at {sched}. Access blocked.', 'code': 403})
                        return
                    live_start = target_paper.get('liveStartTime')
                    live_end = target_paper.get('liveEndTime')
                    if (target_paper.get('isLive') or target_paper.get('status') == 'Live') and live_start and now_iso < live_start:
                        self.send_json(403, {'error': f'Live test has not started yet. Starts at {live_start}.', 'code': 403})
                        return
                    if doc_type == 'answer' and target_paper.get('isLive') and live_end and now_iso < live_end:
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
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(content)
                return
            except Exception as e:
                self.send_json(500, {'error': f'Failed to read file: {str(e)}', 'code': 500})
                return

        super().do_GET()

    def do_POST(self):
        raw_path = self._get_request_path()
        path = raw_path.rstrip('/') if raw_path != '/' else '/'
        effective_full = self.headers.get('x-matched-path') or self.headers.get('x-forwarded-uri') or self.path
        query = urllib.parse.parse_qs(urllib.parse.urlparse(effective_full).query)

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


        # ================================================================
        # SUBSCRIPTION & PAYMENT POST ENDPOINTS
        # ================================================================

        # 1. Create 5-Minute Payment Session
        if path == '/api/payments/create-session':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'success': False, 'error': 'Authentication required to initiate payment.', 'code': 401})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                plan_id = req_data.get('planId')
                data = load_backend_data()
                sync_sync_fn = lambda p, d, method='PUT': sync_to_firebase(p, d, method=method, sync=True)
                success, res = subscription_manager.create_payment_session(user, plan_id, data, sync_sync_fn)
                if not success:
                    self.send_json(400, {'success': False, 'error': res})
                    return
                save_backend_data(data)
                self.send_json(200, {'success': True, 'session': res})
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Failed to create payment session: {str(e)}'})
                return

        # 2. Cancel In-Flight Payment Session
        if path == '/api/payments/cancel-session':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'success': False, 'error': 'Authentication required.', 'code': 401})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                session_id = req_data.get('paymentSessionId') or req_data.get('sessionId')
                data = load_backend_data()
                sync_sync_fn = lambda p, d, method='PUT': sync_to_firebase(p, d, method=method, sync=True)
                success, res = subscription_manager.cancel_payment_session(user['id'], session_id, data, sync_sync_fn)
                save_backend_data(data)
                self.send_json(200, {'success': success, 'session': res if success else None})
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Failed to cancel session: {str(e)}'})
                return

        # 3. Submit Payment UTR & Screenshot
        if path == '/api/payments/submit-payment':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user:
                self.send_json(401, {'success': False, 'error': 'Authentication required.', 'code': 401})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                session_id = req_data.get('paymentSessionId') or req_data.get('sessionId')
                utr = req_data.get('utr')
                screenshot = req_data.get('screenshot')

                if not screenshot or not isinstance(screenshot, str) or len(screenshot.strip()) < 10:
                    self.send_json(400, {'success': False, 'error': 'Please upload a clear payment screenshot or receipt.'})
                    return

                valid, err, binary_data, mime, ext = validate_and_sanitize_upload(
                    screenshot,
                    allowed_types=['image'],
                    max_size_bytes=5 * 1024 * 1024,
                    original_filename='receipt.png'
                )
                if not valid:
                    self.send_json(400, {'success': False, 'error': f'Invalid payment proof: {err}'})
                    return

                clean_screenshot_uri = f"data:{mime};base64,{base64.b64encode(binary_data).decode('utf-8')}"
                data = load_backend_data()
                sync_sync_fn = lambda p, d, method='PUT': sync_to_firebase(p, d, method=method, sync=True)
                success, res = subscription_manager.submit_payment(user['id'], session_id, utr, clean_screenshot_uri, data, sync_sync_fn)
                if not success:
                    self.send_json(400, {'success': False, 'error': res})
                    return
                save_backend_data(data)
                self.send_json(200, {'success': True, 'session': res})
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Payment submission error: {str(e)}'})
                return

        # 4. Admin Payment Verification (Approve / Reject)
        if path == '/api/admin/payments/verify':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                session_id = req_data.get('paymentSessionId') or req_data.get('sessionId')
                action = req_data.get('action') # 'approve' or 'reject'
                reason = req_data.get('rejectionReason', '')
                remarks = req_data.get('remarks') or req_data.get('adminRemarks') or reason
                data = load_backend_data()
                success, res = subscription_manager.verify_payment(admin_u, session_id, action, reason, data, sync_to_firebase, remarks=remarks)
                if not success:
                    self.send_json(400, {'success': False, 'error': res})
                    return
                save_backend_data(data)
                user_sub = data.get('subscriptions', {}).get(res.get('userId')) if isinstance(res, dict) else None
                self.send_json(200, {'success': True, 'session': res, 'subscription': user_sub})
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Verification error: {str(e)}'})
                return

        # 5. Admin Subscription Management (Grant / Extend / Shorten / Suspend / Reactivate / Cancel)
        if path == '/api/admin/subscriptions/manage':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                action = req_data.get('action')
                data = load_backend_data()

                user_ids = req_data.get('userIds')
                if isinstance(user_ids, list) and user_ids:
                    results = []
                    for uid in user_ids:
                        ok, r = subscription_manager.manage_subscription(admin_u, uid, action, req_data, data, sync_to_firebase)
                        results.append({'userId': uid, 'success': ok, 'result': r if ok else str(r)})
                    save_backend_data(data)
                    print(f"[ADMIN_SUBSCRIPTIONS] Bulk {action} executed for {len(user_ids)} users by {admin_u.get('email')}", flush=True)
                    self.send_json(200, {'success': True, 'bulk': True, 'count': len(user_ids), 'results': results})
                    return
                else:
                    user_id = req_data.get('userId') or req_data.get('studentId')
                    success, res = subscription_manager.manage_subscription(admin_u, user_id, action, req_data, data, sync_to_firebase)
                    if not success:
                        self.send_json(400, {'success': False, 'error': res})
                        return
                    save_backend_data(data)
                    print(f"[ADMIN_SUBSCRIPTIONS] {action} executed for user {user_id} by {admin_u.get('email')}", flush=True)
                    self.send_json(200, {'success': True, 'subscription': res})
                    return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Management error: {str(e)}'})
                return

        # 6. Admin Payment Channels Management (Add / Edit / Delete / Toggle / Set Primary)
        if path == '/api/admin/payment-channels':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                action = req_data.get('action')
                data = load_backend_data()

                combined_params = dict(req_data)
                if isinstance(req_data.get('channelData'), dict):
                    combined_params.update(req_data['channelData'])
                if 'channelId' in req_data and 'id' not in combined_params:
                    combined_params['id'] = req_data['channelId']

                success, res = subscription_manager.manage_payment_channel(
                    admin_u, action, combined_params, data,
                    lambda path, d, method='PUT': sync_to_firebase(path, d, method=method, sync=True)
                )
                if not success:
                    self.send_json(400, {'success': False, 'error': res})
                    return
                save_backend_data(data)
                print(f"[ADMIN_CHANNELS] Channel action {action} succeeded by {admin_u.get('email')}", flush=True)
                self.send_json(200, {'success': True, 'result': res})
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Channel management error: {str(e)}'})
                return

        # 6b. Admin Upload Payment Channel QR Image
        if path == '/api/admin/payment-channels/upload-qr':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 6 * 1024 * 1024:
                    self.send_json(413, {'success': False, 'error': 'QR image exceeds 5 MB limit.', 'code': 413})
                    return
                body = self.rfile.read(content_length)
                post_data = json.loads(body.decode('utf-8'))
                file_name = post_data.get('fileName', 'channel_qr.png')
                file_data_b64 = post_data.get('fileData', '')
                channel_id = post_data.get('channelId')

                valid, err, binary_data, mime_type, safe_ext = validate_and_sanitize_upload(
                    file_data_b64,
                    allowed_types=['image'],
                    max_size_bytes=5 * 1024 * 1024,
                    original_filename=file_name
                )
                if not valid:
                    self.send_json(400, {'success': False, 'error': f'Invalid image format: {err}'})
                    return

                sanitized_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(file_name))
                unique_img_id = f'qr_{uuid.uuid4().hex[:12]}{safe_ext}'
                dest_path = os.path.join(PRIVATE_IMAGES_DIR, unique_img_id)
                with open(dest_path, 'wb') as f:
                    f.write(binary_data)

                clean_b64 = base64.b64encode(binary_data).decode('utf-8')
                qr_url = f'data:{mime_type};base64,{clean_b64}'
                data = load_backend_data()
                if channel_id:
                    channels = data.setdefault('payment_channels', [])
                    target = next((c for c in channels if c.get('id') == channel_id), None)
                    if target:
                        target['qrCodeUrl'] = qr_url
                        save_backend_data(data)
                        sync_to_firebase(f"payment_channels/{channel_id}", target)

                self.send_json(200, {
                    'success': True,
                    'qrCodeUrl': qr_url,
                    'imageId': unique_img_id
                })
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'QR upload error: {str(e)}'})
                return

        # 7. Admin Plan Configuration (Pricing, Features, Limits, Trial)
        if path == '/api/admin/plans':
            token = self.get_auth_token()
            admin_u = authenticate_token(token)
            if not admin_u or admin_u.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Administrator authorization required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                plan_id = req_data.get('planId')
                updates = req_data.get('updates') or req_data.get('planData') or {}
                data = load_backend_data()
                success, res = subscription_manager.manage_plans_config(admin_u, plan_id, updates, data, sync_to_firebase)
                if not success:
                    self.send_json(400, {'success': False, 'error': res})
                    return
                save_backend_data(data)
                self.send_json(200, {'success': True, 'plan': res})
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Plan config error: {str(e)}'})
                return

        # 0. User Login with Secure Password Verification
        if path in ('/api/auth/login', '/api/auth/login/'):
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                req_data = json.loads(body.decode('utf-8')) if body else {}
                raw_id = str(req_data.get('identifier') or req_data.get('username') or req_data.get('email') or '').strip()
                identifier = raw_id.lower()
                clean_uname = identifier.lstrip('@')
                password = str(req_data.get('password') or '')

                if not identifier or not password:
                    self.send_json(400, {'success': False, 'error': 'Login Failed: Username/email and password are required.'})
                    return

                data = load_backend_data(refresh_collections=['users'])
                persisted_revoked_users = set(str(x).lower().strip() for x in data.get('revoked_users', []))
                if (identifier in persisted_revoked_users or 
                    clean_uname in persisted_revoked_users or 
                    identifier in REVOKED_USERS or 
                    clean_uname in REVOKED_USERS):
                    self.send_json(401, {'success': False, 'error': 'Login Failed: Account has been permanently removed.'})
                    return

                users_dict = data.get('users', {})
                matched_user = None

                for email_key, u in users_dict.items():
                    u_email = str(u.get('email') or '').strip().lower()
                    u_uname = str(u.get('username') or '').strip().lower().lstrip('@')
                    u_email_prefix = u_email.split('@')[0] if '@' in u_email else ''
                    u_id = str(u.get('id') or '').strip().lower()
                    u_reg = str(u.get('registrationNo') or '').strip().lower()
                    if (identifier == u_email or 
                        clean_uname == u_uname or 
                        identifier == u_uname or 
                        clean_uname == u_email_prefix or
                        clean_uname == u_email_prefix.replace('.', '_') or
                        identifier == u_id or
                        clean_uname == u_id or
                        (u_reg and (identifier == u_reg or clean_uname == u_reg)) or
                        (clean_uname in ('admin', 'adminrulebreker', 'administrator') and u.get('role') == 'admin') or
                        (clean_uname in ('teacher', 'prof_rajesh') and u.get('role') == 'teacher')):
                        matched_user = u
                        break

                if not matched_user or not verify_password(password, matched_user.get('password', '')):
                    self.send_json(401, {'success': False, 'error': 'Login Failed: Invalid username or password.'})
                    return

                m_id = str(matched_user.get('id') or '').lower().strip()
                m_email = str(matched_user.get('email') or '').lower().strip()
                m_uname = str(matched_user.get('username') or '').lower().lstrip('@').strip()
                if (m_id in persisted_revoked_users or m_id in REVOKED_USERS or
                    m_email in persisted_revoked_users or m_email in REVOKED_USERS or
                    m_uname in persisted_revoked_users or m_uname in REVOKED_USERS or
                    matched_user.get('isDeleted', False)):
                    self.send_json(401, {'success': False, 'error': 'Login Failed: Account has been permanently removed.'})
                    return

                if not matched_user.get('isActive', True):
                    self.send_json(403, {'success': False, 'error': 'Login Failed: Your account has been deactivated by the Administrator. Please contact faculty support.'})
                    return

                # Upgrade password to hash if it was legacy plain text
                if not matched_user.get('password', '').startswith('sha256:'):
                    matched_user['password'] = hash_password(password)

                # Issue fresh active session token on login and sync to persistent storage and Firebase
                new_session_tok = f"token_{matched_user.get('role', 'student')}_{uuid.uuid4().hex[:16]}"
                matched_user['token'] = new_session_tok

                save_backend_data(data)
                sync_to_firebase(f"users/{matched_user['id']}", {'token': new_session_tok}, method='PATCH', sync=True)

                sanitized = dict(matched_user)
                sanitized.pop('password', None)
                self.send_json(200, {
                    'success': True,
                    'user': sanitized,
                    'token': new_session_tok
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
                raw_uname = str(post_data.get('username') or '').strip().lower().lstrip('@')
                raw_pass = str(post_data.get('password') or '')

                if not raw_email or not raw_pass:
                    self.send_json(400, {'success': False, 'error': 'Email and password are required.'})
                    return

                data = load_backend_data()
                revoked_set = set(str(x).lower().strip() for x in data.get('revoked_users', []))
                if raw_email in revoked_set or (raw_uname and raw_uname in revoked_set):
                    self.send_json(409, {'success': False, 'error': 'This username or email has been permanently decommissioned or deactivated.'})
                    return

                users_dict = data.get('users', {})

                # Check uniqueness
                for u in users_dict.values():
                    if (u.get('email') or '').lower() == raw_email:
                        self.send_json(409, {'success': False, 'error': 'An account with this email already exists.'})
                        return
                    if raw_uname and (u.get('username') or '').lower().lstrip('@') == raw_uname:
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
                            # 1. Credit Referrer Points, Count & Total XP
                            referrer['referralPoints'] = int(referrer.get('referralPoints', 0)) + referrer_reward
                            referrer['referralCount'] = int(referrer.get('referralCount', 0)) + 1
                            referrer['totalXp'] = int(referrer.get('totalXp', 0)) + referrer_reward
                            
                            # 2. Credit New Student Reward Points & Total XP
                            new_user['referralPoints'] = int(new_user.get('referralPoints', 0)) + new_student_reward
                            new_user['totalXp'] = int(new_user.get('totalXp', 0)) + new_student_reward
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

                            # 3b. Add XP Ledger Transactions for Referrer and New User
                            now_iso_ref = datetime.now(timezone.utc).isoformat()
                            xp_txs = data.setdefault('xp_transactions', [])
                            ref_tx_referrer = {
                                'id': f"tx_ref_{ref_id}_r",
                                'userId': referrer.get('id'),
                                'userName': referrer.get('name', 'Referrer'),
                                'activityName': f"Referral Bonus: Invited @{new_user.get('username')}",
                                'points': referrer_reward,
                                'sourceType': 'referral',
                                'timestamp': now_iso_ref,
                                'createdAt': now_iso_ref,
                                'metadata': {'referredUserId': user_id, 'referralId': ref_id}
                            }
                            ref_tx_student = {
                                'id': f"tx_ref_{ref_id}_s",
                                'userId': user_id,
                                'userName': new_user.get('name', 'New Student'),
                                'activityName': f"Welcome Referral Bonus: Used code @{referrer.get('username')}",
                                'points': new_student_reward,
                                'sourceType': 'referral',
                                'timestamp': now_iso_ref,
                                'createdAt': now_iso_ref,
                                'metadata': {'referrerUserId': referrer.get('id'), 'referralId': ref_id}
                            }
                            xp_txs.insert(0, ref_tx_referrer)
                            xp_txs.insert(0, ref_tx_student)
                            sync_to_firebase(f"xp_transactions/{ref_tx_referrer['id']}", ref_tx_referrer)
                            sync_to_firebase(f"xp_transactions/{ref_tx_student['id']}", ref_tx_student)

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

                # Real-time synchronization to Firebase Realtime Database with secure hashed password
                user_for_fb = dict(new_user)
                sync_to_firebase(f"users/{user_id}", user_for_fb, method='PUT')
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
                valid, err, binary_data, detected_mime, safe_ext = validate_and_sanitize_upload(
                    file_data_b64,
                    allowed_types=['pdf'],
                    max_size_bytes=20 * 1024 * 1024,
                    original_filename=file_name
                )
                if not valid:
                    self.send_json(400, {'error': f'Validation Error: {err}', 'code': 400})
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

                valid, err, binary_data, detected_mime, safe_ext = validate_and_sanitize_upload(
                    file_data_b64,
                    allowed_types=['image'],
                    max_size_bytes=5 * 1024 * 1024,
                    original_filename=file_name
                )
                if not valid:
                    self.send_json(400, {'error': f'Validation Error: {err}', 'code': 400})
                    return

                sanitized_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(file_name))
                unique_img_id = f'img_{uuid.uuid4().hex[:12]}{safe_ext}'
                dest_path = os.path.join(PRIVATE_IMAGES_DIR, unique_img_id)
                with open(dest_path, 'wb') as f:
                    f.write(binary_data)

                # Return full data URL so frontend renders directly without extra HTTP auth roundtrips
                data_url = f"data:{detected_mime};base64,{base64.b64encode(binary_data).decode('utf-8')}"

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

        # Bulk Student Notifications Management
        if path == '/api/notifications/bulk':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
                raw_notifs = req_data.get('notifications', [])
                if not isinstance(raw_notifs, list) or not raw_notifs:
                    self.send_json(400, {'success': False, 'error': 'No notifications provided.'})
                    return

                data = load_backend_data()
                notifs = data.get('notifications', [])
                added_notifs = []
                now_iso = datetime.now(timezone.utc).isoformat()
                now_ts = int(datetime.now().timestamp() * 1000)

                for idx, n in enumerate(raw_notifs):
                    if not isinstance(n, dict):
                        continue
                    notif_id = n.get('id') or f"notif-{now_ts}-{idx}-{uuid.uuid4().hex[:4]}"
                    notif = {
                        'id': notif_id,
                        'userId': n.get('userId'),
                        'type': n.get('type', 'general'),
                        'title': n.get('title', ''),
                        'message': n.get('message', ''),
                        'link': n.get('link', ''),
                        'read': bool(n.get('read', False)),
                        'metadata': n.get('metadata', {}),
                        'createdAt': n.get('createdAt') or now_iso
                    }
                    notifs.insert(0, notif)
                    added_notifs.append(notif)

                # Keep max 1000 notifications in storage
                data['notifications'] = notifs[:1000]
                save_backend_data(data)

                # Sync bulk to Firebase RTDB in one request
                if added_notifs:
                    firebase_payload = {n['id']: n for n in added_notifs}
                    sync_to_firebase('notifications', firebase_payload, method='PATCH')

                self.send_json(200, {'success': True, 'count': len(added_notifs)})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Bulk notification error: {str(e)}', 'code': 500})
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
        # Admin Student Password Reset
        if path == '/api/admin/users/reset-password':
            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'success': False, 'error': 'Forbidden: Administrator privileges required.', 'code': 403})
                return
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}

                target_user_id = str(req_data.get('userId') or req_data.get('studentId') or '').strip()
                new_password = str(req_data.get('newPassword') or req_data.get('password') or '').strip()

                if not target_user_id:
                    self.send_json(400, {'success': False, 'error': 'Missing student ID.'})
                    return
                if not new_password or len(new_password) < 6:
                    self.send_json(400, {'success': False, 'error': 'New password must be at least 6 characters.'})
                    return

                data = load_backend_data(refresh_collections=['users'])
                users_dict = data.get('users', {})
                target_student = None

                for u in users_dict.values():
                    if (u.get('id') == target_user_id or 
                        (u.get('email') or '').lower() == target_user_id.lower() or 
                        (u.get('username') or '').lower() == target_user_id.lower()):
                        target_student = u
                        break

                if not target_student:
                    self.send_json(404, {'success': False, 'error': f'Student with ID "{target_user_id}" not found.'})
                    return

                # Hash new password
                hashed = hash_password(new_password)
                target_student['password'] = hashed

                # Invalidate existing token
                old_token = target_student.get('token')
                if old_token:
                    REVOKED_TOKENS.add(old_token)
                    revoked_list = data.setdefault('revoked_tokens', [])
                    if old_token not in revoked_list:
                        revoked_list.append(old_token)

                new_token = f"token_student_{uuid.uuid4().hex[:16]}"
                target_student['token'] = new_token

                # Admin audit log
                now_iso = datetime.now(timezone.utc).isoformat()
                audit_entry = {
                    'id': f"log_{uuid.uuid4().hex[:12]}",
                    'action': 'ADMIN_RESET_PASSWORD',
                    'adminId': user.get('id', 'admin'),
                    'adminEmail': user.get('email', 'admin'),
                    'targetUserId': target_student.get('id'),
                    'targetUserEmail': target_student.get('email'),
                    'targetUserName': target_student.get('name'),
                    'timestamp': now_iso
                }
                logs = data.setdefault('admin_audit_logs', [])
                if isinstance(logs, list):
                    logs.insert(0, audit_entry)
                elif isinstance(logs, dict):
                    logs[audit_entry['id']] = audit_entry

                save_backend_data(data)

                # Sync to Firebase RTDB synchronously
                sync_to_firebase(f"users/{target_student.get('id')}", {
                    'password': hashed,
                    'token': new_token
                }, method='PATCH', sync=True)
                sync_to_firebase(f"admin_audit_logs/{audit_entry['id']}", audit_entry, method='PUT', sync=True)

                print(f"[ADMIN_RESET_PASSWORD] Password reset for {target_student.get('email')} ({target_student.get('id')}) by {user.get('email')}", flush=True)

                self.send_json(200, {
                    'success': True,
                    'message': f'Password updated successfully for {target_student.get("name")}.',
                    'studentId': target_student.get('id'),
                    'token': new_token
                })
                return
            except Exception as e:
                self.send_json(500, {'success': False, 'error': f'Reset password failed: {str(e)}'})
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
        # Dedicated Admin Student/User Provisioning Endpoint
        if path in ('/api/admin/users', '/api/admin/users/'):
            try:
                token = self.get_auth_token()
                admin_user = authenticate_token(token)
                if not admin_user or admin_user.get('role') != 'admin':
                    self.send_json(403, {'success': False, 'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                    return

                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                post_data = json.loads(body.decode('utf-8')) if body else {}

                raw_email = str(post_data.get('email') or '').strip().lower()
                raw_uname = str(post_data.get('username') or '').strip().lower().lstrip('@').lstrip('@')
                raw_pass = str(post_data.get('password') or '').strip()
                raw_name = str(post_data.get('name') or '').strip()
                raw_role = str(post_data.get('role') or 'student').strip().lower()
                ca_level = str(post_data.get('caLevel') or 'CA FOUNDATION').strip()
                phone = str(post_data.get('phone') or '').strip()
                reg_no = str(post_data.get('registrationNo') or '').strip()

                if not raw_email or not raw_pass:
                    self.send_json(400, {'success': False, 'error': 'Email and password are required.'})
                    return

                data = load_backend_data()
                users_dict = data.get('users', {})

                # Check email & username uniqueness
                for u in users_dict.values():
                    if (u.get('email') or '').lower() == raw_email:
                        self.send_json(409, {'success': False, 'error': 'A user with this email already exists.'})
                        return
                    if raw_uname and (u.get('username') or '').lower().lstrip('@') == raw_uname:
                        self.send_json(409, {'success': False, 'error': f'Username "@{raw_uname}" is already taken.'})
                        return

                user_id = post_data.get('id') or f"usr-{raw_role}-{int(datetime.now().timestamp() * 1000)}"
                new_token = f"token_{raw_role}_{uuid.uuid4().hex[:16]}"
                hashed_pass = hash_password(raw_pass)

                new_user = {
                    'id': user_id,
                    'name': raw_name or raw_uname or 'Student',
                    'username': raw_uname or raw_email.split('@')[0],
                    'email': raw_email,
                    'phone': phone,
                    'caLevel': ca_level,
                    'registrationNo': reg_no,
                    'password': hashed_pass,
                    'role': raw_role,
                    'token': new_token,
                    'isActive': True,
                    'totalXp': 0,
                    'baseXp': 0,
                    'referralPoints': 0,
                    'referralCount': 0,
                    'createdAt': datetime.now(timezone.utc).isoformat()
                }

                # Clear any prior revocation tombstones for explicitly provisioned user
                for rev_id in [user_id.lower(), raw_email, raw_uname]:
                    if rev_id:
                        REVOKED_USERS.discard(rev_id)
                if 'revoked_users' in data:
                    data['revoked_users'] = [x for x in data['revoked_users'] if str(x).lower().strip() not in [user_id.lower(), raw_email, raw_uname]]

                users_dict[raw_email] = new_user
                data['users'] = users_dict
                save_backend_data(data)

                sanitized = dict(new_user)
                sanitized.pop('password', None)
                sync_to_firebase(f"users/{user_id}", sanitized, method='PUT')

                self.send_json(200, {
                    'success': True,
                    'message': f'{raw_role.title()} provisioned successfully.',
                    'user': sanitized,
                    'token': new_token
                })
                return
            except Exception as e:
                self.send_json(400, {'success': False, 'error': f'Invalid user provisioning payload: {str(e)}'})
                return

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
                student_id = req_data.get('userId') or req_data.get('studentId') or req_data.get('id')
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

                # Invalidate all active session tokens immediately
                st_id = target_student.get('id')
                st_token = target_student.get('token')
                st_email = (target_student.get('email') or '').lower()
                st_uname = (target_student.get('username') or '').lower().lstrip('@')

                if st_token:
                    REVOKED_TOKENS.add(str(st_token).strip())
                if st_id:
                    REVOKED_USERS.add(str(st_id).strip().lower())
                if st_email:
                    REVOKED_USERS.add(st_email)
                if st_uname:
                    REVOKED_USERS.add(st_uname)

                if 'revoked_tokens' not in data:
                    data['revoked_tokens'] = []
                if 'revoked_users' not in data:
                    data['revoked_users'] = []
                if st_token and st_token not in data['revoked_tokens']:
                    data['revoked_tokens'].append(str(st_token).strip())
                if st_id and st_id.lower() not in data['revoked_users']:
                    data['revoked_users'].append(str(st_id).strip().lower())
                if st_email and st_email not in data['revoked_users']:
                    data['revoked_users'].append(st_email)
                if st_uname and st_uname not in data['revoked_users']:
                    data['revoked_users'].append(st_uname)

                # Permanently remove student
                del users[target_key]

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

                # Delete from Firebase Realtime Database synchronously
                if st_id:
                    sync_to_firebase(f"users/{st_id}", {'isDeleted': True, 'isActive': False}, method='PATCH', sync=True)
                    sync_to_firebase(f"users/{st_id}", None, method='DELETE', sync=True)
                    sync_to_firebase(f"revoked_users/{st_id}", True, sync=True)

                # Calculate remaining counts directly from fresh database state
                revoked_set = set(str(x).lower().strip() for x in data.get('revoked_users', []))
                active_users = [
                    u for u in users.values() 
                    if isinstance(u, dict) and 
                    str(u.get('id') or '').lower().strip() not in revoked_set and 
                    str(u.get('email') or '').lower().strip() not in revoked_set and 
                    str(u.get('username') or '').lower().lstrip('@').strip() not in revoked_set and 
                    not u.get('isDeleted', False)
                ]
                remaining_students = [u for u in active_users if u.get('role') == 'student']

                self.send_json(200, {
                    'success': True,
                    'message': f"Student account for {target_student.get('name')} (@{target_student.get('username')}) permanently deleted.",
                    'deletedId': st_id,
                    'totalRemaining': len(active_users),
                    'studentsRemaining': len(remaining_students)
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
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                paper_data = json.loads(body.decode('utf-8')) if body else {}
            except Exception as e:
                self.send_json(400, {'error': f'Invalid payload: {str(e)}', 'code': 400})
                return

            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Admin only.', 'code': 403})
                return

            try:
                # Normalize allowedPlans
                raw_plans = paper_data.get('allowedPlans')
                if isinstance(raw_plans, list):
                    paper_data['allowedPlans'] = [str(p).strip().lower() for p in raw_plans if str(p).strip().lower() in ['free', 'trial', 'core', 'plus', 'elite', 'all']]
                elif isinstance(raw_plans, str):
                    paper_data['allowedPlans'] = [str(p).strip().lower() for p in raw_plans.split(',') if str(p).strip().lower() in ['free', 'trial', 'core', 'plus', 'elite', 'all']]

                # Normalize requiredTier
                tier = str(paper_data.get('requiredTier', 'free')).lower().strip()
                if tier not in ['free', 'trial', 'core', 'plus', 'elite']:
                    tier = 'free'
                paper_data['requiredTier'] = tier

                # Normalize untimed / duration
                is_untimed = bool(paper_data.get('isUntimed') or not paper_data.get('hasTimeLimit', True) or int(paper_data.get('durationMinutes', 180) or 0) == 0)
                paper_data['isUntimed'] = is_untimed
                paper_data['hasTimeLimit'] = not is_untimed
                if is_untimed:
                    paper_data['durationMinutes'] = 0
                else:
                    try:
                        paper_data['durationMinutes'] = int(paper_data.get('durationMinutes') or 180)
                    except (ValueError, TypeError):
                        paper_data['durationMinutes'] = 180

                data = load_backend_data(refresh_collections=['papers', 'assignments'])
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

                # Synchronize data['assignments'] to match data['papers']
                assignments = data.get('assignments', [])
                asg_idx = next((i for i, a in enumerate(assignments) if a.get('id') == paper_data['id']), None)
                if asg_idx is not None:
                    assignments[asg_idx].update(paper_data)
                else:
                    assignments.insert(0, paper_data)
                data['assignments'] = assignments

                save_backend_data(data)
                sync_to_firebase(f"papers/{paper_data['id']}", paper_data, method='PUT')
                sync_to_firebase(f"assignments/{paper_data['id']}", paper_data, method='PUT')
                self.send_json(200, {'success': True, 'paper': paper_data})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Failed to save paper: {str(e)}', 'code': 500})
                return

        # 3a. Descriptive Paper Deletion
        if path == '/api/papers/delete':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                req_data = json.loads(body.decode('utf-8')) if body else {}
            except Exception as e:
                self.send_json(400, {'error': f'Invalid payload: {str(e)}', 'code': 400})
                return

            token = self.get_auth_token()
            user = authenticate_token(token)
            if not user or user.get('role') != 'admin':
                self.send_json(403, {'error': 'Forbidden: Administrator authentication required.', 'code': 403})
                return

            try:
                target_id = req_data.get('id')
                if not target_id:
                    self.send_json(400, {'error': 'Paper ID is required.', 'code': 400})
                    return

                # Hard protection for core test papers
                PROTECTED_TITLES = [
                    'Indian Regulatory Framework – Descriptive Practice Test 1',
                    'Indian Regulatory Framework – Descriptive Practice Test 2',
                    'Indian Regulatory Framework - Descriptive Practice Test 1',
                    'Indian Regulatory Framework - Descriptive Practice Test 2'
                ]
                PROTECTED_IDS = ['asg-1789408695574', 'asg-1789409044746']

                data = load_backend_data(refresh_collections=['papers', 'assignments'])
                target_paper = next((p for p in data.get('papers', []) if p.get('id') == target_id), None)
                if not target_paper:
                    target_paper = next((p for p in data.get('assignments', []) if p.get('id') == target_id), None)

                if target_id in PROTECTED_IDS or (target_paper and target_paper.get('title') in PROTECTED_TITLES):
                    self.send_json(403, {'error': 'Forbidden: This core practice test paper is protected and cannot be deleted.', 'code': 403})
                    return

                data['papers'] = [p for p in data.get('papers', []) if p.get('id') != target_id]
                data['assignments'] = [p for p in data.get('assignments', []) if p.get('id') != target_id]
                data['submissions'] = [s for s in data.get('submissions', []) if s.get('assignmentId') != target_id and s.get('paperId') != target_id]
                save_backend_data(data)
                sync_to_firebase(f"papers/{target_id}", None, method='DELETE')
                sync_to_firebase(f"assignments/{target_id}", None, method='DELETE')
                self.send_json(200, {'success': True, 'deletedId': target_id})
                return
            except Exception as e:
                self.send_json(500, {'error': f'Failed to delete paper: {str(e)}', 'code': 500})
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
                    # Tier access check (supports allowedPlans and requiredTier)
                    target_paper = next((p for p in data.get('papers', []) if p.get('id') == paper_id), None)
                    if target_paper:
                        user_tier = get_user_tier(user.get('id'), data)
                        if not check_test_eligibility(user_tier, target_paper):
                            req_tier = str(target_paper.get('requiredTier', 'free')).capitalize()
                            self.send_json(403, {'error': f'Forbidden: This test paper requires an active {req_tier} Pass or eligible subscription plan.', 'code': 403})
                            return

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

                data = load_backend_data(refresh_collections=['tests', 'questions'])
                raw_tests = data.get('tests', [])
                seen_test_ids = set()
                deduped_tests = []
                for t in raw_tests:
                    tid = t.get('id')
                    if tid and tid not in seen_test_ids:
                        seen_test_ids.add(tid)
                        deduped_tests.append(t)
                    elif not tid:
                        deduped_tests.append(t)
                data['tests'] = deduped_tests
                tests = deduped_tests
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

                now_utc = datetime.now(timezone.utc)
                now_iso = now_utc.isoformat()

                # Idempotency check: if an identical test was created within the last 10 seconds, reuse it
                recent_duplicate = None
                is_new_submission = not any(t.get('id') == test_id for t in tests)
                if is_new_submission:
                    for t in tests:
                        if (t.get('title') == test_data.get('title') and
                            (t.get('subjectId') == test_data.get('subjectId') or t.get('subject') == test_data.get('subject')) and
                            (t.get('topic') == test_data.get('topic') or t.get('chapter') == test_data.get('chapter')) and
                            t.get('durationMinutes') == test_data.get('durationMinutes')):
                            created_str = t.get('createdAt') or t.get('updatedAt')
                            if created_str:
                                try:
                                    c_dt = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                                    if (now_utc - c_dt).total_seconds() < 10:
                                        recent_duplicate = t
                                        break
                                except Exception:
                                    pass

                if recent_duplicate:
                    test_data = recent_duplicate
                elif test_id:
                    # Maintain question count and preserve admin-configured maximumMarks
                    test_qs = [q for q in data.get('questions', []) if q.get('testId') == test_id]
                    test_data['totalQuestions'] = len(test_qs)
                    test_data['updatedAt'] = now_iso
                    idx = next((i for i, t in enumerate(tests) if t.get('id') == test_id), None)
                    if idx is not None:
                        if 'maximumMarks' in test_data and test_data['maximumMarks'] is not None:
                            test_data['maximumMarks'] = float(test_data['maximumMarks'])
                        else:
                            test_data['maximumMarks'] = float(tests[idx].get('maximumMarks', 10.0))
                        tests[idx].update(test_data)
                        test_data = tests[idx]
                    else:
                        test_data['maximumMarks'] = float(test_data.get('maximumMarks', 10.0))
                        if not test_data.get('createdAt'):
                            test_data['createdAt'] = now_iso
                        tests.insert(0, test_data)
                else:
                    test_data['id'] = f'tst-{int(now_utc.timestamp() * 1000)}'
                    test_data['createdAt'] = now_iso
                    test_data['updatedAt'] = now_iso
                    test_data['totalQuestions'] = 0
                    test_data['attemptsCount'] = 0
                    test_data['maximumMarks'] = float(test_data.get('maximumMarks', 10.0))
                    tests.insert(0, test_data)

                data['tests'] = tests
                save_backend_data(data)
                sync_to_firebase(f"tests/{test_data['id']}", test_data, method='PUT', sync=True)
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

                data = load_backend_data(refresh_collections=['tests', 'questions'])
                tests = data.get('tests', [])
                target = next((t for t in tests if t.get('id') == test_id), None)
                if not target:
                    self.send_json(404, {'error': 'Test not found', 'code': 404})
                    return

                target['status'] = new_status
                target['isPublished'] = (new_status in ['Published', 'Live'])
                target['updatedAt'] = datetime.now(timezone.utc).isoformat()
                if req_data.get('scheduledPublishTime'):
                    target['scheduledPublishTime'] = req_data.get('scheduledPublishTime')
                if req_data.get('liveStartTime'):
                    target['liveStartTime'] = req_data.get('liveStartTime')
                if req_data.get('liveEndTime'):
                    target['liveEndTime'] = req_data.get('liveEndTime')

                save_backend_data(data)
                sync_to_firebase(f"tests/{target['id']}", target, method='PUT', sync=True)
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

                data = load_backend_data(refresh_collections=['tests', 'questions'])
                data['tests'] = [t for t in data.get('tests', []) if t.get('id') != target_id]
                deleted_qs = [q for q in data.get('questions', []) if q.get('testId') == target_id]
                data['questions'] = [q for q in data.get('questions', []) if q.get('testId') != target_id]
                save_backend_data(data)
                sync_to_firebase(f"tests/{target_id}", None, method='DELETE')
                for dq in deleted_qs:
                    sync_to_firebase(f"questions/{dq['id']}", None, method='DELETE')
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

                data = load_backend_data(refresh_collections=['tests', 'questions'])
                questions = data.get('questions', [])
                tests = data.get('tests', [])

                if action == 'duplicate':
                    q_id = req_data.get('questionId')
                    orig = next((q for q in questions if q.get('id') == q_id), None)
                    if not orig:
                        self.send_json(404, {'error': 'Original question not found', 'code': 404})
                        return
                    dup = dict(orig)
                    now_iso = datetime.now(timezone.utc).isoformat()
                    dup['id'] = f'q-{int(datetime.now().timestamp() * 1000)}'
                    test_qs = [q for q in questions if q.get('testId') == orig.get('testId')]
                    dup['number'] = len(test_qs) + 1
                    dup['text'] = f"{orig.get('text')} (Copy)"
                    dup['createdAt'] = now_iso
                    dup['updatedAt'] = now_iso
                    questions.append(dup)

                    # Update totalQuestions (preserve admin-configured maximumMarks)
                    dup_test = None
                    for t in tests:
                        if t.get('id') == orig.get('testId'):
                            t_qs = [q for q in questions if q.get('testId') == t.get('id')]
                            t['totalQuestions'] = len(t_qs)
                            t['updatedAt'] = now_iso
                            dup_test = t

                    save_backend_data(data)
                    sync_to_firebase(f"questions/{dup['id']}", dup, method='PUT', sync=True)
                    if dup_test:
                        sync_to_firebase(f"tests/{dup_test['id']}", dup_test, method='PUT', sync=True)
                    self.send_json(200, {'success': True, 'question': dup})
                    return

                elif action == 'reorder':
                    test_id = req_data.get('testId')
                    order_ids = req_data.get('questionIds', [])
                    for idx, qid in enumerate(order_ids):
                        for q in questions:
                            if q.get('id') == qid:
                                q['number'] = idx + 1
                                sync_to_firebase(f"questions/{q['id']}", q, method='PUT', sync=True)
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

                    # Deduplicate questions in memory by ID to prevent duplicate records
                    seen_q_ids = set()
                    deduped_questions = []
                    for q in questions:
                        qid = q.get('id')
                        if qid and qid not in seen_q_ids:
                            seen_q_ids.add(qid)
                            deduped_questions.append(q)
                        elif not qid:
                            deduped_questions.append(q)
                    data['questions'] = deduped_questions
                    questions = deduped_questions

                    # Normalize requiredTier
                    tier = str(req_data.get('requiredTier', 'free')).lower().strip()
                    if tier not in ['free', 'core', 'plus', 'elite']:
                        tier = 'free'
                    req_data['requiredTier'] = tier
                    now_iso = datetime.now(timezone.utc).isoformat()
                    if 'marks' in req_data:
                        try:
                            req_data['marks'] = float(req_data['marks'])
                        except (ValueError, TypeError):
                            req_data['marks'] = 2.0
                    if 'xp' in req_data or 'points' in req_data:
                        try:
                            raw_xp = req_data.get('xp', req_data.get('points', 10))
                            xp_val = int(float(raw_xp))
                            req_data['xp'] = xp_val
                            req_data['points'] = xp_val
                        except (ValueError, TypeError):
                            req_data['xp'] = 10
                            req_data['points'] = 10

                    if q_id:
                        idx = next((i for i, q in enumerate(questions) if q.get('id') == q_id), None)
                        if idx is not None:
                            questions[idx].update(req_data)
                            target_q = questions[idx]
                        else:
                            questions.append(req_data)
                            target_q = req_data
                    else:
                        # Idempotency check: check if an identical question was created for this test in the last 10 seconds
                        recent_duplicate = None
                        for q in reversed(questions):
                            if (q.get('testId') == test_id and
                                q.get('text') == req_data.get('text') and
                                q.get('correctOption') == req_data.get('correctOption') and
                                q.get('optionA') == req_data.get('optionA') and
                                q.get('optionB') == req_data.get('optionB')):
                                created_str = q.get('createdAt') or q.get('updatedAt')
                                if created_str:
                                    try:
                                        created_dt = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                                        if (datetime.now(timezone.utc) - created_dt).total_seconds() < 10:
                                            recent_duplicate = q
                                            break
                                    except Exception:
                                        pass
                        if recent_duplicate:
                            target_q = recent_duplicate
                        else:
                            req_data['id'] = f'q-{int(datetime.now().timestamp() * 1000)}'
                            req_data['createdAt'] = now_iso
                            test_qs = [q for q in questions if q.get('testId') == test_id]
                            req_data['number'] = len(test_qs) + 1
                            questions.append(req_data)
                            target_q = req_data

                    # Maintain question count, strictly preserve admin-configured maximumMarks
                    test_questions = [q for q in questions if q.get('testId') == test_id]
                    for t in tests:
                        if t.get('id') == test_id:
                            t['totalQuestions'] = len(test_questions)
                            t['updatedAt'] = now_iso
                    save_backend_data(data)
                    # Sync question and updated test to Firebase RTDB (prevents data loss on Vercel cold start)
                    sync_to_firebase(f"questions/{target_q['id']}", target_q, method='PUT', sync=True)
                    if test_id:
                        updated_test = next((t for t in tests if t.get('id') == test_id), None)
                        if updated_test:
                            sync_to_firebase(f"tests/{test_id}", updated_test, method='PUT', sync=True)
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
                if not q_id:
                    self.send_json(400, {'error': 'Missing question id for deletion', 'code': 400})
                    return

                data = load_backend_data(refresh_collections=['tests', 'questions'])
                orig = next((q for q in data.get('questions', []) if q.get('id') == q_id), None)
                if orig:
                    test_id = orig.get('testId')
                    data['questions'] = [q for q in data.get('questions', []) if q.get('id') != q_id]
                    # Renumber remaining
                    rem = [q for q in data.get('questions', []) if q.get('testId') == test_id]
                    rem.sort(key=lambda x: x.get('number', 0))
                    for i, q in enumerate(rem):
                        q['number'] = i + 1
                    updated_test_ref = None
                    now_iso = datetime.now(timezone.utc).isoformat()
                    for t in data.get('tests', []):
                        if t.get('id') == test_id:
                            t['totalQuestions'] = len(rem)
                            t['updatedAt'] = now_iso
                            updated_test_ref = t
                    save_backend_data(data)
                    # Sync deletion and test update to Firebase RTDB
                    sync_to_firebase(f"questions/{q_id}", None, method='DELETE', sync=True)
                    if updated_test_ref:
                        sync_to_firebase(f"tests/{test_id}", updated_test_ref, method='PUT', sync=True)
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

                data = load_backend_data(refresh_collections=['tests', 'questions'])
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

                # Update target test question count (strictly preserve admin-configured maximumMarks)
                all_test_qs = [q for q in data['questions'] if q.get('testId') == test_id]
                target_test['totalQuestions'] = len(all_test_qs)
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
                if target:
                    user_tier = get_user_tier(user.get('id'), data)
                    if not check_test_eligibility(user_tier, target):
                        self.send_json(403, {
                            'error': 'Access Denied: You do not have an eligible subscription pass to attempt this test.',
                            'code': 403,
                            'isLocked': True,
                            'allowedPlans': target.get('allowedPlans') or [target.get('requiredTier') or 'core']
                        })
                        return
                    entitlements = subscription_manager.get_user_entitlements(user['id'], data, sync_to_firebase)
                    if target.get('isPremium') and not entitlements['permissions'].get('premium_mcq_access'):
                        self.send_json(403, {
                            'error': 'Access Denied: This is a premium test requiring an active Core, Plus, or Elite Pass.',
                            'code': 403,
                            'isPremiumLocked': True
                        })
                        return
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

                data = load_backend_data(refresh_collections=['tests', 'questions', 'users'])
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
                    pos = float(test.get('marksPerCorrect', 2.0))
                    neg = float(test.get('negativeMarksPerWrong', 0.5))
                    earned_preview_points = 0
                    gross = 0.0
                    penalty = 0.0

                    for q in questions:
                        chosen = answers.get(q.get('id'))
                        q_pos = float(q.get('marks', pos))
                        q_neg = float(q.get('negativeMarks', neg))
                        q_xp = float(q.get('xp', q.get('points', test.get('pointsPerCorrect', 10))))

                        if not chosen:
                            unattempted_count += 1
                        elif chosen == q.get('correctOption'):
                            correct_count += 1
                            gross += q_pos
                            earned_preview_points += q_xp
                        else:
                            wrong_count += 1
                            penalty += q_neg

                    score = max(0.0, gross - penalty)
                    max_marks = float(test.get('maximumMarks')) if test.get('maximumMarks') is not None else float(sum(float(q.get('marks', pos)) for q in questions) if questions else 10.0)
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
                            'earnedPoints': int(earned_preview_points),
                            'maximumMarks': max_marks,
                            'percentage': pct,
                            'timeTakenSeconds': time_taken,
                            'answers': answers,
                            'questions': questions
                        }
                    })
                    return

                # Normal student submission: enforce eligibility and attempt limits
                user_tier = get_user_tier(user.get('id'), data)
                if not check_test_eligibility(user_tier, test):
                    self.send_json(403, {
                        'error': 'Access Denied: You do not have an eligible subscription pass to attempt this test.',
                        'code': 403,
                        'isLocked': True
                    })
                    return

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

                user_tier = get_user_tier(user.get('id'), data)
                gross = 0.0
                penalty = 0.0
                earned_points = 0.0
                pos_default = float(test.get('marksPerCorrect', 2.0))
                neg_default = float(test.get('negativeMarksPerWrong', 0.5))
                xp_default = float(test.get('pointsPerCorrect', 10))

                for q in questions:
                    req_tier = str(q.get('requiredTier', 'free')).lower()
                    if not check_tier_access(user_tier, req_tier):
                        unattempted_count += 1
                        continue

                    q_pos = float(q.get('marks', pos_default))
                    q_neg = float(q.get('negativeMarks', neg_default))
                    q_xp = float(q.get('xp', q.get('points', xp_default)))

                    chosen = answers.get(q.get('id'))
                    if not chosen:
                        unattempted_count += 1
                    elif chosen == q.get('correctOption'):
                        correct_count += 1
                        gross += q_pos
                        earned_points += q_xp
                    else:
                        wrong_count += 1
                        penalty += q_neg

                # Dynamic marking and platform points scheme
                earned_points = int(earned_points)
                score = max(0.0, gross - penalty)
                max_marks = float(test.get('maximumMarks')) if test.get('maximumMarks') is not None else (sum(float(q.get('marks', pos_default)) for q in questions) if questions else 10.0)
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
                    if isinstance(notifs, dict):
                        notifs = list(notifs.values())
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

                if isinstance(attempts, dict):
                    attempts = list(attempts.values())
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
    retries = 10
    httpd = None
    for attempt in range(retries):
        try:
            httpd = socketserver.ThreadingTCPServer(('127.0.0.1', port), ExcellenceCAHandler)
            break
        except OSError as e:
            if attempt < retries - 1:
                time.sleep(1)
            else:
                raise e
    with httpd:
        print(f'==================================================')
        print(f' ExcellenceCA Secure Server running at:')
        print(f' http://localhost:{port}')
        print(f' Private Storage: {PRIVATE_STORAGE_DIR}')
        print(f'==================================================')
        # Start scheduled background XP reset worker
        worker_thread = threading.Thread(target=xp_reset_background_worker, daemon=True)
        worker_thread.start()
        sub_worker_thread = threading.Thread(target=subscription_background_worker, daemon=True)
        sub_worker_thread.start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down server.')
            httpd.server_close()

if __name__ == '__main__':
    run_server()
