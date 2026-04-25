import fs from "fs";
import path from "path";
import { AgentDefinition, AgentContext, AgentResult } from "../types.js";

// ─── Project detection ────────────────────────────────────────────────────────

type ProjectType = "node-ts" | "node-js" | "python" | "java-maven" | "java-gradle" | "go" | "unknown";
type CiPlatform = "github" | "gitlab" | "bitbucket" | "azure" | "jenkins";

interface ProjectProfile {
  type: ProjectType;
  packageManager?: "npm" | "yarn" | "pnpm";
  hasDocker: boolean;
  hasTests: boolean;
  testCmd?: string;
  buildCmd?: string;
  port?: number;
  nodeVersion?: string;
  pythonVersion?: string;
}

function detectProject(root: string): ProjectProfile {
  const has = (f: string) => fs.existsSync(path.join(root, f));
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf-8");

  const hasDocker = has("Dockerfile") || has("docker-compose.yml");

  if (has("package.json")) {
    const pkg = JSON.parse(read("package.json"));
    const pm = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
    const isTs = has("tsconfig.json") || !!pkg.devDependencies?.typescript;
    const nodeVer = pkg.engines?.node?.replace(/[^\d.]/g, "").split(".")[0] ?? "22";
    const hasTests = !!(pkg.scripts?.test && !pkg.scripts.test.includes("no test"));

    return {
      type: isTs ? "node-ts" : "node-js",
      packageManager: pm,
      hasDocker,
      hasTests,
      testCmd: pkg.scripts?.test ? runCmd(pm, "test") : undefined,
      buildCmd: pkg.scripts?.build ? runCmd(pm, "build") : undefined,
      nodeVersion: nodeVer,
    };
  }

  if (has("requirements.txt") || has("pyproject.toml")) {
    return { type: "python", hasDocker, hasTests: has("tests") || has("test"), testCmd: "pytest", buildCmd: undefined, pythonVersion: "3.12" };
  }

  if (has("pom.xml")) {
    return { type: "java-maven", hasDocker, hasTests: true, testCmd: "mvn test", buildCmd: "mvn package -DskipTests" };
  }

  if (has("build.gradle") || has("build.gradle.kts")) {
    return { type: "java-gradle", hasDocker, hasTests: true, testCmd: "./gradlew test", buildCmd: "./gradlew build -x test" };
  }

  if (has("go.mod")) {
    return { type: "go", hasDocker, hasTests: true, testCmd: "go test ./...", buildCmd: "go build -o app ." };
  }

  return { type: "unknown", hasDocker, hasTests: false };
}

function runCmd(pm: "npm" | "yarn" | "pnpm", script: string): string {
  return pm === "npm" ? `npm run ${script}` : `${pm} ${script}`;
}

function installCmd(pm: "npm" | "yarn" | "pnpm"): string {
  return pm === "npm" ? "npm ci" : pm === "yarn" ? "yarn install --frozen-lockfile" : "pnpm install --frozen-lockfile";
}

// ─── GitHub Actions ───────────────────────────────────────────────────────────

