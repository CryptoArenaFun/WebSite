const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const initial = 'width=device-width, initial-scale=1, viewport-fit=cover';
function run(path, ua, search = '') {
  const html = fs.readFileSync(path, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let content = initial;
  const dataset = {};
  vm.runInNewContext(script, {
    navigator: {userAgent: ua}, location: {search}, URLSearchParams,
    document: {documentElement: {dataset}, querySelector: () => ({
      getAttribute: () => content, setAttribute: (_, value) => {content = value;}
    })}
  });
  return {content, firefox: dataset.ffAndroid};
}
const chrome = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const firefox = 'Mozilla/5.0 (Android 13; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0';
const resized = initial + ', interactive-widget=resizes-content';
for (const path of ['index.html','test5/index.html']) {
test(path + ': enables layout viewport resizing for supported Android Chrome only', () => {
  assert.equal(run(path,chrome).content,resized);
  assert.equal(run(path,chrome).firefox,undefined);
  assert.equal(run(path,chrome,'?keyboardresize=0').content,initial);
  assert.equal(run(path,chrome.replace('131.0','107.0')).content,initial);
  for (const suffix of [' EdgA/131.0',' OPR/86.0',' SamsungBrowser/25.0']) {
    assert.equal(run(path,chrome+suffix).content,initial);
  }
  assert.equal(run(path,chrome.replace('Pixel 7)','Pixel 7; wv)')).content,initial);
});
}
test('Firefox Android retains its existing behavior even with the trial disabled', () => {
  for (const path of ['index.html','test5/index.html']) {
    const result = run(path,firefox,'?keyboardresize=0');
    assert.equal(result.content,resized);
    assert.equal(result.firefox,'true');
  }
});
test('iOS Safari and desktop Chrome remain unchanged on both pages', () => {
 for (const path of ['index.html','test5/index.html']) {
  for (const ua of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
  ]) assert.equal(run(path,ua).content,initial);
 }
});
