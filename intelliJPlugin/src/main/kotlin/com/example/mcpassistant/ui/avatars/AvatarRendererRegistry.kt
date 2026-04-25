package com.example.mcpassistant.ui.avatars

object AvatarRendererRegistry {
    private val renderers = mutableMapOf<String, AvatarRenderer>()

    init {
        // Register all built-in renderers at class-load time
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
        ).forEach { renderers[it.agentType] = it }
    }

    fun register(renderer: AvatarRenderer) {
        renderers[renderer.agentType] = renderer
    }

    fun get(agentType: String): AvatarRenderer {
        val renderer = renderers[agentType] ?: renderers["default"] ?: DefaultRobotRenderer()
        if (renderer.agentType != agentType && agentType != "default") {
            System.err.println("[ADHD] UI: No renderer for '$agentType', falling back to default.")
        }
        return renderer
    }

    fun all(): List<AvatarRenderer> = renderers.values.toList()
}
