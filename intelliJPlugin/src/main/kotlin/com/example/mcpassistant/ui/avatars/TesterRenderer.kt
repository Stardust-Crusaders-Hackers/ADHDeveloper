package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*

class TesterRenderer : AvatarRenderer {
    override val agentType = "tester"
    override val displayName = "Tester"
    override val headColor = Color(220, 20, 60)
    override val bodyColor = Color(178, 34, 34)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bodyX = bounds.x + bounds.width / 4
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width / 2
        val bodyH = bounds.height / 3
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)
        g2d.color = bodyColor.darker()
        g2d.drawRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)

        // Clipboard below body
        val clipX = bodyX + bodyW / 4
        val clipY = bodyY + bodyH + 2
        val clipW = bodyW / 2
        val clipH = bodyH / 2
        g2d.color = Color(255, 250, 240)
        g2d.fillRoundRect(clipX, clipY, clipW, clipH, 3, 3)
        g2d.color = Color(150, 100, 100)
        g2d.drawRoundRect(clipX, clipY, clipW, clipH, 3, 3)
        // Clip top
        g2d.color = Color(180, 60, 60)
        g2d.fillRoundRect(clipX + clipW / 3, clipY - 3, clipW / 3, 5, 2, 2)
        // Lines on clipboard
        g2d.color = Color(180, 140, 140)
        g2d.drawLine(clipX + 2, clipY + 3, clipX + clipW - 2, clipY + 3)
        g2d.drawLine(clipX + 2, clipY + 6, clipX + clipW - 4, clipY + 6)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(255, 180, 180)
        g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics
        val label = "✓"
        g2d.drawString(label, cx - fm.stringWidth(label) / 2, cy + fm.ascent / 2)
    }
}
