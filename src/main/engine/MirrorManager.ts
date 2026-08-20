export interface MirrorCandidate {
  url: string;
  domain: string;
  rttMs: number;
  throughputBytesPerSec: number;
  supportsRange: boolean;
  contentLength: number;
  etag?: string;
  isCompatible: boolean;
  reliabilityScore: number;
}

export class MirrorManager {
  private mirrors: Map<string, MirrorCandidate[]> = new Map();

  public registerMirrors(resourceKey: string, mirrorUrls: string[]): void {
    const list: MirrorCandidate[] = mirrorUrls.map((u) => ({
      url: u,
      domain: new URL(u).hostname,
      rttMs: 35,
      throughputBytesPerSec: 10 * 1024 * 1024,
      supportsRange: true,
      contentLength: 0,
      isCompatible: true,
      reliabilityScore: 90,
    }));
    this.mirrors.set(resourceKey, list);
  }

  public selectBestMirror(resourceKey: string): MirrorCandidate | undefined {
    const list = this.mirrors.get(resourceKey);
    if (!list || list.length === 0) return undefined;

    const compatible = list.filter((m) => m.isCompatible);
    return compatible.sort((a, b) => b.reliabilityScore - a.reliabilityScore || a.rttMs - b.rttMs)[0];
  }

  public recordMirrorFailure(resourceKey: string, failedUrl: string): void {
    const list = this.mirrors.get(resourceKey);
    if (list) {
      const match = list.find((m) => m.url === failedUrl);
      if (match) {
        match.reliabilityScore = Math.max(10, match.reliabilityScore - 30);
      }
    }
  }
}
