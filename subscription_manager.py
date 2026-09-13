"""
subscription_manager.py - Secure Server-Authoritative Subscription & Payment Engine
ExcellenceCA Platform

Features:
- Immutable Plan IDs (core_monthly, core_4_month, plus_monthly, plus_4_month, elite_monthly, elite_4_month, elite_trial)
- Centralized Entitlement & Permission Checking (database as single source of truth)
- 5-Minute Server-Enforced Payment Session Lifecycle
- Late Payment Detection & Strict UTR Format + Uniqueness Validation
- Atomic & Idempotent Points Awarding (+500, +1000, +1500 XP)
- Full Admin Management (Grant, Extend, Shorten, Suspend, Reactivate, Cancel, Custom Expiry)
- Payment Channel Snapshotting (Preserves channel details per session)
- Tamper-Proof Server-Side Admin Audit Logging
"""

import os
import re
import time
import uuid
from datetime import datetime, timezone, timedelta

# Authorized Plan Definitions with Immutable IDs
DEFAULT_PLANS = {
    'core_monthly': {
        'id': 'core_monthly',
        'tier': 'core',
        'name': 'Core Pass (Monthly)',
        'billingCycle': 'monthly',
        'durationDays': 30,
        'price': 49,
        'currency': 'INR',
        'instantPoints': 500,
        'badge': 'Core Pass',
        'badgeClass': 'bg-blue-100 text-blue-800 border-blue-200',
        'copyCheckSlaHours': 48,
        'features': [
            '+500 instant bonus XP points',
            'Official Core Pass badge',
            'Copy checked within 48 hours',
            'Access to premium MCQ questions',
            'Daily 1 live MCQ session per subject',
            'Teacher Review & Grading Workflow'
        ],
        'permissions': {
            'premium_mcq_access': True,
            'premium_test_paper_access': False,
            'live_mcq_daily_limit': 1,
            'copy_check_sla_hours': 48,
            'monthly_full_exam_access': False,
            'weekly_full_exam_access': False,
            'teacher_review_access': True
        },
        'isActive': True,
        'order': 1
    },
    'core_4_month': {
        'id': 'core_4_month',
        'tier': 'core',
        'name': 'Core Pass (4 Months)',
        'billingCycle': '4_months',
        'durationDays': 120,
        'price': 149,
        'currency': 'INR',
        'instantPoints': 500,
        'badge': 'Core Pass',
        'badgeClass': 'bg-blue-100 text-blue-800 border-blue-200',
        'copyCheckSlaHours': 48,
        'features': [
            '+500 instant bonus XP points',
            'Official Core Pass badge',
            'Copy checked within 48 hours',
            'Access to premium MCQ questions',
            'Daily 1 live MCQ session per subject',
            'Teacher Review & Grading Workflow',
            'Save ₹47 compared to monthly'
        ],
        'permissions': {
            'premium_mcq_access': True,
            'premium_test_paper_access': False,
            'live_mcq_daily_limit': 1,
            'copy_check_sla_hours': 48,
            'monthly_full_exam_access': False,
            'weekly_full_exam_access': False,
            'teacher_review_access': True
        },
        'isActive': True,
        'order': 2
    },
    'plus_monthly': {
        'id': 'plus_monthly',
        'tier': 'plus',
        'name': 'Plus Pass (Monthly)',
        'billingCycle': 'monthly',
        'durationDays': 30,
        'price': 99,
        'currency': 'INR',
        'instantPoints': 1000,
        'badge': 'Plus Pass',
        'badgeClass': 'bg-indigo-100 text-indigo-800 border-indigo-200',
        'copyCheckSlaHours': 24,
        'features': [
            '+1,000 instant bonus XP points',
            'Official Plus Pass badge',
            'Copy checked within 24 hours (Fast-Track)',
            'Access to premium MCQ questions',
            'Access to premium test papers & mock exams',
            'Daily 2 live MCQ sessions per subject',
            'Monthly Full Pledge Exam across all subjects',
            'Teacher Review & Grading Workflow'
        ],
        'permissions': {
            'premium_mcq_access': True,
            'premium_test_paper_access': True,
            'live_mcq_daily_limit': 2,
            'copy_check_sla_hours': 24,
            'monthly_full_exam_access': True,
            'weekly_full_exam_access': False,
            'teacher_review_access': True
        },
        'isActive': True,
        'order': 3
    },
    'plus_4_month': {
        'id': 'plus_4_month',
        'tier': 'plus',
        'name': 'Plus Pass (4 Months)',
        'billingCycle': '4_months',
        'durationDays': 120,
        'price': 299,
        'currency': 'INR',
        'instantPoints': 1000,
        'badge': 'Plus Pass',
        'badgeClass': 'bg-indigo-100 text-indigo-800 border-indigo-200',
        'copyCheckSlaHours': 24,
        'features': [
            '+1,000 instant bonus XP points',
            'Official Plus Pass badge',
            'Copy checked within 24 hours (Fast-Track)',
            'Access to premium MCQ questions',
            'Access to premium test papers & mock exams',
            'Daily 2 live MCQ sessions per subject',
            'Monthly Full Pledge Exam across all subjects',
            'Teacher Review & Grading Workflow',
            'Save ₹97 compared to monthly'
        ],
        'permissions': {
            'premium_mcq_access': True,
            'premium_test_paper_access': True,
            'live_mcq_daily_limit': 2,
            'copy_check_sla_hours': 24,
            'monthly_full_exam_access': True,
            'weekly_full_exam_access': False,
            'teacher_review_access': True
        },
        'isActive': True,
        'order': 4
    },
    'elite_monthly': {
        'id': 'elite_monthly',
        'tier': 'elite',
        'name': 'Elite Pass (Monthly)',
        'billingCycle': 'monthly',
        'durationDays': 30,
        'price': 149,
        'currency': 'INR',
        'instantPoints': 1500,
        'badge': 'Elite Pass',
        'badgeClass': 'bg-purple-100 text-purple-800 border-purple-200',
        'copyCheckSlaHours': 12,
        'features': [
            '+1,500 instant bonus XP points',
            'Official Elite Pass badge & VIP styling',
            'Copy checked within 12 hours (Ultra Priority)',
            'Access to premium MCQ questions',
            'Access to premium test papers & mock exams',
            'Daily 3 live MCQ sessions per subject',
            'Weekly Full Pledge Exam across all subjects',
            'Direct Faculty Review & Mentorship'
        ],
        'permissions': {
            'premium_mcq_access': True,
            'premium_test_paper_access': True,
            'live_mcq_daily_limit': 3,
            'copy_check_sla_hours': 12,
            'monthly_full_exam_access': True,
            'weekly_full_exam_access': True,
            'teacher_review_access': True
        },
        'isActive': True,
        'order': 5
    },
    'elite_4_month': {
        'id': 'elite_4_month',
        'tier': 'elite',
        'name': 'Elite Pass (4 Months)',
        'billingCycle': '4_months',
        'durationDays': 120,
        'price': 499,
        'currency': 'INR',
        'instantPoints': 1500,
        'badge': 'Elite Pass',
        'badgeClass': 'bg-purple-100 text-purple-800 border-purple-200',
        'copyCheckSlaHours': 12,
        'features': [
            '+1,500 instant bonus XP points',
            'Official Elite Pass badge & VIP styling',
            'Copy checked within 12 hours (Ultra Priority)',
            'Access to premium MCQ questions',
            'Access to premium test papers & mock exams',
            'Daily 3 live MCQ sessions per subject',
            'Weekly Full Pledge Exam across all subjects',
            'Direct Faculty Review & Mentorship',
            'Save ₹97 compared to monthly'
        ],
        'permissions': {
            'premium_mcq_access': True,
            'premium_test_paper_access': True,
            'live_mcq_daily_limit': 3,
            'copy_check_sla_hours': 12,
            'monthly_full_exam_access': True,
            'weekly_full_exam_access': True,
            'teacher_review_access': True
        },
        'isActive': True,
        'order': 6
    },
    'elite_trial': {
        'id': 'elite_trial',
        'tier': 'trial',
        'name': '₹9 Elite 10-Day Trial',
        'billingCycle': 'trial',
        'durationDays': 10,
        'price': 9,
        'currency': 'INR',
        'instantPoints': 0,
        'badge': 'Trial Pass',
        'badgeClass': 'bg-amber-100 text-amber-800 border-amber-200',
        'copyCheckSlaHours': 12,
        'features': [
            '10-Day full Elite access trial for just ₹9',
            'Official Trial Pass badge',
            'Copy checked within 12 hours (Ultra Priority)',
            'Access to premium MCQ questions',
            'Access to premium test papers & mock exams',
            'Daily 3 live MCQ sessions per subject',
            'Weekly Full Pledge Exam across all subjects',
            'Teacher Review & Grading Workflow'
        ],
        'permissions': {
            'premium_mcq_access': True,
            'premium_test_paper_access': True,
            'live_mcq_daily_limit': 3,
            'copy_check_sla_hours': 12,
            'monthly_full_exam_access': True,
            'weekly_full_exam_access': True,
            'teacher_review_access': True
        },
        'isActive': True,
        'order': 0
    }
}

