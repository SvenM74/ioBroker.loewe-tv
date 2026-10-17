'use strict';

// Loewe Remote API 1.0.47, section 9.4.3: a magic packet may only wake
// network standby. The caller must send the discrete TV_ON key (l2700/22).
// This workflow confirms delivery of that key, not a visible picture.

function failure(code, message, details = {}) {
    return Object.assign(new Error(message), { code, ...details });
}

function abortFailure(reason) {
    return failure('CANCELLED', 'Einschaltvorgang abgebrochen.', {
        name: 'AbortError', ...(reason === undefined ? {} : { cause: reason }),
    });
}

function abortableWait(ms, signal) {
    return new Promise((resolve, reject) => {
        let timer;
        const finish = error => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            if (error) reject(error);
            else resolve();
        };
        const onAbort = () => finish(signal.reason || abortFailure());
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => finish(), ms);
    });
}

function transient(error) {
    return error?.code === 'NETWORK' || error?.sessionInvalid === true
        || (error?.code === 'HTTP' && [502, 503, 504].includes(error.httpStatus));
}

function errorDetails(error) {
    return {
        code: error?.code || 'ERROR',
        message: error?.message || String(error),
        ...(error?.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
        ...(error?.sessionInvalid === undefined ? {} : { sessionInvalid: error.sessionInvalid }),
    };
}

/**
 * Wake a Loewe TV and deliver its discrete TV_ON key.
 *
 * sendPowerKey receives an absolute deadline, including any time it spends in
 * the caller's SOAP queue. The caller must check that deadline and cancellation
 * before actually transmitting. A race cannot retract an already queued call.
 * wait receives (milliseconds, AbortSignal). Hooks may return promises.
 *
 * Terminal diagnostics are best effort and cannot delay cancellation or the
 * overall deadline. Device hooks are never invoked after cancellation.
 */
async function runPowerOn({
    sendWake,
    sendPowerKey,
    onProgress = () => {},
    signal,
    timeoutMs = 60000,
    retryIntervalMs = 2000,
    firstKeyDelayMs = 1000,
    maxRequestMs = 3000,
    rebroadcastAfterMs = 35000,
    now = Date.now,
    wait = abortableWait,
} = {}) {
    for (const [name, callback] of Object.entries({ sendWake, sendPowerKey, onProgress, now, wait })) {
        if (typeof callback !== 'function') throw new TypeError(`${name} muss eine Funktion sein.`);
    }
    for (const [name, value, minimum] of [
        ['timeoutMs', timeoutMs, 1], ['retryIntervalMs', retryIntervalMs, 1],
        ['firstKeyDelayMs', firstKeyDelayMs, 0], ['maxRequestMs', maxRequestMs, 1],
        ['rebroadcastAfterMs', rebroadcastAfterMs, 1],
    ]) {
        if (!Number.isSafeInteger(value) || value < minimum || value > 2147483647) {
            throw new TypeError(`${name} muss eine gültige Zeitspanne in Millisekunden sein.`);
        }
    }
    if (signal !== undefined && (typeof signal?.addEventListener !== 'function'
        || typeof signal?.removeEventListener !== 'function' || typeof signal?.aborted !== 'boolean')) {
        throw new TypeError('signal muss ein AbortSignal sein.');
    }

    const startedAt = now();
    if (!Number.isFinite(startedAt) || !Number.isSafeInteger(startedAt + timeoutMs)) {
        throw new TypeError('now muss einen gültigen Zeitstempel in Millisekunden liefern.');
    }
    const deadline = startedAt + timeoutMs;
    const controller = new AbortController();
    const workflowSignal = controller.signal;
    const timeoutFailure = () => failure('TIMEOUT', 'TV-Einschalten nicht innerhalb der Frist abgeschlossen.');
    const onAbort = () => controller.abort(abortFailure(signal.reason));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(timeoutFailure()), timeoutMs);
    let attempts = 0;
    let wakeBursts = 0;
    let lastError;
    let wakeResponse;
    let lastWakeResponse;

    const check = () => {
        if (workflowSignal.aborted) throw workflowSignal.reason;
        if (now() >= deadline) {
            controller.abort(timeoutFailure());
            throw workflowSignal.reason;
        }
    };
    const details = extra => ({
        startedAt, deadline, elapsedMs: Math.max(0, now() - startedAt), attempts, wakeBursts,
        ...(lastError ? { lastError: errorDetails(lastError) } : {}), ...extra,
    });

    // Every promise gets rejection handlers immediately. A timed-out hook may
    // still settle later; its result is ignored and cannot restart the workflow.
    const step = (operation, stepDeadline = deadline, stepTimeout = timeoutFailure) => {
        return new Promise((resolve, reject) => {
            let settled = false;
            let timer;
            const finish = (error, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                workflowSignal.removeEventListener('abort', aborted);
                if (error) reject(error);
                else resolve(value);
            };
            const aborted = () => finish(workflowSignal.reason);
            workflowSignal.addEventListener('abort', aborted, { once: true });
            timer = setTimeout(() => {
                try {
                    check();
                    finish(stepTimeout());
                } catch (error) {
                    finish(error);
                }
            }, Math.max(0, stepDeadline - now()));
            try {
                check();
                if (now() >= stepDeadline) {
                    finish(stepTimeout());
                    return;
                }
                Promise.resolve(operation()).then(value => {
                    try {
                        check();
                        if (now() >= stepDeadline) finish(stepTimeout());
                        else finish(null, value);
                    } catch (error) {
                        finish(error);
                    }
                }, error => {
                    try {
                        check();
                        finish(error);
                    } catch (stopError) {
                        finish(stopError);
                    }
                });
            } catch (error) {
                finish(error);
            }
        });
    };
    const progress = (phase, extra) => step(() => onProgress(phase, details(extra)));
    const pause = ms => step(() => wait(Math.min(ms, Math.max(0, deadline - now())), workflowSignal));
    const sendBurst = async () => {
        check();
        wakeBursts++;
        // Start WOL before a potentially slow diagnostics/database callback.
        const sending = step(sendWake);
        const notifying = progress('waking');
        [lastWakeResponse] = await Promise.all([sending, notifying]);
        return lastWakeResponse;
    };
    const terminalProgress = (phase, error) => {
        // This final diagnostic is the only hook permitted after cancellation.
        // It must not extend the deadline or replace the original failure.
        try {
            Promise.resolve(onProgress(phase, details({ error: errorDetails(error) }))).catch(() => {});
        } catch { /* Failure reporting is best effort. */ }
    };

    try {
        check();
        wakeResponse = await sendBurst();
        await progress('waiting', { nextAttemptInMs: firstKeyDelayMs });
        if (firstKeyDelayMs > 0) await pause(firstKeyDelayMs);
        while (true) {
            check();
            // Some Loewe sets ignore WOL for at least 30 seconds after entering
            // standby. One later burst covers that interval without endless WOL.
            if (wakeBursts === 1 && now() - startedAt >= rebroadcastAfterMs) await sendBurst();
            check();
            attempts++;
            const requestDeadline = Math.min(deadline, now() + maxRequestMs);
            let response;
            try {
                response = await step(() => sendPowerKey(requestDeadline), requestDeadline, () => failure(
                    'NETWORK', 'TV-Einschaltbefehl wartet zu lange auf die Schnittstelle.', { transportCode: 'ETIMEDOUT' },
                ));
            } catch (error) {
                check();
                if (!transient(error)) throw error;
                lastError = error;
                await progress('waiting', { nextAttemptInMs: retryIntervalMs });
                await pause(retryIntervalMs);
                continue;
            }
            check();
            await progress('powerKeySent');
            check();
            return { response, wakeResponse, lastWakeResponse, attempts, wakeBursts, startedAt, completedAt: now() };
        }
    } catch (error) {
        terminalProgress(error?.code === 'CANCELLED' ? 'cancelled' : 'failed', error);
        throw error;
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        // Cancel remaining waits when another parallel hook failed first.
        if (!workflowSignal.aborted) controller.abort(abortFailure());
    }
}

module.exports = { runPowerOn };
