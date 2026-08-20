import { VideoInspector } from '../src/main/media/VideoInspector';

describe('Video Inspector Binary Container Probing', () => {
  it('should parse MP4 ftyp box and container headers', () => {
    // Construct valid MP4 ftyp header buffer
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(16, 0); // box size 16
    buf.write('ftyp', 4, 'ascii');
    buf.write('mp42', 8, 'ascii'); // major brand
    buf.writeUInt32BE(0, 12); // minor version

    const meta = VideoInspector.parseHeaderBuffer(buf);
    expect(meta.container).toBe('MP4');
    expect(meta.majorBrand).toBe('mp42');
  });

  it('should detect WebM EBML binary headers', () => {
    const buf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x77, 0x65, 0x62, 0x6d]); // contains 'webm'
    const meta = VideoInspector.parseHeaderBuffer(buf);
    expect(meta.container).toBe('WebM');
    expect(meta.videoCodec).toContain('VP9');
  });
});
