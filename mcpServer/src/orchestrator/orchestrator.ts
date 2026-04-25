import { AgentRegistry } from "../registry/agentRegistry.js";
import {
  AgentContext,
  AgentResult,
  AgentRecommendation,
  ClosedPresentationEvent,
  FlowStateResponse,
  FlowStepSummary,
  OrchestrationResult,
  RunningAgentMetadata,
} from "../types.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const STATE_FILE = path.join(os.tmpdir(), "adhd-bridge-state.json");

function writePresentationToState(agentId: string, text: string, agentMeta?: { name: string; description: string; type?: string }): void {
  try {
    let state: Record<string, unknown> = { agents: [], tasks: [], presentations: [] };
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      if (!Array.isArray(state.presentations)) state.presentations = [];
    }
    if (!Array.isArray(state.agents)) state.agents = [];

    const agentsList = state.agents as Array<Record<string, string>>;
    const alreadyRegistered = agentsList.some((a) => a.id === agentId);
    if (!alreadyRegistered && agentMeta) {
      agentsList.push({
        id: agentId,
        name: agentMeta.name,
        type: agentMeta.type ?? "agent",
        description: agentMeta.description,
      });
    }

    (state.presentations as unknown[]).push({
      presentationId: `pres-${Date.now()}`,
      agentId,
      text,
      status: "PENDING",
      createdAt: Date.now(),
    });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (_) {}
}

const CONFIDENCE_THRESHOLD = 0.5;
const FLOW_TTL_MS = 30 * 60 * 1000;
const CLOSED_PRESENTATION_TTL_MS = 2 * 60 * 1000;

// Sliding window and excerpting config (tunable via env)
const FLOW_SLIDING_WINDOW = Number(process.env.FLOW_SLIDING_WINDOW) || 5;
const FLOW_SUMMARY_EXCERPT_CHARS = Number(process.env.FLOW_SUMMARY_EXCERPT_CHARS) || 160;
const FLOW_EXCERPT_MAX_LENGTH = Number(process.env.FLOW_EXCERPT_MAX_LENGTH) || 180;

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
  private activeExecutions = new Map<string, RunningAgentMetadata>();
  private closedPresentations: ClosedPresentationEvent[] = [];
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
    const taskId = this.createTaskId(flowId, agentName);
    this.activeExecutions.set(taskId, {
      taskId,
      flowId,
      agentName,
      startedAt: Date.now(),
    });

    try {
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
      // Build sliding window for explainer to reduce tokens: summarize older steps, keep recent full steps.
      const windowSize = FLOW_SLIDING_WINDOW;
      let flowStepsForExplainer: FlowStepSummary[] = flow.steps;
      if (flow.steps.length > windowSize) {
        const recent = flow.steps.slice(-windowSize);
        const older = flow.steps.slice(0, Math.max(0, flow.steps.length - windowSize));
        const summarizedOlder = this.summarizeOldSteps(older, FLOW_SUMMARY_EXCERPT_CHARS);
        flowStepsForExplainer = [...summarizedOlder, ...recent];
      }
      const explainerResult = await this.runAgent("explainer", {
        query: context.query,
        metadata: {
          flowId,
          flowParticipants: participants,
          flowSteps: flowStepsForExplainer,
          flowOriginalStepsCount: flow.steps.length,
        },
      });

      const presenterAgentId = participants[participants.length - 1] ?? agentName;
      const presentationText = explainerResult.message.trim();
      const presenterAgent = this.registry.getAgent(presenterAgentId);
      writePresentationToState(
        presenterAgentId,
        presentationText,
        presenterAgent
          ? { name: presenterAgent.name, description: presenterAgent.description, type: presenterAgent.type }
          : undefined
      );
      this.addClosedPresentationEvent(flowId, presenterAgentId, presentationText);

      const inlineMessage = [
        result.message.trim(),
        "Explainer:",
        presentationText,
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
    } finally {
      this.activeExecutions.delete(taskId);
    }
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
    this.pruneClosedPresentations(now);
  }

  private createTaskId(flowId: string, agentName: string): string {
    return `${flowId}:${agentName}:${Date.now()}`;
  }

  private addClosedPresentationEvent(flowId: string, agentId: string, text: string): void {
    const now = Date.now();
    this.closedPresentations.push({
      eventId: `${flowId}:${agentId}:${now}`,
      flowId,
      agentId,
      text,
      createdAt: now,
    });
    this.pruneClosedPresentations(now);
  }

  private pruneClosedPresentations(now = Date.now()): void {
    this.closedPresentations = this.closedPresentations.filter(
      (event) => now - event.createdAt <= CLOSED_PRESENTATION_TTL_MS
    );
  }

  private summarizeOldSteps(steps: FlowStepSummary[], perAgentMaxLength = FLOW_SUMMARY_EXCERPT_CHARS): FlowStepSummary[] {
    if (!steps || steps.length === 0) return [];
    const groups = new Map<string, FlowStepSummary[]>();
    for (const s of steps) {
      const arr = groups.get(s.agentName) ?? [];
      arr.push(s);
      groups.set(s.agentName, arr);
    }
    const result: FlowStepSummary[] = [];
    for (const [agentName, group] of groups.entries()) {
      const count = group.length;
      const success = group.every((g) => g.success);
      const first = group[0]?.messageExcerpt ?? "";
      const last = group[group.length - 1]?.messageExcerpt ?? "";
      const combined = `${first} ${last}`.trim();
      const excerpt = this.toExcerpt(combined, perAgentMaxLength);
      result.push({
        agentName,
        success,
        messageExcerpt: `${count} prior step(s) summarized: ${excerpt}`,
        originalSteps: count,
      });
    }
    return result;
  }

  private toExcerpt(message: string, maxLength = FLOW_EXCERPT_MAX_LENGTH): string {
    const compact = message.replace(/\s+/g, " ").trim();
    if (!compact) return "";
    if (compact.length <= maxLength) return compact;
    if (maxLength <= 4) return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
    const headLen = Math.ceil((maxLength - 1) / 2);
    const tailLen = (maxLength - 1) - headLen;
    const head = compact.slice(0, headLen).trimEnd();
    const tail = compact.slice(-tailLen).trimStart();
    return `${head}…${tail}`;
  }

  // Monitoring API — for plugin inspection
  getFlowState(): FlowStateResponse {
    this.cleanupExpiredFlows();
    const now = Date.now();
    const flows = Array.from(this.flowState.entries()).map(([id, flow]) => ({
      id: flow.id,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
      ageMs: now - flow.createdAt,
      stepsCount: flow.steps.length,
      participants: this.collectParticipants(flow.steps),
      steps: flow.steps,
    }));
    return {
      activeFlows: flows.length,
      flows,
      runningAgents: Array.from(this.activeExecutions.values()).sort((a, b) => a.startedAt - b.startedAt),
      recentClosedPresentations: [...this.closedPresentations].sort((a, b) => a.createdAt - b.createdAt),
      timestamp: now,
    };
  }

  getFlowById(flowId: string) {
    const flow = this.flowState.get(flowId);
    if (!flow) return null;
    return {
      id: flow.id,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
      ageMs: Date.now() - flow.createdAt,
      participants: this.collectParticipants(flow.steps),
      steps: flow.steps,
    };
  }
}
