"""
test_10_mcqs_live.py
====================
Runs live generation of exactly 10 MCQs using local Qwen3 8B, validates all 10,
and commits the published test to MongoDB Atlas.
"""

import sys
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import time
import json
import local_qwen_engine
import mongodb_manager
import server
import ai_job_manager

def main():
    print("=" * 65)
    print(" EXCELLENCECA — LIVE 10-MCQ GENERATION TEST (LOCAL QWEN3 8B)")
    print("=" * 65)

    ok, msg = local_qwen_engine.check_ollama()
    print(f"Ollama Status: {ok} ({msg})")
    if not ok:
        print("ERROR: Ollama is not ready!")
        return

    db = mongodb_manager.get_database()
    tests_before = db.tests.count_documents({}) if db is not None else 0
    qs_before = db.questions.count_documents({}) if db is not None else 0
    print(f"Initial MongoDB Stats -> Tests: {tests_before}, Questions: {qs_before}\n")

    subject = "Business Economics"
    chapter = "Theory of Demand and Supply"
    topic = "Law of Demand and Elasticity of Demand"
    exam_level = "CA Foundation"
    difficulty = "ICAI Exam Standard"
    target_count = 10
    test_id = f"tst-ai-10mcq-{int(time.time())}"
    job_id = f"job-ai-10mcq-{int(time.time())}"

    def progress_reporter(p):
        print(f"  [PROGRESS] {p.get('progress')}% - {p.get('stage')} (Verified: {p.get('verifiedCount')}/{target_count})", flush=True)

    print(f"Starting Generation for: {subject} -> {chapter}")
    print(f"Topic: {topic} | Exam Level: {exam_level} | Target Count: {target_count}")
    print("-" * 65)

    t0 = time.time()
    questions, metrics = local_qwen_engine.generate_exact_10_mcqs(
        subject=subject,
        chapter=chapter,
        topic=topic,
        exam_level=exam_level,
        difficulty=difficulty,
        target_count=target_count,
        marks_per_correct=2.0,
        negative_marks=0.5,
        platform_xp=10.0,
        test_id=test_id,
        job_id=job_id,
        progress_callback=progress_reporter
    )

    total_time = round(time.time() - t0, 1)
    print("\n" + "=" * 65)
    print(f"GENERATION COMPLETE in {total_time}s! Verified Questions: {len(questions)}/{target_count}")
    print("=" * 65)

    if len(questions) < 10:
        print(f"WARNING: Expected 10 questions, got {len(questions)}")
    else:
        print("SUCCESS: Exactly 10 MCQs generated and verified!")

    for i, q in enumerate(questions, 1):
        q_text = q['question'].encode('ascii', errors='replace').decode('ascii')
        print(f"\n--- Q{i}. {q_text}")
        for opt_key in ['A', 'B', 'C', 'D']:
            opt_text = q['options'][opt_key].encode('ascii', errors='replace').decode('ascii')
            print(f"    [{opt_key}] {opt_text}")
        print(f"    Correct Answer: {q['correctOption']}")
        expl_text = q['explanation'][:180].encode('ascii', errors='replace').decode('ascii')
        print(f"    Explanation: {expl_text}...")

    # Commit test to MongoDB Atlas and local data store
    data = server.load_backend_data()
    ok, err, res = ai_job_manager.complete_job_from_worker(
        job_id,
        questions,
        metrics,
        data=data,
        save_callback=server.save_backend_data,
        firebase_sync_callback=server.sync_to_database
    )

    tests_after = db.tests.count_documents({}) if db is not None else 0
    qs_after = db.questions.count_documents({}) if db is not None else 0

    print("\n" + "=" * 65)
    print("MONGODB ATLAS COMMIT STATUS:")
    print(f" - Success: {ok}")
    print(f" - Test ID: {test_id}")
    print(f" - Tests in DB: {tests_after} (+{tests_after - tests_before})")
    print(f" - Questions in DB: {qs_after} (+{qs_after - qs_before})")
    print("=" * 65)

if __name__ == '__main__':
    main()
