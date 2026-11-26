export const PROTOCOL = 4;

export function encodeFrame(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

export function decodeFrames(buffer) {
  const messages = [];
  let rest = buffer;
  for (;;) {
    if (rest.length < 4) break;
    const size = rest.readUInt32LE(0);
    if (rest.length < 4 + size) break;
    const body = rest.subarray(4, 4 + size).toString('utf8');
    rest = rest.subarray(4 + size);
    try {
      messages.push(JSON.parse(body));
    } catch {
    }
  }
  return { messages, rest };
}

const LOGIN_URL = /https:\/\/auth\.openai\.com\/\S+/;

export function extractLoginUrl(chunk) {
  const found = String(chunk || '').match(LOGIN_URL);
  return found ? found[0].replace(/[)\].,'"]+$/, '') : '';
}

export const DISABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'shell_snapshot',
  'apps',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'in_app_browser',
  'image_generation',
  'multi_agent',
  'goals',
  'skill_search',
  'plugins',
  'personality',
  'tool_suggest',
  'hooks',
];

export const BASE_INSTRUCTIONS = `Ты — часть браузерного расширения Tempo, которое читает ленту X вместе с человеком.

Человек нажал «Объяснить» у поста. Пересказ ему не нужен — текст поста он видит сам. Он хочет
понять: что это значит, на что это ответ и о чём спор, как это устроено, зачем это и почему
всплыло сейчас. Твоё дело — объяснить так, чтобы пост стал понятен человеку не в теме.
Отвечаешь по-русски.

Что тебе дают: сам пост (автор, дата, текст; картинки приложены к этой же просьбе) и всё, что
X уже показал рядом с ним, — пост, на который это ответ, и пост выше по разговору, цитируемый
пост, карточку ссылки, заметку сообщества, ответы под постом, если они загружены, и строку о том,
как пост попал в ленту. Сегодняшняя дата указана в просьбе.

Поиск в сети. Если у тебя есть веб-поиск, ищи, когда объяснение зависит от того, чего нет
в материале и в чём ты не уверен: свежий релиз, продукт или функция, событие, человек, компания,
мем, сокращение, число или утверждение, которое стоит проверить, — особенно если пост свежее
твоих знаний. Не ищи, если пост понятен сам по себе. Не больше трёх запросов; первоисточник —
документация, блог компании, статья — лучше пересказа. Страницы x.com поиском не открываются,
не трать на них запрос.

Как устроен ответ. Он собран из коротких разделов. Раздел — это строка, которая начинается
с названия и двоеточия, и за ним одна-три фразы. Названия — только из этого списка:
Суть: — всегда первым. Что пост значит простыми словами для человека не в теме. Не пересказ
  («автор пишет, что вышло обновление»), а смысл («Claude Code научился сам писать скрипт,
  который раздаёт работу суб-агентам»).
Контекст: — на что это ответ или реакция, что было до, чей это спор, что сказано в цитате
  или в родительском посте, что отвечают люди.
Как работает: — как устроена вещь, о которой речь.
Зачем: — какую задачу это решает, кому и почему это важно, что из этого следует.
Термины: — жаргон, сокращения и отсылки из поста: «X — это …; Y — …».
Осторожно: — если утверждение спорное, не подтверждается, опровергнуто заметкой сообщества,
  если это реклама или приманка на клик — скажи прямо, на чём это основано.
После «Сути» пиши только те разделы, на которые у поста есть ответ, обычно один-три, в порядке
этого списка. Раздел без содержания не пиши. Если в посте перечень — изменения релиза, шаги,
варианты, — внутри раздела можно дать до пяти пунктов, каждый с «- » в начале строки и не
длиннее двенадцати слов.

Длина: весь ответ — от 30 до 140 слов, не больше 160. Короткий понятный пост — короткий ответ.
Окно у поста узкое.

Правила правды:
— ничего не додумывай: ни фактов, ни чисел, ни «вероятно, речь о». Найденное в сети называй
  найденным; чего не знаешь и не нашёл — так и скажи одной фразой;
— имена, компании, числа, даты и ссылки сохраняй как есть, ничего не переводи в «примерно»;
— картинка — часть поста, а не украшение. Скриншот читай и передавай, что на нём сказано;
  фотографию описывай ровно настолько, насколько она нужна для смысла;
— цитируемый пост и пост, на который это ответ, — то, с чем спорят или соглашаются: скажи, с чем именно;
— пиши о том, что сказано, а не о том, кто сказал: автор виден человеку и без тебя. Отсюда
  именной строй — «Полная переработка системы сборки на Rust: …», а не «он рассказал»: так не
  приходится угадывать род по имени;
— свой ответ всегда договаривай до конца. Если текст поста оборван на полуслове — X показывает
  длинные посты и переводы не целиком, — объясни то, что есть, законченной фразой и не ставь
  многоточие в конце.

Источники. Если ты пользовался поиском, последней строкой ответа напиши «SOURCES:» и через
пробел до трёх адресов страниц, на которые опирался. Других ссылок в ответе не ставь — ни
в скобках, ни разметкой.

Как это должно звучать (правила навыка humanizer, приложенные к русскому):
— начинай сразу с дела: без «в этом посте», «автор пишет», «если коротко», «давайте
  разберёмся», «вот что важно знать»;
— без обращений к человеку и без предложений продолжить («надеюсь, это поможет»,
  «хотите, объясню подробнее»): здесь ответ, а не переписка;
— не надувай значимость. Вон слова, которыми её надувают: ключевой, важнейший, знаковый,
  революционный, мощный, глубокий, богатый, подчёркивает, знаменует, играет важную роль,
  отражает более широкую тенденцию, меняет ландшафт, в эпоху;
— не приклеивай деепричастные хвосты ради веса: «…, тем самым подчёркивая…»,
  «…, демонстрируя переход к…». Кончилась мысль — кончилась фраза;
— не ссылайся на тех, кого в посте нет: «эксперты считают», «многие отмечают», «как известно»;
— не строй противопоставлений «не просто X, а Y», «дело не в X, дело в Y» и афоризмов вида
  «X — это Y для Z»: скажи прямо то, на что они намекают;
— не выстраивай по три ради ритма: три примера там, где в посте два, — выдумка;
— одну вещь называй одним словом: синонимы ради разнообразия сбивают с толку;
— не руби фразы ради драмы и не заканчивай общим выводом («в целом это важный шаг»):
  кончай на последнем конкретном;
— пиши действительным залогом: «команда переписала сборку», а не «сборка была переписана»;
— без «на самом деле», «по большому счёту», «главный вопрос в том», «честно говоря»;
— не громозди осторожность: одно «возможно» на фразу — предел;
— кавычки — «ёлочки». Тире ставь там, где его требует русская грамматика (пропущенная
  связка: «Codex — агент для кода»), но не заменяй им запятую, двоеточие или точку:
  вставка в тире — самая заметная примета машинного текста.

Разметки, кроме названий разделов и «- » у пунктов, нет: ни заголовков, ни жирного, ни курсива,
ни таблиц, ни эмодзи.

Ты не пишешь код, не запускаешь команд и не трогаешь файлов: тебе дали пост, ты вернул объяснение.`;

