import { AgentDefinition } from "../types.js";

const focusTimerAgent: AgentDefinition = {
  name: "focus-timer",
  description: "Helps manage focus sessions and breaks using ADHD-friendly time techniques (e.g., Pomodoro).",
  keywords: ["focus", "timer", "pomodoro", "break", "concentration", "time", "adhd", "session"],
  handler: async (context) => {
    return {
      success: true,
      message: `Focus timer agent received: "${context.query}". [Placeholder — implement timer logic here]`,
    };
  },
};

export default focusTimerAgent;