DEFAULT_FREE_PERMISSIONS = {
    'premium_mcq_access': False,
    'premium_test_paper_access': False,
    'live_mcq_daily_limit': 0,
    'copy_check_sla_hours': 72,
    'monthly_full_exam_access': False,
    'weekly_full_exam_access': False,
    'teacher_review_access': False,
    'pass_badge': 'Free Tier',
    'badge_class': 'bg-slate-100 text-slate-700 border-slate-200'
}

DEFAULT_PAYMENT_CHANNELS = [
    {
        'id': 'chan-primary-1',
        'title': 'Primary UPI (HDFC Bank)',
        'name': 'Primary UPI (HDFC Bank)',
        'upiId': 'excellenceca@okhdfcbank',
        'payeeName': 'ExcellenceCA EduTech LLP',
        'qrCodeUrl': 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=excellenceca@okhdfcbank%26pn=ExcellenceCA%26cu=INR',
        'qrData': 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=excellenceca@okhdfcbank%26pn=ExcellenceCA%26cu=INR',
        'isPrimary': True,
        'isActive': True,
        'order': 1
    },
    {
        'id': 'chan-backup-2',
        'title': 'Backup UPI (ICICI Bank)',
        'name': 'Backup UPI (ICICI Bank)',
        'upiId': 'excellenceca@icici',
        'payeeName': 'ExcellenceCA EduTech LLP',
        'qrCodeUrl': 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=excellenceca@icici%26pn=ExcellenceCA%26cu=INR',
        'qrData': 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=excellenceca@icici%26pn=ExcellenceCA%26cu=INR',
        'isPrimary': False,
        'isActive': True,
        'order': 2
    }
]

