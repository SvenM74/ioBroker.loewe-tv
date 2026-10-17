'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    LoeweClient, parseResponse, parseChannelLists, parseChannelPage, selectChannelList,
} = require('../lib/loewe-client');

// Independent synthetic fixtures use the XML shape in Loewe Remote API 1.0.47,
// sections 9.7.1 and 9.7.2, pp. 33-35. They are not captured TV responses.
// https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf
const LISTS_XML = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><m:GetListOfChannelListsResponse xmlns:m="urn:loewe.de:RemoteTV:Tablet">
    <m:fcid></m:fcid><m:ClientId>fixture</m:ClientId>
    <m:ResultItemChannelLists sequenceNumber="7" totalResults="3" returnedResults="3" startIndex="0">
      <m:ResultItemChannelList><m:View>avlist-inputs</m:View><m:Name>AV</m:Name><m:TotalResults>4</m:TotalResults><m:Hash>1</m:Hash></m:ResultItemChannelList>
      <m:ResultItemChannelList><m:View>favlist-personal</m:View><m:Name>Favoriten</m:Name><m:TotalResults>2</m:TotalResults><m:Hash>2</m:Hash></m:ResultItemChannelList>
      <m:ResultItemChannelList><m:View>fastscan-satellite</m:View><m:Name>Satellit &amp; Radio</m:Name><m:TotalResults>237</m:TotalResults><m:Hash>003</m:Hash></m:ResultItemChannelList>
    </m:ResultItemChannelLists><m:Result>OK</m:Result>
  </m:GetListOfChannelListsResponse></soap:Body>
</soap:Envelope>`;

const CHANNELS_XML = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body><r:GetChannelListResponse xmlns:r="urn:loewe.de:RemoteTV:Tablet">
    <r:ChannelListView>fastscan-satellite</r:ChannelListView>
    <r:ChannelListName>Satellit &amp; Radio</r:ChannelListName>
    <r:AncestorUuid>fixture-list</r:AncestorUuid><r:ItemClass>undefined</r:ItemClass>
    <r:ResultItemFragment sequenceNumber="8" totalResults="237" returnedResults="2" startIndex="100" hash="0009">
      <r:ResultItemReference mediaItemUuid="chl0:001" itemClass="video" shortInfo="Test &amp; HD" locator="channel://101:fixture-tv:fixture-list" caption="00101" thumbnailUrl="" streamingUrl="" attributes="76" originalStreamingUrl=""/>
      <r:ResultItemReference mediaItemUuid="chl0:002" itemClass="audio" shortInfo="Test-Radio" locator="channel://102:fixture-radio:fixture-list" caption="102" attributes="8"/>
    </r:ResultItemFragment>
  </r:GetChannelListResponse></s:Body>
</s:Envelope>`;

function response(action, contents) {
    return parseResponse('<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/"><Body>'
        + `<${action}Response xmlns="urn:loewe.de:RemoteTV:Tablet">${contents}</${action}Response>`
        + '</Body></Envelope>');
}

test('list discovery reads actual SL2xx+ views and never chooses AV as the TV list', () => {
    const page = parseChannelLists(parseResponse(LISTS_XML));
    assert.equal(page.result, 'OK');
    assert.equal(page.totalResults, 3);
    assert.equal(page.returnedResults, 3);
    assert.equal(page.startIndex, 0);
    assert.equal(page.nextStart, null);
    assert.deepEqual(page.lists[2], {
        view: 'fastscan-satellite', name: 'Satellit & Radio', totalResults: 237, hash: '003',
    });
    assert.equal(selectChannelList(page.lists).view, 'fastscan-satellite');
    assert.equal(selectChannelList([page.lists[0]]), null);
    assert.equal(selectChannelList([]), null);
});

test('discovery handles single list elements and chooses a populated favourite over an empty network list', () => {
    const single = parseChannelLists(response('GetListOfChannelLists',
        '<ResultItemChannelLists totalResults="2" returnedResults="1" startIndex="1">'
        + '<ResultItemChannelList><View>favlist-one</View><Name>Eigene Liste</Name><TotalResults>12</TotalResults></ResultItemChannelList>'
        + '</ResultItemChannelLists><Result>OK</Result>'));
    assert.equal(single.lists.length, 1);
    assert.equal(single.nextStart, null);
    assert.equal(selectChannelList([{ view: 'fastscan-empty', totalResults: 0 }, ...single.lists]).view, 'favlist-one');
    assert.equal(selectChannelList([{ view: 'default', totalResults: 2 }]).view, 'default',
        'A default view is accepted when the TV actually reports it.');
});

test('list SYNC and NONE status is kept without inventing a default list or retrying', () => {
    for (const result of ['SYNC', 'NONE']) {
        const page = parseChannelLists(response('GetListOfChannelLists', `<Result>${result}</Result>`));
        assert.equal(page.result, result);
        assert.deepEqual(page.lists, []);
        assert.equal(page.nextStart, null);
    }
    const synchronizing = parseChannelLists(response('GetListOfChannelLists',
        '<ResultItemChannelLists totalResults="3" returnedResults="0" startIndex="0"/><Result>SYNC</Result>'));
    assert.equal(synchronizing.result, 'SYNC');
    assert.deepEqual(synchronizing.lists, []);
    assert.throws(() => parseChannelLists(response('GetListOfChannelLists', '<Result>ERROR</Result>')),
        { code: 'INVALID_RESPONSE', action: 'GetListOfChannelLists' });
    assert.throws(() => parseChannelLists(response('GetListOfChannelLists', '<Result>OK</Result>')),
        { code: 'INVALID_RESPONSE' });
});

