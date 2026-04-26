package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.services.ElevenLabsService
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBPanel
import java.awt.*
import java.awt.event.HierarchyEvent
import java.util.LinkedList
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CompletableFuture
import javax.swing.*
import javax.swing.Timer

class StagePanel(private val project: Project) : JBPanel<StagePanel>(BorderLayout()), StageUIListener {

    private data class QueueEntry(val agentId: String, val text: String)

    private val audiencePanel = AudiencePanel()
    private val stageCenterPanel = StageCenterPanel()
    private val taskBubble = TaskBubblePanel()
    private val animEngine = AnimationEngine()
    private val avatarMap = ConcurrentHashMap<String, AvatarComponent>()

    private val stageQueue: LinkedList<QueueEntry> = LinkedList()
    private var stageOccupied = false
    private val activeTasks = ConcurrentHashMap<String, AgentTask>()

    init {
        background = Color(10, 10, 25)

        val stageArea = JPanel(BorderLayout()).apply {
            background = Color(10, 10, 25)
            add(stageCenterPanel, BorderLayout.CENTER)
            add(taskBubble, BorderLayout.SOUTH)
        }

        val splitPane = JSplitPane(JSplitPane.VERTICAL_SPLIT, stageArea, audiencePanel).apply {
            resizeWeight = 0.55
            isContinuousLayout = true
            border = null
            dividerSize = 2
            background = Color(10, 10, 25)
            addHierarchyListener { e ->
                if (e.changeFlags and HierarchyEvent.SHOWING_CHANGED.toLong() != 0L && isShowing) {
                    SwingUtilities.invokeLater { setDividerLocation(0.55) }
                }
            }
        }

        add(splitPane, BorderLayout.CENTER)
        animEngine.start()
    }

    fun syncExistingAgents() {
        project.service<com.example.mcpassistant.services.AgentRegistryService>().getAgents().forEach { state ->
            registerAvatar(state.agent)
        }
    }

    // ── StageUIListener ──────────────────────────────────────────────────────

    override fun onAgentRegistered(agent: Agent) {
        runOnUiThread { registerAvatar(agent) }
    }

    override fun onTaskStarted(task: AgentTask) {
        runOnUiThread {
            activeTasks[task.agentId] = task
            avatarMap[task.agentId] ?: return@runOnUiThread
            taskBubble.setText(buildHumorText(task))
        }
    }

    override fun onTaskCompleted(taskId: String, agentId: String, result: String) {
        runOnUiThread {
            val task = activeTasks.remove(agentId) ?: AgentTask(taskId, agentId, result)
            enqueueEntry(agentId, buildHumorText(task))
        }
    }

