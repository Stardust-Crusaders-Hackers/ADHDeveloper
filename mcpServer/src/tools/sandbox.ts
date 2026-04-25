import { spawn, execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as vm from "vm";

const execFileAsync = promisify(execFile);

export type SandboxLanguage = "javascript" | "typescript" | "python" | "bash" | "sh";
export type SandboxEngine = "docker" | "vm" | "process";

export interface SandboxLimits {
  timeoutMs: number;
  memoryMb: number;
  cpus: number;
  networkAccess: boolean;
}

export interface SandboxParams {
  code: string;
  language: SandboxLanguage;
  stdin?: string;
  args?: string[];
  limits?: Partial<SandboxLimits>;
}

export interface SandboxResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  engine: SandboxEngine;
  engineWarning?: string;
  limits: SandboxLimits;
}

const DEFAULT_LIMITS: SandboxLimits = {
  timeoutMs: 10_000,
  memoryMb: 128,
  cpus: 0.5,
  networkAccess: false,
};

const DOCKER_IMAGES: Record<SandboxLanguage, string> = {
  javascript: "node:22-alpine",
  typescript: "node:22-alpine",
  python: "python:3.12-alpine",
  bash: "alpine:latest",
  sh: "alpine:latest",
};

const EXTENSIONS: Record<SandboxLanguage, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  bash: "sh",
  sh: "sh",
};

function dockerRunCommand(language: SandboxLanguage, scriptPath: string): string[] {
  switch (language) {
    case "typescript":
      return ["node", "--experimental-strip-types", scriptPath];
    case "python":
      return ["python3", scriptPath];
    default:
      return ["node", scriptPath];
    case "bash":
    case "sh":
      return ["sh", scriptPath];
  }
}

function hostRunCommand(language: SandboxLanguage, scriptPath: string): [string, string[]] {
  switch (language) {
    case "typescript":
      return ["node", ["--experimental-strip-types", scriptPath]];
    case "python":
      return ["python3", [scriptPath]];
    case "bash":
    case "sh":
      return ["sh", [scriptPath]];
    default:
      return ["node", [scriptPath]];
  }
}

