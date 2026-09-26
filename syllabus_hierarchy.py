"""
ExcellenceCA Canonical Syllabus Hierarchy
Provides canonical IDs, names, and chapter structures for:
- CA Foundation
- CA Intermediate
- CA Final
"""

import re
import time
from typing import Dict, Any, List, Optional

EXAM_LEVELS = [
    {
        'id': 'foundation',
        'name': 'CA Foundation',
        'code': 'FND',
        'description': 'Entry level certification for Chartered Accountancy'
    },
    {
        'id': 'intermediate',
        'name': 'CA Intermediate',
        'code': 'INTER',
        'description': 'Second stage comprising Group 1 and Group 2'
    },
    {
        'id': 'final',
        'name': 'CA Final',
        'code': 'FINAL',
        'description': 'Final examination stage of Chartered Accountancy'
    }
]

CANONICAL_SUBJECTS = [
    # ----------------------------------------------------
    # CA Foundation
    # ----------------------------------------------------
    {
        'id': 'sub-1',
        'code': 'PAPER-1',
        'name': 'Accounting',
        'level': 'CA Foundation',
        'levelId': 'foundation',
        'icon': 'calculator',
        'chapters': [
            {'id': 'ch-fnd-acc-1', 'number': 1, 'name': 'Theoretical Framework'},
            {'id': 'ch-fnd-acc-2', 'number': 2, 'name': 'Accounting Process'},
            {'id': 'ch-fnd-acc-3', 'number': 3, 'name': 'Bank Reconciliation Statement (BRS)'},
            {'id': 'ch-fnd-acc-4', 'number': 4, 'name': 'Inventories'},
            {'id': 'ch-fnd-acc-5', 'number': 5, 'name': 'Depreciation and Amortisation'},
            {'id': 'ch-fnd-acc-6', 'number': 6, 'name': 'Bills of Exchange and Promissory Notes'},
            {'id': 'ch-fnd-acc-7', 'number': 7, 'name': 'Preparation of Final Accounts of Sole Proprietors'},
            {'id': 'ch-fnd-acc-8', 'number': 8, 'name': 'Financial Statements of Not-for-Profit Organisations (NPO)'},
            {'id': 'ch-fnd-acc-9', 'number': 9, 'name': 'Accounts from Incomplete Records (Single Entry)'},
            {'id': 'ch-fnd-acc-10', 'number': 10, 'name': 'Partnership and LLP Accounts'},
            {'id': 'ch-fnd-acc-11', 'number': 11, 'name': 'Company Accounts'}
        ]
    },
    {
        'id': 'sub-2',
        'code': 'PAPER-2',
        'name': 'Business Law',
        'level': 'CA Foundation',
        'levelId': 'foundation',
        'icon': 'scale',
        'chapters': [
            {'id': 'ch-fnd-law-1', 'number': 1, 'name': 'Indian Regulatory Framework'},
            {'id': 'ch-fnd-law-2', 'number': 2, 'name': 'The Indian Contract Act, 1872'},
            {'id': 'ch-fnd-law-3', 'number': 3, 'name': 'The Sale of Goods Act, 1930'},
            {'id': 'ch-fnd-law-4', 'number': 4, 'name': 'The Indian Partnership Act, 1932'},
            {'id': 'ch-fnd-law-5', 'number': 5, 'name': 'The Limited Liability Partnership Act, 2008'},
            {'id': 'ch-fnd-law-6', 'number': 6, 'name': 'The Companies Act, 2013'},
            {'id': 'ch-fnd-law-7', 'number': 7, 'name': 'The Negotiable Instruments Act, 1881'}
        ]
    },
    {
        'id': 'sub-3',
        'code': 'PAPER-3',
        'name': 'Business Economics',
        'level': 'CA Foundation',
        'levelId': 'foundation',
        'icon': 'trending-up',
        'chapters': [
            {'id': 'ch-fnd-eco-1', 'number': 1, 'name': 'Introduction to Business Economics'},
            {'id': 'ch-fnd-eco-2', 'number': 2, 'name': 'Theory of Demand and Supply'},
            {'id': 'ch-fnd-eco-3', 'number': 3, 'name': 'Theory of Production and Cost'},
            {'id': 'ch-fnd-eco-4', 'number': 4, 'name': 'Price Determination in Different Markets'},
            {'id': 'ch-fnd-eco-5', 'number': 5, 'name': 'Determination of National Income'},
            {'id': 'ch-fnd-eco-6', 'number': 6, 'name': 'Business Cycles'},
            {'id': 'ch-fnd-eco-7', 'number': 7, 'name': 'Public Finance'},
            {'id': 'ch-fnd-eco-8', 'number': 8, 'name': 'Money Market'},
            {'id': 'ch-fnd-eco-9', 'number': 9, 'name': 'International Trade'},
            {'id': 'ch-fnd-eco-10', 'number': 10, 'name': 'Indian Economy'}
        ]
    },
    {
        'id': 'sub-4',
        'code': 'PAPER-4',
        'name': 'Quantitative Aptitude',
        'level': 'CA Foundation',
        'levelId': 'foundation',
        'icon': 'bar-chart-2',
        'chapters': [
            {'id': 'ch-fnd-qa-1', 'number': 1, 'name': 'Ratio, Proportion, Indices and Logarithms'},
            {'id': 'ch-fnd-qa-2', 'number': 2, 'name': 'Equations'},
            {'id': 'ch-fnd-qa-3', 'number': 3, 'name': 'Linear Inequalities'},
            {'id': 'ch-fnd-qa-4', 'number': 4, 'name': 'Mathematics of Finance'},
            {'id': 'ch-fnd-qa-5', 'number': 5, 'name': 'Permutations and Combinations'},
            {'id': 'ch-fnd-qa-6', 'number': 6, 'name': 'Sequence and Series (AP, GP)'},
            {'id': 'ch-fnd-qa-7', 'number': 7, 'name': 'Sets, Relations and Functions'},
            {'id': 'ch-fnd-qa-8', 'number': 8, 'name': 'Basic Applications of Calculus'},
            {'id': 'ch-fnd-qa-9', 'number': 9, 'name': 'Statistical Representation of Data'},
            {'id': 'ch-fnd-qa-10', 'number': 10, 'name': 'Measures of Central Tendency and Dispersion'},
            {'id': 'ch-fnd-qa-11', 'number': 11, 'name': 'Probability'},
            {'id': 'ch-fnd-qa-12', 'number': 12, 'name': 'Theoretical Distributions'},
            {'id': 'ch-fnd-qa-13', 'number': 13, 'name': 'Correlation and Regression'},
            {'id': 'ch-fnd-qa-14', 'number': 14, 'name': 'Index Numbers'}
        ]
    },

    # ----------------------------------------------------
    # CA Intermediate
    # ----------------------------------------------------
    {
        'id': 'sub-inter-1',
        'code': 'INTER-P1',
        'name': 'Advanced Accounting',
        'level': 'CA Intermediate',
        'levelId': 'intermediate',
        'icon': 'calculator',
        'chapters': [
            {'id': 'ch-int-acc-1', 'number': 1, 'name': 'Introduction to Accounting Standards'},
            {'id': 'ch-int-acc-2', 'number': 2, 'name': 'Framework for Preparation of Financial Statements'},
            {'id': 'ch-int-acc-3', 'number': 3, 'name': 'Presentation and Disclosures Based AS'},
            {'id': 'ch-int-acc-4', 'number': 4, 'name': 'Asset Based Accounting Standards'},
            {'id': 'ch-int-acc-5', 'number': 5, 'name': 'Revenue and Expense Based AS'},
            {'id': 'ch-int-acc-6', 'number': 6, 'name': 'Accounting for Financial Instruments'},
            {'id': 'ch-int-acc-7', 'number': 7, 'name': 'Accounting for Business Combinations (Amalgamation)'},
            {'id': 'ch-int-acc-8', 'number': 8, 'name': 'Consolidated Financial Statements'},
            {'id': 'ch-int-acc-9', 'number': 9, 'name': 'Accounting for Branches Including Foreign Branches'}
        ]
    },
    {
        'id': 'sub-inter-2',
        'code': 'INTER-P2',
        'name': 'Corporate and Other Laws',
        'level': 'CA Intermediate',
        'levelId': 'intermediate',
        'icon': 'scale',
        'chapters': [
            {'id': 'ch-int-law-1', 'number': 1, 'name': 'Preliminary & Incorporation of Company'},
            {'id': 'ch-int-law-2', 'number': 2, 'name': 'Prospectus and Allotment of Securities'},
            {'id': 'ch-int-law-3', 'number': 3, 'name': 'Share Capital and Debentures'},
            {'id': 'ch-int-law-4', 'number': 4, 'name': 'Acceptance of Deposits by Companies'},
            {'id': 'ch-int-law-5', 'number': 5, 'name': 'Registration of Charges'},
            {'id': 'ch-int-law-6', 'number': 6, 'name': 'Management & Administration (General Meetings)'},
            {'id': 'ch-int-law-7', 'number': 7, 'name': 'Declaration and Payment of Dividend'},
            {'id': 'ch-int-law-8', 'number': 8, 'name': 'Accounts of Companies'},
            {'id': 'ch-int-law-9', 'number': 9, 'name': 'Audit and Auditors'},
            {'id': 'ch-int-law-10', 'number': 10, 'name': 'Companies Incorporated Outside India'},
            {'id': 'ch-int-law-11', 'number': 11, 'name': 'The Foreign Exchange Management Act, 1999 (FEMA)'},
            {'id': 'ch-int-law-12', 'number': 12, 'name': 'Interpretation of Statutes'},
            {'id': 'ch-int-law-13', 'number': 13, 'name': 'The General Clauses Act, 1897'}
        ]
    },
    {
        'id': 'sub-inter-3',
        'code': 'INTER-P3',
        'name': 'Taxation',
        'level': 'CA Intermediate',
        'levelId': 'intermediate',
        'icon': 'receipt',
        'chapters': [
            {'id': 'ch-int-tax-1', 'number': 1, 'name': 'Basic Concepts of Income Tax'},
            {'id': 'ch-int-tax-2', 'number': 2, 'name': 'Residence and Scope of Total Income'},
            {'id': 'ch-int-tax-3', 'number': 3, 'name': 'Incomes which do not form part of Total Income'},
            {'id': 'ch-int-tax-4', 'number': 4, 'name': 'Heads of Income: Salaries'},
            {'id': 'ch-int-tax-5', 'number': 5, 'name': 'Heads of Income: House Property'},
            {'id': 'ch-int-tax-6', 'number': 6, 'name': 'Heads of Income: Profits & Gains of Business/Profession (PGBP)'},
            {'id': 'ch-int-tax-7', 'number': 7, 'name': 'Heads of Income: Capital Gains'},
            {'id': 'ch-int-tax-8', 'number': 8, 'name': 'Heads of Income: Income from Other Sources'},
            {'id': 'ch-int-tax-9', 'number': 9, 'name': 'Clubbing of Income'},
            {'id': 'ch-int-tax-10', 'number': 10, 'name': 'Set-off and Carry Forward of Losses'},
            {'id': 'ch-int-tax-11', 'number': 11, 'name': 'Deductions from Gross Total Income (Chapter VI-A)'},
            {'id': 'ch-int-tax-12', 'number': 12, 'name': 'Advance Tax, TDS and TCS'},
            {'id': 'ch-int-tax-13', 'number': 13, 'name': 'Provisions for Filing Return of Income'},
            {'id': 'ch-int-tax-14', 'number': 14, 'name': 'GST in India & Supply Under GST'},
            {'id': 'ch-int-tax-15', 'number': 15, 'name': 'Charge of GST & Composition Levy'},
            {'id': 'ch-int-tax-16', 'number': 16, 'name': 'Place & Time of Supply'},
            {'id': 'ch-int-tax-17', 'number': 17, 'name': 'Value of Supply & Input Tax Credit (ITC)'},
            {'id': 'ch-int-tax-18', 'number': 18, 'name': 'Registration, Tax Invoice & Returns'}
        ]
    },
    {
        'id': 'sub-inter-4',
        'code': 'INTER-P4',
        'name': 'Cost and Management Accounting',
        'level': 'CA Intermediate',
        'levelId': 'intermediate',
        'icon': 'pie-chart',
        'chapters': [
            {'id': 'ch-int-cma-1', 'number': 1, 'name': 'Introduction to Cost and Management Accounting'},
            {'id': 'ch-int-cma-2', 'number': 2, 'name': 'Material Cost'},
            {'id': 'ch-int-cma-3', 'number': 3, 'name': 'Employee Cost and Direct Expenses'},
            {'id': 'ch-int-cma-4', 'number': 4, 'name': 'Overheads: Absorption Costing Method'},
            {'id': 'ch-int-cma-5', 'number': 5, 'name': 'Activity Based Costing (ABC)'},
            {'id': 'ch-int-cma-6', 'number': 6, 'name': 'Cost Sheet'},
            {'id': 'ch-int-cma-7', 'number': 7, 'name': 'Cost Accounting Systems'},
            {'id': 'ch-int-cma-8', 'number': 8, 'name': 'Unit & Batch Costing'},
            {'id': 'ch-int-cma-9', 'number': 9, 'name': 'Job Costing and Contract Costing'},
            {'id': 'ch-int-cma-10', 'number': 10, 'name': 'Process & Operation Costing'},
            {'id': 'ch-int-cma-11', 'number': 11, 'name': 'Joint Products and By-Products'},
            {'id': 'ch-int-cma-12', 'number': 12, 'name': 'Service Costing'},
            {'id': 'ch-int-cma-13', 'number': 13, 'name': 'Standard Costing'},
            {'id': 'ch-int-cma-14', 'number': 14, 'name': 'Marginal Costing'},
            {'id': 'ch-int-cma-15', 'number': 15, 'name': 'Budget and Budgetary Control'}
        ]
    },
    {
        'id': 'sub-inter-5',
        'code': 'INTER-P5',
        'name': 'Auditing and Ethics',
        'level': 'CA Intermediate',
        'levelId': 'intermediate',
        'icon': 'shield-check',
        'chapters': [
            {'id': 'ch-int-aud-1', 'number': 1, 'name': 'Nature, Objective and Scope of Audit'},
            {'id': 'ch-int-aud-2', 'number': 2, 'name': 'Audit Strategy, Planning and Programme'},
            {'id': 'ch-int-aud-3', 'number': 3, 'name': 'Risk Assessment and Internal Control'},
            {'id': 'ch-int-aud-4', 'number': 4, 'name': 'Audit Evidence'},
            {'id': 'ch-int-aud-5', 'number': 5, 'name': 'Audit of Items of Financial Statements'},
            {'id': 'ch-int-aud-6', 'number': 6, 'name': 'Audit Documentation'},
            {'id': 'ch-int-aud-7', 'number': 7, 'name': 'Completion and Review'},
            {'id': 'ch-int-aud-8', 'number': 8, 'name': 'Audit Report'},
            {'id': 'ch-int-aud-9', 'number': 9, 'name': 'Special Features of Audit of Different Entities'},
            {'id': 'ch-int-aud-10', 'number': 10, 'name': 'Audit of Banks'},
            {'id': 'ch-int-aud-11', 'number': 11, 'name': 'Ethics and Terms of Audit Engagements'}
        ]
    },
    {
        'id': 'sub-inter-6',
        'code': 'INTER-P6',
        'name': 'Financial Management and Strategic Management',
        'level': 'CA Intermediate',
        'levelId': 'intermediate',
        'icon': 'trending-up',
        'chapters': [
            {'id': 'ch-int-fmsm-1', 'number': 1, 'name': 'Scope and Objectives of Financial Management'},
            {'id': 'ch-int-fmsm-2', 'number': 2, 'name': 'Types of Financing'},
            {'id': 'ch-int-fmsm-3', 'number': 3, 'name': 'Financial Analysis and Planning (Ratio Analysis)'},
            {'id': 'ch-int-fmsm-4', 'number': 4, 'name': 'Cost of Capital'},
            {'id': 'ch-int-fmsm-5', 'number': 5, 'name': 'Capital Structure Decisions'},
            {'id': 'ch-int-fmsm-6', 'number': 6, 'name': 'Leverages'},
            {'id': 'ch-int-fmsm-7', 'number': 7, 'name': 'Investment Decisions (Capital Budgeting)'},
            {'id': 'ch-int-fmsm-8', 'number': 8, 'name': 'Dividend Decisions'},
            {'id': 'ch-int-fmsm-9', 'number': 9, 'name': 'Management of Working Capital'},
            {'id': 'ch-int-fmsm-10', 'number': 10, 'name': 'Introduction to Strategic Management'},
            {'id': 'ch-int-fmsm-11', 'number': 11, 'name': 'Strategic Analysis: External & Internal Environment'},
            {'id': 'ch-int-fmsm-12', 'number': 12, 'name': 'Strategic Choices (Business & Corporate Level)'},
            {'id': 'ch-int-fmsm-13', 'number': 13, 'name': 'Strategy Implementation and Evaluation'}
        ]
    },

    # ----------------------------------------------------
    # CA Final
    # ----------------------------------------------------
    {
        'id': 'sub-final-1',
        'code': 'FINAL-P1',
        'name': 'Financial Reporting',
        'level': 'CA Final',
        'levelId': 'final',
        'icon': 'file-text',
        'chapters': [
            {'id': 'ch-fin-fr-1', 'number': 1, 'name': 'Introduction to Ind AS & Conceptual Framework'},
            {'id': 'ch-fin-fr-2', 'number': 2, 'name': 'Ind AS on Presentation and Disclosures'},
            {'id': 'ch-fin-fr-3', 'number': 3, 'name': 'Ind AS on Assets'},
            {'id': 'ch-fin-fr-4', 'number': 4, 'name': 'Ind AS on Liabilities'},
            {'id': 'ch-fin-fr-5', 'number': 5, 'name': 'Ind AS on Revenue & Expenses'},
            {'id': 'ch-fin-fr-6', 'number': 6, 'name': 'Financial Instruments (Ind AS 32, 107, 109)'},
            {'id': 'ch-fin-fr-7', 'number': 7, 'name': 'Business Combinations & Corporate Restructuring (Ind AS 103)'},
            {'id': 'ch-fin-fr-8', 'number': 8, 'name': 'Consolidated Financial Statements (Ind AS 110, 111, 28)'},
            {'id': 'ch-fin-fr-9', 'number': 9, 'name': 'Accounting for Financial Institutions'},
            {'id': 'ch-fin-fr-10', 'number': 10, 'name': 'Integrated Reporting & Professional Ethics'}
        ]
    },
    {
        'id': 'sub-final-2',
        'code': 'FINAL-P2',
        'name': 'Advanced Financial Management',
        'level': 'CA Final',
        'levelId': 'final',
        'icon': 'trending-up',
        'chapters': [
            {'id': 'ch-fin-afm-1', 'number': 1, 'name': 'Financial Policy and Corporate Strategy'},
            {'id': 'ch-fin-afm-2', 'number': 2, 'name': 'Risk Management'},
            {'id': 'ch-fin-afm-3', 'number': 3, 'name': 'Advanced Capital Budgeting Decisions'},
            {'id': 'ch-fin-afm-4', 'number': 4, 'name': 'Security Analysis'},
            {'id': 'ch-fin-afm-5', 'number': 5, 'name': 'Security Valuation'},
            {'id': 'ch-fin-afm-6', 'number': 6, 'name': 'Portfolio Management'},
            {'id': 'ch-fin-afm-7', 'number': 7, 'name': 'Securitization'},
            {'id': 'ch-fin-afm-8', 'number': 8, 'name': 'Mutual Funds'},
            {'id': 'ch-fin-afm-9', 'number': 9, 'name': 'Derivatives Analysis and Valuation'},
            {'id': 'ch-fin-afm-10', 'number': 10, 'name': 'Foreign Exchange Exposure and Risk Management'},
            {'id': 'ch-fin-afm-11', 'number': 11, 'name': 'International Financial Management'},
            {'id': 'ch-fin-afm-12', 'number': 12, 'name': 'Interest Rate Risk Management'},
            {'id': 'ch-fin-afm-13', 'number': 13, 'name': 'Business Valuation'},
            {'id': 'ch-fin-afm-14', 'number': 14, 'name': 'Mergers, Acquisitions and Corporate Restructuring'}
        ]
    },
    {
        'id': 'sub-final-3',
        'code': 'FINAL-P3',
        'name': 'Advanced Auditing, Assurance and Professional Ethics',
        'level': 'CA Final',
        'levelId': 'final',
        'icon': 'shield-check',
        'chapters': [
            {'id': 'ch-fin-aud-1', 'number': 1, 'name': 'Quality Control and Engagement Standards'},
            {'id': 'ch-fin-aud-2', 'number': 2, 'name': 'Audit Planning, Strategy and Execution'},
            {'id': 'ch-fin-aud-3', 'number': 3, 'name': 'Risk Assessment and Internal Control'},
            {'id': 'ch-fin-aud-4', 'number': 4, 'name': 'Auditing in an Automated Environment'},
            {'id': 'ch-fin-aud-5', 'number': 5, 'name': 'Audit of Limited Companies'},
            {'id': 'ch-fin-aud-6', 'number': 6, 'name': 'Audit Reports'},
            {'id': 'ch-fin-aud-7', 'number': 7, 'name': 'Audit of Banks and NBFCs'},
            {'id': 'ch-fin-aud-8', 'number': 8, 'name': 'Audit of Consolidated Financial Statements'},
            {'id': 'ch-fin-aud-9', 'number': 9, 'name': 'Due Diligence, Investigation and Forensic Accounting'},
            {'id': 'ch-fin-aud-10', 'number': 10, 'name': 'Peer Review and Quality Review'},
            {'id': 'ch-fin-aud-11', 'number': 11, 'name': 'Professional Ethics & Code of Ethics'}
        ]
    },
    {
        'id': 'sub-final-4',
        'code': 'FINAL-P4',
        'name': 'Direct Tax Laws & International Taxation',
        'level': 'CA Final',
        'levelId': 'final',
        'icon': 'receipt',
        'chapters': [
            {'id': 'ch-fin-dt-1', 'number': 1, 'name': 'Basic Concepts & Rates of Tax'},
            {'id': 'ch-fin-dt-2', 'number': 2, 'name': 'Taxation of Companies, LLPs and Non-Residents'},
            {'id': 'ch-fin-dt-3', 'number': 3, 'name': 'General Anti-Avoidance Rules (GAAR)'},
            {'id': 'ch-fin-dt-4', 'number': 4, 'name': 'Transfer Pricing & International Tax Provisions'},
            {'id': 'ch-fin-dt-5', 'number': 5, 'name': 'Double Taxation Relief (DTAA)'},
            {'id': 'ch-fin-dt-6', 'number': 6, 'name': 'Equalisation Levy'},
            {'id': 'ch-fin-dt-7', 'number': 7, 'name': 'Assessment Procedure & Dispute Resolution'},
            {'id': 'ch-fin-dt-8', 'number': 8, 'name': 'Appeals and Revision'},
            {'id': 'ch-fin-dt-9', 'number': 9, 'name': 'Penalties and Offences'}
        ]
    },
    {
        'id': 'sub-final-5',
        'code': 'FINAL-P5',
        'name': 'Indirect Tax Laws',
        'level': 'CA Final',
        'levelId': 'final',
        'icon': 'briefcase',
        'chapters': [
            {'id': 'ch-fin-idt-1', 'number': 1, 'name': 'Supply under GST, Charge of GST & Exemptions'},
            {'id': 'ch-fin-idt-2', 'number': 2, 'name': 'Place of Supply & Time/Value of Supply'},
            {'id': 'ch-fin-idt-3', 'number': 3, 'name': 'Input Tax Credit (ITC)'},
            {'id': 'ch-fin-idt-4', 'number': 4, 'name': 'Accounts, Records, E-way Bill & Invoices'},
            {'id': 'ch-fin-idt-5', 'number': 5, 'name': 'Payment of Tax & Returns'},
            {'id': 'ch-fin-idt-6', 'number': 6, 'name': 'Refunds under GST'},
            {'id': 'ch-fin-idt-7', 'number': 7, 'name': 'Assessment and Audit under GST'},
            {'id': 'ch-fin-idt-8', 'number': 8, 'name': 'Inspection, Search, Seizure and Arrest'},
            {'id': 'ch-fin-idt-9', 'number': 9, 'name': 'Demands, Recovery & Appeals'},
            {'id': 'ch-fin-idt-10', 'number': 10, 'name': 'Customs Law: Levy, Valuation & Duty Exemption'},
            {'id': 'ch-fin-idt-11', 'number': 11, 'name': 'Import/Export Procedures & Foreign Trade Policy (FTP)'}
        ]
    }
]

