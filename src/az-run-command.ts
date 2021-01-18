import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";

export async function executeAzCliCommand(command: string, silent?: boolean) {
  try {
    const azPath = await io.which("az", true);
    const commandLine = `"${azPath}" ${command}`;
    core.info(`azPath: ${azPath} commandLine: ${commandLine}`);
    await exec.exec(commandLine, [], {
      silent: !!silent,
    });
  } catch (error) {
    throw new Error(error);
  }
}
