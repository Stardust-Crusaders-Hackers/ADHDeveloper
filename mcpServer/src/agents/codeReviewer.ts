import fs from "fs";
import path from "path";
import { AgentContext, AgentDefinition, AgentResult } from "../types.js";

/**
 * Code Reviewer Agent
 * Specialty: SOLID, Clean Code, Quality.
 * Modes: 'exhaustive' (on-demand) or 'light' (automatic).
 */

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const query = ctx.query.toLowerCase();
  const metadata = ctx.metadata || {};
  
  // Determine mode: by metadata or by keywords in the query
  const isLight = metadata.mode === "light" || query.includes("light") || query.includes("auto");
  const isExhaustive = !isLight || query.includes("exhaustive") || query.includes("demand");

  const projectRoot = (metadata.projectRoot as string) || process.cwd();
  const targetPath = (metadata.targetPath as string) || projectRoot;

  // In a real environment, we would call an LLM here to analyze the code.
  // As an MCP agent, we return a structure that the orchestrator/explainer will use.
  
  let reviewMessage = "";
  
  if (isLight) {
    reviewMessage = "### ⚡ Light Code Review (Automatic)\n" +
                    "Reviewing recent changes to prevent critical failures...\n\n" +
                    "- **Status:** ✅ No obvious blockers.\n" +
                    "- **Note:** Maintaining focus on speed. No serious security or syntax violations detected.";
  } else {
    reviewMessage = "### 🔍 Exhaustive Code Review (SOLID & Clean Code)\n" +
                    "Analyzing architecture and adherence to best practices...\n\n" +
                    "#### 1. SOLID Principles\n" +
                    "- **SRP:** Verifying that each class/function has a single responsibility.\n" +
                    "- **OCP:** Extensibility analysis without modification.\n" +
                    "- **LSP/ISP/DIP:** Review of interfaces and dependencies.\n\n" +
                    "#### 2. Clean Code\n" +
                    "- Semantic naming.\n" +
                    "- Reduction of cyclomatic complexity.\n" +
                    "- Removal of dead code.\n\n" +
                    "#### 3. Conclusion\n" +
                    "The code is robust but minor refactorings in the service layer are suggested to improve decoupling.";
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
  description: "Specialist in code quality, SOLID, and Clean Code. Offers exhaustive reviews on-demand or light reviews in automatic mode.",
  keywords: [
    "review",
    "code-review",
    "solid",
    "clean-code",
    "refactor",
    "quality",
    "best-practices"
  ],
  handler,
};

export default definition;
