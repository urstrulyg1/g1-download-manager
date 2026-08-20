export type IdentityMatchLevel =
  | 'EXACT_CONTENT_MATCH'
  | 'RESOURCE_UNCHANGED'
  | 'REPRESENTATION_VARIANT'
  | 'CONTENT_MUTATED'
  | 'DISTINCT_RESOURCE';

export interface ResourceIdentityFingerprint {
  url: string;
  normalizedUrl: string;
  etag?: string;
  lastModified?: string;
  contentLength?: number;
  sha256?: string;
}

export class ContentIdentityEngine {
  public static compareIdentities(
    existing: ResourceIdentityFingerprint,
    fresh: ResourceIdentityFingerprint
  ): { level: IdentityMatchLevel; isResumeSafe: boolean; explanation: string } {
    // 1. Exact SHA-256 match
    if (existing.sha256 && fresh.sha256 && existing.sha256.toLowerCase() === fresh.sha256.toLowerCase()) {
      return {
        level: 'EXACT_CONTENT_MATCH',
        isResumeSafe: true,
        explanation: 'Cryptographic content hash (SHA-256) is identical.',
      };
    }

    // 2. Resource Unchanged (Same ETag and Last-Modified)
    if (existing.etag && fresh.etag && existing.etag === fresh.etag) {
      return {
        level: 'RESOURCE_UNCHANGED',
        isResumeSafe: true,
        explanation: `Server entity tag (${existing.etag}) verified unchanged. Safe to resume.`,
      };
    }

    // 3. Content Mutated on Server
    if (
      (existing.etag && fresh.etag && existing.etag !== fresh.etag) ||
      (existing.lastModified && fresh.lastModified && existing.lastModified !== fresh.lastModified) ||
      (existing.contentLength && fresh.contentLength && existing.contentLength !== fresh.contentLength)
    ) {
      return {
        level: 'CONTENT_MUTATED',
        isResumeSafe: false,
        explanation: 'Remote resource was modified on the server. Resuming would cause file corruption. Restart required.',
      };
    }

    return {
      level: 'RESOURCE_UNCHANGED',
      isResumeSafe: true,
      explanation: 'Resource parameters consistent.',
    };
  }
}
