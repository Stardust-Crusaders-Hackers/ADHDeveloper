package com.example.mcpassistant.ui.avatars

object AvatarRendererRegistry {
    private val renderers = mutableMapOf<String, AvatarRenderer>()

    fun register(renderer: AvatarRenderer) {
        renderers[renderer.agentType] = renderer
    }

    fun get(agentType: String): AvatarRenderer? = renderers[agentType]

    fun all(): List<AvatarRenderer> = renderers.values.toList()
}
