import * as exec from '@actions/exec';

interface CmdResult {
  resultCode: number;
  output: string;
  stdErr?: string;
}

// Run cmd and capture output
export async function runCmd(
  cmd: string,
  args?: Array<string>,
  silent?: boolean
): Promise<CmdResult> {
  return new Promise<CmdResult>((resolve, reject) => {
    let output = '';
    let err = '';
    exec
      .exec(cmd, args, {
        silent: !!silent,
        listeners: {
          stdout: data => {
            output += data.toString();
          },
          stderr: data => {
            err += data.toString();
          }
        }
      })
      .then(resultCode => {
        resolve({
          resultCode,
          output,
          stdErr: err
        });
      })
      .catch(err => {
        reject(err);
      });
  });
}
