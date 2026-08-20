import { DashTimeline } from '../src/main/media/DashTimeline';

describe('DASH Segment Timeline Generator', () => {
  it('should interpolate $Number$ and $Time$ segment templates accurately', () => {
    const template = 'https://cdn.example.com/dash/segment_$Number%05d$.m4s';
    const list = DashTimeline.generateSegmentList(template, undefined, 20.0, 4.0);

    expect(list.length).toBe(5); // 20s / 4s = 5 segments
    expect(list[0].url).toBe('https://cdn.example.com/dash/segment_00001.m4s');
    expect(list[0].timeSec).toBe(0);
    expect(list[0].durationSec).toBe(4);

    expect(list[4].url).toBe('https://cdn.example.com/dash/segment_00005.m4s');
    expect(list[4].timeSec).toBe(16);
  });
});
