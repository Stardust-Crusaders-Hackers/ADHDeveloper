# ADHDeveloper Stage Mode — Dev B: UI & Rendering

**Parallel with:** `PLAN_DEV_A_BACKEND.md`
**Coordination point:** Dev A defines interfaces/models first (their Phase 0). Dev B starts immediately after receiving `Agent`, `AgentTask`, and `StageUIListener`. Merge when both complete.

---

## Scope

Dev B owns all Swing UI rendering:
- `AvatarComponent` — custom-painted Swing component
- `AvatarRenderer` interface + `AvatarRendererRegistry` (OCP extensible)
- All built-in `AvatarRenderer` implementations
- `AnimationEngine` — timer-driven animation controller
- `AudiencePanel` — seated avatar grid
- `StageCenterPanel` — on-stage view with spotlight
- `StagePanel` — top-level container, implements `StageUIListener`
- `TaskBubblePanel` — speech bubble + task text display

Dev B does **NOT** touch:
- Services (`AgentRegistryService`, `MCPBridgeService`, `ElevenLabsService`)
- `plugin.xml`, `build.gradle.kts`
- `mcpServer/`
- Settings

Dev B **depends on** from Dev A (Phase 0):
- `com.example.mcpassistant.model.Agent`
- `com.example.mcpassistant.model.AgentTask`
- `com.example.mcpassistant.ui.StageUIListener`

---

## Source Tree (Dev B creates)

```
intelliJPlugin/src/main/kotlin/com/example/mcpassistant/ui/
├── StagePanel.kt                      CREATE — top-level, implements StageUIListener
├── AudiencePanel.kt                   CREATE — seated avatar grid
├── StageCenterPanel.kt                CREATE — on-stage avatar + spotlight
├── TaskBubblePanel.kt                 CREATE — speech bubble + task text
├── AvatarComponent.kt                 CREATE — custom-painted JComponent
├── AnimationEngine.kt                 CREATE — javax.swing.Timer-based
└── avatars/
    ├── AvatarRenderer.kt              CREATE — interface (stable contract)
    ├── AvatarRendererRegistry.kt      CREATE — extensible registry
    ├── DefaultRobotRenderer.kt        CREATE — fallback for unknown types
    ├── OrchestratorRenderer.kt        CREATE — conductor, top hat
    ├── CoderRenderer.kt               CREATE — hoodie, </>
    ├── ResearcherRenderer.kt          CREATE — glasses, 📚
    ├── ReviewerRenderer.kt            CREATE — monocle, 🔍
    └── TesterRenderer.kt              CREATE — checkmark, ✓
```

---

## Phase 0 — Stub for Compilation

Create empty stub so Dev A's `StageToolWindowFactory` compiles while Dev B implements:

```kotlin
// StagePanel.kt — initial stub
class StagePanel(project: Project) : JPanel(), StageUIListener {
    override fun onAgentRegistered(agent: Agent) {}
    override fun onTaskStarted(task: AgentTask) {}
    override fun onTaskCompleted(taskId: String, agentId: String, result: String) {}
}
```

Replace with full implementation in Phase 5.

---

## Phase 1 — AvatarRenderer Interface (OCP foundation)

### `avatars/AvatarRenderer.kt`
```kotlin
package com.example.mcpassistant.ui.avatars

import com.example.mcpassistant.ui.AvatarComponent
import java.awt.Color
import java.awt.Graphics2D
import java.awt.Rectangle

/**
 * Stable interface. To add a new agent type: implement this interface,
 * add one register() call in AvatarRendererRegistry. No existing code changes.
 */
interface AvatarRenderer {
    val agentType: String        // matches Agent.type from MCP
    val displayName: String
    val headColor: Color
    val bodyColor: Color

    /** Draw the avatar body, role icon, accessories. g2d origin = component top-left. */
    fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State)

    /** Small role icon overlaid on body center. */
    fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int)
}
```

