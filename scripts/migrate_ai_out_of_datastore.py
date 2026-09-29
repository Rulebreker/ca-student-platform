"""
Optional, manual cleanup: remove ai_generation_jobs and ai_source_documents from an existing JSON datastore.

While MongoDB is reachable the server no longer reads or writes these two collections in the JSON store
(server.AI_MONGO_ONLY_COLLECTIONS), but it never deletes a copy that an existing file still holds. This script
does that removal explicitly, safely:

  1. Dry run by default: prints what the file holds and how much smaller it would become.
  2. --verify-mongo (read-only): checks that every document id in the file also exists in MongoDB and reports
     any that do not. --apply refuses to continue when documents are missing, unless --force is given.
  3. --apply: first writes a backup containing exactly the removed collections
     (<file>.ai-backup-<UTC timestamp>.json), then rewrites the datastore without them (atomic replace).

Usage (from the project root):
    python scripts/migrate_ai_out_of_datastore.py                       # dry run, local store
    python scripts/migrate_ai_out_of_datastore.py --verify-mongo        # + compare with MongoDB (read-only)
    python scripts/migrate_ai_out_of_datastore.py --verify-mongo --apply
Restore: copy the backup's two collections back into the datastore file.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI_COLLECTIONS = ('ai_generation_jobs', 'ai_source_documents')
DEFAULT_FILE = os.path.join(ROOT, 'private_storage', 'backend_data.json')


def doc_ids(value):
    items = value.values() if isinstance(value, dict) else (value or [])
    return [str(d.get('id')) for d in items if isinstance(d, dict) and d.get('id')]


def missing_in_mongo(store):
    sys.path.insert(0, ROOT)
    import mongodb_manager
    if mongodb_manager.get_database() is None:
        raise SystemExit('MongoDB is not reachable: cannot verify. Nothing was changed.')
    missing = {}
    for key in AI_COLLECTIONS:
        ids = doc_ids(store.get(key))
        found = {d.get('id') for d in (mongodb_manager.find_documents(key, {'_id': {'$in': ids}}, {'id': 1}) or [])}
        missing[key] = [i for i in ids if i not in found]
    return missing


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--file', default=DEFAULT_FILE, help='datastore file (default: private_storage/backend_data.json)')
    ap.add_argument('--verify-mongo', action='store_true', help='check the documents exist in MongoDB (read-only)')
    ap.add_argument('--apply', action='store_true', help='back up, then remove the AI collections from the file')
    ap.add_argument('--force', action='store_true', help='apply even if some documents are not in MongoDB')
    args = ap.parse_args()

    with open(args.file, 'r', encoding='utf-8') as f:
        raw = f.read()
    store = json.loads(raw)
    present = [k for k in AI_COLLECTIONS if k in store]
    if not present:
        print(f'{args.file}: no AI collections present. Nothing to do.')
        return
    remaining = {k: v for k, v in store.items() if k not in AI_COLLECTIONS}
    new_payload = json.dumps(remaining, separators=(',', ':'))
    for k in present:
        print(f'{k}: {len(doc_ids(store[k]))} documents, {len(json.dumps(store[k])) / 1e6:.2f} MB')
    print(f'file: {len(raw.encode()) / 1e6:.2f} MB now -> {len(new_payload.encode()) / 1e6:.2f} MB after cleanup')

    missing = None
    if args.verify_mongo:
        missing = missing_in_mongo(store)
        for k, ids in missing.items():
            print(f'{k}: {len(ids)} document(s) not found in MongoDB' + (f': {ids[:10]}' if ids else ''))

    if not args.apply:
        print('Dry run: nothing changed. Add --apply (ideally with --verify-mongo) to back up and remove.')
        return
    if missing is None and not args.force:
        raise SystemExit('Refusing to apply without --verify-mongo (or --force). Nothing was changed.')
    if missing and any(missing.values()) and not args.force:
        raise SystemExit('Some documents exist only in this file. Refusing to remove them (use --force to override). Nothing was changed.')

    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = f'{args.file}.ai-backup-{stamp}.json'
    with open(backup, 'w', encoding='utf-8') as f:
        json.dump({k: store[k] for k in present}, f)
    tmp = f'{args.file}.tmp.migrate'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(new_payload)
    os.replace(tmp, args.file)
    print(f'Backup written: {backup}')
    print(f'Removed {", ".join(present)} from {args.file}.')


if __name__ == '__main__':
    main()
