'use strict';

const { resolveMappings, normalizeName, safeIconUrl } = require('./epg-mapping');

const EPGSHARE_DE_URL = 'https://epgshare01.online/epgshare01/epg_ripper_DE1.xml.gz';

// This provider publishes these national schedules under fixed IDs without a
// quality suffix. Each accepted TV spelling is explicit: the general mapper
// must still distinguish HD, UHD, regions, time shifts and unrelated sources.
const EPGSHARE_DE_CHANNELS = Object.freeze([
    { id: 'Das.Erste.de', names: ['Das Erste', 'ARD'], tvNames: ['Das Erste', 'Das Erste HD', 'ARD', 'ARD HD'] },
    { id: 'ZDF.de', names: ['ZDF'], tvNames: ['ZDF', 'ZDF HD'] },
    { id: 'ARTE.de', names: ['ARTE'], tvNames: ['ARTE', 'ARTE HD'] },
    { id: '3sat.de', names: ['3sat'], tvNames: ['3sat', '3sat HD'] },
    { id: 'KIKA.de', names: ['KiKA'], tvNames: ['KiKA', 'KiKA HD'] },
    { id: 'PHOENIX.de', names: ['PHOENIX'], tvNames: ['PHOENIX', 'PHOENIX HD'] },
    { id: 'ONE.de', names: ['ONE'], tvNames: ['ONE', 'ONE HD'] },
    { id: 'tagesschau24.de', names: ['tagesschau24'], tvNames: ['tagesschau24', 'tagesschau24 HD'] },
    { id: 'ZDFinfo.de', names: ['ZDFinfo'], tvNames: ['ZDFinfo', 'ZDFinfo HD'] },
    { id: 'ZDFneo.de', names: ['ZDFneo'], tvNames: ['ZDFneo', 'ZDFneo HD'] },
    { id: 'RTL.de', names: ['RTL'], tvNames: ['RTL', 'RTL HD'] },
    { id: 'RTLZWEI.de', names: ['RTLZWEI'], tvNames: ['RTLZWEI', 'RTLZWEI HD'] },
    { id: 'VOX.de', names: ['VOX'], tvNames: ['VOX', 'VOX HD'] },
    { id: 'SAT.1.de', names: ['SAT.1'], tvNames: ['SAT.1', 'SAT.1 HD'] },
    { id: 'ProSieben.de', names: ['ProSieben'], tvNames: ['ProSieben', 'ProSieben HD'] },
    { id: 'kabel.eins.de', names: ['kabel eins'], tvNames: ['kabel eins', 'kabel eins HD'] },
    { id: 'DMAX.de', names: ['DMAX'], tvNames: ['DMAX', 'DMAX HD'] },
    { id: 'NITRO.de', names: ['NITRO'], tvNames: ['NITRO', 'NITRO HD'] },
    { id: 'ntv.de', names: ['ntv'], tvNames: ['ntv', 'ntv HD'] },
    { id: 'sixx.de', names: ['sixx'], tvNames: ['sixx', 'sixx HD'] },
    { id: 'TLC.de', names: ['TLC'], tvNames: ['TLC', 'TLC HD'] },
    { id: 'WELT.de', names: ['WELT'], tvNames: ['WELT', 'WELT HD'] },
    { id: 'SUPER.RTL.de', names: ['SUPER RTL'], tvNames: ['SUPER RTL', 'SUPER RTL HD'] },
].map(channel => Object.freeze({ ...channel, names: Object.freeze(channel.names), tvNames: Object.freeze(channel.tvNames) })));

const nationalNames = new Map(EPGSHARE_DE_CHANNELS.flatMap(channel =>
    channel.tvNames.map(name => [normalizeName(name), channel])));

/** Add narrowly defined provider matches only after normal validation and
 * resolution. Overrides, exact matches and ambiguous choices remain intact.
 * The original configured URL selects the profile, never a redirect target.
 */
function resolveSourceMappings(services, channels, manual = {}, url) {
    const rows = resolveMappings(services, channels, manual);
    if (url !== EPGSHARE_DE_URL) return rows;
    const catalogue = new Map(channels.map(channel => [channel.id, channel]));
    return rows.map((row, index) => {
        if (row.status !== 'unmatched') return row;
        // An alias must not turn a regional or otherwise distinct TV service
        // into a national service merely because the broadcaster is shared.
        const profile = nationalNames.get(normalizeName(services[index].name));
        const channel = profile && catalogue.get(profile.id);
        if (!channel || !profile.names.some(name => normalizeName(name) === normalizeName(channel.names[0]))) return row;
        const iconUrl = safeIconUrl(channel.iconUrl);
        const candidate = { id: channel.id, names: [...new Set(channel.names.map(name => name.trim()).filter(Boolean))],
            ...(iconUrl ? { iconUrl } : {}), reason: 'provider' };
        return { ...row, xmltvId: channel.id, status: 'automatic', candidates: [candidate], ...(iconUrl ? { iconUrl } : {}) };
    });
}

module.exports = { EPGSHARE_DE_URL, EPGSHARE_DE_CHANNELS, resolveSourceMappings };
