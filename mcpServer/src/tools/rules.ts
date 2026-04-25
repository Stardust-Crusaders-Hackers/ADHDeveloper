import fs from "fs";
import path from "path";
import { KeyedCache } from "./cache.js";

const RULES_FILENAME = ".hackathon-rules.md";
const RULES_TTL_MS = 60_000;

export const rulesCache = new KeyedCache<string[]>(RULES_TTL_MS);

function rulesPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, RULES_FILENAME);
}

export function loadRules(workspaceRoot: string): string[] {
  const cached = rulesCache.get(workspaceRoot);
  if (cached) return cached;

  try {
    const raw = fs.readFileSync(rulesPath(workspaceRoot), "utf-8");
    const rules = raw
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim())
      .filter(Boolean);
    rulesCache.set(workspaceRoot, rules);
    return rules;
  } catch {
    return [];
  }
}

function saveRules(workspaceRoot: string, rules: string[]): void {
  const content = rules.length > 0 ? rules.map((r) => `- ${r}`).join("\n") + "\n" : "";
  fs.writeFileSync(rulesPath(workspaceRoot), content, "utf-8");
  rulesCache.set(workspaceRoot, rules);
}

export function addRule(workspaceRoot: string, rule: string): string[] {
  const rules = [...loadRules(workspaceRoot), rule];
  saveRules(workspaceRoot, rules);
  return rules;
}

export function removeRule(
  workspaceRoot: string,
  index: number
): { rules: string[]; removed: string | null } {
  const rules = [...loadRules(workspaceRoot)];
  if (index < 1 || index > rules.length) return { rules, removed: null };
  const [removed] = rules.splice(index - 1, 1);
  saveRules(workspaceRoot, rules);
  return { rules, removed };
}
