package com.example.mcpassistant.ui

import com.intellij.ui.components.JBPanel
import java.awt.*

class AudiencePanel : JBPanel<AudiencePanel>() {

    private val MAX_COLS = 8
    private val SEAT_W = 80
    private val SEAT_H = 100

    // Grows as agents are registered; null = agent is temporarily on stage (seat reserved).
    private val seats = mutableListOf<AvatarComponent?>()

    private val agentCount: Int get() = seats.size
    private val cols: Int get() = if (agentCount == 0) 1 else minOf(agentCount, MAX_COLS)
    private val rows: Int get() = if (agentCount == 0) 1 else (agentCount + cols - 1) / cols

    init {
        layout = FlowLayout(FlowLayout.CENTER, 10, 10)
        minimumSize = Dimension(200, SEAT_H)
        background = Color(15, 15, 35)
        updatePreferredSize()
    }

    private fun updatePreferredSize() {
        preferredSize = Dimension(cols * SEAT_W, rows * SEAT_H)
    }

    fun addAgent(avatar: AvatarComponent): Point {
        val idx = seats.indexOfFirst { it == null }
        if (idx == -1) seats.add(avatar) else seats[idx] = avatar
        updatePreferredSize()
        add(avatar)
        revalidate()
        repaint()
        return avatar.location
    }

    fun getSeatPosition(avatar: AvatarComponent): Point {
        return avatar.location
    }

    fun addAgentSafe(avatar: AvatarComponent) {
        if (!components.contains(avatar)) {
            addAgent(avatar)
        }
    }

    fun removeAgent(avatar: AvatarComponent) {
        val idx = seats.indexOf(avatar)
        if (idx != -1) seats[idx] = null
        remove(avatar)
        repaint()
    }

    fun allAvatars(): List<AvatarComponent> = seats.filterNotNull()

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

        repeat(agentCount) { i ->
            drawChair(g2d, (i % cols) * SEAT_W, (i / cols) * SEAT_H)
        }
    }

    private fun drawChair(g2d: Graphics2D, x: Int, y: Int) {
        // Seat back
        g2d.color = Color(45, 45, 70)
        g2d.fillRoundRect(x + 10, y + 55, 60, 28, 8, 8)
        g2d.color = Color(65, 65, 95)
        g2d.drawRoundRect(x + 10, y + 55, 60, 28, 8, 8)

        // Seat cushion
        g2d.color = Color(55, 40, 75)
        g2d.fillRoundRect(x + 14, y + 75, 52, 14, 5, 5)
        g2d.color = Color(80, 60, 100)
        g2d.drawRoundRect(x + 14, y + 75, 52, 14, 5, 5)

        // Legs
        g2d.color = Color(35, 35, 55)
        g2d.stroke = BasicStroke(2f)
        g2d.drawLine(x + 18, y + 89, x + 15, y + 99)
        g2d.drawLine(x + 62, y + 89, x + 65, y + 99)
    }
}
