import os
import sys
import json
import time
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import ai_mcq_engine
import ai_job_manager
import ai_scheduler
import ai_provider_manager

def test_system_prompt_direct_and_quick():
    sys_inst = ai_mcq_engine.build_generation_system_instruction(
        question_category='Direct Questions',
        question_speed='Quick'
    )
    assert 'DIRECT' in sys_inst.upper(), "System instruction must emphasize DIRECT questions"
    assert 'CASE STUDY' in sys_inst.upper() or 'SCENARIO' in sys_inst.upper(), "System prompt must forbid case studies by default"
    print("PASS: test_system_prompt_direct_and_quick")

def test_quality_and_length_validation():
    good_q = {
        'question': 'Which accounting standard deals with Depreciation Accounting under ICAI standards?',
        'optionA': 'AS 2',
        'optionB': 'AS 6',
        'optionC': 'AS 10',
        'optionD': 'AS 16',
        'correctAnswer': 'C',
        'explanation': 'AS 10 (Property, Plant and Equipment) covers principles of depreciation accounting.'
    }
    is_valid, reason = ai_mcq_engine.validate_mcq_quality_and_constraints(good_q, 'Direct Questions', 'Quick')
    assert is_valid, f"Expected good question to pass validation, failed: {reason}"

    long_q = dict(good_q)
    long_q['question'] = (
        "M/s Alpha Limited is an Indian manufacturing conglomerate registered under the Companies Act 2013. "
        "During the financial year ended 31st March 2024, the chief financial officer noted several transactions "
        "involving heavy capital expenditure on specialized manufacturing plant imported from Germany with foreign "
        "exchange fluctuation risks and decommissioning liabilities. The board asked the audit committee to review "
        "whether capital assets should be depreciated under the straight-line method or written down value method, "
        "considering the expected pattern of economic benefits and components accounting under ICAI standards. "
        "Which accounting standard deals with Property, Plant and Equipment and depreciation accounting?"
    )
    is_valid_long, reason_long = ai_mcq_engine.validate_mcq_quality_and_constraints(long_q, 'Direct Questions', 'Quick')
    assert not is_valid_long, "Expected excessively long question to fail Direct Questions validation"

    case_q = dict(good_q)
    case_q['question'] = "Consider the following case study: Mr. Sharma invested Rs. 50,000 in shares. What is his tax liability?"
    is_valid_case, reason_case = ai_mcq_engine.validate_mcq_quality_and_constraints(case_q, 'Direct Questions', 'Quick')
    assert not is_valid_case, "Expected case narrative to be rejected for Direct Questions"
    print("PASS: test_quality_and_length_validation")

def test_json_repair():
    raw = """```json
    {
      "question": "What is the formula for Quick Ratio?",
      "optionA": "Quick Assets / Current Liabilities",
      "optionB": "Current Assets / Total Debt",
      "optionC": "Cash / Current Liabilities",
      "optionD": "Quick Assets / Long Term Debt",
      "correctAnswer": "A",
      "explanation": "Quick Ratio is calculated as Quick Assets divided by Current Liabilities.",
    }
    ```"""
    parsed = ai_mcq_engine.parse_and_repair_mcq_json(raw)
    assert parsed.get('correctAnswer') == 'A'
    assert 'Quick Assets' in parsed.get('optionA')
    print("PASS: test_json_repair")

def test_failure_isolation_in_pipeline():
    original_gen = ai_mcq_engine.generate_single_mcq
    original_val = ai_mcq_engine.validate_mcq_independently

    distinct_questions = {
        1: {
            'question': 'What is the formula for calculating Net Profit Margin in financial analysis?',
            'optionA': 'Net Profit / Revenue * 100',
            'optionB': 'Gross Profit / Total Assets',
            'optionC': 'Operating Income / Net Worth',
            'optionD': 'EBITDA / Current Liabilities',
            'correctAnswer': 'A',
            'explanation': 'Net Profit Margin is computed as Net Profit divided by Net Sales multiplied by 100.'
        },
        3: {
            'question': 'Under the Indian Partnership Act 1932 what is the liability of partners for firm debts?',
            'optionA': 'Limited to capital contribution',
            'optionB': 'Joint and several liability without limit',
            'optionC': 'Proportional to profit share only',
            'optionD': 'Nil after dissolution notice',
            'correctAnswer': 'B',
            'explanation': 'Every partner is jointly and severally liable for all acts of the firm done while being a partner.'
        }
    }

    def mock_generate_single_mcq(**kwargs):
        slot = kwargs.get('slot_number', 1)
        if slot == 2:
            raise RuntimeError("Simulated API rate limit on slot 2")
        return distinct_questions[slot], 'mock-provider', 'mock-model'

    def mock_validate_mcq_independently(**kwargs):
        return True, "Valid", None, "mock-val-provider"

    ai_mcq_engine.generate_single_mcq = mock_generate_single_mcq
    ai_mcq_engine.validate_mcq_independently = mock_validate_mcq_independently

    try:
        data = {'tests': [], 'questions': []}
        qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject='Business Economics',
            topic='Demand and Supply',
            count=3,
            question_category='Direct Questions',
            question_speed='Quick',
            data=data
        )

        assert len(qs) == 2, f"Expected 2 generated questions due to slot 2 failure, got {len(qs)}"
        assert metrics['failedCount'] == 1, f"Expected 1 failed count, got {metrics['failedCount']}"
        statuses = metrics['questionStatuses']
        assert len(statuses) == 3
        assert statuses[0]['status'] == 'saved'
        assert statuses[1]['status'] == 'failed'
        assert statuses[2]['status'] == 'saved'
        print("PASS: test_failure_isolation_in_pipeline (Slot 2 failed gracefully, Slot 3 completed)")
    finally:
        ai_mcq_engine.generate_single_mcq = original_gen
        ai_mcq_engine.validate_mcq_independently = original_val

