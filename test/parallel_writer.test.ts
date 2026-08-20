import * as fs from 'fs';
import * as path from 'path';
import { ParallelFileWriter } from '../src/main/storage/ParallelFileWriter';

describe('Parallel File Writer & Disk Backpressure Suite', () => {
  const testDir = path.join(__dirname, 'tmp_parallel_writer');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should write chunks at discrete random-access offsets and measure throughput', async () => {
    const filePath = path.join(testDir, 'test_sparse_write.bin');
    const writer = new ParallelFileWriter(filePath, 1024 * 1024); // 1 MB queue threshold
    writer.open(2048);

    const chunk1 = Buffer.from('Chunk 1 at offset 0 ');
    const chunk2 = Buffer.from('Chunk 2 at offset 100 ');

    await writer.enqueueWrite(1, 0, chunk1);
    await writer.enqueueWrite(2, 100, chunk2);

    await writer.flushAndClose();

    const content = fs.readFileSync(filePath);
    expect(content.subarray(0, chunk1.length).toString('utf8')).toBe('Chunk 1 at offset 0 ');
    expect(content.subarray(100, 100 + chunk2.length).toString('utf8')).toBe('Chunk 2 at offset 100 ');

    const metrics = writer.getMetrics();
    expect(metrics.isBackpressureActive).toBe(false);
  });
});
