import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Vulnerability } from "../../types.js";

export async function auditDependencies(root: string): Promise<Vulnerability[]> {
  const vulnerabilities: Vulnerability[] = [];

  // Check npm
  const npmAudits = auditNpm(root);
  vulnerabilities.push(...npmAudits);

  // Check Python
  const pyAudits = auditPython(root);
  vulnerabilities.push(...pyAudits);

  // Check Maven
  const mvnAudits = auditMaven(root);
  vulnerabilities.push(...mvnAudits);

  // Check Go
  const goAudits = auditGo(root);
  vulnerabilities.push(...goAudits);

  return vulnerabilities;
}

function auditNpm(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const packageLock = path.join(root, "package-lock.json");
  const packageJson = path.join(root, "package.json");

  if (!fs.existsSync(packageJson)) return vulns;

  try {
    const output = execSync("npm audit --json 2>&1", { cwd: root, encoding: "utf-8", timeout: 30000 });
    const audit = JSON.parse(output);

    if (audit.vulnerabilities) {
      for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities)) {
        const v = vuln as Record<string, unknown>;
        if (Array.isArray(v.via)) {
          for (const issue of v.via as Record<string, unknown>[]) {
            const severity = (issue.severity as string).toUpperCase() as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
            vulns.push({
              id: `npm-${pkgName}-${issue.cve || issue.id}`,
              type: "dependency-vulnerability",
              severity,
              title: `NPM: ${issue.title || pkgName}`,
              description: issue.description as string || `Vulnerability in ${pkgName}`,
              file: "package.json",
              cveId: issue.cve as string | undefined,
              suggestedFix: `Update ${pkgName} to version ${issue.patched || "latest"}`,
              references: issue.url ? [issue.url as string] : undefined,
            });
          }
        }
      }
    }
  } catch (err) {
    // npm audit may fail if npm not installed or other reasons
  }

  return vulns;
}

function auditPython(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const reqsFiles = ["requirements.txt", "pyproject.toml", "Pipfile"];

  for (const fname of reqsFiles) {
    if (!fs.existsSync(path.join(root, fname))) continue;

    try {
      // Try using safety if available
      const output = execSync("pip-audit --json 2>&1", { cwd: root, encoding: "utf-8", timeout: 30000 });
      const audit = JSON.parse(output);

      if (Array.isArray(audit.vulnerabilities)) {
        for (const vuln of audit.vulnerabilities) {
          const v = vuln as Record<string, unknown>;
          vulns.push({
            id: `py-${v.package_name}-${v.vulnerability_id}`,
            type: "dependency-vulnerability",
            severity: "HIGH",
            title: `Python: ${v.package_name}`,
            description: (v.description as string) || `Vulnerability in ${v.package_name}`,
            file: fname,
            cveId: v.cve as string | undefined,
            suggestedFix: `Update ${v.package_name} to a patched version`,
          });
        }
      }
    } catch (err) {
      // pip-audit may not be installed
    }
  }

  return vulns;
}

function auditMaven(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const pomFile = path.join(root, "pom.xml");

  if (!fs.existsSync(pomFile)) return vulns;

  try {
    const output = execSync("mvn dependency-check:check -q 2>&1", { cwd: root, encoding: "utf-8", timeout: 60000 });
    
    // Parse Maven output for vulnerabilities (simplified parsing)
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes("CRITICAL") || line.includes("HIGH") || line.includes("MEDIUM")) {
        const match = line.match(/\[(\w+)\].*?([A-Za-z0-9-]+).*?CVE-\d{4}-\d+/);
        if (match) {
          vulns.push({
            id: `mvn-${match[2]}`,
            type: "dependency-vulnerability",
            severity: (match[1].toUpperCase() as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"),
            title: `Maven: ${match[2]}`,
            description: line.trim(),
            file: "pom.xml",
            suggestedFix: "Check Maven dependency-check report for patched versions",
          });
        }
      }
    }
  } catch (err) {
    // mvn may not be installed
  }

  return vulns;
}

function auditGo(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const goMod = path.join(root, "go.mod");

  if (!fs.existsSync(goMod)) return vulns;

  try {
    const output = execSync("go list -json -m all 2>&1 | govulncheck ./... 2>&1", { cwd: root, encoding: "utf-8", timeout: 30000 });

    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes("Vulnerability") || line.includes("CVE")) {
        const match = line.match(/([A-Za-z0-9\-_.]+).*?(CVE-\d{4}-\d+)/);
        if (match) {
          vulns.push({
            id: `go-${match[1]}-${match[2]}`,
            type: "dependency-vulnerability",
            severity: "HIGH",
            title: `Go: ${match[1]}`,
            description: line.trim(),
            file: "go.mod",
            cveId: match[2],
            suggestedFix: "Run 'go get -u' to update vulnerable dependencies",
          });
        }
      }
    }
  } catch (err) {
    // go may not be installed or govulncheck not available
  }

  return vulns;
}
