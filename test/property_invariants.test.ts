import { SegmentLedger } from '../src/main/engine/SegmentLedger';
import { DownloadStateMachine, InvalidStateTransitionError } from '../src/main/engine/StateMachine';

describe('Property-Based Invariant Verification Suite', () => {
  it('should maintain zero-overlap invariant under random multi-worker claiming', () => {
    const totalBytes = 100 * 1024 * 1024; // 100 MB
    const ledger = new SegmentLedger('dl_prop_1', totalBytes);
    ledger.initialize(16);

    for (let i = 1; i <= 16; i++) {
      ledger.claimNextAvailable(`worker_${i}`);
    }

    expect(ledger.validateZeroOverlap()).toBe(true);
  });

  it('should reject non-deterministic random state jumps strictly', () => {
    const sm = new DownloadStateMachine('dl_prop_sm', 'CREATED');
    const illegalStates = ['COMPLETED', 'VERIFYING', 'PAUSING', 'RESUMING'] as const;

    for (const s of illegalStates) {
      expect(() => {
        sm.transitionTo(s, 'Random fuzz attempt');
      }).toThrow(InvalidStateTransitionError);
    }
  });

  it('should verify that segment start offsets are strictly monotonic', () => {
    const ledger = new SegmentLedger('dl_mono_test', 50000);
    const segs = ledger.initialize(10);
    for (let i = 0; i < segs.length - 1; i++) {
      expect(segs[i].startOffset).toBeLessThan(segs[i + 1].startOffset);
      expect(segs[i].endOffset + 1).toBe(segs[i + 1].startOffset);
    }
  });

  it('should maintain state consistency when workers fail and release segments', () => {
    const ledger = new SegmentLedger('dl_fail_rel', 10000);
    ledger.initialize(4);

    ledger.claimNextAvailable('worker_1');
    ledger.releaseClaim(1);

    const reclaimed = ledger.claimNextAvailable('worker_2');
    expect(reclaimed?.segmentId).toBe(1);
    expect(reclaimed?.claimedBy).toBe('worker_2');
  });

  it('should record complete transition history in state machine', () => {
    const sm = new DownloadStateMachine('dl_history_test', 'CREATED');
    sm.transitionTo('QUEUED');
    sm.transitionTo('STARTING');
    sm.transitionTo('DOWNLOADING');
    sm.transitionTo('PAUSED');

    const history = sm.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(4);
    expect(history[history.length - 1].to).toBe('PAUSED');
  });
});
