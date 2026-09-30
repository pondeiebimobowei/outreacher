"""
identity/lexicon.py — Lexical classification for brand distinctiveness and shape-risk arbitration (Track 3)
"""

from pathlib import Path
from typing import Set, Optional

_DICTIONARY_SET: Optional[Set[str]] = None


def _get_dictionary() -> Set[str]:
    global _DICTIONARY_SET
    if _DICTIONARY_SET is not None:
        return _DICTIONARY_SET

    data_path = Path(__file__).parent / "data" / "common_english_words.txt"
    if not data_path.is_file():
        raise FileNotFoundError(
            f"Safety-critical lexicon file '{data_path}' is missing. "
            f"Cannot evaluate lexical collision risk without canonical frequency resource."
        )

    try:
        with open(data_path, "r", encoding="utf-8") as f:
            words = {line.strip().lower() for line in f if line.strip()}
    except Exception as e:
        raise RuntimeError(f"Failed to load lexicon file '{data_path}': {e}") from e

    if not words:
        raise RuntimeError(f"Lexicon file '{data_path}' is empty.")

    _DICTIONARY_SET = words
    return _DICTIONARY_SET


def is_dictionary_word(token: str) -> bool:
    """Returns True if the token is in the standard English frequency dictionary."""
    if not token:
        return False
    norm = token.lower().strip()
    return norm in _get_dictionary()


def has_low_lexical_collision_risk(token: str) -> bool:
    """
    Returns True if the token is not a common dictionary word (low English lexical collision risk).
    Note: English frequency absence is a risk reduction signal, not a universal proof of uniqueness.
    """
    if not token or len(token) < 3:
        return False
    return not is_dictionary_word(token)