### `avatars/AvatarRendererRegistry.kt`
```kotlin
package com.example.mcpassistant.ui.avatars

object AvatarRendererRegistry {
    private val renderers = mutableMapOf<String, AvatarRenderer>()
    private val fallback: AvatarRenderer = DefaultRobotRenderer()

    init {
        register(OrchestratorRenderer())
        register(CoderRenderer())
        register(ResearcherRenderer())
        register(ReviewerRenderer())
        register(TesterRenderer())
    }

    fun register(renderer: AvatarRenderer) {
        renderers[renderer.agentType] = renderer
    }

    fun get(agentType: String): AvatarRenderer = renderers[agentType] ?: fallback

    fun all(): List<AvatarRenderer> = renderers.values.toList()
}
```

---

## Phase 2 — AvatarComponent

```kotlin
package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.ui.avatars.AvatarRendererRegistry
import java.awt.*
import javax.swing.JComponent

class AvatarComponent(val agent: Agent) : JComponent() {

    enum class State {
        SEATED,
        SEATED_SCRATCH,    // scratching head: arm arc animation
        SEATED_LOOK_AROUND, // head left/right skew
        WALKING,
        ON_STAGE,
        DISAPPEARING
    }

    var state: State = State.SEATED
    var animFrame: Int = 0
    var alpha: Float = 1.0f         // for DISAPPEARING fade
    var stageScale: Float = 1.0f    // grows from 1.0 → 2.0 as avatar walks to stage

    // Random idle animation timing
    var nextIdleAnimAt: Long = System.currentTimeMillis() + randomIdleDelay()
    private var idleAnimFrame: Int = 0

    private val renderer = AvatarRendererRegistry.get(agent.type)

    init {
        preferredSize = Dimension(72, 88)  // 64px avatar + 24px label
        toolTipText = "${agent.name} (${agent.type})"
        isOpaque = false
    }

    override fun paintComponent(g: Graphics) {
        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)

        val origComposite = g2d.composite
        if (alpha < 1f) {
            g2d.composite = AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha)
        }

        // Breathing scale for seated idle
        val breathScale = if (state == State.SEATED)
            1.0f + (Math.sin(animFrame * 0.05) * 0.02).toFloat()
        else stageScale

        val cx = width / 2
        val avatarSize = (64 * breathScale).toInt()
        val avatarBounds = Rectangle(cx - avatarSize / 2, 0, avatarSize, avatarSize)

        // Draw head
        drawHead(g2d, avatarBounds)
        // Draw body (delegated to renderer)
        renderer.drawBody(g2d, avatarBounds, animFrame, state)
        // Draw role icon
        renderer.drawRoleIcon(g2d, cx, avatarBounds.y + avatarSize / 2, 12)
        // Draw eyes (with blink)
        drawEyes(g2d, avatarBounds)
        // Draw idle overlays (scratch arm, look-around)
        drawIdleAnimation(g2d, avatarBounds)
        // Draw name label
        drawNameLabel(g2d, avatarBounds)

        g2d.composite = origComposite
    }

    private fun drawHead(g2d: Graphics2D, bounds: Rectangle) {
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val headY = bounds.y
        g2d.color = AvatarRendererRegistry.get(agent.type).headColor
        g2d.fillOval(headX, headY, headSize, headSize)
        g2d.color = g2d.color.darker()
        g2d.drawOval(headX, headY, headSize, headSize)
    }

    private fun drawEyes(g2d: Graphics2D, bounds: Rectangle) {
        val blink = animFrame % 180 in 178..180  // blink every 3 seconds at 60fps
        val headSize = bounds.width / 2
        val headX = bounds.x + bounds.width / 4
        val eyeY = bounds.y + headSize / 3
        g2d.color = Color.WHITE
        if (!blink) {
            g2d.fillOval(headX + 4, eyeY, 6, 6)
            g2d.fillOval(headX + headSize - 10, eyeY, 6, 6)
            g2d.color = Color.BLACK
            g2d.fillOval(headX + 6, eyeY + 2, 3, 3)
            g2d.fillOval(headX + headSize - 8, eyeY + 2, 3, 3)
        } else {
            // Closed eyes: horizontal lines
            g2d.color = Color.DARK_GRAY
            g2d.drawLine(headX + 4, eyeY + 3, headX + 10, eyeY + 3)
            g2d.drawLine(headX + headSize - 10, eyeY + 3, headX + headSize - 4, eyeY + 3)
        }
    }

    private fun drawIdleAnimation(g2d: Graphics2D, bounds: Rectangle) {
        when (state) {
            State.SEATED_SCRATCH -> {
                // Arm arc from side up to head
                val progress = (idleAnimFrame % 16) / 16.0
                val armAngle = (Math.PI * 0.5 * Math.sin(progress * Math.PI)).toFloat()
                val cx = bounds.x + bounds.width / 2
                val shoulderY = bounds.y + bounds.height * 2 / 3
                g2d.color = AvatarRendererRegistry.get(agent.type).bodyColor
                g2d.stroke = BasicStroke(3f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
                val armLen = bounds.width / 3
                val armEndX = (cx + armLen * Math.cos(armAngle - Math.PI / 4)).toInt()
                val armEndY = (shoulderY - armLen * Math.sin(armAngle)).toInt()
                g2d.drawLine(cx, shoulderY.toInt(), armEndX, armEndY)
            }
            State.SEATED_LOOK_AROUND -> {
                // Head skew left/right — already handled in drawHead via transform
                // Apply AffineTransform skew based on idleAnimFrame
                // (see full impl: save/restore g2d transform around drawHead call)
            }
            else -> {}
        }
        idleAnimFrame++
    }

    private fun drawNameLabel(g2d: Graphics2D, bounds: Rectangle) {
        g2d.color = UIManager.getColor("Label.foreground") ?: Color.WHITE
        g2d.font = Font("SansSerif", Font.PLAIN, 10)
        val fm = g2d.fontMetrics
        val labelX = bounds.x + (bounds.width - fm.stringWidth(agent.name)) / 2
        g2d.drawString(agent.name, labelX, bounds.y + bounds.height + 14)
    }

    companion object {
        fun randomIdleDelay() = (5000L + (Math.random() * 10000).toLong())
    }
}
```

