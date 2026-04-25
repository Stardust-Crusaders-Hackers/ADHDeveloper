export interface AgentContext {
  query: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface AgentDefinition {
  name: string;
  description: string;
  keywords: string[];
  handler: (ctx: AgentContext) => Promise<AgentResult>;
}

export interface AgentRecommendation {
  agentName: string;
  description: string;
  confidence: number;
  reasoning: string;
}

export interface AgentSummary {
  name: string;
  description: string;
  keywords: string[];
}

export interface OrchestrationResult {
  matchType: "rule-based" | "llm-decision-needed";
  recommendations: AgentRecommendation[];
  allAgents?: AgentSummary[];
}
