const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { app } = require('electron');

const HEALTH_URL = 'http://127.0.0.1:8000/api/health';
const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 1000;
const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 2000;
const SIGKILL_TIMEOUT_MS = 5000;

class BackendManager {
  constructor() {
    this._proc = null;
    this._restarts = 0;
    this._stopping = false;
    this.onProgress = null; // (message: string) => void
  }

  /**
   * Start the Python backend and wait for it to become healthy.
   * Resolves when /api/health responds 200, rejects on timeout.
   */
  async start() {
    this._stopping = false;
    this._spawn();
    await this._pollHealth();
  }

  _spawn() {
    const backendDir = app.isPackaged
      ? path.join(process.resourcesPath, 'backend')
      : path.join(__dirname, '..', 'backend');

    const pythonPath = app.isPackaged
      ? path.join(process.resourcesPath, 'backend', 'venv', 'bin', 'python')
      : path.join(backendDir, 'venv', 'bin', 'python');

    const mainPy = path.join(backendDir, 'main.py');

    this._emit(`Starting Python (attempt ${this._restarts + 1})...`);

    this._proc = spawn(pythonPath, [mainPy], {
      cwd: backendDir,
      env: {
        ...process.env,
        LIQUIFI_HOST: '127.0.0.1',
        LIQUIFI_CORS_ORIGINS: '*',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this._proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.log(`[backend] ${line}`);
    });

    this._proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.error(`[backend] ${line}`);
    });

    this._proc.on('exit', (code, signal) => {
      console.log(`[backend] Process exited: code=${code}, signal=${signal}`);
      this._proc = null;

      if (!this._stopping && this._restarts < MAX_RESTARTS) {
        this._restarts += 1;
        this._emit(`Backend crashed — restarting (${this._restarts}/${MAX_RESTARTS})...`);
        setTimeout(() => this._spawn(), RESTART_DELAY_MS);
      }
    });
  }

  /**
   * Poll /api/health until it responds 200.
   */
  _pollHealth() {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const poll = () => {
        attempts += 1;
        this._emit(`Connecting to backend (${attempts}/${MAX_POLL_ATTEMPTS})...`);

        http
          .get(HEALTH_URL, (res) => {
            if (res.statusCode === 200) {
              this._emit('Backend ready!');
              resolve();
            } else {
              retry();
            }
            res.resume(); // drain
          })
          .on('error', () => {
            retry();
          });
      };

      const retry = () => {
        if (attempts >= MAX_POLL_ATTEMPTS) {
          reject(new Error('Backend did not become healthy within timeout'));
        } else {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      poll();
    });
  }

  /**
   * Gracefully stop the backend process.
   */
  stop() {
    if (this._stopping) return;
    this._stopping = true;
    if (!this._proc) return;

    console.log('[backend] Sending SIGTERM...');
    this._proc.kill('SIGTERM');

    // Force-kill after timeout
    const proc = this._proc;
    setTimeout(() => {
      try {
        if (proc && !proc.killed) {
          console.log('[backend] Sending SIGKILL...');
          proc.kill('SIGKILL');
        }
      } catch (err) {
        // Process already gone
      }
    }, SIGKILL_TIMEOUT_MS);
  }

  _emit(msg) {
    if (this.onProgress) this.onProgress(msg);
  }
}

module.exports = BackendManager;
