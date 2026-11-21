(function (root) {
  const calendar = {
    categories: ['General','Inicio','Fin','Momento nutria','Momento Revil','Cambio de dificultad','Mob nuevo','Dungeon','Día chill'],
    visible(entry, now = Date.now()) {
      return typeof entry === 'string' || (entry.release === 'scheduled' ? Date.parse(entry.publishAt) <= now : entry.published === true);
    },
    publicChanges(changes, now = Date.now()) {
      return Object.fromEntries(Object.entries(changes).map(([date, entries]) => [date,entries.filter(entry => calendar.visible(entry,now))]).filter(([,entries])=>entries.length));
    },
    days(year, month) {
      const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
      return [...Array(offset).fill(null), ...Array.from({length: new Date(Date.UTC(year, month, 0)).getUTCDate()}, (_, i) => i + 1)];
    },
    validate(changes = {}) {
      if (!changes || Array.isArray(changes) || typeof changes !== 'object' || Object.keys(changes).length > 366) throw new Error('Revisa las fechas del calendario.');
      const result = {};
      for (const [date, entries] of Object.entries(changes)) {
        if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !Array.isArray(entries) || entries.length > 30) throw new Error('Revisa las fechas y los textos de los cambios.');
        result[date] = entries.map(entry => {
          if (typeof entry === 'string') { if (!entry.trim() || entry.length > 1500) throw new Error('Texto de cambio inválido.'); return entry.trim(); }
          if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(entry.id) || !calendar.categories.includes(entry.category) || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 100 || typeof entry.text !== 'string' || entry.text.length > 3000 || !['manual','scheduled'].includes(entry.release) || typeof entry.published !== 'boolean') throw new Error('Revisa los datos del cambio.');
          if (entry.release === 'scheduled' && (typeof entry.publishAt !== 'string' || !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(entry.publishAt) || !Number.isFinite(Date.parse(entry.publishAt)) || new Date(entry.publishAt).toISOString().replace('.000Z','Z') !== entry.publishAt.replace('.000Z','Z'))) throw new Error('Indica fecha y hora de publicación.');
          return {id:entry.id,category:entry.category,title:entry.title.trim(),text:entry.text.trim(),release:entry.release,published:entry.published,publishAt:entry.release === 'scheduled' ? new Date(entry.publishAt).toISOString() : null};
        });
      }
      return result;
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = calendar;
  else root.fonyxCalendar = calendar;
})(globalThis);
