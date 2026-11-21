const {test} = require('node:test');
const assert = require('node:assert/strict');
const calendar = require('../src/calendar');
const core = require('../src/core');
test('diciembre 2026 empieza en martes y tiene 31 días; años bisiestos', () => {
  assert.deepEqual(calendar.days(2026,12), [null, ...Array.from({length:31}, (_,i) => i+1)]);
  assert.equal(calendar.days(2028,2).filter(Boolean).length,29);
});
test('publicaciones antiguas compatibles y cambios validados sin perder fechas', () => {
  assert.deepEqual(calendar.validate(),{});
  const changes = {'2026-12-01':[' Nuevo mob '], '2026-12-31':['Fin de mes']};
  assert.deepEqual(core.validateContent({...require('../launcher-content.json'),changes}).changes, {'2026-12-01':['Nuevo mob'],'2026-12-31':['Fin de mes']});
  for (const bad of [null,[],{'2026-02-30':['a']},{'2026-13-01':['a']},{'2026-12-01':['']},{'2026-12-01':'a'},{'2026-12-01':[1]}]) assert.throws(() => calendar.validate(bad));
});
