import fs from "fs";
import path from "path";
import { Vulnerability } from "../../types.js";

const SENSITIVE_FILES = [
  { name: ".env", risk: "CRITICAL" as const },
  { name: ".env.local", risk: "CRITICAL" as const },
  { name: ".env.production", risk: "CRITICAL" as const },
  { name: ".aws/credentials", risk: "CRITICAL" as const },
  { name: ".ssh/id_rsa", risk: "CRITICAL" as const },
  { name: ".ssh/id_ed25519", risk: "CRITICAL" as const },
  { name: "id_rsa", risk: "CRITICAL" as const },
  { name: "private_key.pem", risk: "CRITICAL" as const },
  { name: ".git/config", risk: "HIGH" as const },
  { name: ".gitignore", risk: "MEDIUM" as const },
  { name: "secrets.json", risk: "CRITICAL" as const },
  { name: "config/secrets.yml", risk: "CRITICAL" as const },
  { name: ".aws/config", risk: "HIGH" as const },
];

const PROBLEMATIC_PERMISSIONS = [
  { pattern: /chmod\s+777/i, severity: "HIGH" as const, title: "World-writable chmod (777)" },
  { pattern: /chmod\s+666/i, severity: "HIGH" as const, title: "World-writable chmod (666)" },
  { pattern: /chmod\s+[0-7]*7$/i, severity: "MEDIUM" as const, title: "World-executable file" },
];

const CORS_PATTERNS = [
  { pattern: /Access-Control-Allow-Origin[\s:]*\*/i, severity: "HIGH" as const, title: "CORS allows any origin (*)" },
  { pattern: /cors\s*:\s*true|cors\s*:\s*\{.*\*.*\}/i, severity: "HIGH" as const, title: "CORS misconfigured" },
];

const MISSING_SECURITY_HEADERS = [
  { header: "Content-Security-Policy", severity: "MEDIUM" as const },
  { header: "X-Frame-Options", severity: "MEDIUM" as const },
  { header: "X-Content-Type-Options", severity: "LOW" as const },
  { header: "Strict-Transport-Security", severity: "HIGH" as const },
];

export async function auditConfiguration(root: string): Promise<Vulnerability[]> {
  const vulnerabilities: Vulnerability[] = [];

  // Check for exposed sensitive files
  vulnerabilities.push(...checkSensitiveFiles(root));

  // Check for problematic file permissions
  vulnerabilities.push(...checkFilePermissions(root));

  // Check for CORS issues
  vulnerabilities.push(...checkCorsConfig(root));

  // Check for missing security headers
  vulnerabilities.push(...checkSecurityHeaders(root));

  // Check for exposed version files
  vulnerabilities.push(...checkExposedVersions(root));

  // Check .gitignore
  vulnerabilities.push(...checkGitignore(root));

  return vulnerabilities;
}

function checkSensitiveFiles(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];

  for (const sensitiveFile of SENSITIVE_FILES) {
    const fullPath = path.join(root, sensitiveFile.name);
    if (fs.existsSync(fullPath)) {
      vulns.push({
        id: `config-exposed-${sensitiveFile.name}`,
        type: "exposed-config",
        severity: sensitiveFile.risk,
        title: `Exposed sensitive file: ${sensitiveFile.name}`,
        description: `The file ${sensitiveFile.name} contains sensitive data and should not be in the repository.`,
        file: sensitiveFile.name,
        suggestedFix: `Add ${sensitiveFile.name} to .gitignore and remove from git history: git rm --cached ${sensitiveFile.name}`,
      });
    }
  }

  return vulns;
}

function checkFilePermissions(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];

  try {
    walkForPermissions(root, (filePath, relativePath) => {
      try {
        const content = fs.readFileSync(filePath, "utf-8");

        for (const pattern of PROBLEMATIC_PERMISSIONS) {
          if (pattern.pattern.test(content)) {
            vulns.push({
              id: `perms-${relativePath}`,
              type: "file-permission",
              severity: pattern.severity,
              title: pattern.title,
              description: `Found in ${relativePath}`,
              file: relativePath,
              suggestedFix: "Use secure permissions: 755 for executables, 644 for files, 700 for private directories",
            });
          }
        }
      } catch (err) {
        // Ignore read errors
      }
    });
  } catch (err) {
    // Ignore
  }

  return vulns;
}

