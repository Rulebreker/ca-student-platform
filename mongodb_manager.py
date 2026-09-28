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

# Collection shapes as held in the application data dict. Everything not listed is a list of
# documents keyed by 'id'.
SINGLETON_COLLECTIONS = {'referral_settings', 'xp_reset_settings', 'ai_autopilot_config', 'ai_worker_status'}
KEYED_DICT_COLLECTIONS = {
    'users': 'email',                # dict keyed by email; Mongo _id = user id
    'subscriptions': 'userId',       # dict keyed by user id
    'subscription_plans': 'id',      # dict keyed by plan id
}
# Mongo docs {_id: value}. deleted_documents holds "<collection>:<id>" tombstones of deleted records.
STRING_LIST_COLLECTIONS = {'revoked_users', 'revoked_tokens', 'deleted_scheduled_tasks', 'deleted_documents'}
LIST_KEY_FIELDS = {'payment_sessions': 'paymentSessionId'}  # default key field is 'id'
# Kept for callers that still import it
DICT_COLLECTIONS = SINGLETON_COLLECTIONS | set(KEYED_DICT_COLLECTIONS) | {'ai_providers'}



_client_lock = threading.Lock()
_mongo_client: Optional[Any] = None
_last_ping_time = 0.0
_is_online = False
_last_connect_failure = 0.0
CONNECT_RETRY_BACKOFF_SECONDS = 30.0

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
        global _last_connect_failure
        if time.time() - _last_connect_failure < CONNECT_RETRY_BACKOFF_SECONDS:
            return None  # recently failed: don't block every request on a 10s timeout
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
            _last_connect_failure = time.time()
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

def list_key_field(collection_name: str) -> str:
    return LIST_KEY_FIELDS.get(collection_name, 'id')


def _mongo_id_for(collection_name: str, dict_key: Any, doc: Dict[str, Any]) -> str:
    """Mongo _id for a document written through a collection-root sync (matches existing data)."""
    if collection_name == 'subscriptions':
        return str(doc.get('userId') or dict_key)
    return str(doc.get('id') or dict_key)


def sync_document_to_mongo(path: str, data: Any, method: str = 'PUT', sync: bool = False) -> Optional[bool]:
    """
    Write an update to MongoDB Atlas. Signature matches the legacy sync_to_firebase(path, data, method, sync).

    Path patterns:
      - 'questions/q-123' PUT   -> replace_one({_id: 'q-123'}, doc, upsert)
      - 'users/usr-1' PATCH     -> update_one({_id: 'usr-1'}, {$set: fields}, upsert)   (partial update)
      - 'tests/tst-1' DELETE    -> delete_one({_id: 'tst-1'})
      - 'payment_sessions' (list) -> bulk upsert keyed by paymentSessionId (other lists by id)
      - 'revoked_users' (list of strings) -> bulk upsert {_id: value}
      - 'xp_reset_settings' (singleton dict) -> one document per field
    With sync=True the write runs inline and returns True/False; otherwise it runs in a background
    thread and returns None. Failures are logged, never raised.
    """
    def _execute() -> bool:
        db = get_database()
        if db is None:
            return False

        clean_path = path.strip('/')
        parts = clean_path.split('/', 1)
        collection_name = parts[0]
        doc_id = parts[1] if len(parts) > 1 else None
        coll = db[collection_name]

        try:
            if method == 'DELETE':
                if doc_id:
                    coll.delete_one({'_id': str(doc_id)})
                return True

            if doc_id:
                if method == 'PATCH' and isinstance(data, dict):
                    fields = {k: v for k, v in data.items() if k != '_id'}
                    if fields:
                        coll.update_one({'_id': str(doc_id)}, {'$set': fields}, upsert=True)
                    return True
                doc = dict(data) if isinstance(data, dict) else {'value': data}
                doc['_id'] = str(doc_id)
                coll.replace_one({'_id': str(doc_id)}, doc, upsert=True)
                return True

            # Collection root update
            ops = []
            if isinstance(data, list):
                key_field = list_key_field(collection_name)
                for item in data:
                    if isinstance(item, dict):
                        item_id = item.get(key_field) or item.get('id')
                        if not item_id:
                            print(f"[MONGODB_SYNC_WARN] {collection_name}: document without '{key_field}' skipped", flush=True)
                            continue
                        doc = dict(item)
                        doc['_id'] = str(item_id)
                        ops.append(ReplaceOne({'_id': str(item_id)}, doc, upsert=True))
                    elif isinstance(item, str) and item:
                        ops.append(ReplaceOne({'_id': item}, {'_id': item, 'value': True}, upsert=True))
            elif isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, dict):
                        doc_id_val = _mongo_id_for(collection_name, k, v)
                        doc = dict(v)
                        doc['_id'] = doc_id_val
                        ops.append(ReplaceOne({'_id': doc_id_val}, doc, upsert=True))
                    else:
                        ops.append(ReplaceOne({'_id': str(k)}, {'_id': str(k), 'value': v}, upsert=True))
            if ops:
                coll.bulk_write(ops, ordered=False)
            return True
        except Exception as e:
            print(f"[MONGODB_SYNC_ERROR] {method} {collection_name}{'/' + str(doc_id) if doc_id else ''}: {e}", flush=True)
            return False

    if sync:
        return _execute()
    threading.Thread(target=_execute, daemon=True).start()
    return None


