package com.example.mcpassistant.ui

import java.awt.*
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.geom.Path2D
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

        addComponentListener(object : ComponentAdapter() {
            override fun componentResized(e: ComponentEvent) {
                activeAvatar?.let { centerAvatar(it) }
                repaint()
            }
        })
    }

    fun showAvatar(avatar: AvatarComponent) {
        activeAvatar?.let { remove(it) }
        activeAvatar = avatar
        avatar.parent?.remove(avatar)
        avatar.stageScale = 2f
        centerAvatar(avatar)
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

    private fun centerAvatar(avatar: AvatarComponent) {
        val aW = 104; val aH = 128
        val panelW = if (width > 0) width else preferredSize.width
        val panelH = if (height > 0) height else preferredSize.height
        avatar.bounds = Rectangle((panelW - aW) / 2, (panelH - aH) / 2 - 10, aW, aH)
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

        drawBackWall(g2d)
        drawStageFloor(g2d)
        drawCurtains(g2d)
        drawFootlights(g2d)

        if (spotlightIntensity > 0f) {
            drawSpotlight(g2d)
        }

        drawCurtainValance(g2d)
    }

    private fun drawBackWall(g2d: Graphics2D) {
        val wallH = height - 40
        val grad = GradientPaint(
            0f, 0f, Color(18, 12, 35),
            0f, wallH.toFloat(), Color(10, 8, 22)
        )
        g2d.paint = grad
        g2d.fillRect(0, 0, width, wallH)

        // Subtle vertical panel lines on back wall
        g2d.color = Color(25, 18, 45, 60)
        g2d.stroke = BasicStroke(1f)
        var px = width / 5
        while (px < width) {
            g2d.drawLine(px, 8, px, wallH - 4)
            px += width / 5
        }

        // Ambient warm glow on back wall (always present, subtle)
        val ambientRadius = width * 0.4f
        val ambientGrad = RadialGradientPaint(
            Point2D.Float(width / 2f, wallH * 0.6f),
            ambientRadius,
            floatArrayOf(0f, 1f),
            arrayOf(Color(60, 40, 20, 30), Color(0, 0, 0, 0))
        )
        val origPaint = g2d.paint
        g2d.paint = ambientGrad
        g2d.fillOval(
            (width / 2f - ambientRadius).toInt(),
            (wallH * 0.6f - ambientRadius).toInt(),
            (ambientRadius * 2).toInt(),
            (ambientRadius * 2).toInt()
        )
        g2d.paint = origPaint
    }

    private fun drawStageFloor(g2d: Graphics2D) {
        val floorY = height - 40
        val floorH = 40

        // Main floor gradient — rich wood tones
        val floorGrad = GradientPaint(
            0f, floorY.toFloat(), Color(50, 30, 15),
            0f, height.toFloat(), Color(30, 18, 8)
        )
        g2d.paint = floorGrad
        g2d.fillRect(0, floorY, width, floorH)

        // Stage front edge — polished lip
        val edgeGrad = GradientPaint(
            0f, floorY.toFloat(), Color(90, 60, 30),
            0f, (floorY + 4).toFloat(), Color(55, 35, 16)
        )
        g2d.paint = edgeGrad
        g2d.fillRect(0, floorY, width, 4)

        // Floor boards with grain
        g2d.stroke = BasicStroke(0.8f)
        var bx = 15
        while (bx < width) {
            g2d.color = Color(60, 38, 18, 80)
            g2d.drawLine(bx, floorY + 5, bx, height)
            // Subtle grain marks
            g2d.color = Color(65, 42, 20, 40)
            val grainY = floorY + 10 + (bx * 7 % 20)
            g2d.drawLine(bx + 2, grainY, bx + 8, grainY + 2)
            bx += 28
        }

        // Horizontal board join lines
        g2d.color = Color(40, 24, 12, 50)
        g2d.drawLine(0, floorY + floorH / 2, width, floorY + floorH / 2)

        // Floor reflection glow (when spotlight active)
        if (spotlightIntensity > 0f) {
            val reflGrad = RadialGradientPaint(
                Point2D.Float(width / 2f, floorY.toFloat() + 6),
                width * 0.3f,
                floatArrayOf(0f, 1f),
                arrayOf(
                    Color(255, 240, 180, (40 * spotlightIntensity).toInt()),
                    Color(0, 0, 0, 0)
                )
            )
            val origPaint = g2d.paint
            g2d.paint = reflGrad
            g2d.fillRect(0, floorY, width, floorH)
            g2d.paint = origPaint
        }
    }

    private fun drawCurtains(g2d: Graphics2D) {
        val curtainW = 35
        val curtainH = height - 30

        // Left curtain
        drawCurtainSide(g2d, 0, 0, curtainW, curtainH, false)
        // Right curtain
        drawCurtainSide(g2d, width - curtainW, 0, curtainW, curtainH, true)
    }

    private fun drawCurtainSide(g2d: Graphics2D, x: Int, y: Int, w: Int, h: Int, mirror: Boolean) {
        // Curtain body with vertical folds
        val foldCount = 4
        val foldW = w / foldCount

        for (i in 0 until foldCount) {
            val fx = x + i * foldW
            val lightness = if (i % 2 == 0) 1.0f else 0.75f
            val r = (80 * lightness).toInt()
            val gVal = (15 * lightness).toInt()
            val b = (20 * lightness).toInt()

            val foldGrad = GradientPaint(
                fx.toFloat(), y.toFloat(), Color(r, gVal, b),
                fx.toFloat(), h.toFloat(), Color((r * 0.7).toInt(), (gVal * 0.7).toInt(), (b * 0.7).toInt())
            )
            g2d.paint = foldGrad
            g2d.fillRect(fx, y, foldW + 1, h)
        }

        // Fold highlights
        g2d.color = Color(120, 30, 35, 50)
        for (i in 0 until foldCount) {
            val fx = x + i * foldW + foldW / 2
            g2d.drawLine(fx, y + 10, fx, h - 10)
        }

        // Curtain drape curve at bottom
        val drape = Path2D.Float()
        drape.moveTo(x.toDouble(), h.toDouble())
        if (mirror) {
            drape.quadTo((x + w * 0.3).toDouble(), (h + 12).toDouble(), (x + w).toDouble(), (h - 5).toDouble())
        } else {
            drape.quadTo((x + w * 0.7).toDouble(), (h + 12).toDouble(), (x + w).toDouble(), (h - 5).toDouble())
        }
        drape.lineTo((x + w).toDouble(), h.toDouble())
        drape.closePath()
        g2d.color = Color(70, 12, 18)
        g2d.fill(drape)

        // Inner shadow edge
        g2d.color = Color(0, 0, 0, 60)
        if (mirror) {
            g2d.fillRect(x, y, 3, h)
        } else {
            g2d.fillRect(x + w - 3, y, 3, h)
        }

        // Tie-back hint
        val tieY = h / 3
        g2d.color = Color(180, 140, 60, 120)
        g2d.stroke = BasicStroke(2.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        if (mirror) {
            g2d.drawArc(x - 4, tieY - 6, 12, 12, 270, 180)
        } else {
            g2d.drawArc(x + w - 8, tieY - 6, 12, 12, 90, 180)
        }
    }

    private fun drawCurtainValance(g2d: Graphics2D) {
        // Top valance/pelmet across the full width
        val valH = 14
        val valGrad = GradientPaint(
            0f, 0f, Color(90, 18, 25),
            0f, valH.toFloat(), Color(60, 10, 15)
        )
        g2d.paint = valGrad
        g2d.fillRect(0, 0, width, valH)

        // Scalloped bottom edge of valance
        g2d.color = Color(100, 22, 30)
        val scallops = width / 20 + 1
        for (i in 0 until scallops) {
            g2d.fillArc(i * 20 - 2, valH - 6, 22, 12, 0, 180)
        }

        // Gold trim line
        g2d.color = Color(200, 160, 60, 160)
        g2d.stroke = BasicStroke(1.5f)
        g2d.drawLine(0, valH + 2, width, valH + 2)

        // Tassel at center
        val tasselCx = width / 2
        g2d.color = Color(190, 150, 50, 180)
        g2d.stroke = BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        g2d.drawLine(tasselCx, valH, tasselCx, valH + 10)
        g2d.fillOval(tasselCx - 4, valH + 9, 8, 8)
        // Tassel fringe
        g2d.stroke = BasicStroke(1f)
        for (dx in -3..3) {
            g2d.drawLine(tasselCx + dx, valH + 16, tasselCx + dx, valH + 22)
        }
    }

    private fun drawFootlights(g2d: Graphics2D) {
        val floorY = height - 40
        val lightCount = width / 50 + 1
        val spacing = width.toFloat() / lightCount

        for (i in 0 until lightCount) {
            val lx = (spacing * i + spacing / 2).toInt()

            // Light housing
            g2d.color = Color(40, 35, 30)
            g2d.fillRoundRect(lx - 5, floorY - 4, 10, 6, 3, 3)

            // Light glow
            val glowAlpha = if (spotlightIntensity > 0f) 80 else 35
            val glowGrad = RadialGradientPaint(
                Point2D.Float(lx.toFloat(), (floorY - 2).toFloat()),
                18f,
                floatArrayOf(0f, 1f),
                arrayOf(Color(255, 220, 140, glowAlpha), Color(0, 0, 0, 0))
            )
            val origPaint = g2d.paint
            g2d.paint = glowGrad
            g2d.fillOval(lx - 18, floorY - 20, 36, 24)
            g2d.paint = origPaint

            // Bulb
            g2d.color = Color(255, 230, 160, if (spotlightIntensity > 0f) 200 else 100)
            g2d.fillOval(lx - 3, floorY - 3, 6, 4)
        }
    }

    private fun drawSpotlight(g2d: Graphics2D) {
        val cx = width / 2f
        val cy = height / 2f - 16f

        // Cone shape from top
        val coneTop = 14f
        val coneWidth = width * 0.18f
        val coneBottom = height - 42f
        val coneBottomWidth = width * 0.35f

        val cone = Path2D.Float()
        cone.moveTo((cx - coneWidth).toDouble(), coneTop.toDouble())
        cone.lineTo((cx - coneBottomWidth).toDouble(), coneBottom.toDouble())
        cone.lineTo((cx + coneBottomWidth).toDouble(), coneBottom.toDouble())
        cone.lineTo((cx + coneWidth).toDouble(), coneTop.toDouble())
        cone.closePath()

        val coneGrad = GradientPaint(
            cx, coneTop, Color(255, 245, 200, (50 * spotlightIntensity).toInt()),
            cx, coneBottom, Color(255, 240, 180, (25 * spotlightIntensity).toInt())
        )
        val origPaint = g2d.paint
        g2d.paint = coneGrad
        g2d.fill(cone)

        // Central radial glow
        val radius = minOf(width, height) * 0.45f
        val gradient = RadialGradientPaint(
            Point2D.Float(cx, cy),
            radius,
            floatArrayOf(0f, 0.4f, 1f),
            arrayOf(
                Color(255, 250, 220, (160 * spotlightIntensity).toInt()),
                Color(255, 235, 170, (60 * spotlightIntensity).toInt()),
                Color(0, 0, 0, 0)
            )
        )
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
