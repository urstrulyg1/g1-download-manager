import { HlsMediaSegment } from './MediaManifestParser';

export interface TimelineEntry {
  segmentIndex: number;
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
  url: string;
  isDiscontinuity: boolean;
}

export class HlsTimeline {
  public static buildTimeline(segments: HlsMediaSegment[]): TimelineEntry[] {
    const timeline: TimelineEntry[] = [];
    let currentTime = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const duration = seg.durationSec > 0 ? seg.durationSec : 6.0;
      timeline.push({
        segmentIndex: i + 1,
        startTimeSec: currentTime,
        endTimeSec: currentTime + duration,
        durationSec: duration,
        url: seg.url,
        isDiscontinuity: Boolean(seg.isDiscontinuity),
      });
      currentTime += duration;
    }

    return timeline;
  }

  public static getTotalDuration(timeline: TimelineEntry[]): number {
    if (timeline.length === 0) return 0;
    return timeline[timeline.length - 1].endTimeSec;
  }
}
