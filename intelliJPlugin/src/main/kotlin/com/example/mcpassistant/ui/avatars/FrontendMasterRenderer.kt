package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*
import java.awt.geom.RoundRectangle2D

class FrontendMasterRenderer : AvatarRenderer {
    override val agentType = "frontend-master"
    override val displayName = "Frontend Master"
    override val headColor = Color(255, 20, 147) // Deep Pink
    override val bodyColor = Color(139, 0, 139)  // Dark Magenta

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        // High-fashion stylized body
        val bodyX = bounds.x + bounds.width / 4
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width / 2
        val bodyH = bounds.height / 3 + 2
        
        val bodyShape = RoundRectangle2D.Float(
            bodyX.toFloat(), bodyY.toFloat(), 
            bodyW.toFloat(), bodyH.toFloat(), 
            15f, 15f
        )
        
        g2d.color = bodyColor
        g2d.fill(bodyShape)
        
        // Stylish scarf or collar
        g2d.color = headColor
        g2d.fillOval(bodyX + bodyW / 4, bodyY - 4, bodyW / 2, 8)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color.WHITE
        g2d.font = Font("SansSerif", Font.BOLD, (size * 0.7).toInt())
        val fm = g2d.fontMetrics
        val label = "UX"
        g2d.drawString(label, cx - fm.stringWidth(label) / 2, cy + fm.ascent / 2 - 1)
    }
}
