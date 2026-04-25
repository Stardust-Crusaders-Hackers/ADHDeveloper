import fs from "fs";
import path from "path";
import { Vulnerability, VulnerabilityType } from "../../types.js";

const DANGEROUS_PATTERNS: Array<{
  type: VulnerabilityType;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  pattern: RegExp;
  description: (match: string) => string;
  fix: string;
}> = [
  {
    type: "injection",
    severity: "CRITICAL",
    title: "SQL Injection Risk",
    pattern: /(?:query|execute|sql|db\.run|query_builder|raw_sql)\s*\(\s*["`']?\s*\$\{|(?:SELECT|INSERT|UPDATE|DELETE).*\$\{|\+ *['"`]/i,
    description: (m) => `Potential SQL injection via string concatenation: "${m.substring(0, 50)}"`,
    fix: "Use parameterized queries or prepared statements instead of string concatenation. Example: db.query('SELECT * FROM users WHERE id = ?', [userId])",
  },
  {
    type: "injection",
    severity: "CRITICAL",
    title: "Command Injection Risk",
    pattern: /(?:exec|spawn|execSync|system|Runtime\.getRuntime|ProcessBuilder)\s*\(\s*["`'].*\$\{|child_process\.exec\s*\(\s*`|os\.system\s*\(|shell\s*=\s*True|shell\s*=\s*true/i,
    description: (m) => `Potential command injection: "${m.substring(0, 50)}"`,
    fix: "Use array-based execution with explicit arguments instead of shell interpolation. Example: execFile('command', [arg1, arg2])",
  },
  {
    type: "xss",
    severity: "HIGH",
    title: "DOM-based XSS Risk",
    pattern: /innerHTML\s*=|\.html\s*\(|dangerouslySetInnerHTML|eval\s*\(|Function\s*\(|render_to_string\s*\(.*unescape/i,
    description: (m) => `Potential XSS vulnerability via DOM manipulation: "${m.substring(0, 50)}"`,
    fix: "Use textContent instead of innerHTML, or sanitize with a library like DOMPurify. Avoid dangerouslySetInnerHTML if possible.",
  },
  {
    type: "weak-crypto",
    severity: "HIGH",
    title: "Weak Hashing Algorithm",
    pattern: /md5|sha1|CryptographyContext\.sha1|hashlib\.md5|hashlib\.sha1|MessageDigest\.getInstance\s*\(\s*['"](?:MD5|SHA-1)['"]|new MD5|password_hash.*md5|hash\s*\(\s*['"]md5/i,
    description: (m) => `Weak hashing algorithm detected: "${m.substring(0, 50)}"`,
    fix: "Use strong hashing algorithms: bcrypt, scrypt, or PBKDF2 for passwords. Use SHA-256+ for other purposes.",
  },
  {
    type: "weak-crypto",
    severity: "HIGH",
    title: "Hardcoded Encryption Key",
    pattern: /(?:key|KEY|secret|SECRET|password|PASSWORD)\s*[:=]\s*['"][^'"]{8,}['"]|CipherText\s*=\s*["`][^`]+["`]|AES\.encrypt\s*\(\s*text\s*,\s*['"][^'"]+['"]/i,
    description: (m) => `Potential hardcoded encryption key or secret: "${m.substring(0, 50)}"`,
    fix: "Move secrets to environment variables or a secure vault. Use process.env.KEY or similar.",
  },
  {
    type: "other",
    severity: "MEDIUM",
    title: "Use of Eval",
    pattern: /\beval\s*\(|Function\s*\(\s*.*\)|exec\s*\(\s*code|assert\s*\(\s*code|setTimeout\s*\(\s*string|setInterval\s*\(\s*string/i,
    description: (m) => `Use of eval() or equivalent is dangerous: "${m.substring(0, 50)}"`,
    fix: "Avoid eval entirely. Use JSON.parse for data parsing or consider a safer DSL for dynamic code.",
  },
  {
    type: "other",
    severity: "MEDIUM",
    title: "Insecure Random",
    pattern: /Math\.random\(\)|Random\s*\(\)|rand\(\)|uuid\.v4\(\)|crypto\.randomBytes\s*\(\s*0\)|os\.urandom\s*\(\s*0\)/i,
    description: (m) => `Insecure randomness for security-sensitive context: "${m.substring(0, 50)}"`,
    fix: "Use crypto.randomBytes() in Node.js or secrets.token_hex() in Python for security-sensitive contexts.",
  },
];

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "venv",
  ".venv",
  "__pycache__",
  "vendor",
  ".next",
  ".nuxt",
  ".gradle",
  ".m2",
  "target",
  "out",
  "bin",
  "obj",
]);

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cpp", ".c", ".php", ".rb", ".cs"];

function shouldScanFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  const fileName = path.basename(filePath);
  return SCANNED_EXTENSIONS.includes(ext) && !fileName.startsWith(".");
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
    // Ignore permission errors, continue
  }
  return files;
}

function getLineNumber(content: string, matchIndex: number): number {
  return content.substring(0, matchIndex).split("\n").length;
}

function getCodeContext(content: string, line: number): string {
  const lines = content.split("\n");
  return lines[line - 1] || "";
}

export async function scanForVulnerabilities(root: string): Promise<Vulnerability[]> {
  const vulnerabilities: Vulnerability[] = [];
  const files = walkDir(root);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(root, file);

      for (const patternDef of DANGEROUS_PATTERNS) {
        let match;
        const regex = new RegExp(patternDef.pattern.source, "gm");

        while ((match = regex.exec(content)) !== null) {
          const lineNum = getLineNumber(content, match.index);
          const code = getCodeContext(content, lineNum).trim();

          vulnerabilities.push({
            id: `vuln-${file}-${lineNum}-${patternDef.type}`,
            type: patternDef.type,
            severity: patternDef.severity,
            title: patternDef.title,
            description: patternDef.description(match[0]),
            file: relativePath,
            line: lineNum,
            code: code.substring(0, 100),
            suggestedFix: patternDef.fix,
          });
        }
      }
    } catch (err) {
      // Ignore read errors, continue scanning
    }
  }

  return vulnerabilities;
}
