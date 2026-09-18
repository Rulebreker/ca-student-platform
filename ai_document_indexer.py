import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import ai_provider_manager
import syllabus_hierarchy

try:
    from server import validate_and_sanitize_upload
except ImportError:
    import base64
    def validate_and_sanitize_upload(raw_data_or_b64, allowed_types=None, max_size_bytes=20*1024*1024, original_filename=''):
        if isinstance(raw_data_or_b64, str):
            clean = raw_data_or_b64.strip()
            if ',' in clean:
                clean = clean.split(',', 1)[1]
            try:
                binary_data = base64.b64decode(clean)
            except Exception as e:
                return False, f"Base64 decoding failed: {e}", None, None, None
        elif isinstance(raw_data_or_b64, bytes):
            binary_data = raw_data_or_b64
        else:
            return False, "Unsupported file data type.", None, None, None

        if len(binary_data) > max_size_bytes:
            return False, f"File size exceeds maximum allowed limit of {max_size_bytes // (1024*1024)}MB.", None, None, None

        if not binary_data.startswith(b'%PDF'):
            return False, "File is not a valid PDF document (missing %PDF signature).", None, None, None

        return True, None, binary_data, 'application/pdf', '.pdf'

def chunk_document_content(pages: List[Dict[str, Any]], target_chunk_words: int = 500) -> List[Dict[str, Any]]:
    """
    Split per-page OCR markdown into semantic chunks of ~400-800 words,
    preserving section headings, tables, and page number context.
    """
    chunks = []
    current_heading = "General Overview"
    current_chunk_words = []
    current_pages = set()

    for page in pages:
        p_num = page.get('page_number', 1)
        markdown = page.get('markdown', '')
        lines = markdown.split('\n')

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # Detect markdown headings
            if stripped.startswith('#'):
                heading_text = re.sub(r'^#+\s*', '', stripped)
                if heading_text:
                    current_heading = heading_text

            words = stripped.split()
            current_chunk_words.extend(words)
            current_pages.add(p_num)

            if len(current_chunk_words) >= target_chunk_words:
                chunk_text = " ".join(current_chunk_words)
                chunks.append({
                    'chunkId': f"chk-{uuid.uuid4().hex[:8]}",
                    'heading': current_heading,
                    'pages': sorted(list(current_pages)),
                    'pageDisplay': f"p. {', '.join(map(str, sorted(list(current_pages))))}",
                    'wordCount': len(current_chunk_words),
                    'text': chunk_text
                })
                current_chunk_words = []
                current_pages = set()

    # Flush remaining words
    if current_chunk_words:
        chunk_text = " ".join(current_chunk_words)
        chunks.append({
            'chunkId': f"chk-{uuid.uuid4().hex[:8]}",
            'heading': current_heading,
            'pages': sorted(list(current_pages)) if current_pages else [1],
            'pageDisplay': f"p. {', '.join(map(str, sorted(list(current_pages))))}" if current_pages else "p. 1",
            'wordCount': len(current_chunk_words),
            'text': chunk_text
        })

    return chunks

