package com.example.mcpassistant.ui

import com.intellij.ui.components.JBPanel
import java.awt.*
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.geom.RoundRectangle2D
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

class AudiencePanel : JBPanel<AudiencePanel>() {

    private val H_GAP = 6
    private val V_GAP = 6
    private val PAD_TOP = 8
    private val PAD_SIDE = 8

    private val avatarSlots = mutableListOf<AvatarComponent?>()

    init {
        layout = null
        background = Color(12, 10, 30)
        preferredSize = Dimension(600, 120)
        minimumSize = Dimension(120, 60)

        addComponentListener(object : ComponentAdapter() {
            override fun componentResized(e: ComponentEvent) {
                layoutAvatars()
            }
        })
    }

    fun addAgent(avatar: AvatarComponent): Point {
        val idx = avatarSlots.indexOfFirst { it == null }
        if (idx != -1) {
            avatarSlots[idx] = avatar
        } else {
            avatarSlots.add(avatar)
        }
        if (!components.contains(avatar)) add(avatar)
        layoutAvatars()
        return avatar.location
    }

    fun getSeatPosition(avatar: AvatarComponent): Point {
        val idx = avatarSlots.indexOf(avatar)
        if (idx == -1) return avatar.location
        val seatSize = computeSeatSize()
        val positions = calculateSeatPositions(seatSize)
        if (idx >= positions.size) return avatar.location
        val p = positions[idx]
        val avSize = computeAvatarSize(seatSize)
        return Point(p.x + (seatSize.width - avSize.width) / 2, p.y + 6)
    }

    fun addAgentSafe(avatar: AvatarComponent) {
        if (!components.contains(avatar)) addAgent(avatar)
    }

    fun removeAgent(avatar: AvatarComponent) {
        val idx = avatarSlots.indexOf(avatar)
        if (idx != -1) avatarSlots[idx] = null
        remove(avatar)
        repaint()
    }

    fun allAvatars(): List<AvatarComponent> = avatarSlots.filterNotNull()

    private data class SeatSize(val width: Int, val height: Int)

    private fun computeSeatSize(): SeatSize {
        val count = max(1, avatarSlots.size)
        val panelW = max(if (width > 0) width else preferredSize.width, 120)
        val panelH = max(if (height > 0) height else preferredSize.height, 60)
        val usableW = panelW - PAD_SIDE * 2
        val usableH = panelH - PAD_TOP * 2

        val maxSeatW = 76
        val maxSeatH = 92
        val minSeatW = 36
        val minSeatH = 44

        val cols = computeCols(usableW, maxSeatW)
        val rows = ceil(count.toDouble() / cols).toInt()

        var seatW = min(maxSeatW, (usableW - (cols - 1) * H_GAP) / cols)
        var seatH = min(maxSeatH, (usableH - (rows - 1) * V_GAP) / rows)

        seatW = seatW.coerceIn(minSeatW, maxSeatW)
        seatH = seatH.coerceIn(minSeatH, maxSeatH)

        val aspect = maxSeatH.toFloat() / maxSeatW
        seatH = min(seatH, (seatW * aspect).toInt())

        return SeatSize(seatW, seatH)
    }

    private fun computeAvatarSize(seat: SeatSize): Dimension {
        val scale = seat.width.toFloat() / 76f
        val avW = (58 * scale).toInt().coerceIn(24, 58)
        val avH = (72 * scale).toInt().coerceIn(30, 72)
        return Dimension(avW, avH)
    }

    private fun computeCols(usableW: Int, seatW: Int): Int {
        val count = max(1, avatarSlots.size)
        val maxCols = max(1, (usableW + H_GAP) / (seatW + H_GAP))
        val idealCols = ceil(kotlin.math.sqrt(count.toDouble()) * 1.4).toInt()
        return idealCols.coerceIn(1, maxCols)
    }

    private fun calculateSeatPositions(seat: SeatSize): List<Point> {
        val count = avatarSlots.size
        if (count == 0) return emptyList()

        val panelW = max(if (width > 0) width else preferredSize.width, 120)
        val usableW = panelW - PAD_SIDE * 2
        val cols = max(1, min((usableW + H_GAP) / (seat.width + H_GAP), count))
        val rows = ceil(count.toDouble() / cols).toInt()

        val positions = mutableListOf<Point>()
        var idx = 0

        for (row in 0 until rows) {
            val seatsInRow = min(cols, count - idx)
            val rowWidth = seatsInRow * (seat.width + H_GAP) - H_GAP
            val xStart = (panelW - rowWidth) / 2
            val arcIndent = if (rows > 1) ((rows - 1 - row) * max(3, seat.width / 20)) else 0

            for (col in 0 until seatsInRow) {
                val x = xStart + col * (seat.width + H_GAP) + arcIndent
                val y = PAD_TOP + row * (seat.height + V_GAP)
                positions.add(Point(x, y))
                idx++
            }
        }
        return positions
    }

    private fun layoutAvatars() {
        val seat = computeSeatSize()
        val positions = calculateSeatPositions(seat)
        val avSize = computeAvatarSize(seat)

        for ((idx, avatar) in avatarSlots.withIndex()) {
            if (avatar != null && idx < positions.size) {
                val p = positions[idx]
                avatar.preferredSize = avSize
                avatar.bounds = Rectangle(
                    p.x + (seat.width - avSize.width) / 2,
                    p.y + 6,
                    avSize.width,
                    avSize.height
                )
                avatar.isVisible = true
            }
        }

        if (positions.isNotEmpty()) {
            val rows = ceil(avatarSlots.size.toDouble() / max(1, positions.size / max(1, ceil(avatarSlots.size.toDouble() / max(1, (max(if (width > 0) width else preferredSize.width, 120) - PAD_SIDE * 2 + H_GAP) / (seat.width + H_GAP))).toInt()))).toInt()
            val newH = PAD_TOP * 2 + rows * (seat.height + V_GAP)
            preferredSize = Dimension(preferredSize.width, max(60, newH))
        }

        revalidate()
        repaint()
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)