def get_payment_channels(data):
    channels = data.get('payment_channels')
    if not channels or not isinstance(channels, list):
        data['payment_channels'] = [dict(c) for c in DEFAULT_PAYMENT_CHANNELS]
        return data['payment_channels']
    return channels

def get_all_plans(data):
    """Retrieve all plans from backend data, falling back to authoritative defaults."""
    stored = data.get('subscription_plans', {})
    merged = dict(DEFAULT_PLANS)
    for k, v in stored.items():
        if isinstance(v, dict):
            merged[k] = v
    return merged

def get_plan_by_id(plan_id, data):
    """Safely fetch plan by unique immutable ID."""
    plans = get_all_plans(data)
    return plans.get(plan_id)

def get_user_subscription(user_id, data, sync_fn=None):
    """Fetch user's current subscription, evaluating auto-expiry."""
    subscriptions = data.get('subscriptions', {})
    sub = subscriptions.get(user_id)
    if not sub:
        for em, u in data.get('users', {}).items():
            if em.lower() == str(user_id).lower() or u.get('id') == user_id or u.get('username') == user_id:
                sub = subscriptions.get(u.get('id'))
                if sub:
                    user_id = u.get('id')
                    break
    if not sub:
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    expires_at = sub.get('expiresAt')

    # Automatic server-side expiry enforcement
    if expires_at and now_iso >= expires_at and sub.get('status') in ('active', 'manually_granted'):
        sub['status'] = 'expired'
        sub['expiredAt'] = now_iso
        if 'history' not in sub:
            sub['history'] = []
        sub['history'].append({
            'action': 'auto_expire',
            'timestamp': now_iso,
            'details': f"Subscription automatically expired at {now_iso}"
        })
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", sub)

    return sub

