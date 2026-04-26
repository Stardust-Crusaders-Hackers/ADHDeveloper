package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.*
import java.awt.geom.Path2D

class CiCdRenderer : AvatarRenderer {
    override val agentType = "cicd"
    override val displayName = "CI/CD"
    override val headColor = Color(96, 125, 160)
    override val bodyColor = Color(55, 90, 130)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Pipeline arrows on chest
        g2d.color = Color(130, 200, 255, 180); g2d.stroke = BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        val cy = by + bh / 2
        g2d.drawLine(bx + 4, cy, bx + bw / 3, cy)
        g2d.drawLine(bx + bw / 3, cy, bx + bw / 3 + 3, cy - 3)
        g2d.drawLine(bx + bw / 3, cy, bx + bw / 3 + 3, cy + 3)
        g2d.drawLine(bx + bw / 3 + 5, cy, bx + bw * 2 / 3, cy)
        g2d.drawLine(bx + bw * 2 / 3, cy, bx + bw * 2 / 3 + 3, cy - 3)
        g2d.drawLine(bx + bw * 2 / 3, cy, bx + bw * 2 / 3 + 3, cy + 3)
        // Hard hat
        val hs = bounds.width / 2; val hx = bounds.x + bounds.width / 4
        g2d.color = Color(255, 200, 50); g2d.fillArc(hx - 2, bounds.y - 6, hs + 4, hs / 2 + 4, 0, 180)
        g2d.color = Color(220, 170, 30); g2d.fillRect(hx - 4, bounds.y + hs / 4 - 4, hs + 8, 4)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(130, 200, 255); g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics; g2d.drawString("⚙", cx - fm.stringWidth("⚙") / 2, cy + fm.ascent / 2)
    }
}

class CodeReviewerRenderer : AvatarRenderer {
    override val agentType = "codeReviewer"
    override val displayName = "Code Reviewer"
    override val headColor = Color(255, 200, 160)
    override val bodyColor = Color(60, 60, 80)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        // Formal vest
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 8, 8)
        g2d.color = Color(80, 80, 110); g2d.drawRoundRect(bx, by, bw, bh, 8, 8)
        // Vest lapel V
        g2d.color = Color(200, 200, 220, 120); g2d.stroke = BasicStroke(2f)
        g2d.drawLine(bx + bw / 2, by, bx + 4, by + bh / 2)
        g2d.drawLine(bx + bw / 2, by, bx + bw - 4, by + bh / 2)
        // Magnifying glass
        val mgx = bx + bw + 2; val mgy = by + 2
        g2d.color = Color(200, 180, 140); g2d.stroke = BasicStroke(2f)
        g2d.drawOval(mgx, mgy, 8, 8); g2d.drawLine(mgx + 7, mgy + 7, mgx + 11, mgy + 11)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(200, 200, 230); g2d.font = Font("Monospaced", Font.BOLD, size - 1)
        val fm = g2d.fontMetrics; val l = "CR"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class DatabaseExpertRenderer : AvatarRenderer {
    override val agentType = "database-expert"
    override val displayName = "DB Expert"
    override val headColor = Color(100, 200, 200)
    override val bodyColor = Color(30, 120, 120)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // DB cylinder on chest
        val dx = bx + bw / 2 - 6; val dy = by + 3; val dw = 12; val dh = bh - 8
        g2d.color = Color(80, 220, 200, 160)
        g2d.fillRect(dx, dy + 3, dw, dh - 3); g2d.fillOval(dx, dy, dw, 6); g2d.fillOval(dx, dy + dh - 3, dw, 6)
        g2d.color = Color(60, 180, 170); g2d.stroke = BasicStroke(1f)
        g2d.drawOval(dx, dy, dw, 6); g2d.drawLine(dx, dy + dh / 3, dx + dw, dy + dh / 3)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(130, 230, 220); g2d.font = Font("Monospaced", Font.BOLD, size - 1)
        val fm = g2d.fontMetrics; val l = "DB"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class DebuggerRenderer : AvatarRenderer {
    override val agentType = "debugger"
    override val displayName = "Debugger"
    override val headColor = Color(255, 180, 170)
    override val bodyColor = Color(140, 30, 30)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Detective trench coat collar
        g2d.color = Color(100, 20, 20); g2d.stroke = BasicStroke(2f)
        g2d.drawLine(bx + 2, by, bx + bw / 2 - 2, by + 8)
        g2d.drawLine(bx + bw - 2, by, bx + bw / 2 + 2, by + 8)
        // Bug icon on chest
        g2d.color = Color(255, 100, 80, 200)
        val bugX = bx + bw / 2 - 4; val bugY = by + bh / 2 - 3
        g2d.fillOval(bugX, bugY, 8, 6)
        g2d.color = Color(255, 60, 40); g2d.stroke = BasicStroke(1f)
        g2d.drawLine(bugX - 2, bugY + 1, bugX + 10, bugY + 1) // antennae
        g2d.drawLine(bugX - 2, bugY + 4, bugX + 10, bugY + 4) // legs
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(255, 120, 100); g2d.font = Font("SansSerif", Font.BOLD, size + 1)
        val fm = g2d.fontMetrics; g2d.drawString("🐛", cx - fm.stringWidth("🐛") / 2, cy + fm.ascent / 2)
    }
}