_LEVELS_MAP = {l['id']: l for l in EXAM_LEVELS}
_LEVELS_NAME_MAP = {l['name'].lower(): l for l in EXAM_LEVELS}
_SUBJECTS_MAP = {s['id']: s for s in CANONICAL_SUBJECTS}

def get_exam_levels() -> List[Dict[str, Any]]:
    return EXAM_LEVELS

def normalize_exam_level(level_or_id: str) -> Optional[Dict[str, Any]]:
    if not level_or_id:
        return None
    clean = str(level_or_id).strip().lower()
    if clean in _LEVELS_MAP:
        return _LEVELS_MAP[clean]
    if clean in _LEVELS_NAME_MAP:
        return _LEVELS_NAME_MAP[clean]
    for l in EXAM_LEVELS:
        if clean in l['name'].lower() or l['code'].lower() == clean:
            return l
    return None

def get_subjects_for_level(level_or_id: str) -> List[Dict[str, Any]]:
    lvl = normalize_exam_level(level_or_id)
    if not lvl:
        return []
    return [s for s in CANONICAL_SUBJECTS if s['levelId'] == lvl['id']]

def get_subject_by_id(subject_id: str) -> Optional[Dict[str, Any]]:
    return _SUBJECTS_MAP.get(subject_id)

def get_chapters_for_subject(subject_id: str) -> List[Dict[str, Any]]:
    sub = get_subject_by_id(subject_id)
    if not sub:
        return []
    return sub.get('chapters', [])

