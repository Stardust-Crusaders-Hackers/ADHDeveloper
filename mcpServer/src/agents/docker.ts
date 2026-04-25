import fs from "fs";
import path from "path";
import { AgentDefinition, AgentContext, AgentResult } from "../types.js";

// ─── Project detection ────────────────────────────────────────────────────────

type ProjectType = "node-ts" | "node-js" | "python" | "java-maven" | "java-gradle" | "go" | "unknown";

interface ProjectProfile {
  type: ProjectType;
  port?: number;
  buildCmd?: string;
  startCmd?: string;
  buildOutput?: string;
  packageManager?: "npm" | "yarn" | "pnpm";
}

function detectProject(root: string): ProjectProfile {
  const has = (f: string) => fs.existsSync(path.join(root, f));

  if (has("package.json")) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
    const pm = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
    const isTs = has("tsconfig.json") || !!pkg.devDependencies?.typescript;
    const start = pkg.scripts?.start ?? "node dist/index.js";
    const build = isTs ? (pkg.scripts?.build ?? "tsc") : undefined;
    const port = extractPort(JSON.stringify(pkg));

    return {
      type: isTs ? "node-ts" : "node-js",
      port: port ?? 3000,
      buildCmd: build,
      startCmd: start,
      buildOutput: isTs ? "dist" : undefined,
      packageManager: pm,
    };
  }

  if (has("requirements.txt") || has("pyproject.toml") || has("setup.py")) {
    return { type: "python", port: 8000, startCmd: "python main.py" };
  }

  if (has("pom.xml")) {
    return { type: "java-maven", port: 8080, buildCmd: "mvn package -q", startCmd: "java -jar target/app.jar" };
  }

  if (has("build.gradle") || has("build.gradle.kts")) {
    return { type: "java-gradle", port: 8080, buildCmd: "./gradlew build", startCmd: "java -jar build/libs/app.jar" };
  }

  if (has("go.mod")) {
    return { type: "go", port: 8080, buildCmd: "go build -o app .", startCmd: "./app" };
  }

  return { type: "unknown", port: 3000 };
}

function extractPort(src: string): number | undefined {
  const m = src.match(/PORT[^\d]*(\d{4,5})/);
  return m ? Number(m[1]) : undefined;
}

// ─── Generators ───────────────────────────────────────────────────────────────

function generateDockerfile(profile: ProjectProfile): string {
  switch (profile.type) {
    case "node-ts":
      return nodeTypescriptDockerfile(profile);
    case "node-js":
      return nodeJsDockerfile(profile);
    case "python":
      return pythonDockerfile(profile);
    case "java-maven":
    case "java-gradle":
      return javaDockerfile(profile);
    case "go":
      return goDockerfile(profile);
    default:
      return genericDockerfile(profile);
  }
}

const installCmd: Record<NonNullable<ProjectProfile["packageManager"]>, string> = {
  npm: "npm ci --omit=dev",
  yarn: "yarn install --frozen-lockfile --production",
  pnpm: "pnpm install --frozen-lockfile --prod",
};

const buildCmd: Record<NonNullable<ProjectProfile["packageManager"]>, string> = {
  npm: "npm run build",
  yarn: "yarn build",
  pnpm: "pnpm build",
};

function nodeTypescriptDockerfile(p: ProjectProfile): string {
  const pm = p.packageManager ?? "npm";
  const lockFile = pm === "pnpm" ? "pnpm-lock.yaml" : pm === "yarn" ? "yarn.lock" : "package-lock.json";

  return `# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ${lockFile} ./
RUN ${pm === "pnpm" ? "npm install -g pnpm && pnpm install --frozen-lockfile" : pm === "yarn" ? "yarn install --frozen-lockfile" : "npm ci"}

COPY tsconfig.json ./
COPY src ./src
RUN ${buildCmd[pm]}

# ── Runtime stage ──────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json ${lockFile} ./
RUN ${installCmd[pm]}

COPY --from=builder /app/${p.buildOutput ?? "dist"} ./${p.buildOutput ?? "dist"}

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE ${p.port ?? 3000}
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \\
  CMD wget -qO- http://localhost:${p.port ?? 3000}/health || exit 1

CMD ["node", "${p.buildOutput ?? "dist"}/index.js"]
`;
}

function nodeJsDockerfile(p: ProjectProfile): string {
  const pm = p.packageManager ?? "npm";
  const lockFile = pm === "pnpm" ? "pnpm-lock.yaml" : pm === "yarn" ? "yarn.lock" : "package-lock.json";

  return `# syntax=docker/dockerfile:1
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json ${lockFile} ./
RUN ${installCmd[pm]}

COPY . .

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE ${p.port ?? 3000}
HEALTHCHECK --interval=30s --timeout=5s \\
  CMD wget -qO- http://localhost:${p.port ?? 3000}/health || exit 1

CMD ["node", "index.js"]
`;
}

