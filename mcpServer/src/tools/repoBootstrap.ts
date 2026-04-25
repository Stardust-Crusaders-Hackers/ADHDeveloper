import * as fs from "fs";
import * as path from "path";

type OverwritePolicy = "no-overwrite" | "overwrite" | "prompt";
type Architecture = "monolith" | "modular" | "hexagonal" | "microservices";

export interface RepoBootstrapConfig {
  projectName: string;
  vision?: string;
  stacks: string[];
  architecture: Architecture;
  dockerize: boolean;
  includeNginx: boolean;
  overwritePolicy?: OverwritePolicy;
}

interface BootstrapResult {
  created: string[];
  merged: string[];
  skipped: string[];
  errors: string[];
  notes: string[];
}

const COMMON_GITIGNORE = [
  ".DS_Store",
  "Thumbs.db",
  ".idea/",
  ".vscode/",
  ".env",
  ".env.*",
  "coverage/",
  "dist/",
  "build/",
  "tmp/",
  "*.log",
];

const STACK_GITIGNORE: Record<string, string[]> = {
  node: ["node_modules/", ".npm/", ".pnpm-store/"],
  python: [".venv/", "__pycache__/", "*.pyc", ".pytest_cache/"],
  java: [".gradle/", "target/", "*.class"],
  go: ["bin/", "*.test"],
  kotlin: [".gradle/", "build/", "*.iml"],
  php: ["vendor/"],
  ruby: [".bundle/", "vendor/bundle/"],
  rust: ["target/", "**/*.rs.bk"],
  c: ["*.o", "*.out", "*.exe"],
  cpp: ["*.o", "*.obj", "*.exe"],
  dotnet: ["bin/", "obj/", "*.user", "*.suo"],
};

const STACK_DOCKERIGNORE: Record<string, string[]> = {
  node: ["node_modules/", "npm-debug.log*", ".git/"],
  python: [".venv/", "__pycache__/", ".git/"],
  java: [".gradle/", "target/", ".git/"],
  go: ["bin/", ".git/"],
  kotlin: [".gradle/", "build/", ".git/"],
  php: ["vendor/", ".git/"],
  ruby: [".bundle/", "vendor/bundle/", ".git/"],
  rust: ["target/", ".git/"],
  c: ["build/", ".git/"],
  cpp: ["build/", ".git/"],
  dotnet: ["bin/", "obj/", ".git/"],
};

const STACK_ALIASES: Record<string, string> = {
  "node.js": "node",
  javascript: "node",
  typescript: "node",
  py: "python",
  jvm: "java",
  "c#": "dotnet",
  "csharp": "dotnet",
  ".net": "dotnet",
  "dotnet-core": "dotnet",
  "c++": "cpp",
};

function normalizeStack(stack: string): string {
  const s = stack.trim().toLowerCase();
  return STACK_ALIASES[s] ?? s;
}

function uniqueLines(lines: string[]): string[] {
  return Array.from(new Set(lines.map((l) => l.trim()).filter(Boolean)));
}

function mergeLineFile(filePath: string, lines: string[], result: BootstrapResult): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, uniqueLines(lines).join("\n") + "\n");
    result.created.push(filePath);
    return;
  }
  const existing = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  const merged = uniqueLines([...existing, ...lines]);
  fs.writeFileSync(filePath, merged.join("\n") + "\n");
  result.merged.push(filePath);
}

function writeFileByPolicy(
  filePath: string,
  content: string,
  policy: OverwritePolicy,
  result: BootstrapResult
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
    result.created.push(filePath);
    return;
  }

  if (policy === "overwrite") {
    fs.writeFileSync(filePath, content);
    result.merged.push(filePath);
    return;
  }

  if (policy === "prompt") {
    result.skipped.push(filePath);
    result.notes.push(`Prompt-required conflict skipped: ${filePath}`);
    return;
  }

  result.skipped.push(filePath);
}

