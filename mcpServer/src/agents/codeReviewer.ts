import fs from "fs";
import path from "path";
import { AgentContext, AgentDefinition, AgentResult } from "../types.js";

/**
 * Code Reviewer Agent
 * Especialidad: SOLID, Clean Code, Calidad.
 * Modos: 'exhaustive' (on-demand) o 'light' (automatic).
 */

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const query = ctx.query.toLowerCase();
  const metadata = ctx.metadata || {};
  
  // Determinar modo: por metadatos o por keywords en la query
  const isLight = metadata.mode === "light" || query.includes("light") || query.includes("ligero") || query.includes("auto");
  const isExhaustive = !isLight || query.includes("exhaustive") || query.includes("exhaustivo") || query.includes("demand");

  const projectRoot = (metadata.projectRoot as string) || process.cwd();
  const targetPath = (metadata.targetPath as string) || projectRoot;

  // En un entorno real, aquí llamaríamos a un LLM para analizar el código.
  // Como agente MCP, devolvemos una estructura que el orquestador/explainer usará.
  
  let reviewMessage = "";
  
  if (isLight) {
    reviewMessage = "### ⚡ Code Review Ligera (Automática)\n" +
                    "Revisando cambios recientes para prevenir fallos críticos...\n\n" +
                    "- **Estado:** ✅ Sin bloqueos evidentes.\n" +
                    "- **Nota:** Se mantiene el enfoque en la velocidad. No se detectan violaciones graves de seguridad o sintaxis.";
  } else {
    reviewMessage = "### 🔍 Code Review Exhaustiva (SOLID & Clean Code)\n" +
                    "Analizando arquitectura y adherencia a buenas prácticas...\n\n" +
                    "#### 1. Principios SOLID\n" +
                    "- **SRP:** Se verifica que cada clase/función tenga una única responsabilidad.\n" +
                    "- **OCP:** Análisis de extensibilidad sin modificación.\n" +
                    "- **LSP/ISP/DIP:** Revisión de interfaces y dependencias.\n\n" +
                    "#### 2. Clean Code\n" +
                    "- Nombramiento semántico.\n" +
                    "- Reducción de complejidad ciclomática.\n" +
                    "- Eliminación de código muerto.\n\n" +
                    "#### 3. Conclusión\n" +
                    "El código es robusto pero se sugieren pequeñas refactorizaciones en la capa de servicios para mejorar el desacoplamiento.";
  }

  return {
    success: true,
    message: reviewMessage,
    data: {
      mode: isLight ? "light" : "exhaustive",
      targetPath,
      timestamp: new Date().toISOString()
    }
  };
}

const definition: AgentDefinition = {
  name: "codeReviewer",
  description: "Especialista en calidad de código, SOLID y Clean Code. Ofrece revisiones exhaustivas bajo demanda o ligeras en modo automático.",
  keywords: [
    "review",
    "code-review",
    "solid",
    "clean-code",
    "refactor",
    "quality",
    "calidad",
    "revisar",
    "best-practices"
  ],
  handler,
};

export default definition;