function checkCorsConfig(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const corsFiles = ["cors.config.js", "server.js", "app.ts", "main.ts", "index.ts", "server.ts", ".htaccess"];

  for (const fname of corsFiles) {
    const fullPath = path.join(root, fname);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const content = fs.readFileSync(fullPath, "utf-8");

      for (const pattern of CORS_PATTERNS) {
        if (pattern.pattern.test(content)) {
          const lineNum = content.substring(0, content.search(pattern.pattern)).split("\n").length;
          vulns.push({
            id: `cors-${fname}`,
            type: "missing-security-header",
            severity: pattern.severity,
            title: pattern.title,
            description: `Found in ${fname}`,
            file: fname,
            line: lineNum,
            suggestedFix: 'Restrict CORS to specific origins: { origin: "https://trusted-domain.com" }',
          });
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  return vulns;
}

function checkSecurityHeaders(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const configFiles = ["nginx.conf", ".htaccess", "server.js", "app.ts", "app.py"];

  for (const fname of configFiles) {
    const fullPath = path.join(root, fname);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const content = fs.readFileSync(fullPath, "utf-8");

      for (const header of MISSING_SECURITY_HEADERS) {
        if (!content.toLowerCase().includes(header.header.toLowerCase())) {
          vulns.push({
            id: `header-${fname}-${header.header}`,
            type: "missing-security-header",
            severity: header.severity,
            title: `Missing security header: ${header.header}`,
            description: `The ${header.header} header is not configured in ${fname}`,
            file: fname,
            suggestedFix: `Add header: ${header.header}: <value>. Example for CSP: "default-src 'self'; script-src 'self' 'unsafe-inline'"`,
          });
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  return vulns;
}

function checkExposedVersions(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const versionFiles = [
    { name: "VERSION", pattern: /\d+\.\d+\.\d+/ },
    { name: "version.txt", pattern: /\d+\.\d+\.\d+/ },
    { name: "package.json", pattern: /"version"\s*:\s*"(\d+\.\d+\.\d+)"/ },
  ];

  for (const vf of versionFiles) {
    const fullPath = path.join(root, vf.name);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const match = vf.pattern.exec(content);
      if (match && vf.name !== "package.json") {
        // package.json is OK to be public
        vulns.push({
          id: `version-exposed-${vf.name}`,
          type: "exposed-config",
          severity: "LOW",
          title: `Exposed version information: ${vf.name}`,
          description: `Version ${match[0]} is publicly exposed`,
          file: vf.name,
          suggestedFix: "Move version info to internal config or remove public version disclosure",
        });
      }
    } catch (err) {
      // Ignore
    }
  }

  return vulns;
}

function checkGitignore(root: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const gitignorePath = path.join(root, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    return [
      {
        id: "gitignore-missing",
        type: "exposed-config",
        severity: "MEDIUM",
        title: "Missing .gitignore file",
        description: "No .gitignore file found - sensitive files may be committed",
        file: ".gitignore",
        suggestedFix: "Create .gitignore with at least: *.env, .env*, secrets.json, *.pem, .aws/, .ssh/",
      },
    ];
  }

  try {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    const importantPatterns = [".env", "node_modules", ".aws", ".ssh", "*.pem", "private_key", "secrets"];

    for (const pattern of importantPatterns) {
      if (!content.includes(pattern)) {
        vulns.push({
          id: `gitignore-missing-${pattern}`,
          type: "exposed-config",
          severity: "MEDIUM",
          title: `Missing ${pattern} in .gitignore`,
          description: `Pattern "${pattern}" is not in .gitignore - files matching this may be accidentally committed`,
          file: ".gitignore",
          suggestedFix: `Add line to .gitignore: ${pattern}`,
        });
      }
    }
  } catch (err) {
    // Ignore
  }

  return vulns;
}

function walkForPermissions(dir: string, cb: (fullPath: string, relativePath: string, depth: number) => void, depth = 0): void {
  if (depth > 8) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (["node_modules", "dist", ".git", "venv"].includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (entry.isDirectory()) {
        walkForPermissions(fullPath, cb, depth + 1);
      } else {
        cb(fullPath, relativePath, depth);
      }
    }
  } catch (err) {
    // Ignore permission errors
  }
}
