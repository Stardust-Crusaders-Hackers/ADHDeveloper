package com.example.mcpassistant.plugin

import com.example.mcpassistant.services.AgentRegistryService
import com.example.mcpassistant.ui.StagePanel
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class StageToolWindowFactory : ToolWindowFactory {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val registry = project.service<AgentRegistryService>()
        val stagePanel = StagePanel(project)

        registry.addListener(stagePanel)
        stagePanel.syncExistingAgents()

        val content = ContentFactory.getInstance().createContent(stagePanel, "", false)
        toolWindow.contentManager.addContent(content)

        Disposer.register(toolWindow.disposable) {
            registry.removeListener(stagePanel)
            stagePanel.dispose()
        }
    }
}
