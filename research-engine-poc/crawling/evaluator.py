from core.models import CrawledDocument, DocumentQuality, PageType

class DocumentQualityEvaluator:
    """
    Evaluates the quality of a crawled document and assigns a DocumentQuality state.
    
    Checks in order:
      1. Network/Fetch Errors -> FETCH_FAILED
      2. HTTP Status Code -> BLOCKED (401, 403, 429) or HTTP_ERROR (4xx, 5xx)
      3. Bot Detection / CAPTCHA / Cloudflare challenges -> BLOCKED
      4. Missing Content -> EXTRACTION_FAILED
      5. Word Count Thresholds by PageType -> TOO_SHORT if below expected threshold
      6. Clean Valid Content -> VALID
    """
    _BOT_CHALLENGE_SIGNATURES = [
        "checking your browser",
        "just a moment...",
        "enable javascript and cookies to continue",
        "cf-browser-verification",
        "attention required! | cloudflare",
        "please complete the security check to access",
        "access denied | security check",
    ]

    # Contextual word count thresholds by page type
    _MIN_WORD_THRESHOLDS = {
        PageType.CONTACT: 20,
        PageType.CAREERS_INDEX: 50,
        PageType.JOB_LISTING: 50,
        PageType.ABOUT: 100,
        PageType.PRODUCT: 100,
        PageType.BLOG: 100,
        PageType.CASE_STUDY: 100,
        PageType.OTHER: 80,
    }

    @classmethod
    def evaluate(cls, doc: CrawledDocument) -> DocumentQuality:
        # 1. Network / Transport errors
        if doc.error:
            err_lower = doc.error.lower()
            if any(sig in err_lower for sig in [
                "timeout", "connection", "playwright", "failed to download",
                "fetch failed", "dns", "ssl", "name resolution",
            ]):
                return DocumentQuality.FETCH_FAILED

        # 2. HTTP Status Codes
        if doc.status_code:
            if doc.status_code in [401, 403, 429]:
                return DocumentQuality.BLOCKED
            if doc.status_code >= 400:
                return DocumentQuality.HTTP_ERROR

        # 3. Content emptiness
        if not doc.content or not doc.content.strip():
            return DocumentQuality.EXTRACTION_FAILED

        # 4. Bot Challenge / WAF Interception detection
        content_sample = (doc.content[:600] + " " + (doc.title or "")).lower()
        if any(sig in content_sample for sig in cls._BOT_CHALLENGE_SIGNATURES):
            return DocumentQuality.BLOCKED

        # 5. Page-type specific word count threshold
        min_words = cls._MIN_WORD_THRESHOLDS.get(doc.page_type, 100)
        word_count = doc.word_count if doc.word_count > 0 else len(doc.content.split())
        
        if word_count < min_words:
            return DocumentQuality.TOO_SHORT

        # 6. Valid document
        return DocumentQuality.VALID