        val bgGrad = GradientPaint(0f, 0f, Color(18, 14, 40), 0f, height.toFloat(), Color(8, 6, 22))
        g2d.paint = bgGrad
        g2d.fillRect(0, 0, width, height)

        val seat = computeSeatSize()
        val positions = calculateSeatPositions(seat)
        for ((idx, pos) in positions.withIndex()) {
            val occupied = avatarSlots.getOrNull(idx) != null
            drawCinemaSeat(g2d, pos.x, pos.y, seat.width, seat.height, occupied)
        }

        drawFloorLine(g2d)
    }

    private fun drawCinemaSeat(g2d: Graphics2D, x: Int, y: Int, w: Int, h: Int, occupied: Boolean) {
        val origPaint = g2d.paint
        val origStroke = g2d.stroke

        if (occupied) {
            g2d.color = Color(100, 70, 160, 25)
            g2d.fillOval(x - 2, y + h / 4, w + 4, h / 2)
        }

        val backH = (h * 0.52).toInt()
        val backY = y + (h * 0.15).toInt()
        val backGrad = GradientPaint(
            x.toFloat(), backY.toFloat(), Color(55, 35, 75),
            x.toFloat(), (backY + backH).toFloat(), Color(40, 25, 60)
        )
        g2d.paint = backGrad
        g2d.fill(RoundRectangle2D.Float((x + 4).toFloat(), backY.toFloat(), (w - 8).toFloat(), backH.toFloat(), 8f, 8f))
        g2d.color = Color(75, 55, 100, 120)
        g2d.stroke = BasicStroke(0.8f)
        g2d.draw(RoundRectangle2D.Float((x + 4).toFloat(), backY.toFloat(), (w - 8).toFloat(), backH.toFloat(), 8f, 8f))

        g2d.color = Color(65, 45, 85, 80)
        g2d.stroke = BasicStroke(0.5f)
        g2d.drawLine(x + 8, backY + backH / 3, x + w - 8, backY + backH / 3)
        g2d.drawLine(x + 8, backY + backH * 2 / 3, x + w - 8, backY + backH * 2 / 3)

        val armY = backY + backH / 2
        val armH = (h * 0.28).toInt()
        val armW = max(4, w / 12)
        val armGrad = GradientPaint(x.toFloat(), armY.toFloat(), Color(70, 50, 90), x.toFloat(), (armY + armH).toFloat(), Color(50, 35, 70))
        g2d.paint = armGrad
        g2d.fill(RoundRectangle2D.Float(x.toFloat(), armY.toFloat(), armW.toFloat(), armH.toFloat(), 3f, 3f))
        g2d.fill(RoundRectangle2D.Float((x + w - armW).toFloat(), armY.toFloat(), armW.toFloat(), armH.toFloat(), 3f, 3f))
        g2d.color = Color(80, 60, 105)
        g2d.fill(RoundRectangle2D.Float((x - 1).toFloat(), armY.toFloat(), (armW + 2).toFloat(), 3f, 2f, 2f))
        g2d.fill(RoundRectangle2D.Float((x + w - armW - 1).toFloat(), armY.toFloat(), (armW + 2).toFloat(), 3f, 2f, 2f))

        val cushY = backY + backH - 2
        val cushH = if (occupied) (h * 0.16).toInt() else (h * 0.1).toInt()
        val cushGrad = GradientPaint(
            x.toFloat(), cushY.toFloat(), Color(90, 50, 110),
            x.toFloat(), (cushY + cushH).toFloat(), Color(70, 35, 90)
        )
        g2d.paint = cushGrad
        g2d.fill(RoundRectangle2D.Float((x + 6).toFloat(), cushY.toFloat(), (w - 12).toFloat(), cushH.toFloat(), 5f, 5f))
        g2d.color = Color(110, 70, 140, 100)
        g2d.stroke = BasicStroke(0.6f)
        g2d.draw(RoundRectangle2D.Float((x + 6).toFloat(), cushY.toFloat(), (w - 12).toFloat(), cushH.toFloat(), 5f, 5f))

        val legTopY = cushY + cushH
        val legBotY = y + h - 2
        if (legBotY > legTopY) {
            g2d.color = Color(45, 35, 60)
            g2d.stroke = BasicStroke(max(1.5f, w / 40f), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
            g2d.drawLine(x + 8, legTopY, x + 5, legBotY)
            g2d.drawLine(x + w - 8, legTopY, x + w - 5, legBotY)
            g2d.stroke = BasicStroke(max(1f, w / 50f))
            g2d.drawLine(x + 7, legBotY - (legBotY - legTopY) / 3, x + w - 7, legBotY - (legBotY - legTopY) / 3)
        }

        g2d.paint = origPaint
        g2d.stroke = origStroke
    }

    private fun drawFloorLine(g2d: Graphics2D) {
        val y = height - 3
        g2d.color = Color(40, 30, 60, 120)
        g2d.stroke = BasicStroke(1f)
        g2d.drawLine(PAD_SIDE, y, width - PAD_SIDE, y)
    }
}
