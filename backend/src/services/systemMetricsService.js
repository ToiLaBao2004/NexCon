const SAMPLE_INTERVAL_MS = 60 * 1000;
const MAX_RUNTIME_SAMPLES = 48 * 60;
const MAX_REQUEST_EVENTS = 20000;

let started = false;
let timer = null;
let runtimeSamples = [];
let requestEvents = [];
let lastCpuUsage = process.cpuUsage();
let lastSampleAt = process.hrtime.bigint();

function bytesToMb(value) {
    return Math.round((Number(value || 0) / 1024 / 1024) * 100) / 100;
}

function clampCpu(value) {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value * 1000) / 1000;
}

function trimSamples() {
    if (runtimeSamples.length > MAX_RUNTIME_SAMPLES) {
        runtimeSamples = runtimeSamples.slice(runtimeSamples.length - MAX_RUNTIME_SAMPLES);
    }
}

function trimRequestEvents() {
    if (requestEvents.length > MAX_REQUEST_EVENTS) {
        requestEvents = requestEvents.slice(requestEvents.length - MAX_REQUEST_EVENTS);
    }
}

export function sampleSystemMetrics() {
    const now = new Date();
    const currentCpuUsage = process.cpuUsage();
    const currentSampleAt = process.hrtime.bigint();
    const elapsedMicros = Number(currentSampleAt - lastSampleAt) / 1000;
    const cpuMicros = (
        currentCpuUsage.user - lastCpuUsage.user
        + currentCpuUsage.system - lastCpuUsage.system
    );
    const hasPreviousSample = runtimeSamples.length > 0;
    const memory = process.memoryUsage();

    const sample = {
        timestamp: now.toISOString(),
        cpuVCpu: hasPreviousSample && elapsedMicros > 0 ? clampCpu(cpuMicros / elapsedMicros) : 0,
        memoryRssMb: bytesToMb(memory.rss),
        heapUsedMb: bytesToMb(memory.heapUsed),
        heapTotalMb: bytesToMb(memory.heapTotal),
        externalMb: bytesToMb(memory.external),
        uptimeSeconds: Math.round(process.uptime()),
    };

    runtimeSamples.push(sample);
    trimSamples();
    lastCpuUsage = currentCpuUsage;
    lastSampleAt = currentSampleAt;

    return sample;
}

export function startSystemMetricsSampler() {
    if (started) return;
    started = true;
    sampleSystemMetrics();
    timer = setInterval(sampleSystemMetrics, SAMPLE_INTERVAL_MS);
    timer.unref?.();
}

export function recordApiRequest({ statusCode, durationMs, bytes = 0 }) {
    requestEvents.push({
        timestamp: new Date(),
        statusCode: Number(statusCode) || 0,
        durationMs: Math.max(0, Number(durationMs) || 0),
        bytes: Math.max(0, Number(bytes) || 0),
    });
    trimRequestEvents();
}

export function getSystemMetricsSnapshot({ since = new Date(Date.now() - 24 * 60 * 60 * 1000) } = {}) {
    if (runtimeSamples.length === 0) {
        sampleSystemMetrics();
    }

    const sinceMs = since.getTime();
    const samples = runtimeSamples.filter((sample) => new Date(sample.timestamp).getTime() >= sinceMs);
    const current = runtimeSamples[runtimeSamples.length - 1] || sampleSystemMetrics();

    return {
        current,
        samples: samples.length > 0 ? samples : [current],
    };
}

export function getRequestTrafficBuckets({ since, bucketMs, bucketCount }) {
    const sinceMs = since.getTime();
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
        timestamp: new Date(sinceMs + index * bucketMs).toISOString(),
        requests: 0,
        errors: 0,
        durationTotalMs: 0,
        egressBytes: 0,
    }));

    requestEvents.forEach((event) => {
        const eventMs = event.timestamp.getTime();
        if (eventMs < sinceMs) return;

        const index = Math.floor((eventMs - sinceMs) / bucketMs);
        if (index < 0 || index >= buckets.length) return;

        buckets[index].requests += 1;
        buckets[index].errors += event.statusCode >= 500 ? 1 : 0;
        buckets[index].durationTotalMs += event.durationMs;
        buckets[index].egressBytes += event.bytes;
    });

    return buckets.map((bucket) => ({
        timestamp: bucket.timestamp,
        requests: bucket.requests,
        errors: bucket.errors,
        avgDurationMs: bucket.requests > 0 ? Math.round(bucket.durationTotalMs / bucket.requests) : 0,
        egressBytes: bucket.egressBytes,
    }));
}
