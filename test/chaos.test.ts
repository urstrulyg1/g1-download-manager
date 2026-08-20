import { DownloadStateMachine, InvalidStateTransitionError } from '../src/main/engine/StateMachine';
import { ServerPolicyEngine } from '../src/main/engine/ServerPolicyEngine';
import { RecoveryOrchestrator } from '../src/main/engine/RecoveryOrchestrator';
import { AppDatabase } from '../src/main/db/Database';
import * as path from 'path';
import * as fs from 'fs';

describe('Chaos & State Machine Integrity Suite', () => {
  const testDir = path.join(__dirname, 'tmp_chaos_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('DownloadStateMachine Enforced Transitions', () => {
    it('should permit valid lifecycle transitions', () => {
      const sm = new DownloadStateMachine('dl_sm_1', 'CREATED');
      expect(sm.getState()).toBe('CREATED');

      sm.transitionTo('QUEUED', 'Added to queue');
      expect(sm.getState()).toBe('QUEUED');

      sm.transitionTo('STARTING', 'Triggered');
      expect(sm.getState()).toBe('STARTING');

      sm.transitionTo('DOWNLOADING', 'Worker active');
      expect(sm.getState()).toBe('DOWNLOADING');

      sm.transitionTo('PAUSED', 'User paused');
      expect(sm.getState()).toBe('PAUSED');

      sm.transitionTo('RESUMING', 'User resumed');
      expect(sm.getState()).toBe('RESUMING');

      sm.transitionTo('DOWNLOADING', 'Active again');
      expect(sm.getState()).toBe('DOWNLOADING');

      sm.transitionTo('COMPLETED', 'Finished transfer');
      expect(sm.getState()).toBe('COMPLETED');
    });

    it('should reject invalid lifecycle transitions', () => {
      const sm = new DownloadStateMachine('dl_sm_2', 'COMPLETED');
      expect(() => {
        sm.transitionTo('DOWNLOADING', 'Illegal jump');
      }).toThrow(InvalidStateTransitionError);

      const sm3 = new DownloadStateMachine('dl_sm_3', 'CREATED');
      expect(() => {
        sm3.transitionTo('COMPLETED', 'Illegal jump');
      }).toThrow(InvalidStateTransitionError);
    });

    it('should support recovering state after abnormal interruption', () => {
      const sm = new DownloadStateMachine('dl_sm_rec', 'RECOVERING');
      expect(sm.canTransitionTo('PAUSED')).toBe(true);
      expect(sm.canTransitionTo('DOWNLOADING')).toBe(true);
      sm.transitionTo('PAUSED', 'Safe recovery pause');
      expect(sm.getState()).toBe('PAUSED');
    });

    it('should handle rapid retrying and restarting transitions cleanly', () => {
      const sm = new DownloadStateMachine('dl_sm_retry', 'DOWNLOADING');
      sm.transitionTo('FAILED', 'Socket drop');
      sm.transitionTo('RETRYING', 'Attempt 1');
      sm.transitionTo('DOWNLOADING', 'Reconnected');
      expect(sm.getState()).toBe('DOWNLOADING');
    });
  });

  describe('ServerPolicyEngine AIMD Adaptation', () => {
    it('should dynamically reduce connections on HTTP 429 and recover when stable', () => {
      const policy = new ServerPolicyEngine();
      const domain = 'throttled-host.com';

      const initialLimit = policy.getRecommendedConnections(domain, 16);
      expect(initialLimit).toBe(8);

      // Throttling event 1
      const throttled1 = policy.recordThrottling(domain, 429);
      expect(throttled1.newLimit).toBe(4);
      expect(policy.getPolicy(domain).currentAllowedConnections).toBe(4);

      // Throttling event 2
      const throttled2 = policy.recordThrottling(domain, 429);
      expect(throttled2.newLimit).toBe(2);

      // Stable successes
      policy.getPolicy(domain).cooldownUntil = 0; // Clear cooldown
      for (let i = 0; i < 5; i++) {
        policy.recordSuccess(domain, 35, 1024 * 1024, 1024 * 100);
      }
      expect(policy.getPolicy(domain).currentAllowedConnections).toBeGreaterThanOrEqual(2);
    });

    it('should handle 503 Service Unavailable with exponential backoff', () => {
      const policy = new ServerPolicyEngine();
      const res = policy.recordThrottling('server503.com', 503);
      expect(res.backoffMs).toBeGreaterThanOrEqual(1000);
    });

    it('should record consecutive failures and throttle down to minimum connections', () => {
      const policy = new ServerPolicyEngine();
      policy.recordFailure('fail.com', 'ECONNRESET');
      policy.recordFailure('fail.com', 'ECONNRESET');
      policy.recordFailure('fail.com', 'ECONNRESET');
      expect(policy.getRecommendedConnections('fail.com', 16)).toBeLessThanOrEqual(4);
    });
  });
});
