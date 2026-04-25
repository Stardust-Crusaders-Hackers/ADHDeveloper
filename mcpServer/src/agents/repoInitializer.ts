import { AgentDefinition } from "../types.js";

type Answers = {
  projectName?: string;
  vision?: string;
  stacks?: string[];
  architecture?: "monolith" | "modular" | "hexagonal" | "microservices";
  dockerize?: boolean;
  includeNginx?: boolean;
  ci?: boolean;
  overwritePolicy?: "no-overwrite" | "overwrite" | "prompt";
};

const DISCOVERY_QUESTIONS = [
  "¿Nombre del proyecto/repositorio?",
  "¿Cuál es la visión del proyecto (1-2 frases)?",
  "¿Qué stack(s) quieres usar? (Node, Python, Java, Go, Kotlin, PHP, Ruby, Rust, C, C++, .NET Core...)",
  "¿Arquitectura deseada? (monolith, modular, hexagonal, microservices)",
  "¿Dockerizar desde el inicio? (sí/no)",
  "¿Incluir configuración base de Nginx/reverse proxy? (sí/no)",
  "¿Agregar base de CI/CD? (sí/no)",
  "¿Política de conflictos? (no-overwrite, overwrite, prompt)",
];

const repoInitializerAgent: AgentDefinition = {
  name: "repo-initializer",
  description: "Inicializa repos/proyectos con discovery guiado de requisitos y bootstrap técnico multi-stack.",
  keywords: [
    "init",
    "initialize",
    "initializer",
    "bootstrap",
    "repository",
    "repo",
    "project",
    "scaffold",
    "docker",
    "nginx",
    "architecture",
    "stack",
  ],
  handler: async (context) => {
    const answers = (context.metadata?.answers as Answers | undefined) ?? {};
    const projectPath = context.metadata?.projectPath;

    const missing = [];
    if (!answers.projectName) missing.push("projectName");
    if (!answers.stacks || answers.stacks.length === 0) missing.push("stacks");
    if (!answers.architecture) missing.push("architecture");
    if (typeof answers.dockerize !== "boolean") missing.push("dockerize");
    if (typeof answers.includeNginx !== "boolean") missing.push("includeNginx");

    if (missing.length > 0) {
      return {
        success: true,
        message:
          `Falta información para bootstrap real. Campos faltantes: ${missing.join(", ")}.\n\n` +
          `Preguntas discovery recomendadas:\n- ${DISCOVERY_QUESTIONS.join("\n- ")}\n\n` +
          "Cuando tengas respuestas, ejecuta tool `repo_bootstrap` con projectPath absoluto y config completo.",
        data: {
          requiredFields: missing,
          discoveryQuestions: DISCOVERY_QUESTIONS,
          suggestedTool: "repo_bootstrap",
        },
      };
    }

    return {
      success: true,
      message:
        "Discovery completo. Listo para bootstrap real.\n" +
        "Siguiente paso: ejecutar `repo_bootstrap` con este config y projectPath absoluto.",
      data: {
        projectPath,
        config: {
          projectName: answers.projectName,
          vision: answers.vision ?? "",
          stacks: answers.stacks,
          architecture: answers.architecture,
          dockerize: answers.dockerize,
          includeNginx: answers.includeNginx,
          overwritePolicy: answers.overwritePolicy ?? "no-overwrite",
        },
      },
    };
  },
};

export default repoInitializerAgent;

