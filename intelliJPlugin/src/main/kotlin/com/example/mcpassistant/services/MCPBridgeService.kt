package com.example.mcpassistant.services

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.model.TaskStatus
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.IOException
import java.nio.charset.StandardCharsets
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.min

@Service(Service.Level.PROJECT)
class MCPBridgeService(private val project: Project) : Disposable {

    private val registry get() = project.service<AgentRegistryService>()
    private val mapper = jacksonObjectMapper()
    private val pollExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()

    private val knownAgentIds: MutableSet<String> = ConcurrentHashMap.newKeySet()
    private val seenPresentationIds: MutableSet<String> = ConcurrentHashMap.newKeySet()
    private var activeTasksById = mutableMapOf<String, RunningAgentNode>()

    private var mcpDir: File? = null
    private var mcpClient: StdioMcpClient? = null
    private var mcpFailureCount: Int = 0
    private var nextMcpAttemptAt: Long = 0L

    @Synchronized
    fun start(mcpDir: File? = null) {
        System.err.println("[MCP] Bridge start requested. Current Dir: ${this.mcpDir?.name}, New Dir: ${mcpDir?.name}")
        
        if (this.mcpDir == mcpDir && mcpClient != null) {
            System.err.println("[MCP] Dir unchanged and client exists, skipping restart.")
            return
        }
        
        closeMcpClient()
        this.mcpDir = mcpDir
        knownAgentIds.addAll(registry.getAgents().map { it.agent.id })
        
        // Ensure we are polling
        try {
            pollExecutor.scheduleAtFixedRate({ poll() }, 1, 1, TimeUnit.SECONDS)
            System.err.println("[MCP] Polling scheduled.")
        } catch (e: Exception) {
            // Already scheduled or other issue
            System.err.println("[MCP] Polling already active or failed to schedule: ${e.message}")
        }
    }

    private fun poll() {
        val dir = mcpDir
        if (dir == null) {
            closeMcpClient()
            return
        }
        pollFromMcp()
    }

