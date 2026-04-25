# ADHDeveloper Stage Mode — Dev A: Backend & Infrastructure

**Parallel with:** `PLAN_DEV_B_UI.md`
**Coordination point:** Dev A defines interfaces/models first (Phase 0). Dev B implements UI against those contracts. Merge when both phases complete.

---

## Scope

Dev A owns everything that is NOT Swing UI rendering:
- Data models (`Agent`, `AgentTask`)
- Service interfaces (contracts Dev B depends on)
- `AgentRegistryService` — state management + event dispatch
- `MCPBridgeService` — stdio JSON-RPC to mcpServer child process
- `McpInstallStartupActivity` — Node.js check + npm install + process start
- `ElevenLabsService` — TTS REST calls + audio playback
- `StageSettingsState` + `StageSettingsConfigurable` — persistent settings + UI
- `HumorousTaskGenerator` — text decoration
- `ToggleStageAction` — toolbar action
- `plugin.xml` — all extension registrations
- `build.gradle.kts` — dependency updates
- `mcpServer/src/` — replace HTTP with stdio JSON-RPC transport

Dev A does **NOT** touch:
- `StagePanel`, `AudiencePanel`, `StageCenterPanel`
- `AvatarComponent`, `AvatarRenderer*`, `AnimationEngine`
- `TaskBubblePanel`

---

## Source Tree (Dev A creates)

```
intelliJPlugin/
├── build.gradle.kts                                         MODIFY
├── resources/META-INF/plugin.xml                            MODIFY
└── src/main/kotlin/com/example/mcpassistant/
    ├── model/
    │   ├── Agent.kt                                         CREATE
    │   └── AgentTask.kt                                     CREATE
    ├── services/
    │   ├── AgentRegistryService.kt                          CREATE
    │   ├── MCPBridgeService.kt                              CREATE
    │   └── ElevenLabsService.kt                             CREATE
    ├── plugin/
    │   ├── StageToolWindowFactory.kt                        CREATE (stub — calls Dev B's StagePanel)
    │   └── McpInstallStartupActivity.kt                     CREATE
    ├── settings/
    │   ├── StageSettingsState.kt                            CREATE
    │   └── StageSettingsConfigurable.kt                     CREATE
    ├── ui/
    │   └── StageUIListener.kt                               CREATE (interface Dev B implements)
    ├── actions/
    │   └── ToggleStageAction.kt                             CREATE
    └── humor/
        └── HumorousTaskGenerator.kt                         CREATE

mcpServer/src/
    ├── index.ts                                             MODIFY (stdio transport)
    └── handlers.ts                                          CREATE
```

---

## Phase 0 — Shared Contracts (FIRST — Dev B blocks on this)

Create these before anything else so Dev B can start immediately.

### `model/Agent.kt`
```kotlin
package com.example.mcpassistant.model

data class Agent(
    val id: String,
    val name: String,
    val type: String,      // "orchestrator", "coder", "researcher", "reviewer", "tester", or any future string
    val description: String = ""
)
```

### `model/AgentTask.kt`
```kotlin
package com.example.mcpassistant.model

data class AgentTask(
    val taskId: String,
    val agentId: String,
    val description: String,
    val status: TaskStatus,
    val result: String = ""
)

enum class TaskStatus { ACTIVE, COMPLETED, FAILED }
```

### `ui/StageUIListener.kt` — interface Dev B implements to receive events
```kotlin
package com.example.mcpassistant.ui

import com.example.mcpassistant.model.Agent
import com.example.mcpassistant.model.AgentTask

interface StageUIListener {
    fun onAgentRegistered(agent: Agent)
    fun onTaskStarted(task: AgentTask)
    fun onTaskCompleted(taskId: String, agentId: String, result: String)
}
```

---

## Phase 1 — Build Setup

### `build.gradle.kts` changes
```kotlin
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.15.2")
    // javax.sound.sampled — JDK built-in, no dep needed
}

intellij {
    version.set("2023.3")
    type.set("IC")
    plugins.set(listOf("java"))
}

tasks {
    patchPluginXml {
        sinceBuild.set("233")
        untilBuild.set("243.*")
    }
}
```

---

## Phase 2 — plugin.xml

