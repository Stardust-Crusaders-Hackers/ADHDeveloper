import { AgentDefinition } from "../types.js";

const focusTimerAgent: AgentDefinition = {
  name: "focus-timer",
  description: "Gestiona sesiones de enfoque (Pomodoro) adaptadas para TDAH.",
  keywords: ["focus", "timer", "pomodoro", "break", "time", "adhd", "concentracion"],
  handler: async (context) => {
    const { query } = context;
    
    // Default values
    let duration = 25;
    let type = "focus";

    if (query.includes("corto") || query.includes("short")) duration = 5;
    if (query.includes("descanso") || query.includes("break")) type = "break";

    const response = {
      message: `🚀 **Sesión de ${type === "focus" ? "Enfoque" : "Descanso"} Iniciada**\n` +
               `- **Duración**: ${duration} minutos\n` +
               `- **Objetivo**: Evitar distracciones y mantener el flujo.\n\n` +
               `*Tip: Elimina pestañas innecesarias antes de empezar.*`,
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

    return {
      success: true,
      ...response
    };
  },
};

export default focusTimerAgent;
