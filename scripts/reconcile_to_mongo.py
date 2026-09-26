#!/usr/bin/env python3
"""
reconcile_to_mongo.py - bring every record into MongoDB Atlas before Firebase is removed.

Production data currently lives in three places:
  * Firebase RTDB     - records the browser wrote directly (users, tests, subscriptions, payments ...)
  * MongoDB Atlas     - records the server wrote (some user documents were damaged by an old PATCH bug
                        that replaced whole documents with the patched fields only)
  * backend_data.json - the deployed seed file

For every document (matched by collection + key) this tool merges all copies FIELD BY FIELD: a field
present in only one copy is kept; a field present in several takes the value from the copy with the
newest timestamp (MongoDB wins ties). Nothing is ever deleted.

Dry run (default): prints a summary and writes a JSON report; MongoDB is only read.
--apply:           first writes a full JSON backup of every MongoDB collection it will touch,
                   then upserts only the documents whose merged version differs from MongoDB.

Usage:
  python scripts/reconcile_to_mongo.py --firebase-export firebase_export.json [--seed backend_data.json]
  python scripts/reconcile_to_mongo.py --firebase-url https://<project>-default-rtdb.firebaseio.com
  add --apply to write (requires MONGODB_URI for the target database).
"""
import argparse
import copy
import json
import os
import sys
import time
import urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import mongodb_manager  # noqa: E402

COLLECTIONS = [
    'users', 'revoked_users', 'revoked_tokens', 'subscriptions', 'subscription_plans', 'payment_sessions',
    'payment_channels', 'notifications', 'admin_audit_logs', 'tests', 'questions', 'test_attempts',
    'assignments', 'papers', 'submissions', 'subjects', 'bookmarks', 'xp_transactions', 'xp_reset_history',
    'xp_reset_settings', 'referrals', 'referral_settings', 'ai_source_documents', 'ai_generation_logs',
    'ai_autopilot_config', 'ai_scheduled_tasks', 'deleted_scheduled_tasks', 'ai_generation_jobs',
]
SOURCE_ORDER = ('mongo', 'firebase', 'seed')   # tie-break priority


def _ts(doc):
    if not isinstance(doc, dict):
        return 0.0
    for key in ('updatedTs', 'lastHeartbeatTs'):
        if isinstance(doc.get(key), (int, float)):
            return float(doc[key])
    for key in ('updatedAt', 'submittedAt', 'createdAt', 'timestamp'):
        if doc.get(key):
            try:
                return datetime.fromisoformat(str(doc[key]).replace('Z', '+00:00')).timestamp()
            except ValueError:
                continue
    return 0.0


def _doc_key(collection, dict_key, doc):
    """Stable key of a document across all three sources (matches the MongoDB _id convention)."""
    if collection in mongodb_manager.KEYED_DICT_COLLECTIONS:
        if collection == 'subscriptions':
            return str(doc.get('userId') or dict_key)
        return str(doc.get('id') or dict_key)       # users/plans: MongoDB _id is the id
    if collection in mongodb_manager.SINGLETON_COLLECTIONS:
        return '__singleton__'
    return str(doc.get(mongodb_manager.list_key_field(collection)) or doc.get('id') or dict_key)


def normalize(collection, value):
    """Any source shape (list, dict keyed by anything, RTDB object) -> {key: doc}. Also returns
    duplicate keys found inside this one source."""
    out, dupes = {}, []
    if value is None:
        return out, dupes
    if collection in mongodb_manager.STRING_LIST_COLLECTIONS:
        items = list(value.keys()) if isinstance(value, dict) else list(value)
        return {str(i): {'_id': str(i), 'value': True} for i in items if i}, dupes
    if collection in mongodb_manager.SINGLETON_COLLECTIONS:
        return ({'__singleton__': dict(value)} if isinstance(value, dict) and value else {}), dupes
    pairs = value.items() if isinstance(value, dict) else enumerate(value if isinstance(value, list) else [])
    for dict_key, doc in pairs:
        if not isinstance(doc, dict):
            continue
        key = _doc_key(collection, dict_key, doc)
        if key in out and out[key] != doc:
            dupes.append(key)
        out[key] = doc
    return out, dupes


def merge_copies(copies):
    """copies: {source: doc}. Field-level merge, newest copy wins per field, MongoDB wins ties."""
    ordered = sorted(copies.items(), key=lambda kv: (_ts(kv[1]), -SOURCE_ORDER.index(kv[0])))
    merged = {}
    for _source, doc in ordered:            # oldest first; newer copies overwrite
        for field, val in doc.items():
            if field == '_id' or val is None:
                continue
            if field == 'password' and not val:
                continue
            merged[field] = copy.deepcopy(val)
    return merged


def load_mongo(db):
    data = {}
    for coll in COLLECTIONS:
        docs = list(db[coll].find({}))
        if coll in mongodb_manager.SINGLETON_COLLECTIONS:
            data[coll] = {'__singleton__': {str(d['_id']): (d['value'] if set(d) == {'_id', 'value'} else
                                                            {k: v for k, v in d.items() if k != '_id'}) for d in docs}} if docs else {}
        elif coll in mongodb_manager.STRING_LIST_COLLECTIONS:
            data[coll] = {str(d['_id']): {'_id': str(d['_id']), 'value': True} for d in docs}
        else:
            data[coll] = {str(d['_id']): {k: v for k, v in d.items() if k != '_id'} for d in docs
                          if not (set(d) == {'_id', 'value'})}
    return data


