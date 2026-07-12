import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { delimiter, resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';

export async function findExecutable(command) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = resolve(directory, command);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return null;
}

export function capture(command, args, options = {}) {
  const { cwd, env, input, timeoutMs = 30_000, onChild } = options;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    onChild?.(child);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, signal, stdout, stderr, timedOut });
    });
    child.stdin.end(input);
  });
}

export function sanitizeError(value) {
  return String(value)
    .replaceAll(
      /(?:password|passwordhash|token|secret|jwt|database_url)\s*[:=]\s*\S+/gi,
      '[скрыто]',
    )
    .trim()
    .split(/\r?\n/)
    .slice(-4)
    .join(' ');
}

export function sshArgs(host, remoteCommand = 'sh -s') {
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=15',
    host,
    remoteCommand,
  ];
}
