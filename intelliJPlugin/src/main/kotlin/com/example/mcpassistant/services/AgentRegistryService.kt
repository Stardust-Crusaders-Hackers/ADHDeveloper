package com.example.mcpassistant.services

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.ui.StageUIListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.util.concurrent.ConcurrentHashMap

@Service(Service.Level.PROJECT)
class AgentRegistryService(private val project: Project) : Disposable {

    data class AgentState(
        val agent: Agent,
        var isOnStage: Boolean = false,
        var currentTask: AgentTask? = null
    )

    private val agents = ConcurrentHashMap<String, AgentState>()
    private val listeners = mutableListOf<StageUIListener>()

    fun addListener(l: StageUIListener) { listeners.add(l) }
    fun removeListener(l: StageUIListener) { listeners.remove(l) }

    fun registerAgent(agent: Agent) {
        if (agents.containsKey(agent.id)) return
        agents[agent.id] = AgentState(agent)
        fireOnEDT { listeners.forEach { it.onAgentRegistered(agent) } }
    }

    fun startTask(task: AgentTask) {
        agents[task.agentId]?.let {
            it.isOnStage = true
            it.currentTask = task
        }
        fireOnEDT { listeners.forEach { it.onTaskStarted(task) } }
    }

    fun completeTask(taskId: String, agentId: String, result: String) {
        agents[agentId]?.let {
            it.isOnStage = false
            it.currentTask = null
        }
        fireOnEDT { listeners.forEach { it.onTaskCompleted(taskId, agentId, result) } }
    }

    fun getAgents(): List<AgentState> = agents.values.toList()

    private fun fireOnEDT(block: () -> Unit) =
        ApplicationManager.getApplication().invokeLater(block)

    override fun dispose() { listeners.clear() }
}
