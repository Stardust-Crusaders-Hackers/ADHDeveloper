import { AgentContext, AgentDefinition, AgentResult } from "../types.js";
import { Language, LanguageService } from "../languageService.js";

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

function toFlowSummaryLine(lang: Language, agentName: string, steps: FlowStepInput[]): [string, string] {
  const total = steps.length;
  const failed = steps.filter((step) => !step.success).length;
  const latest = steps[steps.length - 1];

  const translations: any = {
    en: { noOutput: "No output details were captured", completed: "completed without failures", failed: `${failed} failed step(s)`, output: "output" },
    es: { noOutput: "No se capturaron detalles de salida", completed: "terminó sin fallos", failed: `${failed} paso(s) fallido(s)`, output: "Salida de" },
    ca: { noOutput: "No s'han capturat detalls de sortida", completed: "ha acabat sense errors", failed: `${failed} pas(sos) fallit(s)`, output: "Sortida de" },
    fr: { noOutput: "Aucun détail de sortie n'a été capturé", completed: "terminé sans échec", failed: `${failed} étape(s) échouée(s)`, output: "Sortie de" },
    pt: { noOutput: "Nenhum detalhe de saída foi capturado", completed: "concluído sem falhas", failed: `${failed} etapa(s) com falha`, output: "Saída de" },
    de: { noOutput: "Keine Ausgabedetails erfasst", completed: "ohne Fehler abgeschlossen", failed: `${failed} fehlgeschlagene Schritte`, output: "Ausgabe von" },
    zh: { noOutput: "未捕获输出详细信息", completed: "完成，无故障", failed: `${failed} 个步骤失败`, output: "输出" },
    ja: { noOutput: "出力の詳細は取得されませんでした", completed: "失敗なく完了しました", failed: `${failed} 個のステップが失敗しました`, output: "の出力" },
    ru: { noOutput: "Детали вывода не были захвачены", completed: "завершено без сбоев", failed: `${failed} шагов завершились сбоем`, output: "Вывод" }
  };

  const t = LanguageService.translate(lang, translations) as any;
  const excerpt = latest?.messageExcerpt || t.noOutput;
  const health = failed === 0 ? t.completed : t.failed;

  if (lang === "zh" || lang === "ja") {
    return [
      `${agentName}: ${total} ${lang === "zh" ? "步" : "ステップ"}, ${health}。`,
      `${agentName}${t.output}: ${excerpt}。`,
    ];
  }

  return [
    `${agentName}: ${total} ${lang === "en" ? "step(s)" : lang === "fr" ? "étape(s)" : "paso(s)"}, ${health}.`,
    `${t.output} ${agentName}: ${excerpt}.`,
  ];
}

function buildFlowSummary(lang: Language, participants: string[], steps: FlowStepInput[]): string {
  const translations: any = {
    en: { header: "Final flow summary by agent:", noPrior: "No prior agents were recorded before explainer." },
    es: { header: "Resumen final del flujo por agente:", noPrior: "No se registraron agentes previos antes de explainer." },
    ca: { header: "Resum final del flux per agent:", noPrior: "No s'han registrat agents previs abans de l'explicador." },
    fr: { header: "Résumé final du flux par agent :", noPrior: "Aucun agent préalable n'a été enregistré avant l'explainer." },
    pt: { header: "Resumo final do fluxo por agente:", noPrior: "Nenhum agente anterior foi registrado antes do explicador." },
    de: { header: "Abschließende Zusammenfassung des Flows nach Agent:", noPrior: "Vor dem Explainer wurden keine vorherigen Agenten aufgezeichnet." },
    zh: { header: "各代理的最终流程摘要：", noPrior: "在解释器之前没有记录任何先前的代理。" },
    ja: { header: "エージェント別の最終フロー概要：", noPrior: "explainer の前に記録されたエージェントはありません。" },
    ru: { header: "Итоговая сводка потока по агентам:", noPrior: "До explainer не было записано ни одного агента." }
  };

  const t = LanguageService.translate(lang, translations) as any;
  const blocks: string[] = [t.header];

  for (const participant of participants) {
    const agentSteps = steps.filter((step) => step.agentName === participant);
    const [line1, line2] = toFlowSummaryLine(lang, participant, agentSteps);
    blocks.push(`${line1}\n${line2}`);
  }

  if (participants.length === 0) {
    blocks.push(t.noPrior);
  }

  return blocks.join("\n\n");
}

