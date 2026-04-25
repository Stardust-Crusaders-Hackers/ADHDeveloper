package com.example.mcpassistant.services

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.model.TaskStatus
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import java.io.File
import java.io.PrintWriter
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@Service(Service.Level.PROJECT)
class MCPBridgeService(private val project: Project) : Disposable {

    private val registry get() = project.service<AgentRegistryService>()
    private val mapper = jacksonObjectMapper()
    private var process: Process? = null
    private val readerThread = Executors.newSingleThreadExecutor()
    private val pollExecutor = Executors.newSingleThreadScheduledExecutor()
    private val requestId = AtomicInteger(1)
    private var writer: PrintWriter? = null

    // Track known IDs to detect new arrivals on each poll
    private val knownAgentIds = mutableSetOf<String>()
    private val knownTaskIds = mutableSetOf<String>()

    fun start(mcpDir: File) {
        val pb = ProcessBuilder("node", "dist/index.js")
            .directory(mcpDir)
            .redirectErrorStream(false)
        process = pb.start()
        writer = PrintWriter(process!!.outputStream.bufferedWriter(), true)

        readerThread.submit { readLoop() }

        // MCP initialization handshake
        sendRaw(mapOf(
            "jsonrpc" to "2.0", "id" to requestId.getAndIncrement(),
            "method" to "initialize",
            "params" to mapOf(
                "protocolVersion" to "2024-11-05",
                "capabilities" to emptyMap<String, Any>(),
                "clientInfo" to mapOf("name" to "IntelliJPlugin", "version" to "1.0")
            )
        ))

        // Poll every 2s for agent/task state changes
        pollExecutor.scheduleAtFixedRate({ poll() }, 2, 2, TimeUnit.SECONDS)
    }

    private fun poll() {
        callTool("agents/list", emptyMap())
        callTool("tasks/active", emptyMap())
    }

    private fun readLoop() {
        process?.inputStream?.bufferedReader()?.forEachLine { line ->
            try {
                val msg = mapper.readTree(line)
                if (msg.has("id") && msg.has("result")) handleResponse(msg)
            } catch (_: Exception) {}
        }
    }

    private fun handleResponse(msg: JsonNode) {
        val result = msg["result"] ?: return
        // MCP tool response: result.content[0].text contains JSON payload
        val text = result["content"]?.get(0)?.get("text")?.asText() ?: return
        val data = runCatching { mapper.readTree(text) }.getOrNull() ?: return

        data["agents"]?.forEach { node ->
            val agent = node.toAgent()
            if (knownAgentIds.add(agent.id)) registry.registerAgent(agent)
        }
        data["tasks"]?.forEach { node ->
            val task = node.toTask()
            if (knownTaskIds.add(task.taskId)) registry.startTask(task)
        }
    }

    fun callTool(name: String, arguments: Map<String, Any>) {
        sendRaw(mapOf(
            "jsonrpc" to "2.0",
            "id" to requestId.getAndIncrement(),
            "method" to "tools/call",
            "params" to mapOf("name" to name, "arguments" to arguments)
        ))
    }

    private fun sendRaw(payload: Any) {
        writer?.println(mapper.writeValueAsString(payload))
    }

    private fun JsonNode.toAgent() = Agent(
        id = this["id"].asText(),
        name = this["name"].asText(),
        type = this["type"].asText(),
        description = this["description"]?.asText() ?: ""
    )

    private fun JsonNode.toTask() = AgentTask(
        taskId = this["taskId"].asText(),
        agentId = this["agentId"].asText(),
        description = this["description"].asText(),
        status = TaskStatus.valueOf(this["status"]?.asText()?.uppercase() ?: "ACTIVE"),
        result = this["result"]?.asText() ?: ""
    )

    override fun dispose() {
        pollExecutor.shutdownNow()
        process?.destroy()
        readerThread.shutdownNow()
    }
}
