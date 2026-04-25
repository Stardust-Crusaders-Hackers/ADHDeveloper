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
        ).forEach { renderers[it.agentType] = it }
    }

    fun register(renderer: AvatarRenderer) {
        renderers[renderer.agentType] = renderer
    }

    fun get(agentType: String): AvatarRenderer? = renderers[agentType] ?: renderers["default"]

    fun all(): List<AvatarRenderer> = renderers.values.toList()
}
