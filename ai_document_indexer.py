import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import ai_provider_manager

# Re-use existing upload validation from server.py if importable, or local robust validation
try:
    from server import validate_and_sanitize_upload
except ImportError:
    import base64
    def validate_and_sanitize_upload(raw_data_or_b64, allowed_types=None, max_size_bytes=15*1024*1024, original_filename=''):
        if isinstance(raw_data_or_b64, str):
            clean = raw_data_or_b64.strip()
            if ',' in clean:
                clean = clean.split(',', 1)[1]
            binary_data = base64.b64decode(clean)
        elif isinstance(raw_data_or_b64, bytes):
            binary_data = raw_data_or_b64
        else:
            return False, "Unsupported file format.", None, None, None
        if not binary_data.startswith(b'%PDF'):
            return False, "File is not a valid PDF.", None, None, None
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
    exam_level: str = 'CA Foundation',
    data: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validate, run Mistral OCR, and index document chunks into data store.
    """
    # 1. Security validation
    is_valid, err, binary_data, mime, ext = validate_and_sanitize_upload(
        raw_data_or_b64,
        allowed_types=['pdf'],
        max_size_bytes=20 * 1024 * 1024,
        original_filename=filename
    )
    if not is_valid or not binary_data:
        return False, f"File validation failed: {err}", None

    # 2. Mistral OCR processing
    try:
        ocr_result = ai_provider_manager.call_mistral_ocr(binary_data, filename=filename)
    except Exception as e:
        return False, f"OCR processing failed: {str(e)}", None

    pages = ocr_result.get('pages', [])
    full_text = ocr_result.get('full_text', '')
    
    if not full_text or len(full_text.strip()) < 20:
        return False, "OCR extracted empty or insufficient text from document.", None

    # 3. Chunking
    chunks = chunk_document_content(pages, target_chunk_words=500)

    # 4. Construct Document Record
    now_iso = datetime.now(timezone.utc).isoformat()
    doc_id = f"doc-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
    doc_record = {
        'id': doc_id,
        'filename': filename,
        'fileSize': len(binary_data),
        'pageCount': ocr_result.get('page_count', len(pages)),
        'chunkCount': len(chunks),
        'subject': subject or 'General CA Studies',
        'examLevel': exam_level or 'CA Foundation',
        'ocrEngine': ocr_result.get('engine', 'mistral-ocr-latest'),
        'uploadedAt': now_iso,
        'status': 'indexed',
        'chunks': chunks,
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
    max_chunks: int = 4
) -> List[Dict[str, Any]]:
    """
    Retrieve top matching content chunks across all or filtered source documents.
    """
    all_chunks = []
    target_docs = documents
    if subject:
        filtered = [d for d in documents if d.get('subject', '').lower() == subject.lower()]
        if filtered:
            target_docs = filtered

    for doc in target_docs:
        doc_id = doc.get('id')
        doc_name = doc.get('filename')
        for chk in doc.get('chunks', []):
            chunk_copy = dict(chk)
            chunk_copy['docId'] = doc_id
            chunk_copy['docFilename'] = doc_name
            all_chunks.append(chunk_copy)

    if not all_chunks:
        return []

    if not query_topic or not query_topic.strip():
        # Return first few chunks across available docs
        return all_chunks[:max_chunks]

    # Score by query keyword matches in heading and text
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
    
    # Return top scoring chunks
    return [item[1] for item in scored_chunks[:max_chunks]]