def resolve_chapter(subject_id: str, chapter_id_or_name: str) -> Optional[Dict[str, Any]]:
    chapters = get_chapters_for_subject(subject_id)
    if not chapters or not chapter_id_or_name:
        return None
    clean = str(chapter_id_or_name).strip().lower()
    for ch in chapters:
        if ch['id'].lower() == clean or ch['name'].lower() == clean:
            return ch
    for ch in chapters:
        if clean in ch['name'].lower():
            return ch
    return None

def get_full_hierarchy() -> Dict[str, Any]:
    """Return nested hierarchy tree: Exam Levels -> Subjects -> Chapters"""
    tree = []
    for lvl in EXAM_LEVELS:
        lvl_copy = dict(lvl)
        lvl_subs = []
        for s in CANONICAL_SUBJECTS:
            if s['levelId'] == lvl['id']:
                s_copy = dict(s)
                lvl_subs.append(s_copy)
        lvl_copy['subjects'] = lvl_subs
        tree.append(lvl_copy)
    return {'levels': tree}

def get_all_subjects_flat() -> List[Dict[str, Any]]:
    """Return flat list of canonical subjects for platform registry"""
    res = []
    for s in CANONICAL_SUBJECTS:
        res.append({
            'id': s['id'],
            'code': s['code'],
            'name': s['name'],
            'level': s['level'],
            'levelId': s['levelId'],
            'icon': s.get('icon', 'book')
        })
    return res