```xml
<idea-plugin>
  <id>com.example.mcpassistant</id>
  <name>ADHDeveloper Stage Mode</name>
  <vendor>ADHDeveloper</vendor>
  <description>AI agent theatrical stage — avatars, TTS, audience animations.</description>
  <idea-version since-build="233" until-build="243.*"/>

  <extensions defaultExtensionNs="com.intellij">
    <toolWindow id="AgentStage"
                factoryClass="com.example.mcpassistant.plugin.StageToolWindowFactory"
                anchor="bottom"
                icon="/icons/stage.svg"
                canCloseContents="false"/>

    <projectService serviceImplementation="com.example.mcpassistant.services.AgentRegistryService"/>
    <projectService serviceImplementation="com.example.mcpassistant.services.MCPBridgeService"/>
    <applicationService serviceImplementation="com.example.mcpassistant.services.ElevenLabsService"/>
    <applicationService serviceImplementation="com.example.mcpassistant.settings.StageSettingsState"
                        serviceInterface="com.example.mcpassistant.settings.StageSettingsState"/>

    <applicationConfigurable
        parentId="tools"
        instance="com.example.mcpassistant.settings.StageSettingsConfigurable"
        id="com.example.mcpassistant.settings"
        displayName="Agent Stage"/>

    <postStartupActivity implementation="com.example.mcpassistant.plugin.McpInstallStartupActivity"/>

    <notificationGroup id="AgentStage.Notifications" displayType="BALLOON" isLogByDefault="true"/>
  </extensions>

  <actions>
    <action id="AgentStage.Toggle"
            class="com.example.mcpassistant.actions.ToggleStageAction"
            text="Toggle Agent Stage"
            description="Show/hide the agent stage panel">
      <add-to-group group-id="ToolsMenu" anchor="last"/>
    </action>
  </actions>
</idea-plugin>
```

---

## Phase 3 — AgentRegistryService

```kotlin
@Service(Service.Level.PROJECT)
class AgentRegistryService(private val project: Project) : Disposable {

    data class AgentState(
        val agent: Agent,
        var isOnStage: Boolean = false,
        var currentTask: AgentTask? = null
    )

    private val agents = ConcurrentHashMap<String, AgentState>()
    private val listeners = mutableListOf<StageUIListener>()

    fun addListener(l: StageUIListener) { listeners.add(l) }
    fun removeListener(l: StageUIListener) { listeners.remove(l) }

    fun registerAgent(agent: Agent) {
        if (agents.containsKey(agent.id)) return
        agents[agent.id] = AgentState(agent)
        fireOnEDT { listeners.forEach { it.onAgentRegistered(agent) } }
    }

    fun startTask(task: AgentTask) {
        agents[task.agentId]?.let {
            it.isOnStage = true
            it.currentTask = task
        }
        fireOnEDT { listeners.forEach { it.onTaskStarted(task) } }
    }

    fun completeTask(taskId: String, agentId: String, result: String) {
        agents[agentId]?.let {
            it.isOnStage = false
            it.currentTask = null
        }
        fireOnEDT { listeners.forEach { it.onTaskCompleted(taskId, agentId, result) } }
    }

    fun getAgents(): List<AgentState> = agents.values.toList()

    private fun fireOnEDT(block: () -> Unit) =
        ApplicationManager.getApplication().invokeLater(block)

    override fun dispose() { listeners.clear() }
}
```

---

## Phase 4 — MCPBridgeService (stdio transport)

**Protocol:** newline-delimited JSON-RPC 2.0 over stdin/stdout.

