package com.example.mcpassistant.services

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.model.TaskStatus
import com.example.mcpassistant.settings.StageSettingsState
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.io.BufferedOutputStream
import java.io.InputStream
import java.io.File
import java.io.IOException
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

    private var mcpClient: SseMcpClient? = null
    private var mcpFailureCount: Int = 0
    private var nextMcpAttemptAt: Long = 0L

    @Synchronized
    fun start() {
        val settings = StageSettingsState.getInstance()
        System.err.println("[MCP] Bridge start requested. SSE URL: ${settings.mcpServerUrl}")

        if (!settings.mcpEnabled) {
            closeMcpClient()
            return
        }

        closeMcpClient()
        knownAgentIds.addAll(registry.getAgents().map { it.agent.id })

        try {
            pollExecutor.scheduleAtFixedRate({ poll() }, 1, 1, TimeUnit.SECONDS)
            System.err.println("[MCP] Polling scheduled.")
        } catch (e: Exception) {
            System.err.println("[MCP] Polling already active or failed to schedule: ${e.message}")
        }
    }

    private fun poll() {
        val settings = StageSettingsState.getInstance()
        if (!settings.mcpEnabled) {
            closeMcpClient()
            return
        }
        pollFromMcp()
    }

    private fun pollFromMcp(): Boolean {
        val settings = StageSettingsState.getInstance()
        val serverUrl = settings.mcpServerUrl.ifEmpty { "http://localhost:3001" }
        val now = System.currentTimeMillis()
        if (now < nextMcpAttemptAt) return false

        return try {
            val client = ensureMcpClient(serverUrl)

            try {
                val agents = client.callListAgents(timeoutMs = 1500)
                agents.forEach { summary ->
                    if (knownAgentIds.add(summary.id)) {
                        registry.registerAgent(
                            Agent(
                                id = summary.id,
                                name = summary.name,
                                type = summary.type,
                                description = summary.description,
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                System.err.println("[MCP] Failed to sync agents: ${e.message}")
            }

            val snapshot = client.callFlowState(timeoutMs = 1500)
            applyMcpSnapshot(snapshot)

            mcpFailureCount = 0
            nextMcpAttemptAt = 0L
            true
        } catch (e: Exception) {
            System.err.println("[MCP] Poll failed: ${e.message}")
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

    private fun ensureMcpClient(serverUrl: String): SseMcpClient {
        val existing = mcpClient
        if (existing != null && existing.isAlive()) return existing

        val created = SseMcpClient(mapper, serverUrl) { method, params ->
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
        val keywords: List<String>,
    )

    private class SseMcpClient(
        private val mapper: ObjectMapper,
        private val serverUrl: String,
        private val onNotification: (method: String, params: JsonNode) -> Unit = { _, _ -> },
    ) : AutoCloseable {

        private val httpClient = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()

        private val pending = ConcurrentHashMap<Long, CompletableFuture<JsonNode>>()
        private val nextId = AtomicLong(1)
        @Volatile private var postUrl: String? = null
        @Volatile private var alive = true
        private val connectFuture = CompletableFuture<Unit>()
        private var eventSource: EventSource? = null

        fun connect() {
            val request = Request.Builder()
                .url("$serverUrl/sse")
                .header("Accept", "text/event-stream")
                .build()

            val listener = object : EventSourceListener() {
                override fun onEvent(
                    eventSource: EventSource,
                    id: String?,
                    type: String?,
                    data: String,
                ) {
                    when (type) {
                        "endpoint" -> {
                            postUrl = if (data.startsWith("http")) data else "$serverUrl$data"
                            // Dispatch init to a separate thread — sendRequest blocks waiting for
                            // an SSE "message" response, which would deadlock the SSE reader thread.
                            Thread {
                                try {
                                    val initParams = mapper.createObjectNode().apply {
                                        put("protocolVersion", "2024-11-05")
                                        set<JsonNode>("capabilities", mapper.createObjectNode())
                                        set<JsonNode>("clientInfo", mapper.createObjectNode().apply {
                                            put("name", "agent-stage-bridge")
                                            put("version", "0.1.0")
                                        })
                                    }
                                    sendRequest("initialize", initParams, timeoutMs = 3000)
                                    sendNotification("notifications/initialized", mapper.createObjectNode())
                                    connectFuture.complete(Unit)
                                } catch (e: Exception) {
                                    connectFuture.completeExceptionally(e)
                                }
                            }.apply { isDaemon = true }.start()
                        }
                        "message" -> {
                            try {
                                val message = mapper.readTree(data)
                                val idNode = message.get("id")
                                if (idNode != null && idNode.isNumber) {
                                    val msgId = idNode.asLong()
                                    val future = pending.remove(msgId)
                                    if (future != null) {
                                        val errorNode = message.get("error")
                                        if (errorNode != null && !errorNode.isNull) {
                                            future.completeExceptionally(IOException(errorNode.toString()))
                                        } else {
                                            future.complete(message.get("result") ?: mapper.nullNode())
                                        }
                                    }
                                } else {
                                    val method = message.get("method")?.asText() ?: return
                                    val params = message.get("params") ?: mapper.createObjectNode()
                                    onNotification(method, params)
                                }
                            } catch (e: Exception) {
                                System.err.println("[SSE] Failed to parse message: ${e.message}")
                            }
                        }
                    }
                }

                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    alive = false
                    val ex = t ?: IOException("SSE connection failed: ${response?.code}")
                    if (!connectFuture.isDone) connectFuture.completeExceptionally(ex)
                    pending.values.forEach { it.completeExceptionally(ex) }
                    pending.clear()
                }
            }

            eventSource = EventSources.createFactory(httpClient).newEventSource(request, listener)
            connectFuture.get(5000, TimeUnit.MILLISECONDS)
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

        fun isAlive(): Boolean = alive && postUrl != null

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

        private fun sendMessage(node: JsonNode) {
            val url = postUrl ?: throw IOException("SSE not connected: no POST URL")
            val body = mapper.writeValueAsBytes(node).toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url(url)
                .post(body)
                .build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("MCP POST failed: ${response.code}")
                }
            }
        }

        override fun close() {
            alive = false
            eventSource?.cancel()
            eventSource = null
            postUrl = null
            pending.values.forEach { it.completeExceptionally(IOException("SSE client closed")) }
            pending.clear()
        }
    }
}
