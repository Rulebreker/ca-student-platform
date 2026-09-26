import os
import re
import time
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Callable

import syllabus_hierarchy


def extract_pdf_text_locally(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Extract text from a text-based PDF on this server (no external OCR service).
    Uses pypdf when installed, otherwise decodes Flate-compressed text streams.
    Scanned/image-only PDFs yield no text and are rejected by the caller.
    """
    started = time.time()
    pages: List[Dict[str, Any]] = []
    try:
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        for i, page in enumerate(reader.pages, start=1):
            txt = (page.extract_text() or '').strip()
            if txt:
                pages.append({'page_number': i, 'markdown': txt, 'images': []})
        engine = 'pypdf'
    except Exception:
        import zlib
        chunks = []
        for stream in re.findall(rb'stream[\r\n]+([\s\S]*?)[\r\n]+endstream', pdf_bytes):
            try:
                content = zlib.decompress(stream)
            except Exception:
                content = stream  # uncompressed content stream
            for m in re.finditer(rb'\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ', content, re.S):
                if m.group(1) is not None:
                    chunks.append(m.group(1).decode('latin-1', errors='ignore'))
                else:
                    chunks.append(''.join(p.decode('latin-1', errors='ignore') for p in re.findall(rb'\((.*?)\)', m.group(2))))
        text = " ".join(chunks).strip()
        if text:
            pages.append({'page_number': 1, 'markdown': text, 'images': []})
        engine = 'local-stream-decoder'
    return {
        'success': True,
        'pages': pages,
        'page_count': len(pages),
        'full_text': "\n\n".join(p['markdown'] for p in pages),
        'latency_ms': (time.time() - started) * 1000.0,
        'engine': engine
    }

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

def validate_pdf_binary(raw_bytes: bytes, max_size_bytes: int = 20 * 1024 * 1024) -> Tuple[bool, Optional[str]]:
    """Validate that raw bytes contain a valid %PDF signature and obey maximum size limit."""
    valid, err, _, _, _ = validate_and_sanitize_upload(raw_bytes, allowed_types=['pdf'], max_size_bytes=max_size_bytes)
    return valid, err

def chunk_document_content(pages: List[Dict[str, Any]], target_chunk_words: int = 500) -> List[Dict[str, Any]]:
    """
    Split per-page OCR markdown into semantic chunks of ~400-800 words,
    preserving section headings, tables, and page number context.
    """
    chunks = []
    current_heading = "General"
    current_chapter_heading = ""
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
                    if re.search(r'\b(?:chapter|ch)\s*\d+\b', heading_text, re.IGNORECASE):
                        current_chapter_heading = heading_text

            words = stripped.split()
            current_chunk_words.extend(words)
            current_pages.add(p_num)

            if len(current_chunk_words) >= target_chunk_words:
                chunk_text = " ".join(current_chunk_words)
                chunks.append({
                    'chunkId': f"chk-{uuid.uuid4().hex[:8]}",
                    'heading': current_heading,
                    'chapterHeading': current_chapter_heading,
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
            'chapterHeading': current_chapter_heading,
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
    data: Optional[Dict[str, Any]] = None,
    force_reprocess: bool = False,
    status_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None
) -> Tuple[bool, Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Validate, check SHA-256 hash deduplication, extract text locally once, and index document chunks
    with full syllabus hierarchy metadata: Exam Level -> Subject -> Chapter -> Topic -> Source Chunks.
    If already indexed and content has not changed, skips OCR and returns the existing document record.
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

    content_hash = hashlib.sha256(binary_data).hexdigest()

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

    # 3. Deterministic Deduplication: Check if identical PDF has already been processed
    if not force_reprocess and data and isinstance(data, dict):
        existing_docs = data.get('ai_source_documents', [])
        for ex_doc in existing_docs:
            if ex_doc.get('contentHash') == content_hash and ex_doc.get('status') in ['COMPLETED', 'indexed']:
                print(f"[PDF_DEDUPLICATION] Document '{filename}' (hash: {content_hash[:12]}...) already processed as {ex_doc.get('id')}. Reusing existing structured syllabus knowledge base.", flush=True)
                res_doc = dict(ex_doc)
                res_doc['alreadyProcessed'] = True
                return True, None, res_doc

    # 4. Versioning calculation: Determine version if updating existing syllabus doc
    existing_docs = (data.get('ai_source_documents', []) if data and isinstance(data, dict) else [])
    matching_versions = [
        int(d.get('contentVersion', 1)) for d in existing_docs
        if (d.get('filename') == filename or 
            (d.get('chapterId') == canonical_chapter_id and d.get('subjectId') == canonical_subject_id and canonical_chapter_id))
    ]
    content_version = (max(matching_versions) + 1) if matching_versions else 1

    if status_callback:
        status_callback('PROCESSING', {'filename': filename, 'contentHash': content_hash})

    # 5. One-Time local text extraction (no external OCR service)
    try:
        ocr_result = extract_pdf_text_locally(binary_data)
    except Exception as e:
        err_msg = str(e)
        if status_callback:
            status_callback('FAILED', {'error': err_msg})
        return False, {
            'code': 'TEXT_EXTRACTION_ERROR',
            'message': f"PDF text extraction failed: {err_msg}"
        }, None

    if status_callback:
        status_callback('OCR_COMPLETE', {'pageCount': ocr_result.get('page_count', 1)})

    pages = ocr_result.get('pages', [])
    full_text = ocr_result.get('full_text', '')
    
    if not full_text or len(full_text.strip()) < 20:
        if status_callback:
            status_callback('FAILED', {'error': 'No legible text extracted'})
        return False, {
            'code': 'OCR_EMPTY_TEXT',
            'message': "No legible text could be extracted from this PDF. Upload a text-based (not scanned) PDF."
        }, None

    if status_callback:
        status_callback('STRUCTURING', {'pageCount': len(pages)})

    # 6. Semantic Chunking & Structuring into Syllabus Knowledge Base
    raw_chunks = chunk_document_content(pages, target_chunk_words=500)

    now_iso = datetime.now(timezone.utc).isoformat()
    doc_id = f"doc-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"

    # Tag chunks with complete syllabus hierarchy metadata
    tagged_chunks = []
    unique_headings = set()
    for chk in raw_chunks:
        chk_copy = dict(chk)
        c_id = chk_copy.get('chunkId') or f"chk-{uuid.uuid4().hex[:8]}"
        chk_copy['chunkId'] = c_id
        chk_copy['contentId'] = c_id
        chk_copy['docId'] = doc_id
        chk_copy['sourceDocumentId'] = doc_id
        chk_copy['docFilename'] = filename
        chk_copy['sourceFilename'] = filename
        
        pages_list = chk_copy.get('pages', [1])
        chk_copy['sourcePage'] = pages_list[0] if pages_list else 1
        chk_copy['sourcePages'] = pages_list
        chk_copy['pageDisplay'] = chk_copy.get('pageDisplay', f"p. {chk_copy['sourcePage']}")
        
        chk_text = chk_copy.get('text', '')
        heading = chk_copy.get('heading', 'General')
        chapter_heading = chk_copy.get('chapterHeading', '')
        unique_headings.add(heading)

        # Detect preface / unmatchable sections
        preface_patterns = [
            r'\b(?:preface|table of contents|contents|acknowledgement|acknowledgments|about the author|publisher notes|preliminary|disclaimer|foreword|how to use this book|study plan)\b'
        ]
        is_preface = False
        for pat in preface_patterns:
            if re.search(pat, heading, re.IGNORECASE) or (len(chk_text) < 300 and re.search(pat, chk_text[:200], re.IGNORECASE)):
                is_preface = True
                break

        if is_preface:
            chunk_chapter = 'UNKNOWN'
            chunk_chapter_id = 'UNKNOWN'
            chunk_topic = 'UNKNOWN'
        else:
            # Try to match chunk chapter heading or heading against syllabus hierarchy chapters for this subject
            matched_meta = None
            generic_headings = {'general', 'general overview', 'overview', 'introduction', 'summary', 'basic concepts', 'preliminary concepts'}
            
            candidates_to_check = []
            if chapter_heading and chapter_heading.lower() not in generic_headings:
                candidates_to_check.append(chapter_heading)
            if heading and heading.lower() not in generic_headings:
                candidates_to_check.append(heading)
            
            first_lines = chk_text[:300]
            ch_match = re.search(r'\b(?:chapter|ch)\s*(\d+)\b[^\n]*', first_lines, re.IGNORECASE)
            if ch_match:
                candidates_to_check.append(ch_match.group(0))

            for s in syllabus_hierarchy.CANONICAL_SUBJECTS:
                if (canonical_subject_name.lower() in s.get('name', '').lower() or s.get('name', '').lower() in canonical_subject_name.lower()) and s.get('levelId') == canonical_level_id:
                    for cand in candidates_to_check:
                        cand_clean = cand.lower()
                        for ch in s.get('chapters', []):
                            ch_name_clean = ch.get('name', '').lower()
                            ch_num = ch.get('number')
                            if ch_num is not None and re.search(rf'\b(?:chapter|ch)\s*{ch_num}\b', cand_clean):
                                matched_meta = syllabus_hierarchy.get_authoritative_chapter_metadata(chapter_id=ch.get('id'), data=data)
                                break
                            if len(ch_name_clean) >= 8 and (ch_name_clean in cand_clean or cand_clean in ch_name_clean):
                                matched_meta = syllabus_hierarchy.get_authoritative_chapter_metadata(chapter_id=ch.get('id'), data=data)
                                break
                        if matched_meta:
                            break
                    if matched_meta:
                        break

            if matched_meta:
                chunk_chapter = matched_meta['chapterName']
                chunk_chapter_id = matched_meta['chapterId']
                chunk_topic = heading
            else:
                chunk_chapter = canonical_chapter_name or 'UNKNOWN'
                chunk_chapter_id = canonical_chapter_id or 'UNKNOWN'
                chunk_topic = topic or heading

        chk_copy['examLevel'] = canonical_exam_level
        chk_copy['examLevelId'] = canonical_level_id
        chk_copy['subject'] = canonical_subject_name
        chk_copy['subjectId'] = canonical_subject_id
        chk_copy['chapter'] = chunk_chapter
        chk_copy['chapterId'] = chunk_chapter_id
        chk_copy['topic'] = chunk_topic
        chk_copy['subTopic'] = heading
        chk_copy['topicId'] = topic_id or ''
        
        # Ensure both text and extractedText fields are present
        chk_copy['extractedText'] = chk_text
        chk_copy['text'] = chk_text
        chk_copy['contentVersion'] = content_version
        chk_copy['isActive'] = True
        chk_copy['processedAt'] = now_iso
        
        tagged_chunks.append(chk_copy)

    # 7. Construct Authoritative Document Record
    detected_chapters = {c['chapter'] for c in tagged_chunks if c.get('chapter') and c['chapter'] != 'UNKNOWN'}
    doc_record = {
        'id': doc_id,
        'filename': filename,
        'fileSize': len(binary_data),
        'contentHash': content_hash,
        'contentVersion': content_version,
        'isActive': True,
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
        'chapterList': sorted(list(detected_chapters)) if detected_chapters else ([canonical_chapter_name] if canonical_chapter_name else []),
        'topicList': sorted(list(unique_headings)) if unique_headings else [topic or 'General Concepts'],
        'ocrEngine': ocr_result.get('engine', 'local'),
        'processingStatus': 'COMPLETED',
        'status': 'COMPLETED',
        'uploadedAt': now_iso,
        'processedAt': now_iso,
        'chunks': tagged_chunks,
        'summary': (full_text[:350] + '...') if len(full_text) > 350 else full_text,
        'alreadyProcessed': False
    }

    if status_callback:
        status_callback('COMPLETED', doc_record)

    if data is not None:
        if 'ai_source_documents' not in data:
            data['ai_source_documents'] = []
        data['ai_source_documents'].insert(0, doc_record)

    return True, None, doc_record

def toggle_document_active(doc_id: str, is_active: bool, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Activate or deactivate a syllabus document version."""
    docs = data.get('ai_source_documents', [])
    for d in docs:
        if d.get('id') == doc_id:
            d['isActive'] = bool(is_active)
            for chk in d.get('chunks', []):
                chk['isActive'] = bool(is_active)
            return d
    return None

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

    target_docs = [d for d in documents if d.get('isActive', True) is not False]

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
            if d.get('chapterId') == chapter_id 
            or (chapter and d.get('chapter', '').strip().lower() == chapter.strip().lower())
            or any((c.get('chapterId') == chapter_id or (chapter and c.get('chapter', '').strip().lower() == chapter.strip().lower())) for c in d.get('chunks', []))
        ]
    elif chapter:
        target_docs = [
            d for d in target_docs 
            if d.get('chapter', '').strip().lower() == chapter.strip().lower()
            or any(chapter and c.get('chapter', '').strip().lower() == chapter.strip().lower() for c in d.get('chunks', []))
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
            if chk.get('isActive', True) is False:
                continue
            chk_chapter_id = chk.get('chapterId') or doc_chapter_id
            chk_chapter = chk.get('chapter') or doc_chapter
            # Exclude unmapped / preface UNKNOWN chunks from scoped retrieval
            if chk_chapter_id == 'UNKNOWN' or chk_chapter == 'UNKNOWN':
                continue
            # Strict chapter match on chunks
            matches_chapter = False
            if chapter_id and chk_chapter_id and chk_chapter_id == chapter_id:
                matches_chapter = True
            elif chapter and chk_chapter and chk_chapter.strip().lower() == chapter.strip().lower():
                matches_chapter = True
            elif not chapter_id and not chapter:
                matches_chapter = True

            if not matches_chapter:
                continue
            chunk_copy = dict(chk)
            chunk_copy['docId'] = doc_id
            chunk_copy['sourceDocumentId'] = doc_id
            chunk_copy['docFilename'] = doc_name
            chunk_copy['sourceFilename'] = doc_name
            chunk_copy['chapterId'] = chk_chapter_id
            chunk_copy['chapter'] = chk_chapter
            chunk_copy['sourceContentId'] = chk.get('contentId') or chk.get('chunkId')
            chunk_copy['sourcePage'] = chk.get('sourcePage') or (chk.get('pages', [1])[0] if chk.get('pages') else 1)
            chunk_copy['extractedText'] = chk.get('extractedText') or chk.get('text', '')
            chunk_copy['text'] = chunk_copy['extractedText']
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

# Backward-compatible alias
index_document = index_pdf_document
