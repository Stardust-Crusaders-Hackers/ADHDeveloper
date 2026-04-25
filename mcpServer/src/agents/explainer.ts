import { AgentContext, AgentDefinition, AgentResult } from "../types.js";
import { LanguageService } from "../languageService.js";

type FlowStepInput = {
  agentName: string;
  success: boolean;
  messageExcerpt: string;
};

function sanitizeSnippet(value: unknown, maxLength = 140): string {
  if (typeof value !== "string") return "";
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";

  const noTerminators = compact
    .replace(/\.\s+/g, ", ")
    .replace(/[!?]+/g, ",")
    .replace(/,+/g, ",")
    .replace(/^,\s*|\s*,\s*$/g, "");

  return noTerminators.slice(0, maxLength).trim().replace(/[,;:\-]+$/g, "").trim();
}

function pickFirstText(metadata: Record<string, unknown> | undefined, keys: string[]): string {
  if (!metadata) return "";
  for (const key of keys) {
    const value = sanitizeSnippet(metadata[key]);
    if (value) return value;
  }
  return "";
}

function twoSentences(first: string, second: string): string {
  const a = first.trim().replace(/[.!?]+$/g, "");
  const b = second.trim().replace(/[.!?]+$/g, "");
  return `${a}. ${b}.`;
}

function parseFlowSteps(metadata: Record<string, unknown> | undefined): FlowStepInput[] {
  if (!metadata || !Array.isArray(metadata.flowSteps)) return [];
  return metadata.flowSteps
    .map((raw): FlowStepInput | null => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const agentName = typeof row.agentName === "string" ? row.agentName.trim() : "";
      if (!agentName) return null;
      return {
        agentName,
        success: row.success !== false,
        messageExcerpt: sanitizeSnippet(row.messageExcerpt, 180),
      };
    })
    .filter((row): row is FlowStepInput => row !== null);
}

function parseFlowParticipants(metadata: Record<string, unknown> | undefined, steps: FlowStepInput[]): string[] {
  if (metadata && Array.isArray(metadata.flowParticipants)) {
    const normalized = metadata.flowParticipants
      .map((name) => (typeof name === "string" ? name.trim() : ""))
      .filter(Boolean);
    if (normalized.length > 0) return normalized;
  }

  const seen = new Set<string>();
  const participants: string[] = [];
  for (const step of steps) {
    if (seen.has(step.agentName)) continue;
    seen.add(step.agentName);
    participants.push(step.agentName);
  }
  return participants;
}

function toFlowSummaryLine(lang: "en" | "es", agentName: string, steps: FlowStepInput[]): [string, string] {
  const total = steps.length;
  const failed = steps.filter((step) => !step.success).length;
  const latest = steps[steps.length - 1];
  
  const excerpt = latest?.messageExcerpt || (lang === "en" ? "No output details were captured" : "No se capturaron detalles de salida");
  const health = failed === 0
    ? (lang === "en" ? "completed without failures" : "terminó sin fallos")
    : (lang === "en" ? `${failed} failed step(s)` : `${failed} paso(s) fallido(s)`);

  if (lang === "en") {
    return [
      `${agentName}: ${total} step(s), ${health}.`,
      `${agentName} output: ${excerpt}.`,
    ];
  }

  return [
    `${agentName}: ${total} paso(s), ${health}.`,
    `Salida de ${agentName}: ${excerpt}.`,
  ];
}

function buildFlowSummary(lang: "en" | "es", participants: string[], steps: FlowStepInput[]): string {
  const header = lang === "en" ? "Final flow summary by agent:" : "Resumen final del flujo por agente:";
  const blocks: string[] = [header];

  for (const participant of participants) {
    const agentSteps = steps.filter((step) => step.agentName === participant);
    const [line1, line2] = toFlowSummaryLine(lang, participant, agentSteps);
    blocks.push(`${line1}\n${line2}`);
  }

  if (participants.length === 0) {
    blocks.push(
      lang === "en"
        ? "No prior agents were recorded before explainer."
        : "No se registraron agentes previos antes de explainer."
    );
  }

  return blocks.join("\n\n");
}

function buildMessage(lang: "en" | "es", agentWork: string, codeWork: string, queryFallback: string): string {
  if (!agentWork && !codeWork && !queryFallback) {
    return lang === "en" 
      ? twoSentences("I lack enough context about agent activity and completed code", "Once real details show up, I will stop pretending the backlog is a fortune teller")
      : twoSentences("No tengo contexto suficiente sobre actividad de agentes ni código completado", "Cuando lleguen datos reales, prometo dejar de leer bolas de cristal del backlog");
  }

  const first = lang === "en"
    ? (agentWork && codeWork ? `Agents are ${agentWork} and completed code was ${codeWork}` : agentWork ? `Agents are currently ${agentWork}` : codeWork ? `Completed code in this session was ${codeWork}` : `Best explainable signal I received was ${queryFallback}`)
    : (agentWork && codeWork ? `Agentes están ${agentWork} y código completado fue ${codeWork}` : agentWork ? `Agentes ahora están ${agentWork}` : codeWork ? `Código completado en sesión fue ${codeWork}` : `Lo más claro que recibí para explicar fue ${queryFallback}`);

  const second = lang === "en"
    ? "Two-line summary for fast recall, because nobody wants to excavate a chat log for one answer"
    : "Resumen en dos golpes para que se entienda rápido, porque nadie quiere arqueología en el chat";

  return twoSentences(first, second);
}

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const metadata = ctx.metadata as Record<string, unknown> | undefined;
  const flowSteps = parseFlowSteps(metadata);
  const flowParticipants = parseFlowParticipants(metadata, flowSteps);

  const agentWork = pickFirstText(metadata, ["agentWork", "agentActions", "agentsDoing", "activitySummary", "agentSummary"]);
  const codeWork = pickFirstText(metadata, ["codeSummary", "completedCode", "completedWork", "changesSummary", "implementationSummary"]);
  const queryFallback = sanitizeSnippet(ctx.query, 120);

  const lang = LanguageService.detectLanguage(`${ctx.query} ${agentWork} ${codeWork} ${flowParticipants.join(" ")}`);

  if (flowSteps.length > 0 || flowParticipants.length > 0) {
    const message = buildFlowSummary(lang, flowParticipants, flowSteps);
    return {
      success: true,
      message,
      data: { language: lang, format: "flow-summary", participants: flowParticipants, stepsCount: flowSteps.length },
    };
  }

  const message = buildMessage(lang, agentWork, codeWork, queryFallback);

  return {
    success: true,
    message,
    data: { language: lang, format: "two-sentences", humor: "light-sarcastic", used: { agentWork: Boolean(agentWork), codeWork: Boolean(codeWork), queryFallback: Boolean(queryFallback) } },
  };
}

const explainerAgent: AgentDefinition = {
  name: "explainer",
  description: "Summarizes multi-agent workflows by participant and maintains a two-sentence mode when no flow context is available.",
  keywords: ["explain", "explainer", "summary", "summarize", "resume", "agents", "code", "session"],
  handler,
};

export default explainerAgent;
