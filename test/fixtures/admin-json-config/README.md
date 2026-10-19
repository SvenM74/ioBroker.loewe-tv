# Admin form contract fixture

`contract.cjs` contains selected methods and small callback bodies from the
official MIT-licensed [ioBroker/json-config 8.1.1 source](https://github.com/ioBroker/json-config/tree/fd30206954a5c29c6093340b02aaae0993bbf11c).
Admin 7.7.28 declares `@iobroker/json-config: ^8.1.1` in its
[package manifest](https://github.com/ioBroker/ioBroker.admin/blob/2c53eab88ab8dc5d1bef6104aeffd8748c3181bc/src-admin/package.json).

The fixture makes the EPG configuration tests execute upstream expression,
template, validation, dependency, table, and `sendTo.useNative` logic. It does not
replace this logic with a permissive local interpretation of the JSON schema.
It has no network or React dependency, and does not require TypeScript support
from the Node.js version running the tests. The upstream copyright and full MIT
permission notice are retained in [LICENSE](LICENSE).

## Provenance

All paths below are relative to the pinned upstream commit
`fd30206954a5c29c6093340b02aaae0993bbf11c`.

| Source path | Git blob SHA | Extracted logic |
| --- | --- | --- |
| `src/JsonConfigComponent/ConfigGeneric.tsx` | `d2130908809eedca99aba48dc53154475ec9c36b` | `onUpdate`, `getValue`, `setValue`, `getText`, `onChangeAsync`, `onChange`, `execute`, `executeCustom`, `calculate`, `escapeString`, `getPattern`, and the pre-layout portion of `render` |
| `src/JsonConfigComponent/ConfigSendto.tsx` | `9af31e6e2d534ce783d9544a228830889cbffd01` | `componentDidMount`, `_onClick` |
| `src/JsonConfigComponent/ConfigAutocompleteSendTo.tsx` | `247640ecae3f87a0bd9819083bbdba1d54679c10` | `askInstance`, `getContext`, `renderItem` before Material UI rendering, and the Autocomplete JSX `onInputChange`/`onChange` callbacks |
| `src/JsonConfigComponent/ConfigTable.tsx` | `50c4bc7a77204ce8b929e5f458ee36da53f03aef` | `componentDidMount`, `itemTable`'s `onChange` callback body, `onChangeWrapper` |
| `src/JsonConfigComponent/index.tsx` | `d059ad151d7a5606f38df2b1fe7e6cd5851dc44e` | `onError`, `flatten`, `buildDependencies` |
| `src/JsonConfig.tsx` | `6bcffb84aa2ed34c50115e05bac4e21b9124995e` | `findAttr`, `onSave`'s loop copying native and transient form fields |

## Deliberate fixture boundaries

TypeScript annotations were removed once with Node's `stripTypeScriptTypes`;
trailing whitespace was removed. The stored fixture is ordinary JavaScript.
The selected method bodies retain upstream behavior, including the 300 ms table
debounce, the lack of a hidden/alive guard in `sendTo`'s automatic mount action,
and the order of native-value updates and dependency evaluation.

Tests inject timers, translation, window, socket, and React state callbacks.
The base `ConfigGeneric.componentDidMount` is empty: application subscriptions
and mounting defaults are not exercised. The hidden-spacer JSX branch throws
if selected; this configuration never uses `hideOnlyControl`. The rest of
`ConfigGeneric.render` stops after the real `renderItem` call. Autocomplete
returns its calculated item/options instead of rendering Material UI. When its
options branch applies, the returned object also exposes the original JSX
`onInputChange` and `onChange` callbacks. These callbacks were checked against
the same pinned upstream blob on 2026-10-19; only JSX attribute syntax and the
TypeScript cast around `e.target` were removed. Their unchecked read of
`e.target.value` is intentionally preserved. An event target without that
property produces `undefined`, which the real table/RPC flow can serialize as
an absent XMLTV field. The regression exercises this path through backend
normalization, repair, saving, and reopening. It does not identify which browser
event occurred on a user's installation or emulate all Material UI event order.
The empty-options TextField JSX callback remains outside this fixture. The table
cell callback and native-copy loop have named wrappers to expose their original
bodies without JSX or saving a real ioBroker object. No adapter, TV, HTTP source,
or user's native configuration is contacted by these tests.

These are contract and form-flow tests, not a complete browser rendering test.
The draft guard compares root form data. Admin buffers table edits locally for
300 ms, so an answer arriving inside that interval can briefly replace the
local table view before the buffered edit is sent to the form. The pending
callback preserves a single buffered edit, which has a regression test. An
additional edit made against the replaced local row before that callback runs
can still discard another field from the first edit. The generic schema has no
documented hook to flush this buffer or block table cells while `sendTo` runs.
Resolving that interval completely requires a change in Admin's table behavior
or a separately implemented editor with immediate draft updates. The fixture
does not claim to remove this upstream limitation.

Current json-config 10.1.3 was also reviewed at commit
`6e910b3c71a3f884014992f92151a1ae223ef4c7`; its newer asynchronous evaluator is
not substituted for the pinned Admin 7 fixture. Changes in future Admin
versions require a fresh compatibility review.
