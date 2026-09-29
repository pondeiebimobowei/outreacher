import os
import json
import time
import logging
from typing import List, Optional, Dict, Any
import httpx

from core.models import CompanyIdentity
from core.evidence import EvidenceSpan, Claim
from synthesis.base import ILLMSynthesizer
from synthesis.models import LLMResearchExtraction, LLMClaimCandidate
from synthesis.prompt import LLMPromptBuilder

logger = logging.getLogger(__name__)

class GeminiAPIError(Exception):
    """Raised when the Gemini API returns an unrecoverable error."""
    pass

class GeminiLLMSynthesizer(ILLMSynthesizer):
    """
    Google Gemini API provider implementing ILLMSynthesizer.
    Supports structured JSON generation, automatic retry on transient errors (503/429),
    and model fallbacks.
    """

    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gemini-3.5-flash-lite",
        fallback_models: Optional[List[str]] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("Gemini API key must be provided or set in GEMINI_API_KEY environment variable.")
        self.model = model
        self.fallback_models = fallback_models if fallback_models is not None else [
            "gemini-3.1-flash-lite",
            "gemini-3.8-flash",
            "gemini-flash-lite-latest",
        ]
        self.timeout = timeout
        self.max_retries = max_retries

    def _call_gemini(
        self,
        prompt: str,
        system_instruction: str,
        response_mime_type: str = "application/json",
        temperature: float = 0.2,
    ) -> str:
        """Invokes Gemini generateContent API with exponential backoff and model fallbacks."""
        candidate_models = [self.model] + [m for m in self.fallback_models if m != self.model]
        last_error = None

        headers = {
            "Content-Type": "application/json",
            "X-goog-api-key": self.api_key,
        }

        payload: Dict[str, Any] = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "systemInstruction": {
                "parts": [{"text": system_instruction}]
            },
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": response_mime_type,
            },
        }

        for model_name in candidate_models:
            endpoint = f"{self.BASE_URL}/{model_name}:generateContent"

            for attempt in range(1, self.max_retries + 1):
                try:
                    with httpx.Client(timeout=self.timeout) as client:
                        response = client.post(endpoint, headers=headers, json=payload)
                    
                    if response.status_code == 200:
                        data = response.json()
                        candidates = data.get("candidates", [])
                        if not candidates:
                            raise GeminiAPIError(f"No candidates returned by Gemini: {data}")
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if not parts:
                            raise GeminiAPIError(f"No parts returned in candidate content: {data}")
                        return parts[0].get("text", "")

                    # Transient errors: 429 Rate Limit or 503 High Demand
                    if response.status_code in (429, 503):
                        wait_time = 1.0 * (2 ** (attempt - 1))
                        logger.warning(
                            "Gemini model %s returned status %d on attempt %d/%d. Retrying in %.1fs...",
                            model_name, response.status_code, attempt, self.max_retries, wait_time
                        )
                        time.sleep(wait_time)
                        continue

                    # Deprecated / Not found model (404) -> switch to next model immediately
                    if response.status_code == 404:
                        logger.warning("Gemini model %s returned 404 (unavailable). Trying fallback model...", model_name)
                        break

                    # Other client/server errors
                    err_json = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                    err_msg = err_json.get("error", {}).get("message", response.text)
                    raise GeminiAPIError(f"Gemini API returned status {response.status_code}: {err_msg}")

                except (httpx.RequestError, httpx.TimeoutException) as e:
                    last_error = e
                    wait_time = 1.0 * (2 ** (attempt - 1))
                    logger.warning("Network error contacting Gemini (%s). Retrying in %.1fs...", e, wait_time)
                    time.sleep(wait_time)

        raise GeminiAPIError(f"All Gemini models and retries failed. Last error: {last_error}")

    def extract_claims(
        self,
        identity: CompanyIdentity,
        spans: List[EvidenceSpan],
    ) -> LLMResearchExtraction:
        """Stage 1: Extracts candidate claims and unknowns from numbered evidence spans."""
        prompt = LLMPromptBuilder.build_extraction_prompt(identity, spans)
        system_instruction = LLMPromptBuilder.SYSTEM_INSTRUCTIONS

        raw_json = self._call_gemini(
            prompt=prompt,
            system_instruction=system_instruction,
            response_mime_type="application/json",
            temperature=0.1,
        )

        try:
            data = json.loads(raw_json)
            raw_claims = []
            raw_unknowns = []

            if isinstance(data, dict):
                raw_claims = data.get("claims", [])
                raw_unknowns = data.get("unknowns", [])
            elif isinstance(data, list):
                raw_claims = data

            parsed_candidates: List[LLMClaimCandidate] = []
            for item in raw_claims:
                if not isinstance(item, dict):
                    continue
                # Normalize field aliases if present
                subj = item.get("subject") or identity.name
                pred = item.get("predicate") or "operates_as"
                obj = item.get("object_value") or item.get("claim") or item.get("value") or ""
                cat = item.get("category") or "OVERVIEW"
                classification = item.get("classification")
                
                # Normalize if category and classification were inverted
                if cat in ("FACT", "INFERENCE", "UNKNOWN"):
                    classification = cat
                    cat = "OVERVIEW"
                if not classification:
                    classification = "FACT" if (item.get("evidence_span_ids") or item.get("evidence_ids")) else "UNKNOWN"

                evidence_refs = item.get("evidence_span_ids") or item.get("evidence_ids") or []
                quotes = item.get("supporting_quotes") or item.get("quotes") or []
                try:
                    conf = float(item.get("confidence", 0.85 if classification == "FACT" else (0.65 if classification == "INFERENCE" else 0.0)))
                except (ValueError, TypeError):
                    conf = 0.85 if classification == "FACT" else 0.65

                parsed_candidates.append(LLMClaimCandidate(
                    subject=str(subj),
                    predicate=str(pred),
                    object_value=str(obj),
                    category=cat,
                    classification=classification,
                    evidence_span_ids=list(evidence_refs),
                    supporting_quotes=list(quotes),
                    confidence=conf,
                    reasoning=item.get("reasoning"),
                ))

            return LLMResearchExtraction(
                claims=parsed_candidates,
                unknowns=[str(u) for u in raw_unknowns if u],
            )
        except Exception as e:
            logger.error("Failed to parse Gemini extraction JSON: %s\nRaw output:\n%s", e, raw_json)
            return LLMResearchExtraction(claims=[], unknowns=[])

    def synthesize_summary(
        self,
        identity: CompanyIdentity,
        claims: List[Claim],
    ) -> str:
        """Stage 2: Synthesizes a concise grounded summary using ONLY accepted claims."""
        if not claims:
            return ""

        prompt = LLMPromptBuilder.build_summary_prompt(identity, claims)
        system_instruction = LLMPromptBuilder.SUMMARY_SYSTEM_INSTRUCTIONS

        summary_text = self._call_gemini(
            prompt=prompt,
            system_instruction=system_instruction,
            response_mime_type="text/plain",
            temperature=0.2,
        )

        return summary_text.strip()
