import { execSync } from "child_process";

export function git(cmd: string, cwd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return e.stderr?.trim() ?? e.message ?? "";
  }
}
