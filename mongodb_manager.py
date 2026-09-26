"""
mongodb_manager.py
==================
Centralized MongoDB Atlas Manager for ExcellenceCA.
Replaces slow legacy Firebase RTDB REST calls with fast native MongoDB driver,
maintaining a resilient local JSON fallback mirror (backend_data.json).

Features:
- Singleton connection pooling with auto-reconnect.
- Safe collection hydration and atomic upserts.
- Automatic thread-safe background sync or synchronous serverless execution.
- Graceful offline fallback to local JSON file when MongoDB is unreachable.
"""

import os
import sys
import time
import json
import threading
from typing import Dict, Any, List, Optional, Tuple, Union

try:
    import pymongo
    from pymongo import ReplaceOne, UpdateOne
    from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
    PYMONGO_AVAILABLE = True
except ImportError:
    PYMONGO_AVAILABLE = False
    pymongo = None

DEFAULT_MONGODB_URI = "mongodb+srv://excellenceca:70lxk6cl1htXrwX3@excellenceca.s0kos5c.mongodb.net/?appName=excellenceca"
MONGODB_URI = os.environ.get('MONGODB_URI', DEFAULT_MONGODB_URI)
DATABASE_NAME = os.environ.get('MONGODB_DB_NAME', 'excellenceca')

# Collections that are stored as dictionaries keyed by identifier in backend_data.json
DICT_COLLECTIONS = {'users', 'referral_settings', 'xp_reset_settings', 'ai_autopilot_config', 'ai_providers'}

_client_lock = threading.Lock()
_mongo_client: Optional[Any] = None
_last_ping_time = 0.0
_is_online = False

def get_mongo_client() -> Optional[Any]:
    """Retrieve or initialize the singleton PyMongo MongoClient."""
    global _mongo_client, _is_online
    if not PYMONGO_AVAILABLE:
        return None

    if _mongo_client is not None:
        return _mongo_client

    with _client_lock:
        if _mongo_client is not None:
            return _mongo_client
        try:
            client = pymongo.MongoClient(
                MONGODB_URI,
                serverSelectionTimeoutMS=10000,
                connectTimeoutMS=10000,
                socketTimeoutMS=15000,
                maxPoolSize=50,
                retryWrites=True
            )
            # Verify connectivity
            client.admin.command('ping')
            _mongo_client = client
            _is_online = True
            print(f"[MONGODB_INIT] Connected to MongoDB Atlas ({DATABASE_NAME}) successfully.", flush=True)
            return _mongo_client
        except Exception as e:
            print(f"[MONGODB_WARN] Failed to connect to MongoDB Atlas: {e}. Falling back to local store.", flush=True)
            _is_online = False
            return None

def get_database() -> Optional[Any]:
    """Get the active database instance, or None if offline."""
    client = get_mongo_client()
    if client is not None:
        try:
            return client[DATABASE_NAME]
        except Exception:
            return None
    return None

def is_database_connected(force_check: bool = False) -> bool:
    """Check if MongoDB Atlas is reachable."""
    global _last_ping_time, _is_online
    now = time.time()
    if not force_check and (now - _last_ping_time) < 15.0:
        return _is_online

    client = get_mongo_client()
    if client is None:
        _is_online = False
        _last_ping_time = now
        return False

    try:
        client.admin.command('ping')
        _is_online = True
    except Exception:
        _is_online = False

    _last_ping_time = now
    return _is_online

