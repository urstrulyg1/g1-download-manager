#!/usr/bin/env node
/**
 * G1DM Native Messaging Host Executable
 * Handles length-prefixed JSON protocol over stdin and stdout for Chrome, Edge, Firefox, Brave, Safari.
 * Hardened with message size boundaries, URL validation, and authorization checks.
 */

const http = require('http');

const PORT = parseInt(process.env.PORT || '8055', 10);
const API_BASE = `http://127.0.0.1:${PORT}/api`;
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1 MB boundary

function sendNativeMessage(msg) {
  try {
    const jsonBuf = Buffer.from(JSON.stringify(msg), 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(jsonBuf.length, 0);

    process.stdout.write(lenBuf);
    process.stdout.write(jsonBuf);
  } catch (err) {
    console.error('Failed to send native message:', err);
  }
}

let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);

    // Guard against memory exhaustion attacks
    if (msgLen > MAX_MESSAGE_SIZE) {
      sendNativeMessage({
        success: false,
        error: `Message size (${msgLen} bytes) exceeds maximum limit (${MAX_MESSAGE_SIZE} bytes).`,
      });
      inputBuffer = Buffer.alloc(0); // flush buffer
      return;
    }

    if (inputBuffer.length < 4 + msgLen) {
      break; // Incomplete message, wait for more chunks
    }

    const jsonStr = inputBuffer.slice(4, 4 + msgLen).toString('utf8');
    inputBuffer = inputBuffer.slice(4 + msgLen);

    try {
      const msg = JSON.parse(jsonStr);
      handleMessage(msg);
    } catch (err) {
      sendNativeMessage({ success: false, error: `Malformed JSON message: ${err.message}` });
    }
  }
});

process.stdin.on('error', (err) => {
  console.error('Native messaging stdin error:', err);
});

function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    sendNativeMessage({ success: false, error: 'Invalid message payload: Object expected.' });
    return;
  }

  // 1. Ping / Health check
  if (msg.command === 'ping') {
    sendNativeMessage({
      success: true,
      message: 'pong',
      version: '4.0.0',
      status: 'ONLINE',
      timestamp: Date.now(),
    });
    return;
  }

  // 2. Add / Intercept Download
  if (msg.command === 'add' || msg.command === 'download') {
    if (!msg.url || typeof msg.url !== 'string') {
      sendNativeMessage({ success: false, error: 'Missing or invalid URL parameter.' });
      return;
    }

    const rawUrl = msg.url.trim();
    if (rawUrl.length > 2048) {
      sendNativeMessage({ success: false, error: 'URL exceeds maximum length of 2048 characters.' });
      return;
    }

    // Protocol check
    if (!/^(https?|ftp|ftps):\/\//i.test(rawUrl)) {
      sendNativeMessage({ success: false, error: 'Invalid URL protocol: Only HTTP, HTTPS, and FTP are permitted.' });
      return;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (msg.token || process.env.G1DM_API_KEY) {
      headers['Authorization'] = `Bearer ${msg.token || process.env.G1DM_API_KEY}`;
    }

    const req = http.request(
      `${API_BASE}/downloads`,
      {
        method: 'POST',
        headers,
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              sendNativeMessage({ success: false, error: parsed.error || `HTTP ${res.statusCode}` });
            } else {
              sendNativeMessage({ success: true, result: parsed });
            }
          } catch {
            sendNativeMessage({ success: true, result: data });
          }
        });
      }
    );

    req.on('error', (err) => {
      sendNativeMessage({ success: false, error: `G1DM engine unreachable: ${err.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      sendNativeMessage({ success: false, error: 'Connection to G1DM core engine timed out.' });
    });

    req.write(
      JSON.stringify({
        url: rawUrl,
        filename: typeof msg.filename === 'string' ? msg.filename.trim() : undefined,
        category: typeof msg.category === 'string' ? msg.category.trim() : undefined,
        formatSpec: msg.formatSpec || msg.mediaFormatSpec,
        container: msg.container || msg.format,
        startImmediately: msg.startImmediately !== false,
      })
    );
    req.end();
    return;
  }

  // 3. Status Query
  if (msg.command === 'status') {
    const req = http.request(
      `${API_BASE}/metrics`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            sendNativeMessage({ success: true, metrics: JSON.parse(data) });
          } catch {
            sendNativeMessage({ success: true, raw: data });
          }
        });
      }
    );

    req.on('error', (err) => {
      sendNativeMessage({ success: false, error: `G1DM engine unreachable: ${err.message}` });
    });

    req.end();
    return;
  }

  sendNativeMessage({ success: false, error: `Unrecognized command: ${msg.command}` });
}
