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
  "Project/Repository name?",
  "What is the project vision (1-2 sentences)?",
  "Which stack(s) do you want to use? (Node, Python, Java, Go, Kotlin, PHP, Ruby, Rust, C, C++, .NET Core...)",
  "Desired architecture? (monolith, modular, hexagonal, microservices)",
  "Dockerize from the start? (yes/no)",
  "Include base Nginx/reverse proxy config? (yes/no)",
  "Add CI/CD base? (yes/no)",
  "Conflict policy? (no-overwrite, overwrite, prompt)",
];

const repoInitializerAgent: AgentDefinition = {
  name: "repo-initializer",
  description: "Initializes repos/projects with guided requirement discovery and multi-stack technical bootstrap.",
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
          `Missing information for real bootstrap. Missing fields: ${missing.join(", ")}.\n\n` +
          `Recommended discovery questions:\n- ${DISCOVERY_QUESTIONS.join("\n- ")}\n\n` +
          "Once you have answers, execute tool `repo_bootstrap` with absolute projectPath and complete config.",
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
        "Discovery complete. Ready for real bootstrap.\n" +
        "Next step: execute `repo_bootstrap` with this config and absolute projectPath.",
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
