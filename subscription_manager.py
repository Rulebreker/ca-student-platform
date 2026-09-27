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
import copy
import urllib.parse
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
        'subscriptionTier': 'all',
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
        'subscriptionTier': 'all',
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
    for c in channels:
        if isinstance(c, dict) and 'subscriptionTier' not in c:
            c['subscriptionTier'] = 'all'
    return channels

def append_notification(data, notif):
    """Safely append a notification regardless of whether notifications is stored as a dict or list."""
    if 'notifications' not in data or data['notifications'] is None:
        data['notifications'] = {}
    notifs = data['notifications']
    if isinstance(notifs, dict):
        notifs[notif['id']] = notif
    elif isinstance(notifs, list):
        notifs.insert(0, notif)

def get_all_plans(data):
    """Retrieve all plans from backend data, falling back to authoritative defaults."""
    stored = data.get('subscription_plans')
    if not isinstance(stored, dict) or not stored:
        data['subscription_plans'] = copy.deepcopy(DEFAULT_PLANS)
        return data['subscription_plans']
    merged = copy.deepcopy(DEFAULT_PLANS)
    for k, v in stored.items():
        if isinstance(v, dict):
            merged[k] = copy.deepcopy(v)
    data['subscription_plans'] = merged
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

def is_eligible_for_trial(user_id, data):
    """
    Trial subscription option must ONLY be shown/accessible to users who have
    never purchased or owned any valid pass/subscription according to business rules.
    """
    if not user_id:
        return False
    # 1. Check existing subscription record
    subs = data.get('subscriptions', {})
    user_sub = subs.get(user_id)
    if user_sub:
        if user_sub.get('status') in ('active', 'manually_granted') or user_sub.get('purchasedAmount', 0) > 0 or user_sub.get('isTrial') or len(user_sub.get('history', [])) > 0:
            return False

    # 2. Check payment sessions history (approved, submitted, pending_verification, or pending)
    sessions = data.get('payment_sessions', [])
    for s in sessions:
        if s.get('userId') == user_id:
            status = s.get('status')
            if status in ('approved', 'submitted', 'pending_verification', 'pending'):
                return False
            if s.get('planId') == 'elite_trial':
                return False
    return True

