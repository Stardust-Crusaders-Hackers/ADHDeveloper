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
        if (!StageSettingsState.getInstance().mcpEnabled) return

        ApplicationManager.getApplication().executeOnPooledThread {
            val mcpDir = findMcpServerDir(project) ?: run {
                notify(project, "Agent Stage: mcpServer directory not found", NotificationType.ERROR)
                return@executeOnPooledThread
            }

            val nodeOk = ProcessBuilder("node", "--version").start().waitFor() == 0
            if (!nodeOk) {
                notify(project, "Agent Stage: Node.js not found — install Node.js 18+", NotificationType.WARNING)
                return@executeOnPooledThread
            }

            if (!File(mcpDir, "node_modules").exists()) {
                ProcessBuilder("npm", "install").directory(mcpDir).start().waitFor()
            }

            if (!File(mcpDir, "dist").exists()) {
                ProcessBuilder("npm", "run", "build").directory(mcpDir).start().waitFor()
            }

            project.service<MCPBridgeService>().start(mcpDir)
        }
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