function githubActions(p: ProjectProfile, serviceName: string): string {
  const nodeSetup = `
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '${p.nodeVersion ?? "22"}'
          cache: '${p.packageManager ?? "npm"}'`;

  const pythonSetup = `
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '${p.pythonVersion ?? "3.12"}'
          cache: 'pip'`;

  const javaSetup = `
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: '${p.type === "java-maven" ? "maven" : "gradle"}'`;

  const goSetup = `
      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'
          cache: true`;

  const langSetup =
    p.type.startsWith("node") ? nodeSetup
    : p.type === "python" ? pythonSetup
    : p.type.startsWith("java") ? javaSetup
    : p.type === "go" ? goSetup
    : "";

  const installStep =
    p.type.startsWith("node") ? `
      - name: Install dependencies
        run: ${installCmd(p.packageManager ?? "npm")}`
    : p.type === "python" ? `
      - name: Install dependencies
        run: pip install -r requirements.txt`
    : "";

  const buildStep = p.buildCmd ? `
      - name: Build
        run: ${p.buildCmd}` : "";

  const testStep = p.hasTests && p.testCmd ? `
      - name: Test
        run: ${p.testCmd}` : "";

  const dockerSteps = p.hasDocker ? `
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          username: \${{ secrets.DOCKER_USERNAME }}
          password: \${{ secrets.DOCKER_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: \${{ github.event_name != 'pull_request' }}
          tags: |
            \${{ secrets.DOCKER_USERNAME }}/${serviceName}:latest
            \${{ secrets.DOCKER_USERNAME }}/${serviceName}:\${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max` : "";

  return `name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: Test & Build
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
${langSetup}
${installStep}
${testStep}
${buildStep}

  docker:
    name: Docker Build & Push
    runs-on: ubuntu-latest
    needs: ci
    if: github.event_name != 'pull_request'
${p.hasDocker ? dockerSteps : "    steps:\n      - run: echo 'No Dockerfile found — skipping'"}

  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: docker
    if: github.ref == 'refs/heads/main'
    environment: production

    steps:
      - name: Deploy
        run: echo 'Add your deploy step here (SSH, kubectl, fly, railway, etc.)'
        env:
          DEPLOY_KEY: \${{ secrets.DEPLOY_KEY }}
`;
}

// ─── GitLab CI ────────────────────────────────────────────────────────────────

function gitlabCi(p: ProjectProfile, serviceName: string): string {
  const image =
    p.type.startsWith("node") ? `node:${p.nodeVersion ?? "22"}-alpine`
    : p.type === "python" ? `python:${p.pythonVersion ?? "3.12"}-slim`
    : p.type.startsWith("java") ? "eclipse-temurin:21"
    : p.type === "go" ? "golang:1.22-alpine"
    : "ubuntu:24.04";

  const install =
    p.type.startsWith("node") ? `  - ${installCmd(p.packageManager ?? "npm")}`
    : p.type === "python" ? "  - pip install -r requirements.txt"
    : "";

  return `image: ${image}

stages:
  - test
  - build
  - docker
  - deploy

variables:
  DOCKER_IMAGE: \$CI_REGISTRY_IMAGE/${serviceName}
  DOCKER_TAG: \$CI_COMMIT_SHA

cache:
  key: \$CI_COMMIT_REF_SLUG
  paths:
    - ${p.type.startsWith("node") ? "node_modules/" : p.type === "python" ? ".pip-cache/" : ".cache/"}

test:
  stage: test
  script:
${install || "    - echo 'install step'"}
${p.hasTests && p.testCmd ? `    - ${p.testCmd}` : "    - echo 'no tests configured'"}
  coverage: '/Coverage: \\d+\\.\\d+%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build:
  stage: build
  script:
${install || "    - echo 'install step'"}
${p.buildCmd ? `    - ${p.buildCmd}` : "    - echo 'no build step'"}
  artifacts:
    paths:
      - ${p.type === "node-ts" ? "dist/" : p.type.startsWith("java") ? "target/" : "build/"}
    expire_in: 1 hour

docker:
  stage: docker
  image: docker:26
  services:
    - docker:26-dind
  before_script:
    - docker login -u \$CI_REGISTRY_USER -p \$CI_REGISTRY_PASSWORD \$CI_REGISTRY
  script:
    - docker build --cache-from \$DOCKER_IMAGE:latest -t \$DOCKER_IMAGE:\$DOCKER_TAG -t \$DOCKER_IMAGE:latest .
    - docker push \$DOCKER_IMAGE:\$DOCKER_TAG
    - docker push \$DOCKER_IMAGE:latest
  only:
    - main
    - develop
${p.hasDocker ? "" : "  # No Dockerfile found — configure before enabling\n  when: manual"}

deploy:
  stage: deploy
  script:
    - echo 'Add deploy step here'
  environment:
    name: production
    url: https://your-app.example.com
  only:
    - main
  when: manual
`;
}

