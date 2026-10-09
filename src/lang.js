/* 表示の言語。ページの <html lang> で決める（/en/ のページは lang="en"）。
   node から読むとき（検査）は document が無いので、日本語になる */
export const LANG = (typeof document !== 'undefined' && /^en/i.test(document.documentElement.lang || '')) ? 'en' : 'ja';
export const EN = LANG === 'en';