def transition_scheduled_task(task_id: Any, expected: Dict[str, Any], fields: Dict[str, Any]) -> Optional[bool]:
    """Atomic conditional update of a scheduled task: applies `fields` only if the stored document
    still matches `expected` (e.g. the status/updatedAt this instance saw). True = applied,
    False = changed by someone else, None = database unavailable."""
    db = get_database()
    if db is None:
        return None
    try:
        flt = {'_id': str(task_id)}
        flt.update(expected)
        return db['ai_scheduled_tasks'].find_one_and_update(flt, {'$set': dict(fields)}, return_document=True) is not None
    except Exception as e:
        print(f"[MONGODB_SYNC_ERROR] scheduler transition failed for {task_id}: {e}", flush=True)
        return None


def claim_scheduled_task(task_id: Any, expected_next_run_at: Any, lease_cutoff_iso: str, fields: Dict[str, Any]) -> Optional[bool]:
    """Atomically claim one due occurrence of a scheduled task (findOneAndUpdate).
    Matches only while the task is enabled, still at the expected nextRunAt and either 'scheduled' or
    holding a stale CLAIMING lease. True = claimed, False = someone else has it (or it changed / was
    deleted), None = database unavailable."""
    db = get_database()
    if db is None:
        return None
    try:
        doc = db['ai_scheduled_tasks'].find_one_and_update(
            {
                '_id': str(task_id),
                'nextRunAt': expected_next_run_at,
                'enabled': {'$ne': False},
                '$or': [
                    {'status': 'scheduled'},
                    {'status': 'CLAIMING', 'claimedAt': {'$lt': lease_cutoff_iso}},
                ],
            },
            {'$set': dict(fields)},
            return_document=True,   # ReturnDocument.AFTER
        )
        return doc is not None
    except Exception as e:
        print(f"[MONGODB_SYNC_ERROR] scheduler claim failed for {task_id}: {e}", flush=True)
        return None


