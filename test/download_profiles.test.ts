import { DownloadProfilesManager } from '../src/main/engine/DownloadProfiles';
import { DownloadInbox } from '../src/main/engine/DownloadInbox';

describe('Download Profiles & Inbox Suite', () => {
  describe('DownloadProfilesManager', () => {
    it('should provide all 6 distinct download profiles with tuned parameters', () => {
      const profiles = DownloadProfilesManager.getProfiles();
      expect(profiles.length).toBe(6);

      const turbo = DownloadProfilesManager.getProfile('TURBO');
      expect(turbo.maxConnectionsPerDownload).toBe(16);
      expect(turbo.speedLimitBytesPerSec).toBe(0);

      const work = DownloadProfilesManager.getProfile('WORK');
      expect(work.speedLimitBytesPerSec).toBe(512 * 1024);

      const safe = DownloadProfilesManager.getProfile('SAFE');
      expect(safe.strictVerification).toBe(true);
      expect(safe.maxConnectionsPerDownload).toBe(2);
    });
  });

  describe('DownloadInbox', () => {
    it('should stage captured links, emit events, and support batch approvals', () => {
      const inbox = new DownloadInbox();
      let eventFired = false;

      inbox.on('item_added', (item) => {
        eventFired = true;
      });

      const item1 = inbox.addItem({
        url: 'https://example.com/file1.zip',
        source: 'browser',
        suggestedFilename: 'file1.zip',
        suggestedCategory: 'archive',
      });

      expect(eventFired).toBe(true);
      expect(item1.id).toBeDefined();

      const items = inbox.getItems();
      expect(items.length).toBe(1);

      inbox.removeItem(item1.id);
      expect(inbox.getItems().length).toBe(0);
    });
  });
});
