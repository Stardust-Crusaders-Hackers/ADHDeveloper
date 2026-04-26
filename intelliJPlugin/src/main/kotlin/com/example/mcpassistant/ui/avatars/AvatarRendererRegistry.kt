package com.example.mcpassistant.ui.avatars

object AvatarRendererRegistry {
    private val renderers = mutableMapOf<String, AvatarRenderer>()

    init {
        listOf(
            AssistantRenderer(),
            ClaudeRenderer(),
            CoderRenderer(),
            DefaultRobotRenderer(),
            OrchestratorRenderer(),
            ResearcherRenderer(),
            ReviewerRenderer(),
            TesterRenderer(),
            FrontendMasterRenderer(),
            CiCdRenderer(),
            CodeReviewerRenderer(),
            DatabaseExpertRenderer(),
            DebuggerRenderer(),
            DockerRenderer(),
            DocumenterRenderer(),
            ExplainerRenderer(),
            FocusTimerRenderer(),
            GitMaintainerRenderer(),
            KubernetesRenderer(),
            MoodDetectorRenderer(),
            PlannerRenderer(),
            RepoInitializerRenderer(),
            SecurityAuditorRenderer(),
            SmokeTesterRenderer(),
            SupermanRenderer(),
        ).forEach { renderers[it.agentType] = it }
    }

    fun register(renderer: AvatarRenderer) {
        renderers[renderer.agentType] = renderer
    }

    fun get(key: String): AvatarRenderer {
        return renderers[key] ?: renderers["default"] ?: DefaultRobotRenderer()
    }

    fun all(): List<AvatarRenderer> = renderers.values.toList()
}