```kotlin
@Service(Service.Level.PROJECT)
class MCPBridgeService(private val project: Project) : Disposable {

    private val registry get() = project.service<AgentRegistryService>()
    private val mapper = jacksonObjectMapper()
    private var process: Process? = null
    private val readerThread = Executors.newSingleThreadExecutor()
    private val requestId = AtomicInteger(1)
    private var writer: PrintWriter? = null

    fun start(mcpDir: File) {
        val pb = ProcessBuilder("node", "dist/index.js")
            .directory(mcpDir)
            .redirectErrorStream(false)
        process = pb.start()
        writer = PrintWriter(process!!.outputStream.bufferedWriter(), true)

        readerThread.submit { readLoop() }

        // Initial hydration
        send("agents/list", emptyMap<String, Any>())
        send("tasks/active", emptyMap<String, Any>())
    }

    private fun readLoop() {
        process?.inputStream?.bufferedReader()?.forEachLine { line ->
            try {
                val msg = mapper.readTree(line)
                if (msg.has("method")) handleNotification(msg)
                else if (msg.has("id") && msg.has("result")) handleResponse(msg)
            } catch (e: Exception) {
                // log malformed line, continue
            }
        }
    }

    private fun handleNotification(msg: JsonNode) {
        val params = msg["params"] ?: return
        when (msg["method"].asText()) {
            "agent/registered" -> registry.registerAgent(params.toAgent())
            "task/started"     -> registry.startTask(params.toTask())
            "task/completed"   -> registry.completeTask(
                params["taskId"].asText(),
                params["agentId"].asText(),
                params["result"]?.asText() ?: ""
            )
        }
    }

    private fun handleResponse(msg: JsonNode) {
        val result = msg["result"] ?: return
        // Handle agents/list response
        result["agents"]?.forEach { registry.registerAgent(it.toAgent()) }
        // Handle tasks/active response
        result["tasks"]?.forEach { registry.startTask(it.toTask()) }
    }

    private fun send(method: String, params: Any) {
        val payload = mapOf("jsonrpc" to "2.0", "id" to requestId.getAndIncrement(), "method" to method, "params" to params)
        writer?.println(mapper.writeValueAsString(payload))
    }

    // Extension fns to parse JsonNode → model
    private fun JsonNode.toAgent() = Agent(
        id = this["id"].asText(),
        name = this["name"].asText(),
        type = this["type"].asText(),
        description = this["description"]?.asText() ?: ""
    )
    private fun JsonNode.toTask() = AgentTask(
        taskId = this["taskId"].asText(),
        agentId = this["agentId"].asText(),
        description = this["description"].asText(),
        status = TaskStatus.valueOf(this["status"]?.asText()?.uppercase() ?: "ACTIVE"),
        result = this["result"]?.asText() ?: ""
    )

    override fun dispose() {
        process?.destroy()
        readerThread.shutdownNow()
    }
}
```

---

## Phase 5 — McpInstallStartupActivity

```kotlin
class McpInstallStartupActivity : StartupActivity.DumbAware {
    override fun runActivity(project: Project) {
        if (!StageSettingsState.getInstance().mcpEnabled) return

        ApplicationManager.getApplication().executeOnPooledThread {
            val mcpDir = findMcpServerDir(project) ?: run {
                notify(project, "Agent Stage: mcpServer directory not found", NotificationType.ERROR)
                return@executeOnPooledThread
            }

            // Check Node.js
            val nodeOk = ProcessBuilder("node", "--version").start().waitFor() == 0
            if (!nodeOk) {
                notify(project, "Agent Stage: Node.js not found — install Node.js 18+", NotificationType.WARNING)
                return@executeOnPooledThread
            }

            // npm install if needed
            if (!File(mcpDir, "node_modules").exists()) {
                ProcessBuilder("npm", "install").directory(mcpDir).start().waitFor()
            }

            // npm build (compile TypeScript)
            if (!File(mcpDir, "dist").exists()) {
                ProcessBuilder("npm", "run", "build").directory(mcpDir).start().waitFor()
            }

            // Start bridge
            project.service<MCPBridgeService>().start(mcpDir)
        }
    }

    private fun findMcpServerDir(project: Project): File? {
        // Look for mcpServer/ relative to project base path
        val base = File(project.basePath ?: return null)
        return File(base, "mcpServer").takeIf { it.exists() && it.isDirectory }
    }

    private fun notify(project: Project, msg: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("AgentStage.Notifications")
            .createNotification(msg, type)
            .notify(project)
    }
}
```

---

## Phase 6 — ElevenLabsService (TTS + audio)