    override fun onStagePresentation(presentationId: String, agentId: String, text: String) {
        runOnUiThread {
            ensureAvatar(agentId)
            enqueueEntry(agentId, text)
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private fun enqueueEntry(agentId: String, text: String) {
        if (stageOccupied) {
            stageQueue.add(QueueEntry(agentId, text))
        } else {
            walkToStage(QueueEntry(agentId, text))
        }
    }

    private fun walkToStage(entry: QueueEntry) {
        val avatar = avatarMap[entry.agentId] ?: return
        val seatPos = audiencePanel.getSeatPosition(avatar)

        stageOccupied = true
        animEngine.untrackIdle(avatar)
        avatar.state = AvatarComponent.State.WALKING

        val audienceInPanel = seatPos
            ?.let { SwingUtilities.convertPoint(audiencePanel, it, this) }
            ?: Point(width / 2, height - 100)

        audiencePanel.remove(avatar)
        audiencePanel.revalidate()
        audiencePanel.repaint()
        avatar.bounds = Rectangle(audienceInPanel.x, audienceInPanel.y, avatar.preferredSize.width, avatar.preferredSize.height)
        avatar.isVisible = true
        add(avatar)
        revalidate()
        repaint()

        animEngine.walkToStage(avatar, audienceInPanel, stageCenter()) {
            SwingUtilities.invokeLater {
                stageCenterPanel.showAvatar(avatar)
                taskBubble.setText(entry.text)

                val tts = project.service<ElevenLabsService>().speak(entry.text, avatar.agent.id)
                val minDisplay = CompletableFuture<Void>()
                Timer(20_000) { minDisplay.complete(null) }.apply { isRepeats = false; start() }

                CompletableFuture.allOf(tts, minDisplay).thenRun {
                    SwingUtilities.invokeLater {
                        animEngine.disappear(avatar) {
                            SwingUtilities.invokeLater {
                                stageCenterPanel.clearStage()
                                taskBubble.clear()
                                returnAvatarToSeat(avatar) {
                                    stageOccupied = false
                                    dequeueNext()
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private fun dequeueNext() {
        val next = stageQueue.poll() ?: return
        Timer(1_000) { SwingUtilities.invokeLater { walkToStage(next) } }.apply { isRepeats = false; start() }
    }

    private fun returnAvatarToSeat(avatar: AvatarComponent, onDone: () -> Unit) {
        avatar.stageScale = 1f
        avatar.alpha = 0f
        avatar.state = AvatarComponent.State.SEATED
        avatar.isVisible = true
        val seatPos = audiencePanel.getSeatPosition(avatar)
        if (seatPos != null) {
            avatar.bounds = Rectangle(seatPos.x, seatPos.y, avatar.preferredSize.width, avatar.preferredSize.height)
            if (avatar.parent !== audiencePanel) audiencePanel.add(avatar)
            audiencePanel.revalidate()
            audiencePanel.repaint()
            animEngine.returnToSeat(avatar, seatPos) {
                SwingUtilities.invokeLater {
                    animEngine.trackIdle(avatar)
                    onDone()
                }
            }
        } else {
            audiencePanel.addAgent(avatar)
            avatar.alpha = 1f
            animEngine.trackIdle(avatar)
            onDone()
        }
    }

    private fun stageCenter(): Point {
        val stageW = if (stageCenterPanel.width > 0) stageCenterPanel.width else stageCenterPanel.preferredSize.width
        val stageH = if (stageCenterPanel.height > 0) stageCenterPanel.height else stageCenterPanel.preferredSize.height
        return SwingUtilities.convertPoint(stageCenterPanel, Point(stageW / 2 - 52, stageH / 2 - 64), this)
    }

    private fun ensureAvatar(agentId: String): AvatarComponent {
        return avatarMap[agentId] ?: registerAvatar(
            Agent(id = agentId, name = agentId, type = "agent", description = "Auto-registered from presentation event")
        )
    }

    private fun registerAvatar(agent: Agent): AvatarComponent {
        val existing = avatarMap[agent.id]
        if (existing != null) return existing

        System.err.println("[ADHD] UI: Registering avatar for agent: ${agent.name} (type: ${agent.type})")
        val avatar = AvatarComponent(agent)
        avatarMap[agent.id] = avatar
        audiencePanel.addAgent(avatar)
        animEngine.trackIdle(avatar)

        revalidate()
        repaint()
        System.err.println("[ADHD] UI: Avatar added to audience panel. Current audience size: ${avatarMap.size}")
        return avatar
    }

    private inline fun runOnUiThread(crossinline block: () -> Unit) {
        if (SwingUtilities.isEventDispatchThread()) block()
        else SwingUtilities.invokeLater { block() }
    }

    private fun buildHumorText(task: AgentTask): String {
        val openers = listOf(
            "Reluctantly agrees to",
            "With great sighing,",
            "Confidently misinterprets",
            "Heroically attempts to",
            "Pretends to understand"
        )
        val closers = listOf(
            "(results may vary)",
            "(coffee not included)",
            "(blame the PM)",
            "(Stack Overflow is closed)",
            "(LGTM, ship it)"
        )
        return "${openers.random()} ${task.description} ${closers.random()}"
    }

    fun dispose() {
        animEngine.stop()
    }
}
