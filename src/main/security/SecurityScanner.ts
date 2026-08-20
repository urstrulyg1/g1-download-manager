import * as fs from 'fs';
import { exec } from 'child_process';
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

    // If a custom antivirus command is configured, attempt to invoke it
    if (configuredCommand && configuredCommand.trim()) {
      return new Promise<SecurityScanInfo>((resolve) => {
        const cmd = `${configuredCommand.trim()} "${filePath.replace(/"/g, '\\"')}"`;
        exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
          if (err && (err as any).code === 127) {
            // Command not found
            resolve({
              status: 'unsupported',
              scannerName: configuredCommand.split(' ')[0],
              resultDetails: 'Configured scanner command not found in system PATH.',
              timestamp: Date.now(),
            });
            return;
          }

          if (err) {
            // Non-zero exit might mean threat found or scanner error
            const output = (stdout + '\n' + stderr).trim();
            if (output.toLowerCase().includes('found') || output.toLowerCase().includes('threat') || output.toLowerCase().includes('infected')) {
              resolve({
                status: 'threat',
                scannerName: configuredCommand.split(' ')[0],
                resultDetails: output || 'Threat detected by antivirus scanner.',
                timestamp: Date.now(),
              });
            } else {
              resolve({
                status: 'error',
                scannerName: configuredCommand.split(' ')[0],
                resultDetails: output || err.message,
                timestamp: Date.now(),
              });
            }
            return;
          }

          resolve({
            status: 'clean',
            scannerName: configuredCommand.split(' ')[0],
            resultDetails: stdout.trim() || 'Scan completed: No threats detected.',
            timestamp: Date.now(),
          });
        });
      });
    }

    // Default: Check if clamscan is installed
    return new Promise<SecurityScanInfo>((resolve) => {
      exec('clamscan --version', (err) => {
        if (err) {
          resolve({
            status: 'unsupported',
            resultDetails: 'Security scan unavailable — no local antivirus CLI found on this system.',
            timestamp: Date.now(),
          });
          return;
        }

        exec(`clamscan --no-summary "${filePath.replace(/"/g, '\\"')}"`, { timeout: 30000 }, (sErr, stdout) => {
          if (sErr) {
            resolve({
              status: stdout.includes('FOUND') ? 'threat' : 'error',
              scannerName: 'ClamAV',
              resultDetails: stdout.trim(),
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
