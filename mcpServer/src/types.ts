export interface PresentationPayload {
  presentationId: string;
  agentId: string;
  agentName: string;
  agentType: string;
  text: string;
}

export type PresentationEmitter = (payload: PresentationPayload) => void;
export type ServerEventType = "presentation" | "agent_started" | "agent_completed" | "error" | "END";

export interface ServerEventBase {
  eventId: string;
  type: ServerEventType;
  timestamp: number;
  payload: unknown;
}

export interface PresentationServerEvent extends ServerEventBase {
  type: "presentation";
  payload: PresentationPayload;
}

export interface AgentStartedServerEvent extends ServerEventBase {
  type: "agent_started";
  payload: {
    taskId: string;
    flowId: string;
    agentName: string;
    startedAt: number;
    query: string;
    metadata?: Record<string, unknown>;
  };
}

export interface AgentCompletedServerEvent extends ServerEventBase {
  type: "agent_completed";
  payload: {
    taskId: string;
    flowId: string;
    agentName: string;
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    success: boolean;
    messageExcerpt: string;
  };
}

export interface ErrorServerEvent extends ServerEventBase {
  type: "error";
  payload: {
    scope: string;
    message: string;
    taskId?: string;
    flowId?: string;
    agentName?: string;
    detail?: string;
  };
}

export interface EndServerEvent extends ServerEventBase {
  type: "END";
  payload: {
    reason: string;
  };
}

export type ServerEvent =
  | PresentationServerEvent
  | AgentStartedServerEvent
  | AgentCompletedServerEvent
  | ErrorServerEvent
  | EndServerEvent;

export type ServerEventEmitter = (event: ServerEvent) => void;

export interface AgentContext {
  query: string;
  metadata?: Record<string, unknown>;
  emit?: PresentationEmitter;
}

export interface FlowStepSummary {
  agentName: string;
  success: boolean;
  messageExcerpt: string;
  originalSteps?: number;
}

export interface ExecuteAgentFlowData {
  flowId: string;
  completed: boolean;
  implicit: boolean;
  participants: string[];
  steps: FlowStepSummary[];
  explainer?: AgentResult;
}

export interface FilePatch {
  filePath: string;
  patch: string; // unified diff text
  summary?: string; // short human-readable summary
}

export interface AgentResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown> & {
    flow?: ExecuteAgentFlowData;
    filePatches?: FilePatch[];
  };
}

export interface AgentDefinition {
  name: string;
  description: string;
  keywords: string[];
  type?: string;
  handler: (ctx: AgentContext) => Promise<AgentResult>;
}

export interface AgentRecommendation {
  agentName: string;
  description: string;
  confidence: number;
  reasoning: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  type: string;
  description: string;
  keywords: string[];
}

export interface OrchestrationResult {
  matchType: "rule-based" | "llm-decision-needed";
  recommendations: AgentRecommendation[];
  allAgents?: AgentSummary[];
}

export interface FlowStateResponse {
  activeFlows: number;
  flows: FlowMetadata[];
  runningAgents?: RunningAgentMetadata[];
  recentClosedPresentations?: ClosedPresentationEvent[];
  timestamp: number;
}

export interface FlowMetadata {
  id: string;
  createdAt: number;
  updatedAt: number;
  ageMs: number;
  participants: string[];
  stepsCount: number;
  steps: FlowStepSummary[];
}

export interface RunningAgentMetadata {
  taskId: string;
  flowId: string;
  agentName: string;
  startedAt: number;
}

export interface ClosedPresentationEvent {
  eventId: string;
  flowId: string;
  agentId: string;
  text: string;
  createdAt: number;
}
export type VulnerabilitySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type VulnerabilityType =
  | "injection"
  | "xss"
  | "weak-crypto"
  | "hardcoded-secret"
  | "dependency-vulnerability"
  | "file-permission"
  | "exposed-config"
  | "missing-security-header"
  | "other";

export interface Vulnerability {
  id: string;
  type: VulnerabilityType;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  file: string;
  line?: number;
  code?: string;
  suggestedFix: string;
  cveId?: string;
  references?: string[];
}

export interface SecurityAuditStats {
  filesScanned: number;
  dependenciesChecked: number;
  totalVulnerabilities: number;
  bySeverity: Record<VulnerabilitySeverity, number>;
  byType: Record<VulnerabilityType, number>;
  scanDurationMs: number;
}

export interface SecurityAuditResult {
  projectType: string;
  vulnerabilities: Vulnerability[];
  stats: SecurityAuditStats;
  recommendations: string[];
}
