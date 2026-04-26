import { Vulnerability, VulnerabilitySeverity, VulnerabilityType, SecurityAuditStats } from "../../types.js";

const SEVERITY_ORDER: Record<VulnerabilitySeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const TYPE_LABELS: Record<VulnerabilityType, string> = {
  injection: "Injection Attacks (SQL, Command, etc.)",
  xss: "Cross-Site Scripting (XSS)",
  "weak-crypto": "Weak Cryptography",
  "hardcoded-secret": "Hardcoded Secrets",
  "dependency-vulnerability": "Vulnerable Dependencies",
  "file-permission": "File Permission Issues",
  "exposed-config": "Exposed Configuration",
  "missing-security-header": "Missing Security Headers",
  other: "Other Security Issues",
};

export function generateMarkdownReport(vulnerabilities: Vulnerability[], stats: SecurityAuditStats): string {
  const sorted = [...vulnerabilities].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.file.localeCompare(b.file);
  });

  const byType = groupByType(sorted);

  let report = `# Security Audit Report

## Summary

- **Total Vulnerabilities**: ${stats.totalVulnerabilities}
- **Files Scanned**: ${stats.filesScanned}
- **Scan Duration**: ${stats.scanDurationMs}ms

### By Severity

| Severity | Count |
|----------|-------|
| CRITICAL | ${stats.bySeverity.CRITICAL || 0} |
| HIGH | ${stats.bySeverity.HIGH || 0} |
| MEDIUM | ${stats.bySeverity.MEDIUM || 0} |
| LOW | ${stats.bySeverity.LOW || 0} |
| INFO | ${stats.bySeverity.INFO || 0} |

### By Type

| Type | Count |
|------|-------|
${Object.entries(stats.byType)
  .filter(([_, count]) => count > 0)
  .map(([type, count]) => `| ${TYPE_LABELS[type as VulnerabilityType]} | ${count} |`)
  .join("\n")}

---

## Detailed Findings

`;

  for (const type of Object.keys(TYPE_LABELS) as VulnerabilityType[]) {
    if (!byType[type] || byType[type].length === 0) continue;

    const typeVulns = byType[type];
    report += `\n### ${TYPE_LABELS[type]}\n\n`;

    for (const vuln of typeVulns) {
      report += generateVulnerabilitySection(vuln);
    }
  }

  report += `\n---\n\n## Recommendations\n\n`;
  report += generateRecommendations(vulnerabilities, stats);

  return report;
}

function groupByType(vulns: Vulnerability[]): Record<VulnerabilityType, Vulnerability[]> {
  const grouped: Record<VulnerabilityType, Vulnerability[]> = {
    injection: [],
    xss: [],
    "weak-crypto": [],
    "hardcoded-secret": [],
    "dependency-vulnerability": [],
    "file-permission": [],
    "exposed-config": [],
    "missing-security-header": [],
    other: [],
  };

  for (const vuln of vulns) {
    grouped[vuln.type].push(vuln);
  }

  return grouped;
}

function generateVulnerabilitySection(vuln: Vulnerability): string {
  let section = `#### ⚠️ ${vuln.title} \`${vuln.severity}\`\n\n`;

  section += `**File**: ${vuln.file}`;
  if (vuln.line) section += `:${vuln.line}`;
  section += `\n\n`;

  section += `**Description**: ${vuln.description}\n\n`;

  if (vuln.code) {
    section += `**Code**:\n\`\`\`\n${vuln.code}\n\`\`\`\n\n`;
  }

  section += `**Suggested Fix**: ${vuln.suggestedFix}\n`;

  if (vuln.cveId) {
    section += `\n**CVE**: ${vuln.cveId}`;
  }

  if (vuln.references && vuln.references.length > 0) {
    section += `\n**References**: `;
    section += vuln.references.map((r) => `[Link](${r})`).join(", ");
  }

  section += `\n\n`;

  return section;
}

