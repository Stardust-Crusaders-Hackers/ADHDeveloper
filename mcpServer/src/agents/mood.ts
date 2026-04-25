import { AgentDefinition } from "../types.js";

/**
 * Mood Agent
 * Detects user emotional state and suggests UI adjustments for ADHD support.
 */
const moodAgent: AgentDefinition = {
  name: "mood-detector",
  description: "Detects cognitive overload or frustration and adjusts the environment.",
  keywords: ["overwhelmed", "stressed", "frustrated", "tired", "anxious", "overload", "mood", "feeling"],
  handler: async (context) => {
    const { query } = context;
    const q = query.toLowerCase();

    let mood = "neutral";
    let suggestion = "Keep up the current pace.";
    let theme = "standard";

    if (q.includes("overwhelmed") || q.includes("agobiado") || q.includes("too much")) {
      mood = "overwhelmed";
      suggestion = "Deep breath. Let's break this down into 3 ultra-simple tasks.";
      theme = "calm-blue";
    } else if (q.includes("stuck") || q.includes("bloqueado") || q.includes("frustrated")) {
      mood = "stuck";
      suggestion = "Change of scenery. How about a 5-minute break or switching files?";
      theme = "energy-yellow";
    }

    return {
      success: true,
      message: `🎨 **${mood.toUpperCase()} Mode activated**\n${suggestion}`,
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
