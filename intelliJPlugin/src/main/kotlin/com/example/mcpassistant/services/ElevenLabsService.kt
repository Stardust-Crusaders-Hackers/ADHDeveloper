package com.example.mcpassistant.services

import com.example.mcpassistant.settings.StageSettingsState
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.BufferedInputStream
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import javax.sound.sampled.*

@Service(Service.Level.PROJECT)
class ElevenLabsService {

    private val log = Logger.getInstance(ElevenLabsService::class.java)
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun speak(text: String, agentType: String): CompletableFuture<Void> {
        val settings = StageSettingsState.getInstance()
        if (!settings.ttsEnabled || settings.elevenLabsApiKey.isBlank()) {
            return CompletableFuture.completedFuture(null)
        }

        val future = CompletableFuture<Void>()

        Thread {
            try {
                val voiceId = settings.voiceIdByType[agentType.lowercase()]
                ?: settings.elevenLabsVoiceId.ifBlank { "21m00Tcm4TlvDq8ikWAM" }
                val body = """{"text":"${text.replace("\"", "\\\"")}","model_id":"eleven_monolingual_v1","voice_settings":{"stability":0.5,"similarity_boost":0.75}}"""

                val request = Request.Builder()
                    .url("https://api.elevenlabs.io/v1/text-to-speech/$voiceId")
                    .addHeader("xi-api-key", settings.elevenLabsApiKey)
                    .addHeader("Accept", "audio/mpeg")
                    .post(body.toRequestBody("application/json".toMediaType()))
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        log.warn("ElevenLabs TTS failed: ${response.code}")
                        future.complete(null)
                        return@Thread
                    }

                    val responseBody = response.body ?: run {
                        future.complete(null)
                        return@Thread
                    }

                    val audioIn = AudioSystem.getAudioInputStream(BufferedInputStream(responseBody.byteStream()))
                    val baseFormat = audioIn.format
                    val decodedFormat = AudioFormat(
                        AudioFormat.Encoding.PCM_SIGNED,
                        baseFormat.sampleRate,
                        16,
                        baseFormat.channels,
                        baseFormat.channels * 2,
                        baseFormat.sampleRate,
                        false
                    )
                    val decodedStream = AudioSystem.getAudioInputStream(decodedFormat, audioIn)
                    val clip = AudioSystem.getClip()
                    clip.open(decodedStream)
                    clip.addLineListener { event ->
                        if (event.type == LineEvent.Type.STOP) {
                            clip.close()
                            future.complete(null)
                        }
                    }
                    clip.start()
                }
            } catch (e: Exception) {
                log.warn("ElevenLabs TTS error", e)
                future.complete(null)
            }
        }.apply {
            isDaemon = true
            name = "ElevenLabs-TTS"
            start()
        }

        return future
    }

    fun playSound(resourcePath: String) {
        Thread {
            try {
                val stream = javaClass.getResourceAsStream(resourcePath) ?: return@Thread
                val audioIn = AudioSystem.getAudioInputStream(BufferedInputStream(stream))
                val clip = AudioSystem.getClip()
                clip.open(audioIn)
                clip.addLineListener { event ->
                    if (event.type == LineEvent.Type.STOP) clip.close()
                }
                clip.start()
            } catch (e: Exception) {
                log.warn("Sound playback error: $resourcePath", e)
            }
        }.apply {
            isDaemon = true
            name = "Sound-Player"
            start()
        }
    }
}
