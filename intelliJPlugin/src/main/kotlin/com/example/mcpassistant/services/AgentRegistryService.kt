package com.example.mcpassistant.services

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.ui.StageUIListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

@Service(Service.Level.PROJECT)
class AgentRegistryService(private val project: Project) : Disposable {

    data class AgentState(
        val agent: Agent,
        var isOnStage: Boolean = false,
        var currentTask: AgentTask? = null
    )

    private val agents = ConcurrentHashMap<String, AgentState>()
    private val listeners = CopyOnWriteArrayList<StageUIListener>()

    fun addListener(l: StageUIListener, replayCurrentState: Boolean = true) {
        if (listeners.contains(l)) return
        listeners.add(l)
        if (!replayCurrentState) return

        val snapshot = agents.values.map { it.copy(currentTask = it.currentTask) }
        fireOnEDT {
            snapshot.forEach { state -> l.onAgentRegistered(state.agent) }
            snapshot.mapNotNull { it.currentTask }.forEach { task -> l.onTaskStarted(task) }
        }
    }

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

    fun stagePresentation(presentationId: String, agentId: String, text: String) {
        fireOnEDT { listeners.forEach { it.onStagePresentation(presentationId, agentId, text) } }
    }

    fun getAgents(): List<AgentState> = agents.values.toList()

    private fun fireOnEDT(block: () -> Unit) =
        ApplicationManager.getApplication().invokeLater(block)

    override fun dispose() { listeners.clear() }
}
