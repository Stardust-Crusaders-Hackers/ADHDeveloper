package com.example.mcpassistant.plugin

import com.example.mcpassistant.services.MCPBridgeService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity

class McpInstallStartupActivity : StartupActivity.DumbAware {
    override fun runActivity(project: Project) {
        ApplicationManager.getApplication().executeOnPooledThread {
            project.service<MCPBridgeService>().start()
        }
    }
}