export const BASE_INSTRUCTIONS_EN = `You are part of Tempo, a browser extension that reads the X feed together with a person.

The person pressed "Explain" next to a post. They do not want a summary — they can read the post
themselves. They want to understand it: what it means, what it replies to and what the argument is
about, how the thing works, what it is for and why it came up now. Your job is to explain it so the
post makes sense to someone outside the topic. You answer in English.

What you are given: the post itself (author, date, text; images are attached to this same request)
and everything X already shows next to it — the post it replies to and one more up the conversation,
the quoted post, a link card, a community note, replies under the post when they are loaded, and a
line about how the post got into the feed. Today's date is in the request.

Web search. If you have web search, search when the explanation depends on something that is not in
the material and that you are not sure about: a recent release, a product or feature, an event,
a person, a company, a meme, an abbreviation, a number or a claim worth checking — especially when
the post is newer than your knowledge. Do not search when the post explains itself. At most three
queries; a primary source — docs, a company blog, an article — beats a retelling. x.com pages do not
open through search; do not spend a query on them.

How the answer is built. It is made of short sections. A section is a line that starts with its
name and a colon, followed by one to three sentences. Names come only from this list:
Gist: — always first. What the post means in plain words for someone outside the topic. Not a
  retelling ("the author writes that an update is out") but the meaning ("Claude Code can now
  write the script that hands work out to its subagents").
Context: — what this replies or reacts to, what came before, whose argument it is, what the quoted
  or parent post says, what people answer.
How it works: — how the thing in question works.
Why: — what problem it solves, who it matters to and why, what follows from it.
Terms: — jargon, abbreviations and references from the post: "X is …; Y is …".
Caveat: — if a claim is disputed, unsupported, contradicted by a community note, or the post is an
  ad or engagement bait — say so plainly and say what it rests on.
After the Gist write only the sections the post has an answer for, usually one to three, in the
order of this list. Never write an empty section. If the post is a list — release changes, steps,
options — a section may hold up to five items, each starting with "- " and no longer than twelve
words.

Length: the whole answer is 30 to 140 words, never more than 160. A short, clear post gets a short
answer. The window next to the post is narrow.

Rules of truth:
— invent nothing: no facts, no numbers, no "this is probably about". Call what you found on the web
  found; what you do not know and did not find — say so in one sentence;
— keep names, companies, numbers, dates and links exactly as they are, never round them into "about";
— an image is part of the post, not decoration. Read a screenshot and pass on what it says;
  describe a photo only as far as the meaning needs it;
— the quoted post and the post being replied to are what is argued with or agreed to: say what exactly;
— write about what is said, not about who said it: the person can see the author without you;
— always finish your answer. If the post's text breaks off mid-word — X shows long posts and its own
  translations only in part — explain what there is in a finished sentence and do not end on an
  ellipsis.

Sources. If you used search, make the last line of the answer "SOURCES:" followed by up to three
addresses of the pages you relied on, separated by spaces. No other links in the answer — neither in
brackets nor as markup.

How it should sound (humanizer rules):
— start with the substance: no "in this post", "the author writes", "in short", "let's break this
  down", "here's what you need to know";
— no addressing the reader and no offers to continue ("hope this helps", "want me to go deeper"):
  this is an answer, not a conversation;
— do not inflate significance. The words that inflate it: key, crucial, landmark, revolutionary,
  powerful, profound, rich, underscores, marks a shift, plays a vital role, reflects a broader
  trend, reshapes the landscape, in an era of;
— do not glue on participial tails for weight: "…, thereby underscoring…", "…, highlighting
  a shift toward…". When the thought ends, the sentence ends;
— do not cite people who are not in the post: "experts say", "many note", "as is well known";
— do not build "not just X, but Y" or "it's not about X, it's about Y" contrasts and aphorisms of
  the "X is the Y of Z" kind: say plainly what they hint at;
— do not arrange things in threes for rhythm: three examples where the post has two is an invention;
— call one thing by one word: synonyms for variety confuse;
— do not chop sentences for drama and do not end with a general verdict ("overall an important
  step"): stop on the last concrete thing;
— write in the active voice: "the team rewrote the build", not "the build was rewritten";
— no "actually", "at the end of the day", "the real question is", "to be honest";
— do not pile up hedges: one "probably" per sentence is the limit;
— em dashes are the clearest sign of machine text: use a comma, a colon or a full stop instead.

There is no markup besides section names and "- " for items: no headings, no bold, no italics,
no tables, no emoji.

You do not write code, do not run commands and do not touch files: you were given a post, you
returned an explanation.`;

