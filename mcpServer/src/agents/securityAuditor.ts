import fs from "fs";
import path from "path";
import { AgentContext, AgentDefinition, AgentResult, SecurityAuditResult } from "../types.js";
import { scanForVulnerabilities } from "../tools/security/staticAnalysis.js";
import { auditDependencies } from "../tools/security/dependencyAudit.js";
import { scanForSecrets } from "../tools/security/secretsScanning.js";
import { auditConfiguration } from "../tools/security/configAudit.js";
import { generateMarkdownReport } from "../tools/security/reportGenerator.js";

type ProjectType = "node-ts" | "node-js" | "python" | "java-maven" | "java-gradle" | "go" | "unknown";

interface ProjectProfile {
  type: ProjectType;
}

function detectProject(root: string): ProjectProfile {
  const has = (f: string) => fs.existsSync(path.join(root, f));

  if (has("package.json")) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
    const isTs = has("tsconfig.json") || !!pkg.devDependencies?.typescript;
    return { type: isTs ? "node-ts" : "node-js" };
  }

  if (has("requirements.txt") || has("pyproject.toml") || has("setup.py")) {
    return { type: "python" };
  }

  if (has("pom.xml")) {
    return { type: "java-maven" };
  }

  if (has("build.gradle") || has("build.gradle.kts")) {
    return { type: "java-gradle" };
  }

  if (has("go.mod")) {
    return { type: "go" };
  }

  return { type: "unknown" };
}

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const projectRoot = resolveProjectRoot(ctx.metadata?.projectRoot as string | undefined);
  const profile = detectProject(projectRoot);
  const startTime = Date.now();

  const allVulnerabilities: Array<any> = [];
  let filesScanned = 0;
  let dependenciesChecked = 0;

  // Run all scans
  const staticVulns = await scanForVulnerabilities(projectRoot);
  allVulnerabilities.push(...staticVulns);
  filesScanned += estimateFilesScanned(projectRoot);

  const secretVulns = await scanForSecrets(projectRoot);
  allVulnerabilities.push(...secretVulns);

  const configVulns = await auditConfiguration(projectRoot);
  allVulnerabilities.push(...configVulns);

  const depVulns = await auditDependencies(projectRoot);
  allVulnerabilities.push(...depVulns);
  dependenciesChecked += depVulns.length > 0 ? estimateDependencies(projectRoot) : 0;

  const scanDurationMs = Date.now() - startTime;

  // Build stats
  const stats = {
    filesScanned,
    dependenciesChecked,
    totalVulnerabilities: allVulnerabilities.length,
    bySeverity: {
      CRITICAL: allVulnerabilities.filter((v) => v.severity === "CRITICAL").length,
      HIGH: allVulnerabilities.filter((v) => v.severity === "HIGH").length,
      MEDIUM: allVulnerabilities.filter((v) => v.severity === "MEDIUM").length,
      LOW: allVulnerabilities.filter((v) => v.severity === "LOW").length,
      INFO: allVulnerabilities.filter((v) => v.severity === "INFO").length,
    },
    byType: {
      injection: allVulnerabilities.filter((v) => v.type === "injection").length,
      xss: allVulnerabilities.filter((v) => v.type === "xss").length,
      "weak-crypto": allVulnerabilities.filter((v) => v.type === "weak-crypto").length,
      "hardcoded-secret": allVulnerabilities.filter((v) => v.type === "hardcoded-secret").length,
      "dependency-vulnerability": allVulnerabilities.filter((v) => v.type === "dependency-vulnerability").length,
      "file-permission": allVulnerabilities.filter((v) => v.type === "file-permission").length,
      "exposed-config": allVulnerabilities.filter((v) => v.type === "exposed-config").length,
      "missing-security-header": allVulnerabilities.filter((v) => v.type === "missing-security-header").length,
      other: allVulnerabilities.filter((v) => v.type === "other").length,
    },
    scanDurationMs,
  };

  const report = generateMarkdownReport(allVulnerabilities, stats);

  const result: SecurityAuditResult = {
    projectType: profile.type,
    vulnerabilities: allVulnerabilities,
    stats,
    recommendations: extractTopRecommendations(allVulnerabilities),
  };

  return {
    success: true,
    message: report,
    data: {
      auditResult: result,
      vulnerabilityCount: allVulnerabilities.length,
      projectType: profile.type,
      stats,
    },
  };
}

function resolveProjectRoot(explicit?: string): string {
  if (explicit && fs.existsSync(explicit)) {
    return path.resolve(explicit);
  }
  return process.cwd();
}

function estimateFilesScanned(root: string): number {
  // Simple estimate: count source files
  let count = 0;
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs"];

  function walk(dir: string, depth = 0): void {
    if (depth > 8) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || ["node_modules", "dist", "build", "venv"].includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (extensions.includes(path.extname(entry.name))) {
          count++;
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  walk(root);
  return count;
}

function estimateDependencies(root: string): number {
  let count = 0;

  // Count npm packages
  const packageJson = path.join(root, "package.json");
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8"));
      count += Object.keys(pkg.dependencies || {}).length;
      count += Object.keys(pkg.devDependencies || {}).length;
    } catch (err) {
      // Ignore
    }
  }

  // Count pip packages
  const requirementsTxt = path.join(root, "requirements.txt");
  if (fs.existsSync(requirementsTxt)) {
    try {
      const content = fs.readFileSync(requirementsTxt, "utf-8");
      count += content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length;
    } catch (err) {
      // Ignore
    }
  }

  return count || 1;
}

function extractTopRecommendations(vulnerabilities: any[]): string[] {
  const recs: Set<string> = new Set();

  const criticalCount = vulnerabilities.filter((v) => v.severity === "CRITICAL").length;
  if (criticalCount > 0) {
    recs.add(`Fix ${criticalCount} critical vulnerabilities immediately`);
  }

  const secretCount = vulnerabilities.filter((v) => v.type === "hardcoded-secret").length;
  if (secretCount > 0) {
    recs.add(`Remove ${secretCount} hardcoded secrets and rotate credentials`);
  }

  const depCount = vulnerabilities.filter((v) => v.type === "dependency-vulnerability").length;
  if (depCount > 0) {
    recs.add(`Update ${depCount} vulnerable dependencies`);
  }

  const injectionCount = vulnerabilities.filter((v) => v.type === "injection").length;
  if (injectionCount > 0) {
    recs.add(`Use parameterized queries for ${injectionCount} potential injection points`);
  }

  return Array.from(recs).slice(0, 5);
}

const definition: AgentDefinition = {
  name: "securityAuditor",
  description:
    "Security auditor agent. Performs comprehensive security scans including SAST (static code analysis), dependency vulnerability checks, hardcoded secrets detection, and configuration audits across all languages. Reports vulnerabilities with severity levels and suggested fixes.",
  keywords: [
    "security",
    "audit",
    "vulnerability",
    "scan",
    "sast",
    "secrets",
    "dependencies",
    "cve",
    "exploit",
    "injection",
    "xss",
    "crypto",
    "penetration",
    "compliance",
    "security-review",
    "code-scan",
  ],
  handler,
};

export default definition;
