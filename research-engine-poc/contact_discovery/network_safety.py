"""
Network and SSRF Safety Validator for Contact Discovery.
Validates target URLs prior to any network dispatch to prevent SSRF and unsafe acquisition.
"""

import ipaddress
import re
from typing import Optional
from urllib.parse import urlparse

from core.urls import normalize_domain


_UNSAFE_HOSTNAMES = {
    "localhost",
    "0.0.0.0",
    "127.0.0.1",
    "::1",
    "::",
}

_UNSAFE_HOST_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".lan",
)


class UnsafeTargetUrlError(Exception):
    """Raised when a target URL violates network safety or SSRF restrictions."""
    pass


def is_safe_target_url(url: str) -> bool:
    """
    Checks if a target URL is safe for network dispatch.
    Returns True if safe, False otherwise.
    """
    try:
        validate_target_url(url)
        return True
    except UnsafeTargetUrlError:
        return False


def validate_target_url(url: str) -> None:
    """
    Validates that a URL is a safe public web destination:
      - Enforces http or https scheme only.
      - Rejects localhost and local domain suffixes (.local, .internal, etc.).
      - Rejects loopback, private (RFC1918), link-local, carrier-grade NAT, and reserved IP addresses.
      - Rejects raw integer/hex/octal encoded IP evasions.
    Raises UnsafeTargetUrlError if the URL is unsafe.
    """
    if not url or not isinstance(url, str):
        raise UnsafeTargetUrlError("URL must be a non-empty string")

    raw = url.strip()
    if not raw:
        raise UnsafeTargetUrlError("URL cannot be empty")

    try:
        parsed = urlparse(raw)
    except Exception as e:
        raise UnsafeTargetUrlError(f"Malformed URL: {e}")

    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        raise UnsafeTargetUrlError(f"Disallowed URL scheme '{scheme}'. Only http and https are permitted.")

    hostname = parsed.hostname
    if not hostname:
        raise UnsafeTargetUrlError("URL is missing a valid hostname")

    host_lower = hostname.lower().strip("[]")

    # 1. Reject well-known unsafe hostnames
    if host_lower in _UNSAFE_HOSTNAMES or host_lower.endswith(_UNSAFE_HOST_SUFFIXES):
        raise UnsafeTargetUrlError(f"Unsafe destination hostname '{hostname}'")

    # 2. Check for numeric / decimal / octal IP representations (e.g. 2130706433 or 0177.0.0.1)
    if re.match(r"^\d+$", host_lower):
        raise UnsafeTargetUrlError(f"Unsafe decimal IP hostname '{hostname}'")

    # 3. Check IP address ranges
    try:
        ip = ipaddress.ip_address(host_lower)
        if ip.is_loopback:
            raise UnsafeTargetUrlError(f"Loopback IP address '{host_lower}' is rejected")
        if ip.is_private:
            raise UnsafeTargetUrlError(f"Private RFC1918/ULA IP address '{host_lower}' is rejected")
        if ip.is_link_local:
            raise UnsafeTargetUrlError(f"Link-local IP address '{host_lower}' is rejected")
        if ip.is_unspecified:
            raise UnsafeTargetUrlError(f"Unspecified IP address '{host_lower}' is rejected")
        if ip.is_multicast or ip.is_reserved:
            raise UnsafeTargetUrlError(f"Reserved or multicast IP address '{host_lower}' is rejected")
    except ValueError:
        # Not a raw IP literal; hostname is a regular domain name
        pass


def is_safe_redirect(final_url: str, expected_domain: str) -> bool:
    """
    Validates that a redirected URL remains within the expected company's first-party domain boundary.
    A request originating from the expected domain must not permit arbitrary off-domain acquisition.
    """
    try:
        validate_target_url(final_url)
    except UnsafeTargetUrlError:
        return False

    if not expected_domain:
        return False

    final_host = normalize_domain(final_url)
    canon_expected = normalize_domain(expected_domain)

    if not final_host or not canon_expected:
        return False

    return final_host == canon_expected or final_host.endswith("." + canon_expected)
