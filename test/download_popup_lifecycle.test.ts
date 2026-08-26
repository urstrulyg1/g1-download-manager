import { chooseDownloadPopup } from '../src/renderer/lib/downloadPopupLifecycle';

const item = (id: string, status: any) => ({ id, status, filename: `${id}.bin` } as any);

describe('download popup lifecycle policy', () => {
  it('opens active work, keeps minimized work hidden, and restores it on completion', () => {
    expect(chooseDownloadPopup([item('a', 'downloading')], null, new Set(), new Set()).openId).toBe('a');
    expect(chooseDownloadPopup([item('a', 'downloading')], null, new Set(['a']), new Set()).openId).toBeNull();
    const completion = chooseDownloadPopup([item('a', 'completed')], null, new Set(['a']), new Set());
    expect(completion.openId).toBe('a');
    expect(completion.restoreCompletedId).toBe('a');
  });

  it('does not let minimize or dismissal alter the real engine status', () => {
    const downloading = item('a', 'downloading');
    chooseDownloadPopup([downloading], null, new Set(['a']), new Set());
    expect(downloading.status).toBe('downloading');
    expect(chooseDownloadPopup([downloading], null, new Set(), new Set(['a'])).openId).toBeNull();
  });

  it('selects only one active popup while allowing multiple downloads in the minimized center', () => {
    expect(chooseDownloadPopup([item('a', 'downloading'), item('b', 'downloading')], null, new Set(['a']), new Set()).openId).toBe('b');
  });
});