# =====================================================================
# AUTHORITATIVE CHAPTER METADATA REGISTRY
# Primary knowledge & syllabus grounding for direct ChatGPT-style MCQ generation
# =====================================================================
CHAPTER_METADATA_REGISTRY: Dict[str, Dict[str, Any]] = {
    # -----------------------------------------------------------------
    # Business Economics (CA Foundation - Paper 3)
    # -----------------------------------------------------------------
    'ch-fnd-eco-1': {
        'chapterId': 'ch-fnd-eco-1',
        'chapterName': 'Introduction to Business Economics',
        'chapterNumber': 1,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Nature, scope, and fundamental decision-making principles of Business Economics under ICAI syllabus.',
        'allowedTopics': [
            'Meaning and Definition of Business Economics',
            'Differences between Microeconomics and Macroeconomics',
            'Nature of Business Economics (Science, Art, Pragmatic, Normative, Positive)',
            'Scope of Business Economics in Operational and Environmental Decisions',
            'Basic Economic Problems: What, How, and For Whom to Produce',
            'Role and Function of Business Economists in Business Decision Making'
        ],
        'allowedConcepts': [
            'Scarcity and choice principle',
            'Opportunity cost and alternative foregone',
            'Normative economics vs positive economics',
            'Microeconomic analysis vs Macroeconomic aggregates',
            'Capitalist, socialist, and mixed economic systems',
            'Pragmatic decision-making under uncertainty'
        ]
    },
    'ch-fnd-eco-2': {
        'chapterId': 'ch-fnd-eco-2',
        'chapterName': 'Theory of Demand and Supply',
        'chapterNumber': 2,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Consumer behavior, demand theory, price/income/cross elasticity, indifference curve analysis, supply theory, and demand forecasting.',
        'allowedTopics': [
            'Law of Demand, Demand Schedule, and Determinants of Demand',
            'Movement along Demand Curve vs Shift in Demand Curve',
            'Elasticity of Demand: Price, Income, Cross, and Advertisement Elasticity',
            'Methods of Measuring Price Elasticity: Point, Arc, Total Outlay Method',
            'Marginal Utility Analysis and Law of Diminishing Marginal Utility',
            'Indifference Curve Analysis: Properties, Budget Line, Consumer Equilibrium',
            'Consumer Surplus and Marshallian vs Hicksian measurement',
            'Law of Supply, Determinants of Supply, and Elasticity of Supply',
            'Demand Forecasting: Survey, Delphi, Statistical, and Trend Projection Methods'
        ],
        'allowedConcepts': [
            'Giffen goods and Veblen effect (conspicuous consumption)',
            'Price elasticity formula Ep = (% change in Q) / (% change in P)',
            'Marginal Rate of Substitution (MRSxy) diminishing principle',
            'Consumer equilibrium tangency condition: MRSxy = Px / Py',
            'Consumer surplus = Total Utility - Total Expenditure (Area under demand curve above price)',
            'Cross elasticity positive for substitutes, negative for complements',
            'Income elasticity positive for normal goods, negative for inferior goods',
            'Supply elasticity and shift factors'
        ]
    },
    'ch-fnd-eco-3': {
        'chapterId': 'ch-fnd-eco-3',
        'chapterName': 'Theory of Production and Cost',
        'chapterNumber': 3,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Production functions, short-run laws of returns, long-run returns to scale, and short-run/long-run cost theory.',
        'allowedTopics': [
            'Production Function and Factors of Production (Land, Labour, Capital, Enterprise)',
            'Short Run Law: Law of Variable Proportions (Three Stages of Production)',
            'Long Run Law: Laws of Returns to Scale and Cobb-Douglas Production Function',
            'Internal and External Economies and Diseconomies of Scale',
            'Economic Cost vs Accounting Cost, Opportunity Cost, Explicit vs Implicit Cost',
            'Short Run Cost Curves: TFC, TVC, TC, AFC, AVC, ATC, and MC',
            'Long Run Average Cost Curve (Planning Curve / Envelope Curve)'
        ],
        'allowedConcepts': [
            'Relationship between Total Product (TP), Marginal Product (MP), and Average Product (AP)',
            'Stage II of production as economic rationality stage',
            'Cobb-Douglas production function homogeneous of degree 1 (constant returns)',
            'Marginal Cost formula MC = d(TC)/dQ or TC(n) - TC(n-1)',
            'U-shaped nature of Average Cost curves due to law of variable proportions',
            'Envelope curve (LAC) tangent to lowest points of short run SAC curves'
        ]
    },
    'ch-fnd-eco-4': {
        'chapterId': 'ch-fnd-eco-4',
        'chapterName': 'Price Determination in Different Markets',
        'chapterNumber': 4,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Market structures, price and output equilibrium under perfect competition, monopoly, monopolistic competition, and oligopoly.',
        'allowedTopics': [
            'Classification of Markets based on Competition, Area, and Time',
            'Total, Average, and Marginal Revenue relationships',
            'Conditions for Firm Equilibrium (MR = MC and MC cuts MR from below)',
            'Price and Output Determination under Perfect Competition (Short Run and Long Run)',
            'Shut-down condition (Price < AVC) vs Break-even point (Price = ATC)',
            'Monopoly: Equilibrium, Deadweight Loss, and Price Discrimination (1st, 2nd, 3rd Degree)',
            'Monopolistic Competition: Product Differentiation, Selling Costs, Excess Capacity',
            'Oligopoly: Kinked Demand Curve (Paul Sweezy), Cartels, Price Leadership'
        ],
        'allowedConcepts': [
            'Perfect competition horizontal demand curve (Price = AR = MR)',
            'First, second, and third degree price discrimination conditions',
            'Paul Sweezy kinked demand curve explaining price rigidity',
            'Excess capacity theorem under monopolistic competition',
            'Monopoly markup and Lerner Index of monopoly power'
        ]
    },
    'ch-fnd-eco-5': {
        'chapterId': 'ch-fnd-eco-5',
        'chapterName': 'Determination of National Income',
        'chapterNumber': 5,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Macroeconomic aggregates, measurement of national income, circular flow models, and Keynesian income determination.',
        'allowedTopics': [
            'National Income Aggregates: GDP, GNP, NDP, NNP at Market Price and Factor Cost',
            'Nominal GDP vs Real GDP and GDP Deflator',
            'Circular Flow of Income in 2-Sector, 3-Sector, and 4-Sector Open Economies',
            'Measurement Methods: Value Added (Product), Income Method, Expenditure Method',
            'Keynesian Determination of National Income: Aggregate Demand and Aggregate Supply',
            'Consumption Function, Marginal Propensity to Consume (MPC), Savings Function (MPS)',
            'Investment Multiplier and Foreign Trade Multiplier',
            'Inflationary Gap and Deflationary Gap'
        ],
        'allowedConcepts': [
            'NNP at Factor Cost is National Income',
            'GDP Deflator = (Nominal GDP / Real GDP) * 100',
            'Value Added = Value of Output - Intermediate Consumption',
            'Keynesian multiplier formula K = 1 / (1 - MPC) = 1 / MPS',
            'MPC + MPS = 1 relationship',
            'Inflationary gap: excess of aggregate demand over full-employment output'
        ]
    },
    'ch-fnd-eco-6': {
        'chapterId': 'ch-fnd-eco-6',
        'chapterName': 'Business Cycles',
        'chapterNumber': 6,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Phases, features, theories, and indicators of cyclical economic fluctuations.',
        'allowedTopics': [
            'Phases of Business Cycles: Expansion, Peak, Contraction/Recession, Trough/Depression',
            'Characteristics and Synchronized Nature of Business Cycles',
            'Theories of Business Cycles: Schumpeter Innovation, Hawtrey Monetary, Hayek Over-investment, Pigou Psychological, Keynesian',
            'Economic Indicators: Leading Indicators, Lagging Indicators, Coincident Indicators'
        ],
        'allowedConcepts': [
            'Schumpeter innovations causing clusters of investment',
            'Hawtrey monetary expansion and contraction of bank credit',
            'Leading indicators predicting turning points before occurrence',
            'Coincident indicators moving simultaneously with aggregate activity'
        ]
    },
    'ch-fnd-eco-7': {
        'chapterId': 'ch-fnd-eco-7',
        'chapterName': 'Public Finance',
        'chapterNumber': 7,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Role of government, market failures, public goods, fiscal policy instruments, and government deficits.',
        'allowedTopics': [
            'Richard Musgrave Three Fiscal Functions: Allocation, Distribution, Stabilization',
            'Market Failure Causes: Market Power, Incomplete Information, Externalities, Public Goods',
            'Public Goods, Pure Public Goods, Non-Rivalry, Non-Excludability, Free Rider Problem',
            'Fiscal Policy Objectives, Instruments: Taxes, Government Spending, Public Debt',
            'Fiscal Deficit, Revenue Deficit, Primary Deficit Definitions and Measurement'
        ],
        'allowedConcepts': [
            'Allocation function addressing public goods and externalities',
            'Positive vs Negative externalities and Pigouvian corrective taxes/subsidies',
            'Free rider problem leading to market failure in public goods provision',
            'Fiscal Deficit = Total Expenditure - (Revenue Receipts + Non-debt Capital Receipts)',
            'Primary Deficit = Fiscal Deficit - Net Interest Payments'
        ]
    },
    'ch-fnd-eco-8': {
        'chapterId': 'ch-fnd-eco-8',
        'chapterName': 'Money Market',
        'chapterNumber': 8,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Concept of money, demand and supply of money, monetary policy instruments, and RBI operations.',
        'allowedTopics': [
            'Functions and Characteristics of Money (Medium of Exchange, Store of Value, Unit of Account)',
            'Demand for Money: Classical Fisher Equation, Cambridge Cash Balance, Keynesian Liquidity Preference',
            'Three Motives for Holding Money: Transactions, Precautionary, Speculative Motive',
            'Measures of Money Supply: M1, M2, M3, M4 (Reserve Bank of India Monetary Aggregates)',
            'Monetary Policy Framework, Quantitative Tools (Repo, Reverse Repo, CRR, SLR, MSF, OMO)',
            'Qualitative / Selective Credit Controls (Margin requirements, moral suasion)'
        ],
        'allowedConcepts': [
            'Keynesian Liquidity Trap: interest rate elasticity becomes infinite at minimum floor',
            'M1 = Currency with public + Demand deposits + Other deposits with RBI (Narrow Money)',
            'M3 = M1 + Time deposits with banking system (Broad Money)',
            'Money multiplier formula m = (1 + c) / (c + r)',
            'Cash Reserve Ratio (CRR) vs Statutory Liquidity Ratio (SLR) mechanics'
        ]
    },
    'ch-fnd-eco-9': {
        'chapterId': 'ch-fnd-eco-9',
        'chapterName': 'International Trade',
        'chapterNumber': 9,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Theories of international trade, trade policy instruments, WTO framework, and foreign exchange regimes.',
        'allowedTopics': [
            'Theories of Trade: Adam Smith Absolute Advantage, David Ricardo Comparative Advantage, Heckscher-Ohlin Factor Endowment',
            'Trade Policy Instruments: Tariffs (Specific, Ad Valorem, Compound) and Non-Tariff Measures (Quotas, Anti-Dumping, Subsidies)',
            'Trade Negotiations, WTO Agreements, Regional Trade Agreements (RTAs)',
            'Exchange Rate Regimes: Fixed, Floating, Managed Float, Currency Appreciation/Depreciation',
            'Foreign Capital Flows: FDI vs FPI differences and impacts'
        ],
        'allowedConcepts': [
            'Comparative Advantage determined by opportunity cost ratios',
            'Heckscher-Ohlin theorem: capital-abundant nation exports capital-intensive goods',
            'Anti-dumping duty levied when goods exported at price below normal value',
            'Nominal Exchange Rate vs Real Exchange Rate (RER)'
        ]
    },
    'ch-fnd-eco-10': {
        'chapterId': 'ch-fnd-eco-10',
        'chapterName': 'Indian Economy',
        'chapterNumber': 10,
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Structure, sectors, policies, and contemporary dynamics of the Indian economy.',
        'allowedTopics': [
            'Structural Composition of Indian Economy: Agriculture, Industry, and Services Trends',
            'Agriculture: Productivity, Minimum Support Price (MSP), Agri-Credit, Food Security',
            'Industry: Industrial Policies, Ease of Doing Business, Make in India, MSME Classification',
            'Services Sector: IT-BPM, Financial Services, Contribution to Exports and Employment',
            'Planning in India: Five Year Plans transition to NITI Aayog'
        ],
        'allowedConcepts': [
            'Economic Reforms 1991: Liberalisation, Privatisation, and Globalisation (LPG)',
            'MSME revised definition criteria based on Investment and Annual Turnover',
            'Demographic dividend in Indian working-age population',
            'Current Account Deficit (CAD) vs Fiscal Deficit twin deficit challenge'
        ]
    },

    # -----------------------------------------------------------------
    # Accounting (CA Foundation - Paper 1)
    # -----------------------------------------------------------------
    'ch-fnd-acc-1': {
        'chapterId': 'ch-fnd-acc-1',
        'chapterName': 'Theoretical Framework',
        'chapterNumber': 1,
        'subject': 'Accounting',
        'subjectId': 'sub-1',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Fundamental accounting concepts, principles, conventions, policies, capital vs revenue classification, and accounting standards.',
        'allowedTopics': [
            'Meaning and Scope of Accounting, Objectives, and Users of Financial Statements',
            'Accounting Concepts: Going Concern, Accrual, Consistency, Money Measurement, Periodicity',
            'Accounting Conventions: Prudence (Conservatism), Materiality, Substance Over Form',
            'Capital and Revenue Expenditures and Receipts',
            'Contingent Assets and Contingent Liabilities (AS 29 / Ind AS 37)',
            'Accounting Policies: Selection, Changes, and Disclosure (AS 1)'
        ],
        'allowedConcepts': [
            'Accrual basis vs Cash basis of accounting',
            'Prudence principle: recognize all prospective losses but do not anticipate gains',
            'Capital expenditure results in enduring benefit to the business',
            'Contingent liability disclosed in notes to accounts, not recognized in balance sheet',
            'Fundamental accounting assumptions: Going concern, Consistency, Accrual'
        ]
    },
    'ch-fnd-acc-2': {
        'chapterId': 'ch-fnd-acc-2',
        'chapterName': 'Accounting Process',
        'chapterNumber': 2,
        'subject': 'Accounting',
        'subjectId': 'sub-1',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Journal entries, ledger posting, subsidiary books, trial balance, and rectification of accounting errors.',
        'allowedTopics': [
            'Rules of Debit and Credit: Traditional (Golden Rules) vs Modern (Accounting Equation Approach)',
            'Recording Transactions in Books of Original Entry (Journal)',
            'Ledger Posting and Balancing of Ledger Accounts',
            'Subsidiary Books: Cash Book, Purchases Book, Sales Book, Return Books, Journal Proper',
            'Trial Balance Preparation, Objectives, and Limitations',
            'Rectification of Errors: Errors of Omission, Commission, Principle, and Compensating Errors',
            'Suspense Account Creation and Rectification after Trial Balance'
        ],
        'allowedConcepts': [
            'Golden rules: Debit the receiver / Credit the giver; Debit what comes in / Credit what goes out; Debit all expenses / Credit all incomes',
            'Error of principle does not affect trial balance agreement',
            'Rectification before vs after trial balance preparation',
            'Petty cash book imprest system'
        ]
    },
    'ch-fnd-acc-3': {
        'chapterId': 'ch-fnd-acc-3',
        'chapterName': 'Bank Reconciliation Statement (BRS)',
        'chapterNumber': 3,
        'subject': 'Accounting',
        'subjectId': 'sub-1',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Reconciliation of bank balance as per Cash Book with balance as per Bank Pass Book.',
        'allowedTopics': [
            'Need and Purpose of Bank Reconciliation Statement',
            'Causes of Differences: Timing Differences, Direct Transactions by Bank, Errors in Cash Book or Pass Book',
            'Preparation of BRS without adjusting Cash Book balance',
            'Preparation of Adjusted Cash Book before preparing BRS',
            'Overdraft balances reconciliation (favourable vs unfavourable)'
        ],
        'allowedConcepts': [
            'Cheques issued but not presented for payment',
            'Cheques deposited into bank but not yet cleared/collected',
            'Direct credit into bank by customers, interest credited by bank',
            'Bank charges and direct debits not recorded in cash book',
            'Adjusted cash book records only errors and omissions in customer cash book before BRS'
        ]
    },
    'ch-fnd-acc-4': {
        'chapterId': 'ch-fnd-acc-4',
        'chapterName': 'Inventories',
        'chapterNumber': 4,
        'subject': 'Accounting',
        'subjectId': 'sub-1',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Inventory valuation principles under ICAI AS 2, cost formulas, and inventory systems.',
        'allowedTopics': [
            'Meaning of Inventory and Applicability of AS 2 (Valuation of Inventories)',
            'Basis of Inventory Valuation: Lower of Cost and Net Realizable Value (NRV)',
            'Components of Cost of Inventory: Costs of Purchase, Costs of Conversion, Other Costs',
            'Inventory Systems: Periodic Inventory System vs Perpetual Inventory System',
            'Cost Formulas: Specific Identification, FIFO (First-In-First-Out), Weighted Average Price'
        ],
        'allowedConcepts': [
            'Lower of Cost and Net Realizable Value (NRV) rule under AS 2',
            'NRV = Estimated Selling Price less Estimated Cost of Completion and Selling Costs',
            'LIFO is prohibited under ICAI AS 2 and Ind AS 2',
            'Abnormal waste excluded from inventory cost and recognized as expense'
        ]
    },
    'ch-fnd-acc-5': {
        'chapterId': 'ch-fnd-acc-5',
        'chapterName': 'Depreciation and Amortisation',
        'chapterNumber': 5,
        'subject': 'Accounting',
        'subjectId': 'sub-1',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Methods of depreciation, change in method, disposal of depreciable assets under AS 10.',
        'allowedTopics': [
            'Concept and Factors Determining Depreciation (Cost, Residual Value, Useful Life)',
            'Methods of Depreciation: Straight Line Method (SLM), Written Down Value Method (WDV)',
            'Production Unit Method, Sum-of-the-Years-Digits Method, Depletion Method',
            'Accounting Treatment: Provision for Depreciation Account vs Asset Account',
            'Disposal of Asset and Preparation of Asset Disposal Account',
            'Accounting for Change in Depreciation Method (Change in Accounting Estimate under AS 10)'
        ],
        'allowedConcepts': [
            'Depreciation is systematic allocation of depreciable amount over useful life',
            'SLM Depreciation = (Cost - Residual Value) / Useful Life',
            'WDV depreciation rate formula r = 1 - (s/c)^(1/n)',
            'Change in depreciation method treated prospectively as change in accounting estimate under revised AS 10'
        ]
    },

    # -----------------------------------------------------------------
    # Business Law (CA Foundation - Paper 2)
    # -----------------------------------------------------------------
    'ch-fnd-law-1': {
        'chapterId': 'ch-fnd-law-1',
        'chapterName': 'Indian Regulatory Framework',
        'chapterNumber': 1,
        'subject': 'Business Law',
        'subjectId': 'sub-2',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Overview of Indian legal framework, law-making process, hierarchy of courts, and regulatory bodies.',
        'allowedTopics': [
            'Sources of Indian Law (Constitution, Statutes, Precedents, Customs)',
            'How a Bill Becomes an Act (Parliamentary Legislative Process)',
            'Structure and Hierarchy of Indian Judicial System (Supreme Court, High Courts, District/Subordinate Courts)',
            'Key Regulatory Bodies in India (MCA, SEBI, RBI, CCI, IBBI)'
        ],
        'allowedConcepts': [
            'Stare decisis and doctrine of binding precedent',
            'Primary legislation (Acts) vs Subordinate/Delegated legislation (Rules, Regulations)',
            'Civil law vs Criminal law distinctions',
            'Appellate jurisdiction and powers of Supreme Court under Constitution'
        ]
    },
    'ch-fnd-law-2': {
        'chapterId': 'ch-fnd-law-2',
        'chapterName': 'The Indian Contract Act, 1872',
        'chapterNumber': 2,
        'subject': 'Business Law',
        'subjectId': 'sub-2',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Nature of contract, offer and acceptance, consideration, capacity to contract, free consent, legality of object, void agreements, performance, and breach.',
        'allowedTopics': [
            'Essential Elements of a Valid Contract (Section 10)',
            'Offer/Proposal and Acceptance: Rules, Communication, and Revocation (Sections 3-9)',
            'Consideration: Rules, Quid Pro Quo, Exceptions to No Consideration No Contract (Section 25)',
            'Capacity of Parties: Minor agreements, Persons of Unsound Mind, Disqualified Persons (Section 11)',
            'Free Consent: Coercion, Undue Influence, Fraud, Misrepresentation, and Mistake (Sections 13-22)',
            'Legality of Object and Consideration, Void Agreements (Sections 23-30)',
            'Contingent Contracts and Quasi Contracts (Sections 31-36, 68-72)',
            'Performance of Contracts, Discharge of Contract, and Remedies for Breach of Contract (Sections 73-75)'
        ],
        'allowedConcepts': [
            'Agreement void ab initio: Mohori Bibee v. Dharmodas Ghose (Minor contract)',
            'Privity of contract and exceptions (Trust, Family settlement)',
            'Coercion (Sec 15) vs Undue Influence (Sec 16)',
            'Fraud (Sec 17) vs Misrepresentation (Sec 18)',
            'Liquidated damages vs Penalty under Indian Law (Section 74 - reasonable compensation)',
            'Hadley v. Baxendale rule on ordinary vs special damages'
        ]
    },
    'ch-fnd-law-3': {
        'chapterId': 'ch-fnd-law-3',
        'chapterName': 'The Sale of Goods Act, 1930',
        'chapterNumber': 3,
        'subject': 'Business Law',
        'subjectId': 'sub-2',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'chapterDescription': 'Formation of contract of sale, conditions and warranties, transfer of ownership, and unpaid seller rights.',
        'allowedTopics': [
            'Contract of Sale of Goods, Sale vs Agreement to Sell, Subject Matter of Contract',
            'Conditions and Warranties: Express and Implied Conditions, Implied Warranties (Sections 11-17)',
            'Doctrine of Caveat Emptor and Exceptions to Caveat Emptor',
            'Transfer of Ownership and Title: Passing of Property, Risk Follows Ownership (Sections 18-26)',
            'Transfer of Title by Non-Owners (Nemo Dat Quod Non Habet and Exceptions)',
            'Rights of Unpaid Seller: Right of Lien, Stoppage in Transit, Resale (Sections 45-54)'
        ],
        'allowedConcepts': [
            'Condition goes to the root of contract, breach allows repudiation; Warranty breach allows damages only',
            'Caveat Emptor: Let the buyer beware',
            'Nemo dat quod non habet rule and mercantile agent exception',
            'Unpaid seller lien vs stoppage in transit (transit requires seller parted with possession and buyer insolvent)'
        ]
    }
}