def scheduler_has_due_work(now_iso: str, lease_cutoff_iso: str, processing_check_iso: Optional[str] = None) -> Optional[bool]:
    """Cheap scheduler check (up to three find_one queries that return only an _id): is any task
    due to start, to expire or to recover, or any live test past its window? None = unknown."""
    db = get_database()
    if db is None:
        return None
    try:
        due_task = db['ai_scheduled_tasks'].find_one({'$or': [
            {'status': 'scheduled', 'enabled': {'$ne': False}, 'nextRunAt': {'$lte': now_iso}},
            {'status': 'CLAIMING', 'claimedAt': {'$lt': lease_cutoff_iso}, 'nextRunAt': {'$lte': now_iso}},
            {'status': 'live', 'expiresAt': {'$lte': now_iso}},
            {'status': 'failed', 'enabled': {'$ne': False}, 'scheduleType': {'$in': ['recurring', 'weekly']}},
            {'status': {'$in': ['processing', 'PROCESSING']}, 'updatedAt': {'$lte': processing_check_iso or now_iso}},
            {'status': 'RECOVERING', 'recoveryStartedAt': {'$lt': lease_cutoff_iso}},
        ]}, {'_id': 1})
        if due_task:
            return True
        if db['tests'].find_one({'isLive': True, 'liveExpiresAt': {'$lte': now_iso}}, {'_id': 1}):
            return True
        return False
    except Exception as e:
        print(f"[MONGODB_SYNC_WARN] scheduler due check failed: {e}", flush=True)
        return None


def find_documents(collection_name: str, query: Dict[str, Any], projection: Optional[Dict[str, Any]] = None,
                   sort: Optional[List[Tuple[str, int]]] = None, limit: int = 0) -> Optional[List[Dict[str, Any]]]:
    """Targeted read (filter / projection / sort / limit) without _id; None when the database is unavailable."""
    db = get_database()
    if db is None:
        return None
    try:
        cursor = db[collection_name].find(query, projection)
        if sort:
            cursor = cursor.sort(sort)
        if limit:
            cursor = cursor.limit(int(limit))
        out = []
        for d in cursor:
            d.pop('_id', None)
            out.append(d)
        return out
    except Exception as e:
        print(f"[MONGODB_SYNC_WARN] find {collection_name} failed: {e}", flush=True)
        return None


def update_document_fields(collection_name: str, doc_id: Any, fields: Dict[str, Any],
                           expected: Optional[Dict[str, Any]] = None) -> Optional[bool]:
    """Atomic conditional field update ($set): applied only while the stored document still matches
    `expected` (compare-and-swap). True = applied, False = the document changed / is gone,
    None = database unavailable."""
    db = get_database()
    if db is None:
        return None
    try:
        flt = {'_id': str(doc_id)}
        flt.update(expected or {})
        res = db[collection_name].update_one(flt, {'$set': {k: v for k, v in fields.items() if k != '_id'}})
        return res.matched_count == 1
    except Exception as e:
        print(f"[MONGODB_SYNC_ERROR] conditional update {collection_name}/{doc_id} failed: {e}", flush=True)
        return None


def question_texts_for_chapter(subject: str, chapter_id: str, chapter: str, limit: int = 300) -> Optional[List[str]]:
    """Stems of the bank questions of one subject/chapter (duplicate detection) - stems only."""
    ors = [c for c in ({'chapterId': chapter_id} if chapter_id else None, {'chapter': chapter} if chapter else None) if c]
    if not ors:
        return []
    docs = find_documents('questions', {'subject': subject, '$or': ors}, {'text': 1, 'question': 1})
    if docs is None:
        return None
    texts = [d.get('text') or d.get('question') for d in docs if d.get('text') or d.get('question')]
    return texts[-limit:]


RECENT_JOBS_LOADED = 50
ACTIVE_JOB_STATUSES = ('QUEUED', 'CLAIMED', 'GENERATING', 'VALIDATING', 'PUBLISHING')


def load_document(collection_name: str, doc_id: Any) -> Optional[Dict[str, Any]]:
    """One document by _id (without _id), or None when missing / database unavailable."""
    db = get_database()
    if db is None or not doc_id:
        return None
    try:
        doc = db[collection_name].find_one({'_id': str(doc_id)})
    except Exception as e:
        print(f"[MONGODB_SYNC_WARN] load {collection_name}/{doc_id} failed: {e}", flush=True)
        return None
    if doc:
        doc.pop('_id', None)
    return doc


