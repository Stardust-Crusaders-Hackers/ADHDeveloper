package com.example.mcpassistant.ui

import java.awt.*
import java.awt.geom.Point2D
import javax.swing.JPanel
import javax.swing.Timer

class StageCenterPanel : JPanel() {

    var activeAvatar: AvatarComponent? = null
    private var spotlightIntensity: Float = 0f
    private var spotlightTimer: Timer? = null

    init {
        layout = null
        background = Color(10, 10, 25)
        preferredSize = Dimension(400, 220)
    }

    fun showAvatar(avatar: AvatarComponent) {
        activeAvatar?.let { remove(it) }
        activeAvatar = avatar

        // Center avatar on stage
        val aSize = Dimension(128, 156)
        val x = (preferredSize.width - aSize.width) / 2
        val y = (preferredSize.height - aSize.height) / 2 - 10
        avatar.bounds = Rectangle(x, y, aSize.width, aSize.height)
        add(avatar)

        fadeInSpotlight()
        revalidate()
        repaint()
    }

    fun clearStage() {
        spotlightTimer?.stop()
        activeAvatar?.let { remove(it) }
        activeAvatar = null
        fadeOutSpotlight()
    }

    private fun fadeInSpotlight() {
        spotlightTimer?.stop()
        spotlightTimer = Timer(16) {
            spotlightIntensity = minOf(1f, spotlightIntensity + 0.03f)
            repaint()
            if (spotlightIntensity >= 1f) spotlightTimer?.stop()
        }.also { it.start() }
    }

    private fun fadeOutSpotlight() {
        spotlightTimer?.stop()
        spotlightTimer = Timer(16) {
            spotlightIntensity = maxOf(0f, spotlightIntensity - 0.03f)
            repaint()
            if (spotlightIntensity <= 0f) {
                spotlightTimer?.stop()
                repaint()
            }
        }.also { it.start() }
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)

        drawStageFloor(g2d)

        if (spotlightIntensity > 0f) {
            drawSpotlight(g2d)
        }
    }

    private fun drawStageFloor(g2d: Graphics2D) {
        // Stage platform
        g2d.color = Color(35, 22, 10)
        g2d.fillRect(0, height - 35, width, 35)

        // Stage edge highlight
        g2d.color = Color(70, 45, 20)
        g2d.stroke = BasicStroke(2f)
        g2d.drawLine(0, height - 35, width, height - 35)

        // Floor boards
        g2d.color = Color(50, 32, 14)
        g2d.stroke = BasicStroke(1f)
        var bx = 0
        while (bx < width) {
            g2d.drawLine(bx, height - 35, bx, height)
            bx += 30
        }
    }

    private fun drawSpotlight(g2d: Graphics2D) {
        val cx = width / 2f
        val cy = height / 2f - 10f
        val radius = minOf(width, height) * 0.55f

        val gradient = RadialGradientPaint(
            Point2D.Float(cx, cy),
            radius,
            floatArrayOf(0f, 0.5f, 1f),
            arrayOf(
                Color(255, 255, 200, (200 * spotlightIntensity).toInt()),
                Color(255, 240, 150, (80 * spotlightIntensity).toInt()),
                Color(0, 0, 0, 0)
            )
        )
        val origPaint = g2d.paint
        g2d.paint = gradient
        g2d.fillOval(
            (cx - radius).toInt(),
            (cy - radius).toInt(),
            (radius * 2).toInt(),
            (radius * 2).toInt()
        )
        g2d.paint = origPaint
    }
}
