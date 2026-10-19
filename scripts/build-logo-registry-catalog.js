'use strict';

// Offline maintenance helper. Runtime code reads the committed JSON catalog and
// never imports this script or asks GitHub for a repository tree.
const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY = 'tv-logo/tv-logos';
const COUNTRIES = Object.freeze({
    germany: 'de',
    austria: 'at',
    switzerland: 'ch',
    international: 'int',
    'world-europe': 'eu',
});
const WORDS = Object.freeze({
    hd: 'HD', uhd: 'UHD', sd: 'SD', '4k': '4K', tv: 'TV',
    ard: 'ARD', zdf: 'ZDF', rtl: 'RTL', br: 'BR', mdr: 'MDR',
    ndr: 'NDR', rbb: 'rbb', swr: 'SWR', wdr: 'WDR', hr: 'hr',
    orf: 'ORF', orf1: 'ORF1', orf2: 'ORF2', orf3: 'ORF3', srf: 'SRF',
    atv: 'ATV', atv2: 'ATV2', rsi: 'RSI', rts: 'RTS', rtr: 'RTR',
    bbc: 'BBC', cnn: 'CNN', cna: 'CNA', cgtn: 'CGTN', cnbc: 'CNBC',
    dw: 'DW', nhk: 'NHK', kbs: 'KBS', ntd: 'NTD', ptv: 'PTV',
    mtv: 'MTV', viva: 'VIVA', dmax: 'DMAX', tlc: 'TLC', axn: 'AXN',
    vox: 'VOX', ntv: 'ntv', kika: 'KiKA', '3sat': '3sat',
    dazn: 'DAZN', dazn1: 'DAZN1', dazn2: 'DAZN2', espn: 'ESPN',
    f1: 'F1', nba: 'NBA', nfl: 'NFL', nhl: 'NHL', dfb: 'DFB',
    and: 'and', und: 'und', of: 'of', the: 'the',
});

function readableName(tokens) {
    return tokens.map(token => WORDS[token] || token.charAt(0).toUpperCase() + token.slice(1)).join(' ');
}

function buildCatalog(snapshot, revision = snapshot && snapshot.ref) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('The input must be a saved GitHub tree JSON object.');
    }
    if (snapshot.truncated === true) throw new Error('Refusing a truncated GitHub tree.');
    if (snapshot.repository && snapshot.repository !== REPOSITORY) {
        throw new Error(`Expected the ${REPOSITORY} repository.`);
    }
    if (!/^[a-f0-9]{40}$/u.test(revision || '')) {
        throw new Error('Supply the exact 40-character source commit SHA as the second argument.');
    }
    if (snapshot.ref && snapshot.ref !== revision) throw new Error('The source revision does not match the saved snapshot.');
    const sourceTree = typeof snapshot.tree === 'string' ? snapshot.tree : snapshot.sha;
    if (!/^[a-f0-9]{40}$/u.test(sourceTree || '')) throw new Error('The source tree SHA is missing or invalid.');
    // Support both the original recursive GitHub tree response and the compact
    // research snapshot containing the same path/blob/size metadata.
    const files = Array.isArray(snapshot.tree) ? snapshot.tree : snapshot.files;
    if (!Array.isArray(files)) throw new Error('The saved source tree does not contain a file list.');
    const entries = [];
    const seen = new Set();
    for (const file of files) {
        if (!file || typeof file.path !== 'string' || (file.type && file.type !== 'blob')) continue;
        const segments = file.path.split('/');
        if (segments[0] !== 'countries' || !Object.hasOwn(COUNTRIES, segments[1])) continue;
        if (segments.some(segment => segment === 'old' || segment === 'custom') || !file.path.endsWith('.png')) continue;
        if (!/^countries\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.png$/u.test(file.path)) {
            throw new Error(`Unexpected logo path: ${file.path}`);
        }
        const country = COUNTRIES[segments[1]];
        const suffix = `-${country}.png`;
        const filename = segments[segments.length - 1];
        if (!filename.endsWith(suffix)) throw new Error(`Unexpected country suffix: ${file.path}`);
        if (!/^[a-f0-9]{40}$/u.test(file.sha || '') || !Number.isSafeInteger(file.size) || file.size <= 0) {
            throw new Error(`Missing or invalid source blob metadata: ${file.path}`);
        }
        if (file.mode && file.mode !== '100644') throw new Error(`Unexpected file mode: ${file.path}`);
        if (seen.has(file.path)) throw new Error(`Duplicate logo path: ${file.path}`);
        seen.add(file.path);
        const tokens = filename.slice(0, -suffix.length).split('-');
        const variant = tokens.includes('hz') ? 'horizontal'
            : tokens.includes('icon') ? 'icon'
                : tokens.some(token => token === 'alt' || token === 'alt2') ? 'alternate' : 'standard';
        // These are observed design markers. Do not strip channel identities
        // such as Black/White (AXN), Plus, regions, HD/UHD or programme numbers.
        const name = readableName(tokens.filter(token => !['alt', 'alt2', 'hz', 'icon'].includes(token)));
        if (!name) throw new Error(`Missing logo name: ${file.path}`);
        entries.push({ id: file.path, name, country, variant, blob: file.sha, size: file.size });
    }
    entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (!entries.length) throw new Error('The source tree contains no supported logo entries.');
    return {
        schemaVersion: 1,
        repository: REPOSITORY,
        revision,
        sourceTree,
        sourceUrl: `https://github.com/${REPOSITORY}/tree/${revision}`,
        readmeUrl: `https://github.com/${REPOSITORY}/blob/${revision}/README.md`,
        scope: Object.values(COUNTRIES),
        entries,
    };
}

if (require.main === module) {
    try {
        const input = process.argv[2];
        const revision = process.argv[3];
        if (!input) throw new Error('Usage: node scripts/build-logo-registry-catalog.js <saved-tree.json> <commit-sha> [output.json]');
        const catalog = buildCatalog(JSON.parse(fs.readFileSync(input, 'utf8')), revision);
        const output = process.argv[4] || path.join(__dirname, '../lib/logo-registry-catalog.json');
        fs.writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
        const counts = {};
        for (const entry of catalog.entries) counts[entry.country] = (counts[entry.country] || 0) + 1;
        process.stdout.write(`${catalog.entries.length} catalog entries written to ${output}\n${JSON.stringify(counts)}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { buildCatalog };
