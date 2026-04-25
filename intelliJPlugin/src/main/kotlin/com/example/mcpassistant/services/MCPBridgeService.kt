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

    private val knownAgentIds = mutableSetOf<String>()
    private val knownPresentations = mutableMapOf<String, Long>()
    private var activeTasksById = mutableMapOf<String, RunningAgentNode>()

    // Shared state file written by any MCP server process (Junie, Claude, etc.)
    private val stateFile = File(System.getProperty("java.io.tmpdir"), "adhd-bridge-state.json")

    private var mcpDir: File? = null
    private var mcpClient: StdioMcpClient? = null
    private var mcpFailureCount: Int = 0
    private var nextMcpAttemptAt: Long = 0L

    fun start(mcpDir: File) {
        this.mcpDir = mcpDir
        knownAgentIds.addAll(registry.getAgents().map { it.agent.id })
        pollExecutor.scheduleAtFixedRate({ poll() }, 1, 1, TimeUnit.SECONDS)
    }

    private fun poll() {
        val mcpOk = pollFromMcp()
        if (!mcpOk) {
            pollFromStateFile()
        }
        pruneSeenPresentations(System.currentTimeMillis())
    }

    private fun pollFromMcp(): Boolean {
        val dir = mcpDir ?: return false
        val now = System.currentTimeMillis()
        if (now < nextMcpAttemptAt) return false

        return try {
            val snapshot = ensureMcpClient(dir).callFlowState(timeoutMs = 1500)
            applyMcpSnapshot(snapshot)
            mcpFailureCount = 0
            nextMcpAttemptAt = 0L
            true
        } catch (_: Exception) {
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
            ensureAgentRegistered(running.agentName)
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

        snapshot.recentClosedPresentations
            .sortedBy { it.createdAt }
            .forEach { event ->
                if (knownPresentations.containsKey(event.eventId)) return@forEach
                ensureAgentRegistered(event.agentId)
                registry.stagePresentation(event.eventId, event.agentId, event.text)
                knownPresentations[event.eventId] = event.createdAt
            }
    }

    private fun pollFromStateFile() {
        if (!stateFile.exists()) return
        try {
            val state = mapper.readValue<BridgeState>(stateFile)

            state.agents.forEach { node ->
                if (knownAgentIds.add(node.id)) {
                    registry.registerAgent(
                        Agent(
                            id = node.id,
                            name = node.name,
                            type = node.type,
                            description = node.description,
                        )
                    )
                }
            }

            state.tasks.filter { it.status == "ACTIVE" }.forEach { node ->
                ensureAgentRegistered(node.agentId)
                if (!activeTasksById.containsKey(node.taskId)) {
                    activeTasksById[node.taskId] = RunningAgentNode(
                        taskId = node.taskId,
                        flowId = "fallback-json",
                        agentName = node.agentId,
                        startedAt = System.currentTimeMillis(),
                    )
                    registry.startTask(
                        AgentTask(
                            taskId = node.taskId,
                            agentId = node.agentId,
                            description = node.description,
                            status = TaskStatus.ACTIVE,
                            result = node.result,
                        )
                    )
                }
            }

            state.tasks.filter { it.status == "COMPLETED" }.forEach { node ->
                if (activeTasksById.remove(node.taskId) != null) {
                    registry.completeTask(node.taskId, node.agentId, node.result)
                }
            }

            state.presentations.filter { it.status == "PENDING" }.forEach { node ->
                if (knownPresentations.containsKey(node.presentationId)) return@forEach
                ensureAgentRegistered(node.agentId)
                registry.stagePresentation(node.presentationId, node.agentId, node.text)
                knownPresentations[node.presentationId] = node.createdAt.takeIf { it > 0 } ?: System.currentTimeMillis()
                // Mark as SHOWN in the file so it doesn't fire again
                ackPresentation(node.presentationId, state)
            }
        } catch (_: Exception) {
            // fallback is best-effort; keep polling
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

    private fun pruneSeenPresentations(now: Long) {
        val ttlMs = 2 * 60 * 1000L
        val iter = knownPresentations.entries.iterator()
        while (iter.hasNext()) {
            val entry = iter.next()
            if (now - entry.value > ttlMs) {
                iter.remove()
            }
        }
    }

    private fun ackPresentation(presentationId: String, state: BridgeState) {
        try {
            val updated = state.copy(
                presentations = state.presentations.map {
                    if (it.presentationId == presentationId) it.copy(status = "SHOWN") else it
                }
            )
            stateFile.writeText(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(updated))
        } catch (_: Exception) {
            // best effort
        }
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
        val created = StdioMcpClient(mapper, dir, distEntry)
        created.connect()
        mcpClient = created
        return created
    }

    private fun closeMcpClient() {
        mcpClient?.close()
        mcpClient = null
    }

    data class BridgeState(
        val agents: List<AgentNode> = emptyList(),
        val tasks: List<TaskNode> = emptyList(),
        val presentations: List<PresentationNode> = emptyList(),
    )

    data class AgentNode(val id: String, val name: String, val type: String, val description: String)
    data class TaskNode(val taskId: String, val agentId: String, val description: String, val status: String, val result: String)
    data class PresentationNode(val presentationId: String, val agentId: String, val text: String, val status: String, val createdAt: Long = 0)

    data class FlowStateSnapshot(
        val activeFlows: Int = 0,
        val flows: List<FlowNode> = emptyList(),
        val runningAgents: List<RunningAgentNode> = emptyList(),
        val recentClosedPresentations: List<ClosedPresentationNode> = emptyList(),
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

    data class ClosedPresentationNode(
        val eventId: String,
        val flowId: String,
        val agentId: String,
        val text: String,
        val createdAt: Long,
    )

    private class StdioMcpClient(
        private val mapper: ObjectMapper,
        private val workingDir: File,
        private val entrypoint: File,
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