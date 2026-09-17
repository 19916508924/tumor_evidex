import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { createDevFullCommands, runDevFull } from '../../scripts/dev-full.mjs';

describe('local full-stack development launcher', () => {
  it('runs a JavaScript package-manager CLI through Node', () => {
    expect(
      createDevFullCommands({
        nodeExecutable: '/node',
        packageManagerExecutable: '/pnpm.cjs',
      })
    ).toEqual([
      {
        name: 'web',
        command: '/node',
        args: ['/pnpm.cjs', 'dev'],
      },
      {
        name: 'worker',
        command: '/node',
        args: ['/pnpm.cjs', 'evidex:worker', '--', '--poll-ms', '1000'],
      },
    ]);
  });

  it('executes a native package-manager binary directly', () => {
    expect(
      createDevFullCommands({
        nodeExecutable: '/node',
        packageManagerExecutable: '/Users/developer/.local/bin/pnpm',
      })
    ).toEqual([
      {
        name: 'web',
        command: '/Users/developer/.local/bin/pnpm',
        args: ['dev'],
      },
      {
        name: 'worker',
        command: '/Users/developer/.local/bin/pnpm',
        args: ['evidex:worker', '--', '--poll-ms', '1000'],
      },
    ]);
  });

  it('stops the whole local stack when either process exits', () => {
    const runtimeProcess = Object.assign(new EventEmitter(), {
      cwd: () => '/workspace',
      env: { NODE_ENV: 'development' },
      exitCode: undefined as number | undefined,
    });
    const children = [fakeChild(), fakeChild()];
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(children[0])
      .mockReturnValueOnce(children[1]);

    runDevFull({
      nodeExecutable: '/node',
      packageManagerExecutable: '/pnpm.cjs',
      runtimeProcess,
      spawnProcess,
    });
    children[0].emit('exit', 2, null);

    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
    expect(children[1].kill).toHaveBeenCalledWith('SIGTERM');
    expect(runtimeProcess.exitCode).toBe(2);
  });
});

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    killed: false,
    kill: vi.fn(function (this: { killed: boolean }) {
      this.killed = true;
      return true;
    }),
  });
}
