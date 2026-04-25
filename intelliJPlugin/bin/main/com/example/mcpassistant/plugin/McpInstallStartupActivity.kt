package com.example.mcpassistant.plugin

import com.example.mcpassistant.services.MCPBridgeService
import com.example.mcpassistant.settings.StageSettingsState
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import java.io.File

class McpInstallStartupActivity : StartupActivity.DumbAware {
    override fun runActivity(project: Project) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val mcpDir = resolveMcpDir(project)
            project.service<MCPBridgeService>().startWithFallback(mcpDir)
        }
    }

    fun resolveMcpDir(project: Project): File? {
        val settings = StageSettingsState.getInstance()

        if (settings.mcpServerPath.isNotEmpty()) {
            val dir = File(settings.mcpServerPath)
            if (dir.exists() && dir.isDirectory) return dir
        }

        val base = File(project.basePath ?: return null)
        return File(base, "mcpServer").takeIf { it.exists() && it.isDirectory }
    }
}
