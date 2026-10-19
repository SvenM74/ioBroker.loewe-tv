'use strict';

// Offline fixture builder. Tests execute the generated CommonJS files; they
// neither fetch upstream code nor need Node's TypeScript stripper at runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stripTypeScriptTypes } = require('node:module');
const sources = require('./sources.json');

const sourceDirectory = process.argv[2];
assert.ok(sourceDirectory, 'Usage: node build.cjs /path/to/downloaded/sources');
assert.equal(typeof stripTypeScriptTypes, 'function', 'Use Node.js 24 to rebuild these fixtures.');

for (const source of sources.resolvers) {
    const raw = fs.readFileSync(path.join(sourceDirectory, source.sourceFile));
    const blob = crypto.createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
    assert.equal(blob, source.blobSha, `Unexpected upstream content: ${source.sourceFile}`);
    const js = stripTypeScriptTypes(raw.toString('utf8'), { mode: 'strip' })
        .replace(/^export\s+/gm, '');
    const output = `'use strict';\n\n// ioBroker.admin ${source.version}; MIT license, see LICENSE.\n` +
        `// Original source: ${source.url}\n` +
        '// Generated with build.cjs: only TypeScript types and ES module exports are removed.\n\n' +
        js + '\nmodule.exports = {\n    replaceLink,\n    applyReverseProxyToLink,\n' +
        '    detectRemoteAccess: typeof detectRemoteAccess === "function" ? detectRemoteAccess : null,\n' +
        '    applyRemoteAccessToLink: typeof applyRemoteAccessToLink === "function" ? applyRemoteAccessToLink : null,\n' +
        '};\n';
    fs.writeFileSync(path.join(__dirname, source.fixture), output);
    source.sourceSha256 = crypto.createHash('sha256').update(raw).digest('hex');
    source.fixtureSha256 = crypto.createHash('sha256').update(output).digest('hex');
}
sources.generatedWith = `Node.js ${process.version}, node:module.stripTypeScriptTypes, mode strip`;
fs.writeFileSync(path.join(__dirname, 'sources.json'), `${JSON.stringify(sources, null, 2)}\n`);
