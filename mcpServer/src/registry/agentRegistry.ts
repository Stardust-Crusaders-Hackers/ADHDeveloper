import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { AgentDefinition, AgentSummary } from "../types.js";

export class AgentRegistry {
  private agents: Map<string, AgentDefinition> = new Map();

  async discoverAgents(agentsDir: string): Promise<void> {
    if (!fs.existsSync(agentsDir)) {
      console.error(`[registry] Agents directory not found: ${agentsDir}`);
      return;
    }

    const files = fs.readdirSync(agentsDir).filter(
      (f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts")
    );

    for (const file of files) {
      try {
        const modulePath = path.join(agentsDir, file);
        const mod = await import(pathToFileURL(modulePath).href);
        const definition: AgentDefinition = mod.default;

        if (this.isValidAgent(definition)) {
          this.agents.set(definition.name, definition);
          console.error(`[registry] Registered agent: ${definition.name}`);
        } else {
          console.error(`[registry] Skipping ${file}: invalid AgentDefinition export`);
        }
      } catch (err) {
        console.error(`[registry] Failed to load ${file}:`, err);
      }
    }
  }

  private isValidAgent(def: unknown): def is AgentDefinition {
    if (!def || typeof def !== "object") return false;
    const d = def as Record<string, unknown>;
    return (
      typeof d.name === "string" &&
      typeof d.description === "string" &&
      Array.isArray(d.keywords) &&
      typeof d.handler === "function"
    );
  }

  getAgent(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  getAllAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  getAgentSummaries(): AgentSummary[] {
    return this.getAllAgents().map((a) => ({
      name: a.name,
      description: a.description,
      keywords: a.keywords,
    }));
  }
}
