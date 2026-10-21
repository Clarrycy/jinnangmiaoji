'use strict';
// Exercise the source's window/focus policy. These doubles cannot validate the
// Windows shell's actual Alt+Tab list; that remains native runtime acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/core/main-app.ts'), 'utf8');
const tree = ts.createSourceFile('main-app.ts', source, ts.ScriptTarget.Latest, true);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
const names = ['registerTaskWindow', 'focusContents', 'restoreWindowFocus'];
const js = ts.transpileModule(names.map(name => functions.get(name)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const context = vm.createContext({ process: { platform: 'win32' }, log() {} });
vm.runInContext(js, context);
const calls = [];
function contents(name) {
  return { destroyed: false, focused: false, isDestroyed() { return this.destroyed; },
    isFocused() { return this.focused; }, focus() { calls.push(name); } };
}
function record(id) {
  return { closing: false, chromeKeys: false, cur: 1, curKind: 'game', chromeContents: contents(`chrome-${id}`),
    tabs: new Map([[1, { contents: contents(`game-${id}`) }]]),
    win: { id, visible: true, focused: false, destroyed: false,
      isDestroyed() { return this.destroyed; }, isVisible() { return this.visible; },
      isFocused() { return this.focused; }, isFocusable() { return true; },
      setParentWindow(value) { calls.push([id, 'owner', value]); },
      setSkipTaskbar(value) { calls.push([id, 'skipTaskbar', value]); } } };
}
const first = record(1), second = record(2);
context.registerTaskWindow(first); context.registerTaskWindow(second);
assert.deepEqual(calls.splice(0), [[1, 'owner', null], [1, 'skipTaskbar', false], [2, 'owner', null], [2, 'skipTaskbar', false]]);
second.win.focused = true;
context.restoreWindowFocus(first); context.restoreWindowFocus(second);
assert.deepEqual(calls.splice(0), ['game-2'], 'a background window cannot take focus from the selected window');
second.tabs.get(1).webSheet = { view: { webContents: contents('login-2') } };
context.restoreWindowFocus(second);
second.chromeKeys = true; context.restoreWindowFocus(second);
second.chromeKeys = false; second.curKind = 'settings'; context.restoreWindowFocus(second);
assert.deepEqual(calls.splice(0), ['login-2', 'chrome-2', 'chrome-2'], 'returning to a window respects login pages, dialogs and internal tabs');
second.win.visible = false; context.restoreWindowFocus(second);
second.win.visible = true; second.closing = true; context.restoreWindowFocus(second); context.registerTaskWindow(second);
second.closing = false; second.win.destroyed = true; context.restoreWindowFocus(second); context.registerTaskWindow(second);
assert.deepEqual(calls, [], 'hidden, closing or destroyed windows must not receive focus');
context.process.platform = 'darwin'; context.registerTaskWindow(first);
assert.deepEqual(calls, [], 'Windows shell registration stays on Windows');
const activate = functions.get('activateTab');
assert(activate.includes('record.tabs.get(id) !== tab') && activate.includes('tab.owner !== record')
  && activate.includes("record.curKind !== 'game'"), 'late painting must reject a moved tab, reused ID or an internal page');
assert(functions.get('createWindow').includes("win.on('show', () => registerTaskWindow(record))"));
assert(functions.get('adoptTab').includes('registerTaskWindow(record)'));
assert(!source.includes('tab.contents.focus()') && !source.includes('record.chromeContents.focus()'), 'view focus passes through the foreground guard');
console.log('micro window focus policy tests passed (native Windows acceptance pending)');
