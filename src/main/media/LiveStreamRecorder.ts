import { EventEmitter } from 'events';

export interface LiveRecordingSession {
  sessionId: string;
  streamUrl: string;
  outputFilePath: string;
  status: 'RECORDING' | 'PAUSED' | 'STOPPED' | 'STORAGE_LIMIT_REACHED';
  startedAt: number;
  durationSeconds: number;
  recordedBytes: number;
  segmentsCount: number;
  maxStorageBytes: number;
  maxDurationSeconds: number;
}

export class LiveStreamRecorder extends EventEmitter {
  private sessions: Map<string, LiveRecordingSession> = new Map();

  public startRecording(params: {
    streamUrl: string;
    outputFilePath: string;
    maxStorageBytes?: number;
    maxDurationSeconds?: number;
  }): LiveRecordingSession {
    const sessionId = `live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const session: LiveRecordingSession = {
      sessionId,
      streamUrl: params.streamUrl,
      outputFilePath: params.outputFilePath,
      status: 'RECORDING',
      startedAt: Date.now(),
      durationSeconds: 0,
      recordedBytes: 0,
      segmentsCount: 0,
      maxStorageBytes: params.maxStorageBytes || 5 * 1024 * 1024 * 1024, // 5 GB
      maxDurationSeconds: params.maxDurationSeconds || 7200, // 2 hours
    };

    this.sessions.set(sessionId, session);
    this.emit('session_started', session);
    return session;
  }

  public recordSegment(sessionId: string, segmentBytes: number, segmentDurationSec: number): void {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== 'RECORDING') return;

    s.recordedBytes += segmentBytes;
    s.durationSeconds += segmentDurationSec;
    s.segmentsCount++;

    if (s.recordedBytes >= s.maxStorageBytes || s.durationSeconds >= s.maxDurationSeconds) {
      s.status = 'STORAGE_LIMIT_REACHED';
      this.emit('limit_reached', s);
    }
  }

  public stopRecording(sessionId: string): LiveRecordingSession | undefined {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.status = 'STOPPED';
      this.emit('session_stopped', s);
    }
    return s;
  }
}