```kotlin
@Service(Service.Level.APP)
class ElevenLabsService : Disposable {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val mapper = jacksonObjectMapper()
    private val audioExecutor = Executors.newSingleThreadExecutor()

    // Fetch available voices from ElevenLabs API
    fun fetchVoices(apiKey: String): List<VoiceOption> {
        val request = Request.Builder()
            .url("https://api.elevenlabs.io/v1/voices")
            .header("xi-api-key", apiKey)
            .build()
        return client.newCall(request).execute().use { response ->
            val body = mapper.readTree(response.body!!.string())
            body["voices"].map { VoiceOption(it["voice_id"].asText(), it["name"].asText()) }
        }
    }

    data class VoiceOption(val id: String, val name: String) {
        override fun toString() = name
    }

    fun speak(text: String, agentType: String, onComplete: () -> Unit) {
        val settings = StageSettingsState.getInstance()
        if (!settings.ttsEnabled || settings.elevenLabsApiKey.isBlank()) return

        audioExecutor.submit {
            try {
                val voiceId = settings.voiceAssignments[agentType]
                    ?: settings.voiceAssignments["default"]
                    ?: return@submit

                val body = mapper.writeValueAsBytes(mapOf(
                    "text" to text,
                    "model_id" to "eleven_turbo_v2",
                    "voice_settings" to mapOf("stability" to 0.5, "similarity_boost" to 0.75)
                ))
                val request = Request.Builder()
                    .url("https://api.elevenlabs.io/v1/text-to-speech/$voiceId")
                    .header("xi-api-key", settings.elevenLabsApiKey)
                    .header("Accept", "audio/mpeg")
                    .post(body.toRequestBody("application/json".toMediaType()))
                    .build()

                client.newCall(request).execute().use { response ->
                    playAudio(response.body!!.bytes())
                }
            } finally {
                onComplete()
            }
        }
    }

    fun playCompletionSound() {
        if (!StageSettingsState.getInstance().soundEffectsEnabled) return
        audioExecutor.submit {
            val url = javaClass.getResource("/sounds/task_complete.wav") ?: return@submit
            val stream = AudioSystem.getAudioInputStream(url)
            val clip = AudioSystem.getClip()
            clip.open(stream)
            clip.start()
            Thread.sleep(clip.microsecondLength / 1000 + 100)
            clip.close()
        }
    }

    private fun playAudio(bytes: ByteArray) {
        // MP3 from ElevenLabs — requires Java Sound with MP3 SPI (or convert to WAV)
        // Option A: add mp3spi dependency to build.gradle.kts
        // Option B: use javax.sound with BasicPlayer (TarsosMP3)
        // Simplest: add "com.googlecode.soundlibs:mp3spi:1.9.5.4" to deps
        val stream = AudioSystem.getAudioInputStream(bytes.inputStream())
        val clip = AudioSystem.getClip()
        clip.open(stream)
        clip.start()
    }

    override fun dispose() { audioExecutor.shutdownNow() }
}
```

**Add to `build.gradle.kts`:**
```kotlin
implementation("com.googlecode.soundlibs:mp3spi:1.9.5.4")
```

---

## Phase 7 — Settings

### `StageSettingsState.kt`
```kotlin
@State(name = "AgentStageSettings", storages = [Storage("agentStage.xml")])
@Service(Service.Level.APP)
class StageSettingsState : PersistentStateComponent<StageSettingsState> {
    companion object { fun getInstance() = service<StageSettingsState>() }

    var elevenLabsApiKey: String = ""
    var mcpEnabled: Boolean = true
    var ttsEnabled: Boolean = true
    var soundEffectsEnabled: Boolean = true
    var voiceAssignments: MutableMap<String, String> = mutableMapOf()

    override fun getState() = this
    override fun loadState(state: StageSettingsState) { XmlSerializerUtil.copyBean(state, this) }
}
```

### `StageSettingsConfigurable.kt`
```kotlin
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
        row { checkBox("Enable MCP integration").bindSelected(settings::mcpEnabled) }
        row { checkBox("Enable TTS narration").bindSelected(settings::ttsEnabled) }
        row { checkBox("Enable sound effects").bindSelected(settings::soundEffectsEnabled) }
    }

    private fun refreshVoiceDropdowns() { /* repopulate comboBox models */ }
    override fun isModified() = false  // state mutated directly via bindings
    override fun apply() {}
    override fun reset() {}
}
```

---

## Phase 8 — HumorousTaskGenerator

```kotlin
object HumorousTaskGenerator {
    private val openers = listOf(
        "Reluctantly agrees to",
        "With great sighing,",
        "Confidently misinterprets",
        "Heroically attempts to",
        "Pretends to understand",
        "Aggressively Googles how to",
        "Copies from Stack Overflow to",
    )
    private val closers = listOf(
        "(results may vary)",
        "(coffee not included)",
        "(blame the PM)",
        "(Stack Overflow was down)",
        "(LGTM, ship it)",
        "(my code, my rules)",
        "(technically it works)",
    )

    fun generate(task: AgentTask): String =
        "${openers.random()} ${task.description.lowercase()} ${closers.random()}"
}
```

---

## Phase 9 — ToggleStageAction

