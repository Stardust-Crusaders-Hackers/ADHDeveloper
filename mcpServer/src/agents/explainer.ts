import { AgentContext, AgentDefinition, AgentResult } from "../types.js";
import { Language, LanguageService } from "../languageService.js";

type FlowStepInput = {
  agentName: string;
  success: boolean;
  messageExcerpt: string;
  originalSteps?: number;
};

function stripMarkdown(text: string): string {
  return text
    .replace(/[*#_`~>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeSnippet(value: unknown, maxLength = 140): string {
  if (typeof value !== "string") return "";
  const compact = stripMarkdown(value.replace(/\s+/g, " ").trim());
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

function pickTemplate<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function toSarcasticBlock(lang: Language, agentName: string, steps: FlowStepInput[]): string {
  const total = steps.reduce((sum, s) => sum + (s.originalSteps ?? 1), 0);
  const failedSteps = steps.filter((s) => !s.success);
  const failedCount = failedSteps.reduce((sum, s) => sum + (s.originalSteps ?? 1), 0);

  const excerpts = steps
    .map((s) => s.messageExcerpt)
    .filter((e) => e && e.length > 8)
    .slice(0, 4);

  const primary = excerpts[0] || "something deeply unclear";
  const secondary = excerpts[1] || null;
  const tertiary = excerpts[2] || null;

  const activitySummary = [primary, secondary, tertiary]
    .filter(Boolean)
    .join("; then ");

  const seed = agentName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  if (lang === "es") {
    if (failedCount > 0) {
      const templates = [
        `${agentName} intentó ${total} paso(s) y se estrelló en ${failedCount}. Sus mayores logros fueron: "${activitySummary}". Un masterclass de caos controlado.`,
        `${agentName} se puso muy serio con ${total} paso(s), pero ${failedCount} le dijeron que no. Todo empezó tan bien con "${primary}"${secondary ? ` y luego vino "${secondary}"` : ""}, y aun así. Impresionante.`,
        `${agentName} falló ${failedCount} de ${total} paso(s). La narrativa heroica fue: "${activitySummary}". Al menos tiene una buena historia que contar.`,
      ];
      return pickTemplate(templates, seed);
    } else {
      const templates = [
        `${agentName} completó ${total} paso(s) sin drama visible. Se dedicó a "${activitySummary}". El estándar mínimo: alcanzado. Los aplausos: escasos.`,
        `${agentName} hizo ${total} paso(s) y no rompió nada. La odisea incluyó "${primary}"${secondary ? ` y, en un giro inesperado, "${secondary}"` : ""}. Qué emocionante debe ser su vida.`,
        `${total} paso(s), todo en verde para ${agentName}. Sus grandes gestas: "${activitySummary}". Merece una palmadita en la espalda y una siesta.`,
      ];
      return pickTemplate(templates, seed);
    }
  }

  if (failedCount > 0) {
    const templates = [
      `${agentName} tackled ${total} step(s) and dramatically botched ${failedCount}. The scene of the crime: "${activitySummary}". A tragedy in ${total} acts.`,
      `${agentName} ran ${total} step(s). ${failedCount} of them said "no thanks." It started so promisingly with "${primary}"${secondary ? `, pivoted confidently to "${secondary}"` : ""}, and still somehow fell apart.`,
      `${failedCount} failures out of ${total} steps for ${agentName}. The highlight reel: "${activitySummary}". Bold strategy. Needs work.`,
    ];
    return pickTemplate(templates, seed);
  } else {
    const templates = [
      `${agentName} completed ${total} step(s) without incident. The thrilling saga included "${activitySummary}". Achievement unlocked: did the job. Bar not exactly raised.`,
      `${agentName} ran ${total} step(s), all green. It wrestled with "${primary}"${secondary ? `, then pivoted to "${secondary}"` : ""}${tertiary ? `, and somehow also "${tertiary}"` : ""}. A rollercoaster for someone who's never been on a rollercoaster.`,
      `${total} steps, zero disasters for ${agentName}. Core contributions: "${activitySummary}". Someone clearly needed their morning coffee to pull this off.`,
    ];
    return pickTemplate(templates, seed);
  }
}

function buildFlowSummary(lang: Language, participants: string[], steps: FlowStepInput[]): string {
  const headers: Record<string, string> = {
    en: "Your agents worked. Here's what actually happened, stripped of all dignity:",
    es: "Tus agentes hicieron cosas. Aqui va la version sin filtros ni protocolo:",
  };

  const noWork: Record<string, string> = {
    en: "Nobody did anything. This is either peak efficiency or a complete disaster. Hard to tell.",
    es: "Nadie movio un dedo. Pico de eficiencia o catastrofe total. Dificil saberlo.",
  };

  const header = LanguageService.translate(lang, headers);
  const blocks: string[] = [header];

  for (const participant of participants) {
    const agentSteps = steps.filter((step) => step.agentName === participant);
    blocks.push(toSarcasticBlock(lang, participant, agentSteps));
  }

  if (participants.length === 0) {
    blocks.push(LanguageService.translate(lang, noWork));
  }

  return stripMarkdown(blocks.join("\n\n"));
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

  const fallbacks: Record<string, string> = {
    en: "No session data found. Either nothing happened or something went very wrong before I got here. My money is on the latter.",
    es: "Sin datos de sesion. O no paso nada o algo salio muy mal antes de que yo llegara. Me juego algo a lo segundo.",
  };

  return {
    success: true,
    message: LanguageService.translate(lang, fallbacks),
    data: { language: lang, format: "fallback", humor: "sarcastic" },
  };
}

const explainerAgent: AgentDefinition = {
  name: "explainer",
  description: "Summarizes multi-agent workflows with sarcastic wit, referencing actual session content. Plain text only.",
  keywords: ["explain", "explainer", "summary", "summarize", "resume"],
  handler,
};

export default explainerAgent;
