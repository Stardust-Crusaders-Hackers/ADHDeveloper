export interface AgentContext {
  query: string;
  metadata?: Record<string, unknown>;
}

export interface FlowStepSummary {
  agentName: string;
  success: boolean;
  messageExcerpt: string;
}

export interface ExecuteAgentFlowData {
  flowId: string;
  completed: boolean;
  implicit: boolean;
  participants: string[];
  steps: FlowStepSummary[];
  explainer?: AgentResult;
}

export interface AgentResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown> & {
    flow?: ExecuteAgentFlowData;
  };
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
