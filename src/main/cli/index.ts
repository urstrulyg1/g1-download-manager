#!/usr/bin/env node
import * as http from 'http';

const PORT = process.env.PORT || '3000';
const API_BASE = `http://127.0.0.1:${PORT}/api`;

async function requestApi(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${API_BASE}${endpoint}`);
    const req = http.request(
      parsed,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      }
    );

    req.on('error', () => {
      reject(new Error(`Failed to connect to G1DM core daemon at ${API_BASE}. Make sure the daemon is running.`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const cleanArgs = args.filter((a) => a !== '--json');
  const command = cleanArgs[0] || 'help';

  try {
    switch (command) {
      case 'add': {
        const url = cleanArgs[1];
        if (!url) {
          console.error('Error: URL required. Usage: g1dm add <url> [--name filename] [--out dir]');
          process.exit(1);
        }
        let filename: string | undefined;
        let destDir: string | undefined;
        for (let i = 2; i < cleanArgs.length; i++) {
          if (cleanArgs[i] === '--name' && cleanArgs[i + 1]) filename = cleanArgs[++i];
          if (cleanArgs[i] === '--out' && cleanArgs[i + 1]) destDir = cleanArgs[++i];
        }

        const res = await requestApi('/downloads', 'POST', {
          url,
          filename,
          destinationDir: destDir,
          startImmediately: true,
        });

        if (isJson) {
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.log(`[G1DM] Successfully added download:`);
          console.log(`  ID:       ${res.id}`);
          console.log(`  File:     ${res.filename}`);
          console.log(`  Size:     ${res.totalBytes > 0 ? (res.totalBytes / 1024 / 1024).toFixed(2) + ' MB' : 'Stream'}`);
          console.log(`  Status:   ${res.status}`);
        }
        break;
      }

      case 'list': {
        const list = await requestApi('/downloads');
        if (isJson) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }
        if (!Array.isArray(list) || list.length === 0) {
          console.log('No downloads found.');
          return;
        }
        console.log(`ID                    STATUS       PROGRESS  SPEED       FILE`);
        console.log(`-----------------------------------------------------------------------------`);
        for (const item of list) {
          const speedStr = item.speed > 0 ? `${(item.speed / 1024 / 1024).toFixed(2)} MB/s` : '0 KB/s';
          console.log(
            `${item.id.padEnd(21)} ${item.status.padEnd(12)} ${(item.progress + '%').padEnd(9)} ${speedStr.padEnd(11)} ${item.filename}`
          );
        }
        break;
      }

      case 'inspect': {
        const id = cleanArgs[1];
        if (!id) {
          console.error('Usage: g1dm inspect <download-id>');
          process.exit(1);
        }
        const details = await requestApi(`/downloads/${id}`);
        if (isJson) {
          console.log(JSON.stringify(details, null, 2));
        } else {
          console.log(`[G1DM Download Inspector]`);
          console.log(`  ID:            ${details.id}`);
          console.log(`  Filename:      ${details.filename}`);
          console.log(`  URL:           ${details.url}`);
          console.log(`  Destination:   ${details.finalPath}`);
          console.log(`  Status:        ${details.status}`);
          console.log(`  Progress:      ${details.progress}% (${details.downloadedBytes} / ${details.totalBytes} bytes)`);
          console.log(`  Sockets:       ${details.activeConnections} active`);
          console.log(`  Segments:      ${details.segments?.length || 0} allocated`);
          console.log(`  Range Support: ${details.serverCapabilities?.supportsRange ? 'Yes' : 'No'}`);
          console.log(`  Checksum:      ${details.checksum?.actual || 'Uncalculated'}`);
        }
        break;
      }

      case 'pause': {
        const id = cleanArgs[1];
        if (!id) {
          console.error('Usage: g1dm pause <download-id>');
          process.exit(1);
        }
        await requestApi(`/downloads/${id}/pause`, 'POST');
        if (isJson) console.log(JSON.stringify({ success: true, id, action: 'paused' }));
        else console.log(`[G1DM] Download ${id} paused.`);
        break;
      }

      case 'resume': {
        const id = cleanArgs[1];
        if (!id) {
          console.error('Usage: g1dm resume <download-id>');
          process.exit(1);
        }
        await requestApi(`/downloads/${id}/resume`, 'POST');
        if (isJson) console.log(JSON.stringify({ success: true, id, action: 'resumed' }));
        else console.log(`[G1DM] Download ${id} resumed.`);
        break;
      }

      case 'cancel': {
        const id = cleanArgs[1];
        if (!id) {
          console.error('Usage: g1dm cancel <download-id>');
          process.exit(1);
        }
        await requestApi(`/downloads/${id}/cancel`, 'POST');
        if (isJson) console.log(JSON.stringify({ success: true, id, action: 'cancelled' }));
        else console.log(`[G1DM] Download ${id} cancelled.`);
        break;
      }

      case 'delete':
      case 'remove': {
        const id = cleanArgs[1];
        const deleteFile = cleanArgs.includes('--delete-file');
        if (!id) {
          console.error('Usage: g1dm delete <download-id> [--delete-file]');
          process.exit(1);
        }
        await requestApi(`/downloads/${id}?deleteFile=${deleteFile}`, 'DELETE');
        if (isJson) console.log(JSON.stringify({ success: true, id, action: 'deleted' }));
        else console.log(`[G1DM] Download ${id} deleted.`);
        break;
      }

      case 'status': {
        const stats = await requestApi('/metrics');
        if (isJson) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log(`[G1DM System & Engine Metrics]`);
          console.log(`  Engine Workers:     ${stats.engine?.activeWorkers || 0}`);
          console.log(`  Active Connections: ${stats.engine?.totalConnections || 0}`);
          console.log(`  Download Speed:     ${((stats.network?.activeDownloadSpeed || 0) / 1024 / 1024).toFixed(2)} MB/s`);
          console.log(`  Storage Free:       ${((stats.storage?.freeBytes || 0) / 1024 / 1024 / 1024).toFixed(2)} GB`);
          console.log(`  Uptime:             ${stats.engine?.uptimeSeconds || 0}s`);
        }
        break;
      }

      case 'diagnostics':
      case 'diag': {
        const diag = await requestApi('/diagnostics/run', 'POST');
        if (isJson) {
          console.log(JSON.stringify(diag, null, 2));
        } else {
          console.log(`\nDiagnostics Results:`);
          for (const item of diag) {
            const statusIcon = item.status === 'ok' ? '✓' : item.status === 'warning' ? '⚠' : '✗';
            console.log(`  [${statusIcon}] ${item.name.padEnd(32)} ${item.message}`);
          }
        }
        break;
      }

      case 'doctor': {
        const report = await requestApi('/storage/maintenance');
        if (isJson) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(`[G1DM System Doctor & Integrity Check]`);
          console.log(`  Orphaned Chunks:    ${report.orphanedPartialFiles?.length || 0}`);
          console.log(`  Broken Records:     ${report.brokenRecords?.length || 0}`);
          console.log(`  Missing Final Files:${report.missingDestinationFiles?.length || 0}`);
          console.log(`  Recoverable Bytes:  ${((report.totalRecoverableBytes || 0) / 1024 / 1024).toFixed(2)} MB`);
        }
        break;
      }

      case 'speed-limit': {
        const kbps = parseInt(cleanArgs[1], 10);
        if (isNaN(kbps)) {
          console.error('Usage: g1dm speed-limit <kbps> (0 for unlimited)');
          process.exit(1);
        }
        await requestApi('/settings/speed-limit', 'POST', { bytesPerSec: kbps * 1024 });
        if (isJson) console.log(JSON.stringify({ success: true, speedLimitKbps: kbps }));
        else console.log(`[G1DM] Speed limit updated to ${kbps > 0 ? kbps + ' KB/s' : 'Unlimited'}`);
        break;
      }

      case 'help':
      default: {
        console.log(`
G1DM — Next-Generation Production-Grade Internet Download Manager CLI

Usage:
  g1dm add <url> [--name <filename>] [--out <dir>]   Add and start a new download
  g1dm list [--json]                                 List all downloads
  g1dm inspect <id> [--json]                         Detailed download inspector & telemetry
  g1dm pause <id>                                    Pause download
  g1dm resume <id>                                   Resume download
  g1dm cancel <id>                                   Cancel download
  g1dm delete <id> [--delete-file]                   Remove download
  g1dm status [--json]                               Show system and engine metrics
  g1dm diag [--json]                                 Run full system diagnostics
  g1dm doctor [--json]                               Run database & storage integrity checks
  g1dm speed-limit <kbps>                            Set global bandwidth limit (0 = unlimited)
  g1dm help                                          Show this help manual
`);
        break;
      }
    }
  } catch (err: any) {
    if (isJson) {
      console.error(JSON.stringify({ error: err.message }));
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
