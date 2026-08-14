#!/usr/bin/env node

/**
 * 將專案內的單一 HTML 教學頁輸出為一張長頁 PDF。
 *
 * 使用方式：
 *   node export_long_web_pdf.mjs line-from-points.html exports/直線方程式.pdf
 *
 * 這支程式只使用 Node.js 與已安裝的 Chrome／Edge，不需要額外 npm 套件。
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const CSS_PIXELS_PER_INCH = 96;
const A4_WIDTH_INCH = 210 / 25.4;
const MAX_PAPER_HEIGHT_INCH = 180;

function usage() {
  console.error('用法：node export_long_web_pdf.mjs <教學頁.html> <輸出檔案.pdf>');
}

function isWithinRoot(filePath) {
  const pathFromRoot = relative(ROOT, filePath);
  return pathFromRoot && !pathFromRoot.startsWith('..') && !pathFromRoot.includes('..\\');
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

function mimeType(filePath) {
  return {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.webp': 'image/webp',
  }[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function startStaticServer() {
  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const requestedPath = decodeURIComponent(requestUrl.pathname);
      const absolutePath = resolve(ROOT, `.${requestedPath}`);

      if (!isWithinRoot(absolutePath) || !existsSync(absolutePath) || statSync(absolutePath).isDirectory()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('找不到檔案');
        return;
      }

      response.writeHead(200, { 'Content-Type': mimeType(absolutePath) });
      response.end(readFileSync(absolutePath));
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('無法讀取請求');
    }
  });

  return new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveServer({ server, port: address.port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

function getUnusedPort() {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.once('error', rejectPort);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolvePort(address.port));
    });
  });
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function waitForDebugger(port, browserProcess, browserErrorText) {
  const debuggerUrl = `http://127.0.0.1:${port}/json/version`;
  let lastError = null;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (browserProcess.exitCode !== null) {
      const detail = browserErrorText().trim();
      throw new Error(`Chrome 或 Edge 無法在背景啟動。${detail ? ` ${detail}` : ''}`);
    }
    try {
      const response = await fetch(debuggerUrl);
      if (response.ok) return debuggerUrl;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }

  throw new Error(`等待瀏覽器啟動逾時。${lastError ? ` ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();

    socket.addEventListener('message', (event) => this.handleMessage(event.data));
    socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('瀏覽器連線已關閉。'));
      }
      this.pending.clear();
    });
  }

  handleMessage(data) {
    const message = JSON.parse(String(data));
    if (message.id) {
      const handler = this.pending.get(message.id);
      if (!handler) return;
      this.pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message || 'Chrome DevTools 呼叫失敗。'));
      else handler.resolve(message.result);
      return;
    }

    const listeners = this.eventListeners.get(message.method) || [];
    for (const listener of [...listeners]) listener(message.params || {});
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolveRequest, rejectRequest) => {
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 30000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const listener = (params) => {
        clearTimeout(timeout);
        const listeners = this.eventListeners.get(method) || [];
        this.eventListeners.set(method, listeners.filter((item) => item !== listener));
        resolveEvent(params);
      };
      const timeout = setTimeout(() => {
        const listeners = this.eventListeners.get(method) || [];
        this.eventListeners.set(method, listeners.filter((item) => item !== listener));
        rejectEvent(new Error(`等待 ${method} 逾時。`));
      }, timeoutMs);
      const listeners = this.eventListeners.get(method) || [];
      listeners.push(listener);
      this.eventListeners.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
  }
}

async function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', () => rejectOpen(new Error('無法連線到背景瀏覽器。')), { once: true });
  });
  return new CdpClient(socket);
}

async function waitForPageToSettle(client) {
  const result = await client.send('Runtime.evaluate', {
    expression: `
      (async () => {
        await (document.fonts ? document.fonts.ready : Promise.resolve());
        const startedAt = performance.now();
        let previousHeight = -1;
        let stableTimes = 0;
        while (performance.now() - startedAt < 10000) {
          const currentHeight = Math.max(
            document.documentElement.scrollHeight,
            document.body ? document.body.scrollHeight : 0
          );
          if (currentHeight === previousHeight && performance.now() - startedAt > 1800) {
            stableTimes += 1;
          } else {
            stableTimes = 0;
          }
          if (stableTimes >= 3) break;
          previousHeight = currentHeight;
          await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        }
        return {
          height: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
          title: document.title
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`網頁載入後執行檢查失敗：${result.exceptionDetails.text || '未知錯誤'}`);
  }
  return result.result.value;
}

async function exportLongPdf(inputFile, outputFile) {
  const pagePath = resolve(ROOT, inputFile);
  const pdfPath = resolve(ROOT, outputFile);
  if (!isWithinRoot(pagePath) || !existsSync(pagePath) || extname(pagePath).toLowerCase() !== '.html') {
    throw new Error('請選擇專案資料夾內的 HTML 教學頁。');
  }
  if (extname(pdfPath).toLowerCase() !== '.pdf') {
    throw new Error('輸出檔案的副檔名必須是 .pdf。');
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error('找不到 Chrome 或 Edge。請先安裝其中一種瀏覽器。');
  }

  const { server, port: sitePort } = await startStaticServer();
  const debugPort = await getUnusedPort();
  const profilePath = mkdtempSync(join(tmpdir(), 'math-web-pdf-'));
  let browserProcess = null;
  let client = null;
  let browserErrorText = '';

  try {
    browserProcess = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profilePath}`,
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    browserProcess.stderr.on('data', (chunk) => {
      browserErrorText += chunk.toString('utf-8');
    });

    const debuggerUrl = await waitForDebugger(debugPort, browserProcess, () => browserErrorText);
    const targetResponse = await fetch(`${debuggerUrl.replace('/json/version', '')}/json/new?about:blank`, { method: 'PUT' });
    if (!targetResponse.ok) throw new Error('無法建立 PDF 匯出頁籤。');
    const target = await targetResponse.json();
    client = await connectCdp(target.webSocketDebuggerUrl);

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: Math.round(A4_WIDTH_INCH * CSS_PIXELS_PER_INCH),
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const relativePagePath = relative(ROOT, pagePath).split('\\').map(encodeURIComponent).join('/');
    const pageUrl = `http://127.0.0.1:${sitePort}/${relativePagePath}`;
    const pageLoaded = client.once('Page.loadEventFired');
    const navigation = await client.send('Page.navigate', { url: pageUrl });
    if (navigation.errorText) throw new Error(`無法開啟教學頁：${navigation.errorText}`);
    await pageLoaded;

    const pageState = await waitForPageToSettle(client);
    const layout = await client.send('Page.getLayoutMetrics');
    const contentHeightPx = Math.max(pageState.height, layout.cssContentSize?.height || layout.contentSize.height);
    const paperHeightInch = Math.max(11.69, contentHeightPx / CSS_PIXELS_PER_INCH + 0.2);

    if (paperHeightInch > MAX_PAPER_HEIGHT_INCH) {
      throw new Error(`頁面長度約為 ${paperHeightInch.toFixed(1)} 英吋，超過單頁 PDF 的安全上限。請改用 A4 講義模式或拆分內容。`);
    }

    const printed = await client.send('Page.printToPDF', {
      displayHeaderFooter: false,
      landscape: false,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      paperWidth: A4_WIDTH_INCH,
      paperHeight: paperHeightInch,
      preferCSSPageSize: false,
      printBackground: true,
      scale: 1,
    });

    mkdirSync(dirname(pdfPath), { recursive: true });
    writeFileSync(pdfPath, Buffer.from(printed.data, 'base64'));
    return {
      pageTitle: pageState.title || basename(pagePath),
      paperHeightInch,
      pdfPath,
    };
  } finally {
    if (client) client.close();
    if (browserProcess && browserProcess.exitCode === null) {
      browserProcess.kill();
      await Promise.race([
        new Promise((resolveExit) => browserProcess.once('exit', resolveExit)),
        sleep(3000),
      ]);
    }
    await closeServer(server);
    rmSync(profilePath, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function main() {
  const [inputFile, outputFile] = process.argv.slice(2);
  if (!inputFile || !outputFile) {
    usage();
    process.exitCode = 2;
    return;
  }

  const result = await exportLongPdf(inputFile, outputFile);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    pageTitle: result.pageTitle,
    paperHeightInch: Number(result.paperHeightInch.toFixed(2)),
    pdfPath: result.pdfPath,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`匯出失敗：${error.message}\n`);
  process.exitCode = 1;
});
