"""Canonical document text flattening for Contact Discovery grounding."""

import html
import re


def flatten_canonical_text(raw_html_or_text: str) -> str:
    """Normalize raw HTML or document text into flattened canonical text.

    Guarantees:
    - Strips scripts, styles, noscript tags.
    - Strips HTML markup while preserving text boundaries.
    - Decodes HTML entities (e.g. &amp;, &quot;, &eacute;).
    - Normalizes contiguous whitespace.
    - Excerpts extracted from this text are exact substrings.
    """
    if not raw_html_or_text:
        return ""

    # Strip script and style blocks
    cleaned = re.sub(
        r"<(script|style|noscript)[^>]*>.*?</\1>",
        " ",
        raw_html_or_text,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # Replace block-level tags with newlines to preserve structural boundaries
    cleaned = re.sub(
        r"</?(?:div|p|h[1-6]|li|tr|br|section|article|header|footer|nav|main)[^>]*>",
        "\n",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Strip remaining HTML tags
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)

    # Decode HTML entities
    cleaned = html.unescape(cleaned)

    # Normalize horizontal whitespace on each line
    cleaned = re.sub(r"[ \t\r\f\v]+", " ", cleaned)

    # Clean up empty lines and reconstruct text
    lines = [re.sub(r"\s+", " ", line).strip() for line in cleaned.split("\n")]
    cleaned = "\n".join(line for line in lines if line)

    return cleaned