// ─── Bitbucket Pipelines ──────────────────────────────────────────────────────

function bitbucketPipelines(p: ProjectProfile): string {
  const image =
    p.type.startsWith("node") ? `node:${p.nodeVersion ?? "22"}`
    : p.type === "python" ? `python:${p.pythonVersion ?? "3.12"}`
    : "atlassian/default-image:4";

  const install =
    p.type.startsWith("node") ? `          - ${installCmd(p.packageManager ?? "npm")}`
    : p.type === "python" ? "          - pip install -r requirements.txt"
    : "";

  return `image: ${image}

definitions:
  caches:
    node: node_modules
  steps:
    - step: &test
        name: Test
        caches:
          - node
        script:
${install}
${p.hasTests && p.testCmd ? `          - ${p.testCmd}` : "          - echo 'no tests'"}

    - step: &build
        name: Build
        caches:
          - node
        script:
${install}
${p.buildCmd ? `          - ${p.buildCmd}` : "          - echo 'no build step'"}
        artifacts:
          - dist/**

    - step: &docker
        name: Docker Build & Push
        services:
          - docker
        script:
          - docker login -u $DOCKER_USERNAME -p $DOCKER_TOKEN
          - docker build -t $DOCKER_USERNAME/app:$BITBUCKET_COMMIT .
          - docker push $DOCKER_USERNAME/app:$BITBUCKET_COMMIT

pipelines:
  pull-requests:
    '**':
      - step: *test

  branches:
    develop:
      - step: *test
      - step: *build

    main:
      - step: *test
      - step: *build
      - step: *docker
      - step:
          name: Deploy
          deployment: production
          script:
            - echo 'Add deploy step here'
          trigger: manual
`;
}

// ─── Azure DevOps ─────────────────────────────────────────────────────────────

