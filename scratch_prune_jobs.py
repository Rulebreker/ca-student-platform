import mongodb_manager
import json

db = mongodb_manager.get_database()
if db is not None:
    res = db.ai_generation_jobs.update_many(
        {'status': {'$in': ['PROCESSING', 'GENERATING', 'QUEUED']}},
        {'$set': {'status': 'FAILED', 'currentStage': 'Reset by system administrator', 'error': 'Cancelled previous stale job'}}
    )
    print(f"Reset stuck jobs in MongoDB Atlas: {res.modified_count}")

# Also reset in local backend_data.json
try:
    with open('backend_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    modified = 0
    for j in data.get('ai_generation_jobs', []):
        if j.get('status') in ['PROCESSING', 'GENERATING', 'QUEUED']:
            j['status'] = 'FAILED'
            j['currentStage'] = 'Reset by system administrator'
            j['error'] = 'Cancelled previous stale job'
            modified += 1
    if modified > 0:
        with open('backend_data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print(f"Reset stuck jobs in local JSON: {modified}")
    else:
        print("No stuck jobs in local JSON.")
except Exception as e:
    print(f"Error updating local JSON: {e}")