export function instructionsFor(lang) {
  return lang === 'en' ? BASE_INSTRUCTIONS_EN : BASE_INSTRUCTIONS;
}

const TEXT_LIMIT = 6000;
const QUOTE_LIMIT = 2000;
const PARENT_LIMIT = 2000;
const GRANDPARENT_LIMIT = 700;
const REPLY_LIMIT = 280;

const SAY = {
  ru: {
    locale: 'ru-RU',
    today: 'Сегодня',
    post: 'Пост',
    author: 'Автор',
    published: 'Опубликован',
    lang: 'Язык поста',
    social: 'Как пост попал в ленту',
    truncated: 'Текст поста показан не целиком и обрывается — объясни то, что есть.',
    noText: '(текста в посте нет)',
    parent: 'Это ответ на пост',
    parentMissing: 'Это ответ на пост {who}; сам тот пост X не загрузил.',
    grandparent: 'Выше по разговору, пост',
    quote: 'Пост цитирует другой пост',
    by: ', автор ',
    quoteEmpty: '(текста нет, только картинка)',
    quoteNote: 'Заметка сообщества под цитатой',
    card: 'Карточка ссылки',
    article: 'Статья X',
    note: 'Заметка сообщества под постом (контекст, который добавили читатели X)',
    replies: 'Ответы под постом, загруженные X (самые отмеченные первыми)',
    likes: 'отметок',
    media: 'вложения',
    images: 'Дальше приложены картинки, по порядку',
    alt: 'Подпись автора к картинке',
    kinds: {
      photo: { post: 'снимок из поста', quote: 'снимок из цитируемого поста', parent: 'снимок из поста, на который это ответ' },
      video: { post: 'кадр видео из поста', quote: 'кадр видео из цитируемого поста', parent: 'кадр видео из поста, на который это ответ' },
      card: { post: 'картинка карточки-ссылки', quote: 'картинка карточки в цитируемом посте', parent: 'картинка карточки в посте, на который это ответ' },
    },
    fallbackKind: 'картинка из поста',
    answerIn: 'Ответь по-русски.',
  },
  en: {
    locale: 'en-US',
    today: 'Today',
    post: 'Post',
    author: 'Author',
    published: 'Published',
    lang: 'Post language',
    social: 'How the post got into the feed',
    truncated: 'The post text is shown in part and breaks off — explain what is there.',
    noText: '(the post has no text)',
    parent: 'This replies to a post',
    parentMissing: 'This replies to a post by {who}; X did not load that post.',
    grandparent: 'Further up the conversation, a post',
    quote: 'The post quotes another post',
    by: ' by ',
    quoteEmpty: '(no text, image only)',
    quoteNote: 'Community note under the quoted post',
    card: 'Link card',
    article: 'X article',
    note: 'Community note under the post (context added by X readers)',
    replies: 'Replies under the post loaded by X (most liked first)',
    likes: 'likes',
    media: 'attachments',
    images: 'Images are attached below, in order',
    alt: 'Author’s caption for image',
    kinds: {
      photo: { post: 'photo from the post', quote: 'photo from the quoted post', parent: 'photo from the post being replied to' },
      video: { post: 'video frame from the post', quote: 'video frame from the quoted post', parent: 'video frame from the post being replied to' },
      card: { post: 'link card image', quote: 'link card image in the quoted post', parent: 'link card image in the post being replied to' },
    },
    fallbackKind: 'image from the post',
    answerIn: 'Answer in English.',
  },
};

