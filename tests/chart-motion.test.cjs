const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('test2/chart-motion.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { viewport, frameBlend } = context.exports;

test('one-minute viewport advances each frame inside the same 100ms sample slot', () => {
  const a = viewport(900, 1020.01), b = viewport(900, 1020.026);
  assert.equal(a.tailSlot, b.tailSlot);
  assert.ok(b.to > a.to && b.from > a.from);
  assert.equal(a.end - a.begin, 60);
  assert.ok(Math.abs((b.to - a.to) - .16) < 1e-8);
});
test('startup and rollover remain inside the current round', () => {
  assert.equal(viewport(900, 920).begin, 900);
  assert.equal(viewport(900, 1801).end, 1800);
  assert.equal(viewport(1800, 1800).begin, 1800);
});
test('guard point covers the right edge by no more than one display sample', () => {
  for (let i = 1; i < 600; i++) {
    const v = viewport(900, 960 + i / 60);
    const logicalEnd = v.to + .5;
    assert.ok(v.tailSlot >= logicalEnd && v.tailSlot - logicalEnd < 1.000001);
  }
});
test('vertical response is frame-rate independent and does not overshoot', () => {
  const at60 = (1 - frameBlend(1000/60)) ** 6;
  const at120 = (1 - frameBlend(1000/120)) ** 12;
  assert.ok(Math.abs(at60 - at120) < 1e-12);
  assert.ok(frameBlend(1000) > 0 && frameBlend(1000) < 1);
});
