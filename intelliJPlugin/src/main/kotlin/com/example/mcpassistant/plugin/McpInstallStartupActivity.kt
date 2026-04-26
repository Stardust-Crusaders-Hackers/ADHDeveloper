package com.example.mcpassistant.plugin

import com.example.mcpassistant.services.MCPBridgeService
import com.example.mcpassistant.settings.StageSettingsState
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

class McpInstallStartupActivity : ProjectActivity {

    private val log = Logger.getInstance(McpInstallStartupActivity::class.java)

    override suspend fun execute(project: Project) {
        val settings = StageSettingsState.getInstance()
        settings.loadFromEnv(project.basePath)

        if (isServerHealthy(settings.port)) {
            log.info("MCP server already running on port ${settings.port}")
            project.service<MCPBridgeService>().connect()
            notify(project, "Agent Stage connected to MCP server", NotificationType.INFORMATION)
            return
        }

        val mcpDir = project.basePath?.let { File(it, "mcpServer") }
        if (mcpDir != null && mcpDir.exists()) {
            try {
                installAndStart(mcpDir, settings.port)
                if (pollHealth(settings.port, 15)) {
                    project.service<MCPBridgeService>().connect()
                    notify(project, "Agent Stage: MCP server started and connected", NotificationType.INFORMATION)
                } else {
                    notify(project, "Agent Stage: MCP server failed to start", NotificationType.WARNING)
                }
            } catch (e: Exception) {
                log.warn("Failed to start MCP server", e)
                notify(project, "Agent Stage: ${e.message}", NotificationType.ERROR)
            }
        } else {
            log.info("No mcpServer directory found, attempting direct connection")
            project.service<MCPBridgeService>().connect()
        }
    }

    private fun isServerHealthy(port: Int): Boolean {
        return try {
            val client = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(2, TimeUnit.SECONDS)
                .build()
            val request = Request.Builder().url("http://localhost:$port/health").build()
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (_: Exception) {
            false
        }
    }

    private fun installAndStart(mcpDir: File, port: Int) {
        val npm = if (System.getProperty("os.name").lowercase().contains("win")) "npm.cmd" else "npm"

        val install = ProcessBuilder(npm, "install")
            .directory(mcpDir)
            .redirectErrorStream(true)
            .start()
        install.waitFor(60, TimeUnit.SECONDS)

        val env = mapOf("MCP_SSE_PORT" to port.toString())
        val start = ProcessBuilder(npm, "start")
            .directory(mcpDir)
            .redirectErrorStream(true)
        start.environment().putAll(env)
        start.start()
    }

    private fun pollHealth(port: Int, timeoutSeconds: Int): Boolean {
        val deadline = System.currentTimeMillis() + timeoutSeconds * 1000L
        while (System.currentTimeMillis() < deadline) {
            if (isServerHealthy(port)) return true
            Thread.sleep(1000)
        }
        return false
    }

    private fun notify(project: Project, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("AgentStage.Notifications")
            .createNotification(message, type)
            .notify(project)
    }
}