function pythonDockerfile(p: ProjectProfile): string {
  return `# syntax=docker/dockerfile:1
FROM python:3.12-slim AS builder
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Runtime stage ──────────────────────────────────────
FROM python:3.12-slim AS runtime
WORKDIR /app

COPY --from=builder /install /usr/local
COPY . .

RUN useradd -r -s /bin/false appuser
USER appuser

EXPOSE ${p.port ?? 8000}
HEALTHCHECK --interval=30s --timeout=5s \\
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${p.port ?? 8000}/health')" || exit 1

CMD ["python", "main.py"]
`;
}

function javaDockerfile(p: ProjectProfile): string {
  const isMaven = p.type === "java-maven";
  const builderImage = isMaven ? "maven:3.9-eclipse-temurin-21" : "gradle:8-jdk21";
  const buildStep = isMaven ? "mvn package -q -DskipTests" : "./gradlew build -x test";
  const jarPath = isMaven ? "target/*.jar" : "build/libs/*.jar";

  return `# syntax=docker/dockerfile:1
FROM ${builderImage} AS builder
WORKDIR /app

${isMaven ? "COPY pom.xml ./" : "COPY build.gradle* settings.gradle* ./"}
${isMaven ? "RUN mvn dependency:go-offline -q" : "RUN gradle dependencies --no-daemon -q"}

COPY src ./src
RUN ${buildStep}

# ── Runtime stage ──────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

COPY --from=builder /app/${jarPath} app.jar

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE ${p.port ?? 8080}
HEALTHCHECK --interval=30s --timeout=5s \\
  CMD wget -qO- http://localhost:${p.port ?? 8080}/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
`;
}

function goDockerfile(p: ProjectProfile): string {
  return `# syntax=docker/dockerfile:1
FROM golang:1.22-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o app .

# ── Runtime stage ──────────────────────────────────────
FROM scratch AS runtime
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/app /app

EXPOSE ${p.port ?? 8080}

ENTRYPOINT ["/app"]
`;
}

function genericDockerfile(p: ProjectProfile): string {
  return `# syntax=docker/dockerfile:1
FROM debian:bookworm-slim
WORKDIR /app
COPY . .
EXPOSE ${p.port ?? 3000}
CMD ["echo", "Configure CMD for your runtime"]
`;
}

// ─── Docker Compose ───────────────────────────────────────────────────────────

function generateCompose(profile: ProjectProfile, serviceName: string): string {
  const port = profile.port ?? 3000;

  return `services:
  ${serviceName}:
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    ports:
      - "\${PORT:-${port}}:${port}"
    environment:
      - NODE_ENV=\${NODE_ENV:-production}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:${port}/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  # Uncomment to add a database:
  # db:
  #   image: postgres:16-alpine
  #   environment:
  #     POSTGRES_DB: \${DB_NAME:-appdb}
  #     POSTGRES_USER: \${DB_USER:-appuser}
  #     POSTGRES_PASSWORD: \${DB_PASS:-changeme}
  #   volumes:
  #     - db-data:/var/lib/postgresql/data

# volumes:
#   db-data:
`;
}

// ─── .dockerignore ────────────────────────────────────────────────────────────

function generateDockerignore(type: ProjectType): string {
  const base = [
    "# Version control",
    ".git",
    ".gitignore",
    "",
    "# Docker",
    "Dockerfile*",
    "docker-compose*.yml",
    ".dockerignore",
    "",
    "# Docs & CI",
    "*.md",
    ".github",
    ".vscode",
    ".idea",
    "",
    "# Secrets",
    ".env*",
    "!.env.example",
    "",
  ];

  const extras: Record<string, string[]> = {
    "node-ts": ["# Node", "node_modules", "dist", "coverage", "*.log", ".nyc_output"],
    "node-js": ["# Node", "node_modules", "coverage", "*.log"],
    python: ["# Python", "__pycache__", "*.pyc", "*.pyo", ".venv", "venv", ".pytest_cache", "*.egg-info"],
    "java-maven": ["# Java", "target", "*.class"],
    "java-gradle": ["# Java", "build", ".gradle", "*.class"],
    go: ["# Go", "*.test", "*.out"],
    unknown: [],
  };

  return [...base, ...(extras[type] ?? [])].join("\n") + "\n";
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

interface AnalysisFinding {
  severity: "error" | "warn" | "info";
  message: string;
}

function analyzeDockerfile(src: string): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const lines = src.split("\n");

  if (!src.includes("USER ")) findings.push({ severity: "error", message: "No USER directive — container runs as root" });
  if (!src.includes("HEALTHCHECK")) findings.push({ severity: "warn", message: "No HEALTHCHECK defined" });
  if (src.includes("FROM") && !src.includes("AS ")) findings.push({ severity: "warn", message: "Single-stage build — consider multi-stage to reduce image size" });
  if (src.match(/FROM\s+\w+:latest/)) findings.push({ severity: "warn", message: "Tag :latest used — pin to specific version for reproducibility" });
  if (src.includes("npm install") && !src.includes("npm ci")) findings.push({ severity: "warn", message: "Use 'npm ci' instead of 'npm install' for reproducible installs" });
  if (src.includes("COPY . .") && !src.includes("package")) findings.push({ severity: "warn", message: "COPY . . before installing dependencies skips layer cache — copy package files first" });
  if (!lines.some((l) => l.startsWith("# syntax="))) findings.push({ severity: "info", message: "Add '# syntax=docker/dockerfile:1' to enable BuildKit features" });
  if (src.includes("RUN") && src.includes("apt-get") && !src.includes("rm -rf /var/lib/apt/lists")) findings.push({ severity: "warn", message: "apt-get cache not cleaned — adds unnecessary layer weight" });

  return findings;
}

