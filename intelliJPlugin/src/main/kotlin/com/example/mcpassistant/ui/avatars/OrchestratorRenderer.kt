package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*

class OrchestratorRenderer : AvatarRenderer {
    override val agentType = "orchestrator"
    override val displayName = "Orchestrator"
    override val headColor = Color(218, 165, 32)
    override val bodyColor = Color(184, 134, 11)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bodyX = bounds.x + bounds.width / 4
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width / 2
        val bodyH = bounds.height / 3
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)
        g2d.color = bodyColor.darker()
        g2d.drawRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)

        // Top hat above head
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val hatBrimX = headX - 3
        val hatBrimY = bounds.y - 5
        val hatTopX = headX + 4
        val hatTopY = bounds.y - 18
        g2d.color = Color(30, 30, 30)
        g2d.fillRect(hatTopX, hatTopY, headSize - 8, 13)
        g2d.fillRect(hatBrimX, hatBrimY, headSize + 6, 5)
        g2d.color = Color(60, 60, 60)
        g2d.drawRect(hatTopX, hatTopY, headSize - 8, 13)
        g2d.drawRect(hatBrimX, hatBrimY, headSize + 6, 5)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(255, 223, 100)
        g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics
        val label = "★"
        g2d.drawString(label, cx - fm.stringWidth(label) / 2, cy + fm.ascent / 2)
    }
}