function buildMessage(lang: Language, agentWork: string, codeWork: string, queryFallback: string): string {
  const translations: any = {
    en: { noContext: "I lack enough context about agent activity and completed code", retry: "Once real details show up, I will stop pretending the backlog is a fortune teller", both: `Agents are ${agentWork} and completed code was ${codeWork}`, agents: `Agents are currently ${agentWork}`, code: `Completed code in this session was ${codeWork}`, fallback: `Best explainable signal I received was ${queryFallback}`, recall: "Two-line summary for fast recall, because nobody wants to excavate a chat log for one answer" },
    es: { noContext: "No tengo contexto suficiente sobre actividad de agentes ni código completado", retry: "Cuando lleguen datos reales, prometo dejar de leer bolas de cristal del backlog", both: `Agentes están ${agentWork} y código completado fue ${codeWork}`, agents: `Agentes ahora están ${agentWork}`, code: `Código completado en sesión fue ${codeWork}`, fallback: `Lo más claro que recibí para explicar fue ${queryFallback}`, recall: "Resumen en dos golpes para que se entienda rápido, porque nadie quiere arqueología en el chat" },
    ca: { noContext: "No tinc prou context sobre l'activitat dels agents ni el codi completat", retry: "Quan arribin dades reals, deixaré de fer de vident amb el backlog", both: `Els agents estan ${agentWork} i el codi completat ha estat ${codeWork}`, agents: `Els agents estan actualment ${agentWork}`, code: `El codi completat en aquesta sessió ha estat ${codeWork}`, fallback: `El millor senyal explicable que he rebut ha estat ${queryFallback}`, recall: "Resum de dues línies per a un recordatori ràpid, ningú vol fer arqueologia al xat" },
    fr: { noContext: "Je manque de contexte sur l'activité des agents et le code terminé", retry: "Une fois que les vrais détails apparaîtront, j'arrêterai de prétendre que le backlog est une boule de cristal", both: `Les agents sont ${agentWork} et le code terminé était ${codeWork}`, agents: `Les agents sont actuellement ${agentWork}`, code: `Le code terminé dans cette session était ${codeWork}`, fallback: `Le meilleur signal explicable que j'ai reçu était ${queryFallback}`, recall: "Résumé en deux lignes pour un rappel rapide, car personne ne veut fouiller les logs du chat" },
    pt: { noContext: "Falta-me contexto suficiente sobre a atividade dos agentes e o código concluído", retry: "Assim que surgirem detalhes reais, pararei de fingir que o backlog é uma bola de cristal", both: `Os agentes estão ${agentWork} e o código concluído foi ${codeWork}`, agents: `Os agentes estão atualmente ${agentWork}`, code: `O código concluído nesta sessão foi ${codeWork}`, fallback: `O melhor sinal explicável que recebi foi ${queryFallback}`, recall: "Resumo de duas linhas para recordação rápida, porque ninguém quer escavar um histórico de chat" },
    de: { noContext: "Mir fehlt der Kontext zur Agentenaktivität und zum fertigen Code", retry: "Sobald echte Details vorliegen, werde ich aufhören, so zu tun, als sei das Backlog eine Wahrsagerkugel", both: `Agenten sind ${agentWork} und der fertige Code war ${codeWork}`, agents: `Agenten sind zurzeit ${agentWork}`, code: `Der in dieser Sitzung fertiggestellte Code war ${codeWork}`, fallback: `Das beste Signal, das ich erhalten habe, war ${queryFallback}`, recall: "Zweizeilige Zusammenfassung für schnellen Abruf, niemand will Chat-Logs ausgraben" },
    zh: { noContext: "我缺乏关于代理活动和完成代码的足够上下文", retry: "一旦出现真实的细节，我将不再假装待办事项是算命先生", both: `代理正在 ${agentWork}，完成的代码是 ${codeWork}`, agents: `代理目前正在 ${agentWork}`, code: `本次会话中完成的代码是 ${codeWork}`, fallback: `我收到的最佳可解释信号是 ${queryFallback}`, recall: "两行摘要以便快速召回，因为没人想在聊天记录中进行考古" },
    ja: { noContext: "エージェントの活動と完了したコードに関するコンテキストが不足しています", retry: "実際の詳細が表示されたら、バックログが占い師であるふりをするのをやめます", both: `エージェントは ${agentWork} で、完了したコードは ${codeWork} でした`, agents: `エージェントは現在 ${agentWork} です`, code: `このセッションで完了したコードは ${codeWork} でした`, fallback: `受信した中で最も説明可能なシグナルは ${queryFallback} でした`, recall: "迅速に思い出すための 2 行の要約。チャット ログを発掘したい人はいません" },
    ru: { noContext: "Мне не хватает контекста об активности агентов и завершенном коде", retry: "Как только появятся реальные подробности, я перестану притворяться, что бэклог — это гадалка", both: `Агенты ${agentWork}, а завершенный код был ${codeWork}`, agents: `Агенты сейчас ${agentWork}`, code: `Завершенный код в этой сессии был ${codeWork}`, fallback: `Лучший объяснимый сигнал, который я получил, был ${queryFallback}`, recall: "Двухстрочное резюме для быстрого запоминания, потому что никто не хочет заниматься археологией в чате" }
  };

  const t = LanguageService.translate(lang, translations) as any;

  if (!agentWork && !codeWork && !queryFallback) {
    return twoSentences(t.noContext, t.retry);
  }

  const first = agentWork && codeWork ? t.both : agentWork ? t.agents : codeWork ? t.code : t.fallback;
  const second = t.recall;

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
