package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*

class ResearcherRenderer : AvatarRenderer {
    override val agentType = "researcher"
    override val displayName = "Researcher"
    override val headColor = Color(147, 112, 219)
    override val bodyColor = Color(106, 90, 205)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bodyX = bounds.x + bounds.width / 4
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width / 2
        val bodyH = bounds.height / 3
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)
        g2d.color = bodyColor.darker()
        g2d.drawRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)

        // Glasses: two ovals on face
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val eyeY = bounds.y + headSize / 3 - 1
        g2d.color = Color(200, 200, 255, 160)
        g2d.fillOval(headX + 2, eyeY - 1, 9, 7)
        g2d.fillOval(headX + headSize - 11, eyeY - 1, 9, 7)
        g2d.color = Color(80, 60, 160)
        g2d.stroke = BasicStroke(1.2f)
        g2d.drawOval(headX + 2, eyeY - 1, 9, 7)
        g2d.drawOval(headX + headSize - 11, eyeY - 1, 9, 7)
        g2d.drawLine(headX + 11, eyeY + 2, headX + headSize - 11, eyeY + 2)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(220, 200, 255)
        g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics
        val label = "?"
        g2d.drawString(label, cx - fm.stringWidth(label) / 2, cy + fm.ascent / 2)
    }
}
