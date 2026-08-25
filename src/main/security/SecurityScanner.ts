import * as fs from 'fs';
import { execFile } from 'child_process';
import { SecurityScanInfo } from '../../shared/types';

export class SecurityScanner {
  public static async scanFile(filePath: string, configuredCommand?: string): Promise<SecurityScanInfo> {
    if (!fs.existsSync(filePath)) {
      return {
        status: 'error',
        resultDetails: 'File does not exist on disk.',
        timestamp: Date.now(),
      };
    }

    // If a custom antivirus command is configured, attempt to invoke it safely without a shell
    if (configuredCommand && configuredCommand.trim()) {
      const parts = configuredCommand.trim().match(/(?:[^\s"]+|"[^"]*")+/g) || configuredCommand.trim().split(/\s+/);
      const cleanParts = parts.map((p) => p.replace(/^"|"$/g, '')).filter(Boolean);
      const bin = cleanParts[0];
      const initialArgs = cleanParts.slice(1);
      const scannerName = bin;

      return new Promise<SecurityScanInfo>((resolve) => {
        execFile(bin, [...initialArgs, filePath], { timeout: 30000 }, (err, stdout, stderr) => {
          if (err && ((err as any).code === 127 || (err as any).code === 'ENOENT')) {
            // Command not found
            resolve({
              status: 'unsupported',
              scannerName,
              resultDetails: 'Configured scanner command not found in system PATH.',
              timestamp: Date.now(),
            });
            return;
          }

          if (err) {
            // Non-zero exit might mean threat found or scanner error
            const output = ((stdout || '') + '\n' + (stderr || '')).trim();
            if (output.toLowerCase().includes('found') || output.toLowerCase().includes('threat') || output.toLowerCase().includes('infected')) {
              resolve({
                status: 'threat',
                scannerName,
                resultDetails: output || 'Threat detected by antivirus scanner.',
                timestamp: Date.now(),
              });
            } else {
              resolve({
                status: 'error',
                scannerName,
                resultDetails: output || err.message,
                timestamp: Date.now(),
              });
            }
            return;
          }

          resolve({
            status: 'clean',
            scannerName,
            resultDetails: (stdout || '').trim() || 'Scan completed: No threats detected.',
            timestamp: Date.now(),
          });
        });
      });
    }

    // Default: Check if clamscan is installed
    return new Promise<SecurityScanInfo>((resolve) => {
      execFile('clamscan', ['--version'], (err) => {
        if (err) {
          resolve({
            status: 'unsupported',
            resultDetails: 'Security scan unavailable — no local antivirus CLI found on this system.',
            timestamp: Date.now(),
          });
          return;
        }

        execFile('clamscan', ['--no-summary', filePath], { timeout: 30000 }, (sErr, stdout) => {
          if (sErr) {
            resolve({
              status: stdout && stdout.includes('FOUND') ? 'threat' : 'error',
              scannerName: 'ClamAV',
              resultDetails: (stdout || '').trim(),
              timestamp: Date.now(),
            });
            return;
          }

          resolve({
            status: 'clean',
            scannerName: 'ClamAV',
            resultDetails: 'File is clean.',
            timestamp: Date.now(),
          });
        });
      });
    });
  }
}
