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

class MistralAPIError(Exception):
    """Raised when the Mistral API returns an unrecoverable error."""
    pass

class MistralLLMSynthesizer(ILLMSynthesizer):
    """
    Mistral API provider implementing ILLMSynthesizer.
    Supports JSON mode structured generation, observable LLMRunMetadata telemetry,
    and automatic exponential backoff retry on rate limits (429/503).
    """

    BASE_URL = "https://api.mistral.ai/v1/chat/completions"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "mistral-small-latest",
        timeout: float = 35.0,
        max_retries: int = 3,
    ):
        self.api_key = api_key or os.environ.get("MISTRAL_API_KEY")
        if not self.api_key:
            raise ValueError("Mistral API key must be provided or set in MISTRAL_API_KEY environment variable.")
        self.model = model
        self.timeout = timeout
        self.max_retries = max_retries
        self.last_metadata: Optional[LLMRunMetadata] = None

    def _call_mistral(
        self,
        prompt: str,
        system_instruction: str,
        stage: str,
        json_mode: bool = True,
        temperature: float = 0.1,
    ) -> str:
        """Invokes Mistral chat completions API with telemetry and error handling."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            start_time = time.perf_counter()
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.post(self.BASE_URL, headers=headers, json=payload)

                latency_ms = (time.perf_counter() - start_time) * 1000.0

                if response.status_code == 200:
                    data = response.json()
                    choices = data.get("choices", [])
                    if not choices:
                        raise MistralAPIError(f"No choices returned by Mistral API: {data}")
                    
                    content = choices[0].get("message", {}).get("content", "")

                    usage = data.get("usage", {})
                    self.last_metadata = LLMRunMetadata(
                        provider="mistral",
                        model=self.model,
                        stage=stage,
                        latency_ms=round(latency_ms, 2),
                        prompt_tokens=usage.get("prompt_tokens"),
                        candidate_tokens=usage.get("completion_tokens"),
                        total_tokens=usage.get("total_tokens"),
                    )
                    return content

                # Transient errors
                if response.status_code in (429, 503):
                    wait_time = 1.0 * (2 ** (attempt - 1))
                    logger.warning(
                        "Mistral API returned status %d on attempt %d/%d. Retrying in %.1fs...",
                        response.status_code, attempt, self.max_retries, wait_time
                    )
                    time.sleep(wait_time)
                    continue

                if response.status_code == 404:
                    raise MistralAPIError(f"Mistral model '{self.model}' not found (HTTP 404).")

                err_json = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                err_msg = err_json.get("message", response.text)
                raise MistralAPIError(f"Mistral API error {response.status_code}: {err_msg}")

            except (httpx.RequestError, httpx.TimeoutException) as e:
                last_error = e
                wait_time = 1.0 * (2 ** (attempt - 1))
                logger.warning("Network error calling Mistral (%s). Retrying in %.1fs...", e, wait_time)
                time.sleep(wait_time)

        raise MistralAPIError(f"Mistral API execution failed after {self.max_retries} attempts. Last error: {last_error}")

    def extract_claims(
        self,
        identity: CompanyIdentity,
        spans: List[EvidenceSpan],
    ) -> LLMResearchExtraction:
        """Stage 1: Extracts candidate claims and unknowns from numbered evidence spans."""
        prompt = LLMPromptBuilder.build_extraction_prompt(identity, spans)
        system_instruction = LLMPromptBuilder.SYSTEM_INSTRUCTIONS

        raw_json = self._call_mistral(
            prompt=prompt,
            system_instruction=system_instruction,
            stage="EXTRACTION",
            json_mode=True,
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
            logger.error("Failed to parse Mistral extraction JSON: %s\nRaw output:\n%s", e, raw_json)
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

        summary_text = self._call_mistral(
            prompt=prompt,
            system_instruction=system_instruction,
            stage="SUMMARY",
            json_mode=False,
            temperature=0.2,
        )

        return summary_text.strip()
