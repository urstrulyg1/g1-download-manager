export interface ThreatAnalysisResult {
  isSafe: boolean;
  threatLevel: 'SAFE' | 'SUSPICIOUS' | 'DANGEROUS';
  threatName?: string;
  reasons: string[];
}

export class SecurityPolicyEngine {
  public static analyzeDownloadThreat(filename: string, mimeType?: string, headerBytes?: Buffer): ThreatAnalysisResult {
    const reasons: string[] = [];
    let isSafe = true;
    let threatLevel: ThreatAnalysisResult['threatLevel'] = 'SAFE';

    const lowerName = filename.toLowerCase();

    // 1. Double extension attack (e.g. invoice.pdf.exe)
    if (/\.(pdf|doc|docx|jpg|png)\.(exe|scr|vbs|bat|cmd|pif|jar)$/i.test(lowerName)) {
      isSafe = false;
      threatLevel = 'DANGEROUS';
      reasons.push('Double extension detected (executable disguised as document/image).');
    }

    // 2. MIME type vs Extension conflict
    if (mimeType) {
      const lowerMime = mimeType.toLowerCase();
      if (
        (lowerName.endsWith('.jpg') || lowerName.endsWith('.png')) &&
        (lowerMime.includes('executable') || lowerMime.includes('octet-stream') || lowerMime.includes('msdownload'))
      ) {
        threatLevel = 'SUSPICIOUS';
        reasons.push(`MIME type (${mimeType}) conflicts with image file extension.`);
      }
    }

    // 3. Executable header inside non-executable extension
    if (headerBytes && headerBytes.length >= 4) {
      // Windows PE header "MZ" (0x4D 0x5A)
      if (headerBytes[0] === 0x4d && headerBytes[1] === 0x5a) {
        if (!lowerName.endsWith('.exe') && !lowerName.endsWith('.dll') && !lowerName.endsWith('.sys')) {
          isSafe = false;
          threatLevel = 'DANGEROUS';
          reasons.push('Executable binary (MZ/PE header) detected inside non-executable file.');
        }
      }
    }

    return {
      isSafe,
      threatLevel,
      threatName: reasons.length > 0 ? reasons[0] : undefined,
      reasons,
    };
  }
}
