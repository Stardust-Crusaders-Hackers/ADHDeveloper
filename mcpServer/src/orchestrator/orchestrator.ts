import { AgentRegistry } from "../registry/agentRegistry.js";
import {
  AgentContext,
  AgentResult,
  AgentRecommendation,
  FlowStepSummary,
  OrchestrationResult,
} from "../types.js";

const CONFIDENCE_THRESHOLD = 0.5;
const FLOW_TTL_MS = 30 * 60 * 1000;

interface ExecuteAgentMetadata extends Record<string, unknown> {
  flowId?: string;
  flowCompleted?: boolean;
}

interface FlowState {
  id: string;
  createdAt: number;
  updatedAt: number;
  steps: FlowStepSummary[];
}

export class Orchestrator {
  private flowState = new Map<string, FlowState>();
  private implicitFlowCounter = 0;

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

    if (agentName === "explainer") {
      return this.runAgent(agentName, context);
    }

    this.cleanupExpiredFlows();

    const metadata = (context.metadata ?? {}) as ExecuteAgentMetadata;
    const explicitFlowId = this.normalizeFlowId(metadata.flowId);
    const implicit = !explicitFlowId;
    const flowId = explicitFlowId ?? this.createImplicitFlowId();
    const flow = this.ensureFlow(flowId);

    const result = await this.runAgent(agentName, context);
    this.appendFlowStep(flow, {
      agentName,
      success: result.success,
      messageExcerpt: this.toExcerpt(result.message),
    });

    const shouldClose = implicit || metadata.flowCompleted === true;
    if (!shouldClose) {
      return result;
    }

    const participants = this.collectParticipants(flow.steps);
    const explainerResult = await this.runAgent("explainer", {
      query: context.query,
      metadata: {
        flowId,
        flowParticipants: participants,
        flowSteps: flow.steps,
      },
    });

    const inlineMessage = [
      result.message.trim(),
      "Explainer:",
      explainerResult.message.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");

    this.flowState.delete(flowId);

    return {
      ...result,
      message: inlineMessage,
      data: {
        ...(result.data ?? {}),
        flow: {
          flowId,
          completed: true,
          implicit,
          participants,
          steps: [...flow.steps],
          explainer: explainerResult,
        },
      },
    };
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

  private async runAgent(agentName: string, context: AgentContext): Promise<AgentResult> {
    const agent = this.registry.getAgent(agentName);
    if (!agent) {
      return { success: false, message: `Agent "${agentName}" not found` };
    }

    try {
      return await agent.handler(context);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Agent "${agentName}" failed: ${detail}`,
      };
    }
  }

  private normalizeFlowId(flowId: unknown): string | undefined {
    if (typeof flowId !== "string") return undefined;
    const normalized = flowId.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private createImplicitFlowId(): string {
    this.implicitFlowCounter += 1;
    return `implicit-flow-${Date.now()}-${this.implicitFlowCounter}`;
  }

  private ensureFlow(flowId: string): FlowState {
    const existing = this.flowState.get(flowId);
    if (existing) {
      existing.updatedAt = Date.now();
      return existing;
    }

    const created: FlowState = {
      id: flowId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    this.flowState.set(flowId, created);
    return created;
  }

  private appendFlowStep(flow: FlowState, step: FlowStepSummary): void {
    flow.steps.push(step);
    flow.updatedAt = Date.now();
  }

  private collectParticipants(steps: FlowStepSummary[]): string[] {
    const seen = new Set<string>();
    const participants: string[] = [];
    for (const step of steps) {
      if (seen.has(step.agentName)) continue;
      seen.add(step.agentName);
      participants.push(step.agentName);
    }
    return participants;
  }

  private cleanupExpiredFlows(): void {
    const now = Date.now();
    for (const [flowId, flow] of this.flowState.entries()) {
      if (now - flow.updatedAt > FLOW_TTL_MS) {
        this.flowState.delete(flowId);
      }
    }
  }

  private toExcerpt(message: string, maxLength = 180): string {
    const compact = message.replace(/\s+/g, " ").trim();
    if (!compact) return "";
    if (compact.length <= maxLength) return compact;
    return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
  }
}
