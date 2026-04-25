package com.example.mcpassistant.services

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.model.TaskStatus
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Service(Service.Level.PROJECT)
class MCPBridgeService(private val project: Project) : Disposable {

    private val registry get() = project.service<AgentRegistryService>()
    private val mapper = jacksonObjectMapper()
    private val pollExecutor = Executors.newSingleThreadScheduledExecutor()

    private val knownAgentIds = mutableSetOf<String>()
    private val knownTaskIds = mutableSetOf<String>()
    private val knownPresentationIds = mutableSetOf<String>()

    // Shared state file written by any MCP server process (Junie, Claude, etc.)
    private val stateFile = File(System.getProperty("java.io.tmpdir"), "adhd-bridge-state.json")

    fun start(mcpDir: File) {
        pollExecutor.scheduleAtFixedRate({ poll() }, 1, 2, TimeUnit.SECONDS)
    }

    private fun poll() {
        if (!stateFile.exists()) return
        try {
            val state = mapper.readValue<BridgeState>(stateFile)
            state.agents.forEach { node ->
                if (knownAgentIds.add(node.id)) {
                    registry.registerAgent(Agent(
                        id = node.id,
                        name = node.name,
                        type = node.type,
                        description = node.description
                    ))
                }
            }
            state.tasks.filter { it.status == "ACTIVE" }.forEach { node ->
                if (knownTaskIds.add(node.taskId)) {
                    registry.startTask(AgentTask(
                        taskId = node.taskId,
                        agentId = node.agentId,
                        description = node.description,
                        status = TaskStatus.ACTIVE,
                        result = node.result
                    ))
                }
            }
            state.tasks.filter { it.status == "COMPLETED" }.forEach { node ->
                if (knownTaskIds.contains(node.taskId)) {
                    registry.completeTask(node.taskId, node.agentId, node.result)
                    knownTaskIds.remove(node.taskId)
                }
            }
            state.presentations.filter { it.status == "PENDING" }.forEach { node ->
                if (knownPresentationIds.add(node.presentationId)) {
                    registry.stagePresentation(node.presentationId, node.agentId, node.text)
                    // Mark as SHOWN in the file so it doesn't fire again
                    ackPresentation(node.presentationId, state)
                }
            }
        } catch (_: Exception) {}
    }

    private fun ackPresentation(presentationId: String, state: BridgeState) {
        try {
            val updated = state.copy(
                presentations = state.presentations.map {
                    if (it.presentationId == presentationId) it.copy(status = "SHOWN") else it
                }
            )
            stateFile.writeText(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(updated))
        } catch (_: Exception) {}
    }

    fun callTool(name: String, arguments: Map<String, Any>) {
        // No-op: state is now shared via file, no direct process needed
    }

    override fun dispose() {
        pollExecutor.shutdownNow()
    }

    data class BridgeState(
        val agents: List<AgentNode> = emptyList(),
        val tasks: List<TaskNode> = emptyList(),
        val presentations: List<PresentationNode> = emptyList()
    )
    data class AgentNode(val id: String, val name: String, val type: String, val description: String)
    data class TaskNode(val taskId: String, val agentId: String, val description: String, val status: String, val result: String)
    data class PresentationNode(val presentationId: String, val agentId: String, val text: String, val status: String, val createdAt: Long = 0)
}
