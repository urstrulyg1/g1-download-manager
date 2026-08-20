#!/usr/bin/env node
/**
 * G1DM Native Messaging Host Executable
 * Handles length-prefixed JSON protocol over stdin and stdout for Chrome, Edge, Firefox, Brave.
 */

const http = require('http');

const PORT = process.env.PORT || 8055;
const API_BASE = `http://127.0.0.1:${PORT}/api/v1`;

function sendNativeMessage(msg) {
  const jsonBuf = Buffer.from(JSON.stringify(msg), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(jsonBuf.length, 0);

  process.stdout.write(lenBuf);
  process.stdout.write(jsonBuf);
}

let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + msgLen) {
      break; // Incomplete message
    }

    const jsonStr = inputBuffer.slice(4, 4 + msgLen).toString('utf8');
    inputBuffer = inputBuffer.slice(4 + msgLen);

    try {
      const msg = JSON.parse(jsonStr);
      handleMessage(msg);
    } catch (err) {
      sendNativeMessage({ success: false, error: err.message });
    }
  }
});

function handleMessage(msg) {
  if (msg.command === 'ping') {
    sendNativeMessage({ success: true, message: 'pong', version: '1.0.0' });
    return;
  }

  if (msg.command === 'add' || msg.command === 'download') {
    const req = http.request(
      `${API_BASE}/downloads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            sendNativeMessage({ success: true, result: JSON.parse(data) });
          } catch {
            sendNativeMessage({ success: true, result: data });
          }
        });
      }
    );

    req.on('error', (err) => {
      sendNativeMessage({ success: false, error: `G1DM engine unreachable: ${err.message}` });
    });

    req.write(
      JSON.stringify({
        url: msg.url,
        filename: msg.filename,
        category: msg.category,
        startImmediately: true,
      })
    );
    req.end();
  }
}
