import { AgentContext, AgentDefinition, AgentResult } from "../types.js";
import { Language, LanguageService } from "../languageService.js";

type FlowStepInput = {
  agentName: string;
  success: boolean;
  messageExcerpt: string;
  originalSteps?: number;
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

function parseFlowSteps(metadata: Record<string, unknown> | undefined): FlowStepInput[] {
  if (!metadata || !Array.isArray(metadata.flowSteps)) return [];
  return metadata.flowSteps
    .map((raw): FlowStepInput | null => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const agentName = typeof row.agentName === "string" ? row.agentName.trim() : "";
      if (!agentName) return null;
      const originalSteps = typeof row.originalSteps === "number" && Number(row.originalSteps) > 0 ? Math.floor(Number(row.originalSteps)) : 1;
      return {
        agentName,
        success: row.success !== false,
        messageExcerpt: sanitizeSnippet(row.messageExcerpt, 180),
        originalSteps,
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

function toSarcasticLine(lang: Language, agentName: string, steps: FlowStepInput[]): [string, string] {
  const total = steps.reduce((sum, s) => sum + (s.originalSteps ?? 1), 0);
  const failed = steps.reduce((sum, s) => sum + ((s.success ? 0 : (s.originalSteps ?? 1))), 0);
  const latest = steps[steps.length - 1];

  const translations: any = {
    en: {
      success: `${agentName} burned through ${total} step(s) and miraculously broke nothing.`,
      fail: `${agentName} heroically failed ${failed} simple task(s) out of ${total}.`,
      contribution: `Their big "contribution": "${latest?.messageExcerpt || "pure smoke"}". Groundbreaking.`
    },
    es: {
      success: `${agentName} desperdició ${total} paso(s) y milagrosamente no rompió nada.`,
      fail: `${agentName} fracasó estrepitosamente en ${failed} paso(s) básico(s) de ${total}.`,
      contribution: `Su gran "aporte": "${latest?.messageExcerpt || "humo puro"}". Un genio incomprendido.`
    }
  };

  const t = LanguageService.translate(lang, translations) as any;
  const health = failed === 0 ? t.success : t.fail;
  
  return [health, t.contribution];
}

function buildFlowSummary(lang: Language, participants: string[], steps: FlowStepInput[]): string {
  const translations: any = {
    en: { header: "The 'Explainer' is here to ruin your pride:", noPrior: "Nobody did anything. Peak efficiency." },
    es: { header: "El 'Explainer' sale al escenario a bajaros los humos:", noPrior: "Nadie ha movido un dedo. Gran ambiente laboral." }
  };

  const t = LanguageService.translate(lang, translations) as any;
  const blocks: string[] = [t.header];

  for (const participant of participants) {
    const agentSteps = steps.filter((step) => step.agentName === participant);
    const [line1, line2] = toSarcasticLine(lang, participant, agentSteps);
    blocks.push(`${line1}\n${line2}`);
  }

  if (participants.length === 0) {
    blocks.push(t.noPrior);
  }

  return blocks.join("\n\n");
}

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const metadata = ctx.metadata as Record<string, unknown> | undefined;
  const flowSteps = parseFlowSteps(metadata);
  const flowParticipants = parseFlowParticipants(metadata, flowSteps);
  const lang = LanguageService.detectLanguage(`${ctx.query} ${flowParticipants.join(" ")}`);

  if (flowSteps.length > 0 || flowParticipants.length > 0) {
    const message = buildFlowSummary(lang, flowParticipants, flowSteps);
    return {
      success: true,
      message,
      data: { language: lang, format: "flow-summary", humor: "sarcastic" },
    };
  }

  const fallback = lang === 'es' 
    ? "No tengo datos reales, así que me invento que todo va genial. Spoiler: No." 
    : "I lack real data, so I'm pretending everything is fine. Spoiler: It's not.";

  return {
    success: true,
    message: fallback,
    data: { language: lang, format: "fallback", humor: "sarcastic" },
  };
}

const explainerAgent: AgentDefinition = {
  name: "explainer",
  description: "Summarizes multi-agent workflows with a sarcastic tone and 2-line format.",
  keywords: ["explain", "explainer", "summary", "summarize", "resume"],
  handler,
};

export default explainerAgent;