---

## Phase 3 — Built-in AvatarRenderers

### `avatars/DefaultRobotRenderer.kt`
```kotlin
class DefaultRobotRenderer : AvatarRenderer {
    override val agentType = "default"
    override val displayName = "Robot"
    override val headColor = Color(100, 149, 237)  // cornflower blue
    override val bodyColor = Color(70, 130, 180)

    override fun drawBody(g2d: Graphics2D, bounds: Rectangle, frame: Int, state: AvatarComponent.State) {
        val bodyX = bounds.x + bounds.width / 4
        val bodyY = bounds.y + bounds.height / 2
        val bodyW = bounds.width / 2
        val bodyH = bounds.height / 3
        g2d.color = bodyColor
        g2d.fillRoundRect(bodyX, bodyY, bodyW, bodyH, 6, 6)
    }

    override fun drawRoleIcon(g2d: Graphics2D, cx: Int, cy: Int, size: Int) {
        g2d.color = Color.WHITE
        g2d.font = Font("Monospaced", Font.BOLD, size)
        g2d.drawString("🤖", cx - size / 2, cy + size / 2)
    }
}
```

### Pattern for all other renderers (same structure, different colors + icons):

| Renderer | `agentType` | `headColor` | Icon | Body accessory |
|---|---|---|---|---|
| `OrchestratorRenderer` | `orchestrator` | `Color(218,165,32)` gold | `🎩` | top hat drawn above head |
| `CoderRenderer` | `coder` | `Color(50,205,50)` lime | `</>` drawString | hoodie shape (larger RR) |
| `ResearcherRenderer` | `researcher` | `Color(147,112,219)` purple | `📚` | glasses: two ovals on face |
| `ReviewerRenderer` | `reviewer` | `Color(255,140,0)` orange | `🔍` | monocle: single oval on one eye |
| `TesterRenderer` | `tester` | `Color(220,20,60)` crimson | `✓` drawString | clipboard shape below body |

