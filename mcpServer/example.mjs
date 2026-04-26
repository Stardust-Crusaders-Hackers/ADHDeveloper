import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
// play() from the SDK requires mpv installed as a system binary — it produces no
// audio on Windows without it. Instead: request raw PCM, wrap in a WAV header,
// and let the OS-native player handle it (no extra npm packages needed).
const elevenlabs = new ElevenLabsClient();
const audio = await elevenlabs.textToSpeech.convert('JBFqnCBsd6RMkjVDRZzb', // "George" — browse voices at elevenlabs.io/app/voice-library
{
    text: 'The first move is what sets everything in motion.',
    modelId: 'eleven_v3',
    outputFormat: 'pcm_44100', // raw 16-bit signed PCM, 44100 Hz, mono
});
// Collect the stream
const chunks = [];
for await (const chunk of audio) {
    chunks.push(Buffer.from(chunk));
}
const pcm = Buffer.concat(chunks);
// Wrap in a WAV container — playable natively on every OS
writeFileSync('output.wav', Buffer.concat([wavHeader(pcm.length), pcm]));
// Play with the OS-native audio player
if (process.platform === 'win32') {
    execSync(`powershell -c "(New-Object Media.SoundPlayer 'output.wav').PlaySync()"`);
}
else if (process.platform === 'darwin') {
    execSync('afplay output.wav');
}
else {
    execSync('aplay output.wav');
}
function wavHeader(dataBytes) {
    const h = Buffer.alloc(44);
    const sampleRate = 44100, channels = 1, bitDepth = 16;
    const byteRate = sampleRate * channels * bitDepth / 8;
    h.write('RIFF', 0);
    h.writeUInt32LE(36 + dataBytes, 4);
    h.write('WAVE', 8);
    h.write('fmt ', 12);
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20); // PCM
    h.writeUInt16LE(channels, 22);
    h.writeUInt32LE(sampleRate, 24);
    h.writeUInt32LE(byteRate, 28);
    h.writeUInt16LE(channels * bitDepth / 8, 32);
    h.writeUInt16LE(bitDepth, 34);
    h.write('data', 36);
    h.writeUInt32LE(dataBytes, 40);
    return h;
}