function formatFindings(findings: AnalysisFinding[]): string {
  if (findings.length === 0) return "No issues found.";
  const icons = { error: "✗", warn: "⚠", info: "ℹ" } as const;
  return findings.map((f) => `${icons[f.severity]} [${f.severity.toUpperCase()}] ${f.message}`).join("\n");
}

// ─── Agent handler ────────────────────────────────────────────────────────────

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const projectRoot = (ctx.metadata?.projectRoot as string | undefined) ?? process.cwd();
  const writeFiles = (ctx.metadata?.write as boolean | undefined) ?? false;
  const q = ctx.query.toLowerCase();

  // Infer action from query
  const action =
    (ctx.metadata?.action as string | undefined) ??
    (q.includes("analyz") || q.includes("review") || q.includes("check") ? "analyze"
      : q.includes("compose") ? "compose"
      : q.includes("ignore") ? "dockerignore"
      : q.includes("all") || q.includes("setup") || q.includes("init") ? "all"
      : "generate");

  const profile = detectProject(projectRoot);
  const serviceName = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const outputs: Record<string, string> = {};
  const written: string[] = [];

  function maybeWrite(filename: string, content: string): void {
    outputs[filename] = content;
    if (writeFiles) {
      fs.writeFileSync(path.join(projectRoot, filename), content, "utf-8");
      written.push(filename);
    }
  }

  if (action === "analyze") {
    const dockerfilePath = path.join(projectRoot, "Dockerfile");
    if (!fs.existsSync(dockerfilePath)) {
      return { success: false, message: "No Dockerfile found. Run with action=generate first." };
    }
    const src = fs.readFileSync(dockerfilePath, "utf-8");
    const findings = analyzeDockerfile(src);
    return {
      success: true,
      message: `Dockerfile analysis for ${serviceName}:\n\n${formatFindings(findings)}`,
      data: { findings, total: findings.length },
    };
  }

  if (action === "compose") {
    maybeWrite("docker-compose.yml", generateCompose(profile, serviceName));
  } else if (action === "dockerignore") {
    maybeWrite(".dockerignore", generateDockerignore(profile.type));
  } else {
    // generate or all
    maybeWrite("Dockerfile", generateDockerfile(profile));
    if (action === "all") {
      maybeWrite("docker-compose.yml", generateCompose(profile, serviceName));
      maybeWrite(".dockerignore", generateDockerignore(profile.type));
    }
  }

  const filesList = Object.entries(outputs)
    .map(([name, content]) => `\n${"─".repeat(40)}\n📄 ${name}\n${"─".repeat(40)}\n${content}`)
    .join("\n");

  const writtenMsg = written.length > 0 ? `\nWritten to disk: ${written.join(", ")}` : "\n(pass metadata.write=true to write files to disk)";

  return {
    success: true,
    message: `Detected project: ${profile.type} | port: ${profile.port}${writtenMsg}${filesList}`,
    data: { profile, files: Object.keys(outputs), written },
  };
}

const dockerAgent: AgentDefinition = {
  name: "docker",
  description:
    "Docker expert. Generates optimized Dockerfiles (multi-stage, non-root, health checks), docker-compose.yml, and .dockerignore. Analyzes existing Dockerfiles for security and performance issues. Auto-detects Node/TypeScript/Python/Java/Go projects.",
  keywords: [
    "docker", "dockerfile", "container", "compose", "docker-compose",
    "image", "build", "deploy", "containerize", "dockerignore",
    "kubernetes", "k8s", "devops", "ci", "cd", "ship",
  ],
  handler,
};

export default dockerAgent;
