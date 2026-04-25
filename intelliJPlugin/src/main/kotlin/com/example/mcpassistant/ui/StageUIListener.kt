package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask

interface StageUIListener {
    fun onAgentRegistered(agent: Agent)
    fun onTaskStarted(task: AgentTask)
    fun onTaskCompleted(taskId: String, agentId: String, result: String)
    fun onStagePresentation(presentationId: String, agentId: String, text: String)
}