def test_schedule_edit_persistence_and_categories():
    data = {'ai_scheduled_tasks': []}
    
    # 1. Create schedule
    create_input = {
        'name': 'Accounts Morning Routine',
        'scheduleType': 'recurring',
        'dailyTime': '08:30',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'subject': 'Accounting',
        'subjectId': 'sub-1',
        'chapter': 'Journal Entries',
        'chapterId': 'ch-1',
        'topic': 'Debit and Credit Rules',
        'difficulty': 'ICAI Exam Standard',
        'questionCategory': 'Direct Questions',
        'questionSpeed': 'Quick',
        'questionCount': 5,
        'durationMinutes': 15,
        'enabled': True
    }
    task = ai_scheduler.save_scheduled_task(create_input, data)
    assert task['id'].startswith('sched-'), "Expected valid schedule ID"
    assert task['questionCategory'] == 'Direct Questions'
    assert task['questionSpeed'] == 'Quick'
    assert task['dailyTime'] == '08:30'
    task_id = task['id']

    # 2. Edit existing schedule: change subject, chapter, category to Conceptual, speed to Medium
    edit_input = {
        'id': task_id,
        'name': 'Intermediate Advanced Accounting Sprint',
        'scheduleType': 'recurring',
        'dailyTime': '18:00',
        'examLevel': 'CA Intermediate',
        'examLevelId': 'intermediate',
        'subject': 'Advanced Accounting',
        'subjectId': 'sub-int-1',
        'chapter': 'Consolidation of Accounts',
        'chapterId': 'ch-int-acc-4',
        'topic': 'Holding Company Calculations',
        'difficulty': 'Hard',
        'questionCategory': 'Conceptual Questions',
        'questionSpeed': 'Medium',
        'questionCount': 10,
        'durationMinutes': 30
    }
    updated_task = ai_scheduler.save_scheduled_task(edit_input, data)
    
    assert updated_task['id'] == task_id, "Schedule edit must preserve existing ID in-place"
    assert len(data['ai_scheduled_tasks']) == 1, "Must update record in-place without duplicating"
    assert updated_task['name'] == 'Intermediate Advanced Accounting Sprint'
    assert updated_task['examLevel'] == 'CA Intermediate'
    assert updated_task['subject'] == 'Advanced Accounting'
    assert updated_task['chapter'] == 'Consolidation of Accounts'
    assert updated_task['questionCategory'] == 'Conceptual Questions'
    assert updated_task['questionSpeed'] == 'Medium'
    assert updated_task['questionCount'] == 10
    assert updated_task['dailyTime'] == '18:00'
    assert updated_task['enabled'] is True, "Must retain enabled state"
    print("PASS: test_schedule_edit_persistence_and_categories")

def test_job_manager_integration():
    data = {'ai_generation_jobs': [], 'tests': [], 'questions': [], 'ai_generation_logs': []}
    
    ok, err, job = ai_job_manager.create_generation_job(
        params={
            'title': 'Quick Direct Test',
            'subject': 'Accounting',
            'topic': 'Trial Balance',
            'count': 3,
            'questionCategory': 'Direct Questions',
            'questionSpeed': 'Quick'
        },
        data=data,
        save_callback=lambda d: None,
        firebase_sync_callback=lambda p, d, **kw: None
    )
    assert ok, f"Job creation failed: {err}"
    assert job['questionCategory'] == 'Direct Questions'
    assert job['questionSpeed'] == 'Quick'
    assert len(job['questionStatuses']) == 3
    print("PASS: test_job_manager_integration")

if __name__ == '__main__':
    print("Running MCQ Reliability & Scheduling Test Suite...")
    test_system_prompt_direct_and_quick()
    test_quality_and_length_validation()
    test_json_repair()
    test_failure_isolation_in_pipeline()
    test_schedule_edit_persistence_and_categories()
    test_job_manager_integration()
    print("\nALL MCQ RELIABILITY & SCHEDULING TESTS PASSED!")