Each renderer file follows identical structure to `DefaultRobotRenderer` — only colors, icon, and accessory differ.

---

## Phase 4 — AnimationEngine

```kotlin
package com.example.mcpassistant.ui

import javax.swing.Timer
import kotlin.math.*

class AnimationEngine {

    sealed class Animation {
        abstract val avatar: AvatarComponent
        abstract var done: Boolean

        data class WalkToStage(
            override val avatar: AvatarComponent,
            var progress: Float = 0f,
            val startPos: java.awt.Point,
            val endPos: java.awt.Point,
            val onComplete: () -> Unit
        ) : Animation() {
            override var done = false
        }

        data class Disappear(
            override val avatar: AvatarComponent,
            val onComplete: () -> Unit
        ) : Animation() {
            override var done = false
        }

        data class ReturnToSeat(
            override val avatar: AvatarComponent,
            val seatPos: java.awt.Point,
            val onComplete: () -> Unit
        ) : Animation() {
            var progress: Float = 0f
            override var done = false
        }
    }

    private val animations = mutableListOf<Animation>()
    private val timer = Timer(16) { tick() }  // ~60fps, EDT-safe

    fun start() { timer.start() }
    fun stop() { timer.stop() }

    fun walkToStage(avatar: AvatarComponent, startPos: java.awt.Point, endPos: java.awt.Point, onComplete: () -> Unit) {
        avatar.state = AvatarComponent.State.WALKING
        animations.add(Animation.WalkToStage(avatar, startPos = startPos, endPos = endPos, onComplete = onComplete))
    }

    fun disappear(avatar: AvatarComponent, onComplete: () -> Unit) {
        animations.add(Animation.Disappear(avatar, onComplete))
    }

    fun returnToSeat(avatar: AvatarComponent, seatPos: java.awt.Point, onComplete: () -> Unit) {
        animations.add(Animation.ReturnToSeat(avatar, seatPos, onComplete))
    }

    private fun tick() {
        val iter = animations.iterator()
        while (iter.hasNext()) {
            val anim = iter.next()
            when (anim) {
                is Animation.WalkToStage -> tickWalk(anim)
                is Animation.Disappear -> tickDisappear(anim)
                is Animation.ReturnToSeat -> tickReturn(anim)
            }
            anim.avatar.animFrame++
            anim.avatar.repaint()
            if (anim.done) iter.remove()
        }

        // Tick all avatars not in animation (idle)
        tickIdleAnimations()
    }

    private fun tickWalk(anim: Animation.WalkToStage) {
        anim.progress = min(1f, anim.progress + 0.016f)  // ~0.6s total
        // Easing: ease-in-out
        val t = easeInOut(anim.progress)
        val x = lerp(anim.startPos.x.toFloat(), anim.endPos.x.toFloat(), t).toInt()
        val y = lerp(anim.startPos.y.toFloat(), anim.endPos.y.toFloat(), t).toInt()
        // Bob: small sin wave during walk
        val bob = (sin(anim.avatar.animFrame * 0.8) * 3).toInt()
        anim.avatar.bounds = java.awt.Rectangle(x, y + bob, anim.avatar.width, anim.avatar.height)
        // Scale grows as avatar approaches stage
        anim.avatar.stageScale = lerp(1f, 2f, t)
        if (anim.progress >= 1f) {
            anim.avatar.state = AvatarComponent.State.ON_STAGE
            anim.done = true
            anim.onComplete()
        }
    }

    private fun tickDisappear(anim: Animation.Disappear) {
        anim.avatar.alpha = max(0f, anim.avatar.alpha - 0.033f)  // ~0.5s fade
        if (anim.avatar.alpha <= 0f) {
            anim.done = true
            anim.avatar.isVisible = false
            anim.onComplete()
        }
    }

    private fun tickReturn(anim: Animation.ReturnToSeat) {
        anim.progress = min(1f, anim.progress + 0.025f)
        val t = easeInOut(anim.progress)
        anim.avatar.stageScale = lerp(2f, 1f, t)
        anim.avatar.alpha = min(1f, anim.avatar.alpha + 0.05f)
        if (anim.progress >= 1f) {
            anim.avatar.state = AvatarComponent.State.SEATED
            anim.avatar.isVisible = true
            anim.done = true
            anim.onComplete()
        }
    }

    private fun tickIdleAnimations() {
        // Managed separately — idle avatars not in animations list
        // Call from StagePanel for all seated avatars
    }

    private fun easeInOut(t: Float) = (3 * t * t - 2 * t * t * t)
    private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t
}
```

