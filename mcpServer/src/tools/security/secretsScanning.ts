import fs from "fs";
import path from "path";
import { Vulnerability } from "../../types.js";

const SECRET_PATTERNS: Array<{
  title: string;
  pattern: RegExp;
  description: string;
  fix: string;
}> = [
  {
    title: "AWS Access Key ID",
    pattern: /(?:aws_access_key_id|AKIA[0-9A-Z]{16})/i,
    description: "Potential AWS access key exposed",
    fix: "Remove and rotate the key immediately. Use AWS IAM roles or temporary credentials instead.",
  },
  {
    title: "AWS Secret Access Key",
    pattern: /(?:aws_secret_access_key|aws_secret_key)\s*[:=]\s*['"][^'"]{40}['"]/i,
    description: "Potential AWS secret key exposed",
    fix: "Remove and rotate the key. Store in AWS Secrets Manager or environment variables.",
  },
  {
    title: "GitHub Token",
    pattern: /gh[pousr]{1,2}_[A-Za-z0-9_]{36,255}|github[_-]?token\s*[:=]\s*['"][a-zA-Z0-9_]{40,}['"]/i,
    description: "Potential GitHub token or personal access token exposed",
    fix: "Revoke the token immediately from GitHub settings and regenerate.",
  },
  {
    title: "Database Connection String",
    pattern: /(?:mongodb|postgres|mysql|mariadb):\/\/[^@\s]+@[^@\s]+|database_url\s*[:=]\s*['"][^'"]{20,}['"]/i,
    description: "Potential database connection string with credentials exposed",
    fix: "Move connection strings to environment variables. Use connection pooling services.",
  },
  {
    title: "API Key",
    pattern: /(?:api[_-]?key|apikey|api_secret|secret_key)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]|x-api-key:\s*['"][^'"]+['"]/i,
    description: "Potential API key exposed",
    fix: "Rotate the API key and store in environment variables or secure vault.",
  },
  {
    title: "JWT Token",
    pattern: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.?[A-Za-z0-9_\-]*|(?:jwt|token|bearer)\s*[:=]\s*['"]eyJ[^'"]+['"]/i,
    description: "Potential JWT token exposed",
    fix: "Rotate the token and use short-lived tokens with proper expiration.",
  },
  {
    title: "Private Key",
    pattern: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY|PRIVATE KEY-----/i,
    description: "Private encryption key potentially exposed",
    fix: "Immediately rotate the key pair and add to .gitignore",
  },
  {
    title: "OAuth Token",
    pattern: /(?:oauth|refresh_token|access_token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]|Bearer\s+[a-zA-Z0-9_\-\.]{50,}/i,
    description: "Potential OAuth token exposed",
    fix: "Revoke the token from the OAuth provider and issue new credentials.",
  },
  {
    title: "SendGrid API Key",
    pattern: /SG\.[a-zA-Z0-9_\-]{20,}/,
    description: "Potential SendGrid API key exposed",
    fix: "Regenerate the key in SendGrid dashboard.",
  },
  {
    title: "Slack Token",
    pattern: /xox[baprs]-[0-9a-zA-Z]+-[0-9a-zA-Z]+-[0-9a-zA-Z]+|slack.*?token\s*[:=]\s*['"][^'"]{30,}['"]/i,
    description: "Potential Slack token exposed",
    fix: "Rotate the token in Slack workspace settings.",
  },
  {
    title: "Hardcoded Password",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"{}\n]{6,}['"]|"password"\s*:\s*"[^"]{6,}"/i,
    description: "Hardcoded password detected",
    fix: "Use environment variables, encrypted config files, or password managers.",
  },
];

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  "venv",
  ".venv",
  ".gradle",
  "target",
]);

const SCANNED_EXTENSIONS = [
  ".ts",
  ".js",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".go",
  ".env",
  ".env.example",
  ".conf",
  ".config",
  ".yaml",
  ".yml",
  ".json",
  ".properties",
  ".sh",
  ".bash",
];

function shouldScanFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  const fileName = path.basename(filePath);
  return (SCANNED_EXTENSIONS.includes(ext) || SCANNED_EXTENSIONS.includes(fileName)) && !fileName.startsWith(".");
}

function shouldScanDir(dirName: string): boolean {
  return !EXCLUDED_DIRS.has(dirName) && !dirName.startsWith(".");
}

function walkDir(dir: string, maxDepth: number = 10): string[] {
  if (maxDepth <= 0) return [];

  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!shouldScanDir(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, maxDepth - 1));
      } else if (shouldScanFile(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Ignore permission errors
  }
  return files;
}

function getLineNumber(content: string, matchIndex: number): number {
  return content.substring(0, matchIndex).split("\n").length;
}

function getCodeContext(content: string, line: number): string {
  const lines = content.split("\n");
  const ctx = lines[line - 1] || "";
  return ctx.substring(0, 80).trim();
}

export async function scanForSecrets(root: string): Promise<Vulnerability[]> {
  const vulnerabilities: Vulnerability[] = [];
  const files = walkDir(root);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(root, file);

      for (const patternDef of SECRET_PATTERNS) {
        let match;
        const regex = new RegExp(patternDef.pattern.source, "gm");

        while ((match = regex.exec(content)) !== null) {
          const lineNum = getLineNumber(content, match.index);
          const code = getCodeContext(content, lineNum);

          // Avoid false positives on placeholder/example values
          if (code.includes("EXAMPLE") || code.includes("example") || code.includes("sample")) {
            continue;
          }

          vulnerabilities.push({
            id: `secret-${file}-${lineNum}`,
            type: "hardcoded-secret",
            severity: "CRITICAL",
            title: patternDef.title,
            description: patternDef.description,
            file: relativePath,
            line: lineNum,
            code: code,
            suggestedFix: patternDef.fix,
          });
        }
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  return vulnerabilities;
}
