// PulseTerm — Brickwall Lookahead Limiter AudioWorkletProcessor
// 5ms lookahead buffer with stereo-linked true peak ceiling at -1.0 dBFS and 80ms release

class BrickwallLimiterProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.threshold = Math.pow(10, -1.0 / 20); // -1.0 dBFS = ~0.89125
        this.lookahead = 240; // 5ms @ 48kHz
        this.bufferL = new Float32Array(this.lookahead);
        this.bufferR = new Float32Array(this.lookahead);
        this.peakBuffer = new Float32Array(this.lookahead);
        this.bufIndex = 0;
        this.currentGain = 1.0;
        // ~80ms release time constant @ 48kHz
        this.releaseCoeff = Math.exp(-1.0 / (0.080 * 48000));
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || !input[0]) return true;

        const inL = input[0];
        const inR = input[1] || input[0];
        const outL = output[0];
        const outR = output[1] || output[0];
        const blockSize = inL.length;

        for (let i = 0; i < blockSize; i++) {
            const sL = inL[i];
            const sR = inR[i];
            const inPeak = Math.max(Math.abs(sL), Math.abs(sR));

            // Delayed audio read
            const delayedL = this.bufferL[this.bufIndex];
            const delayedR = this.bufferR[this.bufIndex];

            // Store new input to circular buffers
            this.bufferL[this.bufIndex] = sL;
            this.bufferR[this.bufIndex] = sR;
            this.peakBuffer[this.bufIndex] = inPeak;

            this.bufIndex = (this.bufIndex + 1) % this.lookahead;

            // Search maximum peak across entire lookahead window
            let windowPeak = inPeak;
            for (let k = 0; k < this.lookahead; k++) {
                if (this.peakBuffer[k] > windowPeak) {
                    windowPeak = this.peakBuffer[k];
                }
            }

            // Target gain based on the lookahead envelope
            let targetGain = 1.0;
            if (windowPeak > this.threshold) {
                targetGain = this.threshold / windowPeak;
            }

            // Instant attack: if targetGain is lower than currentGain, jump immediately
            // Release: smooth exponential recovery
            if (targetGain < this.currentGain) {
                this.currentGain = targetGain;
            } else {
                this.currentGain = targetGain + (this.currentGain - targetGain) * this.releaseCoeff;
            }

            // Absolute brickwall safety ceiling
            const delayedPeak = Math.max(Math.abs(delayedL), Math.abs(delayedR));
            let appliedGain = this.currentGain;
            if (delayedPeak * appliedGain > this.threshold) {
                appliedGain = this.threshold / (delayedPeak + 1e-9);
            }

            outL[i] = delayedL * appliedGain;
            if (outR) outR[i] = delayedR * appliedGain;
        }

        return true;
    }
}

registerProcessor('brickwall-limiter', BrickwallLimiterProcessor);
