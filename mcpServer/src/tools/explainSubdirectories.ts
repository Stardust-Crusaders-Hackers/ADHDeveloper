import * as fs from "fs";
import * as path from "path";
import { buildPatch } from "./patchUtils.js";
import { FilePatch } from "../types.js";

type OverwritePolicy = "merge" | "overwrite" | "no-overwrite";
type Language = "es" | "en";

interface ExplainResult {
  created: string[];
  merged: string[];
  skipped: string[];
  errors: string[];
  notes: string[];
  patches?: FilePatch[];
}

interface ExplainOptions {
  projectPath: string;
  language?: string;
  stack?: string;
  includeHidden?: boolean;
  maxDepth?: number;
  overwritePolicy?: OverwritePolicy;
  fallbackFilename?: string;
}

interface DirDocData {
  conceptual: string;
  architectural: string;
  recommendations: string[];
  items: Array<{ name: string; description: string; kind: "file" | "directory" }>;
  omittedItems: number;
}

interface FormatTarget {
  fileName: string;
  type: "markdown" | "python-init" | "java-package-info";
  javaPackageName?: string;
}

const START_TOKEN = "ADH_DIRDOCS_START";
const END_TOKEN = "ADH_DIRDOCS_END";
const DEFAULT_MAX_DEPTH = 8;
const MAX_ITEMS_PER_DIR = 60;

const STACK_ALIASES: Record<string, string> = {
  "node.js": "node",
  javascript: "node",
  typescript: "node",
  py: "python",
  jvm: "java",
  "c#": "dotnet",
  csharp: "dotnet",
  ".net": "dotnet",
  "dotnet-core": "dotnet",
  "c++": "cpp",
};

const EXCLUDED_DIRS = new Set([
  ".git",
  ".svn",
  ".hg",
  "node_modules",
  ".pnpm-store",
  ".yarn",
  "dist",
  "build",
  "out",
  "target",
  ".next",
  ".nuxt",
  ".cache",
  ".idea",
  ".vscode",
  ".gradle",
  ".venv",
  "venv",
  "__pycache__",
  "vendor",
  "coverage",
  ".mypy_cache",
  ".pytest_cache",
]);

function normalizeStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  const s = stack.trim().toLowerCase();
  return STACK_ALIASES[s] ?? s;
}

function inferStack(projectPath: string): string | undefined {
  const has = (name: string) => fs.existsSync(path.join(projectPath, name));
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) return "python";
  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) return "java";
  if (has("go.mod")) return "go";
  if (has("Cargo.toml")) return "rust";
  if (has("composer.json")) return "php";
  if (has("Gemfile")) return "ruby";
  if (has("package.json")) return "node";
  return undefined;
}

function inferLanguage(language?: string): Language {
  if (language) {
    const lower = language.trim().toLowerCase();
    if (lower.startsWith("es")) return "es";
    return "en";
  }
  const locale = process.env.LC_ALL ?? process.env.LANG ?? "";
  return locale.toLowerCase().includes("es") ? "es" : "en";
}

function shouldSkipDirectory(name: string, includeHidden: boolean): boolean {
  if (!includeHidden && name.startsWith(".")) return true;
  return EXCLUDED_DIRS.has(name);
}

function collectSubdirectories(projectPath: string, maxDepth: number, includeHidden: boolean): string[] {
  const directories: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: projectPath, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.depth >= maxDepth) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (shouldSkipDirectory(entry.name, includeHidden)) continue;
      const nextDir = path.join(current.dir, entry.name);
      directories.push(nextDir);
      queue.push({ dir: nextDir, depth: current.depth + 1 });
    }
  }

  return directories;
}

function looksLikePythonDirectory(entries: fs.Dirent[]): boolean {
  return entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".py"));
}

