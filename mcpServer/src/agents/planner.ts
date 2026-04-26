import { AgentDefinition } from "../types.js";

/**
 * Planner Agent
 * Follows a Brainstorm -> Analyze -> Plan flow for ADHD-friendly development.
 */
const plannerAgent: AgentDefinition = {
  name: "planner",
  description: "Creates concise development plans through brainstorming and file analysis.",
  keywords: ["plan", "planning", "brainstorm", "roadmap", "feature", "strategy"],
  handler: async (context) => {
    const { query, metadata } = context;
    const files = (metadata?.files as string[]) || [];

    // Simple heuristic for "relevant files" if none provided
    const relevantSuggestions = [];
    if (query.toLowerCase().includes("agent")) relevantSuggestions.push("src/agents/", "src/registry/");
    if (query.toLowerCase().includes("mcp")) relevantSuggestions.push("package.json", "src/index.ts");
    if (query.toLowerCase().includes("ui") || query.toLowerCase().includes("plugin")) relevantSuggestions.push("intelliJPlugin/");

    const analysis = files.length > 0 
      ? files.map(f => `- **${f}**: Detected extension point for the feature.`).join('\n')
      : relevantSuggestions.length > 0
        ? `Suggestions for initial analysis:\n${relevantSuggestions.map(s => `- \`${s}\``).join('\n')}`
        : '- No files or automatic suggestions detected.';

    const plan = `
# 🧠 Brainstorming for: "${query}"
1. **MVP (Fast)**: Implement minimum logic in a single file.
2. **Structured**: Follow current architecture pattern.
3. **Scalable**: Prepare for future integrations.

# 📂 Context Analysis
${analysis}

# 🚀 Concise Action Plan
1. **Phase 1**: Identify "anchor" files and insertion points.
2. **Phase 2**: Implement functional prototype without external dependencies.
3. **Phase 3**: Integrate with the rest of the system.
4. **Phase 4**: Visual and functional validation.
    `.trim();

    return {
      success: true,
      message: plan,
    };
  },
};

export default plannerAgent;
