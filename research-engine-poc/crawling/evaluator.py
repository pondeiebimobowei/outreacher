from core.models import CrawledDocument, DocumentQuality

class DocumentQualityEvaluator:
    @staticmethod
    def evaluate(doc: CrawledDocument) -> DocumentQuality:
        if doc.error:
            err_lower = doc.error.lower()
            if "timeout" in err_lower or "connection" in err_lower or "playwright" in err_lower or "failed to download" in err_lower or "fetch failed" in err_lower:
                return DocumentQuality.FETCH_FAILED
                
        if doc.status_code:
            if doc.status_code in [401, 403, 429]:
                return DocumentQuality.BLOCKED
            if doc.status_code >= 400:
                return DocumentQuality.HTTP_ERROR
                
        if not doc.content:
            return DocumentQuality.EXTRACTION_FAILED
            
        if doc.word_count < 100:
            return DocumentQuality.TOO_SHORT
            
        return DocumentQuality.VALID
