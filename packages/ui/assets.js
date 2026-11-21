// Source images are the desktop originals, shared with Metro and the desktop bundler.
export const art={
 'assets/fonyx-classic.png':require('../../apps/desktop/assets/fonyx-classic.png'),
 'assets/fonyx-symbol.png':require('../../apps/desktop/assets/fonyx-symbol.png'),
 'assets/fonyx-event.png':require('../../apps/desktop/assets/fonyx-event.png'),
 'assets/fonyx-jugosafio-animated.webp':require('../../apps/desktop/assets/fonyx-jugosafio-animated.webp'),
 'assets/fonyx-color.png':require('../../apps/desktop/assets/fonyx-color.png'),
 'assets/jugosafio.png':require('../../apps/desktop/assets/jugosafio.png'),
 'assets/experimento-bedrock.png':require('../../apps/desktop/assets/experimento-bedrock.png'),
 'assets/map.png':require('../../apps/desktop/assets/map.png'),
 'assets/notices.png':require('../../apps/desktop/assets/notices.png'),
 'assets/book.png':require('../../apps/desktop/assets/book.png'),
 'assets/revil.gif':require('../../apps/desktop/assets/revil.gif'),
};
export const icons={
 tiktok:require('./assets/tiktok.png'),calendar:require('./assets/calendar.png'),home:require('./assets/home.png'),
 mic:require('./assets/mic.png'),bell:require('./assets/bell.png'),book:require('./assets/book.png'),settings:require('./assets/settings.png'),
 arrow:require('./assets/arrow.png'),play:require('./assets/play.png'),discord:require('./assets/discord.png'),shield:require('./assets/shield.png'),
 lock:require('./assets/lock.png'),close:require('./assets/close.png'),refresh:require('./assets/refresh.png'),signal:require('./assets/signal.png'),
};
export const backdrop=require('./assets/backdrop.png'),titlebar=require('./assets/titlebar.png');
export function imageSource(value){const source=art[value]||(/^(https:|data:image\/png;)/.test(value||'')?{uri:value}:art['assets/fonyx-symbol.png']);return typeof source==='string'?{uri:source}:source;}
export function rasterSource(value){return typeof value==='string'?{uri:value}:value;}
