"""
identity/lexicon.py — Lexical classification for brand distinctiveness and shape-risk arbitration (Track 3)
"""

import os
from pathlib import Path
from typing import Set, Optional

_DICTIONARY_SET: Optional[Set[str]] = None

# Fallback set of known collision dictionary words if dictionary files are absent
_CORE_DICTIONARY_FALLBACK = {
    "acme", "apex", "summit", "vertex", "nexus", "global", "general", "standard",
    "national", "united", "universal", "premier", "prime", "beacon", "pinnacle",
    "matrix", "fusion", "core", "horizon", "delta", "alpha", "omega", "target",
    "allied", "central", "first", "direct", "select", "pioneer", "atlas", "mercury",
    "focus", "venture", "crest", "stride", "pulse", "craft", "spark", "scale",
    "sphere", "pillar", "monolith", "kite", "loom", "linear", "relay", "vector",
    "vanguard", "anchor", "bridge", "forge", "haven", "trace", "zenith", "compass",
    "catalyst", "flock", "roost", "nest", "hive", "grove", "drift", "bench", "slate",
}


def _get_dictionary() -> Set[str]:
    global _DICTIONARY_SET
    if _DICTIONARY_SET is not None:
        return _DICTIONARY_SET

    words: Set[str] = set()
    
    # 1. Primary: Bundled common_english_words.txt
    data_path = Path(__file__).parent / "data" / "common_english_words.txt"
    if data_path.is_file():
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                words = {line.strip().lower() for line in f if line.strip()}
        except Exception:
            pass

    # 2. Secondary fallback: System dictionary
    if not words and os.path.exists("/usr/share/dict/words"):
        try:
            with open("/usr/share/dict/words", "r", encoding="utf-8") as f:
                words = {line.strip().lower() for line in f if line.strip()}
        except Exception:
            pass

    # 3. Final fallback: Core set
    if not words:
        words = set(_CORE_DICTIONARY_FALLBACK)

    _DICTIONARY_SET = words
    return _DICTIONARY_SET


def is_dictionary_word(token: str) -> bool:
    """Returns True if the token is a standard dictionary word."""
    if not token:
        return False
    norm = token.lower().strip()
    return norm in _get_dictionary()


def is_coined_brand(token: str) -> bool:
    """Returns True if the token is a coined neologism (not a common dictionary word)."""
    if not token or len(token) < 3:
        return False
    return not is_dictionary_word(token)