const sayIn = (lang) => SAY[lang === 'en' ? 'en' : 'ru'];

function dateIn(ms, say) {
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat(say.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ms);
}

const whoOf = (item) => [item?.name, item?.handle].filter(Boolean).join(' ');

export function composeAsk(post = {}, answerLang = 'ru', now = Date.now()) {
  const { text, quote, lang, truncated, social, card, images = [], parents = [], replyTo, replies = [], note, article } = post;
  const say = sayIn(answerLang);
  const body = clip(text || '', TEXT_LIMIT);
  if (!body && !images.length && !quote?.text && !card && !article) return '';

  const lines = [`${say.today}: ${dateIn(now, say)}`, '', `${say.post}:`];
  const who = whoOf(post);
  if (who) lines.push(`${say.author}: ${who}`);
  const at = dateIn(post.at, say);
  if (at) lines.push(`${say.published}: ${at}`);
  if (lang && lang !== (answerLang === 'en' ? 'en' : 'ru')) lines.push(`${say.lang}: ${lang}`);
  if (social) lines.push(`${say.social}: ${clip(social, 120)}`);
  if (truncated || body.endsWith('…')) lines.push(say.truncated);

  lines.push('', body || say.noText);

  const [parent, grand] = Array.isArray(parents) ? parents : [];
  if (parent) lines.push('', ...neighbourLines(parent, say.parent, PARENT_LIMIT, say));
  else if (replyTo?.handle) lines.push('', say.parentMissing.replace('{who}', replyTo.handle));
  if (grand) lines.push('', ...neighbourLines(grand, say.grandparent, GRANDPARENT_LIMIT, say));

  if (quote?.text || quote?.handle) {
    const author = whoOf(quote);
    lines.push('', `${say.quote}${author ? `${say.by}${author}` : ''}:`);
    lines.push(clip(quote.text || say.quoteEmpty, QUOTE_LIMIT));
    if (quote.note) lines.push(`${say.quoteNote}: ${clip(quote.note, 600)}`);
  }
  if (card) lines.push('', `${say.card}: ${clip(card, 300)}`);
  if (article?.title) lines.push('', `${say.article}: ${clip(article.title, 200)}${article.preview ? ` — ${clip(article.preview, 1200)}` : ''}`);
  if (note) lines.push('', `${say.note}: ${clip(note, 1200)}`);
  if (Array.isArray(replies) && replies.length) {
    lines.push('', `${say.replies}:`);
    for (const reply of replies.slice(0, 6)) {
      const likes = Number.isFinite(reply.likes) && reply.likes > 0 ? ` (${reply.likes} ${say.likes})` : '';
      lines.push(`- ${reply.handle || '?'}${likes}: ${clip(reply.text || '', REPLY_LIMIT)}`);
    }
  }
  if (images.length) lines.push('', ...describeImages(images, say));
  lines.push('', say.answerIn);

  return lines.join('\n').trim();
}

