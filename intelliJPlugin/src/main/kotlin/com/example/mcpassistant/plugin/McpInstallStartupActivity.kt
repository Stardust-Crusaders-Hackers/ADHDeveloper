package com.example.mcpassistant.plugin

import com.example.mcpassistant.services.MCPBridgeService
import com.example.mcpassistant.settings.StageSettingsState
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import java.io.File

class McpInstallStartupActivity : StartupActivity.DumbAware {
    override fun runActivity(project: Project) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val mcpDir = resolveMcpDir(project)
            project.service<MCPBridgeService>().start(mcpDir)
        }
    }

    fun resolveMcpDir(project: Project): File? {
        System.err.println("[MCP-DEBUG] resolveMcpDir called for project: ${project.name}")
        val settings = StageSettingsState.getInstance()
        
        val dir = findMcpServerDir(project) ?: run {
            System.err.println("[MCP-DEBUG] No mcpServer directory found automatically.")
            null
        }

        val nodeOk = try {
            val p = ProcessBuilder("node", "--version").start()
            val ok = p.waitFor() == 0
            System.err.println("[MCP-DEBUG] Node check: $ok")
            ok
        } catch (e: Exception) { 
            System.err.println("[MCP-DEBUG] Node check failed: ${e.message}")
            false 
        }

        if (dir != null) {
           System.err.println("[MCP-DEBUG] Resolved directory: ${dir.absolutePath}")
        }
        
        return dir
    }

    private fun findMcpServerDir(project: Project): File? {
        val settings = StageSettingsState.getInstance()
        if (settings.mcpServerPath.isNotEmpty()) {
            val dir = File(settings.mcpServerPath)
            if (dir.exists() && dir.isDirectory) return dir
        }

        val base = File(project.basePath ?: return null)
        return File(base, "mcpServer").takeIf { it.exists() && it.isDirectory }
    }

    private fun notify(project: Project, msg: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("AgentStage.Notifications")
            .createNotification(msg, type)
            .notify(project)
    }
}
