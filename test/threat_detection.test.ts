import { SecurityPolicyEngine } from '../src/main/security/SecurityPolicyEngine';

describe('Security Threat Detection & MIME Discrepancy Suite', () => {
  it('should detect double extension attacks (disguised executables)', () => {
    const doubleExt = SecurityPolicyEngine.analyzeDownloadThreat('statement_2026.pdf.exe');
    expect(doubleExt.threatLevel).toBe('DANGEROUS');
    expect(doubleExt.isSafe).toBe(false);
    expect(doubleExt.reasons[0]).toContain('Double extension');
  });

  it('should detect Windows PE (MZ) binary headers inside image filenames', () => {
    const fakeJpgHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // "MZ" PE executable header
    const analysis = SecurityPolicyEngine.analyzeDownloadThreat('vacation_photo.jpg', 'image/jpeg', fakeJpgHeader);
    expect(analysis.threatLevel).toBe('DANGEROUS');
    expect(analysis.isSafe).toBe(false);
    expect(analysis.reasons[0]).toContain('Executable binary');
  });

  it('should flag disguised scr, vbs, and cmd scripts', () => {
    const scrAnalysis = SecurityPolicyEngine.analyzeDownloadThreat('invoice.doc.scr');
    expect(scrAnalysis.threatLevel).toBe('DANGEROUS');

    const vbsAnalysis = SecurityPolicyEngine.analyzeDownloadThreat('picture.png.vbs');
    expect(vbsAnalysis.threatLevel).toBe('DANGEROUS');

    const cmdAnalysis = SecurityPolicyEngine.analyzeDownloadThreat('document.pdf.cmd');
    expect(cmdAnalysis.threatLevel).toBe('DANGEROUS');

    const pifAnalysis = SecurityPolicyEngine.analyzeDownloadThreat('resume.docx.pif');
    expect(pifAnalysis.threatLevel).toBe('DANGEROUS');
  });

  it('should pass benign and legitimate media filenames', () => {
    const safeMp4 = SecurityPolicyEngine.analyzeDownloadThreat('trailer_1080p.mp4', 'video/mp4');
    expect(safeMp4.threatLevel).toBe('SAFE');
    expect(safeMp4.isSafe).toBe(true);

    const safeZip = SecurityPolicyEngine.analyzeDownloadThreat('dataset_2026.tar.gz', 'application/gzip');
    expect(safeZip.threatLevel).toBe('SAFE');

    const safePdf = SecurityPolicyEngine.analyzeDownloadThreat('annual_report.pdf', 'application/pdf');
    expect(safePdf.threatLevel).toBe('SAFE');
  });

  it('should flag MIME mismatch when executable is labeled as image', () => {
    const mismatch = SecurityPolicyEngine.analyzeDownloadThreat('avatar.png', 'application/x-msdownload');
    expect(mismatch.threatLevel).toBe('SUSPICIOUS');
    expect(mismatch.reasons.length).toBeGreaterThanOrEqual(1);
  });
});
