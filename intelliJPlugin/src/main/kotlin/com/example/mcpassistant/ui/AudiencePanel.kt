package com.example.mcpassistant.ui

import com.intellij.ui.components.JBPanel
import java.awt.*
import javax.swing.JPanel

class AudiencePanel : JBPanel<AudiencePanel>() {

    private val COLS = 8
    private val ROWS = 2
    private val SEAT_W = 80
    private val SEAT_H = 100

    private val seats = arrayOfNulls<AvatarComponent>(COLS * ROWS)

    init {
        layout = FlowLayout(FlowLayout.CENTER, 10, 10)
        preferredSize = Dimension(COLS * SEAT_W, ROWS * SEAT_H)
        minimumSize = Dimension(200, SEAT_H)
        background = Color(15, 15, 35)
    }

    fun addAgent(avatar: AvatarComponent): Point {
        val idx = seats.indexOfFirst { it == null }
        if (idx != -1) seats[idx] = avatar
        
        add(avatar)
        revalidate()
        repaint()
        
        // Return a dummy point or calculate center if needed for walk animation
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

    private fun seatPosition(idx: Int, size: Dimension): Point {
        val col = idx % COLS
        val row = idx / COLS
        val x = col * SEAT_W + (SEAT_W - size.width) / 2
        val y = row * SEAT_H + 10
        return Point(x, y)
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

        for (row in 0 until ROWS) {
            for (col in 0 until COLS) {
                drawChair(g2d, col * SEAT_W, row * SEAT_H)
            }
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