function generateRecommendations(vulns: Vulnerability[], stats: SecurityAuditStats): string {
  let recs = "";

  // Priority recommendations
  const criticalCount = stats.bySeverity.CRITICAL || 0;
  const highCount = stats.bySeverity.HIGH || 0;

  if (criticalCount > 0) {
    recs += `🔴 **CRITICAL**: Fix ${criticalCount} critical vulnerabilities immediately before deployment.\n\n`;
  }

  if (highCount > 0) {
    recs += `🟠 **HIGH**: Address ${highCount} high-severity issues as soon as possible.\n\n`;
  }

  // By category recommendations
  const secretVulns = vulns.filter((v) => v.type === "hardcoded-secret");
  if (secretVulns.length > 0) {
    recs += `### Hardcoded Secrets\n\n`;
    recs += `Found ${secretVulns.length} hardcoded secrets. Immediate actions:\n`;
    recs += `1. Remove all secrets from code\n`;
    recs += `2. Force-push to remove from git history: \`git filter-repo --path secrets.json --invert-paths\`\n`;
    recs += `3. Rotate all exposed credentials immediately\n`;
    recs += `4. Use environment variables or secret management service\n\n`;
  }

  const depVulns = vulns.filter((v) => v.type === "dependency-vulnerability");
  if (depVulns.length > 0) {
    recs += `### Vulnerable Dependencies\n\n`;
    recs += `Found ${depVulns.length} vulnerable package(s):\n`;
    recs += `- Run \`npm audit fix\` or equivalent for your package manager\n`;
    recs += `- Review and test updates carefully\n`;
    recs += `- Consider using dependabot or similar automated tools\n\n`;
  }

  const injectionVulns = vulns.filter((v) => v.type === "injection");
  if (injectionVulns.length > 0) {
    recs += `### Injection Vulnerabilities\n\n`;
    recs += `Found ${injectionVulns.length} potential injection issues:\n`;
    recs += `- Use parameterized queries for all database operations\n`;
    recs += `- Validate and sanitize all user input\n`;
    recs += `- Use ORM/query builders instead of string concatenation\n\n`;
  }

  const xssVulns = vulns.filter((v) => v.type === "xss");
  if (xssVulns.length > 0) {
    recs += `### XSS Prevention\n\n`;
    recs += `Found ${xssVulns.length} potential XSS vulnerabilities:\n`;
    recs += `- Use textContent instead of innerHTML\n`;
    recs += `- Sanitize user input with libraries like DOMPurify\n`;
    recs += `- Enable Content Security Policy headers\n\n`;
  }

  const cryptoVulns = vulns.filter((v) => v.type === "weak-crypto");
  if (cryptoVulns.length > 0) {
    recs += `### Cryptography\n\n`;
    recs += `Found ${cryptoVulns.length} weak cryptography issues:\n`;
    recs += `- Use bcrypt/scrypt for password hashing\n`;
    recs += `- Use SHA-256+ for non-password hashing\n`;
    recs += `- Store keys in environment variables or vaults\n\n`;
  }

  const configVulns = vulns.filter((v) => v.type === "exposed-config" || v.type === "file-permission");
  if (configVulns.length > 0) {
    recs += `### Configuration & Permissions\n\n`;
    recs += `Found ${configVulns.length} configuration issues:\n`;
    recs += `- Add sensitive files to .gitignore\n`;
    recs += `- Use proper file permissions (644 for files, 755 for dirs)\n`;
    recs += `- Remove sensitive files from git history if already committed\n\n`;
  }

  // General best practices
  recs += `## General Security Best Practices\n\n`;
  recs += `1. **Regular Audits**: Run security audits regularly (weekly/monthly)\n`;
  recs += `2. **Dependencies**: Keep dependencies updated, use automated tools like Dependabot\n`;
  recs += `3. **Code Review**: Require security-focused code reviews\n`;
  recs += `4. **SAST Tools**: Integrate static analysis tools into CI/CD pipeline\n`;
  recs += `5. **Secret Management**: Use dedicated secret management services\n`;
  recs += `6. **Testing**: Add security-focused unit and integration tests\n`;
  recs += `7. **Documentation**: Document security policies and procedures\n`;

  return recs;
}
