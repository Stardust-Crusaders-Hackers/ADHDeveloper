package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*

class ReviewerRenderer : AvatarRenderer {
    override val agentType = "reviewer"
    override val displayName = "Reviewer"
    override val headColor = Color(255, 140, 0)
    override val bodyColor = Color(210, 105, 30)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bodyX = bounds.x + bounds.width / 4
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width / 2
        val bodyH = bounds.height / 3
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)
        g2d.color = bodyColor.darker()
        g2d.drawRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)

        // Monocle on right eye
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val eyeY = bounds.y + headSize / 3 - 1
        g2d.color = Color(255, 200, 100, 140)
        g2d.fillOval(headX + headSize - 12, eyeY - 2, 11, 9)
        g2d.color = Color(160, 80, 0)
        g2d.stroke = BasicStroke(1.5f)
        g2d.drawOval(headX + headSize - 12, eyeY - 2, 11, 9)
        // Monocle chain
        g2d.drawLine(headX + headSize - 6, eyeY + 7, headX + headSize - 2, eyeY + 14)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(255, 220, 150)
        g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics
        val label = "✓"
        g2d.drawString(label, cx - fm.stringWidth(label) / 2, cy + fm.ascent / 2)
    }
}