function isJavaIdentifierPart(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function javaPackageNameFromDir(projectPath: string, dirPath: string): string | undefined {
  const rel = path.relative(projectPath, dirPath);
  const normalized = rel.split(path.sep).join("/");
  const roots = ["src/main/java/", "src/test/java/"];
  const root = roots.find((candidate) => normalized.startsWith(candidate));
  if (!root) return undefined;

  const packageRel = normalized.slice(root.length).trim();
  if (!packageRel) return undefined;
  const parts = packageRel.split("/").filter(Boolean);
  if (parts.length === 0 || !parts.every(isJavaIdentifierPart)) return undefined;
  return parts.join(".");
}

function targetFileForDirectory(
  projectPath: string,
  dirPath: string,
  entries: fs.Dirent[],
  stack: string | undefined,
  fallbackFilename: string
): FormatTarget {
  if (stack === "java") {
    const packageName = javaPackageNameFromDir(projectPath, dirPath);
    if (packageName) {
      return { fileName: "package-info.java", type: "java-package-info", javaPackageName: packageName };
    }
  }

  if (stack === "python" && looksLikePythonDirectory(entries)) {
    return { fileName: "__init__.py", type: "python-init" };
  }

  return { fileName: fallbackFilename, type: "markdown" };
}

function describeEntry(name: string, entry: fs.Dirent, language: Language): string {
  if (entry.isDirectory()) {
    return language === "es"
      ? "Subdirectorio que agrupa responsabilidades relacionadas."
      : "Subdirectory grouping related responsibilities.";
  }

  const ext = path.extname(name).toLowerCase();
  const byExt: Record<string, { es: string; en: string }> = {
    ".ts": { es: "Archivo TypeScript con lógica tipada.", en: "TypeScript source with typed logic." },
    ".js": { es: "Archivo JavaScript con lógica ejecutable.", en: "JavaScript source with executable logic." },
    ".py": { es: "Módulo Python con comportamiento reutilizable.", en: "Python module with reusable behavior." },
    ".java": { es: "Clase/interfaz Java dentro del paquete.", en: "Java class/interface in this package." },
    ".go": { es: "Archivo Go con código compilable.", en: "Go source file with compilable code." },
    ".rs": { es: "Unidad de código Rust.", en: "Rust source unit." },
    ".md": { es: "Documento de apoyo para contexto o uso.", en: "Support document for context or usage." },
    ".json": { es: "Configuración o datos estructurados.", en: "Structured configuration or data." },
    ".yml": { es: "Configuración declarativa.", en: "Declarative configuration." },
    ".yaml": { es: "Configuración declarativa.", en: "Declarative configuration." },
    ".toml": { es: "Configuración de herramientas/build.", en: "Tooling/build configuration." },
    ".xml": { es: "Configuración o metadatos estructurados.", en: "Structured config or metadata." },
    ".sh": { es: "Script de automatización para shell.", en: "Shell automation script." },
    ".ps1": { es: "Script PowerShell de automatización.", en: "PowerShell automation script." },
  };

  const guessed = byExt[ext];
  if (guessed) return guessed[language];
  return language === "es"
    ? "Archivo de soporte para esta carpeta."
    : "Support file used by this directory.";
}

function directoryContextHints(dirName: string, language: Language): { conceptual: string; architectural: string; recommendations: string[] } {
  const key = dirName.toLowerCase();
  const spanish = language === "es";

  if (["src", "app", "services"].includes(key)) {
    return {
      conceptual: spanish
        ? "Concentra implementación principal y casos de uso del sistema."
        : "Holds main implementation and system use cases.",
      architectural: spanish
        ? "Es núcleo operativo del proyecto y suele depender de capas de soporte."
        : "Acts as the project operational core and typically depends on support layers.",
      recommendations: spanish
        ? ["Mantén límites claros por módulo.", "Evita mezclar lógica de dominio con infraestructura."]
        : ["Keep clear module boundaries.", "Avoid mixing domain logic with infrastructure details."],
    };
  }

  if (["test", "tests", "__tests__"].includes(key)) {
    return {
      conceptual: spanish
        ? "Agrupa validaciones automáticas del comportamiento esperado."
        : "Groups automated checks for expected behavior.",
      architectural: spanish
        ? "Protege regresiones y documenta contratos de código."
        : "Protects against regressions and documents code contracts.",
      recommendations: spanish
        ? ["Escribe pruebas cerca de cada responsabilidad.", "Prioriza casos de negocio y bordes críticos."]
        : ["Write tests close to each responsibility.", "Prioritize business cases and critical edges."],
    };
  }

  if (["docs", "documentation"].includes(key)) {
    return {
      conceptual: spanish
        ? "Centraliza conocimiento funcional, técnico y operativo."
        : "Centralizes functional, technical, and operational knowledge.",
      architectural: spanish
        ? "Reduce dependencia de conocimiento tácito en el equipo."
        : "Reduces reliance on tacit team knowledge.",
      recommendations: spanish
        ? ["Mantén ejemplos ejecutables y concretos.", "Actualiza este contenido junto al código."]
        : ["Keep examples concrete and runnable.", "Update this content together with code changes."],
    };
  }

  if (["infra", "infrastructure", "deploy", "k8s", "terraform"].includes(key)) {
    return {
      conceptual: spanish
        ? "Contiene definición de entorno, despliegue y operaciones."
        : "Contains environment, deployment, and operations definitions.",
      architectural: spanish
        ? "Separa concerns de plataforma del código de negocio."
        : "Separates platform concerns from business code.",
      recommendations: spanish
        ? ["Versiona cambios de infraestructura con contexto.", "Evita secretos en texto plano."]
        : ["Version infrastructure changes with context.", "Avoid plaintext secrets."],
    };
  }

  if (["config", "configs"].includes(key)) {
    return {
      conceptual: spanish
        ? "Agrupa parámetros de ejecución y configuración transversal."
        : "Groups runtime parameters and cross-cutting config.",
      architectural: spanish
        ? "Permite ajustar comportamiento sin reescribir módulos de negocio."
        : "Lets you tune behavior without rewriting business modules.",
      recommendations: spanish
        ? ["Prefiere valores explícitos por entorno.", "Documenta valores por defecto y overrides."]
        : ["Prefer explicit per-environment values.", "Document defaults and override points."],
    };
  }

  return {
    conceptual: spanish
      ? "Este subdirectorio encapsula una parte concreta del sistema."
      : "This subdirectory encapsulates a specific part of the system.",
    architectural: spanish
      ? "Su responsabilidad debería mantenerse acotada y coherente con el diseño global."
      : "Its responsibility should stay bounded and coherent with global design.",
    recommendations: spanish
      ? ["Agrupa por responsabilidad real, no por tipo de archivo.", "Mantén nombres consistentes con su propósito."]
      : ["Group by real responsibility, not by file type alone.", "Keep names consistent with purpose."],
  };
}

function buildDirectoryDocData(dirPath: string, entries: fs.Dirent[], language: Language): DirDocData {
  const hints = directoryContextHints(path.basename(dirPath), language);
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const visible = sorted.slice(0, MAX_ITEMS_PER_DIR);
  const omittedItems = Math.max(0, sorted.length - visible.length);

  const items = visible.map((entry) => ({
    name: entry.name,
    kind: entry.isDirectory() ? ("directory" as const) : ("file" as const),
    description: describeEntry(entry.name, entry, language),
  }));

  return {
    conceptual: hints.conceptual,
    architectural: hints.architectural,
    recommendations: hints.recommendations,
    items,
    omittedItems,
  };
}

function toMarkdownContent(relativeDir: string, data: DirDocData, language: Language): string {
  const title = language === "es" ? "Guía de este subdirectorio" : "Subdirectory guide";
  const conceptualTitle = language === "es" ? "Propósito conceptual" : "Conceptual purpose";
  const architecturalTitle = language === "es" ? "Rol arquitectónico" : "Architectural role";
  const contentsTitle = language === "es" ? "Contenidos" : "Contents";
  const recommendationsTitle = language === "es" ? "Cómo se recomienda trabajar aquí" : "Recommended way of working here";
  const omitted = language === "es"
    ? `\n- _Se omitieron ${data.omittedItems} elemento(s) para mantener el archivo breve._`
    : `\n- _${data.omittedItems} item(s) omitted to keep this file concise._`;

  const items = data.items.map((item) => `- \`${item.name}\`: ${item.description}`).join("\n");
  const recs = data.recommendations.map((r) => `- ${r}`).join("\n");

  return `<!-- ${START_TOKEN} -->
# ${title}

${language === "es" ? `Directorio: \`${relativeDir}\`` : `Directory: \`${relativeDir}\``}

## ${conceptualTitle}
${data.conceptual}

## ${architecturalTitle}
${data.architectural}

## ${contentsTitle}
${items || "-"}
${data.omittedItems > 0 ? omitted : ""}

## ${recommendationsTitle}
${recs}
<!-- ${END_TOKEN} -->
`;
}

function toPythonInitContent(relativeDir: string, data: DirDocData, language: Language): string {
  const lines = [
    language === "es" ? `Paquete: ${relativeDir}` : `Package: ${relativeDir}`,
    "",
    language === "es" ? `Propósito conceptual: ${data.conceptual}` : `Conceptual purpose: ${data.conceptual}`,
    language === "es" ? `Rol arquitectónico: ${data.architectural}` : `Architectural role: ${data.architectural}`,
    "",
    language === "es" ? "Contenidos:" : "Contents:",
    ...data.items.map((item) => `- ${item.name}: ${item.description}`),
    ...(data.omittedItems > 0
      ? [language === "es" ? `- (${data.omittedItems} elemento(s) omitidos)` : `- (${data.omittedItems} item(s) omitted)`]
      : []),
    "",
    language === "es" ? "Forma recomendada de trabajo:" : "Recommended workflow:",
    ...data.recommendations.map((item) => `- ${item}`),
  ];

  const commented = lines.map((line) => (line ? `# ${line}` : "#")).join("\n");
  return `# ${START_TOKEN}
${commented}
# ${END_TOKEN}
`;
}