```kotlin
class ToggleStageAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val tw = ToolWindowManager.getInstance(project).getToolWindow("AgentStage") ?: return
        if (tw.isVisible) tw.hide() else tw.show()
    }
}
```

---

## Phase 10 — StageToolWindowFactory (stub)

```kotlin
class StageToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        // Instantiate Dev B's StagePanel
        val panel = StagePanel(project)
        val content = toolWindow.contentManager.factory.createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)

        // Wire registry events to UI
        val registry = project.service<AgentRegistryService>()
        registry.addListener(panel)  // StagePanel implements StageUIListener
    }
}
```

---

## Phase 11 — mcpServer stdio transport

### `mcpServer/src/index.ts` (rewrite)
```typescript
import * as readline from 'readline'
import { handleMethod } from './handlers'

const rl = readline.createInterface({ input: process.stdin, terminal: false })

rl.on('line', (line: string) => {
    let msg: any
    try { msg = JSON.parse(line) } catch { return }

    const result = handleMethod(msg.method, msg.params ?? {})
    if (msg.id !== undefined) {
        process.stdout.write(JSON.stringify({
            jsonrpc: '2.0', id: msg.id, result
        }) + '\n')
    }
})

// Push notifications helper — called by handlers when state changes
export function notify(method: string, params: object) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}
```

### `mcpServer/src/handlers.ts`
```typescript
import { notify } from './index'

interface AgentRecord { id: string; name: string; type: string; description: string }
interface TaskRecord { taskId: string; agentId: string; description: string; status: string; result: string }

const agents = new Map<string, AgentRecord>()
const tasks = new Map<string, TaskRecord>()

export function handleMethod(method: string, params: any): any {
    switch (method) {
        case 'agents/list':
            return { agents: [...agents.values()] }
        case 'tasks/active':
            return { tasks: [...tasks.values()].filter(t => t.status === 'ACTIVE') }
        case 'agent/register':
            agents.set(params.id, params)
            notify('agent/registered', params)
            return { ok: true }
        case 'task/start':
            tasks.set(params.taskId, { ...params, status: 'ACTIVE' })
            notify('task/started', tasks.get(params.taskId)!)
            return { ok: true }
        case 'task/complete':
            const task = tasks.get(params.taskId)
            if (task) { task.status = 'COMPLETED'; task.result = params.result ?? '' }
            notify('task/completed', { taskId: params.taskId, agentId: task?.agentId, result: params.result })
            return { ok: true }
        default:
            return { error: `unknown method: ${method}` }
    }
}
```

---

## Phase 12 — Sound Asset

Create a short task-complete chime programmatically (no external asset needed):

```kotlin
// In ElevenLabsService or SoundService
fun generateCompletionSound(): ByteArray {
    // 440Hz sine wave, 0.4s, fade out
    val sampleRate = 44100
    val frames = (sampleRate * 0.4).toInt()
    val buffer = ByteArray(frames * 2)
    for (i in 0 until frames) {
        val t = i.toDouble() / sampleRate
        val amplitude = (1.0 - t / 0.4) * Short.MAX_VALUE
        val sample = (sin(2 * PI * 440 * t) * amplitude).toInt().toShort()
        buffer[i * 2] = (sample.toInt() and 0xff).toByte()
        buffer[i * 2 + 1] = (sample.toInt() shr 8).toByte()
    }
    return buffer
}
```

Or place `task_complete.wav` in `src/main/resources/sounds/`.

---

## Verification (Dev A)

1. `./gradlew buildPlugin` — no compilation errors
2. `./gradlew runIde` — IDE sandbox starts, "AgentStage" tool window appears at bottom
3. In sandbox: Settings → Tools → Agent Stage → enter ElevenLabs key → click "Load Voices" → dropdowns populate
4. Toggle MCP OFF → `McpInstallStartupActivity` skips
5. Toggle MCP ON, restart → Node.js check runs, npm install runs, MCPBridgeService starts process
6. In terminal: send JSON to mcpServer stdin manually → plugin receives agent/task events (check logs)
7. `./gradlew runIde` + Dev B's UI merged → full flow works end to end

---

## Handoff to Dev B

Dev A must complete **Phase 0** (models + `StageUIListener`) before Dev B can proceed.
Dev A must complete `AgentRegistryService` API (no impl detail needed) before Dev B wires listeners.
`StageToolWindowFactory` stub (`Phase 10`) must compile — Dev B's `StagePanel` class must exist (even as empty stub) for it to compile.
