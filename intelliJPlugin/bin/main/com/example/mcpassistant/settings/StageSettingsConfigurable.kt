package com.example.mcpassistant.settings

import com.example.mcpassistant.services.ElevenLabsService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.options.Configurable
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import javax.swing.JComponent
import javax.swing.SwingUtilities

class StageSettingsConfigurable : Configurable {
    private val settings = StageSettingsState.getInstance()
    private var panel: JComponent? = null
    private var voiceOptions = listOf<ElevenLabsService.VoiceOption>()
    private val agentTypes = listOf("orchestrator", "coder", "researcher", "reviewer", "tester", "default")

    override fun getDisplayName() = "Agent Stage"

    override fun createComponent(): JComponent {
        val ui = panel {
            row("ElevenLabs API Key:") {
                passwordField().bindText(settings::elevenLabsApiKey)
            }
            separator()
            row("MCP Server URL:") {
                textField()
                    .bindText(settings::mcpServerUrl)
                    .comment("SSE server URL (e.g. http://localhost:3001)")
            }
            row("MCP Server Path:") {
                textField()
                    .bindText(settings::mcpServerPath)
                    .comment("Absolute path to the 'mcpServer' directory (legacy stdio mode)")
            }
            row { checkBox("Enable MCP integration").bindSelected(settings::mcpEnabled) }
            row { checkBox("Enable TTS narration").bindSelected(settings::ttsEnabled) }
            row { checkBox("Enable sound effects").bindSelected(settings::soundEffectsEnabled) }
            
            row {
                button("Apply & Restart Bridge") {
                    val component = panel as? com.intellij.openapi.ui.DialogPanel ?: return@button
                    component.apply()
                    restartBridge()
                }
            }
        }
        this.panel = ui
        return ui
    }

    private fun restartBridge() {
        com.intellij.openapi.project.ProjectManager.getInstance().openProjects.forEach { project ->
            ApplicationManager.getApplication().executeOnPooledThread {
                val mcpDir = com.example.mcpassistant.plugin.McpInstallStartupActivity().resolveMcpDir(project)
                project.service<com.example.mcpassistant.services.MCPBridgeService>().startWithFallback(mcpDir)
            }
        }
    }

    override fun isModified(): Boolean {
        val component = panel as? com.intellij.openapi.ui.DialogPanel ?: return false
        return component.isModified()
    }

    override fun apply() {
        val component = panel as? com.intellij.openapi.ui.DialogPanel ?: return
        component.apply()
        restartBridge()
    }

    override fun reset() {
        val component = panel as? com.intellij.openapi.ui.DialogPanel ?: return
        component.reset()
    }

    override fun disposeUIResources() {
        panel = null
    }
}
