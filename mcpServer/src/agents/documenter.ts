import fs from "fs";
import path from "path";
import { AgentDefinition, AgentContext, AgentResult, FilePatch } from "../types.js";
import { buildPatch } from "../tools/patchUtils.js";

// ─── Code analysis ────────────────────────────────────────────────────────────

interface CodeSymbol {
  kind: "function" | "class" | "interface" | "type" | "const" | "enum";
  name: string;
  signature: string;
  line: number;
  hasDoc: boolean;
}

const SYMBOL_RE =
  /^(?:export\s+)?(?:(async\s+)?function\s+(\w+)|class\s+(\w+)|interface\s+(\w+)|type\s+(\w+)\s*=|const\s+(\w+)\s*[:=]|enum\s+(\w+))/;

function extractSymbols(source: string): CodeSymbol[] {
  const lines = source.split("\n");
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("export")) continue;

    const prevLine = lines[i - 1]?.trim() ?? "";
    const hasDoc = prevLine.endsWith("*/") || prevLine.startsWith("*") || prevLine.startsWith("/**");

    const m = SYMBOL_RE.exec(line);
    if (!m) continue;

    const name = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7];
    if (!name) continue;

    let kind: CodeSymbol["kind"] = "const";
    if (m[2] !== undefined || (m[1] !== undefined)) kind = "function";
    else if (line.includes("function")) kind = "function";
    else if (line.includes("class")) kind = "class";
    else if (line.includes("interface")) kind = "interface";
    else if (line.includes("type ") && line.includes("=")) kind = "type";
    else if (line.includes("enum")) kind = "enum";

    symbols.push({ kind, name, signature: line.slice(0, 120), line: i + 1, hasDoc });
  }

  return symbols;
}

// ─── Documentation generators ─────────────────────────────────────────────────

function generateFunctionDoc(name: string, signature: string): string {
  const isAsync = signature.includes("async");
  const params: string[] = [];

  const paramMatch = signature.match(/\(([^)]*)\)/);
  if (paramMatch?.[1]) {
    paramMatch[1]
      .split(",")
      .map((p) => p.trim().split(":")[0].trim().replace(/[?=].*/, "").trim())
      .filter(Boolean)
      .forEach((p) => params.push(` * @param ${p} -`));
  }

  const lines = [
    "/**",
    ` * ${name}${isAsync ? " (async)" : ""}.`,
    " *",
    ...params,
    " * @returns",
    " */",
  ];
  return lines.join("\n");
}

function generateClassDoc(name: string): string {
  return [`/**`, ` * ${name}.`, ` */`].join("\n");
}

function generateTypeDoc(name: string, kind: CodeSymbol["kind"]): string {
  return [`/**`, ` * ${name} ${kind}.`, ` */`].join("\n");
}

function buildDoc(sym: CodeSymbol): string {
  switch (sym.kind) {
    case "function":
      return generateFunctionDoc(sym.name, sym.signature);
    case "class":
      return generateClassDoc(sym.name);
    default:
      return generateTypeDoc(sym.name, sym.kind);
  }
}

// ─── Modes ───────────────────────────────────────────────────────────────────

function auditFile(source: string, filePath: string): AgentResult {
  const symbols = extractSymbols(source);
  const undocumented = symbols.filter((s) => !s.hasDoc);

  if (undocumented.length === 0) {
    return { success: true, message: `${path.basename(filePath)}: all exports documented.` };
  }

  const list = undocumented
    .map((s) => `  line ${s.line}: [${s.kind}] ${s.name}`)
    .join("\n");

  return {
    success: true,
    message: `${path.basename(filePath)}: ${undocumented.length} undocumented export(s):\n${list}`,
    data: { undocumented: undocumented.map((s) => ({ name: s.name, kind: s.kind, line: s.line })) },
  };
}

function generateDocs(source: string, filePath: string): AgentResult {
  const symbols = extractSymbols(source);
  const toDocument = symbols.filter((s) => !s.hasDoc);

  if (toDocument.length === 0) {
    return { success: true, message: "All exports already documented. No changes needed." };
  }

  const lines = source.split("\n");
  // Insert in reverse order so line indices stay valid
  for (const sym of [...toDocument].reverse()) {
    const doc = buildDoc(sym);
    lines.splice(sym.line - 1, 0, doc);
  }

  const output = lines.join("\n");
  fs.writeFileSync(filePath, output, "utf-8");
  const patch: FilePatch = buildPatch(filePath, source, output);

  return {
    success: true,
    message: `Documented ${toDocument.length} export(s) in ${path.basename(filePath)}.`,
    data: {
      documented: toDocument.map((s) => ({ name: s.name, kind: s.kind, line: s.line })),
      filePatches: [patch],
    },
  };
}

function summarizeFile(source: string, filePath: string): AgentResult {
  const symbols = extractSymbols(source);
  const byKind = symbols.reduce<Record<string, string[]>>((acc, s) => {
    (acc[s.kind] ??= []).push(s.name);
    return acc;
  }, {});

  const lines = source.split("\n").length;
  const parts = Object.entries(byKind).map(([kind, names]) => `${kind}s: ${names.join(", ")}`);

  return {
    success: true,
    message: [
      `File: ${path.basename(filePath)} (${lines} lines)`,
      `Exports — ${parts.join(" | ") || "none"}`,
      `Documented: ${symbols.filter((s) => s.hasDoc).length}/${symbols.length}`,
    ].join("\n"),
    data: { symbols },
  };
}

// ─── Agent definition ─────────────────────────────────────────────────────────

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const filePath = (ctx.metadata?.filePath as string | undefined) ?? extractPath(ctx.query);
  const mode = (ctx.metadata?.mode as string | undefined) ?? inferMode(ctx.query);

  if (!filePath) {
    return {
      success: false,
      message:
        "No file path provided. Pass filePath in metadata or include the path in the query.",
    };
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, message: `File not found: ${resolved}` };
  }

  const source = fs.readFileSync(resolved, "utf-8");

  switch (mode) {
    case "audit":
      return auditFile(source, resolved);
    case "generate":
      return generateDocs(source, resolved);
    case "summary":
    default:
      return summarizeFile(source, resolved);
  }
}

function extractPath(query: string): string | undefined {
  const m = query.match(/(?:^|\s)([\w./\\-]+\.(?:ts|js|tsx|jsx|mts|mjs))/);
  return m?.[1];
}

function inferMode(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("audit") || q.includes("undocumented") || q.includes("missing")) return "audit";
  if (q.includes("generat") || q.includes("add doc") || q.includes("document")) return "generate";
  return "summary";
}

const documenterAgent: AgentDefinition = {
  name: "documenter",
  description:
    "Expert documentation agent. Audits files for missing TSDoc/JSDoc, generates doc stubs for undocumented exports, and summarizes file structure. Modes: summary (default), audit, generate.",
  keywords: [
    "document", "documentation", "docs", "jsdoc", "tsdoc",
    "comment", "annotate", "audit", "undocumented", "summarize", "describe",
  ],
  handler,
};

export default documenterAgent;
