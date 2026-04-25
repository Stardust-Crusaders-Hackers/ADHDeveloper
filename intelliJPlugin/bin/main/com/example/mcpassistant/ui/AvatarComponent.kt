package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.ui.avatars.AvatarRendererRegistry
import java.awt.*
import javax.swing.JComponent
import javax.swing.UIManager

class AvatarComponent(val agent: Agent) : JComponent() {

    enum class State {
        SEATED,
        SEATED_SCRATCH,
        SEATED_LOOK_AROUND,
        WALKING,
        ON_STAGE,
        DISAPPEARING
    }

    var state: State = State.SEATED
    var animFrame: Int = 0
    var alpha: Float = 1.0f
    var stageScale: Float = 1.0f

    var nextIdleAnimAt: Long = System.currentTimeMillis() + randomIdleDelay()
    private var idleAnimFrame: Int = 0

    private val renderer by lazy { AvatarRendererRegistry.get(agent.type) }

    init {
        preferredSize = Dimension(58, 72)
        toolTipText = "${agent.name} (${agent.type})"
        isOpaque = false
    }

    override fun paintComponent(g: Graphics) {
        val g2d = g as Graphics2D
        
        // Diagnostic: Fill background with semi-transparent color to see component bounds
        // g2d.color = Color(255, 0, 0, 50)
        // g2d.fillRect(0, 0, width, height)

        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)

        val origComposite = g2d.composite
        if (alpha < 1f) {
            g2d.composite = AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha.coerceIn(0f, 1f))
        }

        val breathScale = if (state == State.SEATED || state == State.SEATED_SCRATCH || state == State.SEATED_LOOK_AROUND)
            1.0f + (Math.sin(animFrame * 0.05) * 0.02).toFloat()
        else
            stageScale.coerceAtLeast(0.1f)

        val cx = width / 2
        val avatarSize = (52 * breathScale).toInt().coerceIn(10, width)
        val avatarBounds = Rectangle(cx - avatarSize / 2, 5, avatarSize, avatarSize)

        if (state == State.SEATED_LOOK_AROUND) {
            val skew = Math.sin(idleAnimFrame * 0.15) * 0.15
            val at = g2d.transform.clone() as java.awt.geom.AffineTransform
            g2d.translate(cx.toDouble(), (avatarSize / 2).toDouble())
            g2d.shear(skew, 0.0)
            g2d.translate(-cx.toDouble(), -(avatarSize / 2).toDouble())
            drawHeadAndBody(g2d, avatarBounds, cx)
            g2d.transform = at
        } else {
            drawHeadAndBody(g2d, avatarBounds, cx)
        }

        drawIdleOverlay(g2d, avatarBounds)
        drawNameLabel(g2d, avatarBounds)

        g2d.composite = origComposite
    }

    private fun drawHeadAndBody(g2d: Graphics2D, bounds: Rectangle, cx: Int) {
        drawHead(g2d, bounds)
        renderer?.drawBody(g2d, bounds, animFrame, state)
        renderer?.drawRoleIcon(g2d, cx, bounds.y + bounds.height / 2, 10)
        drawEyes(g2d, bounds)
    }

    private fun drawHead(g2d: Graphics2D, bounds: Rectangle) {
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val headY = bounds.y
        g2d.color = renderer?.headColor ?: Color.GRAY
        g2d.fillOval(headX, headY, headSize, headSize)
        g2d.color = renderer?.headColor?.darker() ?: Color.DARK_GRAY
        g2d.drawOval(headX, headY, headSize, headSize)
    }

    private fun drawEyes(g2d: Graphics2D, bounds: Rectangle) {
        val blink = animFrame % 180 in 178..180
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val eyeY = bounds.y + headSize / 3
        if (!blink) {
            g2d.color = Color.WHITE
            g2d.fillOval(headX + 4, eyeY, 6, 6)
            g2d.fillOval(headX + headSize - 10, eyeY, 6, 6)
            g2d.color = Color.BLACK
            g2d.fillOval(headX + 6, eyeY + 2, 3, 3)
            g2d.fillOval(headX + headSize - 8, eyeY + 2, 3, 3)
        } else {
            g2d.color = Color.DARK_GRAY
            g2d.stroke = BasicStroke(1.5f)
            g2d.drawLine(headX + 4, eyeY + 3, headX + 10, eyeY + 3)
            g2d.drawLine(headX + headSize - 10, eyeY + 3, headX + headSize - 4, eyeY + 3)
        }
    }

    private fun drawIdleOverlay(g2d: Graphics2D, bounds: Rectangle) {
        if (state == State.SEATED_SCRATCH) {
            val progress = (idleAnimFrame % 16) / 16.0
            val armAngle = (Math.PI * 0.5 * Math.sin(progress * Math.PI)).toFloat()
            val cx = (bounds.x + bounds.width / 2).toFloat()
            val shoulderY = (bounds.y + bounds.height * 2 / 3).toFloat()
            g2d.color = renderer?.bodyColor ?: Color.GRAY
            g2d.stroke = BasicStroke(3f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
            val armLen = bounds.width / 3f
            val armEndX = (cx + armLen * Math.cos(armAngle - Math.PI / 4)).toInt()
            val armEndY = (shoulderY - armLen * Math.sin(armAngle.toDouble())).toInt()
            g2d.drawLine(cx.toInt(), shoulderY.toInt(), armEndX, armEndY)
        }
        idleAnimFrame++
    }

    private fun drawNameLabel(g2d: Graphics2D, bounds: Rectangle) {
        g2d.color = UIManager.getColor("Label.foreground") ?: Color.LIGHT_GRAY
        g2d.font = Font("SansSerif", Font.PLAIN, 10)
        val fm = g2d.fontMetrics
        val label = if (agent.name.length > 9) agent.name.take(8) + "…" else agent.name
        val labelX = bounds.x + (bounds.width - fm.stringWidth(label)) / 2
        g2d.drawString(label, labelX, bounds.y + bounds.height + 14)
    }

    companion object {
        fun randomIdleDelay(): Long = 5000L + (Math.random() * 10000).toLong()
    }
}
