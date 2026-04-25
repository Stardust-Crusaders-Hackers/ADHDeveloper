package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.services.ElevenLabsService
import com.example.mcpassistant.settings.StageSettingsState
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBPanel
import java.awt.*
import java.util.LinkedList
import java.util.concurrent.ConcurrentHashMap
import javax.swing.*
import javax.swing.Timer

class StagePanel(private val project: Project) : JBPanel<StagePanel>(BorderLayout()), StageUIListener {

    private val audiencePanel = AudiencePanel()
    private val stageCenterPanel = StageCenterPanel()
    private val taskBubble = TaskBubblePanel()
    private val animEngine = AnimationEngine()
    private val avatarMap = ConcurrentHashMap<String, AvatarComponent>()
    private val presentingAgents = ConcurrentHashMap.newKeySet<String>()

    private val taskQueue: LinkedList<AgentTask> = LinkedList()
    private var stageOccupied = false

    init {
        background = Color(10, 10, 25)

        val stageArea = JPanel(BorderLayout()).apply {
            background = Color(10, 10, 25)
            add(stageCenterPanel, BorderLayout.CENTER)
            add(taskBubble, BorderLayout.SOUTH)
        }

        val splitPane = JSplitPane(JSplitPane.VERTICAL_SPLIT, stageArea, audiencePanel).apply {
            resizeWeight = 0.65
            isContinuousLayout = true
            border = null
            dividerSize = 4
            background = Color(10, 10, 25)
        }

        add(splitPane, BorderLayout.CENTER)
        animEngine.start()
    }

    fun syncExistingAgents() {
        service<com.example.mcpassistant.services.AgentRegistryService>().getAgents().forEach { state ->
            registerAvatar(state.agent)
        }
    }

    // ── StageUIListener ──────────────────────────────────────────────────────

    override fun onAgentRegistered(agent: Agent) {
        runOnUiThread { registerAvatar(agent) }
    }

    override fun onTaskStarted(task: AgentTask) {
        runOnUiThread {
            if (stageOccupied) {
                taskQueue.add(task)
            } else {
                walkToStage(task)
            }
        }
    }

    override fun onTaskCompleted(taskId: String, agentId: String, result: String) {
        if (agentId in presentingAgents) return
        runOnUiThread {
            val avatar = avatarMap[agentId] ?: return@runOnUiThread

            animEngine.disappear(avatar) {
                SwingUtilities.invokeLater {
                    stageCenterPanel.clearStage()
                    taskBubble.clear()
                    returnAvatarToSeat(avatar) {
                        stageOccupied = false
                        dequeueNextTask()
                    }
                }
            }
        }
    }

    override fun onStagePresentation(presentationId: String, agentId: String, text: String) {
        runOnUiThread {
            val avatar = ensureAvatar(agentId)

            presentingAgents.add(agentId)
            animEngine.cancelAnimationsFor(avatar)
            animEngine.untrackIdle(avatar)
            avatar.state = AvatarComponent.State.WALKING

            val seatPosInAudience = audiencePanel.getSeatPosition(avatar)
            val audienceInPanel = seatPosInAudience
                ?.let { SwingUtilities.convertPoint(audiencePanel, it, this) }
                ?: Point(width / 2, height - 100)

            audiencePanel.remove(avatar)
            audiencePanel.revalidate()
            audiencePanel.repaint()
            avatar.bounds = java.awt.Rectangle(audienceInPanel.x, audienceInPanel.y, avatar.preferredSize.width, avatar.preferredSize.height)
            avatar.isVisible = true
            add(avatar)
            revalidate()
            repaint()

            val stageTarget = stageCenter()
            taskBubble.setText(text)

            val settings = StageSettingsState.getInstance()
            if (settings.ttsEnabled) {
                project.service<ElevenLabsService>().speak(text, avatar.agent.type)
            }

            animEngine.walkToStage(avatar, audienceInPanel, stageTarget) {
                SwingUtilities.invokeLater {
                    stageCenterPanel.showAvatar(avatar)
                    Timer(30_000) {
                        SwingUtilities.invokeLater {
                            animEngine.disappear(avatar) {
                                SwingUtilities.invokeLater {
                                    stageCenterPanel.clearStage()
                                    taskBubble.clear()
                                    presentingAgents.remove(agentId)
                                    returnAvatarToSeat(avatar) {}
                                }
                            }
                        }
                    }.apply { isRepeats = false; start() }
                }
            }
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private fun walkToStage(task: AgentTask) {
        val avatar = avatarMap[task.agentId] ?: return
        val seatPos = audiencePanel.getSeatPosition(avatar) ?: return

        stageOccupied = true
        animEngine.untrackIdle(avatar)
        avatar.state = AvatarComponent.State.WALKING

        // Convert seat position to StagePanel coordinates
        val audienceInPanel = SwingUtilities.convertPoint(audiencePanel, seatPos, this)

        // Reparent to StagePanel so the avatar is visible while walking across panels
        audiencePanel.remove(avatar)
        audiencePanel.revalidate()
        audiencePanel.repaint()
        avatar.bounds = java.awt.Rectangle(audienceInPanel.x, audienceInPanel.y, avatar.preferredSize.width, avatar.preferredSize.height)
        avatar.isVisible = true
        add(avatar)
        revalidate()
        repaint()

        taskBubble.setText(buildHumorText(task))

        animEngine.walkToStage(avatar, audienceInPanel, stageCenter()) {
            SwingUtilities.invokeLater { stageCenterPanel.showAvatar(avatar) }
        }
    }

    private fun dequeueNextTask() {
        val next = taskQueue.poll() ?: return
        walkToStage(next)
    }

    private fun returnAvatarToSeat(avatar: AvatarComponent, onDone: () -> Unit) {
        avatar.stageScale = 1f
        avatar.alpha = 0f
        avatar.state = AvatarComponent.State.SEATED
        avatar.isVisible = true
        val seatPos = audiencePanel.getSeatPosition(avatar)
        if (seatPos != null) {
            avatar.bounds = java.awt.Rectangle(seatPos.x, seatPos.y, avatar.preferredSize.width, avatar.preferredSize.height)
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
