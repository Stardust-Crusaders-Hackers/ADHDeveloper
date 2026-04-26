package com.example.mcpassistant.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.util.xmlb.XmlSerializerUtil
import java.io.File

@State(name = "AgentStageSettings", storages = [Storage("agent-stage.xml")])
class StageSettingsState : PersistentStateComponent<StageSettingsState> {

    var port: Int = 2999
    var ttsEnabled: Boolean = true
    var elevenLabsApiKey: String = ""
    var elevenLabsVoiceId: String = "21m00Tcm4TlvDq8ikWAM"

    override fun getState(): StageSettingsState = this

    override fun loadState(state: StageSettingsState) {
        XmlSerializerUtil.copyBean(state, this)
    }

    fun loadFromEnv(projectBasePath: String?) {
        val envFile = projectBasePath?.let { File(it, ".env") }
        if (envFile == null || !envFile.exists()) return

        envFile.readLines().forEach { line ->
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("#")) return@forEach
            val eqIdx = trimmed.indexOf('=')
            if (eqIdx <= 0) return@forEach
            val key = trimmed.substring(0, eqIdx).trim()
            val value = trimmed.substring(eqIdx + 1).trim().removeSurrounding("\"")
            when (key) {
                "MCP_SSE_PORT" -> value.toIntOrNull()?.let { port = it }
                "ELEVENLABS_API_KEY" -> elevenLabsApiKey = value
                "TTS_ENABLED" -> ttsEnabled = value.toBooleanStrictOrNull() ?: true
                "ELEVENLABS_VOICE_ID" -> elevenLabsVoiceId = value
            }
        }
    }

    companion object {
        fun getInstance(): StageSettingsState =
            ApplicationManager.getApplication().getService(StageSettingsState::class.java)
    }
}