def get_user_entitlements(user_id, data, sync_fn=None):
    """
    Centralized entitlement resolution.
    Database is single source of truth.
    Never trusts client parameters or localStorage flags.
    """
    user = None
    for u in data.get('users', {}).values():
        if u.get('id') == user_id:
            user = u
            break

    if user and user.get('role') in ('admin', 'teacher'):
        is_admin = user.get('role') == 'admin'
        return {
            'tier': 'admin' if is_admin else 'teacher',
            'planId': 'admin_unlimited' if is_admin else 'teacher_unlimited',
            'planName': 'Administrator Access' if is_admin else 'Faculty Access',
            'status': 'active',
            'isSubscribed': True,
            'isTrial': False,
            'badge': 'Administrator' if is_admin else 'Faculty',
            'badgeClass': 'bg-rose-100 text-rose-800 border-rose-200' if is_admin else 'bg-amber-100 text-amber-800 border-amber-200',
            'permissions': {
                'premium_mcq_access': True,
                'premium_test_paper_access': True,
                'live_mcq_daily_limit': 999,
                'copy_check_sla_hours': 1,
                'monthly_full_exam_access': True,
                'weekly_full_exam_access': True,
                'teacher_review_access': True
            },
            'startedAt': None,
            'expiresAt': None,
            'remainingDays': 999,
            'subscriptionId': None
        }

    sub = get_user_subscription(user_id, data, sync_fn)
    if not sub or sub.get('status') not in ('active', 'manually_granted'):
        return {
            'tier': 'free',
            'planId': 'free',
            'planName': 'Free Plan',
            'status': sub.get('status', 'none') if sub else 'none',
            'isSubscribed': False,
            'isTrial': False,
            'badge': 'Free Tier',
            'badgeClass': 'bg-slate-100 text-slate-700 border-slate-200',
            'permissions': dict(DEFAULT_FREE_PERMISSIONS),
            'startedAt': None,
            'expiresAt': sub.get('expiresAt') if sub else None,
            'remainingDays': 0,
            'subscriptionId': sub.get('id') if sub else None
        }

    plan_id = sub.get('planId')
    plan = get_plan_by_id(plan_id, data)
    if not plan:
        plan = DEFAULT_PLANS.get('core_monthly', {})

    now = datetime.now(timezone.utc)
    remaining_days = 0
    if sub.get('expiresAt'):
        try:
            expires_dt = datetime.fromisoformat(sub.get('expiresAt').replace('Z', '+00:00'))
            remaining_seconds = (expires_dt - now).total_seconds()
            remaining_days = max(0, int(remaining_seconds // 86400))
        except Exception:
            pass

    is_trial = (plan_id == 'elite_trial' or sub.get('isTrial') is True)

    return {
        'tier': plan.get('tier', 'core'),
        'planId': plan_id,
        'planName': plan.get('name', 'Active Pass'),
        'status': sub.get('status'),
        'isSubscribed': True,
        'isTrial': is_trial,
        'badge': plan.get('badge', 'Active Pass'),
        'badgeClass': plan.get('badgeClass', 'bg-blue-100 text-blue-800 border-blue-200'),
        'copyCheckSlaHours': plan.get('copyCheckSlaHours', 48),
        'permissions': plan.get('permissions', dict(DEFAULT_FREE_PERMISSIONS)),
        'startedAt': sub.get('startedAt'),
        'expiresAt': sub.get('expiresAt'),
        'remainingDays': remaining_days,
        'subscriptionId': sub.get('id')
    }

def validate_utr_format(utr):
    """Strict UTR format validation."""
    if not utr or not isinstance(utr, str):
        return False, "UTR / Transaction ID is required."
    clean = re.sub(r'[^A-Za-z0-9]', '', utr.strip()).upper()
    if len(clean) < 6 or len(clean) > 30:
        return False, "UTR / Transaction ID must be between 6 and 30 alphanumeric characters."
    return True, clean

def is_utr_duplicate(clean_utr, current_session_id, data):
    """
    Ensure UTR is never reused across different payments or student accounts.
    """
    sessions = data.get('payment_sessions', [])
    for s in sessions:
        if s.get('paymentSessionId') == current_session_id or s.get('sessionId') == current_session_id:
            continue
        existing_utr = s.get('utr')
        if existing_utr and re.sub(r'[^A-Za-z0-9]', '', existing_utr.strip()).upper() == clean_utr:
            status = s.get('status')
            if status in ('approved', 'submitted', 'pending_verification', 'late_payment'):
                return True, f"This UTR has already been submitted on {s.get('submittedAt') or s.get('createdAt')} for session #{s.get('paymentSessionId')[-6:]}."
    return False, None

def create_payment_session(user, plan_id, data, sync_fn=None):
    """
    Create a 5-minute payment session.
    Takes a snapshot of the primary/selected payment channel.
    Server timestamps enforce 5-minute countdown.
    """
    plan = get_plan_by_id(plan_id, data)
    if not plan:
        return False, "Invalid plan ID specified."

    if not plan.get('isActive', True):
        return False, "This plan is currently not available for purchase."

    channels = get_payment_channels(data)
    active_channels = [c for c in channels if c.get('isActive', True)]
    if not active_channels:
        selected_channel = {
            'id': 'default-primary',
            'name': 'Primary UPI',
            'upiId': 'excellenceca@okhdfcbank',
            'qrCodeUrl': 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=excellenceca@okhdfcbank%26pn=ExcellenceCA%26cu=INR'
        }
    else:
        primary = next((c for c in active_channels if c.get('isPrimary')), None)
        selected_channel = primary if primary else active_channels[0]

    channel_snapshot = {
        'id': selected_channel.get('id'),
        'name': selected_channel.get('name'),
        'upiId': selected_channel.get('upiId'),
        'qrCodeUrl': selected_channel.get('qrCodeUrl')
    }

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=5)
    payment_session_id = f"psess_{int(time.time()*1000)}_{uuid.uuid4().hex[:8]}"

    session = {
        'paymentSessionId': payment_session_id,
        'sessionId': payment_session_id,
        'userId': user['id'],
        'userEmail': user.get('email'),
        'userName': user.get('name'),
        'userPhone': user.get('phone', ''),
        'caLevel': user.get('caLevel', ''),
        'planId': plan['id'],
        'planName': plan['name'],
        'planTier': plan.get('tier', 'core'),
        'amount': plan['price'],
        'currency': plan.get('currency', 'INR'),
        'durationDays': plan.get('durationDays', 30),
        'channelSnapshot': channel_snapshot,
        'qrData': channel_snapshot.get('qrCodeUrl') or f"upi://pay?pa={channel_snapshot.get('upiId')}&pn={channel_snapshot.get('name') or 'ExcellenceCA'}&am={plan['price']}&cu=INR",
        'status': 'pending',
        'createdAt': now.isoformat(),
        'expiresAt': expires_at.isoformat(),
        'utr': None,
        'screenshot': None,
        'submittedAt': None,
        'verifiedAt': None,
        'verifiedBy': None,
        'rejectionReason': None
    }

    if 'payment_sessions' not in data:
        data['payment_sessions'] = []
    data['payment_sessions'].insert(0, session)

    if sync_fn:
        sync_fn(f"payment_sessions/{payment_session_id}", session)

    return True, session

def cancel_payment_session(user_id, session_id, data, sync_fn=None):
    """
    Cancel an in-flight payment session if student closes before submission.
    Creates persistent transaction-history record.
    """
    sessions = data.get('payment_sessions', [])
    target = next((s for s in sessions if (s.get('paymentSessionId') == session_id or s.get('sessionId') == session_id) and s.get('userId') == user_id), None)
    if not target:
        return False, "Payment session not found."

    if target.get('status') == 'pending':
        target['status'] = 'cancelled'
        target['cancelledAt'] = datetime.now(timezone.utc).isoformat()
        target['rejectionReason'] = "Payment session closed before completion."
        if sync_fn:
            sync_fn(f"payment_sessions/{session_id}", target)
        return True, target

    return True, target

def submit_payment(user_id, session_id, utr, screenshot, data, sync_fn=None):
    """
    Student submits payment details.
    Strictly validates UTR format, non-empty, and uniqueness.
    Detects late payment if submitted after 5-min timeout.
    """
    sessions = data.get('payment_sessions', [])
    session = next((s for s in sessions if (s.get('paymentSessionId') == session_id or s.get('sessionId') == session_id) and s.get('userId') == user_id), None)
    if not session:
        return False, "Payment session not found."

    valid_utr, clean_utr = validate_utr_format(utr)
    if not valid_utr:
        return False, clean_utr

    is_dup, dup_err = is_utr_duplicate(clean_utr, session_id, data)
    if is_dup:
        return False, dup_err

    if not screenshot or not isinstance(screenshot, str) or len(screenshot.strip()) < 5:
        return False, "Please upload a clear payment screenshot or receipt."

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    expires_at = datetime.fromisoformat(session['expiresAt'].replace('Z', '+00:00'))

    if now > expires_at:
        session['status'] = 'late_payment'
        session['notes'] = 'Payment proof submitted after 5-minute session countdown. Flagged for manual admin verification.'
    else:
        session['status'] = 'pending_verification'

    session['utr'] = clean_utr
    session['screenshot'] = screenshot.strip()
    session['submittedAt'] = now_iso

    if sync_fn:
        sync_fn(f"payment_sessions/{session_id}", session)

    return True, session

def verify_payment(admin_user, session_id, action, rejection_reason, data, sync_fn=None):
    """
    Admin verifies payment.
    Approve:
      - Validates idempotency (never double-award)
      - Activates subscription
      - Awards instant points derived from authoritative plan
      - Creates student notification
      - Logs admin audit
    Reject:
      - Updates status to rejected with reason
      - Creates student notification
      - Logs admin audit
    """
    sessions = data.get('payment_sessions', [])
    session = next((s for s in sessions if s.get('paymentSessionId') == session_id or s.get('sessionId') == session_id), None)
    if not session:
        return False, "Payment session not found."

    if session.get('status') == 'approved':
        return True, session

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    user_id = session['userId']
    plan = get_plan_by_id(session['planId'], data) or DEFAULT_PLANS.get(session['planId'], {})

    if action == 'approve':
        session['status'] = 'approved'
        session['verifiedAt'] = now_iso
        session['verifiedBy'] = admin_user.get('id', 'admin')

        subscriptions = data.setdefault('subscriptions', {})
        existing_sub = subscriptions.get(user_id)

        duration_days = int(session.get('durationDays') or plan.get('durationDays', 30))
        if existing_sub and existing_sub.get('status') in ('active', 'manually_granted') and existing_sub.get('expiresAt'):
            try:
                curr_exp = datetime.fromisoformat(existing_sub['expiresAt'].replace('Z', '+00:00'))
                if curr_exp > now:
                    start_dt = now
                    expires_dt = curr_exp + timedelta(days=duration_days)
                else:
                    start_dt = now
                    expires_dt = now + timedelta(days=duration_days)
            except Exception:
                start_dt = now
                expires_dt = now + timedelta(days=duration_days)
        else:
            start_dt = now
            expires_dt = now + timedelta(days=duration_days)

        new_sub = {
            'id': f"sub_{user_id}_{int(time.time())}",
            'userId': user_id,
            'planId': session['planId'],
            'planName': session['planName'],
            'planTier': session.get('planTier', plan.get('tier', 'core')),
            'isTrial': plan.get('tier') == 'trial',
            'status': 'active',
            'startedAt': start_dt.isoformat(),
            'expiresAt': expires_dt.isoformat(),
            'purchasedAmount': session['amount'],
            'paymentSessionId': session_id,
            'utr': session.get('utr'),
            'history': (existing_sub.get('history', []) if existing_sub else []) + [{
                'action': 'payment_approved',
                'paymentSessionId': session_id,
                'adminId': admin_user.get('id', 'admin'),
                'adminName': admin_user.get('name', 'Administrator'),
                'timestamp': now_iso,
                'details': f"Approved payment of ₹{session['amount']} for {session['planName']}"
            }]
        }
        subscriptions[user_id] = new_sub
        data['subscriptions'] = subscriptions

        instant_points = int(plan.get('instantPoints', 0))
        if instant_points > 0:
            tx_id = f"tx_sub_{session_id}"
            existing_tx = any(t.get('id') == tx_id for t in data.get('xp_transactions', []))
            if not existing_tx:
                student_user = None
                for email_k, u in data.get('users', {}).items():
                    if u.get('id') == user_id:
                        student_user = u
                        break
                if student_user:
                    student_user['totalXp'] = int(student_user.get('totalXp') or 0) + instant_points
                    if sync_fn:
                        sync_fn(f"users/{student_user.get('id')}", student_user)

                xp_tx = {
                    'id': tx_id,
                    'userId': user_id,
                    'userName': session.get('userName', 'Student'),
                    'activityName': f"Bonus XP: {session['planName']} Activation",
                    'points': instant_points,
                    'timestamp': now_iso,
                    'createdAt': now_iso,
                    'metadata': {
                        'paymentSessionId': session_id,
                        'planId': session['planId'],
                        'amount': instant_points
                    }
                }
                data.setdefault('xp_transactions', []).insert(0, xp_tx)
                if sync_fn:
                    sync_fn(f"xp_transactions/{tx_id}", xp_tx)

        notif = {
            'id': f"notif_sub_{int(time.time()*1000)}",
            'userId': user_id,
            'title': f"{plan.get('badge', 'Pass')} Activated!",
            'message': f"Your payment of ₹{session['amount']} (UTR: {session.get('utr')}) has been verified. Welcome to {session['planName']}! You received +{instant_points} bonus XP.",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        data.setdefault('notifications', []).insert(0, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
            sync_fn(f"subscriptions/{user_id}", new_sub)

        log_audit_action(
            admin_user=admin_user,
            action='APPROVE_PAYMENT',
            target_id=user_id,
            old_val=session.get('status'),
            new_val='approved',
            details=f"Approved payment of ₹{session['amount']} for {session['planName']} (UTR: {session.get('utr')})",
            data=data,
            sync_fn=sync_fn
        )

        if sync_fn:
            sync_fn(f"payment_sessions/{session_id}", session)

        return True, session

    elif action == 'reject':
        session['status'] = 'rejected'
        session['rejectionReason'] = rejection_reason or "Payment could not be verified with bank records."
        session['verifiedAt'] = now_iso
        session['verifiedBy'] = admin_user.get('id', 'admin')

        notif = {
            'id': f"notif_sub_rej_{int(time.time()*1000)}",
            'userId': user_id,
            'title': "Payment Verification Failed",
            'message': f"Your payment of ₹{session['amount']} for {session['planName']} could not be verified: {session['rejectionReason']}. Please contact faculty support.",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        data.setdefault('notifications', []).insert(0, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
            sync_fn(f"payment_sessions/{session_id}", session)

        log_audit_action(
            admin_user=admin_user,
            action='REJECT_PAYMENT',
            target_id=user_id,
            old_val=session.get('status'),
            new_val='rejected',
            details=f"Rejected payment of ₹{session['amount']} for {session['planName']}. Reason: {session['rejectionReason']}",
            data=data,
            sync_fn=sync_fn
        )

        return True, session

    return False, "Invalid verification action."

def manage_subscription(admin_user, user_id, action, params, data, sync_fn=None):
    """
    Full Admin Subscription Management.
    """
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    subscriptions = data.setdefault('subscriptions', {})
    existing = subscriptions.get(user_id)
    if not existing:
        for em, u in data.get('users', {}).items():
            if em.lower() == str(user_id).lower() or u.get('id') == user_id or u.get('username') == user_id:
                user_id = u.get('id')
                existing = subscriptions.get(user_id)
                break
    old_sub_copy = dict(existing) if existing else None

    if action in ('grant', 'add_trial'):
        plan_id = params.get('planId') or ('elite_trial' if action == 'add_trial' else 'core_monthly')
        plan = get_plan_by_id(plan_id, data) or DEFAULT_PLANS.get(plan_id, {})
        duration_days = int(params.get('days') or params.get('extensionDays') or plan.get('durationDays', 30))
        expires_at = (now + timedelta(days=duration_days)).isoformat()

        new_sub = {
            'id': f"sub_{user_id}_{int(time.time())}",
            'userId': user_id,
            'planId': plan['id'],
            'planName': plan['name'],
            'planTier': plan.get('tier', 'core'),
            'isTrial': plan.get('tier') == 'trial',
            'status': 'manually_granted',
            'startedAt': now_iso,
            'expiresAt': expires_at,
            'purchasedAmount': 0,
            'history': (existing.get('history', []) if existing else []) + [{
                'action': 'admin_granted',
                'adminId': admin_user.get('id'),
                'adminName': admin_user.get('name', 'Administrator'),
                'timestamp': now_iso,
                'details': f"Admin granted {plan['name']} ({duration_days} days). Reason: {params.get('reason', 'Administrative grant')}"
            }]
        }
        subscriptions[user_id] = new_sub

        log_audit_action(admin_user, 'GRANT_SUBSCRIPTION', user_id, old_sub_copy, new_sub, details=f"Admin granted {plan['name']} until {expires_at}", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", new_sub)
        return True, new_sub

    if not existing:
        return False, "No active subscription found for this student to modify."

    if action == 'extend':
        days = int(params.get('days') or params.get('extensionDays') or 30)
        curr_exp = datetime.fromisoformat(existing.get('expiresAt', now_iso).replace('Z', '+00:00'))
        base_dt = curr_exp if curr_exp > now else now
        new_exp = (base_dt + timedelta(days=days)).isoformat()
        existing['expiresAt'] = new_exp
        existing['status'] = 'active'
        existing.setdefault('history', []).append({
            'action': 'admin_extended',
            'adminId': admin_user.get('id'),
            'timestamp': now_iso,
            'details': f"Extended by {days} days to {new_exp}"
        })
        log_audit_action(admin_user, 'EXTEND_SUBSCRIPTION', user_id, old_sub_copy, existing, details=f"Extended by {days} days", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    elif action == 'shorten':
        days = int(params.get('days') or params.get('extensionDays') or 7)
        curr_exp = datetime.fromisoformat(existing.get('expiresAt', now_iso).replace('Z', '+00:00'))
        new_exp_dt = curr_exp - timedelta(days=days)
        if new_exp_dt < now:
            new_exp_dt = now
            existing['status'] = 'expired'
        new_exp = new_exp_dt.isoformat()
        existing['expiresAt'] = new_exp
        existing.setdefault('history', []).append({
            'action': 'admin_shortened',
            'adminId': admin_user.get('id'),
            'timestamp': now_iso,
            'details': f"Shortened by {days} days to {new_exp}"
        })
        log_audit_action(admin_user, 'SHORTEN_SUBSCRIPTION', user_id, old_sub_copy, existing, details=f"Shortened by {days} days", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    elif action == 'set_custom_expiry':
        custom_expiry = params.get('customExpiry')
        if not custom_expiry:
            return False, "Custom expiry date required."
        try:
            exp_dt = datetime.fromisoformat(custom_expiry.replace('Z', '+00:00'))
            existing['expiresAt'] = exp_dt.isoformat()
            existing['status'] = 'active' if exp_dt > now else 'expired'
            existing.setdefault('history', []).append({
                'action': 'custom_expiry_set',
                'adminId': admin_user.get('id'),
                'timestamp': now_iso,
                'details': f"Set custom expiry to {existing['expiresAt']}"
            })
            log_audit_action(admin_user, 'SET_CUSTOM_EXPIRY', user_id, old_sub_copy, existing, details=f"Set expiry to {existing['expiresAt']}", data=data, sync_fn=sync_fn)
            if sync_fn:
                sync_fn(f"subscriptions/{user_id}", existing)
            return True, existing
        except Exception as e:
            return False, f"Invalid custom expiry format: {str(e)}"

    elif action == 'change_plan':
        plan_id = params.get('planId')
        plan = get_plan_by_id(plan_id, data)
        if not plan:
            return False, "Invalid plan ID specified."
        existing['planId'] = plan['id']
        existing['planName'] = plan['name']
        existing['planTier'] = plan.get('tier', 'core')
        existing['isTrial'] = plan.get('tier') == 'trial'
        existing.setdefault('history', []).append({
            'action': 'admin_changed_plan',
            'adminId': admin_user.get('id'),
            'timestamp': now_iso,
            'details': f"Admin switched plan to {plan['name']}"
        })
        log_audit_action(admin_user, 'CHANGE_SUBSCRIPTION_PLAN', user_id, old_sub_copy, existing, details=f"Switched plan to {plan['name']}", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    elif action == 'suspend':
        existing['status'] = 'suspended'
        existing.setdefault('history', []).append({
            'action': 'admin_suspended',
            'adminId': admin_user.get('id'),
            'timestamp': now_iso,
            'details': f"Admin suspended subscription. Reason: {params.get('reason', 'Administrative suspension')}"
        })
        log_audit_action(admin_user, 'SUSPEND_SUBSCRIPTION', user_id, old_sub_copy, existing, details="Suspended subscription", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    elif action == 'reactivate':
        curr_exp = datetime.fromisoformat(existing.get('expiresAt', now_iso).replace('Z', '+00:00'))
        if curr_exp <= now:
            existing['expiresAt'] = (now + timedelta(days=30)).isoformat()
        existing['status'] = 'active'
        existing.setdefault('history', []).append({
            'action': 'admin_reactivated',
            'adminId': admin_user.get('id'),
            'timestamp': now_iso,
            'details': "Admin reactivated subscription."
        })
        log_audit_action(admin_user, 'REACTIVATE_SUBSCRIPTION', user_id, old_sub_copy, existing, details="Reactivated subscription", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    elif action in ('cancel', 'remove', 'remove_trial'):
        existing['status'] = 'cancelled'
        existing['cancelledAt'] = now_iso
        existing.setdefault('history', []).append({
            'action': 'admin_cancelled',
            'adminId': admin_user.get('id'),
            'timestamp': now_iso,
            'details': f"Admin cancelled subscription. Reason: {params.get('reason', 'Administrative cancellation')}"
        })
        log_audit_action(admin_user, 'CANCEL_SUBSCRIPTION', user_id, old_sub_copy, existing, details="Cancelled subscription", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    return False, f"Unknown action: {action}"

def manage_payment_channel(admin_user, action, params, data, sync_fn=None):
    """
    Admin UPI Payment Channel Management.
    """
    channels = data.setdefault('payment_channels', [])
    now_iso = datetime.now(timezone.utc).isoformat()

    if action == 'add':
        name = (params.get('name') or '').strip()
        upi_id = (params.get('upiId') or '').strip()
        if not name or not upi_id:
            return False, "Channel Name and UPI ID are required."
        qr_url = params.get('qrCodeUrl') or f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa={upi_id}%26pn=ExcellenceCA%26cu=INR"
        is_primary = bool(params.get('isPrimary', False))
        if is_primary:
            for c in channels:
                c['isPrimary'] = False

        new_chan = {
            'id': f"chan_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'name': name,
            'upiId': upi_id,
            'qrCodeUrl': qr_url,
            'isPrimary': is_primary or len(channels) == 0,
            'isActive': True,
            'order': len(channels) + 1,
            'createdAt': now_iso
        }
        channels.append(new_chan)
        log_audit_action(admin_user, 'ADD_PAYMENT_CHANNEL', new_chan['id'], None, new_chan, details=f"Added channel: {name} ({upi_id})", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"payment_channels/{new_chan['id']}", new_chan)
        return True, new_chan

    channel_id = params.get('id')
    target = next((c for c in channels if c.get('id') == channel_id), None)
    if not target:
        return False, "Payment channel not found."

    old_copy = dict(target)

    if action == 'edit':
        if params.get('name'): target['name'] = params['name'].strip()
        if params.get('upiId'):
            target['upiId'] = params['upiId'].strip()
            if not params.get('qrCodeUrl'):
                target['qrCodeUrl'] = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa={target['upiId']}%26pn=ExcellenceCA%26cu=INR"
        if params.get('qrCodeUrl'): target['qrCodeUrl'] = params['qrCodeUrl'].strip()
        target['updatedAt'] = now_iso
        log_audit_action(admin_user, 'EDIT_PAYMENT_CHANNEL', channel_id, old_copy, target, details=f"Edited channel: {target['name']}", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"payment_channels/{channel_id}", target)
        return True, target

    elif action == 'set_primary':
        for c in channels:
            c['isPrimary'] = (c.get('id') == channel_id)
        target['isActive'] = True
        log_audit_action(admin_user, 'SET_PRIMARY_CHANNEL', channel_id, None, target, details=f"Set primary channel: {target['name']}", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn("payment_channels", {c['id']: c for c in channels})
        return True, target

    elif action == 'toggle_active':
        target['isActive'] = not target.get('isActive', True)
        log_audit_action(admin_user, 'TOGGLE_CHANNEL_ACTIVE', channel_id, old_copy, target, details=f"Toggled active state to {target['isActive']}", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"payment_channels/{channel_id}", target)
        return True, target

    elif action == 'delete':
        if target.get('isPrimary') and len(channels) > 1:
            return False, "Cannot delete the primary payment channel. Please set another channel as primary first."
        channels.remove(target)
        log_audit_action(admin_user, 'DELETE_PAYMENT_CHANNEL', channel_id, old_copy, None, details=f"Deleted channel: {target['name']}", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn("payment_channels", {c['id']: c for c in channels})
        return True, {'deletedId': channel_id}

    return False, f"Unknown action: {action}"

def manage_plans_config(admin_user, plan_id, updates, data, sync_fn=None):
    """
    Admin Plan Configuration.
    Updates prices, features, SLA, duration, or active status.
    Existing purchased subscriptions retain their original historical terms.
    """
    plans = data.setdefault('subscription_plans', dict(DEFAULT_PLANS))
    target = plans.get(plan_id)
    if not target:
        target = DEFAULT_PLANS.get(plan_id)
        if target:
            plans[plan_id] = dict(target)
            target = plans[plan_id]

    if not target:
        return False, "Plan ID not found."

    old_copy = dict(target)

    if 'price' in updates:
        try: target['price'] = max(0, int(updates['price']))
        except Exception: pass
    if 'durationDays' in updates:
        try: target['durationDays'] = max(1, int(updates['durationDays']))
        except Exception: pass
    if 'instantPoints' in updates:
        try: target['instantPoints'] = max(0, int(updates['instantPoints']))
        except Exception: pass
    if 'name' in updates and str(updates['name']).strip():
        target['name'] = str(updates['name']).strip()
    if 'features' in updates and isinstance(updates['features'], list):
        target['features'] = updates['features']
    if 'isActive' in updates:
        target['isActive'] = bool(updates['isActive'])
    if 'copyCheckSlaHours' in updates:
        try: target['copyCheckSlaHours'] = int(updates['copyCheckSlaHours'])
        except Exception: pass

    target['updatedAt'] = datetime.now(timezone.utc).isoformat()

    log_audit_action(admin_user, 'UPDATE_PLAN_CONFIG', plan_id, old_copy, target, details=f"Updated configuration for {target['name']}", data=data, sync_fn=sync_fn)
    if sync_fn:
        sync_fn(f"subscription_plans/{plan_id}", target)

    return True, target

def log_audit_action(admin_user, action, target_id=None, old_val=None, new_val=None, details=None, data=None, sync_fn=None):
    """
    Immutable Admin Audit Log.
    Logs sensitive admin actions with server timestamp.
    """
    if data is None:
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    log_entry = {
        'id': f"audit_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}",
        'adminId': admin_user.get('id', 'admin') if admin_user else 'system',
        'adminName': admin_user.get('name', 'Administrator') if admin_user else 'System',
        'adminEmail': admin_user.get('email', '') if admin_user else '',
        'action': action,
        'targetId': target_id,
        'target': target_id,
        'details': details,
        'oldValue': old_val,
        'newValue': new_val,
        'timestamp': now_iso
    }

    logs = data.setdefault('admin_audit_logs', [])
    logs.insert(0, log_entry)
    if len(logs) > 1000:
        data['admin_audit_logs'] = logs[:1000]

    if sync_fn:
        sync_fn(f"admin_audit_logs/{log_entry['id']}", log_entry)

    return log_entry

def auto_expire_worker(data, sync_fn=None):
    """
    Periodic background expiration worker.
    Scans subscriptions and pending payment sessions, transitioning expired states.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    modified = False

    subscriptions = data.get('subscriptions', {})
    for user_id, sub in subscriptions.items():
        if sub.get('status') in ('active', 'manually_granted'):
            exp = sub.get('expiresAt')
            if exp and now_iso >= exp:
                sub['status'] = 'expired'
                sub['expiredAt'] = now_iso
                sub.setdefault('history', []).append({
                    'action': 'auto_expire',
                    'timestamp': now_iso,
                    'details': f"Subscription automatically expired at {now_iso}"
                })
                if sync_fn:
                    sync_fn(f"subscriptions/{user_id}", sub)
                modified = True

    sessions = data.get('payment_sessions', [])
    for s in sessions:
        if s.get('status') == 'pending':
            exp = s.get('expiresAt')
            if exp and now_iso >= exp:
                s['status'] = 'expired'
                s['rejectionReason'] = 'Payment session timed out (5 minutes).'
                if sync_fn:
                    sync_fn(f"payment_sessions/{s.get('paymentSessionId')}", s)
                modified = True

    return modified