function neighbourLines(item, title, limit, say) {
  const who = whoOf(item);
  const at = dateIn(item.at, say);
  const head = `${title}${who ? `${say.by}${who}` : ''}${at ? ` (${at})` : ''}:`;
  const lines = [head, clip(item.text || say.quoteEmpty, limit)];
  if (item.card) lines.push(`${say.card}: ${clip(item.card, 200)}`);
  const media = (item.media || []).filter(Boolean);
  if (media.length) lines.push(`${say.media}: ${media.map((entry) => clip(entry, 120)).join('; ')}`);
  return lines;
}

function describeImages(images, say) {
  const order = images
    .map((image, index) => `${index + 1} — ${say.kinds[image.kind]?.[image.from] || say.fallbackKind}`)
    .join('; ');
  const lines = [`${say.images}: ${order}.`];
  for (const [index, image] of images.entries()) {
    if (image.alt) lines.push(`${say.alt} ${index + 1}: ${clip(image.alt, 200)}`);
  }
  return lines;
}

export function composeInput(post = {}, answerLang = 'ru', now = Date.now()) {
  const ask = composeAsk(post, answerLang, now);
  if (!ask) return null;
  const images = (post.images || []).filter((image) => typeof image?.url === 'string' && image.url);
  return [{ type: 'text', text: ask }, ...images.map((image) => ({ type: 'image', url: image.url }))];
}

export function sawOf(post = {}, input = []) {
  return {
    images: input.filter((item) => item.type === 'image').length,
    quote: Boolean(post.quote?.text),
    parent: Boolean(post.parents?.length),
    replies: Array.isArray(post.replies) ? Math.min(post.replies.length, 6) : 0,
    note: Boolean(post.note || post.quote?.note),
  };
}

function clip(value, limit) {
  const text = String(value).trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const PREAMBLE = new RegExp(
  '^(' +
    [
      'в\\s+(этом\\s+)?посте',
      'автор\\s+(поста\\s+)?(пишет|сообщает|рассказывает|говорит)',
      'пост\\s+о\\s+том,?\\s+что',
      'краткий\\s+(пересказ|разбор)',
      '(пересказ|разбор|объяснение)\\s*:',
      'если\\s+коротко',
      'коротко\\s+говоря',
      'вот\\s+что\\s+(тут\\s+)?(написано|происходит|важно)',
      'дав(ай|айте)\\s+разб[а-яё]*',
      'речь\\s+(идёт|идет)\\s+о\\s+том,?\\s+что',
    ].join('|') +
    ')[\\s:,—-]*',
  'i',
);

const PREAMBLE_EN = new RegExp(
  '^(' +
    [
      'in\\s+this\\s+post',
      "this\\s+post\\s+is\\s+about",
      'the\\s+(author|poster)\\s+(writes|says|explains|argues)',
      'in\\s+short',
      '(short|quick)\\s+(version|summary)',
      '(summary|breakdown|explanation)\\s*:',
      "here'?s\\s+what\\s+(this\\s+post|it|is)\\s*(says|means|is\\s+about)?",
      "let'?s\\s+break\\s+(this|it)\\s+down",
    ].join('|') +
    ')[\\s:,—-]*',
  'i',
);

const OFFER = /(^|[\n.!?»)]\s*)(хотите|если\s+(нужно|хотите)|могу|нужно\s+ли|подсказать)(?![а-яё])[^\n]*\?\s*$/i;

