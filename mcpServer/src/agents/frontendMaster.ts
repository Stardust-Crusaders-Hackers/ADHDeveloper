import { AgentDefinition } from "../types.js";

/**
 * Frontend Master Agent
 * Specialist in interface architecture, UX, and radical visual transformations.
 */
const frontendMasterAgent: AgentDefinition = {
  name: "frontend-master",
  description: "Specialist in interface architecture and user experience. Orchestrates radical visual transformations and persistent design systems.",
  keywords: [
    "ui", "ux", "frontend", "css", "react", "design", "accessibility", 
    "animation", "responsive", "styles", "aria", "refactor", "visual", 
    "interface", "component", "tailwind", "sass", "less", "motion"
  ],

  handler: async (ctx) => {
    const { query } = ctx;

    ctx.emit?.({
      presentationId: `pres-fe-master-${Date.now()}`,
      agentId: "frontend-master",
      agentName: "Frontend Master",
      agentType: "frontend-master",
      text: `Analyzing visual requirements for: "${query}"`,
    });

    const plan = `
# 🎨 Frontend Master Audit & Strategy

## 🎯 Objective: "${query}"

## 🚀 Architectural Directives
1. **Master Pattern Search**: Verifying design guides in repository (\`design-system/\`, \`GEMINI.md\`).
2. **Bold Aesthetic Choice**: Evading "AI Slop". Proposing paradigms like Geometric Brutalism or Editorial Minimalism.
3. **Visual Choreography**:
   - **Typography**: Implementation of \`clamp()\` for fluidity and bold type pairs.
   - **Atmosphere**: Using grain textures, gradient meshes, and \`backdrop-filter\`.
   - **Movement**: Organic micro-interactions via pure CSS and \`cubic-bezier\`.
   - **Asymmetry**: Layouts that break the monotonous grid.

## 🛠️ Execution Steps
1. **Audit**: Scanning \`package.json\` and style configurations (Tailwind/Sass).
2. **Refactor**: Transforming raw components into high-fidelity artifacts.
3. **Validation**: ARIA accessibility audit and perceptual latency < 100ms.

*Note: All creations will avoid generic system fonts and boring static structures.*
    `.trim();

    return {
      success: true,
      message: plan,
      data: { query, role: "Frontend Master" },
    };
  },
};

export default frontendMasterAgent;
