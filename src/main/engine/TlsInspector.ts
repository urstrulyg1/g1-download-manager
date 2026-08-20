import * as tls from 'tls';
import * as https from 'https';
import { TLSSocket } from 'tls';

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint256: string;
  serialNumber: string;
  altNames?: string[];
  isExpired: boolean;
  daysRemaining: number;
}

export interface TlsInspectionResult {
  isHttps: boolean;
  tlsVersion?: string;
  cipher?: string;
  alpnProtocol?: string;
  authorized: boolean;
  authorizationError?: string;
  certificate?: CertificateInfo;
  serverName: string;
  negotiatedAt: number;
}

export class TlsInspector {
  public static async inspectTls(
    targetUrl: string,
    timeoutMs: number = 10000,
    rejectUnauthorized: boolean = true
  ): Promise<TlsInspectionResult> {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';

    if (!isHttps) {
      return {
        isHttps: false,
        authorized: true,
        serverName: parsed.hostname,
        negotiatedAt: Date.now(),
      };
    }

    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 443;

    return new Promise<TlsInspectionResult>((resolve, reject) => {
      const options: tls.ConnectionOptions = {
        host,
        port,
        servername: host,
        rejectUnauthorized,
        ALPNProtocols: ['h2', 'http/1.1'],
        timeout: timeoutMs,
      };

      const socket: TLSSocket = tls.connect(options, () => {
        const cipher = socket.getCipher();
        const tlsVersion = socket.getProtocol() || undefined;
        const alpn = socket.alpnProtocol || undefined;
        const authorized = socket.authorized;
        const authError = socket.authorizationError ? String(socket.authorizationError) : undefined;

        let certInfo: CertificateInfo | undefined;
        const peerCert = socket.getPeerCertificate(true);

        if (peerCert && peerCert.subject) {
          const validTo = peerCert.valid_to ? new Date(peerCert.valid_to) : new Date();
          const now = new Date();
          const isExpired = validTo.getTime() < now.getTime();
          const daysRemaining = Math.max(0, Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

          certInfo = {
            subject: typeof peerCert.subject === 'object' ? Object.entries(peerCert.subject).map(([k, v]) => `${k}=${v}`).join(', ') : String(peerCert.subject),
            issuer: typeof peerCert.issuer === 'object' ? Object.entries(peerCert.issuer).map(([k, v]) => `${k}=${v}`).join(', ') : String(peerCert.issuer),
            validFrom: peerCert.valid_from,
            validTo: peerCert.valid_to,
            fingerprint256: peerCert.fingerprint256 || '',
            serialNumber: peerCert.serialNumber || '',
            altNames: peerCert.subjectaltname ? peerCert.subjectaltname.split(', ') : undefined,
            isExpired,
            daysRemaining,
          };
        }

        socket.destroy();

        resolve({
          isHttps: true,
          tlsVersion,
          cipher: cipher ? `${cipher.name} (${cipher.standardName || cipher.version})` : undefined,
          alpnProtocol: alpn === 'h2' ? 'HTTP/2' : alpn ? String(alpn) : 'HTTP/1.1',
          authorized,
          authorizationError: authError,
          certificate: certInfo,
          serverName: host,
          negotiatedAt: Date.now(),
        });
      });

      socket.on('error', (err: any) => {
        socket.destroy();
        resolve({
          isHttps: true,
          authorized: false,
          authorizationError: err.message,
          serverName: host,
          negotiatedAt: Date.now(),
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          isHttps: true,
          authorized: false,
          authorizationError: `TLS Handshake timed out after ${timeoutMs}ms`,
          serverName: host,
          negotiatedAt: Date.now(),
        });
      });
    });
  }
}
