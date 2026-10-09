/* 質問の英語版。questions.js と同じ並び（基本 20 問は添字、好みの要素 30 問は key で引く）。
   画面には番号と軸の札を別に出すので、「質問1」や「[R]」は書かない */
export const CORE_EN = [
  // 1. World (R vs F)
  { q: 'How much “escape from reality” do you want from anime?', a: 'Raw human drama and realism that feel like an extension of real life', b: 'A completely different world: magic, another world, sci-fi, where you can forget reality' },
  { q: 'Who is easiest to relate to as a protagonist?', a: 'A student or office worker with worries that connect to my own', b: 'A special person with unusual powers or a harsh destiny' },
  { q: 'What gets you excited about backgrounds and art?', a: 'Real streets and carefully drawn everyday life', b: 'A grand dungeon in another world or a cyberpunk future city' },
  // 2. Aftertaste (D vs H)
  { q: 'Which kind of plot gives you the biggest rush?', a: 'Unfair despair, betrayal, and a dark, gut-punch story', b: 'A comeback from adversity, catharsis, and a happy ending' },
  { q: 'What feeling do you want to carry after finishing?', a: 'A heavy “…wow” of shock and despair', b: 'A positive “that was fun!” and the energy to do your best tomorrow' },
  { q: 'How do you feel about deaths and misfortune of characters?', a: 'The tension of main characters dropping out mercilessly is irresistible', b: 'I want everyone to be rewarded. Pointless deaths are painful to watch' },
  // 3. Structure (C vs S)
  { q: 'How do you want to use your brain while watching?', a: 'Constantly theorizing: “is that line foreshadowing?”', b: 'Not thinking too hard, enjoying the momentum, animation and tempo' },
  { q: 'How well do you handle a slow build-up in the story?', a: 'I am fine with a few episodes of build-up if there is a big payoff later', b: 'If an episode or two does not grab me, I drop it' },
  { q: 'What do you want from an ending?', a: 'An ambiguous ending open to interpretation, with room for deep theories', b: 'Everything is resolved neatly and I walk away satisfied' },
  // 4. Sub-taste (P vs A)
  { q: 'What matters most in fights and showdowns?', a: 'Deception, reading each other, and precise psychological or battle-of-wits fights', b: 'Overwhelming animation, physical destruction, and powerful action' },
  { q: 'What overall tone do you prefer?', a: 'Quiet, serious, adult drama that makes you read between the lines', b: 'High energy with clear emotions, entertainment first' },
  { q: 'What do you want from the script and dialogue?', a: 'Quotable lines that hit the heart, and meaningful, literary monologues', b: 'Special-move names you want to shout, and snappy banter' },
  // 5. Visual (V vs ST)
  { q: 'What is the biggest reason you fall for an anime?', a: 'Beautiful animation, lighting, camerawork: visuals and direction', b: 'Carefully planned structure and a script and story that are fun' },
  { q: 'How do you feel about opening and ending sequences?', a: 'If the visuals and music are sublime, I get hooked at once', b: 'The main story matters most; I skim the OP/ED' },
  { q: 'How particular are you about animation quality?', a: 'Smooth animation and beautiful backgrounds and colors matter most', b: 'Simpler animation does not bother me if the story is good' },
  // 6. Viewing style (M vs L)
  { q: 'How do you approach watching anime?', a: 'One episode at a time, savoring it, rewatching, watching explainers', b: 'Binge the good ones and enjoy them quickly' },
  { q: 'How is your concentration while watching?', a: 'I want to be 100% immersed: dark room, phone away', b: 'I often watch while working or eating' },
  { q: 'What do you do after finishing an anime?', a: 'Read through review sites and social media for explanations and theories', b: '“That was fun!” and I start looking for the next one right away' },
  // 7. Picture quality & era (not in the type code)
  { q: 'How do you feel about the picture quality and art style of older anime (before the 2000s)?', a: 'If the quality is rough or the art looks dated, I lose interest right away', b: 'If it is a classic, age does not matter. Older art has its charm' },
  { q: 'Which kind of recommendation makes you happier?', a: 'A recent, high-quality, current-feeling title', b: 'A classic that has been passed down, whatever the year' },
];

