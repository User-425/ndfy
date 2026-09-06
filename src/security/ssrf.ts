import net from 'node:net';

/**
 * Checks whether an IP address is in a private, loopback, link-local, or cloud metadata range.
 */
export function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) {
    return true; // Malformed IP treated as unsafe
  }

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Cloud Metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private network)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // ::1 (Loopback)
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
    // :: (Unspecified)
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
    // fe80::/10 (Link-local)
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    // fc00::/7 (Unique local address)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    if (normalized.startsWith('::ffff:')) {
      const ipv4Part = normalized.substring(7);
      if (net.isIPv4(ipv4Part)) {
        return isPrivateIp(ipv4Part);
      }
    }

    return false;
  }

  return true;
}

/**
 * Validate that a URL uses safe protocols (http/https) and does not point to internal IP hosts.
 */
export function validateSafeUrl(urlString: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: `Unsupported protocol ${parsed.protocol}. Only http and https are permitted.` };
    }

    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      return { valid: false, reason: 'Access to localhost and local network domains is restricted.' };
    }

    if (net.isIP(hostname) && isPrivateIp(hostname)) {
      return { valid: false, reason: `Access to private IP ${hostname} is restricted.` };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed URL' };
  }
}
