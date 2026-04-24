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
import java.util.concurrent.atomic.AtomicInteger

@Service(Service.Level.PROJECT)
class MCPBridgeService(private val project: Project) : Disposable {

    private val registry get() = project.service<AgentRegistryService>()
    private val mapper = jacksonObjectMapper()
    private var process: Process? = null
    private val readerThread = Executors.newSingleThreadExecutor()
    private val requestId = AtomicInteger(1)
    private var writer: PrintWriter? = null

    fun start(mcpDir: File) {
        val pb = ProcessBuilder("node", "dist/index.js")
            .directory(mcpDir)
            .redirectErrorStream(false)
        process = pb.start()
        writer = PrintWriter(process!!.outputStream.bufferedWriter(), true)

        readerThread.submit { readLoop() }

        send("agents/list", emptyMap<String, Any>())
        send("tasks/active", emptyMap<String, Any>())
    }

    private fun readLoop() {
        process?.inputStream?.bufferedReader()?.forEachLine { line ->
            try {
                val msg = mapper.readTree(line)
                if (msg.has("method")) handleNotification(msg)
                else if (msg.has("id") && msg.has("result")) handleResponse(msg)
            } catch (_: Exception) {}
        }
    }

    private fun handleNotification(msg: JsonNode) {
        val params = msg["params"] ?: return
        when (msg["method"].asText()) {
            "agent/registered" -> registry.registerAgent(params.toAgent())
            "task/started"     -> registry.startTask(params.toTask())
            "task/completed"   -> registry.completeTask(
                params["taskId"].asText(),
                params["agentId"].asText(),
                params["result"]?.asText() ?: ""
            )
        }
    }

    private fun handleResponse(msg: JsonNode) {
        val result = msg["result"] ?: return
        result["agents"]?.forEach { registry.registerAgent(it.toAgent()) }
        result["tasks"]?.forEach { registry.startTask(it.toTask()) }
    }

    private fun send(method: String, params: Any) {
        val payload = mapOf("jsonrpc" to "2.0", "id" to requestId.getAndIncrement(), "method" to method, "params" to params)
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
        process?.destroy()
        readerThread.shutdownNow()
    }
}
