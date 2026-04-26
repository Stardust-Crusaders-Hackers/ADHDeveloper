package com.example.mcpassistant.ui

import java.awt.*
import javax.swing.JPanel

class TaskBubblePanel : JPanel() {

    private var text: String = ""
    private val bubbleFill = Color(255, 255, 255, 250)
    private val bubbleBorder = Color(210, 215, 230, 180)
    private val textColor = Color(45, 50, 70)
    private val shadowColor = Color(0, 0, 40, 25)

    init {
        isOpaque = false
        preferredSize = Dimension(420, 100)
        minimumSize = Dimension(140, 60)
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
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)

        val tailH = 12
        val margin = 12
        val bubbleX = margin
        val bubbleY = tailH
        val bubbleW = width - (margin * 2)
        val bubbleH = height - tailH - 6
        val arc = 24

        // Multi-layered Shadow for "depth"
        g2d.color = shadowColor
        g2d.fillRoundRect(bubbleX, bubbleY + 2, bubbleW, bubbleH, arc, arc)
        g2d.color = Color(0, 0, 0, 15)
        g2d.fillRoundRect(bubbleX, bubbleY + 4, bubbleW, bubbleH, arc, arc)

        // Clean solid fill
        g2d.color = bubbleFill
        g2d.fillRoundRect(bubbleX, bubbleY, bubbleW, bubbleH, arc, arc)

        // Bubble border (Glass effect)
        g2d.color = bubbleBorder
        g2d.stroke = BasicStroke(1.2f)
        g2d.drawRoundRect(bubbleX, bubbleY, bubbleW, bubbleH, arc, arc)

        // Tail pointing upward toward avatar - styled
        val tailCx = width / 2
        val tailXs = intArrayOf(tailCx - 10, tailCx + 10, tailCx)
        val tailYs = intArrayOf(bubbleY + 1, bubbleY + 1, 2)
        
        g2d.color = bubbleFill
        g2d.fillPolygon(tailXs, tailYs, 3)
        g2d.color = bubbleBorder
        g2d.stroke = BasicStroke(1.2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        g2d.drawLine(tailCx - 10, bubbleY, tailCx, 2)
        g2d.drawLine(tailCx + 10, bubbleY, tailCx, 2)

        // Text with modern font and spacing
        g2d.color = textColor
        g2d.font = Font("Segoe UI", Font.PLAIN, 14)
        if (g2d.font.name == "Dialog") { // Fallback for non-windows
            g2d.font = Font("SansSerif", Font.PLAIN, 14)
        }
        
        drawWrappedText(g2d, text, bubbleX + 20, bubbleY + 24, bubbleW - 40)
    }

    private fun drawWrappedText(g2d: Graphics2D, text: String, x: Int, y: Int, maxWidth: Int) {
        val fm = g2d.fontMetrics
        val words = text.split("\\s+".toRegex())
        var line = ""
        var lineY = y
        val lineHeight = fm.height + 3

        for (word in words) {
            val candidate = if (line.isEmpty()) word else "$line $word"
            if (fm.stringWidth(candidate) > maxWidth && line.isNotEmpty()) {
                g2d.drawString(line, x, lineY)
                line = word
                lineY += lineHeight
                if (lineY > height - 12) break
            } else {
                line = candidate
            }
        }
        if (line.isNotEmpty() && lineY <= height - 12) {
            g2d.drawString(line, x, lineY)
        }
    }
}
