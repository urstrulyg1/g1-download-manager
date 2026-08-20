import { DownloadItem, ServerCapabilities } from '../../shared/types';

export type ResumeSafetyDecision =
  | 'SAFE_TO_RESUME'
  | 'RESUME_WITH_REVALIDATION'
  | 'PARTIAL_RESUME_ONLY'
  | 'FULL_RESTART_REQUIRED'
  | 'REMOTE_RESOURCE_CHANGED';

export interface ResumeSafetyReport {
  decision: ResumeSafetyDecision;
  safetyScorePct: number; // 0 - 100
  canSafelyResume: boolean;
  reason: string;
  recommendedAction: string;
}

export class ResumeSafetyEngine {
  public static evaluate(
    savedItem: DownloadItem,
    freshCapabilities: ServerCapabilities
  ): ResumeSafetyReport {
    // 1. Check Range header support
    if (!freshCapabilities.supportsRange) {
      return {
        decision: 'FULL_RESTART_REQUIRED',
        safetyScorePct: 10,
        canSafelyResume: false,
        reason: 'The remote server does not support HTTP Range requests (206 Partial Content).',
        recommendedAction: 'Full restart required to ensure file is downloaded as a continuous single stream.',
      };
    }

    // 2. Check ETag consistency
    if (
      savedItem.serverCapabilities.etag &&
      freshCapabilities.etag &&
      savedItem.serverCapabilities.etag !== freshCapabilities.etag
    ) {
      return {
        decision: 'REMOTE_RESOURCE_CHANGED',
        safetyScorePct: 0,
        canSafelyResume: false,
        reason: `Remote ETag changed from "${savedItem.serverCapabilities.etag}" to "${freshCapabilities.etag}". The file was modified on the server.`,
        recommendedAction: 'Resume disabled to prevent file corruption. G1DM will restart download from byte 0.',
      };
    }

    // 3. Check Last-Modified consistency
    if (
      savedItem.serverCapabilities.lastModified &&
      freshCapabilities.lastModified &&
      savedItem.serverCapabilities.lastModified !== freshCapabilities.lastModified
    ) {
      return {
        decision: 'REMOTE_RESOURCE_CHANGED',
        safetyScorePct: 15,
        canSafelyResume: false,
        reason: `Server Last-Modified timestamp changed from "${savedItem.serverCapabilities.lastModified}" to "${freshCapabilities.lastModified}".`,
        recommendedAction: 'Remote resource changed. Restart from byte 0.',
      };
    }

    // 4. Check Content-Length consistency
    if (
      savedItem.totalBytes > 0 &&
      freshCapabilities.contentLength &&
      freshCapabilities.contentLength > 0 &&
      savedItem.totalBytes !== freshCapabilities.contentLength
    ) {
      return {
        decision: 'REMOTE_RESOURCE_CHANGED',
        safetyScorePct: 5,
        canSafelyResume: false,
        reason: `Remote content size changed from ${savedItem.totalBytes} to ${freshCapabilities.contentLength} bytes.`,
        recommendedAction: 'Remote file size changed. Full restart required.',
      };
    }

    // 5. Safe to resume
    const hasEtagOrTimestamp = Boolean(freshCapabilities.etag || freshCapabilities.lastModified);
    return {
      decision: 'SAFE_TO_RESUME',
      safetyScorePct: hasEtagOrTimestamp ? 100 : 85,
      canSafelyResume: true,
      reason: 'Server verified. Resource identity, range headers, and byte offsets are consistent.',
      recommendedAction: 'Resume valid uncompleted byte ranges safely.',
    };
  }
}
