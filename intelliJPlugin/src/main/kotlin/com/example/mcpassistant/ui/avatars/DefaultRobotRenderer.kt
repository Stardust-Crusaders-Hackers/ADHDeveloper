package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*

class DefaultRobotRenderer : AvatarRenderer {
    override val agentType = "default"
    override val displayName = "Robot"
    override val headColor = Color(100, 149, 237)
    override val bodyColor = Color(70, 130, 180)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bodyX = bounds.x + bounds.width / 4
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width / 2
        val bodyH = bounds.height / 3
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)
        g2d.color = bodyColor.darker()
        g2d.drawRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color.WHITE
        g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics
        g2d.drawString("?", cx - fm.stringWidth("?") / 2, cy + fm.ascent / 2)
    }
}