function toDockerMountPath(hostPath: string): string {
  if (process.platform !== "win32") return hostPath;
  // C:\Users\foo → C:/Users/foo — Docker Desktop on Windows accepts this
  return hostPath.replace(/\\/g, "/");
}

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `sandbox-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

let dockerAvailable: boolean | undefined;

async function checkDocker(): Promise<boolean> {
  if (dockerAvailable !== undefined) return dockerAvailable;
  try {
    await execFileAsync("docker", ["info"], { timeout: 5_000 });
    dockerAvailable = true;
  } catch {
    dockerAvailable = false;
  }
  return dockerAvailable;
}

// ─── Docker engine ───────────────────────────────────────────────────────────

async function runDocker(
  code: string,
  language: SandboxLanguage,
  limits: SandboxLimits,
  stdin?: string,
  args?: string[]
): Promise<Omit<SandboxResult, "engine" | "limits">> {
  const workDir = makeTempDir();
  const ext = EXTENSIONS[language];
  const scriptFile = path.join(workDir, `script.${ext}`);
  fs.writeFileSync(scriptFile, code, "utf-8");

  const image = DOCKER_IMAGES[language];
  const runCmd = dockerRunCommand(language, `/sandbox/script.${ext}`);
  if (args?.length) runCmd.push(...args);

  const mountSrc = toDockerMountPath(workDir);

  const dockerArgs = [
    "run", "--rm",
    "--pull=missing",
    `--memory=${limits.memoryMb}m`,
    `--memory-swap=${limits.memoryMb}m`,
    `--cpus=${limits.cpus}`,
    "--read-only",
    "--tmpfs=/tmp:noexec,nosuid,size=32m",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--ulimit", "nproc=64:64",
    "--ulimit", "nofile=128:128",
    "-v", `${mountSrc}:/sandbox:ro`,
    "--workdir", "/sandbox",
  ];

  if (!limits.networkAccess) dockerArgs.push("--network=none");
  if (stdin) dockerArgs.push("-i");

  dockerArgs.push(image, ...runCmd);

  const start = Date.now();
  let timedOut = false;

  return new Promise((resolve) => {
    const proc = spawn("docker", dockerArgs, {
      stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    if (stdin && proc.stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, limits.timeoutMs);

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      cleanup(workDir);
      resolve({
        success: !timedOut && exitCode === 0,
        exitCode,
        stdout: stdout.slice(0, 65_536),
        stderr: stderr.slice(0, 8_192),
        durationMs: Date.now() - start,
        timedOut,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      cleanup(workDir);
      resolve({
        success: false,
        exitCode: null,
        stdout: "",
        stderr: err.message,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });
  });
}

// ─── VM engine (JS only, fallback) ───────────────────────────────────────────

function runVm(
  code: string,
  limits: SandboxLimits
): Omit<SandboxResult, "engine" | "limits"> {
  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let timedOut = false;

  const sandbox = vm.createContext({
    console: {
      log: (...a: unknown[]) => { stdout += a.map(String).join(" ") + "\n"; },
      error: (...a: unknown[]) => { stderr += a.map(String).join(" ") + "\n"; },
      warn: (...a: unknown[]) => { stderr += "WARN: " + a.map(String).join(" ") + "\n"; },
      info: (...a: unknown[]) => { stdout += a.map(String).join(" ") + "\n"; },
    },
    process: {
      env: {},
      argv: ["node", "script.js"],
      exit: (code = 0) => { exitCode = code; },
    },
    // block dangerous globals
    fetch: undefined,
    require: undefined,
    import: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    __dirname: undefined,
    __filename: undefined,
    global: undefined,
    globalThis: undefined,
  });

  try {
    new vm.Script(code).runInContext(sandbox, { timeout: limits.timeoutMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timed out") || msg.includes("Script execution")) {
      timedOut = true;
      exitCode = 124;
    } else {
      exitCode = 1;
      stderr += msg;
    }
  }

  return {
    success: exitCode === 0 && !timedOut,
    exitCode,
    stdout,
    stderr,
    durationMs: Date.now() - start,
    timedOut,
  };
}

// ─── Process engine (last resort, no isolation) ───────────────────────────────

async function runProcess(
  code: string,
  language: SandboxLanguage,
  limits: SandboxLimits,
  stdin?: string,
  args?: string[]
): Promise<Omit<SandboxResult, "engine" | "limits">> {
  const workDir = makeTempDir();
  const ext = EXTENSIONS[language];
  const scriptFile = path.join(workDir, `script.${ext}`);
  fs.writeFileSync(scriptFile, code, "utf-8");

  const [cmd, cmdArgs] = hostRunCommand(language, scriptFile);
  if (args?.length) cmdArgs.push(...args);

  const start = Date.now();
  let timedOut = false;

  return new Promise((resolve) => {
    const proc = spawn(cmd, cmdArgs, {
      stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
      env: { PATH: process.env["PATH"] ?? "" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    if (stdin && proc.stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, limits.timeoutMs);

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      cleanup(workDir);
      resolve({
        success: !timedOut && exitCode === 0,
        exitCode,
        stdout: stdout.slice(0, 65_536),
        stderr: stderr.slice(0, 8_192),
        durationMs: Date.now() - start,
        timedOut,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      cleanup(workDir);
      resolve({
        success: false,
        exitCode: null,
        stdout: "",
        stderr: err.message,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function executeSandbox(params: SandboxParams): Promise<SandboxResult> {
  const limits: SandboxLimits = { ...DEFAULT_LIMITS, ...params.limits };
  const { code, language, stdin, args } = params;

  if (await checkDocker()) {
    const result = await runDocker(code, language, limits, stdin, args);
    return { ...result, engine: "docker", limits };
  }

  if (language === "javascript") {
    const result = runVm(code, limits);
    return {
      ...result,
      engine: "vm",
      engineWarning:
        "Docker unavailable — used Node vm module. Timeout enforced; no memory/CPU/network isolation. Async code not time-bounded.",
      limits,
    };
  }

  const result = await runProcess(code, language, limits, stdin, args);
  return {
    ...result,
    engine: "process",
    engineWarning:
      "Docker unavailable — ran in host process. Only timeout enforced. NO memory, CPU, or network isolation.",
    limits,
  };
}

export function resetDockerCache(): void {
  dockerAvailable = undefined;
}
