package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*

class CoderRenderer : AvatarRenderer {
    override val agentType = "coder"
    override val displayName = "Coder"
    override val headColor = Color(50, 205, 50)
    override val bodyColor = Color(34, 139, 34)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        // Hoodie: wider, rounded body
        val bodyX = bounds.x + bounds.width / 5
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width * 3 / 5
        val bodyH = bounds.height / 3 + 4
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 12, 12)
        g2d.color = bodyColor.darker()
        g2d.drawRoundRect(bodyX, bodyY, bodyW, bodyH, 12, 12)

        // Hood outline on top
        g2d.color = bodyColor.darker()
        g2d.drawArc(bodyX + 2, bodyY - 6, bodyW - 4, 14, 0, 180)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(180, 255, 180)
        g2d.font = Font("Monospaced", Font.BOLD, size - 1)
        val fm = g2d.fontMetrics
        val label = "</>"
        g2d.drawString(label, cx - fm.stringWidth(label) / 2, cy + fm.ascent / 2)
    }
}
