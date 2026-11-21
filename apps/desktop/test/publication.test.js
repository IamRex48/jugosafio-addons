const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');
const calendar = require('../src/calendar');
const legacy = {...require('../launcher-content.json')};delete legacy.events;
test('migra publicaciones anteriores y conserva eventos editables independientes',()=>{
  const c=core.validateContent(legacy);
  assert.equal(c.events[0].id,'jugosafio');assert.equal(c.events[1].enabled,false);
  c.events.push({...structuredClone(c.events[1]),id:'personalizado',name:'Otro evento',enabled:true,server:'example.org',headline:'Texto propio',changes:{'2026-12-01':['Cambio propio']}});
  const result=core.validateContent(c);
  assert.equal(result.events[2].name,'Otro evento');assert.equal(result.events[2].changes['2026-12-01'][0],'Cambio propio');
  assert.throws(()=>core.validateContent({...c,events:[c.events[0],c.events[0]]}));
  assert.throws(()=>core.validateContent({...c,events:[{...c.events[0],logo:'assets/../../secret.png'}]}));
  assert.throws(()=>core.validateContent({...c,events:[{...c.events[0],logo:'https://user:pass@example.org/a.png'}]}));
  assert.throws(()=>core.validateContent({...c,events:[{...c.events[0],server:'bad&command=x'}]}));
});
test('programación exacta, borradores manuales y activación sin afectar otros días',()=>{
  const scheduled={id:'cambio-a',title:'Mob nuevo',text:'Texto',category:'Mob nuevo',release:'scheduled',publishAt:'2026-12-01T16:00:00Z',published:false};
  const manual={...scheduled,id:'cambio-b',release:'manual',publishAt:null};
  const changes=calendar.validate({'2026-12-01':[scheduled,manual,'Cambio anterior']});
  assert.equal(calendar.publicChanges(changes,Date.parse('2026-12-01T15:59:59Z'))['2026-12-01'].length,1);
  assert.equal(calendar.publicChanges(changes,Date.parse(scheduled.publishAt))['2026-12-01'].length,2);
  manual.published=true;
  assert.equal(calendar.visible(manual,0),true);
  assert.throws(()=>calendar.validate({'2026-12-01':[{...scheduled,publishAt:'2026-02-30T16:00:00Z'}]}));
  assert.throws(()=>calendar.validate({'2026-12-01':[{...scheduled,category:'Inventada'}]}));
  assert.throws(()=>calendar.validate({'2026-12-01':[{...scheduled,publishAt:'2026-12-01T16:00:00'}]}));
});
