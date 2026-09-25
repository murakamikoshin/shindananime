/* 収益まわりの設定。ここだけ書き換えれば、画面の側は触らなくていい。 */
export const CONFIG = {
  appUrl: 'https://koshinstudio.com/app/shindananime/',
  aboutUrl: 'https://koshinstudio.com/works/shindananime/',
  privacyUrl: 'https://koshinstudio.com/privacy/',

  /* 読み込むデータ。build_anime_db.py が書き出したもの */
  dbUrl: './all_anime_db.json',

  /* 解析中の画面の長さ（ミリ秒）。動きを嫌う設定の人には短くする */
  loadingMs: 4000,

  /* 広告（Google AdSense など）。
     enabled が false の間は、枠線と「スポンサーリンク」だけのダミー枠を出す
     （showPlaceholder を false にすると、ダミー枠も消える）。
     slots.top     … 結果画面のいちばん上
     slots.loading … 解析中の画面のまん中
     ※ 解析中の画面は中身が少なく、自動で移る画面なので、AdSense の
       「コンテンツの無い画面への広告」に当たる恐れがあったが、
       持ち主がリスクを承知の上で本物の広告を出す判断をした（2026-09-25）。
       loadingPr（自前 PR 枠）には切り替えない。
     ads.txt は koshinstudio.com の直下に置く（このアプリの Pages ではない） */
  ads: {
    enabled: true,
    client: 'ca-pub-3863314847163872',
    slots: { top: '', loading: '' },   // data-ad-slot が決まったら入れる
    showPlaceholder: true,
  },

  /* 解析中の画面の自前 PR 枠。enabled にすると、広告枠の代わりにこれを出す */
  loadingPr: {
    enabled: false,
    title: '',   // 例: 'アニメを見るなら DMM TV'
    text: '',
    url: '',     // ASP の広告リンク
  },

  /* 作品カードの配信ボタン。url にアフィリエイトリンクを入れる。
     url の中の {q} は作品名（URL エンコード済み）、{url} は search を組み立てた URL（同）。
     url が空の間は search（各サービスの検索ページ）へのただのリンクになる。
     url を入れたボタンには PR の札と rel="sponsored" が付く（外さないこと）。
     「31日間無料」などの条件はサービス側で変わる。出す前に提携先の最新の条件と合わせること */
  /* メジャー度順に並べてある。実際に見られるサービス（w.vod）の中から、
     この並びで上から MAX_VOD_BUTTONS 個だけ出す（vodButtons、src/app.js） */
  vod: [
    {
      id: 'netflix',
      label: 'Netflixで探す ➔',
      url: '',
      search: 'https://www.netflix.com/search?q={q}',
      className: 'bg-[#E50914] hover:bg-[#f21c27]',
    },
    {
      id: 'prime',
      label: 'Prime Videoで探す ➔',
      url: '',
      search: 'https://www.amazon.co.jp/s?k={q}&i=instant-video',
      className: 'bg-[#00A8E1] hover:bg-[#33bce8]',
    },
    {
      id: 'disney',
      label: 'Disney+を見る ➔',
      url: '',
      search: 'https://www.disneyplus.com/ja-jp',   // 未ログインだと検索URLが無いので、トップへ
      className: 'bg-[#113CCF] hover:bg-[#2a52e0]',
    },
    {
      id: 'unext',
      label: 'U-NEXTで31日間無料体験 ➔',
      url: '',
      search: 'https://video.unext.jp/freeword?query={q}',
      className: 'bg-[#1b1b1b] ring-1 ring-white/30 hover:bg-[#2a2a2a]',
    },
    {
      id: 'hulu',
      label: 'Huluで探す ➔',
      url: '',
      search: 'https://www.hulu.jp/search?q={q}',
      className: 'bg-[#1CE783] hover:bg-[#3ff29a] text-ink',
    },
    {
      id: 'dmmtv',
      label: 'DMM TVで無料体験視聴する ➔',
      url: '',   // 例: 'https://px.a8.net/svt/ejp?a8mat=XXXXX&a8ejpredirect={url}'
      search: 'https://tv.dmm.com/vod/list/?keyword={q}',
      className: 'bg-[#ff2d55] hover:bg-[#ff4d6d]',
    },
    {
      id: 'abema',
      label: 'ABEMAで探す ➔',
      url: '',
      search: 'https://abema.tv/search?q={q}',
      className: 'bg-[#00C4B4] hover:bg-[#1ad6c6]',
    },
    {
      id: 'danime',
      label: 'dアニメストアで探す ➔',
      url: '',
      search: 'https://animestore.docomo.ne.jp/animestore/sch_pc?searchKey={q}&vodTypeList=svod_tvod',
      className: 'bg-[#E2571C] hover:bg-[#ee6a30]',
    },
    {
      id: 'fod',
      label: 'FODで探す ➔',
      url: '',
      search: 'https://fod.fujitv.co.jp/psearch/?keyword={q}',
      className: 'bg-[#E5001C] hover:bg-[#f2192f]',
    },
    {
      id: 'telasa',
      label: 'TELASAで探す ➔',
      url: '',
      search: 'https://www.telasa.jp/search?q={q}',
      className: 'bg-[#F26522] hover:bg-[#f77e42]',
    },
    {
      id: 'lemino',
      label: 'Leminoで探す ➔',
      url: '',
      search: 'https://lemino.docomo.ne.jp/search/word/{q}',
      className: 'bg-[#EB4185] hover:bg-[#f15a97]',
    },
    {
      id: 'bandaichannel',
      label: 'バンダイチャンネルを見る ➔',
      url: '',
      search: 'https://www.b-ch.com/',   // 検索URLの形が確かめられなかったので、トップへ
      className: 'bg-[#1E3A8A] hover:bg-[#2c4fae]',
    },
  ],

  /* 共有の文面。{code} {name} {title} {match} が入る（{title}/{match} は運命の1作） */
  shareText: '私のアニメ診断タイプは【{code}：{name}型】でした！運命の1作は「{title}」（{match}%適合）。あなたにぴったりの神アニメは…？',
  shareTags: ['アニメ診断', 'アニメ'],

  /* 作品の画像を出すか。img は Annict（公式サイトの OGP 画像）と Filmarks（og:image）から。
     画像そのものは作品の権利者のものだが、どちらも元は作品の公式な販促画像で、
     他所で使われる前提のもの。持ち主がリスクを承知の上で出す判断をした（2026-09-25） */
  showImages: true,
};
