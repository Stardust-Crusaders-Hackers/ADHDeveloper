package com.example.mcpassistant.plugin

import com.example.mcpassistant.services.AgentRegistryService
import com.example.mcpassistant.ui.StagePanel
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory

class StageToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = StagePanel(project)
        val content = toolWindow.contentManager.factory.createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)

        val registry = project.service<AgentRegistryService>()
        registry.addListener(panel)
    }
}
