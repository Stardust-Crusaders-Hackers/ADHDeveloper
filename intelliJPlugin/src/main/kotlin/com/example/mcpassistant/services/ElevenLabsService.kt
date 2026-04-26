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
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    fun speak(text: String, agentId: String): CompletableFuture<Void> {
        val settings = StageSettingsState.getInstance()
        if (!settings.ttsEnabled || settings.elevenLabsApiKey.isBlank()) {
            return CompletableFuture.completedFuture(null)
        }

        val future = CompletableFuture<Void>()

        Thread {
            try {
                val voiceId = settings.voiceIdByType[agentId.lowercase()]
                    ?: settings.elevenLabsVoiceId.ifBlank { "JBFqnCBsd6RMkjVDRZzb" }

                val body = """{"text":"${text.replace("\"", "\\\"")}","model_id":"eleven_v3","voice_settings":{"stability":0.5,"similarity_boost":0.75}}"""

                val request = Request.Builder()
                    .url("https://api.elevenlabs.io/v1/text-to-speech/$voiceId")
                    .addHeader("xi-api-key", settings.elevenLabsApiKey)
                    .post(body.toRequestBody("application/json".toMediaType()))
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        log.warn("ElevenLabs TTS failed: ${response.code} — ${response.body?.string()}")
                        future.complete(null)
                        return@Thread
                    }

                    val responseBody = response.body ?: run {
                        future.complete(null)
                        return@Thread
                    }

                    // mp3spi registers itself as a javax.sound.sampled SPI — AudioSystem
                    // picks it up automatically and decodes the MP3 stream.
                    val mp3Stream = AudioSystem.getAudioInputStream(BufferedInputStream(responseBody.byteStream()))
                    val base = mp3Stream.format
                    val pcmFormat = AudioFormat(
                        AudioFormat.Encoding.PCM_SIGNED,
                        base.sampleRate, 16,
                        base.channels, base.channels * 2,
                        base.sampleRate, false
                    )
                    val pcmStream = AudioSystem.getAudioInputStream(pcmFormat, mp3Stream)
                    val clip = AudioSystem.getClip()
                    clip.open(pcmStream)
                    clip.addLineListener { event ->
                        if (event.type == LineEvent.Type.STOP) {
                            clip.close()
                            pcmStream.close()
                            mp3Stream.close()
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
