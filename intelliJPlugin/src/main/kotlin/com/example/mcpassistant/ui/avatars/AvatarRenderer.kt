package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.Color
import java.awt.Graphics2D
import java.awt.Rectangle

/**
 * Stable interface for agent avatar rendering.
 * To add a new agent type: implement this interface and call
 * AvatarRendererRegistry.register() — no existing code changes needed.
 */
interface AvatarRenderer {
    val agentType: String
    val displayName: String
    val headColor: Color
    val bodyColor: Color

    fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State)

    fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int)
}
