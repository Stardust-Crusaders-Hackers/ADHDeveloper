import { AgentDefinition } from "../types.js";
import { LanguageService } from "../languageService.js";

interface TimerTranslations {
  type: string;
  session: string;
  duration: string;
  minutes: string;
  goal: string;
  goalText: string;
  tip: string;
}

const focusTimerAgent: AgentDefinition = {
  name: "focus-timer",
  description: "Manages focus sessions (Pomodoro) adapted for ADHD.",
  keywords: ["focus", "timer", "pomodoro", "break", "time", "adhd", "concentration"],
  handler: async (context) => {
    const { query } = context;
    const lang = LanguageService.detectLanguage(query);
    
    // Default values
    let duration = 25;
    let type = "focus";

    if (query.includes("short") || query.includes("corto") || query.includes("court") || query.includes("curto") || query.includes("kurz")) duration = 5;
    if (query.includes("break") || query.includes("descanso") || query.includes("descans") || query.includes("pause") || query.includes("pausa") || query.includes("休息") || query.includes("休憩") || query.includes("перерыв")) type = "break";

    const translations: Record<string, TimerTranslations> = {
      en: { type: type === "focus" ? "Focus" : "Break", session: "Session Started", duration: "Duration", minutes: "minutes", goal: "Goal", goalText: "Avoid distractions and maintain flow.", tip: "Tip: Close unnecessary tabs before starting." },
      es: { type: type === "focus" ? "Enfoque" : "Descanso", session: "Sesión Iniciada", duration: "Duración", minutes: "minutos", goal: "Objetivo", goalText: "Evitar distracciones y mantener el flujo.", tip: "Tip: Cierra pestañas innecesarias antes de empezar." },
      ca: { type: type === "focus" ? "Enfocament" : "Descans", session: "Sessió Iniciada", duration: "Durada", minutes: "minuts", goal: "Objectiu", goalText: "Evitar distraccions i mantenir el flux.", tip: "Tip: Tanca pestanyes innecessàries abans de començar." },
      fr: { type: type === "focus" ? "Focus" : "Pause", session: "Session Démarrée", duration: "Durée", minutes: "minutes", goal: "Objectif", goalText: "Évitez les distractions et maintenez le flux.", tip: "Conseil : Fermez les onglets inutiles avant de commencer." },
      pt: { type: type === "focus" ? "Foco" : "Pausa", session: "Sessão Iniciada", duration: "Duração", minutes: "minutos", goal: "Objetivo", goalText: "Evite distrações e mantenha o fluxo.", tip: "Dica: Feche abas desnecessárias antes de começar." },
      de: { type: type === "focus" ? "Fokus" : "Pause", session: "Sitzung Gestartet", duration: "Dauer", minutes: "Minuten", goal: "Ziel", goalText: "Ablenkungen vermeiden und Fokus halten.", tip: "Tipp: Schließe unnötige Tabs vor dem Start." },
      zh: { type: type === "focus" ? "专注" : "休息", session: "会话已开始", duration: "持续时间", minutes: "分钟", goal: "目标", goalText: "避免分心，保持心流状态。", tip: "提示：开始前关闭不必要的标签页。" },
      ja: { type: type === "focus" ? "フォーカス" : "休憩", session: "セッション開始", duration: "所要時間", minutes: "分", goal: "目標", goalText: "気が散るのを避け、フローを維持しましょう。", tip: "ヒント：開始前に不要なタブを閉じましょう。" },
      ru: { type: type === "focus" ? "Фокус" : "Перерыв", session: "Сессия начата", duration: "Длительность", minutes: "минут", goal: "Цель", goalText: "Избегайте отвлекающих факторов и сохраняйте поток.", tip: "Совет: закройте ненужные вкладки перед началом." }
    };

    const t = LanguageService.translate<TimerTranslations>(lang, translations);

    const message = `🚀 **${t.type} ${t.session}**\n` +
                    `- **${t.duration}**: ${duration} ${t.minutes}\n` +
                    `- **${t.goal}**: ${t.goalText}\n\n` +
                    `*${t.tip}*`;

    return {
      success: true,
      message,
      data: {
        timer: { durationMinutes: duration, type: type, startTime: new Date().toISOString() },
        ui: { theme: type === "focus" ? "focus-mode" : "rest-mode", primaryColor: type === "focus" ? "#2196F3" : "#4CAF50", accentColor: type === "focus" ? "#1976D2" : "#388E3C" }
      }
    };
  },
};

export default focusTimerAgent;
