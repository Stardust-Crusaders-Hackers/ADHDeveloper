import { AgentDefinition } from "../types.js";

/**
 * Mood Agent
 * Detects user emotional state and suggests UI adjustments for ADHD support.
 */
const moodAgent: AgentDefinition = {
  name: "mood-detector",
  description: "Detecta sobrecarga cognitiva o frustración y ajusta el entorno.",
  keywords: ["overwhelmed", "stressed", "frustrated", "tired", "anxious", "overload", "mood", "feeling"],
  handler: async (context) => {
    const { query } = context;
    const q = query.toLowerCase();

    let mood = "neutral";
    let suggestion = "Mantén el ritmo actual.";
    let theme = "standard";

    if (q.includes("overwhelmed") || q.includes("agobiado") || q.includes("too much")) {
      mood = "overwhelmed";
      suggestion = "Respiración profunda. Vamos a desglosar esto en 3 tareas ultra-simples.";
      theme = "calm-blue";
    } else if (q.includes("stuck") || q.includes("bloqueado") || q.includes("frustrated")) {
      mood = "stuck";
      suggestion = "Cambio de aires. ¿Qué tal un descanso de 5 minutos o cambiar de archivo?";
      theme = "energy-yellow";
    }

    return {
      success: true,
      message: `🎨 **Modo ${mood.toUpperCase()} activado**\n${suggestion}`,
      data: {
        mood,
        ui: {
          theme,
          suggestActions: ["break", "simplify", "delegate"]
        }
      }
    };
  },
};

export default moodAgent;
