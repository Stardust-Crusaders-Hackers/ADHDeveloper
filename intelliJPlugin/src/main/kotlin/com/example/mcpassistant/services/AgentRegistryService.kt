package com.example.mcpassistant.services

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.ui.StageUIListener
import com.intellij.openapi.components.Service
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import javax.swing.SwingUtilities

enum class AgentStatus { IDLE, WORKING, PRESENTING }

data class AgentState(val agent: Agent, var status: AgentStatus = AgentStatus.IDLE)

@Service(Service.Level.PROJECT)
class AgentRegistryService {

    private val agents = ConcurrentHashMap<String, AgentState>()
    private val listeners = CopyOnWriteArrayList<StageUIListener>()

    fun registerAgent(agent: Agent) {
        val state = AgentState(agent)
        agents[agent.id] = state
        fireOnEdt { it.onAgentRegistered(agent) }
    }

    fun getAgents(): List<AgentState> = agents.values.toList()

    fun getAgent(id: String): AgentState? = agents[id]

    fun addListener(listener: StageUIListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: StageUIListener) {
        listeners.remove(listener)
    }

    fun notifyTaskStarted(task: AgentTask) {
        agents[task.agentId]?.status = AgentStatus.WORKING
        fireOnEdt { it.onTaskStarted(task) }
    }

    fun notifyTaskCompleted(taskId: String, agentId: String, result: String) {
        agents[agentId]?.status = AgentStatus.IDLE
        fireOnEdt { it.onTaskCompleted(taskId, agentId, result) }
    }

    fun notifyPresentation(presentationId: String, agentId: String, text: String) {
        agents[agentId]?.status = AgentStatus.PRESENTING
        fireOnEdt { it.onStagePresentation(presentationId, agentId, text) }
    }

    private fun fireOnEdt(action: (StageUIListener) -> Unit) {
        SwingUtilities.invokeLater {
            listeners.forEach { action(it) }
        }
    }
}