function architectureDirectories(architecture: Architecture): string[] {
  switch (architecture) {
    case "modular":
      return ["apps", "packages", "infra", "docs"];
    case "hexagonal":
      return ["src/domain", "src/application", "src/infrastructure", "src/interfaces", "tests"];
    case "microservices":
      return ["services", "packages", "deploy", "docs"];
    case "monolith":
    default:
      return ["src", "tests", "docs", "scripts", "config"];
  }
}

function buildReadme(config: RepoBootstrapConfig): string {
  const stacks = config.stacks.join(", ");
  return `# ${config.projectName}

## Vision
${config.vision ?? "TBD"}

## Tech Stack
${stacks}

## Architecture
${config.architecture}

## Runtime
- Docker: ${config.dockerize ? "yes" : "no"}
- Nginx: ${config.includeNginx ? "yes" : "no"}
`;
}

function bootstrapStackTemplate(baseDir: string, stack: string, projectName: string, policy: OverwritePolicy, result: BootstrapResult): void {
  switch (stack) {
    case "node":
      writeFileByPolicy(
        path.join(baseDir, "package.json"),
        JSON.stringify(
          {
            name: projectName.toLowerCase().replace(/\s+/g, "-"),
            version: "0.1.0",
            private: true,
            type: "module",
            scripts: { start: "node src/index.js" },
          },
          null,
          2
        ) + "\n",
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "src", "index.js"), "console.log('hello node');\n", policy, result);
      break;
    case "python":
      writeFileByPolicy(
        path.join(baseDir, "pyproject.toml"),
        `[project]\nname = "${projectName.toLowerCase().replace(/\s+/g, "-")}"\nversion = "0.1.0"\nrequires-python = ">=3.11"\n`,
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "src", "main.py"), "print('hello python')\n", policy, result);
      break;
    case "java":
      writeFileByPolicy(
        path.join(baseDir, "pom.xml"),
        `<project><modelVersion>4.0.0</modelVersion><groupId>com.example</groupId><artifactId>${projectName.toLowerCase().replace(/\s+/g, "-")}</artifactId><version>0.1.0</version></project>\n`,
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "src", "main", "java", "Main.java"), "class Main { public static void main(String[] args) { System.out.println(\"hello java\"); } }\n", policy, result);
      break;
    case "go":
      writeFileByPolicy(path.join(baseDir, "go.mod"), `module ${projectName.toLowerCase().replace(/\s+/g, "-")}\n\ngo 1.22\n`, policy, result);
      writeFileByPolicy(path.join(baseDir, "main.go"), "package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Println(\"hello go\") }\n", policy, result);
      break;
    case "kotlin":
      writeFileByPolicy(
        path.join(baseDir, "build.gradle.kts"),
        "plugins { kotlin(\"jvm\") version \"2.0.0\" }\nrepositories { mavenCentral() }\n",
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "src", "main", "kotlin", "Main.kt"), "fun main() { println(\"hello kotlin\") }\n", policy, result);
      break;
    case "php":
      writeFileByPolicy(
        path.join(baseDir, "composer.json"),
        JSON.stringify({ name: projectName.toLowerCase().replace(/\s+/g, "-"), type: "project" }, null, 2) + "\n",
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "public", "index.php"), "<?php echo 'hello php';\n", policy, result);
      break;
    case "ruby":
      writeFileByPolicy(path.join(baseDir, "Gemfile"), "source 'https://rubygems.org'\n", policy, result);
      writeFileByPolicy(path.join(baseDir, "app", "main.rb"), "puts 'hello ruby'\n", policy, result);
      break;
    case "rust":
      writeFileByPolicy(
        path.join(baseDir, "Cargo.toml"),
        `[package]\nname = "${projectName.toLowerCase().replace(/\s+/g, "-")}"\nversion = "0.1.0"\nedition = "2021"\n`,
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "src", "main.rs"), "fn main() { println!(\"hello rust\"); }\n", policy, result);
      break;
    case "c":
      writeFileByPolicy(
        path.join(baseDir, "CMakeLists.txt"),
        `cmake_minimum_required(VERSION 3.20)\nproject(${projectName.replace(/\s+/g, "")} C)\nadd_executable(app src/main.c)\n`,
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "src", "main.c"), "#include <stdio.h>\nint main(){ printf(\"hello c\\n\"); return 0; }\n", policy, result);
      break;
    case "cpp":
      writeFileByPolicy(
        path.join(baseDir, "CMakeLists.txt"),
        `cmake_minimum_required(VERSION 3.20)\nproject(${projectName.replace(/\s+/g, "")} CXX)\nadd_executable(app src/main.cpp)\n`,
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "src", "main.cpp"), "#include <iostream>\nint main(){ std::cout << \"hello cpp\" << std::endl; return 0; }\n", policy, result);
      break;
    case "dotnet":
      writeFileByPolicy(
        path.join(baseDir, `${projectName.replace(/\s+/g, "")}.csproj`),
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n",
        policy,
        result
      );
      writeFileByPolicy(path.join(baseDir, "Program.cs"), "Console.WriteLine(\"hello dotnet\");\n", policy, result);
      break;
    default:
      result.notes.push(`No template for stack: ${stack}. Created base structure only.`);
  }
}

