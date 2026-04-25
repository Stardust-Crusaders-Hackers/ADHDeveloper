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
    private var voiceOptions = listOf<ElevenLabsService.VoiceOption>()
    private val agentTypes = listOf("orchestrator", "coder", "researcher", "reviewer", "tester", "default")

    override fun getDisplayName() = "Agent Stage"

    override fun createComponent(): JComponent = panel {
        row("ElevenLabs API Key:") {
            val field = passwordField().bindText(settings::elevenLabsApiKey).component
            button("Load Voices") {
                ApplicationManager.getApplication().executeOnPooledThread {
                    voiceOptions = service<ElevenLabsService>().fetchVoices(field.password.concatToString())
                    SwingUtilities.invokeLater { refreshVoiceDropdowns() }
                }
            }
        }
        group("Voice per Agent Type") {
            agentTypes.forEach { agentType ->
                row("$agentType:") {
                    comboBox(voiceOptions)
                        .applyToComponent {
                            selectedItem = voiceOptions.find { it.id == settings.voiceAssignments[agentType] }
                            addActionListener {
                                (selectedItem as? ElevenLabsService.VoiceOption)?.let {
                                    settings.voiceAssignments[agentType] = it.id
                                }
                            }
                        }
                }
            }
        }
        separator()
        row("MCP Server Path:") {
            textFieldWithBrowseButton("Select MCP Server Directory")
                .bindText(settings::mcpServerPath)
                .comment("Absolute path to the 'mcpServer' directory (contains package.json)")
        }
        row { checkBox("Enable MCP integration").bindSelected(settings::mcpEnabled) }
        row { checkBox("Enable TTS narration").bindSelected(settings::ttsEnabled) }
        row { checkBox("Enable sound effects").bindSelected(settings::soundEffectsEnabled) }
    }

    private fun refreshVoiceDropdowns() { /* repopulate comboBox models on voice load */ }
    override fun isModified() = false
    override fun apply() {}
    override fun reset() {}
}