---

## Phase 5 — AudiencePanel

```kotlin
class AudiencePanel : JPanel() {
    private val seats = mutableListOf<AvatarComponent?>()  // null = empty seat
    private val COLS = 8
    private val ROWS = 2
    private val SEAT_W = 80
    private val SEAT_H = 100

    init {
        layout = null  // absolute positioning for animation
        preferredSize = Dimension(COLS * SEAT_W, ROWS * SEAT_H)
        background = Color(20, 20, 40)  // dark theater
        repeat(COLS * ROWS) { seats.add(null) }
    }

    fun addAgent(avatar: AvatarComponent): java.awt.Point {
        val idx = seats.indexOfFirst { it == null }
        if (idx == -1) return java.awt.Point(0, 0)
        seats[idx] = avatar
        val col = idx % COLS
        val row = idx / COLS
        val x = col * SEAT_W + (SEAT_W - avatar.preferredSize.width) / 2
        val y = row * SEAT_H + 10
        avatar.bounds = java.awt.Rectangle(x, y, avatar.preferredSize.width, avatar.preferredSize.height)
        add(avatar)
        repaint()
        return java.awt.Point(x, y)
    }

    fun getSeatPosition(avatar: AvatarComponent): java.awt.Point? {
        val idx = seats.indexOf(avatar)
        if (idx == -1) return null
        val col = idx % COLS
        val row = idx / COLS
        return java.awt.Point(col * SEAT_W + (SEAT_W - avatar.preferredSize.width) / 2, row * SEAT_H + 10)
    }

    fun removeAgent(avatar: AvatarComponent) {
        val idx = seats.indexOf(avatar)
        if (idx != -1) seats[idx] = null
        remove(avatar)
        repaint()
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        val g2d = g as Graphics2D
        // Draw seat chairs
        g2d.color = Color(40, 40, 60)
        for (row in 0 until ROWS) {
            for (col in 0 until COLS) {
                val x = col * SEAT_W + 8
                val y = row * SEAT_H + 60
                g2d.fillRoundRect(x, y, 60, 30, 8, 8)  // seat back
                g2d.fillRoundRect(x + 5, y + 20, 50, 15, 4, 4)  // seat cushion
            }
        }
    }
}
```

---

## Phase 6 — StageCenterPanel

