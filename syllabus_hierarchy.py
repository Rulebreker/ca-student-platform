"""
ExcellenceCA Canonical Syllabus Hierarchy
Provides canonical IDs, names, and chapter structures for:
- CA Foundation
- CA Intermediate
- CA Final
"""

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

