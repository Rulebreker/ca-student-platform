#!/usr/bin/env python3
"""
scripts/migrate_qr_codes.py - One-time migration for legacy /api/images/ QR code URLs.
Migrates payment_channels in both backend_data.json and Firebase RTDB:
- If qrCodeUrl points to /api/images/<filename> and the file exists locally or in /tmp,
  converts it to a base64 data URI and sets needsReupload = False.
- If the image file is lost (e.g. wiped from ephemeral /tmp on serverless),
  flags the channel with needsReupload = True so admin is prompted to re-upload.
"""

import os
import sys
import json
import base64
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_STORE_FILE = os.path.join(BASE_DIR, 'backend_data.json')
FIREBASE_RTDB_URL = "https://excellenceca-45a9d-default-rtdb.firebaseio.com"

POSSIBLE_IMAGE_DIRS = [
    os.path.join(BASE_DIR, 'private_storage', 'images'),
    '/tmp/private_storage/images',
    os.path.join('/tmp', 'private_storage', 'images'),
]

def detect_mime(binary_data):
    if binary_data.startswith(b'\x89PNG'):
        return 'image/png'
    elif binary_data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    elif binary_data.startswith(b'RIFF') and b'WEBP' in binary_data[:16]:
        return 'image/webp'
    return 'image/png'

def find_image_file(filename):
    for d in POSSIBLE_IMAGE_DIRS:
        p = os.path.join(d, filename)
        if os.path.exists(p) and os.path.isfile(p):
            return p
    return None

def sync_channel_to_firebase(channel_id, channel_data):
    try:
        url = f"{FIREBASE_RTDB_URL}/payment_channels/{channel_id}.json"
        body = json.dumps(channel_data).encode('utf-8')
        req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='PUT')
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"[ERROR] Failed to sync channel {channel_id} to Firebase: {e}")
        return False

def run_migration():
    print("=== EXCELLENCECA QR CODE STORAGE MIGRATION ===")
    
    # 1. Load local backend data
    local_data = {}
    if os.path.exists(DATA_STORE_FILE):
        with open(DATA_STORE_FILE, 'r', encoding='utf-8') as f:
            local_data = json.load(f)
    
    local_channels = local_data.get('payment_channels', [])

    # 2. Fetch Firebase RTDB payment channels
    fb_channels = {}
    try:
        req = urllib.request.Request(f"{FIREBASE_RTDB_URL}/payment_channels.json")
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if isinstance(data, dict):
                fb_channels = data
            elif isinstance(data, list):
                fb_channels = {c.get('id'): c for c in data if isinstance(c, dict) and c.get('id')}
        print(f"[INFO] Fetched {len(fb_channels)} channels from Firebase RTDB.")
    except Exception as e:
        print(f"[WARN] Could not fetch Firebase channels: {e}")

    # Combine channel IDs
    all_channel_ids = set()
    for c in local_channels:
        if c.get('id'):
            all_channel_ids.add(c['id'])
    for cid in fb_channels:
        all_channel_ids.add(cid)

    modified_channels = []
    
    for cid in all_channel_ids:
        # Prefer Firebase copy if available, fallback to local
        c = fb_channels.get(cid) or next((x for x in local_channels if x.get('id') == cid), {})
        qr_url = c.get('qrCodeUrl', '')
        
        print(f"\nEvaluating Channel: {c.get('title') or cid}")
        print(f"  Current qrCodeUrl: {qr_url[:60]}..." if len(qr_url) > 60 else f"  Current qrCodeUrl: {qr_url}")
        
        changed = False

        if qr_url.startswith('data:image/'):
            print("  Status: Already in data URI format. OK.")
            if c.get('needsReupload'):
                c['needsReupload'] = False
                changed = True
        elif qr_url.startswith('http://') or qr_url.startswith('https://'):
            print("  Status: Uses external / dynamic URL. OK.")
            if c.get('needsReupload'):
                c['needsReupload'] = False
                changed = True
        elif qr_url.startswith('/api/images/'):
            filename = os.path.basename(qr_url.replace('/api/images/', '').split('?')[0])
            found_path = find_image_file(filename)
            if found_path:
                print(f"  Status: Found legacy file at {found_path} - converting to data URI...")
                with open(found_path, 'rb') as img_f:
                    img_bytes = img_f.read()
                mime = detect_mime(img_bytes)
                b64_str = base64.b64encode(img_bytes).decode('utf-8')
                c['qrCodeUrl'] = f"data:{mime};base64,{b64_str}"
                c['needsReupload'] = False
                changed = True
                print(f"  Converted successfully to {mime} data URI ({len(b64_str)} bytes b64).")
            else:
                print(f"  Status: [WARNING] Legacy file '{filename}' is NOT found on disk!")
                print("  Flagging channel with needsReupload = True.")
                c['needsReupload'] = True
                c['qrCodeUrlFallback'] = qr_url
                changed = True
        elif not qr_url:
            print("  Status: No custom QR code attached (uses dynamic fallback).")
            if c.get('needsReupload'):
                c['needsReupload'] = False
                changed = True

        if changed:
            modified_channels.append(c)
            # Sync to Firebase
            print(f"  Syncing channel {cid} to Firebase...")
            sync_channel_to_firebase(cid, c)

    # Update local backend_data.json
    if modified_channels and os.path.exists(DATA_STORE_FILE):
        ch_map = {c['id']: c for c in local_data.get('payment_channels', []) if c.get('id')}
        for c in modified_channels:
            if c.get('id'):
                ch_map[c['id']] = c
        local_data['payment_channels'] = list(ch_map.values())
        with open(DATA_STORE_FILE, 'w', encoding='utf-8') as f:
            json.dump(local_data, f, indent=2)
        print(f"\n[SUCCESS] Updated {len(modified_channels)} channel(s) in local backend_data.json.")
    else:
        print("\n[INFO] No channels required local updates.")

    print("=== MIGRATION COMPLETE ===")

if __name__ == '__main__':
    run_migration()