export const PREF_EN = {
  love: { q: 'How much romance do you want?', a: 'The more romance and rom-com elements, the better', b: 'Romance is not needed. I can focus on the story better without it' },
  gag: { q: 'How much humor?', a: 'The more gags and comedy that make me laugh out loud, the better', b: 'Gags can be light. I want to sink into the serious side' },
  ensemble: { q: 'How do you like the story told?', a: 'An ensemble drama with a crowd of characters tangled together', b: 'A story that follows one protagonist closely' },
  cry: { q: 'Do you want to cry at anime?', a: 'I want a work that makes me cry my eyes out', b: 'I am not so fond of shows that try to make me cry' },
  healing: { q: 'What about slice-of-life and healing anime?', a: 'I want to be healed by a relaxed daily life where no big incident happens', b: 'A story where nothing happens feels boring' },
  gore: { q: 'What about gore and cruel scenes?', a: 'Blood and cruelty are fine. They even add tension', b: 'I do not like blood or gore. I want to avoid it' },
  ecchi: { q: 'What about fan service?', a: 'I can enjoy it as part of a work’s flavor', b: 'Not for me. I avoid works I could not watch in public' },
  isekai: { q: 'What about isekai (reincarnation) stories?', a: 'I like them. Reincarnation, cheats, slow life: bring it on', b: 'Not really. I want to avoid isekai' },
  sports: { q: 'What about sports and club activity stories?', a: 'I like them. The heat of matches and team growth moves me', b: 'I do not watch sports anime much' },
  mecha: { q: 'What about robots and mecha?', a: 'I get hyped when robots and mecha appear', b: 'Not much interest in mecha' },
  music: { q: 'What about music and idol stories?', a: 'I like works where songs and performance, like bands and idols, are the main thing', b: 'I am not very interested in music anime' },
  moe: { q: 'What art style do you prefer?', a: 'I like the so-called moe style centered on cute girls', b: 'The moe style is a bit hard for me' },
  cg: { q: 'What about anime made in 3DCG?', a: '3DCG anime is totally fine', b: 'I prefer hand-drawn 2D. 3DCG is not for me' },
  kids: { q: 'What about works for kids and families?', a: 'If it is good, I want to watch it even if it is for kids', b: 'I prefer works made for adults' },
  long: { q: 'What about length?', a: 'I want to sink into a long series of more than 100 episodes', b: 'I prefer one or two cours (12 to 24 episodes) that wrap up' },
  movie: { q: 'What about anime movies?', a: 'Recommend a movie too, one that wraps up in about two hours', b: 'I want to watch TV series slowly' },
  short: { q: 'What about short anime of about five minutes per episode?', a: 'They fit spare moments, so I am glad to have them', b: 'Short anime feel unsatisfying' },
  popular: { q: 'Which kind of recommendation would you prefer?', a: 'Surefire classics and hits everyone is watching', b: 'Lesser-known hidden gems I can dig up myself' },
  school: { q: 'What about school stories (high school, clubs, school life)?', a: 'I like the classroom and club vibe, and the youthful atmosphere moves me', b: 'I rarely watch them. It does not have to be set in a school' },
  fantasy: { q: 'What about sword-and-magic fantasy worlds?', a: 'Classic fantasy with dragons and demon lords excites me', b: 'I prefer grounded settings over magic and dragons' },
  scifi: { q: 'What about sci-fi like space, AI and the near future?', a: 'I like stories of the near future with spaceships and AI', b: 'Sci-fi gadgets do not appeal to me much' },
  historical: { q: 'What about history and period dramas?', a: 'I like stories set in past eras like the Sengoku or the end of the Edo period', b: 'Period dramas do not appeal to me much' },
  modern: { q: 'What about stories set in present-day Japan?', a: 'I like relatable stories set in Japan today', b: 'It does not have to be modern Japan. I like the extraordinary more' },
  horror: { q: 'What about horror and the supernatural?', a: 'I like the spine-tingling fear of curses and the uncanny', b: 'I am not good with scary stories. I want to avoid them' },
  mystery: { q: 'What about mysteries and suspense?', a: 'I get hooked on cases with puzzles and cat-and-mouse', b: 'I prefer stories I can simply enjoy over puzzles' },
  adventure: { q: 'What about adventure and journey stories?', a: 'Tales of traveling unfamiliar lands excite me', b: 'I prefer stories that dwell on one place over journeys' },
  hotblood: { q: 'What about hot-blooded, exhilarating plots?', a: 'I like hot, exhilarating plots that make you shout “Yeah!”', b: 'I prefer a calmer tone to hot-bloodedness' },
  family: { q: 'What about family stories?', a: 'Stories about bonds between parents and children or siblings move me', b: 'I am not very interested in family stories' },
  work: { q: 'What about workplace stories (jobs and companies)?', a: 'I like watching working people’s real struggles', b: 'I want extraordinary things to happen more than work stories' },
  mature: { q: 'What about a mature, serious atmosphere?', a: 'I like a refined, adult, serious mood taken slowly', b: 'A lighter, easygoing tone is easier to watch' },
};