```kotlin
class StageCenterPanel : JPanel() {
    var activeAvatar: AvatarComponent? = null
    var spotlightIntensity: Float = 0f  // 0.0 → 1.0, fades in when avatar arrives

    init {
        layout = BorderLayout()
        background = Color(10, 10, 25)
        preferredSize = Dimension(400, 220)
    }

    fun showAvatar(avatar: AvatarComponent) {
        activeAvatar?.let { remove(it) }
        activeAvatar = avatar
        add(avatar, BorderLayout.CENTER)
        // Fade in spotlight via AnimationEngine timer ticks
        spotlightIntensity = 0f
        revalidate()
        repaint()
    }

    fun clearStage() {
        activeAvatar?.let { remove(it) }
        activeAvatar = null
        spotlightIntensity = 0f
        repaint()
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

        // Stage floor
        g2d.color = Color(30, 20, 10)
        g2d.fillRect(0, height - 30, width, 30)
        g2d.color = Color(60, 40, 20)
        g2d.drawLine(0, height - 30, width, height - 30)

        // Spotlight radial gradient
        if (spotlightIntensity > 0f) {
            val cx = width / 2f
            val cy = height / 2f
            val radius = minOf(width, height) * 0.6f
            val gradient = RadialGradientPaint(
                cx, cy, radius,
                floatArrayOf(0f, 1f),
                arrayOf(
                    Color(255, 255, 200, (180 * spotlightIntensity).toInt()),
                    Color(0, 0, 0, 0)
                )
            )
            g2d.paint = gradient
            g2d.fillOval((cx - radius).toInt(), (cy - radius).toInt(), (radius * 2).toInt(), (radius * 2).toInt())
        }
    }
}
```

---

## Phase 7 — TaskBubblePanel

```kotlin
class TaskBubblePanel : JPanel() {
    private var text: String = ""
    private val bubbleColor = Color(255, 255, 240, 230)
    private val textColor = Color(30, 30, 30)

    init {
        isOpaque = false
        preferredSize = Dimension(380, 80)
    }

    fun setText(newText: String) {
        text = newText
        repaint()
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        if (text.isBlank()) return
        val g2d = g as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)

        // Bubble background
        g2d.color = bubbleColor
        g2d.fillRoundRect(10, 10, width - 20, height - 20, 20, 20)
        g2d.color = Color(180, 180, 140)
        g2d.drawRoundRect(10, 10, width - 20, height - 20, 20, 20)

        // Bubble tail (triangle pointing up toward avatar)
        val tail = intArrayOf(width / 2 - 8, 10, width / 2 + 8, 10, width / 2, 0)
        g2d.color = bubbleColor
        g2d.fillPolygon(tail.take(2).toIntArray() + intArrayOf(tail[4]),
                        tail.drop(1).take(2).toIntArray() + intArrayOf(tail[5]), 3)

        // Text (word-wrapped)
        g2d.color = textColor
        g2d.font = Font("SansSerif", Font.ITALIC, 13)
        drawWrappedText(g2d, text, 22, 30, width - 44)
    }

    private fun drawWrappedText(g2d: Graphics2D, text: String, x: Int, y: Int, maxWidth: Int) {
        val fm = g2d.fontMetrics
        val words = text.split(" ")
        var line = ""
        var lineY = y
        for (word in words) {
            val test = if (line.isEmpty()) word else "$line $word"
            if (fm.stringWidth(test) > maxWidth) {
                g2d.drawString(line, x, lineY)
                line = word
                lineY += fm.height + 2
            } else {
                line = test
            }
        }
        if (line.isNotEmpty()) g2d.drawString(line, x, lineY)
    }
}
```

---

## Phase 8 — StagePanel (top-level, implements StageUIListener)

