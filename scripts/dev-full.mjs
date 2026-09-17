import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function createDevFullCommands(input = {}) {
  const nodeExecutable = input.nodeExecutable ?? process.execPath;
  const packageManagerExecutable =
    input.packageManagerExecutable ?? process.env.npm_execpath;
  const base = !packageManagerExecutable
    ? { command: 'pnpm', args: [] }
    : /\.[cm]?js$/i.test(packageManagerExecutable)
      ? { command: nodeExecutable, args: [packageManagerExecutable] }
      : { command: packageManagerExecutable, args: [] };

  return [
    { name: 'web', command: base.command, args: [...base.args, 'dev'] },
    {
      name: 'worker',
      command: base.command,
      args: [...base.args, 'evidex:worker', '--', '--poll-ms', '1000'],
    },
  ];
}

export function runDevFull(input = {}) {
  const spawnProcess = input.spawnProcess ?? spawn;
  const runtimeProcess = input.runtimeProcess ?? process;
  const commands = createDevFullCommands(input);
  let stopping = false;

  const children = commands.map((entry) => {
    const child = spawnProcess(entry.command, entry.args, {
      cwd: runtimeProcess.cwd(),
      env: runtimeProcess.env,
      stdio: 'inherit',
    });
    child.once('error', (error) => {
      console.error(`[dev:full] ${entry.name} failed to start:`, error);
    });
    return { ...entry, child };
  });

  const stop = (signal, exitCode) => {
    if (stopping) return;
    stopping = true;
    for (const entry of children) {
      if (!entry.child.killed) entry.child.kill(signal);
    }
    if (typeof exitCode === 'number') runtimeProcess.exitCode = exitCode;
  };

  runtimeProcess.once('SIGINT', () => stop('SIGINT'));
  runtimeProcess.once('SIGTERM', () => stop('SIGTERM'));

  for (const entry of children) {
    entry.child.once('exit', (code, signal) => {
      if (stopping) return;
      console.error(
        `[dev:full] ${entry.name} exited (${signal ?? `code ${code ?? 1}`}); stopping local stack.`
      );
      stop('SIGTERM', code ?? 1);
    });
  }

  return { commands, children, stop };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runDevFull();
}