def get_authoritative_chapter_metadata(
    chapter_id: Optional[str] = None,
    chapter_name: Optional[str] = None,
    subject: Optional[str] = None,
    exam_level: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """
    Resolve authoritative chapter metadata from canonical registry or platform database.
    Guarantees that generation prompts receive strict syllabus taxonomy, allowed topics,
    and core concepts.
    Returns None if chapter_id or chapter cannot be resolved (triggering CHAPTER_METADATA_MISSING).
    """
    clean_ch_id = str(chapter_id or '').strip()
    clean_ch_name = str(chapter_name or '').strip().lower()
    clean_sub = str(subject or '').strip().lower()
    clean_lvl = str(exam_level or '').strip().lower()

    # 1. Direct registry lookup by canonical chapterId
    if clean_ch_id and clean_ch_id in CHAPTER_METADATA_REGISTRY:
        meta = dict(CHAPTER_METADATA_REGISTRY[clean_ch_id])
        if exam_level:
            meta['examLevel'] = exam_level
        if subject:
            meta['subject'] = subject
        return meta

    # 2. Check in data['subjects'] if dynamic chapters exist in platform store
    if data and isinstance(data, dict):
        subs = data.get('subjects', [])
        for s in subs:
            if not isinstance(s, dict):
                continue
            s_name = s.get('name', '')
            s_id = s.get('id', '')
            for ch in s.get('chapters', []):
                if not isinstance(ch, dict):
                    continue
                if (clean_ch_id and ch.get('id') == clean_ch_id) or \
                   (clean_ch_name and ch.get('name', '').strip().lower() == clean_ch_name):
                    return {
                        'chapterId': ch.get('id') or clean_ch_id or f"ch-{int(time.time()*1000)}",
                        'chapterName': ch.get('name') or chapter_name or 'General',
                        'chapterNumber': ch.get('number', 1),
                        'subject': s_name or subject or 'Accounting',
                        'subjectId': s_id,
                        'examLevel': s.get('level') or exam_level or 'CA Foundation',
                        'examLevelId': s.get('levelId') or 'foundation',
                        'chapterDescription': ch.get('description') or f"Syllabus scope and conceptual guidelines for {ch.get('name')}.",
                        'allowedTopics': ch.get('allowedTopics') or [ch.get('name') or 'General Topics'],
                        'allowedConcepts': ch.get('allowedConcepts') or [ch.get('name') or 'Core Principles']
                    }

    # 3. Lookup across CANONICAL_SUBJECTS chapters.
    # Pass 1 matches by chapterId or exact/contained chapter name; pass 2 falls back to fuzzy
    # token overlap. A requested subject is always honoured, so a fuzzy match can never pull a
    # chapter from a different subject (e.g. "Theory of Demand..." -> Accounting "Theoretical...").
    for fuzzy_pass in (False, True):
      for s in CANONICAL_SUBJECTS:
        s_name = s.get('name', '')
        s_id = s.get('id', '')
        s_lvl = s.get('level', 'CA Foundation')
        s_lvl_id = s.get('levelId', 'foundation')

        # If subject was provided, skip other subjects unless the chapterId explicitly belongs to them
        if clean_sub and clean_sub not in s_name.lower() and s_name.lower() not in clean_sub:
            ch_ids = [ch['id'] for ch in s.get('chapters', [])]
            if not (clean_ch_id and clean_ch_id in ch_ids):
                continue

        for ch in s.get('chapters', []):
            ch_id = ch.get('id', '')
            ch_name = ch.get('name', '')
            matched = False

            if clean_ch_id and ch_id.lower() == clean_ch_id.lower():
                matched = True
            elif clean_ch_name:
                if clean_ch_name == ch_name.lower() or clean_ch_name in ch_name.lower() or ch_name.lower() in clean_ch_name:
                    matched = True
                elif fuzzy_pass:
                    cand_tokens = {w[:5] for w in re.findall(r'\b[a-zA-Z]{4,}\b', clean_ch_name)}
                    ch_tokens = {w[:5] for w in re.findall(r'\b[a-zA-Z]{4,}\b', ch_name.lower())}
                    if cand_tokens and ch_tokens and cand_tokens.intersection(ch_tokens):
                        matched = True

            if matched:
                # If present in registry under canonical ID, return rich registry record
                if ch_id in CHAPTER_METADATA_REGISTRY:
                    meta = dict(CHAPTER_METADATA_REGISTRY[ch_id])
                    return meta

                # Synthesize canonical metadata
                return {
                    'chapterId': ch_id,
                    'chapterName': ch_name,
                    'chapterNumber': ch.get('number', 1),
                    'subject': s_name,
                    'subjectId': s_id,
                    'examLevel': s_lvl,
                    'examLevelId': s_lvl_id,
                    'chapterDescription': f"Authoritative ICAI syllabus study scope for Chapter {ch.get('number')}: {ch_name}.",
                    'allowedTopics': [
                        f"Core principles and statutory definitions of {ch_name}",
                        f"Conceptual applications and rules under {ch_name}",
                        f"Standard classifications and provisions of {ch_name}"
                    ],
                    'allowedConcepts': [
                        f"Theoretical framework of {ch_name}",
                        f"Practical and regulatory requirements of {ch_name}",
                        f"Analytical problem solving for {ch_name}"
                    ]
                }

    # 4. Fallback to first chapter of subject if subject is valid but no chapter specified
    if not clean_ch_id and not clean_ch_name and clean_sub:
        for s in CANONICAL_SUBJECTS:
            s_name = s.get('name', '')
            if clean_sub in s_name.lower() or s_name.lower() in clean_sub:
                chs = s.get('chapters', [])
                if chs:
                    first_ch = chs[0]
                    first_ch_id = first_ch.get('id', '')
                    if first_ch_id in CHAPTER_METADATA_REGISTRY:
                        return dict(CHAPTER_METADATA_REGISTRY[first_ch_id])
                    return {
                        'chapterId': first_ch_id,
                        'chapterName': first_ch.get('name', ''),
                        'chapterNumber': first_ch.get('number', 1),
                        'subject': s_name,
                        'subjectId': s.get('id', ''),
                        'examLevel': s.get('level', 'CA Foundation'),
                        'examLevelId': s.get('levelId', 'foundation'),
                        'chapterDescription': f"Authoritative ICAI syllabus study scope for {first_ch.get('name')}.",
                        'allowedTopics': [f"Core principles of {first_ch.get('name')}"],
                        'allowedConcepts': [f"Key concepts of {first_ch.get('name')}"]
                    }

    # 5. If neither chapter_id nor chapter_name matched any canonical chapter
    return None