```kotlin
class StagePanel(private val project: Project) : SimpleToolWindowPanel(false, true), StageUIListener {

    private val audiencePanel = AudiencePanel()
    private val stageCenterPanel = StageCenterPanel()
    private val taskBubble = TaskBubblePanel()
    private val animEngine = AnimationEngine()
    private val avatarMap = ConcurrentHashMap<String, AvatarComponent>() // agentId → avatar

    init {
        val stageArea = JPanel(BorderLayout()).apply {
            background = Color(10, 10, 25)
            add(stageCenterPanel, BorderLayout.CENTER)
            add(taskBubble, BorderLayout.SOUTH)
        }
        setContent(JSplitPane(JSplitPane.VERTICAL_SPLIT, stageArea, audiencePanel).apply {
            resizeWeight = 0.6
            isContinuousLayout = true
            border = null
        })
        animEngine.start()

        // Idle tick for seated avatars
        Timer(16) { tickIdleAvatars() }.start()
    }

    // ── StageUIListener ──────────────────────────────────────────────

    override fun onAgentRegistered(agent: Agent) {
        val avatar = AvatarComponent(agent)
        avatarMap[agent.id] = avatar
        audiencePanel.addAgent(avatar)
    }

    override fun onTaskStarted(task: AgentTask) {
        val avatar = avatarMap[task.agentId] ?: return
        val seatPos = audiencePanel.getSeatPosition(avatar) ?: return
        val stagePos = java.awt.Point(stageCenterPanel.width / 2 - avatar.width / 2, 20)

        // Get humorous task text (call Dev A's HumorousTaskGenerator)
        val humorText = HumorousTaskGenerator.generate(task)
        taskBubble.setText(humorText)

        // Walk animation
        animEngine.walkToStage(avatar, seatPos, stagePos) {
            // On arrive: show on stage + TTS
            stageCenterPanel.showAvatar(avatar)
            project.service<AgentRegistryService>()  // just to confirm wiring
            service<ElevenLabsService>().speak(humorText, task.agentId.let { avatarMap[it]?.agent?.type ?: "default" }) {}
        }
    }

    override fun onTaskCompleted(taskId: String, agentId: String, result: String) {
        val avatar = avatarMap[agentId] ?: return
        service<ElevenLabsService>().playCompletionSound()

        // Disappear from stage
        animEngine.disappear(avatar) {
            stageCenterPanel.clearStage()
            taskBubble.setText("")
            // Re-add to audience (fade back in)
            avatar.alpha = 0f
            avatar.isVisible = true
            val seatPos = audiencePanel.getSeatPosition(avatar) ?: return@disappear
            animEngine.returnToSeat(avatar, seatPos) {}
        }
    }

    // ── Idle animations ──────────────────────────────────────────────

    private fun tickIdleAvatars() {
        val now = System.currentTimeMillis()
        avatarMap.values.filter { it.state == AvatarComponent.State.SEATED }.forEach { avatar ->
            if (now > avatar.nextIdleAnimAt) {
                val idleStates = listOf(AvatarComponent.State.SEATED_SCRATCH, AvatarComponent.State.SEATED_LOOK_AROUND)
                avatar.state = idleStates.random()
                // Return to SEATED after animation completes (~600ms)
                Timer(600) {
                    avatar.state = AvatarComponent.State.SEATED
                    avatar.nextIdleAnimAt = now + AvatarComponent.randomIdleDelay()
                }.apply { isRepeats = false; start() }
            }
            avatar.repaint()
        }
    }
}
```

---

## Verification (Dev B)

1. Create stub `StagePanel` (Phase 0) immediately — unblocks Dev A's `StageToolWindowFactory` compilation
2. `./gradlew compileKotlin` — no errors with stub in place
3. Implement phases 1–7 in any order (all independent)
4. Implement Phase 8 (`StagePanel`) last — depends on all other UI classes
5. `./gradlew runIde` — IntelliJ sandbox opens:
   - Agent Stage tool window visible at bottom
   - Upper half: dark stage area with spotlight
   - Lower half: dark audience area with chair shapes
6. Test via Dev A's mcpServer (once merged):
   - Send `agent/register` → avatar appears in audience, seated idle animation runs
   - Wait 5-15s → avatar scratches head or looks around randomly
   - Send `task/start` → avatar walks to stage, speech bubble appears, spotlight fades in
   - Send `task/complete` → completion sound, avatar fades from stage, reappears in seat

---

## Handoff from Dev A (what you need)

Dev A must deliver **Phase 0** before you start:
- `com.example.mcpassistant.model.Agent`
- `com.example.mcpassistant.model.AgentTask`
- `com.example.mcpassistant.ui.StageUIListener`

Dev A's `AgentRegistryService` interface (for listener wiring) — you only need `addListener(StageUIListener)`.
Dev A's `ElevenLabsService.speak()` and `playCompletionSound()` — call from `StagePanel`.
Dev A's `HumorousTaskGenerator.generate(AgentTask)` — call from `StagePanel.onTaskStarted()`.