def index_pdf_document(
    raw_data_or_b64: Any,
    filename: str,
    subject: str = '',
    subject_id: str = '',
    exam_level: str = 'CA Foundation',
    exam_level_id: str = 'foundation',
    chapter: str = '',
    chapter_id: str = '',
    topic: str = '',
    topic_id: str = '',
    data: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Validate, run Mistral OCR, and index document chunks with full syllabus hierarchy metadata:
    Exam Level -> Subject -> Chapter -> Topic -> Source Chunks.
    """
    # 1. Security & format validation (20MB limit)
    is_valid, err, binary_data, mime, ext = validate_and_sanitize_upload(
        raw_data_or_b64,
        allowed_types=['pdf'],
        max_size_bytes=20 * 1024 * 1024,
        original_filename=filename
    )
    if not is_valid or not binary_data:
        return False, {
            'code': 'INVALID_FILE',
            'message': f"PDF Validation Error: {err}"
        }, None

    # 2. Canonical metadata resolution
    lvl_info = syllabus_hierarchy.normalize_exam_level(exam_level_id or exam_level)
    canonical_exam_level = lvl_info['name'] if lvl_info else (exam_level or 'CA Foundation')
    canonical_level_id = lvl_info['id'] if lvl_info else (exam_level_id or 'foundation')

    canonical_subject_name = subject or 'General Studies'
    canonical_subject_id = subject_id
    if canonical_subject_id:
        sub_obj = syllabus_hierarchy.get_subject_by_id(canonical_subject_id)
        if sub_obj:
            canonical_subject_name = sub_obj['name']
    else:
        # Resolve from name
        for s in syllabus_hierarchy.get_subjects_for_level(canonical_level_id):
            if s['name'].lower() == canonical_subject_name.lower():
                canonical_subject_id = s['id']
                canonical_subject_name = s['name']
                break

    canonical_chapter_name = chapter or 'General Concepts'
    canonical_chapter_id = chapter_id
    if canonical_subject_id:
        ch_obj = syllabus_hierarchy.resolve_chapter(canonical_subject_id, chapter_id or chapter)
        if ch_obj:
            canonical_chapter_id = ch_obj['id']
            canonical_chapter_name = ch_obj['name']

    # 3. Mistral OCR processing
    try:
        ocr_result = ai_provider_manager.call_mistral_ocr(binary_data, filename=filename)
    except Exception as e:
        err_msg = str(e)
        return False, {
            'code': 'OCR_PROVIDER_ERROR',
            'message': f"Mistral OCR Processing Failed: {err_msg}"
        }, None

    pages = ocr_result.get('pages', [])
    full_text = ocr_result.get('full_text', '')
    
    if not full_text or len(full_text.strip()) < 20:
        return False, {
            'code': 'OCR_EMPTY_TEXT',
            'message': "Mistral OCR completed, but no legible text was extracted from this PDF."
        }, None

    # 4. Semantic Chunking
    raw_chunks = chunk_document_content(pages, target_chunk_words=500)

    # 5. Tag chunks with complete syllabus hierarchy metadata
    tagged_chunks = []
    doc_id = f"doc-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
    for chk in raw_chunks:
        chk_copy = dict(chk)
        chk_copy['docId'] = doc_id
        chk_copy['docFilename'] = filename
        chk_copy['examLevel'] = canonical_exam_level
        chk_copy['examLevelId'] = canonical_level_id
        chk_copy['subject'] = canonical_subject_name
        chk_copy['subjectId'] = canonical_subject_id
        chk_copy['chapter'] = canonical_chapter_name
        chk_copy['chapterId'] = canonical_chapter_id
        chk_copy['topic'] = topic or ''
        chk_copy['topicId'] = topic_id or ''
        tagged_chunks.append(chk_copy)

    # 6. Construct Document Record
    now_iso = datetime.now(timezone.utc).isoformat()
    doc_record = {
        'id': doc_id,
        'filename': filename,
        'fileSize': len(binary_data),
        'pageCount': ocr_result.get('page_count', len(pages)),
        'chunkCount': len(tagged_chunks),
        'examLevel': canonical_exam_level,
        'examLevelId': canonical_level_id,
        'subject': canonical_subject_name,
        'subjectId': canonical_subject_id,
        'chapter': canonical_chapter_name,
        'chapterId': canonical_chapter_id,
        'topic': topic or '',
        'topicId': topic_id or '',
        'ocrEngine': ocr_result.get('engine', 'mistral-ocr-latest'),
        'uploadedAt': now_iso,
        'status': 'indexed',
        'chunks': tagged_chunks,
        'summary': (full_text[:350] + '...') if len(full_text) > 350 else full_text
    }

    if data is not None:
        if 'ai_source_documents' not in data:
            data['ai_source_documents'] = []
        data['ai_source_documents'].insert(0, doc_record)

    return True, None, doc_record

def retrieve_relevant_chunks(
    documents: List[Dict[str, Any]],
    query_topic: str = '',
    subject: str = '',
    subject_id: str = '',
    exam_level: str = '',
    exam_level_id: str = '',
    chapter: str = '',
    chapter_id: str = '',
    max_chunks: int = 4
) -> List[Dict[str, Any]]:
    """
    Retrieve top matching content chunks strictly adhering to the selected hierarchy:
    Exam Level + Subject + Chapter.
    Prevents cross-chapter and cross-subject contamination.
    """
    if not documents:
        return []

    target_docs = list(documents)

    # 1. Filter by Exam Level
    if exam_level_id:
        target_docs = [
            d for d in target_docs 
            if d.get('examLevelId') == exam_level_id or d.get('examLevel', '').lower() == exam_level.lower()
        ]
    elif exam_level:
        target_docs = [
            d for d in target_docs 
            if d.get('examLevel', '').lower() == exam_level.lower()
        ]

    # 2. Filter by Subject
    if subject_id:
        target_docs = [
            d for d in target_docs 
            if d.get('subjectId') == subject_id or d.get('subject', '').lower() == subject.lower()
        ]
    elif subject:
        target_docs = [
            d for d in target_docs 
            if d.get('subject', '').lower() == subject.lower()
        ]

    # 3. Filter by Chapter (Strict Lock - NEVER silently fall back to other chapters)
    if chapter_id:
        target_docs = [
            d for d in target_docs 
            if d.get('chapterId') == chapter_id or (chapter and d.get('chapter', '').strip().lower() == chapter.strip().lower())
        ]
    elif chapter:
        target_docs = [
            d for d in target_docs 
            if d.get('chapter', '').strip().lower() == chapter.strip().lower()
        ]

    if not target_docs:
        return []

    # 4. Gather all chunks strictly from matching target docs
    all_chunks = []
    for doc in target_docs:
        doc_id = doc.get('id')
        doc_name = doc.get('filename')
        doc_chapter_id = doc.get('chapterId')
        doc_chapter = doc.get('chapter')
        for chk in doc.get('chunks', []):
            chk_chapter_id = chk.get('chapterId') or doc_chapter_id
            chk_chapter = chk.get('chapter') or doc_chapter
            # Strict chapter match on chunks
            if chapter_id and chk_chapter_id and chk_chapter_id != chapter_id:
                if not (chapter and chk_chapter and chk_chapter.strip().lower() == chapter.strip().lower()):
                    continue
            elif chapter and chk_chapter and chk_chapter.strip().lower() != chapter.strip().lower():
                continue
            chunk_copy = dict(chk)
            chunk_copy['docId'] = doc_id
            chunk_copy['docFilename'] = doc_name
            chunk_copy['chapterId'] = chk_chapter_id
            chunk_copy['chapter'] = chk_chapter
            all_chunks.append(chunk_copy)

    if not all_chunks:
        return []

    if not query_topic or not query_topic.strip():
        return all_chunks[:max_chunks]

    # 5. Score by query keyword matches in heading and text
    query_words = set(re.findall(r'\b[a-zA-Z0-9]{3,}\b', query_topic.lower()))
    scored_chunks = []

    for chk in all_chunks:
        heading = chk.get('heading', '').lower()
        text = chk.get('text', '').lower()
        
        score = 0
        for w in query_words:
            if w in heading:
                score += 5
            if w in text:
                score += 1

        scored_chunks.append((score, chk))

    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored_chunks[:max_chunks]]
