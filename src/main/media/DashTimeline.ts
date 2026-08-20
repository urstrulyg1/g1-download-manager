export interface DashTimelineSegment {
  number: number;
  timeSec: number;
  durationSec: number;
  url: string;
}

export class DashTimeline {
  public static generateSegmentList(
    mediaTemplate: string,
    initializationUrl: string | undefined,
    durationSec: number,
    segmentDurationSec = 4.0
  ): DashTimelineSegment[] {
    const list: DashTimelineSegment[] = [];
    const count = Math.ceil(durationSec / segmentDurationSec);

    for (let i = 1; i <= count; i++) {
      const url = mediaTemplate
        .replace('$Number$', String(i))
        .replace('$Number%05d$', String(i).padStart(5, '0'))
        .replace('$Time$', String((i - 1) * segmentDurationSec * 1000));

      list.push({
        number: i,
        timeSec: (i - 1) * segmentDurationSec,
        durationSec: Math.min(segmentDurationSec, durationSec - (i - 1) * segmentDurationSec),
        url,
      });
    }

    return list;
  }
}