    private fun pollFromMcp(): Boolean {
        val dir = mcpDir ?: return false
        val now = System.currentTimeMillis()
        if (now < nextMcpAttemptAt) return false

        return try {
            val client = ensureMcpClient(dir)
            
            // 1. Sync agents
            try {
                val agents = client.callListAgents(timeoutMs = 1500)
                agents.forEach { summary ->
                    if (knownAgentIds.add(summary.id)) {
                        registry.registerAgent(
                            Agent(
                                id = summary.id,
                                name = summary.name,
                                type = summary.type,
                                description = summary.description
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                System.err.println("[MCP] Failed to sync agents: ${e.message}")
            }

            // 2. Sync flow state
            val snapshot = client.callFlowState(timeoutMs = 1500)
            applyMcpSnapshot(snapshot)
            
            mcpFailureCount = 0
            nextMcpAttemptAt = 0L
            true
        } catch (e: Exception) {
            System.err.println("[MCP] Poll failed: ${e.message}")
            e.printStackTrace()
            mcpFailureCount += 1
            val backoff = computeBackoffMs(mcpFailureCount)
            nextMcpAttemptAt = now + backoff
            closeMcpClient()
            false
        }
    }

    private fun applyMcpSnapshot(snapshot: FlowStateSnapshot) {
        val current = snapshot.runningAgents.associateBy { it.taskId }

        current.values.forEach { running ->
            ensureAgentRegistered(running.agentName) // Fallback registration
            if (!activeTasksById.containsKey(running.taskId)) {
                registry.startTask(
                    AgentTask(
                        taskId = running.taskId,
                        agentId = running.agentName,
                        description = "Executing flow ${running.flowId}",
                        status = TaskStatus.ACTIVE,
                    )
                )
            }
        }

        activeTasksById.values
            .filter { previous -> !current.containsKey(previous.taskId) }
            .forEach { previous ->
                registry.completeTask(previous.taskId, previous.agentName, "")
            }

        activeTasksById = current.toMutableMap()
    }

    private fun handleServerNotification(method: String, params: JsonNode) {
        when (method) {
            "notifications/presentation" -> {
                val id        = params.path("presentationId").asText().ifBlank { return }
                val agentId   = params.path("agentId").asText().ifBlank { return }
                val agentName = params.path("agentName").asText()
                val agentType = params.path("agentType").asText()
                val text      = params.path("text").asText().ifBlank { return }
                if (!seenPresentationIds.add(id)) return
                if (knownAgentIds.add(agentId))
                    registry.registerAgent(Agent(id = agentId, name = agentName, type = agentType, description = ""))
                registry.stagePresentation(id, agentId, text)
            }
        }
    }

    private fun ensureAgentRegistered(agentId: String) {
        if (!knownAgentIds.add(agentId)) return
        registry.registerAgent(
            Agent(
                id = agentId,
                name = agentId,
                type = "agent",
                description = "Auto-registered from MCP bridge",
            )
        )
    }

    private fun computeBackoffMs(failures: Int): Long {
        val capped = min(failures, 5)
        val exponential = 1L shl (capped - 1)
        return min(30_000L, 1_000L * exponential)
    }

    fun callTool(name: String, arguments: Map<String, Any>) {
        // Reserved for future explicit bridge calls.
    }

    override fun dispose() {
        pollExecutor.shutdownNow()
        closeMcpClient()
    }

    private fun ensureMcpClient(dir: File): StdioMcpClient {
        val existing = mcpClient
        if (existing != null && existing.isAlive()) return existing

        val distEntry = File(dir, "dist/index.js")
        val created = StdioMcpClient(mapper, dir, distEntry) { method, params ->
            handleServerNotification(method, params)
        }
        created.connect()
        mcpClient = created
        return created
    }

    private fun closeMcpClient() {
        mcpClient?.close()
        mcpClient = null
    }

    data class FlowStateSnapshot(
        val activeFlows: Int = 0,
        val flows: List<FlowNode> = emptyList(),
        val runningAgents: List<RunningAgentNode> = emptyList(),
        val timestamp: Long = 0,
    )

    data class FlowNode(
        val id: String,
        val createdAt: Long,
        val updatedAt: Long,
        val ageMs: Long,
        val participants: List<String> = emptyList(),
        val stepsCount: Int = 0,
    )

    data class RunningAgentNode(
        val taskId: String,
        val flowId: String,
        val agentName: String,
        val startedAt: Long,
    )

    data class AgentSummaryNode(
        val id: String,
        val name: String,
        val type: String,
        val description: String,
        val keywords: List<String>
    )

    private class StdioMcpClient(
        private val mapper: ObjectMapper,
        private val workingDir: File,
        private val entrypoint: File,
        private val onNotification: (method: String, params: JsonNode) -> Unit = { _, _ -> },
    ) : AutoCloseable {

        private val process: Process = ProcessBuilder("node", entrypoint.absolutePath)
            .directory(workingDir)
            .start()

        private val input = BufferedInputStream(process.inputStream)
        private val output = BufferedOutputStream(process.outputStream)
        private val pending = ConcurrentHashMap<Long, CompletableFuture<JsonNode>>()
        private val nextId = AtomicLong(1)
        private val readerExecutor = Executors.newSingleThreadExecutor()

        fun connect() {
            readerExecutor.submit { readLoop() }

            val initializeParams = mapper.createObjectNode().apply {
                put("protocolVersion", "2024-11-05")
                set<JsonNode>("capabilities", mapper.createObjectNode())
                set<JsonNode>("clientInfo", mapper.createObjectNode().apply {
                    put("name", "agent-stage-bridge")
                    put("version", "0.1.0")
                })
            }

            sendRequest("initialize", initializeParams, timeoutMs = 3000)
            sendNotification("notifications/initialized", mapper.createObjectNode())
        }

        fun callListAgents(timeoutMs: Long): List<AgentSummaryNode> {
            val params = mapper.createObjectNode().apply {
                put("name", "list_agents")
                set<JsonNode>("arguments", mapper.createObjectNode())
            }

            val result = sendRequest("tools/call", params, timeoutMs)
            val text = result
                .path("content")
                .firstOrNull { it.path("type").asText() == "text" }
                ?.path("text")
                ?.asText()
                ?: throw IOException("Missing text content in list_agents MCP response")

            return mapper.readValue(text)
        }

        fun callFlowState(timeoutMs: Long): FlowStateSnapshot {
            val params = mapper.createObjectNode().apply {
                put("name", "flow_state")
                set<JsonNode>("arguments", mapper.createObjectNode())
            }

            val result = sendRequest("tools/call", params, timeoutMs)
            val text = result
                .path("content")
                .firstOrNull { it.path("type").asText() == "text" }
                ?.path("text")
                ?.asText()
                ?: throw IOException("Missing text content in flow_state MCP response")

            return mapper.readValue(text)
        }

        fun isAlive(): Boolean = process.isAlive

        private fun sendRequest(method: String, params: JsonNode, timeoutMs: Long): JsonNode {
            val id = nextId.getAndIncrement()
            val future = CompletableFuture<JsonNode>()
            pending[id] = future

            val payload = mapper.createObjectNode().apply {
                put("jsonrpc", "2.0")
                put("id", id)
                put("method", method)
                set<JsonNode>("params", params)
            }

            sendMessage(payload)

            return try {
                future.get(timeoutMs, TimeUnit.MILLISECONDS)
            } catch (e: TimeoutException) {
                pending.remove(id)
                throw IOException("Timed out waiting for MCP response to $method", e)
            }
        }

        private fun sendNotification(method: String, params: JsonNode) {
            val payload = mapper.createObjectNode().apply {
                put("jsonrpc", "2.0")
                put("method", method)
                set<JsonNode>("params", params)
            }
            sendMessage(payload)
        }

        @Synchronized
        private fun sendMessage(node: JsonNode) {
            val body = mapper.writeValueAsBytes(node)
            val header = "Content-Length: ${body.size}\r\n\r\n".toByteArray(StandardCharsets.US_ASCII)
            output.write(header)
            output.write(body)
            output.flush()
        }

        private fun readLoop() {
            try {
                while (process.isAlive) {
                    val contentLength = readContentLength() ?: break
                    val payload = ByteArray(contentLength)
                    var offset = 0
                    while (offset < contentLength) {
                        val read = input.read(payload, offset, contentLength - offset)
                        if (read < 0) throw IOException("Unexpected EOF in MCP payload")
                        offset += read
                    }

                    val message = mapper.readTree(payload)
                    val idNode = message.get("id")
                    if (idNode != null && idNode.isNumber) {
                        val id = idNode.asLong()
                        val future = pending.remove(id)
                        if (future != null) {
                            val errorNode = message.get("error")
                            if (errorNode != null && !errorNode.isNull) {
                                future.completeExceptionally(IOException(errorNode.toString()))
                            } else {
                                future.complete(message.get("result") ?: mapper.nullNode())
                            }
                        }
                    } else {
                        val method = message.get("method")?.asText() ?: continue
                        val params = message.get("params") ?: mapper.createObjectNode()
                        onNotification(method, params)
                    }
                }
            } catch (e: Exception) {
                pending.values.forEach { it.completeExceptionally(e) }
                pending.clear()
            }
        }

        private fun readContentLength(): Int? {
            var contentLength: Int? = null
            while (true) {
                val line = readHeaderLine() ?: return null
                if (line.isBlank()) {
                    return contentLength
                }

                val lower = line.lowercase()
                if (lower.startsWith("content-length:")) {
                    contentLength = line.substringAfter(':').trim().toIntOrNull()
                }
            }
        }

        private fun readHeaderLine(): String? {
            val bytes = mutableListOf<Byte>()
            while (true) {
                val ch = input.read()
                if (ch < 0) {
                    if (bytes.isEmpty()) return null
                    break
                }
                if (ch == '\n'.code) break
                bytes += ch.toByte()
            }

            val lineBytes = if (bytes.lastOrNull() == '\r'.code.toByte()) {
                bytes.dropLast(1).toByteArray()
            } else {
                bytes.toByteArray()
            }
            return String(lineBytes, StandardCharsets.US_ASCII)
        }

        override fun close() {
            try {
                output.close()
            } catch (_: Exception) {
            }
            try {
                input.close()
            } catch (_: Exception) {
            }

            pending.values.forEach {
                it.completeExceptionally(IOException("MCP client closed"))
            }
            pending.clear()

            if (process.isAlive) {
                process.destroy()
            }
            readerExecutor.shutdownNow()
        }
    }
}