function toJavaDocBlock(relativeDir: string, data: DirDocData, language: Language): string {
  const header = language === "es" ? `Documentación de package para ${relativeDir}` : `Package documentation for ${relativeDir}`;
  const recLabel = language === "es" ? "Recomendaciones" : "Recommendations";
  const body = [
    ` * ${header}.`,
    ` * ${language === "es" ? "Propósito conceptual" : "Conceptual purpose"}: ${data.conceptual}`,
    ` * ${language === "es" ? "Rol arquitectónico" : "Architectural role"}: ${data.architectural}`,
    " *",
    ` * ${language === "es" ? "Contenidos" : "Contents"}:`,
    ...data.items.map((item) => ` * - ${item.name}: ${item.description}`),
    ...(data.omittedItems > 0
      ? [` * - ${language === "es" ? `(${data.omittedItems} elemento(s) omitidos)` : `(${data.omittedItems} item(s) omitted)`}`]
      : []),
    " *",
    ` * ${recLabel}:`,
    ...data.recommendations.map((r) => ` * - ${r}`),
  ].join("\n");

  return `/* ${START_TOKEN} */
/**
${body}
 */
/* ${END_TOKEN} */`;
}

function upsertGeneratedBlock(existing: string, block: string): string {
  const startIdx = existing.indexOf(START_TOKEN);
  const endIdx = existing.indexOf(END_TOKEN);

  if (startIdx >= 0 && endIdx > startIdx) {
    const lineStart = existing.lastIndexOf("\n", startIdx);
    const cutStart = lineStart >= 0 ? lineStart + 1 : 0;
    const lineEnd = existing.indexOf("\n", endIdx);
    const cutEnd = lineEnd >= 0 ? lineEnd + 1 : existing.length;
    return `${existing.slice(0, cutStart)}${block}\n${existing.slice(cutEnd).replace(/^\s+/, "")}`.trimEnd() + "\n";
  }

  return `${existing.trimEnd()}\n\n${block}\n`;
}

