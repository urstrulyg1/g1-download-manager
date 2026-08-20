import { BatchOptimizer } from '../src/main/engine/BatchOptimizer';
import { ContentIdentityEngine } from '../src/main/engine/ContentIdentityEngine';

describe('Batch Optimizer & Content Identity Suite', () => {
  describe('BatchOptimizer', () => {
    it('should group batch links by domain and allocate bounded concurrency per domain', () => {
      const urls = [
        'https://cdn1.example.com/file1.zip',
        'https://cdn1.example.com/file2.zip',
        'https://cdn2.example.com/video1.mp4',
        'https://cdn3.example.com/doc1.pdf',
      ];

      const plan = BatchOptimizer.planBatch(urls, 8);
      expect(plan.totalItems).toBe(4);
      expect(plan.uniqueDomainsCount).toBe(3);
      expect(plan.domainGroups.some((g) => g.domain === 'cdn1.example.com')).toBe(true);
    });
  });

  describe('ContentIdentityEngine', () => {
    it('should identify unchanged resources vs server content mutations', () => {
      const existing: any = {
        url: 'https://example.com/file.zip',
        etag: '"v1_etag"',
        contentLength: 1048576,
      };

      const freshUnchanged: any = {
        url: 'https://example.com/file.zip',
        etag: '"v1_etag"',
        contentLength: 1048576,
      };

      const matchRes = ContentIdentityEngine.compareIdentities(existing, freshUnchanged);
      expect(matchRes.level).toBe('RESOURCE_UNCHANGED');
      expect(matchRes.isResumeSafe).toBe(true);

      const freshMutated: any = {
        url: 'https://example.com/file.zip',
        etag: '"v2_mutated_etag"',
        contentLength: 2000000,
      };

      const mutatedRes = ContentIdentityEngine.compareIdentities(existing, freshMutated);
      expect(mutatedRes.level).toBe('CONTENT_MUTATED');
      expect(mutatedRes.isResumeSafe).toBe(false);
    });
  });
});