def sync_document_to_mongo(path: str, data: Any, method: str = 'PUT', sync: bool = False):
    """
    Synchronize an update to MongoDB Atlas.
    Matches the signature of legacy sync_to_firebase(path, data, method, sync).
    
    Path patterns:
      - 'questions/q-123' -> db.questions.replace_one({'_id': 'q-123'}, doc, upsert=True)
      - 'tests/tst-456' -> db.tests.replace_one({'_id': 'tst-456'}, doc, upsert=True)
      - 'ai_generation_jobs/job-789' -> db.ai_generation_jobs.replace_one({'_id': 'job-789'}, doc, upsert=True)
      - 'payment_channels' (list) -> db.payment_channels bulk upsert
    """
    def _execute():
        db = get_database()
        if db is None:
            return

        clean_path = path.strip('/')
        parts = clean_path.split('/', 1)
        collection_name = parts[0]
        doc_id = parts[1] if len(parts) > 1 else None

        coll = db[collection_name]

        try:
            if method == 'DELETE':
                if doc_id:
                    coll.delete_one({'_id': str(doc_id)})
                return

            if doc_id:
                # Single document upsert
                if isinstance(data, dict):
                    doc = dict(data)
                    doc['_id'] = str(doc_id)
                else:
                    doc = {'_id': str(doc_id), 'value': data}
                coll.replace_one({'_id': str(doc_id)}, doc, upsert=True)
            else:
                # Collection root update
                if isinstance(data, list):
                    ops = []
                    for idx, item in enumerate(data):
                        if isinstance(item, dict):
                            item_id = str(item.get('id') or f"{collection_name}_{idx}")
                            doc = dict(item)
                            doc['_id'] = item_id
                            ops.append(ReplaceOne({'_id': item_id}, doc, upsert=True))
                    if ops:
                        coll.bulk_write(ops, ordered=False)
                elif isinstance(data, dict):
                    ops = []
                    for k, v in data.items():
                        if isinstance(v, dict):
                            doc_id_val = str(v.get('id') or k)
                            doc = dict(v)
                            doc['_id'] = doc_id_val
                            ops.append(ReplaceOne({'_id': doc_id_val}, doc, upsert=True))
                        else:
                            doc = {'_id': str(k), 'value': v}
                            ops.append(ReplaceOne({'_id': str(k)}, doc, upsert=True))
                    if ops:
                        coll.bulk_write(ops, ordered=False)
        except Exception as e:
            # Non-blocking warning
            pass

    if sync:
        _execute()
    else:
        threading.Thread(target=_execute, daemon=True).start()

def load_collection_from_mongo(collection_name: str) -> Optional[Union[List[Any], Dict[str, Any]]]:
    """
    Load a collection from MongoDB Atlas, formatted to match backend_data.json.
    Returns None if MongoDB is unreachable or collection is empty.
    """
    db = get_database()
    if db is None:
        return None

    try:
        coll = db[collection_name]
        docs = list(coll.find({}))
        if not docs:
            return None

        is_dict_coll = collection_name in DICT_COLLECTIONS

        if is_dict_coll:
            result_dict = {}
            for d in docs:
                _id = d.pop('_id', None)
                if 'value' in d and len(d) == 1:
                    result_dict[str(_id)] = d['value']
                else:
                    # Key by email if available (for users), else id
                    key = d.get('email') or d.get('id') or _id
                    result_dict[str(key)] = d
            return result_dict
        else:
            result_list = []
            for d in docs:
                d.pop('_id', None)
                if 'value' in d and len(d) == 1:
                    result_list.append(d['value'])
                else:
                    result_list.append(d)
            return result_list
    except Exception as e:
        print(f"[MONGODB_LOAD_WARN] Failed to load {collection_name} from MongoDB: {e}", flush=True)
        return None

def hydrate_all_from_mongo(base_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Hydrate all dynamic collections from MongoDB into base_data dictionary.
    Falls back cleanly to base_data if MongoDB is unavailable.
    """
    db = get_database()
    if db is None:
        return base_data

    try:
        colls = db.list_collection_names()
        for c in colls:
            loaded = load_collection_from_mongo(c)
            if loaded is not None:
                base_data[c] = loaded
        print(f"[MONGODB_HYDRATION] Successfully hydrated {len(colls)} collections from MongoDB Atlas.", flush=True)
    except Exception as e:
        print(f"[MONGODB_HYDRATION_WARN] MongoDB hydration skipped: {e}", flush=True)

    return base_data