def fetch_firebase(url):
    root = url.rstrip('/')
    out = {}
    for coll in COLLECTIONS:
        with urllib.request.urlopen(f"{root}/{coll}.json", timeout=60) as resp:
            out[coll] = json.loads(resp.read().decode('utf-8'))
    return out


def reconcile(mongo_raw, firebase_raw, seed_raw):
    plan, report = {}, {'collections': {}, 'needsDecision': []}
    for coll in COLLECTIONS:
        sources = {}
        mongo_docs = mongo_raw.get(coll, {})
        sources['mongo'] = mongo_docs
        for name, raw in (('firebase', firebase_raw), ('seed', seed_raw)):
            docs, dupes = normalize(coll, (raw or {}).get(coll))
            sources[name] = docs
            for key in dupes:
                report['needsDecision'].append({'collection': coll, 'key': key, 'source': name,
                                                'reason': 'several different records share this key'})
        keys = set().union(*[set(s) for s in sources.values()])
        stats = {'mongoOnly': 0, 'firebaseOnly': 0, 'seedOnly': 0, 'inSeveral': 0, 'toWrite': 0, 'repairedPartialMongo': 0}
        blocked = {d['key'] for d in report['needsDecision'] if d['collection'] == coll}
        writes = {}
        for key in keys:
            copies = {s: docs[key] for s, docs in sources.items() if key in docs}
            if len(copies) == 1:
                stats[{'mongo': 'mongoOnly', 'firebase': 'firebaseOnly', 'seed': 'seedOnly'}[next(iter(copies))]] += 1
            else:
                stats['inSeveral'] += 1
            if key in blocked:
                continue
            merged = merge_copies(copies)
            current = {k: v for k, v in mongo_docs.get(key, {}).items() if k != '_id'}
            if merged != current:
                if coll == 'users' and key in mongo_docs and not mongo_docs[key].get('email') and merged.get('email'):
                    stats['repairedPartialMongo'] += 1
                writes[key] = merged
        stats['toWrite'] = len(writes)
        report['collections'][coll] = stats
        plan[coll] = writes
    users = {k: v for k, v in plan.get('users', {}).items()}
    report['plaintextPasswordsAfterMerge'] = sum(
        1 for coll_docs in [users] for u in coll_docs.values()
        if u.get('password') and not str(u['password']).startswith('sha256:'))
    return plan, report


def apply_plan(db, plan, backup_path):
    backup = {coll: list(db[coll].find({})) for coll, writes in plan.items() if writes}
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(backup, f, default=str)
    written = 0
    for coll, writes in plan.items():
        for key, doc in writes.items():
            if coll in mongodb_manager.SINGLETON_COLLECTIONS:
                ok = mongodb_manager.sync_document_to_mongo(coll, doc, sync=True)
            elif coll in mongodb_manager.STRING_LIST_COLLECTIONS:
                ok = mongodb_manager.upsert_documents(coll, [{'_id': key, 'value': True}], '_id')
            else:
                ok = mongodb_manager.upsert_documents(coll, [dict(doc, _id=key)], '_id')
            if not ok:
                raise RuntimeError(f"write failed: {coll}/{key} (backup at {backup_path})")
            written += 1
    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--firebase-export', help='JSON export of the Firebase RTDB root')
    src.add_argument('--firebase-url', help='RTDB base URL (reads <url>/<collection>.json)')
    ap.add_argument('--seed', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend_data.json'))
    ap.add_argument('--report', default=f"reconcile_report_{int(time.time())}.json")
    ap.add_argument('--apply', action='store_true', help='write to MongoDB (after a full backup)')
    args = ap.parse_args()

    db = mongodb_manager.get_database()
    if db is None:
        sys.exit('MongoDB is not reachable (check MONGODB_URI / MONGODB_DB_NAME).')
    firebase_raw = (json.load(open(args.firebase_export, encoding='utf-8')) if args.firebase_export
                    else fetch_firebase(args.firebase_url))
    seed_raw = json.load(open(args.seed, encoding='utf-8')) if args.seed and os.path.exists(args.seed) else {}

    plan, report = reconcile(load_mongo(db), firebase_raw, seed_raw)
    with open(args.report, 'w', encoding='utf-8') as f:
        json.dump({'summary': report, 'writes': plan}, f, indent=1, default=str)
    print(f"{'collection':26} mongoOnly firebaseOnly seedOnly inSeveral toWrite repairedUsers")
    for coll, s in report['collections'].items():
        print(f"{coll:26} {s['mongoOnly']:9} {s['firebaseOnly']:12} {s['seedOnly']:8} {s['inSeveral']:9} {s['toWrite']:7} {s['repairedPartialMongo']:13}")
    print(f"\nNeeds an owner decision (not written): {len(report['needsDecision'])}")
    for d in report['needsDecision']:
        print(f"  {d['collection']}/{d['key']} [{d['source']}]: {d['reason']}")
    print(f"Plaintext passwords after merge: {report['plaintextPasswordsAfterMerge']}")
    print(f"Report: {args.report}")
    if args.apply:
        backup = f"mongo_backup_before_reconcile_{int(time.time())}.json"
        n = apply_plan(db, plan, backup)
        print(f"APPLIED: {n} document upserts. Backup of the previous MongoDB state: {backup}")
    else:
        print("Dry run only - nothing written. Re-run with --apply to write.")


if __name__ == '__main__':
    main()
