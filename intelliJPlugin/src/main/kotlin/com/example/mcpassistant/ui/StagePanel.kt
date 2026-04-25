package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.components.JBPanel
import java.awt.*
import java.util.concurrent.ConcurrentHashMap
import javax.swing.*

class StagePanel(private val project: Project) : JBPanel<StagePanel>(BorderLayout()), StageUIListener {

    private val audiencePanel = AudiencePanel()
    private val stageCenterPanel = StageCenterPanel()
    private val taskBubble = TaskBubblePanel()
    private val animEngine = AnimationEngine()
    private val avatarMap = ConcurrentHashMap<String, AvatarComponent>()

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
        SwingUtilities.invokeLater {
            val avatar = AvatarComponent(agent)
            avatarMap[agent.id] = avatar
            audiencePanel.addAgent(avatar)
            animEngine.trackIdle(avatar)
        }
    }

    override fun onTaskStarted(task: AgentTask) {
        SwingUtilities.invokeLater {
            val avatar = avatarMap[task.agentId] ?: return@invokeLater
            val seatPos = audiencePanel.getSeatPosition(avatar) ?: return@invokeLater

            animEngine.untrackIdle(avatar)
            avatar.state = AvatarComponent.State.WALKING

            // Convert seat position to StagePanel coordinate space
            val audienceInPanel = SwingUtilities.convertPoint(audiencePanel, seatPos, this)
            val stageTargetX = stageCenterPanel.width / 2 - 64
            val stageTargetY = stageCenterPanel.height / 2 - 78
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
        SwingUtilities.invokeLater {
            val avatar = avatarMap[agentId] ?: return@invokeLater

            animEngine.disappear(avatar) {
                SwingUtilities.invokeLater {
                    stageCenterPanel.clearStage()
                    taskBubble.clear()

                    // Fade avatar back into audience seat
                    avatar.alpha = 0f
                    avatar.isVisible = true
                    val seatPos = audiencePanel.getSeatPosition(avatar) ?: return@invokeLater
                    animEngine.returnToSeat(avatar, seatPos) {
                        SwingUtilities.invokeLater {
                            animEngine.trackIdle(avatar)
                        }
                    }
                }
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

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