function azurePipelines(p: ProjectProfile): string {
  const nodeTask = p.type.startsWith("node") ? `
  - task: NodeTool@0
    inputs:
      versionSpec: '${p.nodeVersion ?? "22"}.x'
    displayName: 'Install Node.js'

  - script: ${installCmd(p.packageManager ?? "npm")}
    displayName: 'Install dependencies'` : "";

  return `trigger:
  branches:
    include:
      - main
      - develop

pr:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

variables:
  - group: app-secrets
  - name: IMAGE_NAME
    value: '$(Build.Repository.Name)'

stages:
  - stage: CI
    displayName: 'Test & Build'
    jobs:
      - job: TestBuild
        steps:
${nodeTask}
${p.hasTests && p.testCmd ? `
          - script: ${p.testCmd}
            displayName: 'Run tests'
            continueOnError: false` : ""}
${p.buildCmd ? `
          - script: ${p.buildCmd}
            displayName: 'Build'` : ""}
${p.hasDocker ? `
          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: '$(Build.ArtifactStagingDirectory)'
              artifactName: 'drop'` : ""}

  - stage: Docker
    displayName: 'Docker Build & Push'
    dependsOn: CI
    condition: and(succeeded(), ne(variables['Build.Reason'], 'PullRequest'))
    jobs:
      - job: DockerBuildPush
        steps:
          - task: Docker@2
            displayName: 'Build and push image'
            inputs:
              command: buildAndPush
              repository: '$(IMAGE_NAME)'
              dockerfile: 'Dockerfile'
              containerRegistry: '$(DOCKER_SERVICE_CONNECTION)'
              tags: |
                $(Build.BuildId)
                latest

  - stage: Deploy
    displayName: 'Deploy'
    dependsOn: Docker
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployProd
        environment: production
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo 'Add deploy step here'
                  displayName: 'Deploy'
`;
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

interface Finding {
  severity: "error" | "warn" | "info";
  message: string;
}

function analyzePipeline(content: string, platform: string): Finding[] {
  const findings: Finding[] = [];

  // Common issues across platforms
  if (!content.includes("cache") && !content.includes("Cache"))
    findings.push({ severity: "warn", message: "No dependency caching — will re-install on every run" });

  if (!content.includes("test") && !content.includes("Test"))
    findings.push({ severity: "warn", message: "No test stage found" });

  if (content.includes("latest") && !content.includes("node:latest"))
    findings.push({ severity: "warn", message: "Image tag :latest used — pin to specific version" });

  if (!content.includes("secret") && !content.includes("SECRET") && !content.includes("vars.") && !content.includes("env."))
    findings.push({ severity: "info", message: "No secrets/variables referenced — ensure credentials are not hardcoded" });

  if (platform === "github") {
    if (!content.includes("concurrency"))
      findings.push({ severity: "info", message: "No concurrency group — multiple pushes will queue instead of cancelling" });
    if (!content.includes("actions/checkout"))
      findings.push({ severity: "error", message: "Missing actions/checkout step" });
    if (content.includes("on:\n  push") && !content.includes("pull_request"))
      findings.push({ severity: "warn", message: "No pull_request trigger — PRs won't run CI" });
  }

  if (platform === "gitlab") {
    if (!content.includes("stages:"))
      findings.push({ severity: "error", message: "No stages defined" });
    if (!content.includes("artifacts:"))
      findings.push({ severity: "info", message: "No artifacts configured — build outputs won't persist between stages" });
  }

  return findings;
}

function detectPlatform(root: string): CiPlatform | null {
  const has = (f: string) => fs.existsSync(path.join(root, f));
  if (has(".github/workflows")) return "github";
  if (has(".gitlab-ci.yml")) return "gitlab";
  if (has("bitbucket-pipelines.yml")) return "bitbucket";
  if (has("azure-pipelines.yml")) return "azure";
  if (has("Jenkinsfile")) return "jenkins";
  return null;
}

// ─── Agent handler ────────────────────────────────────────────────────────────

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const projectRoot = (ctx.metadata?.projectRoot as string | undefined) ?? process.cwd();
  const writeFiles = (ctx.metadata?.write as boolean | undefined) ?? false;
  const q = ctx.query.toLowerCase();

  const action =
    (ctx.metadata?.action as string | undefined) ??
    (q.includes("analyz") || q.includes("review") || q.includes("audit") ? "analyze"
      : q.includes("all") ? "all"
      : "generate");

  const targetPlatform =
    (ctx.metadata?.platform as CiPlatform | undefined) ??
    (q.includes("gitlab") ? "gitlab"
      : q.includes("bitbucket") ? "bitbucket"
      : q.includes("azure") ? "azure"
      : q.includes("jenkins") ? "jenkins"
      : "github");

  const profile = detectProject(projectRoot);
  const serviceName = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9-]/g, "-");

  // ── Analyze ──
  if (action === "analyze") {
    const detectedPlatform = detectPlatform(projectRoot);
    if (!detectedPlatform) {
      return { success: false, message: "No CI/CD config found in project root. Run with action=generate first." };
    }

    const pipelinePaths: Record<CiPlatform, string> = {
      github: ".github/workflows",
      gitlab: ".gitlab-ci.yml",
      bitbucket: "bitbucket-pipelines.yml",
      azure: "azure-pipelines.yml",
      jenkins: "Jenkinsfile",
    };

    const pipelinePath = path.join(projectRoot, pipelinePaths[detectedPlatform]);
    const content = fs.existsSync(pipelinePath)
      ? fs.readFileSync(pipelinePath, "utf-8")
      : fs.readdirSync(pipelinePath).reduce((acc, f) => acc + fs.readFileSync(path.join(pipelinePath, f), "utf-8"), "");

    const findings = analyzePipeline(content, detectedPlatform);
    const icons = { error: "✗", warn: "⚠", info: "ℹ" } as const;
    const report = findings.length === 0
      ? "No issues found."
      : findings.map((f) => `${icons[f.severity]} [${f.severity.toUpperCase()}] ${f.message}`).join("\n");

    return {
      success: true,
      message: `Pipeline analysis (${detectedPlatform}):\n\n${report}`,
      data: { platform: detectedPlatform, findings },
    };
  }

  // ── Generate ──
  const generators: Record<CiPlatform, () => [string, string]> = {
    github: () => [".github/workflows/ci.yml", githubActions(profile, serviceName)],
    gitlab: () => [".gitlab-ci.yml", gitlabCi(profile, serviceName)],
    bitbucket: () => ["bitbucket-pipelines.yml", bitbucketPipelines(profile)],
    azure: () => ["azure-pipelines.yml", azurePipelines(profile)],
    jenkins: () => ["Jenkinsfile", jenkinsfile(profile, serviceName)],
  };

  const platforms: CiPlatform[] = action === "all"
    ? ["github", "gitlab", "bitbucket", "azure"]
    : [targetPlatform];

  const outputs: Record<string, string> = {};
  const written: string[] = [];

  for (const platform of platforms) {
    const [filePath, content] = generators[platform]();
    outputs[filePath] = content;
    if (writeFiles) {
      const fullPath = path.join(projectRoot, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");
      written.push(filePath);
    }
  }

  const filesList = Object.entries(outputs)
    .map(([name, content]) => `\n${"─".repeat(44)}\n📄 ${name}\n${"─".repeat(44)}\n${content}`)
    .join("\n");

  const writtenMsg = written.length > 0
    ? `Written to disk: ${written.join(", ")}`
    : "(pass metadata.write=true to write files to disk)";

  return {
    success: true,
    message: `Detected: ${profile.type} | tests: ${profile.hasTests} | docker: ${profile.hasDocker}\n${writtenMsg}${filesList}`,
    data: { profile, files: Object.keys(outputs), written },
  };
}

