import { LiveStreamRecorder, LiveRecordingSession } from './LiveStreamRecorder';

export interface ScheduledDVRRecording {
  id: string;
  streamUrl: string;
  title: string;
  startTimeEpochMs: number;
  durationSec: number;
  outputFilename: string;
  autoStopOnFinish: boolean;
  status: 'scheduled' | 'recording' | 'completed' | 'failed' | 'cancelled';
  session?: LiveRecordingSession;
}

export class LiveStreamDVR {
  private static scheduledRecordings: Map<string, ScheduledDVRRecording> = new Map();
  private static recorder = new LiveStreamRecorder();

  public static scheduleRecording(params: {
    streamUrl: string;
    title: string;
    startTimeEpochMs: number;
    durationSec: number;
    outputFilename: string;
    autoStopOnFinish?: boolean;
  }): ScheduledDVRRecording {
    const id = `dvr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: ScheduledDVRRecording = {
      id,
      streamUrl: params.streamUrl,
      title: params.title,
      startTimeEpochMs: params.startTimeEpochMs,
      durationSec: params.durationSec,
      outputFilename: params.outputFilename,
      autoStopOnFinish: params.autoStopOnFinish ?? true,
      status: 'scheduled',
    };

    this.scheduledRecordings.set(id, rec);

    const delay = Math.max(0, params.startTimeEpochMs - Date.now());
    setTimeout(() => {
      this.startRecordingNow(id);
    }, delay);

    return rec;
  }

  public static async startRecordingNow(id: string): Promise<boolean> {
    const rec = this.scheduledRecordings.get(id);
    if (!rec || rec.status !== 'scheduled') return false;

    rec.status = 'recording';
    const session = this.recorder.startRecording({
      streamUrl: rec.streamUrl,
      outputFilePath: rec.outputFilename,
      maxDurationSeconds: rec.durationSec,
    });
    rec.session = session;

    if (rec.durationSec > 0) {
      setTimeout(() => {
        if (rec.status === 'recording' && rec.session) {
          this.recorder.stopRecording(rec.session.sessionId);
          rec.status = 'completed';
        }
      }, rec.durationSec * 1000);
    }

    return true;
  }

  public static async cancelRecording(id: string): Promise<boolean> {
    const rec = this.scheduledRecordings.get(id);
    if (!rec) return false;

    if (rec.status === 'recording' && rec.session) {
      this.recorder.stopRecording(rec.session.sessionId);
    }
    rec.status = 'cancelled';
    return true;
  }

  public static getAllRecordings(): ScheduledDVRRecording[] {
    return Array.from(this.scheduledRecordings.values()).map((r) => ({
      ...r,
      session: undefined,
    }));
  }
}
