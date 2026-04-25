package com.example.mcpassistant.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.XmlSerializerUtil

@State(name = "AgentStageSettings", storages = [Storage("agentStage.xml")])
@Service(Service.Level.APP)
class StageSettingsState : PersistentStateComponent<StageSettingsState> {
    companion object { fun getInstance() = service<StageSettingsState>() }

    var elevenLabsApiKey: String = ""
    var mcpEnabled: Boolean = true
    var mcpServerPath: String = ""
    var mcpServerUrl: String = "http://localhost:3001"
    var ttsEnabled: Boolean = true
    var soundEffectsEnabled: Boolean = true
    var voiceAssignments: MutableMap<String, String> = mutableMapOf()

    override fun getState() = this
    override fun loadState(state: StageSettingsState) { XmlSerializerUtil.copyBean(state, this) }
}