def collection_is_empty(collection_name: str) -> Optional[bool]:
    """True/False, or None when the database is unavailable."""
    db = get_database()
    if db is None:
        return None
    try:
        return db[collection_name].find_one({}, {'_id': 1}) is None
    except Exception as e:
        print(f"[MONGODB_SYNC_WARN] emptiness check failed for {collection_name}: {e}", flush=True)
        return None


def is_tombstoned(collection_name: str, doc_id: Any) -> bool:
    """True if the document was deleted (deletion tombstone in MongoDB). False when unknown/offline."""
    db = get_database()
    if db is None:
        return False
    try:
        if db['deleted_documents'].find_one({'_id': f"{collection_name}:{doc_id}"}, {'_id': 1}):
            return True
        if collection_name == 'ai_scheduled_tasks' and db['deleted_scheduled_tasks'].find_one({'_id': str(doc_id)}, {'_id': 1}):
            return True
    except Exception as e:
        print(f"[MONGODB_SYNC_WARN] tombstone check failed for {collection_name}/{doc_id}: {e}", flush=True)
    return False


def upsert_documents(collection_name: str, docs: List[Dict[str, Any]], id_field: str) -> bool:
    """Synchronous bulk upsert of whole documents (write-through from save_backend_data)."""
    db = get_database()
    if db is None or not docs:
        return db is not None
    try:
        ops = []
        for d in docs:
            doc = dict(d)
            doc['_id'] = str(d[id_field]) if id_field in d else str(d['_id'])
            ops.append(ReplaceOne({'_id': doc['_id']}, doc, upsert=True))
        db[collection_name].bulk_write(ops, ordered=False)
        return True
    except Exception as e:
        print(f"[MONGODB_SYNC_ERROR] bulk upsert {collection_name} ({len(docs)} docs): {e}", flush=True)
        return False


def load_collection_from_mongo(collection_name: str) -> Optional[Union[List[Any], Dict[str, Any]]]:
    """
    Load a collection from MongoDB Atlas in the shape the application data dict uses.
    Returns None if MongoDB is unreachable or the collection is empty.
    """
    db = get_database()
    if db is None:
        return None

    try:
        if collection_name == 'ai_generation_jobs':
            # every finished job embeds its questions; instances keep only the newest jobs plus the
            # active ones, so never download the whole (ever-growing) history
            coll = db[collection_name]
            docs = list(coll.find({}).sort('createdTs', -1).limit(RECENT_JOBS_LOADED))
            seen = {d.get('_id') for d in docs}
            docs += [d for d in coll.find({'status': {'$in': list(ACTIVE_JOB_STATUSES)}}) if d.get('_id') not in seen]
        else:
            docs = list(db[collection_name].find({}))
        if not docs:
            return None

        if collection_name in STRING_LIST_COLLECTIONS:
            return [str(d['_id']) for d in docs if d.get('_id')]

        if collection_name in SINGLETON_COLLECTIONS or collection_name == 'ai_providers':
            result = {}
            for d in docs:
                _id = d.pop('_id', None)
                result[str(_id)] = d['value'] if ('value' in d and len(d) == 1) else d
            return result

        if collection_name in KEYED_DICT_COLLECTIONS:
            key_field = KEYED_DICT_COLLECTIONS[collection_name]
            result = {}
            for d in docs:
                _id = d.pop('_id', None)
                if 'value' in d and len(d) == 1:
                    continue
                key = d.get(key_field) or d.get('id') or _id
                result[str(key)] = d
            return result

        # List collections: one entry per key; legacy positional ids ("<collection>_<n>") lose to a
        # document stored under its real key.
        key_field = list_key_field(collection_name)
        by_key: Dict[str, Dict[str, Any]] = {}
        for d in docs:
            _id = str(d.pop('_id', ''))
            if 'value' in d and len(d) == 1:
                continue
            key = str(d.get(key_field) or d.get('id') or _id)
            positional = _id.startswith(f"{collection_name}_") and _id != key
            if key in by_key and positional:
                continue
            by_key[key] = d
        return list(by_key.values())
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