function mergeJavaPackageInfo(existing: string, block: string, packageName: string): string {
  const withBlock = upsertGeneratedBlock(existing, block);
  if (/\bpackage\s+[A-Za-z_][A-Za-z0-9_.]*\s*;/.test(withBlock)) return withBlock;
  return `${withBlock.trimEnd()}\n\npackage ${packageName};\n`;
}

function ensureAbsolutePath(projectPath: string): void {
  if (!path.isAbsolute(projectPath)) throw new Error("projectPath must be an absolute path");
}

export async function explainSubdirectories(options: ExplainOptions): Promise<ExplainResult> {
  const result: ExplainResult = { created: [], merged: [], skipped: [], errors: [], notes: [] };

  try {
    ensureAbsolutePath(options.projectPath);
    if (!fs.existsSync(options.projectPath)) throw new Error("projectPath does not exist");

    const language = inferLanguage(options.language);
    const stack = normalizeStack(options.stack) ?? inferStack(options.projectPath);
    const includeHidden = options.includeHidden ?? false;
    const maxDepth = Math.max(1, options.maxDepth ?? DEFAULT_MAX_DEPTH);
    const overwritePolicy = options.overwritePolicy ?? "merge";
    const cleanedFallback = (options.fallbackFilename?.trim() || "index.md").replace(/[\\/]/g, "");
    const fallbackFilename = cleanedFallback || "index.md";

    const subdirs = collectSubdirectories(options.projectPath, maxDepth, includeHidden);
    if (subdirs.length === 0) {
      result.notes.push(language === "es" ? "No se detectaron subdirectorios procesables." : "No processable subdirectories found.");
      return result;
    }

    for (const dir of subdirs) {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => includeHidden || !entry.name.startsWith("."));
      } catch (err) {
        result.errors.push(err instanceof Error ? `${dir}: ${err.message}` : `${dir}: ${String(err)}`);
        continue;
      }

      const rel = path.relative(options.projectPath, dir) || ".";
      const target = targetFileForDirectory(options.projectPath, dir, entries, stack, fallbackFilename);
      const targetPath = path.join(dir, target.fileName);
      const docData = buildDirectoryDocData(dir, entries, language);

      const markdownBlock = toMarkdownContent(rel, docData, language);
      const pythonBlock = toPythonInitContent(rel, docData, language);
      const javaBlock = toJavaDocBlock(rel, docData, language);

      try {
        if (!fs.existsSync(targetPath)) {
          const content =
            target.type === "markdown"
              ? markdownBlock
              : target.type === "python-init"
                ? `${pythonBlock}\n`
                : `${javaBlock}\n\npackage ${target.javaPackageName};\n`;
          fs.writeFileSync(targetPath, content, "utf-8");
          result.created.push(targetPath);
          const patch = buildPatch(targetPath, "", content);
          result.patches = result.patches ?? [];
          result.patches.push(patch);
          continue;
        }

        if (overwritePolicy === "no-overwrite") {
          result.skipped.push(targetPath);
          continue;
        }

        if (overwritePolicy === "overwrite") {
          const content =
            target.type === "markdown"
              ? markdownBlock
              : target.type === "python-init"
                ? `${pythonBlock}\n`
                : `${javaBlock}\n\npackage ${target.javaPackageName};\n`;
          const existingRaw = fs.readFileSync(targetPath, "utf-8");
          fs.writeFileSync(targetPath, content, "utf-8");
          result.merged.push(targetPath);
          const patch = buildPatch(targetPath, existingRaw, content);
          result.patches = result.patches ?? [];
          result.patches.push(patch);
          continue;
        }

        const existing = fs.readFileSync(targetPath, "utf-8");
        let merged = existing;
        if (target.type === "markdown") merged = upsertGeneratedBlock(existing, markdownBlock);
        if (target.type === "python-init") merged = upsertGeneratedBlock(existing, pythonBlock);
        if (target.type === "java-package-info") {
          merged = mergeJavaPackageInfo(existing, javaBlock, target.javaPackageName ?? "");
        }
        fs.writeFileSync(targetPath, merged, "utf-8");
        result.merged.push(targetPath);
        const patch = buildPatch(targetPath, existing, merged);
        result.patches = result.patches ?? [];
        result.patches.push(patch);
      } catch (err) {
        result.errors.push(err instanceof Error ? `${targetPath}: ${err.message}` : `${targetPath}: ${String(err)}`);
      }
    }

    if (!stack) {
      result.notes.push(
        language === "es"
          ? `No se detectó stack con alta confianza; se aplicó fallback "${options.fallbackFilename ?? "index.md"}".`
          : `Stack not detected with high confidence; fallback "${options.fallbackFilename ?? "index.md"}" was applied.`
      );
    } else {
      result.notes.push(language === "es" ? `Stack detectado/usado: ${stack}.` : `Detected/used stack: ${stack}.`);
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