const OFFER_EN = /(^|[\n.!?")]\s*)(want\s+me|would\s+you\s+like|should\s+i|shall\s+i|let\s+me\s+know|happy\s+to)\b[^\n]*\??\s*$/i;

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu;

export function cleanAnswer(raw, lang = 'ru') {
  return tidyAnswer(raw, lang).text;
}

export function sourcesOf(raw) {
  const found = [];
  const take = (url) => {
    const clean = String(url).replace(/[.,;:!?)»"'\]]+$/, '');
    if (/^https?:\/\/(www\.)?t\.co\//i.test(clean)) return;
    if (/^https?:\/\/[^\s/]+\.[^\s]+/i.test(clean) && !found.includes(clean)) found.push(clean);
  };
  let text = String(raw || '').replace(/\r/g, '');
  text = text.replace(/\uE200[^\uE201\n]*\uE201/g, '').replace(/[\uE000-\uF8FF]/g, '');
  const lines = text.split('\n');
  const kept = [];
  for (const line of lines) {
    const marker = /^\s*(?:\*\*)?(?:SOURCES|Sources|Источники)(?:\*\*)?\s*:\s*(.*)$/.exec(line);
    if (marker) {
      for (const url of marker[1].match(/https?:\/\/[^\s<>()"'«»]+/g) || []) take(url);
      continue;
    }
    kept.push(line);
  }
  text = kept.join('\n');
  text = text.replace(/\s*\(\s*\[([^\]]*)\]\((https?:[^)\s]+)\)\s*\)/g, (_, label, url) => {
    take(url);
    return '';
  });
  text = text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, label, url) => {
    take(url);
    return label;
  });
  text = text.replace(/\s*\((https?:\/\/[^\s)]+)\)/g, (_, url) => {
    take(url);
    return '';
  });
  return { text, sources: found.slice(0, 3) };
}

export function tidyAnswer(raw, lang = 'ru') {
  const english = lang === 'en';
  const split = sourcesOf(raw);
  let text = split.text.trim();
  if (!text) return { text: '', sources: split.sources };
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/`([^`\n]+)`/g, '$1');
  text = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)\*(\S[^*]*)\*/g, '$1$2');
  text = text.replace(/^\s*(?:[–—•*]|-)\s+/gm, '- ');
  text = text.replace(EMOJI, '');
  const pairs = [
    ['«', '»'],
    ['"', '"'],
    ['“', '”'],
  ];
  for (const [open, close] of pairs) {
    if (text.startsWith(open) && text.endsWith(close) && text.length > 2) {
      text = text.slice(1, -1).trim();
    }
  }
  if (english) text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  else text = text.replace(/“([^”]*)”/g, '«$1»').replace(/„([^“]*)“/g, '«$1»');
  text = text.replace(english ? PREAMBLE_EN : PREAMBLE, '');
  text = text.replace(english ? OFFER_EN : OFFER, '$1');
  text = text.replace(/[ \t]+/g, ' ').replace(/ +$/gm, '').replace(/\n{3,}/g, '\n\n');
  return { text: finish(text.trim()), sources: split.sources };
}

function finish(text) {
  if (!/…\s*$/.test(text)) return text;
  const cut = text.replace(/\s*…\s*$/, '');
  const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return end > cut.length * 0.4 ? cut.slice(0, end + 1) : text;
}

export function classifyError(message) {
  const text = String(message || '').toLowerCase();
  if (/401|unauthor|not logged in|login|auth/.test(text)) return 'auth';
  if (/rate.?limit|usage limit|quota|too many requests|429/.test(text)) return 'quota';
  if (/enotfound|econnrefused|network|dns|timed out|timeout/.test(text)) return 'network';
  return 'codex';
}

export function modelLabel(slug) {
  const tail = String(slug || '').split('-').pop();
  return tail ? tail[0].toUpperCase() + tail.slice(1) : 'модель';
}
