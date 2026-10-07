import * as net from 'net';

const UNSAFE_HOSTNAMES = new Set(['localhost', '0.0.0.0', '127.0.0.1', '::1', '::']);
const UNSAFE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan'];

export function isSafePublicDestination(target: string | null | undefined): boolean {
  if (!target || typeof target !== 'string') {
    return false;
  }

  const trimmed = target.trim();
  if (!trimmed) {
    return false;
  }

  let parsedUrl: URL;
  try {
    if (trimmed.includes('://')) {
      parsedUrl = new URL(trimmed);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return false;
      }
    } else {
      parsedUrl = new URL(`https://${trimmed}`);
    }
  } catch {
    return false;
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    return false;
  }

  if (UNSAFE_HOSTNAMES.has(hostname)) {
    return false;
  }

  for (const suffix of UNSAFE_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return false;
    }
  }

  // Reject decimal IP representations (e.g. 2130706433)
  if (/^\d+$/.test(hostname)) {
    return false;
  }

  // Check IP addresses
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    const parts = hostname.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return false;
    }
    const [p0, p1] = parts;
    // 0.0.0.0/8
    if (p0 === 0) return false;
    // Loopback 127.0.0.0/8
    if (p0 === 127) return false;
    // Private RFC1918 10.0.0.0/8
    if (p0 === 10) return false;
    // Private RFC1918 172.16.0.0/12
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return false;
    // Private RFC1918 192.168.0.0/16
    if (p0 === 192 && p1 === 168) return false;
    // Link-local 169.254.0.0/16
    if (p0 === 169 && p1 === 254) return false;
    // CGNAT 100.64.0.0/10
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return false;
    // Multicast 224.0.0.0/4 and Reserved 240.0.0.0/4
    if (p0 >= 224) return false;
  } else if (ipVersion === 6) {
    if (hostname === '::1' || hostname === '::') return false;
    // IPv4-mapped IPv6 ::ffff:x.x.x.x
    if (hostname.startsWith('::ffff:')) {
      const v4Part = hostname.slice(7);
      return isSafePublicDestination(v4Part);
    }
    // Link-local fe80::/10
    if (hostname.startsWith('fe80:')) return false;
    // Unique local fc00::/7
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) return false;
  }

  return true;
}
