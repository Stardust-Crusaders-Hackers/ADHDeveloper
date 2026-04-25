import { AgentRegistry } from "../registry/agentRegistry.js";
import { AgentContext, AgentResult, AgentRecommendation, OrchestrationResult } from "../types.js";

const CONFIDENCE_THRESHOLD = 0.5;

export class Orchestrator {
  constructor(private registry: AgentRegistry) {}

  evaluate(query: string): OrchestrationResult {
    const agents = this.registry.getAllAgents();
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/);

    const recommendations: AgentRecommendation[] = agents
      .map((agent) => {
        const confidence = this.computeScore(queryTokens, queryLower, agent.keywords);
        return {
          agentName: agent.name,
          description: agent.description,
          confidence,
          reasoning: this.buildReasoning(agent.keywords, queryTokens, confidence),
        };
      })
      .filter((r) => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence);

    const topMatch = recommendations[0];
    if (topMatch && topMatch.confidence >= CONFIDENCE_THRESHOLD) {
      return { matchType: "rule-based", recommendations };
    }

    return {
      matchType: "llm-decision-needed",
      recommendations,
      allAgents: this.registry.getAgentSummaries(),
    };
  }

  async executeAgent(agentName: string, context: AgentContext): Promise<AgentResult> {
    const agent = this.registry.getAgent(agentName);
    if (!agent) {
      return { success: false, message: `Agent "${agentName}" not found` };
    }
    return agent.handler(context);
  }

  private computeScore(queryTokens: string[], queryLower: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;
    let matchCount = 0;
    for (const keyword of keywords) {
      const kw = keyword.toLowerCase();
      if (queryTokens.includes(kw) || queryLower.includes(kw)) {
        matchCount++;
      }
    }
    return matchCount / keywords.length;
  }

  private buildReasoning(keywords: string[], queryTokens: string[], score: number): string {
    const matched = keywords.filter((kw) => queryTokens.includes(kw.toLowerCase()));
    if (matched.length === 0) return "No keyword matches found.";
    return `Matched keywords: [${matched.join(", ")}]. Score: ${(score * 100).toFixed(0)}%`;
  }
}
