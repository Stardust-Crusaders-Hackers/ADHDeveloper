package com.example.mcpassistant.settings

import com.intellij.openapi.options.Configurable
import javax.swing.*
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Insets

class StageSettingsConfigurable : Configurable {

    private var panel: JPanel? = null
    private val portField = JTextField(10)
    private val ttsCheckbox = JCheckBox("Enable TTS (ElevenLabs)")
    private val apiKeyField = JPasswordField(30)
    private val voiceIdField = JTextField(30)

    override fun getDisplayName(): String = "Agent Stage"

    override fun createComponent(): JComponent {
        val p = JPanel(GridBagLayout())
        val gbc = GridBagConstraints().apply {
            insets = Insets(4, 4, 4, 4)
            anchor = GridBagConstraints.WEST
            fill = GridBagConstraints.HORIZONTAL
        }

        gbc.gridx = 0; gbc.gridy = 0; gbc.weightx = 0.0
        p.add(JLabel("MCP Server Port:"), gbc)
        gbc.gridx = 1; gbc.weightx = 1.0
        p.add(portField, gbc)

        gbc.gridx = 0; gbc.gridy = 1; gbc.gridwidth = 2
        p.add(ttsCheckbox, gbc)
        gbc.gridwidth = 1

        gbc.gridx = 0; gbc.gridy = 2; gbc.weightx = 0.0
        p.add(JLabel("ElevenLabs API Key:"), gbc)
        gbc.gridx = 1; gbc.weightx = 1.0
        p.add(apiKeyField, gbc)

        gbc.gridx = 0; gbc.gridy = 3; gbc.weightx = 0.0
        p.add(JLabel("Voice ID:"), gbc)
        gbc.gridx = 1; gbc.weightx = 1.0
        p.add(voiceIdField, gbc)

        gbc.gridx = 0; gbc.gridy = 4; gbc.gridwidth = 2; gbc.weighty = 1.0
        p.add(JPanel(), gbc)

        panel = p
        reset()
        return p
    }

    override fun isModified(): Boolean {
        val s = StageSettingsState.getInstance()
        return portField.text != s.port.toString() ||
                ttsCheckbox.isSelected != s.ttsEnabled ||
                String(apiKeyField.password) != s.elevenLabsApiKey ||
                voiceIdField.text != s.elevenLabsVoiceId
    }

    override fun apply() {
        val s = StageSettingsState.getInstance()
        s.port = portField.text.toIntOrNull() ?: 2999
        s.ttsEnabled = ttsCheckbox.isSelected
        s.elevenLabsApiKey = String(apiKeyField.password)
        s.elevenLabsVoiceId = voiceIdField.text
    }

    override fun reset() {
        val s = StageSettingsState.getInstance()
        portField.text = s.port.toString()
        ttsCheckbox.isSelected = s.ttsEnabled
        apiKeyField.text = s.elevenLabsApiKey
        voiceIdField.text = s.elevenLabsVoiceId
    }

    override fun disposeUIResources() {
        panel = null
    }
}
