package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBPanel
import java.awt.*
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

    // ── StageUIListener ──────────────────────────────────────────────────────

    override fun onAgentRegistered(agent: Agent) {
        runOnUiThread {
            registerAvatar(agent)
        }
    }

    override fun onTaskStarted(task: AgentTask) {
        runOnUiThread {
            val avatar = avatarMap[task.agentId] ?: return@runOnUiThread
            val seatPos = audiencePanel.getSeatPosition(avatar) ?: return@runOnUiThread

            animEngine.untrackIdle(avatar)
            avatar.state = AvatarComponent.State.WALKING

            // Convert seat position to StagePanel coordinate space
            val audienceInPanel = SwingUtilities.convertPoint(audiencePanel, seatPos, this)
            // Use actual size if available, fallback to preferredSize
            val stageW = if (stageCenterPanel.width > 0) stageCenterPanel.width else stageCenterPanel.preferredSize.width
            val stageH = if (stageCenterPanel.height > 0) stageCenterPanel.height else stageCenterPanel.preferredSize.height
            val stageTargetX = stageW / 2 - 64
            val stageTargetY = stageH / 2 - 78
            val stageInPanel = SwingUtilities.convertPoint(stageCenterPanel, Point(stageTargetX, stageTargetY), this)

            val humorText = buildHumorText(task)
            taskBubble.setText(humorText)

            animEngine.walkToStage(avatar, audienceInPanel, stageInPanel) {
                SwingUtilities.invokeLater {
                    stageCenterPanel.showAvatar(avatar)
                }
            }
        }
    }

    override fun onTaskCompleted(taskId: String, agentId: String, result: String) {
        if (agentId in presentingAgents) return  // presentación en curso, ignorar
        runOnUiThread {
            val avatar = avatarMap[agentId] ?: return@runOnUiThread

            animEngine.disappear(avatar) {
                SwingUtilities.invokeLater {
                    stageCenterPanel.clearStage()
                    taskBubble.clear()

                    // Re-add avatar to audiencePanel at its seat before animating return
                    avatar.stageScale = 1f
                    avatar.alpha = 0f
                    avatar.state = AvatarComponent.State.SEATED
                    avatar.isVisible = true
                    val seatPos = audiencePanel.getSeatPosition(avatar)
                    if (seatPos != null) {
                        avatar.bounds = java.awt.Rectangle(seatPos.x, seatPos.y, avatar.preferredSize.width, avatar.preferredSize.height)
                        if (avatar.parent !== audiencePanel) {
                            audiencePanel.add(avatar)
                        }
                        audiencePanel.revalidate()
                        audiencePanel.repaint()
                        animEngine.returnToSeat(avatar, seatPos) {
                            SwingUtilities.invokeLater {
                                animEngine.trackIdle(avatar)
                            }
                        }
                    } else {
                        // Fallback: re-add to audience from scratch
                        audiencePanel.addAgent(avatar)
                        avatar.alpha = 1f
                        animEngine.trackIdle(avatar)
                    }
                }
            }
        }
    }

    override fun onStagePresentation(presentationId: String, agentId: String, text: String) {
        runOnUiThread {
            val avatar = ensureAvatar(agentId)

            presentingAgents.add(agentId)
            animEngine.cancelAnimationsFor(avatar)  // cancelar cualquier animación previa
            animEngine.untrackIdle(avatar)
            avatar.state = AvatarComponent.State.WALKING

            val seatPosInAudience = audiencePanel.getSeatPosition(avatar)
            val audienceInPanel = seatPosInAudience
                ?.let { SwingUtilities.convertPoint(audiencePanel, it, this) }
                ?: Point(width / 2, height - 100)

            // Reparent avatar to StagePanel so it's visible during the walk animation
            audiencePanel.remove(avatar)
            audiencePanel.revalidate()
            audiencePanel.repaint()
            avatar.bounds = java.awt.Rectangle(audienceInPanel.x, audienceInPanel.y, avatar.preferredSize.width, avatar.preferredSize.height)
            avatar.isVisible = true
            add(avatar)
            revalidate()
            repaint()

            val stageW = if (stageCenterPanel.width > 0) stageCenterPanel.width else stageCenterPanel.preferredSize.width
            val stageH = if (stageCenterPanel.height > 0) stageCenterPanel.height else stageCenterPanel.preferredSize.height
            val stageInPanel = SwingUtilities.convertPoint(
                stageCenterPanel, Point(stageW / 2 - 64, stageH / 2 - 78), this
            )

            taskBubble.setText(text)

            animEngine.walkToStage(avatar, audienceInPanel, stageInPanel) {
                SwingUtilities.invokeLater {
                    stageCenterPanel.showAvatar(avatar)
                    // After 30 seconds, return to seat automatically
                    Timer(30_000) {
                        SwingUtilities.invokeLater {
                            animEngine.disappear(avatar) {
                                SwingUtilities.invokeLater {
                                    stageCenterPanel.clearStage()
                                    taskBubble.clear()
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
                                            SwingUtilities.invokeLater { animEngine.trackIdle(avatar) }
                                        }
                                    } else {
                                        audiencePanel.addAgent(avatar)
                                        avatar.alpha = 1f
                                        animEngine.trackIdle(avatar)
                                    }
                                    presentingAgents.remove(agentId)
                                }
                            }
                        }
                    }.apply { isRepeats = false; start() }
                }
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun ensureAvatar(agentId: String): AvatarComponent {
        return avatarMap[agentId] ?: run {
            val fallbackAgent = Agent(
                id = agentId,
                name = agentId,
                type = "agent",
                description = "Auto-registered from presentation event"
            )
            registerAvatar(fallbackAgent)
        }
    }

    private fun registerAvatar(agent: Agent): AvatarComponent {
        return avatarMap.computeIfAbsent(agent.id) {
            AvatarComponent(agent).also { avatar ->
                audiencePanel.addAgent(avatar)
                animEngine.trackIdle(avatar)
            }
        }
    }

    private inline fun runOnUiThread(crossinline block: () -> Unit) {
        if (SwingUtilities.isEventDispatchThread()) {
            block()
        } else {
            SwingUtilities.invokeLater { block() }
        }
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
