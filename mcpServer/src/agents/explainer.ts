import { AgentContext, AgentDefinition, AgentResult } from "../types.js";

type Lang = "es" | "en";

function detectLanguage(input: string): Lang {
  const lowered = input.toLowerCase();
  const spanishHints = [
    " que ", " los ", " las ", " el ", " la ", " un ", " una ", " de ", " y ",
    "agente", "codigo", "código", "sesion", "sesión", "explica", "explicar",
  ];
  const englishHints = [
    " the ", " and ", " with ", " for ", "what", "agent", "code", "session", "explain",
  ];

  const esScore = spanishHints.filter((hint) => lowered.includes(hint)).length;
  const enScore = englishHints.filter((hint) => lowered.includes(hint)).length;

  if (enScore > esScore) return "en";
  return "es";
}

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

function buildSpanish(agentWork: string, codeWork: string, queryFallback: string): string {
  if (!agentWork && !codeWork && !queryFallback) {
    return twoSentences(
      "No tengo contexto suficiente sobre actividad de agentes ni código completado",
      "Cuando llegue datos reales, prometo dejar de leer bolas de cristal del backlog"
    );
  }

  const first = agentWork && codeWork
    ? `Agentes están ${agentWork} y código completado fue ${codeWork}`
    : agentWork
      ? `Agentes ahora están ${agentWork}`
      : codeWork
        ? `Código completado en sesión fue ${codeWork}`
        : `Lo más claro que recibí para explicar fue ${queryFallback}`;

  return twoSentences(
    first,
    "Resumen en dos golpes para que se entienda rápido, porque nadie quiere arqueología en el chat"
  );
}

function buildEnglish(agentWork: string, codeWork: string, queryFallback: string): string {
  if (!agentWork && !codeWork && !queryFallback) {
    return twoSentences(
      "I lack enough context about agent activity and completed code",
      "Once real details show up, I will stop pretending the backlog is a fortune teller"
    );
  }

  const first = agentWork && codeWork
    ? `Agents are ${agentWork} and completed code was ${codeWork}`
    : agentWork
      ? `Agents are currently ${agentWork}`
      : codeWork
        ? `Completed code in this session was ${codeWork}`
        : `Best explainable signal I received was ${queryFallback}`;

  return twoSentences(
    first,
    "Two-line summary for fast recall, because nobody wants to excavate a chat log for one answer"
  );
}

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const metadata = ctx.metadata as Record<string, unknown> | undefined;

  const agentWork = pickFirstText(metadata, [
    "agentWork",
    "agentActions",
    "agentsDoing",
    "activitySummary",
    "agentSummary",
  ]);

  const codeWork = pickFirstText(metadata, [
    "codeSummary",
    "completedCode",
    "completedWork",
    "changesSummary",
    "implementationSummary",
  ]);

  const queryFallback = sanitizeSnippet(ctx.query, 120);
  const lang = detectLanguage(`${ctx.query} ${agentWork} ${codeWork}`);

  const message = lang === "en"
    ? buildEnglish(agentWork, codeWork, queryFallback)
    : buildSpanish(agentWork, codeWork, queryFallback);

  return {
    success: true,
    message,
    data: {
      language: lang,
      format: "two-sentences",
      humor: "light-sarcastic",
      used: {
        agentWork: Boolean(agentWork),
        codeWork: Boolean(codeWork),
        queryFallback: Boolean(queryFallback),
      },
    },
  };
}

const explainerAgent: AgentDefinition = {
  name: "explainer",
  description:
    "Explica actividad de agentes o código completado en sesión en exactamente dos frases con cierre humorístico breve.",
  keywords: [
    "explain",
    "explainer",
    "summary",
    "summarize",
    "resume",
    "resumen",
    "explica",
    "explicar",
    "agents",
    "codigo",
    "código",
    "session",
    "sesion",
    "sesión",
  ],
  handler,
};

export default explainerAgent;
