import { ControlBot } from '../src/main/remote/ControlBot';

// Minimal fake engine sufficient for command parsing tests
function makeFakeEngine() {
  const items: any[] = [];
  return {
    items,
    addDownload: jest.fn(async (payload: any) => {
      const item = {
        id: `dl_${items.length + 1}`,
        url: payload.url,
        filename: payload.url.split('/').pop() || 'file.bin',
        status: 'queued',
        progress: 0,
        speed: 0,
      };
      items.push(item);
      return item;
    }),
    getAllDownloads: jest.fn(() => items),
    pauseAll: jest.fn(),
    resumeAll: jest.fn(),
  } as any;
}

describe('ControlBot — remote command processing', () => {
  afterEach(() => {
    ControlBot.stopTelegramPolling();
    ControlBot.configure({ enabled: false });
  });

  it('enqueues a download via /add', async () => {
    const engine = makeFakeEngine();
    const res = await ControlBot.processCommand('/add https://example.com/big-file.iso', engine);
    expect(engine.addDownload).toHaveBeenCalledWith({ url: 'https://example.com/big-file.iso', startImmediately: true });
    expect(res.actionTaken).toBe('add');
    expect(res.responseText).toContain('big-file.iso');
  });

  it('treats a bare pasted URL as an add command (phone workflow)', async () => {
    const engine = makeFakeEngine();
    const res = await ControlBot.processCommand('https://example.com/photo-album.zip', engine);
    expect(res.actionTaken).toBe('add');
    expect(engine.addDownload).toHaveBeenCalled();
  });

  it('strips @BotName suffixes from group-chat commands', async () => {
    const engine = makeFakeEngine();
    const res = await ControlBot.processCommand('/status@G1DMBot', engine);
    expect(res.responseText).toContain('empty');
  });

  it('reports the queue via /status', async () => {
    const engine = makeFakeEngine();
    await ControlBot.processCommand('/add https://example.com/a.zip', engine);
    const res = await ControlBot.processCommand('/status', engine);
    expect(res.actionTaken).toBe('list');
    expect(res.responseText).toContain('a.zip');
  });

  it('pauses and resumes all downloads', async () => {
    const engine = makeFakeEngine();
    const p = await ControlBot.processCommand('/pause', engine);
    expect(engine.pauseAll).toHaveBeenCalled();
    expect(p.actionTaken).toBe('pause');

    const r = await ControlBot.processCommand('/resume', engine);
    expect(engine.resumeAll).toHaveBeenCalled();
    expect(r.actionTaken).toBe('resume');
  });

  it('reports combined speed via /speed', async () => {
    const engine = makeFakeEngine();
    engine.items.push({ id: 'x', filename: 'f', status: 'downloading', progress: 0.5, speed: 2 * 1024 * 1024 });
    const res = await ControlBot.processCommand('/speed', engine);
    expect(res.responseText).toContain('2.00 MB/s');
  });

  it('answers /help and unknown commands gracefully', async () => {
    const engine = makeFakeEngine();
    const help = await ControlBot.processCommand('/help', engine);
    expect(help.responseText).toContain('/add');
    const unknown = await ControlBot.processCommand('/frobnicate', engine);
    expect(unknown.responseText).toContain('Unknown command');
  });

  it('does not start polling when disabled or missing a token', () => {
    ControlBot.configure({ enabled: true }, makeFakeEngine());
    expect(ControlBot.getStatus().telegramPolling).toBe(false);

    ControlBot.configure({ enabled: false, telegramBotToken: 'fake:token' }, makeFakeEngine());
    expect(ControlBot.getStatus().telegramPolling).toBe(false);
  });
});
