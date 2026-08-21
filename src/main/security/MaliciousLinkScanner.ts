import { ProbeResult } from '../engine/ProbeService';

export interface UrlSafetyScanResult {
  url: string;
  isSafe: boolean;
  riskScore: number; // 0 to 100
  riskLevel: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK' | 'CRITICAL_MALICIOUS';
  threatType:
    | 'SAFE'
    | 'PHISHING_URL'
    | 'DRIVE_BY_MALWARE'
    | 'SUSPICIOUS_IP_DOWNLOAD'
    | 'DISGUISED_EXECUTABLE'
    | 'MIME_SPOOFING'
    | 'HIGH_REDIRECT_CHAIN';
  warningTitle: string;
  warningDetails: string;
  reasons: string[];
  recommendation: string;
  requireUserOverride: boolean;
  scannedAt: number;
}

export class MaliciousLinkScanner {
  private static highRiskTlds = new Set(['zip', 'mov', 'top', 'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'click', 'cam', 'ru', 'su', 'xyz', 'country', 'stream']);
  private static dynamicDnsDomains = ['ngrok.io', 'serveo.net', 'loca.lt', 'trycloudflare.com', 'duckdns.org', 'no-ip.com'];
  private static brandPhishingKeywords = ['paypal', 'bankofamerica', 'chase-security', 'appleid', 'google-drive-login', 'microsoft-online-update', 'metamask', 'coinbase', 'binance-auth'];
  private static dangerousExtensions = new Set(['exe', 'scr', 'vbs', 'bat', 'cmd', 'pif', 'ps1', 'jar', 'msi', 'hta', 'cpl', 'wsf']);

  public static scanUrl(targetUrl: string, probeResult?: ProbeResult): UrlSafetyScanResult {
    const reasons: string[] = [];
    let riskScore = 0;
    let threatType: UrlSafetyScanResult['threatType'] = 'SAFE';

    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return {
        url: targetUrl,
        isSafe: false,
        riskScore: 100,
        riskLevel: 'CRITICAL_MALICIOUS',
        threatType: 'PHISHING_URL',
        warningTitle: '⛔ Invalid / Malformed URL Vector',
        warningDetails: 'The target URL could not be safely parsed.',
        reasons: ['Malformed URL structure'],
        recommendation: 'Do not attempt to open or download this invalid link.',
        requireUserOverride: true,
        scannedAt: Date.now(),
      };
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    // Loopback IP Check (127.0.0.1, localhost, ::1 are local dev/test servers)
    const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';

    // 1. Raw External IP Hostname Check
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    if (isIPv4 && !isLoopback) {
      const port = parsedUrl.port;
      if (port && port !== '80' && port !== '443') {
        riskScore += 45;
        threatType = 'SUSPICIOUS_IP_DOWNLOAD';
        reasons.push(`Direct IP download from unverified public server (${hostname}:${port})`);
      } else {
        riskScore += 25;
        reasons.push(`Direct IP download without domain name (${hostname})`);
      }
    }

    // 2. High-Risk TLD & Dynamic Tunnel Domain Check
    if (!isLoopback) {
      const domainParts = hostname.split('.');
      const tld = domainParts[domainParts.length - 1];
      if (this.highRiskTlds.has(tld)) {
        riskScore += 25;
        reasons.push(`High-risk domain extension (.${tld}) frequently associated with malware distribution`);
      }

      for (const dynDomain of this.dynamicDnsDomains) {
        if (hostname.endsWith(dynDomain)) {
          riskScore += 45;
          threatType = 'SUSPICIOUS_IP_DOWNLOAD';
          reasons.push(`Dynamic tunnel endpoint domain (${dynDomain}) used for ephemeral C2 payload delivery`);
          break;
        }
      }

      // 3. Phishing Typosquatting Brand Keywords
      for (const brand of this.brandPhishingKeywords) {
        if (hostname.includes(brand) && !hostname.endsWith(`.${brand}.com`) && !hostname.endsWith(`.${brand}.org`)) {
          riskScore += 50;
          threatType = 'PHISHING_URL';
          reasons.push(`Potential brand impersonation / phishing keywords (${brand}) in domain name`);
          break;
        }
      }
    }

    // 4. Double Extension Attack
    if (/\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png|mp4|zip)\.(exe|scr|vbs|bat|cmd|pif|ps1|jar|msi)$/i.test(pathname)) {
      riskScore += 60;
      threatType = 'DISGUISED_EXECUTABLE';
      reasons.push('Double extension detected (executable binary disguised as a document, image, or media file)');
    }

    // 5. Dangerous Executable Payload Extension
    const fileExt = pathname.split('.').pop() || '';
    if (this.dangerousExtensions.has(fileExt)) {
      riskScore += 30;
      if (threatType === 'SAFE') threatType = 'DRIVE_BY_MALWARE';
      reasons.push(`Direct executable installer/script payload (.${fileExt})`);
    }

    // 6. Pre-Flight Probe Header Anomalies
    if (probeResult) {
      const mimeType = probeResult.mimeType.toLowerCase();
      const capabilities = probeResult.capabilities;

      // MIME vs extension spoofing
      if (
        (pathname.endsWith('.pdf') || pathname.endsWith('.jpg') || pathname.endsWith('.png') || pathname.endsWith('.txt')) &&
        (mimeType.includes('executable') || mimeType.includes('octet-stream') || mimeType.includes('msdownload'))
      ) {
        riskScore += 50;
        threatType = 'MIME_SPOOFING';
        reasons.push(`MIME type conflict: Server returned executable binary (${mimeType}) for non-executable extension`);
      }

      // Suspicious Redirect Chain
      if (capabilities.redirectChain && capabilities.redirectChain.length >= 3) {
        riskScore += 20;
        if (threatType === 'SAFE') threatType = 'HIGH_REDIRECT_CHAIN';
        reasons.push(`Complex redirect chain (${capabilities.redirectChain.length} hops across domains)`);
      }
    }

    // Determine Risk Level
    let riskLevel: UrlSafetyScanResult['riskLevel'] = 'SAFE';
    let warningTitle = '✓ Safe Link Verification';
    let warningDetails = 'No known malicious URL signatures or suspicious file characteristics detected.';
    let recommendation = 'Safe to download.';
    let requireUserOverride = false;

    if (riskScore >= 70) {
      riskLevel = 'CRITICAL_MALICIOUS';
      warningTitle = '⛔ CRITICAL: Malicious URL / High-Risk Malware Payload Flagged!';
      warningDetails = 'This link exhibits severe malicious characteristics including potential phishing, disguised executable payloads, or C2 dynamic endpoints.';
      recommendation = 'DO NOT DOWNLOAD. This link is flagged as highly dangerous and may compromise your local device.';
      requireUserOverride = true;
    } else if (riskScore >= 45) {
      riskLevel = 'HIGH_RISK';
      warningTitle = '⚠️ HIGH RISK: Suspicious Download Source Warning';
      warningDetails = 'This download source displays suspicious characteristics such as dynamic tunnel endpoints or MIME type mismatches.';
      recommendation = 'Exercise extreme caution. Verify the download source before proceeding.';
      requireUserOverride = true;
    } else if (riskScore >= 30) {
      riskLevel = 'SUSPICIOUS';
      warningTitle = '⚡ Caution: Executable Script / Unverified Source';
      warningDetails = 'This link originates from an unverified IP or direct script payload.';
      recommendation = 'Review download details before proceeding.';
      requireUserOverride = false;
    }

    return {
      url: targetUrl,
      isSafe: riskScore < 45,
      riskScore,
      riskLevel,
      threatType,
      warningTitle,
      warningDetails,
      reasons,
      recommendation,
      requireUserOverride,
      scannedAt: Date.now(),
    };
  }
}
