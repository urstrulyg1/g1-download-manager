import { EventEmitter } from 'events';

export type DownloadLifecycleState =
  | 'CREATED'
  | 'PROBING'
  | 'QUEUED'
  | 'STARTING'
  | 'DOWNLOADING'
  | 'PAUSING'
  | 'PAUSED'
  | 'RESUMING'
  | 'RETRYING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELING'
  | 'CANCELED'
  | 'DELETING'
  | 'RECOVERING';

export interface StateTransitionEvent {
  downloadId: string;
  from: DownloadLifecycleState;
  to: DownloadLifecycleState;
  reason?: string;
  timestamp: number;
}

export class InvalidStateTransitionError extends Error {
  constructor(downloadId: string, from: DownloadLifecycleState, to: DownloadLifecycleState, reason?: string) {
    super(
      `Invalid state transition for [${downloadId}] from ${from} -> ${to}${reason ? ` (Reason: ${reason})` : ''}`
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export class DownloadStateMachine extends EventEmitter {
  private static readonly VALID_TRANSITIONS: Record<DownloadLifecycleState, DownloadLifecycleState[]> = {
    CREATED: ['PROBING', 'QUEUED', 'STARTING', 'FAILED', 'CANCELED'],
    PROBING: ['QUEUED', 'STARTING', 'FAILED', 'CANCELED'],
    QUEUED: ['STARTING', 'DOWNLOADING', 'PAUSED', 'CANCELED', 'DELETING', 'FAILED', 'RETRYING'],
    STARTING: ['DOWNLOADING', 'PAUSING', 'PAUSED', 'FAILED', 'CANCELED'],
    DOWNLOADING: ['PAUSING', 'PAUSED', 'VERIFYING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELING', 'CANCELED'],
    PAUSING: ['PAUSED', 'FAILED', 'CANCELED'],
    PAUSED: ['RESUMING', 'QUEUED', 'STARTING', 'DOWNLOADING', 'CANCELED', 'DELETING'],
    RESUMING: ['DOWNLOADING', 'PAUSED', 'FAILED', 'CANCELED'],
    RETRYING: ['DOWNLOADING', 'STARTING', 'FAILED', 'CANCELED', 'PAUSED', 'QUEUED'],
    VERIFYING: ['COMPLETED', 'FAILED'],
    COMPLETED: ['STARTING', 'QUEUED', 'VERIFYING', 'DELETING'], // Only allowed on explicit restart or verify
    FAILED: ['RETRYING', 'RESUMING', 'STARTING', 'QUEUED', 'DELETING', 'CANCELED'],
    CANCELING: ['CANCELED', 'FAILED'],
    CANCELED: ['STARTING', 'QUEUED', 'DELETING'],
    RECOVERING: ['PAUSED', 'QUEUED', 'DOWNLOADING', 'FAILED'],
    DELETING: [],
  };

  private currentState: DownloadLifecycleState;
  private readonly downloadId: string;
  private transitionHistory: StateTransitionEvent[] = [];

  constructor(downloadId: string, initialState: DownloadLifecycleState = 'CREATED') {
    super();
    this.downloadId = downloadId;
    this.currentState = initialState;
    this.recordTransition(initialState, initialState, 'Initial state');
  }

  public getState(): DownloadLifecycleState {
    return this.currentState;
  }

  public getHistory(): StateTransitionEvent[] {
    return [...this.transitionHistory];
  }

  public canTransitionTo(targetState: DownloadLifecycleState): boolean {
    if (this.currentState === targetState) return true;
    const allowed = DownloadStateMachine.VALID_TRANSITIONS[this.currentState] || [];
    return allowed.includes(targetState);
  }

  public transitionTo(targetState: DownloadLifecycleState, reason?: string): DownloadLifecycleState {
    if (this.currentState === targetState) {
      return this.currentState;
    }

    if (!this.canTransitionTo(targetState)) {
      throw new InvalidStateTransitionError(this.downloadId, this.currentState, targetState, reason);
    }

    const previousState = this.currentState;
    this.currentState = targetState;
    const event = this.recordTransition(previousState, targetState, reason);

    this.emit('transition', event);
    this.emit(`state:${targetState}`, event);
    return this.currentState;
  }

  private recordTransition(
    from: DownloadLifecycleState,
    to: DownloadLifecycleState,
    reason?: string
  ): StateTransitionEvent {
    const event: StateTransitionEvent = {
      downloadId: this.downloadId,
      from,
      to,
      reason,
      timestamp: Date.now(),
    };
    this.transitionHistory.push(event);
    if (this.transitionHistory.length > 100) {
      this.transitionHistory.shift();
    }
    return event;
  }
}
