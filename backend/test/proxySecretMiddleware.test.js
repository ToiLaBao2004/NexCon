import assert from 'node:assert/strict';
import test from 'node:test';
import { requireProxySecret } from '../src/middlewares/proxySecretMiddleware.js';

function createResponse() {
    return {
        statusCode: null,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        },
    };
}

function runMiddleware({ path = '/messages', header } = {}) {
    const req = {
        path,
        headers: header ? { 'x-nexcon-proxy-secret': header } : {},
    };
    const res = createResponse();
    let nextCalled = false;

    requireProxySecret(req, res, () => {
        nextCalled = true;
    });

    return { res, nextCalled };
}

function restoreProxySecret(value) {
    if (value === undefined) {
        delete process.env.BACKEND_PROXY_SECRET;
        return;
    }

    process.env.BACKEND_PROXY_SECRET = value;
}

test('requireProxySecret allows requests when no proxy secret is configured', () => {
    const previousSecret = process.env.BACKEND_PROXY_SECRET;
    delete process.env.BACKEND_PROXY_SECRET;

    const result = runMiddleware();

    restoreProxySecret(previousSecret);
    assert.equal(result.nextCalled, true);
});

test('requireProxySecret allows health checks without proxy secret header', () => {
    const previousSecret = process.env.BACKEND_PROXY_SECRET;
    process.env.BACKEND_PROXY_SECRET = 'secret';

    const result = runMiddleware({ path: '/auth/health' });

    restoreProxySecret(previousSecret);
    assert.equal(result.nextCalled, true);
});

test('requireProxySecret rejects requests with missing or invalid proxy secret', () => {
    const previousSecret = process.env.BACKEND_PROXY_SECRET;
    process.env.BACKEND_PROXY_SECRET = 'secret';

    const missing = runMiddleware();
    const invalid = runMiddleware({ header: 'wrong' });

    restoreProxySecret(previousSecret);
    assert.equal(missing.nextCalled, false);
    assert.equal(missing.res.statusCode, 403);
    assert.equal(invalid.nextCalled, false);
    assert.equal(invalid.res.statusCode, 403);
});

test('requireProxySecret allows requests with the configured proxy secret', () => {
    const previousSecret = process.env.BACKEND_PROXY_SECRET;
    process.env.BACKEND_PROXY_SECRET = 'secret';

    const result = runMiddleware({ header: 'secret' });

    restoreProxySecret(previousSecret);
    assert.equal(result.nextCalled, true);
});
