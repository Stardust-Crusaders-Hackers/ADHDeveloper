package com.example.mcpassistant.services

import com.example.mcpassistant.settings.StageSettingsState
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.sound.sampled.AudioSystem

@Service(Service.Level.APP)
class ElevenLabsService : Disposable {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val mapper = jacksonObjectMapper()
    private val audioExecutor = Executors.newSingleThreadExecutor()

    data class VoiceOption(val id: String, val name: String) {
        override fun toString() = name
    }

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

    fun speak(text: String, agentType: String, onComplete: () -> Unit = {}) {
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
            val url = javaClass.getResource("/sounds/task_complete.wav") ?: run {
                playGeneratedChime()
                return@submit
            }
            val stream = AudioSystem.getAudioInputStream(url)
            val clip = AudioSystem.getClip()
            clip.open(stream)
            clip.start()
            Thread.sleep(clip.microsecondLength / 1000 + 100)
            clip.close()
        }
    }

    private fun playAudio(bytes: ByteArray) {
        val stream = AudioSystem.getAudioInputStream(bytes.inputStream())
        val clip = AudioSystem.getClip()
        clip.open(stream)
        clip.start()
        Thread.sleep(clip.microsecondLength / 1000 + 100)
        clip.close()
    }

    private fun playGeneratedChime() {
        val sampleRate = 44100
        val frames = (sampleRate * 0.4).toInt()
        val buffer = ByteArray(frames * 2)
        for (i in 0 until frames) {
            val t = i.toDouble() / sampleRate
            val amplitude = (1.0 - t / 0.4) * Short.MAX_VALUE
            val sample = (Math.sin(2 * Math.PI * 440 * t) * amplitude).toInt().toShort()
            buffer[i * 2] = (sample.toInt() and 0xff).toByte()
            buffer[i * 2 + 1] = (sample.toInt() shr 8).toByte()
        }
        val format = javax.sound.sampled.AudioFormat(sampleRate.toFloat(), 16, 1, true, false)
        val stream = javax.sound.sampled.AudioInputStream(
            buffer.inputStream(), format, frames.toLong()
        )
        val clip = AudioSystem.getClip()
        clip.open(stream)
        clip.start()
        Thread.sleep(500)
        clip.close()
    }

    override fun dispose() { audioExecutor.shutdownNow() }
}
