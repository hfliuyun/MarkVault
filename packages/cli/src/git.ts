import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await stat(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

export interface CommitResult {
  committed: boolean;
  pushed: boolean;
  message?: string;
}

/**
 * Commit everything Git does not ignore (the vault's .gitignore keeps images
 * and Obsidian state out), then push. A failed push is reported, not fatal.
 */
export async function commitVault(vault: string, message: string): Promise<CommitResult> {
  if (!(await isGitRepo(vault))) return { committed: false, pushed: false, message: "vault 不是 git 仓库，跳过提交" };
  await git(vault, ["add", "-A"]);
  const staged = (await git(vault, ["diff", "--cached", "--name-only"])).trim();
  let committed = false;
  if (staged) {
    await git(vault, ["commit", "-q", "-m", message]);
    committed = true;
  }
  const remotes = (await git(vault, ["remote"])).trim();
  if (!remotes) return { committed, pushed: false, message: "vault 没有 remote，跳过推送" };
  try {
    const ahead = (await git(vault, ["rev-list", "--count", "@{u}..HEAD"]).catch(() => "1")).trim();
    if (ahead === "0") return { committed, pushed: false };
    await git(vault, ["push", "-q"]);
    return { committed, pushed: true };
  } catch (error) {
    return { committed, pushed: false, message: `推送失败（稍后手动 git push）：${(error as Error).message.split("\n")[0]}` };
  }
}
