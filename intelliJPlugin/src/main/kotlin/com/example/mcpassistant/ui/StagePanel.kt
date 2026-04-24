package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBPanel
import java.awt.BorderLayout

class StagePanel(private val project: Project) : JBPanel<StagePanel>(BorderLayout()), StageUIListener {

    override fun onAgentRegistered(agent: Agent) {}

    override fun onTaskStarted(task: AgentTask) {}

    override fun onTaskCompleted(taskId: String, agentId: String, result: String) {}
}
