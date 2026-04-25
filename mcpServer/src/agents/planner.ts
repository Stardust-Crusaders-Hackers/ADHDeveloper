import { AgentDefinition } from "../types.js";

/**
 * Planner Agent
 * Follows a Brainstorm -> Analyze -> Plan flow for ADHD-friendly development.
 */
const plannerAgent: AgentDefinition = {
  name: "planner",
  description: "Crea planes de desarrollo concisos mediante brainstorming y análisis de archivos.",
  keywords: ["plan", "planning", "brainstorm", "roadmap", "feature", "strategy"],
  handler: async (context) => {
    const { query, metadata } = context;
    const files = (metadata?.files as string[]) || [];

    // Simple heuristic for "relevant files" if none provided
    const relevantSuggestions = [];
    if (query.toLowerCase().includes("agent")) relevantSuggestions.push("src/agents/", "src/registry/");
    if (query.toLowerCase().includes("mcp")) relevantSuggestions.push("package.json", "src/index.ts");
    if (query.toLowerCase().includes("ui") || query.toLowerCase().includes("plugin")) relevantSuggestions.push("intelliJPlugin/");

    const analysis = files.length > 0 
      ? files.map(f => `- **${f}**: Detectado punto de extensión para la feature.`).join('\n')
      : relevantSuggestions.length > 0
        ? `Sugerencias para análisis inicial:\n${relevantSuggestions.map(s => `- \`${s}\``).join('\n')}`
        : '- No se detectaron archivos ni sugerencias automáticas.';

    const plan = `
# 🧠 Brainstorming para: "${query}"
1. **MVP (Rápido)**: Implementar la lógica mínima en un solo archivo.
2. **Estructurado**: Seguir el patrón de la arquitectura actual.
3. **Escalable**: Preparar para futuras integraciones.

# 📂 Análisis del Contexto
${analysis}

# 🚀 Plan de Acción Conciso
1. **Fase 1**: Identificar archivos "ancla" y puntos de inserción.
2. **Fase 2**: Implementar prototipo funcional sin dependencias externas.
3. **Fase 3**: Integrar con el resto del sistema.
4. **Fase 4**: Validación visual y funcional.
    `.trim();

    return {
      success: true,
      message: plan,
    };
  },
};

export default plannerAgent;