export async function repoBootstrap(projectPath: string, config: RepoBootstrapConfig): Promise<BootstrapResult> {
  const result: BootstrapResult = { created: [], merged: [], skipped: [], errors: [], notes: [] };
  const overwritePolicy: OverwritePolicy = config.overwritePolicy ?? "no-overwrite";

  try {
    if (!path.isAbsolute(projectPath)) {
      throw new Error("projectPath must be an absolute path");
    }
    fs.mkdirSync(projectPath, { recursive: true });

    const stacks = uniqueLines(config.stacks.map(normalizeStack));
    const dirs = architectureDirectories(config.architecture);
    for (const dir of dirs) {
      fs.mkdirSync(path.join(projectPath, dir), { recursive: true });
    }

    const gitignore = uniqueLines([
      ...COMMON_GITIGNORE,
      ...stacks.flatMap((s) => STACK_GITIGNORE[s] ?? []),
    ]);
    mergeLineFile(path.join(projectPath, ".gitignore"), gitignore, result);

    const dockerignore = uniqueLines(stacks.flatMap((s) => STACK_DOCKERIGNORE[s] ?? []));
    if (dockerignore.length > 0) {
      mergeLineFile(path.join(projectPath, ".dockerignore"), dockerignore, result);
    }

    writeFileByPolicy(path.join(projectPath, "README.md"), buildReadme({ ...config, stacks }), overwritePolicy, result);
    writeFileByPolicy(path.join(projectPath, ".editorconfig"), "root = true\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n", overwritePolicy, result);
    writeFileByPolicy(path.join(projectPath, ".env.example"), "APP_ENV=development\n", overwritePolicy, result);

    if (config.dockerize) {
      writeFileByPolicy(
        path.join(projectPath, "Dockerfile"),
        "FROM alpine:3.20\nWORKDIR /app\nCOPY . .\nCMD [\"sh\", \"-c\", \"echo bootstrap-ready && sleep infinity\"]\n",
        overwritePolicy,
        result
      );
      writeFileByPolicy(
        path.join(projectPath, "docker-compose.yml"),
        "services:\n  app:\n    build: .\n    ports:\n      - \"8080:8080\"\n",
        overwritePolicy,
        result
      );
    }

    if (config.includeNginx) {
      writeFileByPolicy(
        path.join(projectPath, "infra", "nginx", "nginx.conf"),
        "events {}\nhttp {\n  server {\n    listen 80;\n    location / {\n      proxy_pass http://app:8080;\n    }\n  }\n}\n",
        overwritePolicy,
        result
      );
    }

    const multiStackRoot = stacks.length > 1 ? path.join(projectPath, "services") : projectPath;
    for (const stack of stacks) {
      const stackBaseDir = stacks.length > 1 ? path.join(multiStackRoot, stack) : projectPath;
      fs.mkdirSync(stackBaseDir, { recursive: true });
      bootstrapStackTemplate(stackBaseDir, stack, config.projectName, overwritePolicy, result);
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

