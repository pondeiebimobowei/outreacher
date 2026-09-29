import os
import json
import time
import logging
from typing import List, Optional, Dict, Any
import httpx

from core.models import CompanyIdentity
from core.evidence import EvidenceSpan, Claim
from synthesis.base import ILLMSynthesizer
from synthesis.models import LLMResearchExtraction, LLMClaimCandidate, LLMRunMetadata
from synthesis.prompt import LLMPromptBuilder

logger = logging.getLogger(__name__)

class GeminiAPIError(Exception):
    """Raised when the Gemini API returns an unrecoverable error."""
    pass

EXTRACTION_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "claims": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "subject": {"type": "STRING"},
                    "predicate": {"type": "STRING"},
                    "object_value": {"type": "STRING"},
                    "category": {
                        "type": "STRING",
                        "enum": [
                            "OVERVIEW", "PRODUCT", "HIRING", "TECH_STACK",
                            "CUSTOMER", "TRACTION", "MISSION", "CONTACT"
                        ],
                    },
                    "classification": {
                        "type": "STRING",
                        "enum": ["FACT", "INFERENCE", "UNKNOWN"],
                    },
                    "evidence_span_ids": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                    "supporting_quotes": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                    "confidence": {"type": "NUMBER"},
                    "reasoning": {"type": "STRING"},
                },
                "required": [
                    "subject", "predicate", "object_value",
                    "category", "classification",
                ],
            },
        },
        "unknowns": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
        },
    },
    "required": ["claims", "unknowns"],
}

class GeminiLLMSynthesizer(ILLMSynthesizer):
    """
    Google Gemini API provider implementing ILLMSynthesizer.
    Supports OpenAPI responseSchema structured generation, observable LLMRunMetadata telemetry,
    and automatic retry on transient rate limits (429/503).
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
        self.fallback_models = list(fallback_models) if fallback_models is not None else []
        self.timeout = timeout
        self.max_retries = max_retries
        self.last_metadata: Optional[LLMRunMetadata] = None

    def _call_gemini(
        self,
        prompt: str,
        system_instruction: str,
        stage: str,
        response_mime_type: str = "application/json",
        response_schema: Optional[Dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> str:
        """Invokes Gemini generateContent API with explicit schema and observable metadata."""
        candidate_models = [self.model] + [m for m in self.fallback_models if m != self.model]
        last_error = None

        headers = {
            "Content-Type": "application/json",
            "X-goog-api-key": self.api_key,
        }

        generation_config: Dict[str, Any] = {
            "temperature": temperature,
            "responseMimeType": response_mime_type,
        }
        if response_schema is not None:
            generation_config["responseSchema"] = response_schema

        payload: Dict[str, Any] = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "systemInstruction": {
                "parts": [{"text": system_instruction}]
            },
            "generationConfig": generation_config,
        }

        for model_name in candidate_models:
            endpoint = f"{self.BASE_URL}/{model_name}:generateContent"

            for attempt in range(1, self.max_retries + 1):
                start_time = time.perf_counter()
                try:
                    with httpx.Client(timeout=self.timeout) as client:
                        response = client.post(endpoint, headers=headers, json=payload)
                    
                    latency_ms = (time.perf_counter() - start_time) * 1000.0

                    if response.status_code == 200:
                        data = response.json()
                        candidates = data.get("candidates", [])
                        if not candidates:
                            raise GeminiAPIError(f"No candidates returned by Gemini: {data}")
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if not parts:
                            raise GeminiAPIError(f"No parts returned in candidate content: {data}")

                        # Extract token telemetry
                        usage = data.get("usageMetadata", {})
                        self.last_metadata = LLMRunMetadata(
                            provider="google",
                            model=model_name,
                            stage=stage,
                            latency_ms=round(latency_ms, 2),
                            prompt_tokens=usage.get("promptTokenCount"),
                            candidate_tokens=usage.get("candidatesTokenCount"),
                            total_tokens=usage.get("totalTokenCount"),
                        )
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

                    # Explicit 404 error handling: do not silently mask invalid configured model unless fallbacks configured
                    if response.status_code == 404:
                        if self.fallback_models and model_name != candidate_models[-1]:
                            logger.warning("Gemini model %s returned 404. Attempting configured fallback...", model_name)
                            break
                        raise GeminiAPIError(f"Configured Gemini model '{model_name}' was not found or is unavailable (HTTP 404).")

                    # Other client/server errors
                    err_json = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                    err_msg = err_json.get("error", {}).get("message", response.text)
                    raise GeminiAPIError(f"Gemini API returned status {response.status_code}: {err_msg}")

                except (httpx.RequestError, httpx.TimeoutException) as e:
                    last_error = e
                    wait_time = 1.0 * (2 ** (attempt - 1))
                    logger.warning("Network error contacting Gemini (%s). Retrying in %.1fs...", e, wait_time)
                    time.sleep(wait_time)

        raise GeminiAPIError(f"Gemini model execution failed. Last error: {last_error}")

    def extract_claims(
        self,
        identity: CompanyIdentity,
        spans: List[EvidenceSpan],
    ) -> LLMResearchExtraction:
        """Stage 1: Extracts candidate claims and unknowns with OpenAPI responseSchema constraint."""
        prompt = LLMPromptBuilder.build_extraction_prompt(identity, spans)
        system_instruction = LLMPromptBuilder.SYSTEM_INSTRUCTIONS

        raw_json = self._call_gemini(
            prompt=prompt,
            system_instruction=system_instruction,
            stage="EXTRACTION",
            response_mime_type="application/json",
            response_schema=EXTRACTION_RESPONSE_SCHEMA,
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
                subj = item.get("subject") or identity.name
                pred = item.get("predicate") or "operates_as"
                obj = item.get("object_value") or item.get("claim") or item.get("value") or ""
                cat = item.get("category") or "OVERVIEW"
                classification = item.get("classification")
                
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
                metadata=self.last_metadata,
            )
        except Exception as e:
            logger.error("Failed to parse Gemini extraction JSON: %s\nRaw output:\n%s", e, raw_json)
            return LLMResearchExtraction(claims=[], unknowns=[], metadata=self.last_metadata)

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
            stage="SUMMARY",
            response_mime_type="text/plain",
            response_schema=None,
            temperature=0.2,
        )

        return summary_text.strip()
