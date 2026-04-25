package com.example.mcpassistant.plugin

import com.example.mcpassistant.services.AgentRegistryService
import com.example.mcpassistant.ui.StagePanel
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import javax.swing.SwingUtilities
import javax.swing.Timer

class StageToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        try {
            System.err.println("[ADHD] Creating tool window content...")
            val panel = StagePanel(project)
            val content = toolWindow.contentManager.factory.createContent(panel, "", false)
            toolWindow.contentManager.addContent(content)

            val registry = project.service<AgentRegistryService>()
            registry.addListener(panel)
            System.err.println("[ADHD] Registered StagePanel as listener.")

            // Sync existing agents after a small delay to ensure UI is ready
            val timer = Timer(1000) {
                panel.syncExistingAgents()
                System.err.println("[ADHD] Deferred agent sync completed.")
            }
            timer.isRepeats = false
            timer.start()
            
            System.err.println("[ADHD] Deferred agent sync scheduled.")
            
            content.setDisposer(Disposable {
                System.err.println("[ADHD] Disposing tool window content")
                registry.removeListener(panel)
                panel.dispose()
            })
            System.err.println("[ADHD] Tool window content created successfully.")
        } catch (e: Exception) {
            System.err.println("[ADHD] FATAL: Failed to create tool window content: ${e.message}")
            e.printStackTrace()
        }
    }
}
