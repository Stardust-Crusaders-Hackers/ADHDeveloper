import { AgentDefinition } from "../types.js";
import { LanguageService } from "../languageService.js";

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

    if (query.includes("short") || query.includes("corto")) duration = 5;
    if (query.includes("break") || query.includes("descanso")) type = "break";

    const translations = {
      en: {
        type: type === "focus" ? "Focus" : "Break",
        session: "Session Started",
        duration: "Duration",
        minutes: "minutes",
        goal: "Goal",
        goalText: "Avoid distractions and maintain flow.",
        tip: "Tip: Close unnecessary tabs before starting."
      },
      es: {
        type: type === "focus" ? "Enfoque" : "Descanso",
        session: "Sesión Iniciada",
        duration: "Duración",
        minutes: "minutos",
        goal: "Objetivo",
        goalText: "Evitar distracciones y mantener el flujo.",
        tip: "Tip: Cierra pestañas innecesarias antes de empezar."
      }
    };

    const t = LanguageService.translate(lang, translations);

    const message = `🚀 **${t.type} ${t.session}**\n` +
                    `- **${t.duration}**: ${duration} ${t.minutes}\n` +
                    `- **${t.goal}**: ${t.goalText}\n\n` +
                    `*${t.tip}*`;

    return {
      success: true,
      message,
      data: {
        timer: {
          durationMinutes: duration,
          type: type,
          startTime: new Date().toISOString()
        },
        ui: {
          theme: type === "focus" ? "focus-mode" : "rest-mode",
          primaryColor: type === "focus" ? "#2196F3" : "#4CAF50",
          accentColor: type === "focus" ? "#1976D2" : "#388E3C"
        }
      }
    };
  },
};

export default focusTimerAgent;
