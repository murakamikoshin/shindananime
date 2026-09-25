/* 収益まわりの設定。ここだけ書き換えれば、画面の側は触らなくていい。
   何も埋めなければ、広告は一切読み込まず、配信サービスへはただの検索リンクになる。 */
export const CONFIG = {
  /* 共有するときの URL と、紹介ページ */
  appUrl: 'https://koshinstudio.com/app/shindananime/',
  aboutUrl: 'https://koshinstudio.com/works/shindananime/',
  privacyUrl: 'https://koshinstudio.com/privacy/',

  /* 解析中の画面を出す長さ（ミリ秒）。動きを嫌う設定の人には短くする */
  loadingMs: 3200,

  /* Google AdSense。審査に通ったら enabled を true にして client と slot を埋める。
     結果画面の「スポンサーリンク」枠にだけ出す。
     読み込み中の画面には出さない（中身の無い画面に広告を置くのは AdSense の方針違反）。
     ads.txt は koshinstudio.com の直下に置くこと（このアプリの Pages ではない） */
  ads: {
    enabled: false,
    client: '',            // 'ca-pub-0000000000000000'
    slots: { result: '' }, // 結果画面の枠の data-ad-slot
  },

  /* 配信サービス。search は作品名で探す先（{q} に作品名が入る）。
     affiliate を書くと、そちらを使い、リンクに PR と rel="sponsored" が付く。
       {q}   … 作品名（URL エンコード済み）
       {url} … search を組み立てた URL（URL エンコード済み）。ASP の「飛び先 URL」用
     例（A8.net）   'https://px.a8.net/svt/ejp?a8mat=XXXXX&a8ejpredirect={url}'
     例（Amazon）   'https://www.amazon.co.jp/s?k={q}&i=instant-video&tag=XXXXX-22'
     検索 URL の形は各サービスの都合で変わる。出す前に一度ずつ踏んで確かめること */
  vod: [
    { id: 'unext', name: 'U-NEXT', search: 'https://video.unext.jp/freeword?query={q}', affiliate: '' },
    { id: 'danime', name: 'dアニメストア', search: 'https://animestore.docomo.ne.jp/animestore/sch_pc?searchKey={q}', affiliate: '' },
    { id: 'prime', name: 'Prime Video', search: 'https://www.amazon.co.jp/s?k={q}&i=instant-video', affiliate: '' },
    { id: 'abema', name: 'ABEMA', search: 'https://abema.tv/search?q={q}', affiliate: '' },
    { id: 'netflix', name: 'Netflix', search: 'https://www.netflix.com/search?q={q}', affiliate: '' },
  ],

  /* 解析中の画面に出す自前の PR 枠（アフィリエイト）。他社の広告網は使わない。
     enabled にすると、診断の画面と並べて小さく出す。文言は提携先の規約に合わせて書く。
     「無料」「○日間」などの条件は変わるので、確かめたものだけを書くこと */
  loadingPr: {
    enabled: false,
    label: 'PR',
    title: '',   // 例: 'アニメを見るなら U-NEXT'
    text: '',    // 例: '見放題作品が多い動画配信サービス'
    url: '',     // ASP の広告リンク
  },

  /* 画像を出すか。Filmarks の画像は作品の権利者のもの。
     使ってよいと確かめるまでは false のまま（色の札で代わりに出す） */
  showImages: false,
};