function jenkinsfile(p: ProjectProfile, serviceName: string): string {
  return `pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    DOCKER_IMAGE = "${serviceName}"
    DOCKER_TAG   = "\${env.BUILD_NUMBER}"
  }

  stages {
    stage('Install') {
      steps {
        sh '${p.type.startsWith("node") ? installCmd(p.packageManager ?? "npm") : "echo install"}'
      }
    }

    stage('Test') {
      steps {
        sh '${p.hasTests && p.testCmd ? p.testCmd : "echo no tests"}'
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: '**/test-results/**/*.xml'
        }
      }
    }

    stage('Build') {
      steps {
        sh '${p.buildCmd ?? "echo no build"}'
      }
    }

    stage('Docker') {
      when { branch 'main' }
      steps {
        withCredentials([usernamePassword(credentialsId: 'docker-hub', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
          sh 'docker login -u \$DOCKER_USER -p \$DOCKER_PASS'
          sh 'docker build -t \$DOCKER_USER/\$DOCKER_IMAGE:\$DOCKER_TAG .'
          sh 'docker push \$DOCKER_USER/\$DOCKER_IMAGE:\$DOCKER_TAG'
        }
      }
    }

    stage('Deploy') {
      when { branch 'main' }
      input { message 'Deploy to production?' }
      steps {
        sh 'echo Add deploy step here'
      }
    }
  }

  post {
    failure {
      echo 'Pipeline failed — notify team'
    }
    cleanup {
      cleanWs()
    }
  }
}
`;
}

const cicdAgent: AgentDefinition = {
  name: "cicd",
  description:
    "CI/CD pipeline expert. Generates production-ready pipelines for GitHub Actions, GitLab CI, Bitbucket Pipelines, Azure DevOps, and Jenkins. Auto-detects stack (Node/TS/Python/Java/Go), includes dependency caching, test/build/docker/deploy stages, secrets management, and concurrency controls. Audits existing pipelines for issues.",
  keywords: [
    "ci", "cd", "cicd", "pipeline", "github actions", "gitlab", "bitbucket",
    "azure devops", "jenkins", "deploy", "workflow", "automation",
    "build", "test", "release", "continuous integration", "continuous delivery",
  ],
  handler,
};

export default cicdAgent;
