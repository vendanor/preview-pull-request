import * as core from '@actions/core';
import { runCmd } from './run-cmd';

export async function loginDockerRegistry(
  username: string,
  password: string,
  registry: string
): Promise<void> {
  if (!username || !password) {
    throw new Error('Username and password required');
  }
  core.info(`🔑 Logging into ${registry}...`);
  const loginResult = await runCmd('docker', [
    'login',
    '--username',
    username,
    '--password',
    password,
    registry
  ]);
  if (loginResult.resultCode === 0) {
    core.info('🎉 Great success - Login Succeeded!');
  } else {
    core.info('Login failed!');
    core.error(loginResult.output);
  }
}
