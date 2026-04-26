package com.example.mcpassistant.services

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask
import com.example.mcpassistant.settings.StageSettingsState
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.Collections
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

@Service(Service.Level.PROJECT)
class MCPBridgeService(private val project: Project) {

    private val log = Logger.getInstance(MCPBridgeService::class.java)
    private val mapper = jacksonObjectMapper().apply {
        configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
    }
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    private val processedEvents: MutableSet<String> = Collections.newSetFromMap(
        object : LinkedHashMap<String, Boolean>(256, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Boolean>): Boolean = size > 500
        }
    )

    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "MCP-Bridge-Reconnect").apply { isDaemon = true }
    }

    private var eventSource: EventSource? = null
    private var reconnectFuture: ScheduledFuture<*>? = null
    private var reconnectDelayMs = 3000L
    private val connected = AtomicBoolean(false)
    private val shutdown = AtomicBoolean(false)

    private fun baseUrl(): String = "http://localhost:${StageSettingsState.getInstance().port}"

    fun connect() {
        if (shutdown.get()) return
        log.info("MCPBridge connecting to ${baseUrl()}")
        fetchAgents()
        connectSse()
    }

    fun disconnect() {
        shutdown.set(true)
        reconnectFuture?.cancel(true)
        eventSource?.cancel()
        scheduler.shutdownNow()
    }

    fun isConnected(): Boolean = connected.get()

    private fun fetchAgents() {
        try {
            val request = Request.Builder().url("${baseUrl()}/agents").build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    log.warn("Failed to fetch agents: ${response.code}")
                    return
                }
                val body = response.body?.string() ?: return
                val agents = mapper.readTree(body)
                val registry = project.service<AgentRegistryService>()

                if (agents.isArray) {
                    agents.forEach { node ->
                        val agent = Agent(
                            id = node.path("id").asText(node.path("name").asText()),
                            name = node.path("name").asText(),
                            type = node.path("type").asText("agent"),
                            description = node.path("description").asText("")
                        )
                        registry.registerAgent(agent)
                    }
                    log.info("Registered ${agents.size()} agents from MCP server")
                }
            }
        } catch (e: Exception) {
            log.warn("Failed to fetch agents from MCP server", e)
        }
    }

    private fun connectSse() {
        if (shutdown.get()) return

        val request = Request.Builder().url("${baseUrl()}/events").build()
        val factory = EventSources.createFactory(httpClient)

        eventSource = factory.newEventSource(request, object : EventSourceListener() {

            override fun onOpen(eventSource: EventSource, response: Response) {
                connected.set(true)
                reconnectDelayMs = 3000L
                log.info("SSE connected to MCP server")
            }

            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                if (type == null || data.isBlank()) return
                try {
                    val node = mapper.readTree(data)
                    val eventId = node.path("eventId").asText("")
                    if (eventId.isNotEmpty() && !processedEvents.add(eventId)) return

                    val payload = node.path("payload")
                    val registry = project.service<AgentRegistryService>()
                    val elevenlabs = project.service<ElevenLabsService>()

                    when (type) {
                        "agent_started" -> {
                            val agentName = payload.path("agentName").asText()
                            val taskId = payload.path("taskId").asText()
                            val query = payload.path("query").asText(agentName)
                            ensureAgentExists(agentName, registry)
                            registry.notifyTaskStarted(AgentTask(taskId, agentName, query))
                        }

                        "agent_completed" -> {
                            val agentName = payload.path("agentName").asText()
                            val taskId = payload.path("taskId").asText()
                            val excerpt = payload.path("messageExcerpt").asText("")
                            elevenlabs.playSound("/sounds/task_complete.wav")
                            registry.notifyTaskCompleted(taskId, agentName, excerpt)
                        }

                        "presentation" -> {
                            val presentationId = payload.path("presentationId").asText()
                            val agentId = payload.path("agentId").asText()
                            val text = payload.path("text").asText("")
                            ensureAgentExists(agentId, registry)
                            registry.notifyPresentation(presentationId, agentId, text)
                        }

                        "error" -> {
                            log.warn("MCP error event: ${payload.path("message").asText()}")
                        }

                        "END" -> {
                            log.info("MCP server sent END: ${payload.path("reason").asText()}")
                            scheduleReconnect()
                        }
                    }
                } catch (e: Exception) {
                    log.warn("Error processing SSE event", e)
                }
            }

            override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                connected.set(false)
                if (!shutdown.get()) {
                    log.warn("SSE connection lost: ${t?.message ?: response?.code}")
                    scheduleReconnect()
                }
            }

            override fun onClosed(eventSource: EventSource) {
                connected.set(false)
                if (!shutdown.get()) scheduleReconnect()
            }
        })
    }

    private fun ensureAgentExists(agentName: String, registry: AgentRegistryService) {
        if (registry.getAgent(agentName) == null) {
            registry.registerAgent(Agent(agentName, agentName, "agent", "Auto-registered"))
        }
    }

    private fun scheduleReconnect() {
        if (shutdown.get()) return
        reconnectFuture?.cancel(false)
        reconnectFuture = scheduler.schedule({
            log.info("Attempting SSE reconnect (delay=${reconnectDelayMs}ms)")
            fetchAgents()
            connectSse()
        }, reconnectDelayMs, TimeUnit.MILLISECONDS)
        reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(30_000)
    }
}
