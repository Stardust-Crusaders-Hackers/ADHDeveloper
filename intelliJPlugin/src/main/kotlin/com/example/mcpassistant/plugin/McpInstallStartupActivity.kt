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

    private fun resolveMcpDir(project: Project): File? {
        if (!StageSettingsState.getInstance().mcpEnabled) return null
        val dir = findMcpServerDir(project) ?: return null

        val nodeOk = try {
            ProcessBuilder("node", "--version").start().waitFor() == 0
        } catch (_: Exception) { false }

        if (!nodeOk) {
            notify(project, "Agent Stage: Node.js not found — MCP disabled, state-file polling active", NotificationType.WARNING)
            return null
        }

        if (!File(dir, "node_modules").exists()) {
            ProcessBuilder("npm", "install").directory(dir).start().waitFor()
        }
        if (!File(dir, "dist").exists()) {
            ProcessBuilder("npm", "run", "build").directory(dir).start().waitFor()
        }
        return dir
    }

    private fun findMcpServerDir(project: Project): File? {
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
