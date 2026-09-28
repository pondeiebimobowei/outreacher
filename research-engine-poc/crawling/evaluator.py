from core.models import CrawledDocument, DocumentQuality

class DocumentQualityEvaluator:
    @staticmethod
    def evaluate(doc: CrawledDocument) -> DocumentQuality:
        if doc.error or doc.status_code in [401, 403, 429]:
            return DocumentQuality.BLOCKED
        if not doc.content:
            return DocumentQuality.EXTRACTION_FAILED
        if doc.word_count < 100:
            return DocumentQuality.TOO_SHORT
        return DocumentQuality.VALID
