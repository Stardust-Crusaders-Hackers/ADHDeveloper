package com.example.mcpassistant.ui

import java.awt.*
import javax.swing.JPanel

class TaskBubblePanel : JPanel() {

    private var text: String = ""
    private val bubbleFill = Color(255, 255, 240, 230)
    private val bubbleBorder = Color(180, 180, 140)
    private val textColor = Color(30, 30, 30)

    init {
        isOpaque = false
        preferredSize = Dimension(400, 90)
        minimumSize = Dimension(120, 50)
    }

    fun setText(newText: String) {
        text = newText
        repaint()
    }

    fun clear() {
        text = ""
        repaint()
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        if (text.isBlank()) return

        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_LCD_HRGB)

        val tailH = 10
        val bubbleX = 10
        val bubbleY = tailH
        val bubbleW = width - 20
        val bubbleH = height - tailH - 4

        // Drop shadow
        g2d.color = Color(0, 0, 0, 40)
        g2d.fillRoundRect(bubbleX + 2, bubbleY + 2, bubbleW, bubbleH, 20, 20)

        // Bubble fill
        g2d.color = bubbleFill
        g2d.fillRoundRect(bubbleX, bubbleY, bubbleW, bubbleH, 20, 20)

        // Bubble border
        g2d.color = bubbleBorder
        g2d.stroke = BasicStroke(1.5f)
        g2d.drawRoundRect(bubbleX, bubbleY, bubbleW, bubbleH, 20, 20)

        // Tail pointing upward toward avatar
        val tailCx = width / 2
        val tailXs = intArrayOf(tailCx - 8, tailCx + 8, tailCx)
        val tailYs = intArrayOf(bubbleY, bubbleY, 0)
        g2d.color = bubbleFill
        g2d.fillPolygon(tailXs, tailYs, 3)
        g2d.color = bubbleBorder
        g2d.stroke = BasicStroke(1.5f)
        g2d.drawLine(tailCx - 8, bubbleY, tailCx, 0)
        g2d.drawLine(tailCx + 8, bubbleY, tailCx, 0)

        // Text
        g2d.color = textColor
        g2d.font = Font("SansSerif", Font.ITALIC, 13)
        drawWrappedText(g2d, text, bubbleX + 16, bubbleY + 22, bubbleW - 32)
    }

    private fun drawWrappedText(g2d: Graphics2D, text: String, x: Int, y: Int, maxWidth: Int) {
        val fm = g2d.fontMetrics
        val words = text.split(" ")
        var line = ""
        var lineY = y
        val lineHeight = fm.height + 2

        for (word in words) {
            val candidate = if (line.isEmpty()) word else "$line $word"
            if (fm.stringWidth(candidate) > maxWidth && line.isNotEmpty()) {
                g2d.drawString(line, x, lineY)
                line = word
                lineY += lineHeight
                if (lineY > height - 10) break
            } else {
                line = candidate
            }
        }
        if (line.isNotEmpty() && lineY <= height - 10) {
            g2d.drawString(line, x, lineY)
        }
    }
}
