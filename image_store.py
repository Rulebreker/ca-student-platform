"""
Persistent image storage (payment proofs, UPI channel QR codes, admin uploads).

Images are stored in the MongoDB collection `stored_images` (the production database), so an image
saved by one Vercel instance can be served by every other instance and survives cold starts and
deployments. The local disk (`private_storage/images`) is only a read cache - and the sole store in
local development without MongoDB. On serverless without MongoDB, saving fails (never pretends).

Image ids are server-generated ("<kind>_<random><ext>"); callers never pass file system paths.
"""
import os
import re
import threading
from datetime import datetime, timezone

import mongodb_manager

COLLECTION = 'stored_images'
IMAGE_URL_PREFIX = '/api/images/'
IMAGE_ID_RE = re.compile(r'^[A-Za-z0-9_-]{1,120}\.(png|jpg|jpeg|webp|gif)$')
CONTENT_TYPES = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp', 'gif': 'image/gif'}

IS_SERVERLESS = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))
_BASE = '/tmp' if IS_SERVERLESS else os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(_BASE, 'private_storage', 'images')
_lock = threading.Lock()


class StorageUnavailable(Exception):
    """No persistent image storage is reachable."""


def is_valid_image_id(image_id):
    return bool(image_id) and bool(IMAGE_ID_RE.match(str(image_id)))


def image_id_from_url(url):
    """'/api/images/qr_ab.png' -> 'qr_ab.png'; None for anything else (external URLs, data URIs)."""
    if not isinstance(url, str) or not url.startswith(IMAGE_URL_PREFIX):
        return None
    image_id = url[len(IMAGE_URL_PREFIX):].split('?', 1)[0]
    return image_id if is_valid_image_id(image_id) else None


def content_type_for(image_id):
    return CONTENT_TYPES.get(str(image_id).rsplit('.', 1)[-1].lower(), 'application/octet-stream')


def _db():
    try:
        if mongodb_manager.is_database_connected():
            return mongodb_manager.get_database()
    except Exception as e:
        print(f"[IMAGE_STORE] database unavailable ({type(e).__name__})", flush=True)
    return None


def _cache_path(image_id):
    return os.path.join(CACHE_DIR, image_id)   # image_id is validated: no separators, no '..'


def _write_cache(image_id, data):
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        tmp = _cache_path(image_id) + '.part'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, _cache_path(image_id))
        return True
    except OSError as e:
        print(f"[IMAGE_STORE] cache write failed for {image_id} ({type(e).__name__})", flush=True)
        return False


def save_image(image_id, data, kind, owner_user_id=None, related_id=None):
    """Persist an image. Returns only after it is durably stored; raises StorageUnavailable otherwise."""
    if not is_valid_image_id(image_id):
        raise ValueError('invalid image id')
    db = _db()
    if db is not None:
        try:
            db[COLLECTION].replace_one({'_id': image_id}, {
                '_id': image_id,
                'data': bytes(data),
                'contentType': content_type_for(image_id),
                'size': len(data),
                'kind': kind,
                'ownerUserId': owner_user_id,
                'relatedId': related_id,
                'createdAt': datetime.now(timezone.utc).isoformat(),
            }, upsert=True)
        except Exception as e:
            print(f"[IMAGE_STORE] save failed for {image_id} ({type(e).__name__})", flush=True)
            raise StorageUnavailable('image could not be stored')
        _write_cache(image_id, data)
        return True
    if IS_SERVERLESS:
        raise StorageUnavailable('persistent storage is not reachable')
    if not _write_cache(image_id, data):   # local development: the disk is the persistent store
        raise StorageUnavailable('image could not be written')
    return True


def load_image(image_id):
    """Image bytes, or None when the image does not exist (or storage is unreachable)."""
    if not is_valid_image_id(image_id):
        return None
    path = _cache_path(image_id)
    if os.path.isfile(path):
        try:
            with open(path, 'rb') as f:
                return f.read()
        except OSError:
            pass
    db = _db()
    if db is None:
        return None
    try:
        doc = db[COLLECTION].find_one({'_id': image_id})
    except Exception as e:
        print(f"[IMAGE_STORE] load failed for {image_id} ({type(e).__name__})", flush=True)
        return None
    if not doc or doc.get('data') is None:
        return None
    data = bytes(doc['data'])
    _write_cache(image_id, data)
    return data


def existing_image_ids(image_ids):
    """The subset of image_ids that are stored (one query, for list views)."""
    ids = {i for i in image_ids if is_valid_image_id(i)}
    if not ids:
        return set()
    found = {i for i in ids if os.path.isfile(_cache_path(i))}
    missing = list(ids - found)
    db = _db() if missing else None
    if db is not None:
        try:
            found |= {d['_id'] for d in db[COLLECTION].find({'_id': {'$in': missing}}, {'_id': 1})}
        except Exception as e:
            print(f"[IMAGE_STORE] existence check failed ({type(e).__name__})", flush=True)
            return found | set(missing)   # unknown: do not report images as missing
    elif missing and IS_SERVERLESS:
        return found | set(missing)
    return found


def delete_image(image_id):
    """Remove an image from storage and the local cache. True if nothing is left behind."""
    if not is_valid_image_id(image_id):
        return False
    ok = True
    db = _db()
    if db is not None:
        try:
            db[COLLECTION].delete_one({'_id': image_id})
        except Exception as e:
            print(f"[IMAGE_STORE] delete failed for {image_id} ({type(e).__name__})", flush=True)
            ok = False
    elif IS_SERVERLESS:
        ok = False
    try:
        os.remove(_cache_path(image_id))
    except FileNotFoundError:
        pass
    except OSError:
        ok = False
    return ok