class DockerRenderer : AvatarRenderer {
    override val agentType = "docker"
    override val displayName = "Docker"
    override val headColor = Color(130, 200, 240)
    override val bodyColor = Color(13, 183, 237)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Container blocks on body
        g2d.color = Color(255, 255, 255, 100)
        val cw = (bw - 8) / 3; val ch = (bh - 6) / 2
        for (r in 0..1) for (c in 0..2) {
            g2d.fillRect(bx + 4 + c * cw, by + 3 + r * ch, cw - 2, ch - 2)
        }
        // Whale tail on top of head
        val hs = bounds.width / 2; val hx = bounds.x + bounds.width / 4
        g2d.color = Color(13, 150, 210)
        val tail = Path2D.Float()
        tail.moveTo((hx + hs / 2 - 6).toDouble(), (bounds.y - 2).toDouble())
        tail.curveTo((hx + hs / 2 - 10).toDouble(), (bounds.y - 12).toDouble(),
            (hx + hs / 2 + 10).toDouble(), (bounds.y - 12).toDouble(),
            (hx + hs / 2 + 6).toDouble(), (bounds.y - 2).toDouble())
        g2d.fill(tail)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(200, 235, 255); g2d.font = Font("SansSerif", Font.BOLD, size - 1)
        val fm = g2d.fontMetrics; val l = "🐋"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class DocumenterRenderer : AvatarRenderer {
    override val agentType = "documenter"
    override val displayName = "Documenter"
    override val headColor = Color(210, 190, 160)
    override val bodyColor = Color(120, 85, 50)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        // Professor jacket
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 8, 8)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 8, 8)
        // Elbow patches
        g2d.color = Color(90, 60, 30)
        g2d.fillOval(bx - 2, by + bh / 3, 6, 8)
        g2d.fillOval(bx + bw - 4, by + bh / 3, 6, 8)
        // Book under arm
        g2d.color = Color(180, 40, 40); g2d.fillRect(bx + bw + 1, by + 6, 5, bh - 8)
        g2d.color = Color(255, 250, 230); g2d.fillRect(bx + bw + 2, by + 8, 3, bh - 12)
        // Glasses
        val hs = bounds.width / 2; val hx = bounds.x + bounds.width / 4; val ey = bounds.y + hs / 3 - 1
        g2d.color = Color(180, 160, 100, 140); g2d.fillOval(hx + 2, ey - 1, 9, 7); g2d.fillOval(hx + hs - 11, ey - 1, 9, 7)
        g2d.color = Color(100, 70, 30); g2d.stroke = BasicStroke(1.2f)
        g2d.drawOval(hx + 2, ey - 1, 9, 7); g2d.drawOval(hx + hs - 11, ey - 1, 9, 7)
        g2d.drawLine(hx + 11, ey + 2, hx + hs - 11, ey + 2)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(220, 200, 160); g2d.font = Font("Serif", Font.BOLD, size + 1)
        val fm = g2d.fontMetrics; val l = "����"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class ExplainerRenderer : AvatarRenderer {
    override val agentType = "explainer"
    override val displayName = "Explainer"
    override val headColor = Color(255, 230, 120)
    override val bodyColor = Color(200, 160, 40)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Bow tie
        g2d.color = Color(220, 50, 50)
        val btx = bx + bw / 2; val bty = by - 1
        g2d.fillPolygon(intArrayOf(btx - 6, btx, btx - 6), intArrayOf(bty - 3, bty, bty + 3), 3)
        g2d.fillPolygon(intArrayOf(btx + 6, btx, btx + 6), intArrayOf(bty - 3, bty, bty + 3), 3)
        g2d.fillOval(btx - 2, bty - 2, 4, 4)
        // Speech lines coming from the side
        g2d.color = Color(255, 255, 200, 120); g2d.stroke = BasicStroke(1.5f)
        g2d.drawLine(bx + bw + 4, by + 4, bx + bw + 10, by + 2)
        g2d.drawLine(bx + bw + 4, by + 8, bx + bw + 12, by + 8)
        g2d.drawLine(bx + bw + 4, by + 12, bx + bw + 10, by + 14)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(255, 240, 150); g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics; val l = "💬"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class FocusTimerRenderer : AvatarRenderer {
    override val agentType = "focus-timer"
    override val displayName = "Focus Timer"
    override val headColor = Color(150, 200, 230)
    override val bodyColor = Color(50, 100, 140)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Clock face on chest
        val clockR = minOf(bw, bh) / 3
        val cx = bx + bw / 2; val cy2 = by + bh / 2
        g2d.color = Color(255, 255, 240, 200); g2d.fillOval(cx - clockR, cy2 - clockR, clockR * 2, clockR * 2)
        g2d.color = Color(30, 70, 100); g2d.stroke = BasicStroke(1.5f)
        g2d.drawOval(cx - clockR, cy2 - clockR, clockR * 2, clockR * 2)
        // Clock hands - animated
        val angle1 = frame * 0.02; val angle2 = frame * 0.15
        g2d.drawLine(cx, cy2, cx + (clockR * 0.6 * Math.cos(angle1)).toInt(), cy2 - (clockR * 0.6 * Math.sin(angle1)).toInt())
        g2d.stroke = BasicStroke(1f)
        g2d.drawLine(cx, cy2, cx + (clockR * 0.8 * Math.cos(angle2)).toInt(), cy2 - (clockR * 0.8 * Math.sin(angle2)).toInt())
        // Headband (zen)
        val hs = bounds.width / 2; val hx = bounds.x + bounds.width / 4
        g2d.color = Color(255, 100, 100); g2d.fillRect(hx - 1, bounds.y + hs / 3, hs + 2, 3)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(180, 220, 255); g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics; val l = "⏱"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class GitMaintainerRenderer : AvatarRenderer {
    override val agentType = "gitMaintainer"
    override val displayName = "Git Maintainer"
    override val headColor = Color(240, 180, 150)
    override val bodyColor = Color(240, 80, 51)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Git branch icon on chest
        g2d.color = Color(255, 255, 255, 180); g2d.stroke = BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        val gx = bx + bw / 2; val gy = by + 4
        g2d.drawLine(gx, gy, gx, gy + bh - 8) // main branch
        g2d.drawLine(gx, gy + 5, gx + 6, gy + 2) // feature branch
        g2d.fillOval(gx - 2, gy - 2, 4, 4)
        g2d.fillOval(gx + 5, gy, 4, 4)
        g2d.fillOval(gx - 2, gy + bh - 10, 4, 4)
        // Orange cap
        val hs = bounds.width / 2; val hx = bounds.x + bounds.width / 4
        g2d.color = Color(240, 80, 51); g2d.fillArc(hx - 2, bounds.y - 4, hs + 4, hs / 2, 0, 180)
        g2d.color = Color(200, 60, 40); g2d.fillRect(hx - 4, bounds.y + hs / 4 - 3, hs + 8, 3)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(255, 150, 120); g2d.font = Font("Monospaced", Font.BOLD, size - 1)
        val fm = g2d.fontMetrics; val l = "⎇"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class KubernetesRenderer : AvatarRenderer {
    override val agentType = "kubernetes"
    override val displayName = "Kubernetes"
    override val headColor = Color(130, 170, 230)
    override val bodyColor = Color(50, 108, 229)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Helm wheel on chest
        val cx = bx + bw / 2; val cy2 = by + bh / 2; val r = minOf(bw, bh) / 3
        g2d.color = Color(255, 255, 255, 160); g2d.stroke = BasicStroke(1.5f)
        g2d.drawOval(cx - r, cy2 - r, r * 2, r * 2)
        for (i in 0 until 7) {
            val a = i * Math.PI * 2 / 7
            g2d.drawLine(cx, cy2, cx + (r * Math.cos(a)).toInt(), cy2 - (r * Math.sin(a)).toInt())
        }
        // Captain hat
        val hs = bounds.width / 2; val hx = bounds.x + bounds.width / 4
        g2d.color = Color(30, 60, 120); g2d.fillArc(hx - 3, bounds.y - 6, hs + 6, hs / 2 + 2, 0, 180)
        g2d.color = Color(255, 215, 0); g2d.fillRect(hx + hs / 2 - 4, bounds.y - 4, 8, 3)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(160, 200, 255); g2d.font = Font("SansSerif", Font.BOLD, size - 1)
        val fm = g2d.fontMetrics; val l = "K8s"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class MoodDetectorRenderer : AvatarRenderer {
    override val agentType = "mood-detector"
    override val displayName = "Mood Detector"
    override val headColor = Color(255, 180, 200)
    override val bodyColor = Color(200, 80, 120)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 12, 12)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 12, 12)
        // Heart on chest (animated pulse)
        val pulse = 1.0f + (Math.sin(frame * 0.1) * 0.15).toFloat()
        val hSize = (8 * pulse).toInt()
        val hcx = bx + bw / 2; val hcy = by + bh / 2
        g2d.color = Color(255, 100, 130, 200)
        val heart = Path2D.Float()
        heart.moveTo(hcx.toDouble(), (hcy + hSize / 2).toDouble())
        heart.curveTo((hcx - hSize).toDouble(), (hcy - hSize / 3).toDouble(), (hcx - hSize / 2).toDouble(), (hcy - hSize).toDouble(), hcx.toDouble(), (hcy - hSize / 3).toDouble())
        heart.curveTo((hcx + hSize / 2).toDouble(), (hcy - hSize).toDouble(), (hcx + hSize).toDouble(), (hcy - hSize / 3).toDouble(), hcx.toDouble(), (hcy + hSize / 2).toDouble())
        g2d.fill(heart)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(255, 160, 180); g2d.font = Font("SansSerif", Font.BOLD, size + 2)
        val fm = g2d.fontMetrics; val l = "♥"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class PlannerRenderer : AvatarRenderer {
    override val agentType = "planner"
    override val displayName = "Planner"
    override val headColor = Color(170, 220, 170)
    override val bodyColor = Color(45, 120, 60)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Checklist on chest
        g2d.color = Color(255, 255, 255, 180); g2d.stroke = BasicStroke(1.5f)
        val lx = bx + 6; val ly = by + 4
        for (i in 0..2) {
            val iy = ly + i * 5
            g2d.drawLine(lx, iy + 2, lx + 3, iy + 4) // check mark
            g2d.drawLine(lx + 3, iy + 4, lx + 6, iy)
            g2d.drawLine(lx + 9, iy + 2, lx + bw - 14, iy + 2) // line
        }
        // Clipboard prop
        g2d.color = Color(180, 140, 80); g2d.fillRoundRect(bx - 6, by + 2, 7, bh - 4, 2, 2)
        g2d.color = Color(255, 250, 230); g2d.fillRect(bx - 5, by + 5, 5, bh - 10)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(180, 240, 180); g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics; val l = "✓"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class RepoInitializerRenderer : AvatarRenderer {
    override val agentType = "repo-initializer"
    override val displayName = "Repo Init"
    override val headColor = Color(140, 230, 210)
    override val bodyColor = Color(30, 150, 130)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Rocket on chest
        val rx = bx + bw / 2 - 4; val ry = by + 3
        g2d.color = Color(230, 230, 240)
        g2d.fillRoundRect(rx, ry, 8, bh - 6, 4, 4) // body
        g2d.color = Color(255, 80, 50)
        g2d.fillPolygon(intArrayOf(rx, rx + 4, rx + 8), intArrayOf(ry + 2, ry - 4, ry + 2), 3) // nose
        g2d.color = Color(255, 150, 50)
        g2d.fillPolygon(intArrayOf(rx + 1, rx + 4, rx + 7), intArrayOf(ry + bh - 6, ry + bh - 2, ry + bh - 6), 3) // flame
        // Spark effect
        if (frame % 8 < 4) {
            g2d.color = Color(255, 200, 80, 150)
            g2d.fillOval(rx + 2, ry + bh - 4, 4, 4)
        }
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(180, 255, 240); g2d.font = Font("SansSerif", Font.BOLD, size + 1)
        val fm = g2d.fontMetrics; val l = "🚀"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class SecurityAuditorRenderer : AvatarRenderer {
    override val agentType = "securityAuditor"
    override val displayName = "Security Auditor"
    override val headColor = Color(180, 170, 200)
    override val bodyColor = Color(40, 30, 60)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = Color(60, 50, 80); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Shield on chest
        val sx = bx + bw / 2 - 6; val sy = by + 3
        val shield = Path2D.Float()
        shield.moveTo((sx + 6).toDouble(), sy.toDouble())
        shield.lineTo((sx + 12).toDouble(), (sy + 3).toDouble())
        shield.lineTo((sx + 12).toDouble(), (sy + 10).toDouble())
        shield.curveTo((sx + 12).toDouble(), (sy + 16).toDouble(), (sx + 6).toDouble(), (sy + 18).toDouble(), (sx + 6).toDouble(), (sy + 18).toDouble())
        shield.curveTo((sx + 6).toDouble(), (sy + 18).toDouble(), sx.toDouble(), (sy + 16).toDouble(), sx.toDouble(), (sy + 10).toDouble())
        shield.lineTo(sx.toDouble(), (sy + 3).toDouble())
        shield.closePath()
        g2d.color = Color(100, 80, 180, 200); g2d.fill(shield)
        g2d.color = Color(150, 130, 220); g2d.stroke = BasicStroke(1.5f); g2d.draw(shield)
        // Lock icon on shield
        g2d.color = Color(255, 255, 255, 180)
        g2d.fillRect(sx + 4, sy + 10, 4, 4)
        g2d.drawOval(sx + 4, sy + 7, 4, 4)
        // Sunglasses
        val hs = bounds.width / 2; val hx = bounds.x + bounds.width / 4; val ey = bounds.y + hs / 3 - 1
        g2d.color = Color(20, 20, 30, 220); g2d.fillRoundRect(hx + 1, ey - 1, 10, 6, 3, 3); g2d.fillRoundRect(hx + hs - 11, ey - 1, 10, 6, 3, 3)
        g2d.color = Color(60, 60, 80); g2d.stroke = BasicStroke(1f); g2d.drawLine(hx + 11, ey + 1, hx + hs - 11, ey + 1)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(160, 140, 220); g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics; val l = "🛡"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class SmokeTesterRenderer : AvatarRenderer {
    override val agentType = "smoke-tester"
    override val displayName = "Smoke Tester"
    override val headColor = Color(190, 190, 200)
    override val bodyColor = Color(100, 100, 115)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        // Lab coat (white-ish body)
        g2d.color = Color(220, 220, 230); g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = Color(180, 180, 195); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Coat line down center
        g2d.color = Color(160, 160, 175); g2d.stroke = BasicStroke(1f)
        g2d.drawLine(bx + bw / 2, by + 2, bx + bw / 2, by + bh - 2)
        // Flask prop
        val fx = bx + bw + 2; val fy = by + 4
        g2d.color = Color(200, 230, 255, 180)
        g2d.fillRoundRect(fx, fy + 4, 7, 10, 3, 3) // flask body
        g2d.color = Color(180, 210, 240); g2d.fillRect(fx + 2, fy, 3, 5) // flask neck
        // Smoke wisps (animated)
        g2d.color = Color(200, 200, 210, 80 + (Math.sin(frame * 0.1) * 40).toInt())
        g2d.fillOval(fx + 1, fy - 4 - (frame % 12), 5, 4)
        g2d.fillOval(fx + 3, fy - 8 - (frame % 12), 4, 3)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(200, 200, 215); g2d.font = Font("SansSerif", Font.BOLD, size)
        val fm = g2d.fontMetrics; val l = "⚗"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}

class SupermanRenderer : AvatarRenderer {
    override val agentType = "superman"
    override val displayName = "Superman"
    override val headColor = Color(255, 210, 180)
    override val bodyColor = Color(30, 80, 180)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bx = bounds.x + bounds.width / 5; val by = bounds.y + bounds.height / 2
        val bw = bounds.width * 3 / 5; val bh = bounds.height / 3 + 4
        g2d.color = bodyColor; g2d.fillRoundRect(bx, by, bw, bh, 10, 10)
        g2d.color = bodyColor.darker(); g2d.drawRoundRect(bx, by, bw, bh, 10, 10)
        // Cape! flowing behind
        val cape = Path2D.Float()
        val capeWave = (Math.sin(frame * 0.15) * 4).toInt()
        cape.moveTo((bx + bw - 2).toDouble(), by.toDouble())
        cape.curveTo((bx + bw + 8).toDouble(), (by + bh / 3).toDouble(),
            (bx + bw + 12 + capeWave).toDouble(), (by + bh * 2 / 3).toDouble(),
            (bx + bw + 6 + capeWave).toDouble(), (by + bh + 4).toDouble())
        cape.lineTo((bx + bw - 2).toDouble(), (by + bh).toDouble())
        cape.closePath()
        g2d.color = Color(200, 20, 20, 180); g2d.fill(cape)
        g2d.color = Color(160, 10, 10); g2d.stroke = BasicStroke(1f); g2d.draw(cape)
        // S emblem on chest
        g2d.color = Color(255, 220, 50)
        // Diamond shape
        val dx = bx + bw / 2; val dy = by + bh / 2
        g2d.fillPolygon(intArrayOf(dx, dx + 7, dx, dx - 7), intArrayOf(dy - 6, dy, dy + 6, dy), 4)
        g2d.color = Color(200, 20, 20)
        g2d.font = Font("Serif", Font.BOLD, 9)
        val fm = g2d.fontMetrics
        g2d.drawString("S", dx - fm.stringWidth("S") / 2, dy + fm.ascent / 2 - 1)
        // Hair curl
        val hs = bounds.width / 2; val hx = bounds.x + bounds.width / 4
        g2d.color = Color(30, 30, 50)
        g2d.stroke = BasicStroke(2.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
        g2d.drawArc(hx + hs / 2 - 4, bounds.y - 6, 8, 8, 180, 180)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color(255, 220, 50); g2d.font = Font("Serif", Font.BOLD, size + 2)
        val fm = g2d.fontMetrics; val l = "S"; g2d.drawString(l, cx - fm.stringWidth(l) / 2, cy + fm.ascent / 2)
    }
}
