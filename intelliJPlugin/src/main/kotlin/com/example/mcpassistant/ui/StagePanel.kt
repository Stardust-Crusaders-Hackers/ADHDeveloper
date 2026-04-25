package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.intellij.openapi.project.Project
import javax.swing.JLabel
import javax.swing.JPanel

// Stub — Dev B replaces this with the full Swing UI implementation
class StagePanel(project: Project) : JPanel(), StageUIListener {
    init { add(JLabel("Agent Stage — UI coming soon")) }
    override fun onAgentRegistered(agent: Agent) {}
    override fun onTaskStarted(task: AgentTask) {}
    override fun onTaskCompleted(taskId: String, agentId: String, result: String) {}
}
