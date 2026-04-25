package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*

class AssistantRenderer : AvatarRenderer {
    override val agentType = "assistant"
    override val displayName = "Assistant"
    override val headColor = Color(255, 213, 170)   // warm skin tone
    override val bodyColor = Color(88, 86, 214)      // Junie purple

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bodyX = bounds.x + bounds.width / 5
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width * 3 / 5
        val bodyH = bounds.height / 3 + 4

        // Dress / tunic shape
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 10, 10)
        g2d.color = bodyColor.darker()
        g2d.drawRoundRect(bodyX, bodyY, bodyW, bodyH, 10, 10)

        // Collar detail
        g2d.color = Color(255, 255, 255, 80)
        g2d.fillOval(bodyX + bodyW / 2 - 5, bodyY - 2, 10, 8)

        // Left arm
        val walkSwing = if (state == AvatarComponent.State.WALKING)
            (Math.sin(frame * 0.25) * 12).toInt() else 0
        g2d.color = bodyColor
        g2d.stroke = BasicStroke(5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        g2d.drawLine(bodyX + 2, bodyY + 4, bodyX - 8, bodyY + bodyH / 2 + walkSwing)
        // Right arm
        g2d.drawLine(bodyX + bodyW - 2, bodyY + 4, bodyX + bodyW + 8, bodyY + bodyH / 2 - walkSwing)

        // Hair — long dark hair behind head
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val headY = bounds.y
        g2d.color = Color(40, 20, 10)
        g2d.fillRoundRect(headX - 3, headY + headSize / 3, headSize + 6, headSize, 8, 8)
        // Hair top
        g2d.fillArc(headX - 2, headY - 4, headSize + 4, headSize / 2 + 6, 0, 180)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        // Sparkle ✦ to represent AI assistant
        g2d.color = Color(255, 230, 100)
        g2d.font = Font("SansSerif", Font.BOLD, size + 2)
        val fm = g2d.fontMetrics
        val label = "✦"
        g2d.drawString(label, cx - fm.stringWidth(label) / 2, cy + fm.ascent / 2)
    }
}