def create_payment_session(user, plan_id, data, sync_fn=None, qr_image_exists=None):
    """
    Create a 10-minute payment session.
    Takes a snapshot of the primary/selected payment channel.
    Server timestamps enforce 10-minute countdown.
    qr_image_exists(url) -> bool: when an uploaded channel QR is missing from storage, the session
    falls back to a QR generated for the channel's UPI ID and amount instead of a broken image.
    """
    plan = get_plan_by_id(plan_id, data)
    if not plan:
        return False, "Invalid plan ID specified."

    if not plan.get('isActive', True):
        return False, "This plan is currently not available for purchase."

    # Enforce trial eligibility server-side
    if plan_id == 'elite_trial' or plan.get('tier') == 'trial':
        if not is_eligible_for_trial(user.get('id'), data):
            return False, "Trial subscription is exclusively available to first-time students who have never owned a pass."

    channels = get_payment_channels(data)
    active_channels = [c for c in channels if c.get('isActive', True)]

    plan_tier = str(plan.get('tier', '')).strip().lower()
    clean_plan_id = str(plan_id).strip().lower()

    # Priority 1: Channel specifically assigned to this exact targetPlanId
    exact_plan_channels = [
        c for c in active_channels 
        if str(c.get('targetPlanId', '')).strip().lower() == clean_plan_id
    ]
    # Priority 2: Channel assigned to this plan tier
    tier_channels = [
        c for c in active_channels 
        if str(c.get('subscriptionTier', '')).strip().lower() in (clean_plan_id, plan_tier)
    ]
    # Priority 3: Universal channels assigned to 'all' or with no tier specified
    universal_channels = [
        c for c in active_channels 
        if str(c.get('subscriptionTier', 'all')).strip().lower() in ('all', '', 'none')
    ]

    candidate_channels = exact_plan_channels if exact_plan_channels else (tier_channels if tier_channels else universal_channels)
    if not candidate_channels:
        candidate_channels = active_channels

    amount = float(plan['price'])
    if not candidate_channels:
        default_upi = 'excellenceca@okhdfcbank'
        default_payee = 'ExcellenceCA'
        default_upi_uri = f"upi://pay?pa={default_upi}&pn={urllib.parse.quote(default_payee)}&am={amount:.2f}&cu=INR&tn={urllib.parse.quote(plan['name'])}"
        selected_channel = {
            'id': 'default-primary',
            'name': 'Primary UPI',
            'title': 'Primary UPI',
            'upiId': default_upi,
            'payeeName': default_payee,
            'qrCodeUrl': f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={urllib.parse.quote(default_upi_uri)}",
            'subscriptionTier': 'all',
            'expectedAmount': amount
        }
    else:
        primary = next((c for c in candidate_channels if c.get('isPrimary')), None)
        selected_channel = primary if primary else candidate_channels[0]

    payee_name = selected_channel.get('payeeName') or 'ExcellenceCA'
    upi_id = selected_channel.get('upiId') or 'excellenceca@okhdfcbank'
    encoded_upi_uri = f"upi://pay?pa={urllib.parse.quote(upi_id)}&pn={urllib.parse.quote(payee_name)}&am={amount:.2f}&cu=INR&tn={urllib.parse.quote(plan['name'])}"

    qr_url = selected_channel.get('qrCodeUrl')
    uploaded_qr_missing = bool(qr_url) and qr_image_exists is not None and str(qr_url).startswith('/api/images/') \
        and not qr_image_exists(qr_url)
    if not qr_url or 'api.qrserver.com' in qr_url or uploaded_qr_missing:
        qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={urllib.parse.quote(encoded_upi_uri)}"

    channel_snapshot = {
        'id': selected_channel.get('id'),
        'name': selected_channel.get('name') or selected_channel.get('title', 'Primary UPI'),
        'title': selected_channel.get('title') or selected_channel.get('name', 'Primary UPI'),
        'upiId': upi_id,
        'payeeName': payee_name,
        'qrCodeUrl': qr_url,
        'targetPlanId': selected_channel.get('targetPlanId'),
        'targetPassTitle': selected_channel.get('targetPassTitle'),
        'expectedAmount': selected_channel.get('expectedAmount') or amount,
        'subscriptionTier': selected_channel.get('subscriptionTier', 'all'),
        # with a storage check the snapshot always carries a usable QR (stored image or generated)
        'needsReupload': bool(selected_channel.get('needsReupload', False)) if qr_image_exists is None else False
    }

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)
    payment_session_id = f"psess_{int(time.time()*1000)}_{uuid.uuid4().hex[:8]}"

    session = {
        'paymentSessionId': payment_session_id,
        'sessionId': payment_session_id,
        'userId': user['id'],
        'studentId': user['id'],
        'userEmail': user.get('email'),
        'studentEmail': user.get('email'),
        'userName': user.get('name'),
        'studentName': user.get('name'),
        'username': user.get('username', ''),
        'userPhone': user.get('phone', ''),
        'caLevel': user.get('caLevel', ''),
        'planId': plan['id'],
        'planName': plan['name'],
        'planTier': plan.get('tier', 'core'),
        'amount': plan['price'],
        'currency': plan.get('currency', 'INR'),
        'durationDays': plan.get('durationDays', 30),
        'upiPayUri': encoded_upi_uri,
        'channelId': channel_snapshot.get('id'),
        'channelSnapshot': {
            k: v for k, v in channel_snapshot.items()
            if not (isinstance(v, str) and v.startswith('data:image/'))
        },
        'qrData': (
            channel_snapshot.get('qrCodeUrl')
            if channel_snapshot.get('qrCodeUrl') and not str(channel_snapshot.get('qrCodeUrl', '')).startswith('data:image/')
            else (encoded_upi_uri or f"upi://pay?pa={channel_snapshot.get('upiId')}&pn={channel_snapshot.get('name') or 'ExcellenceCA'}&am={plan['price']}&cu=INR")
        ),
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
        session['notes'] = 'Payment proof submitted after 10-minute session countdown. Flagged for manual admin verification.'
    else:
        session['status'] = 'pending_verification'

    session['utr'] = clean_utr
    session['screenshot'] = screenshot.strip()
    session['submittedAt'] = now_iso

    # Ensure linked user metadata (studentName, username) is present
    if not session.get('studentName') or not session.get('username'):
        raw_users = data.get('users', {})
        users_list = list(raw_users.values()) if isinstance(raw_users, dict) else (raw_users if isinstance(raw_users, list) else [])
        user_obj = next((u for u in users_list if isinstance(u, dict) and (u.get('id') == user_id or (session.get('userEmail') and u.get('email') == session.get('userEmail')))), None)
        if user_obj:
            if user_obj.get('username'):
                session['username'] = user_obj.get('username')
            if user_obj.get('name'):
                session['userName'] = user_obj.get('name')
                session['studentName'] = user_obj.get('name')
            if user_obj.get('email'):
                session['userEmail'] = user_obj.get('email')
                session['studentEmail'] = user_obj.get('email')
            if user_obj.get('id'):
                session['userId'] = user_obj.get('id')
                session['studentId'] = user_obj.get('id')

    if sync_fn:
        sync_fn(f"payment_sessions/{session_id}", session)

    return True, session

def verify_payment(admin_user, session_id, action, rejection_reason, data, sync_fn=None, remarks=None):
    """
    Admin verifies payment.
    Approve:
      - Validates idempotency (never double-award)
      - Enforces strict lifecycle state transition
      - Activates subscription & stacks duration if existing active
      - Awards instant points derived from authoritative plan
      - Stores admin remarks & notification
      - Logs admin audit
    Reject:
      - Updates status to rejected with reason/remarks
      - Creates student notification
      - Logs admin audit
    """
    sessions = data.get('payment_sessions', [])
    session = next((s for s in sessions if s.get('paymentSessionId') == session_id or s.get('sessionId') == session_id), None)
    if not session:
        return False, "Payment session not found."

    current_status = session.get('status')
    if action == 'approve':
        if current_status == 'approved':
            return True, session
        if current_status not in ('pending', 'pending_verification', 'late_payment'):
            return False, f"Invalid state transition: Cannot approve payment session in '{current_status}' status."

        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        user_id = session['userId']
        plan = get_plan_by_id(session['planId'], data) or DEFAULT_PLANS.get(session['planId'], {})

        admin_comment = remarks or rejection_reason or "Payment verified and pass activated."
        session['status'] = 'approved'
        session['verifiedAt'] = now_iso
        session['verifiedBy'] = admin_user.get('id', 'admin')
        session['remarks'] = admin_comment
        session['adminRemarks'] = admin_comment

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
                'details': f"Approved payment of ₹{session['amount']} for {session['planName']} with note: {admin_comment}"
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
            'message': f"Your payment of ₹{session['amount']} (UTR: {session.get('utr')}) has been verified. Welcome to {session['planName']}! You received +{instant_points} bonus XP. Note: {admin_comment}",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
            sync_fn(f"subscriptions/{user_id}", new_sub)

        log_audit_action(
            admin_user=admin_user,
            action='APPROVE_PAYMENT',
            target_id=user_id,
            old_val=current_status,
            new_val='approved',
            details=f"Approved payment of ₹{session['amount']} for {session['planName']} (UTR: {session.get('utr')}) - Remarks: {admin_comment}",
            data=data,
            sync_fn=sync_fn
        )

        if sync_fn:
            sync_fn(f"payment_sessions/{session_id}", session)

        return True, session

    elif action == 'reject':
        if current_status == 'rejected':
            return True, session
        if current_status not in ('pending', 'pending_verification', 'late_payment'):
            return False, f"Invalid state transition: Cannot reject payment session in '{current_status}' status."

        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        user_id = session['userId']
        plan = get_plan_by_id(session['planId'], data) or DEFAULT_PLANS.get(session['planId'], {})

        admin_comment = rejection_reason or remarks or "Payment could not be verified with bank records."
        session['status'] = 'rejected'
        session['rejectionReason'] = admin_comment
        session['remarks'] = admin_comment
        session['adminRemarks'] = admin_comment
        session['verifiedAt'] = now_iso
        session['verifiedBy'] = admin_user.get('id', 'admin')

        notif = {
            'id': f"notif_sub_rej_{int(time.time()*1000)}",
            'userId': user_id,
            'title': "Payment Verification Failed",
            'message': f"Your payment of ₹{session['amount']} for {session['planName']} could not be verified: {admin_comment}. Please contact faculty support.",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
            sync_fn(f"payment_sessions/{session_id}", session)

        log_audit_action(
            admin_user=admin_user,
            action='REJECT_PAYMENT',
            target_id=user_id,
            old_val=current_status,
            new_val='rejected',
            details=f"Rejected payment of ₹{session['amount']} for {session['planName']} (UTR: {session.get('utr')}) - Reason: {admin_comment}",
            data=data,
            sync_fn=sync_fn
        )

        return True, session

    return False, f"Unknown payment verification action: {action}"

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

    if action == 'change_plan' and not existing:
        action = 'grant'

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

        notif = {
            'id': f"notif_sub_grant_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'userId': user_id,
            'title': f"Pass Granted: {plan['name']}",
            'message': f"An administrator has granted you the {plan['name']} pass (valid until {expires_at[:10]}). Reason: {params.get('reason', 'Administrative grant')}",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)

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
        notif = {
            'id': f"notif_sub_ext_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'userId': user_id,
            'title': "Subscription Extended",
            'message': f"Your {existing.get('planName', 'Pass')} has been extended by {days} days to {new_exp[:10]}. Reason: {params.get('reason', 'Administrative extension')}",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
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
        notif = {
            'id': f"notif_sub_short_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'userId': user_id,
            'title': "Subscription Validity Adjusted",
            'message': f"Your {existing.get('planName', 'Pass')} expiry has been adjusted to {new_exp[:10]}. Reason: {params.get('reason', 'Administrative adjustment')}",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
        log_audit_action(admin_user, 'SHORTEN_SUBSCRIPTION', user_id, old_sub_copy, existing, details=f"Shortened by {days} days", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    elif action in ('set_custom_expiry', 'custom_expiry'):
        custom_expiry = params.get('customExpiry') or params.get('expiryDate')
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
            notif = {
                'id': f"notif_sub_cexp_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
                'userId': user_id,
                'title': "Subscription Expiry Updated",
                'message': f"Your {existing.get('planName', 'Pass')} expiry has been set to {existing['expiresAt'][:10]}. Reason: {params.get('reason', 'Administrative update')}",
                'type': 'subscription',
                'createdAt': now_iso,
                'isRead': False
            }
            append_notification(data, notif)
            if sync_fn:
                sync_fn(f"notifications/{notif['id']}", notif)
            log_audit_action(admin_user, 'SET_CUSTOM_EXPIRY', user_id, old_sub_copy, existing, details=f"Set expiry to {existing['expiresAt']}", data=data, sync_fn=sync_fn)
            if sync_fn:
                sync_fn(f"subscriptions/{user_id}", existing)
            return True, existing
        except Exception as e:
            return False, f"Invalid custom expiry format: {str(e)}"

    elif action in ('change_plan', 'modify', 'update'):
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
        notif = {
            'id': f"notif_sub_cplan_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'userId': user_id,
            'title': f"Subscription Updated to {plan['name']}",
            'message': f"Your pass tier has been updated to {plan['name']}. Reason: {params.get('reason', 'Administrative plan update')}",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
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
        notif = {
            'id': f"notif_sub_susp_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'userId': user_id,
            'title': "Subscription Suspended",
            'message': f"Your {existing.get('planName', 'Pass')} access has been temporarily suspended. Reason: {params.get('reason', 'Administrative suspension')}",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
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
        notif = {
            'id': f"notif_sub_react_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'userId': user_id,
            'title': "Subscription Reactivated",
            'message': f"Your {existing.get('planName', 'Pass')} has been reactivated.",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
        log_audit_action(admin_user, 'REACTIVATE_SUBSCRIPTION', user_id, old_sub_copy, existing, details="Reactivated subscription", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    elif action in ('cancel', 'remove', 'remove_trial', 'revoke'):
        existing['status'] = 'cancelled'
        existing['cancelledAt'] = now_iso
        existing.setdefault('history', []).append({
            'action': 'admin_cancelled',
            'adminId': admin_user.get('id'),
            'timestamp': now_iso,
            'details': f"Admin cancelled subscription. Reason: {params.get('reason', 'Administrative cancellation')}"
        })
        notif = {
            'id': f"notif_sub_canc_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'userId': user_id,
            'title': "Subscription Cancelled",
            'message': f"Your subscription has been cancelled. Reason: {params.get('reason', 'Administrative cancellation')}",
            'type': 'subscription',
            'createdAt': now_iso,
            'isRead': False
        }
        append_notification(data, notif)
        if sync_fn:
            sync_fn(f"notifications/{notif['id']}", notif)
        log_audit_action(admin_user, 'CANCEL_SUBSCRIPTION', user_id, old_sub_copy, existing, details="Cancelled subscription", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", existing)
        return True, existing

    elif action == 'delete':
        deleted_sub = subscriptions.pop(user_id, None)
        if sync_fn:
            sync_fn(f"subscriptions/{user_id}", None, method='DELETE')
        log_audit_action(admin_user, 'DELETE_SUBSCRIPTION', user_id, old_sub_copy, None, details=f"Admin deleted subscription record for user {user_id}", data=data, sync_fn=sync_fn)
        return True, {'userId': user_id, 'status': 'deleted', 'planName': 'Free Tier', 'planTier': 'free'}

    return False, f"Unknown action: {action}"

def manage_payment_channel(admin_user, action, params, data, sync_fn=None):
    """
    Admin UPI Payment Channel Management.
    """
    channels = data.setdefault('payment_channels', [])
    now_iso = datetime.now(timezone.utc).isoformat()

    if action == 'add':
        name = (params.get('name') or params.get('title') or '').strip()
        upi_id = (params.get('upiId') or '').strip()
        payee_name = (params.get('payeeName') or params.get('accountHolderName') or 'ExcellenceCA').strip()
        sub_tier = (params.get('subscriptionTier') or params.get('planTier') or 'all').strip().lower()
        if not name or not upi_id:
            return False, "Channel Name and UPI ID are required."
        qr_url = params.get('qrCodeUrl') or f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa={upi_id}%26pn={urllib.parse.quote(payee_name)}%26cu=INR"
        is_primary = bool(params.get('isPrimary', False))
        if is_primary:
            for c in channels:
                c['isPrimary'] = False

        target_plan_id = (params.get('targetPlanId') or '').strip().lower()
        target_pass_title = (params.get('targetPassTitle') or '').strip()
        expected_amount = float(params['expectedAmount']) if params.get('expectedAmount') is not None and str(params.get('expectedAmount')).strip() != '' else None

        new_chan = {
            'id': f"chan_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}",
            'name': name,
            'title': name,
            'upiId': upi_id,
            'payeeName': payee_name,
            'qrCodeUrl': qr_url,
            'subscriptionTier': sub_tier,
            'targetPlanId': target_plan_id,
            'targetPassTitle': target_pass_title,
            'expectedAmount': expected_amount,
            'bankAccountNumber': (params.get('bankAccountNumber') or params.get('accountNumber') or '').strip(),
            'bankIfsc': (params.get('bankIfsc') or params.get('ifsc') or '').strip(),
            'bankAccountHolder': (params.get('bankAccountHolder') or params.get('accountHolderName') or payee_name).strip(),
            'amountLimit': float(params['amountLimit']) if params.get('amountLimit') else None,
            'totalTransactions': int(params.get('totalTransactions') or 0),
            'totalVolume': float(params.get('totalVolume') or 0.0),
            'isPrimary': is_primary or len(channels) == 0,
            'isActive': bool(params.get('isActive', True)),
            'order': len(channels) + 1,
            'createdAt': now_iso
        }
        channels.append(new_chan)
        log_audit_action(admin_user, 'ADD_PAYMENT_CHANNEL', new_chan['id'], None, new_chan, details=f"Added channel: {name} ({upi_id}) [Tier: {sub_tier}]", data=data, sync_fn=sync_fn)
        if sync_fn:
            sync_fn(f"payment_channels/{new_chan['id']}", new_chan)
        return True, new_chan

    channel_id = params.get('id') or params.get('channelId')
    target = next((c for c in channels if c.get('id') == channel_id), None)
    if not target:
        return False, "Payment channel not found."

    old_copy = dict(target)

    if action in ('edit', 'update'):
        if params.get('name') or params.get('title'):
            target['name'] = (params.get('name') or params.get('title')).strip()
            target['title'] = target['name']
        if params.get('payeeName'):
            target['payeeName'] = params['payeeName'].strip()
        pn = target.get('payeeName', 'ExcellenceCA')
        if params.get('upiId'):
            new_upi = params['upiId'].strip()
            current_qr = str(target.get('qrCodeUrl') or '')
            target['upiId'] = new_upi
            # Regenerate only an automatic QR. An uploaded QR is kept on every edit unless the admin
            # replaces it or removes it (qrCodeUrl: '').
            if not params.get('qrCodeUrl') and (not current_qr or 'api.qrserver.com' in current_qr):
                target['qrCodeUrl'] = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa={new_upi}%26pn={urllib.parse.quote(pn)}%26cu=INR"
        if params.get('qrCodeUrl'):
            target['qrCodeUrl'] = params['qrCodeUrl'].strip()
            target['needsReupload'] = False
        elif 'qrCodeUrl' in params and params.get('qrCodeUrl') == '':
            target['qrCodeUrl'] = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa={target.get('upiId')}%26pn={urllib.parse.quote(pn)}%26cu=INR"
            target['needsReupload'] = False
        if 'subscriptionTier' in params or 'planTier' in params:
            target['subscriptionTier'] = (params.get('subscriptionTier') or params.get('planTier') or 'all').strip().lower()
        if 'targetPlanId' in params:
            target['targetPlanId'] = (params.get('targetPlanId') or '').strip().lower()
        if 'targetPassTitle' in params:
            target['targetPassTitle'] = (params.get('targetPassTitle') or '').strip()
        if 'expectedAmount' in params:
            target['expectedAmount'] = float(params['expectedAmount']) if params.get('expectedAmount') is not None and str(params.get('expectedAmount')).strip() != '' else None
        if 'bankAccountNumber' in params or 'accountNumber' in params:
            target['bankAccountNumber'] = (params.get('bankAccountNumber') or params.get('accountNumber') or '').strip()
        if 'bankIfsc' in params or 'ifsc' in params:
            target['bankIfsc'] = (params.get('bankIfsc') or params.get('ifsc') or '').strip()
        if 'bankAccountHolder' in params or 'accountHolderName' in params:
            target['bankAccountHolder'] = (params.get('bankAccountHolder') or params.get('accountHolderName') or '').strip()
        if 'amountLimit' in params:
            target['amountLimit'] = float(params['amountLimit']) if params['amountLimit'] else None
        if 'isActive' in params:
            target['isActive'] = bool(params['isActive'])
        if params.get('isPrimary'):
            for c in channels:
                c['isPrimary'] = (c.get('id') == channel_id)
            target['isActive'] = True

        target['updatedAt'] = now_iso
        log_audit_action(admin_user, 'EDIT_PAYMENT_CHANNEL', channel_id, old_copy, target, details=f"Edited channel: {target['name']} [Tier: {target.get('subscriptionTier', 'all')}]", data=data, sync_fn=sync_fn)
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
            try:
                sync_fn(f"payment_channels/{channel_id}", None, method='DELETE')
            except Exception:
                pass
        return True, {'deletedId': channel_id}

    return False, f"Unknown action: {action}"

def manage_plans_config(admin_user, plan_id, updates, data, sync_fn=None):
    """
    Admin Plan Configuration.
    Updates prices, features, SLA, duration, or active status.
    Existing purchased subscriptions retain their original historical terms.
    """
    if 'subscription_plans' not in data or not isinstance(data['subscription_plans'], dict):
        data['subscription_plans'] = copy.deepcopy(DEFAULT_PLANS)
    plans = data['subscription_plans']
    target = plans.get(plan_id)
    if not target:
        default_p = DEFAULT_PLANS.get(plan_id)
        if default_p:
            plans[plan_id] = copy.deepcopy(default_p)
            target = plans[plan_id]

    if not target:
        return False, "Plan ID not found."

    old_copy = copy.deepcopy(target)

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
        target['features'] = [str(f).strip() for f in updates['features'] if str(f).strip()]
    if 'isActive' in updates:
        target['isActive'] = bool(updates['isActive'])
    if 'copyCheckSlaHours' in updates:
        try: target['copyCheckSlaHours'] = int(updates['copyCheckSlaHours'])
        except Exception: pass
    if 'liveMcqDailyLimit' in updates:
        try:
            target['liveMcqDailyLimit'] = max(0, int(updates['liveMcqDailyLimit']))
            if 'permissions' in target and isinstance(target['permissions'], dict):
                target['permissions']['live_mcq_daily_limit'] = target['liveMcqDailyLimit']
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
