package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*

class ClaudeRenderer : AvatarRenderer {
    override val agentType = "claude"
    override val displayName = "Claude"
    override val headColor = Color(255, 235, 220)       // light warm tone
    override val bodyColor = Color(210, 95, 60)         // Anthropic orange

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bodyX = bounds.x + bounds.width / 5
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width * 3 / 5
        val bodyH = bounds.height / 3 + 4

        // Body
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 8, 8)
        g2d.color = bodyColor.darker()
        g2d.drawRoundRect(bodyX, bodyY, bodyW, bodyH, 8, 8)

        // Anthropic logo hint — small 'A' shape on chest
        g2d.color = Color(255, 255, 255, 140)
        g2d.font = Font("SansSerif", Font.BOLD, 10)
        val fm = g2d.fontMetrics
        val label = "A"
        g2d.drawString(label, bodyX + bodyW / 2 - fm.stringWidth(label) / 2, bodyY + bodyH / 2 + fm.ascent / 2 - 2)

        // Arms with walk swing
        val walkSwing = if (state == AvatarComponent.State.WALKING)
            (Math.sin(frame * 0.25) * 12).toInt() else 0
        g2d.color = bodyColor
        g2d.stroke = BasicStroke(5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        g2d.drawLine(bodyX + 2, bodyY + 4, bodyX - 8, bodyY + bodyH / 2 + walkSwing)
        g2d.drawLine(bodyX + bodyW - 2, bodyY + 4, bodyX + bodyW + 8, bodyY + bodyH / 2 - walkSwing)

        // Antenna on top of head
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val headY = bounds.y
        val antCx = headX + headSize / 2
        g2d.color = Color(255, 180, 100)
        g2d.stroke = BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        g2d.drawLine(antCx, headY, antCx, headY - 10)
        g2d.color = Color(255, 220, 80)
        g2d.fillOval(antCx - 4, headY - 14, 8, 8)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        // Claude star/sparkle icon
        g2d.color = Color(255, 200, 80)
        g2d.font = Font("SansSerif", Font.BOLD, size + 2)
        val fm = g2d.fontMetrics
        val label = "✳"
        g2d.drawString(label, cx - fm.stringWidth(label) / 2, cy + fm.ascent / 2)
    }
}