test('channel attributes are normalized without deriving locator or channel number from the UUID', () => {
    const page = parseChannelPage(parseResponse(CHANNELS_XML));
    assert.equal(page.view, 'fastscan-satellite');
    assert.equal(page.name, 'Satellit & Radio');
    assert.equal(page.totalResults, 237);
    assert.equal(page.returnedResults, 2);
    assert.equal(page.startIndex, 100);
    assert.equal(page.nextStart, 102, 'Advance by actual returned items, not requested count.');
    assert.equal(page.hash, '0009');
    assert.equal(page.items[0].name, 'Test & HD');
    assert.equal(page.items[0].caption, '00101', 'Preserve the TV caption as text.');
    assert.equal(page.items[0].locator, 'channel://101:fixture-tv:fixture-list');
    assert.equal(page.items[1].itemClass, 'audio');
});

test('older reference-only pages retain their UUID and leave unavailable metadata empty', () => {
    const page = parseChannelPage(response('GetChannelList',
        '<ChannelListView>favlist0</ChannelListView><ResultItemFragment totalResults="1" returnedResults="1" startIndex="0">'
        + '<ResultItemReference mediaItemUuid="chl0:legacy"/>'
        + '</ResultItemFragment>'));
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].mediaItemUuid, 'chl0:legacy');
    assert.equal(page.items[0].name, '');
    assert.equal(page.items[0].locator, '');
    assert.equal(page.nextStart, null);
});

test('empty and unknown-length pages do not suggest an endless next-page loop', () => {
    const empty = parseChannelPage(response('GetChannelList',
        '<ChannelListView>empty-list</ChannelListView><ResultItemFragment totalResults="0" returnedResults="0" startIndex="0"/>'));
    assert.equal(empty.totalResults, 0);
    assert.deepEqual(empty.items, []);
    assert.equal(empty.nextStart, null);
    const unknown = parseChannelPage(response('GetChannelList',
        '<ResultItemFragment><ResultItemReference mediaItemUuid="legacy"/></ResultItemFragment>'));
    assert.equal(unknown.totalResults, null);
    assert.equal(unknown.startIndex, null);
    assert.equal(unknown.returnedResults, 1);
    assert.equal(unknown.nextStart, null);
});

test('wrong response shapes and incomplete pages fail clearly instead of appearing as empty channel lists', () => {
    const invalid = [
        '',
        '<ResultItemFragment returnedResults="2"><ResultItemReference mediaItemUuid="one"/></ResultItemFragment>',
        '<ResultItemFragment totalResults="10" returnedResults="0" startIndex="0"/>',
        '<ResultItemFragment totalResults="1" returnedResults="1" startIndex="1"><ResultItemReference mediaItemUuid="one"/></ResultItemFragment>',
        '<ResultItemFragment totalResults="9007199254740993"/>',
        '<ResultItemFragment><ResultItemReference locator="channel://not-a-uuid"/></ResultItemFragment>',
        '<ResultItemFragment/><ResultItemFragment/>',
    ];
    for (const contents of invalid) {
        assert.throws(() => parseChannelPage(response('GetChannelList', contents)),
            { code: 'INVALID_RESPONSE', action: 'GetChannelList' });
    }
    assert.throws(() => parseChannelPage(response('GetListOfChannelLists', '<Result>OK</Result>')),
        { code: 'INVALID_RESPONSE', action: 'GetChannelList' });
});

test('channel requests accept documented TV/radio filters, trim pasted views and keep each request bounded', async t => {
    const client = new LoeweClient({ host: 'tv.example' });
    t.after(() => client.close());
    const calls = [];
    client.request = async (action, parameters) => { calls.push({ action, parameters }); return {}; };
    await client.getChannels('  fastscan-a&b  ', 100, 25, '');
    assert.equal(calls.length, 1, 'A page fetch must not start list or metadata fan-out requests.');
    assert.equal(calls[0].action, 'GetChannelList');
    assert.match(calls[0].parameters, /<ChannelListView>fastscan-a&amp;b<\/ChannelListView>/);
    assert.match(calls[0].parameters, /<Range startIndex="100" maxItems="25"\/>/);
    assert.match(calls[0].parameters, /<MediaItemInformation>true<\/MediaItemInformation><MediaItemClass><\/MediaItemClass>/);
    await client.getChannels('fastscan-radio', 0, 10, 'audio');
    assert.match(calls[1].parameters, /<MediaItemClass>audio<\/MediaItemClass>/);
    await client.getChannels('fastscan-tv');
    assert.match(calls[2].parameters, /<MediaItemClass>video<\/MediaItemClass>/);
    await assert.rejects(client.getChannels('   '), { code: 'VALIDATION' });
    await assert.rejects(client.getChannels('fastscan-tv', 0, 10, 'guessed-mode'), { code: 'VALIDATION' });
    assert.equal(calls.length, 3);
});
