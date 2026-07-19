# レポート: scheduling

# 日程調整リンク(Calendly等)をコールドメールに入れる是非と実装 調査レポート

## 調査(1): 1通目に日程調整リンクを入れるべきか

### 総論
検索で得られた情報源は**すべてコールドメール送信ツール・アウトバウンドSaaSベンダーのブログ**であり、査読済み学術研究や独立系機関による統制されたRCT(無作為化比較試験)は見つからなかった。以下は「未確認」の留保付きで、ベンダー各社が自社送信データを分析した内容として扱う。

### 「押し付けがましい」派を支持するデータ
- Gangly社(コールドメール送信ツールベンダー)が自社プラットフォーム経由の500通(2026年Q1、送信者50名・ICP12種)を分析し、Gong(2,800万件超)・Instantly(1億件超)・Pitchbox+Backlinko(1,200万件)・Woodpeckerの公開ベンチマークと突き合わせたところ、CTAタイプ別の返信率は次の通り: 関心質問型("Worth a 10-minute look?")11.4% > "資料送ってよいか"型8.2% > 直接会議依頼("Got 15 min Thursday?")5.0% > **カレンダーリンク3.1%** > 複数選択肢提示2.7%。「依頼の大きさに反比例して返信率が下がる」のが最も再現性の高い知見だとしている。[Gangly Blog](https://getgangly.com/blog/cold-email-reply-rate-study)
  - **ベンダー自社データ・独立検証不可**。他社ベンチマークとの相互参照はあるが、第三者監査ではない。
- Hunter.io社の「State of Cold Email 2026」レポート(2025年にHunterユーザーが送信した3,100万通の分析+意思決定者アンケート)では、「押し付けがましい・売り込み臭い」が受信者の不満のトップで65%が指摘。ただしこのレポート自体に日程調整リンクへの直接言及は無い(汎用的な「hard ask」への言及のみ)。[Hunter.io State of Email Outreach 2026](https://hunter.io/the-state-of-cold-email/)
  - **ベンダー自社データ・独立検証不可**。
- 複数の送信ツールベンダー(Instantly, Allegrow, Saleshandy等)が一致して「1通目にリンク・添付・画像を入れるとスパム判定・警戒感が上がる」「返信/開封の確約が無い段階でリンクを送るのは摩擦が高い」と述べている。[Instantly Meeting Scheduling Guide](https://instantly.ai/blog/meeting-scheduling-email-guide-for-cold-outreach-2026/) / [Allegrow Cold Email Sequence Guide](https://www.allegrow.co/knowledge-base/cold-email-sequences)

### 「摩擦を減らす」派を支持するデータ
- 明確に「1通目にリンクを入れると商談化率が上がる」ことを実データで示したソースは見つからなかった(**未確認**)。唯一近いのは「特定の日時候補を2つ提示する(例: 火曜14時か木曜10時)」方式が推奨されている点で、これは"リンクではなく具体的候補日時の提示"であり、Calendlyリンクとは別物である。[Allegrow](https://www.allegrow.co/knowledge-base/cold-email-sequences)

### 何通目に入れるべきか
複数ベンダーブログが一致して推奨: **会議依頼・カレンダーリンクは2通目または3通目**(初回送信後、開封または返信があった段階)から。1通目は関心を引く低摩擦CTA(質問形式)にとどめ、リンクは相手の反応を見てから投入する設計が定石とされている。[Allegrow](https://www.allegrow.co/knowledge-base/cold-email-sequences) / [Instantly](https://instantly.ai/blog/meeting-scheduling-email-guide-for-cold-outreach-2026/)

**結論**: 「1通目に日程調整リンクを入れるべきでない」とする主張の方がベンダーブログの間で優勢だが、根拠は全てベンダー自社データであり独立検証不可。日本語の一次データ(調査2参照)ではむしろ「9割強は失礼と感じない」という逆方向の結果も出ており、**英語圏のコールドメール実務知見と日本のビジネスマナー調査は矛盾する可能性がある**点に留意。

---

## 調査(2): 配信到達性への影響

- 複数の到達性専門家系ソースが一致: calendly.com は多数の送信者が共有する高トラフィックドメインであり、ドメイン自体の「ノイズ/シグナル比」が悪化するとリンクを含むメール全体のレピュテーションスコアが下がる。これは自社の送信履歴と無関係に起こりうる。[suped.com](https://www.suped.com/knowledge/email-deliverability/troubleshooting/why-is-mimecast-blocking-emails-containing-calendly-links-and-other-urls) / [meetergo](https://meetergo.com/en/magazine/calendly-invites-spam)
- Mimecast等のセキュリティゲートウェイは「Calendly/HubSpot/Chili Piper等の共有ドメインへのリンク」をURLレピュテーションベースで機械的にブロックする事例が報告されている。[suped.com](https://www.suped.com/knowledge/email-deliverability/troubleshooting/why-is-mimecast-blocking-emails-containing-calendly-links-and-other-urls)
- 「リンクを追加するごとに到達性は一般的に低下する」との言及があるが、**「リンク1本のみ」と「複数リンク」を明確に対比した統制実験データは見つからなかった(未確認)**。見つかった提言は定性的なもの: リンク数を最小限にする、初回送信では避ける、返信獲得後に送る、独自ドメインでリダイレクトする(ブランド化リンク)などの緩和策。[Semantic Mastery](https://semanticmastery.com/cold-emailing-tips-for-seo-success-how-to-use-calendar-links-without-hurting-deliverability/) / [meetergo](https://meetergo.com/en/magazine/calendly-invites-spam)
- 「テンプレ的な件名(You have a new meeting with [Name]等)がフィッシングと酷似しており、ユニーク性スコアが低くペナルティを受ける」との指摘もある。[meetergo](https://meetergo.com/en/magazine/calendly-invites-spam)

**結論**: 「リンクは少ないほど・遅く出すほど安全」という定性的方向性は複数ソースで一致するが、「1本のみなら安全」という定量的な閾値・保証を示す一次データは確認できなかった。**未確認**。

---

## 調査(3): 日本market — 日程調整リンクは失礼か

### 一次データ(ベンダー自社調査だが唯一の定量データ)
- ミクステンド株式会社(TimeRex運営元)が2024年8月6〜7日、マクロミル委託のインターネットリサーチで309人を調査。**92.6%が「日程調整ツールのURL送付は失礼ではない」と回答**。失礼と感じた7.4%の理由の最多は「承諾前なのに会うことを前提とした姿勢に感じる」(56.5%)。[PR TIMES / ミクステンド](https://prtimes.jp/main/html/rd/p/000000051.000032995.html)
  - **ベンダー自社データ・独立検証不可**(日程調整ツール事業者が自社カテゴリの受容度を調査している点に留意)。
- ITmediaビジネスオンライン(2025年2月27日公開)は、IT業界キャリア15年以上のベテラン営業が上司から部下へ、あるいは営業先へ日程調整ツールを無断で送りクレームになった実例を紹介。「誰もが使っているツールだからといって万能ではない」「導入前の合意形成が重要」と指摘。年配層ほど「自分の都合を勝手に決められた」と感じやすい傾向にも言及。[ITmedia](https://www.itmedia.co.jp/business/articles/2502/27/news041.html)
- 株式会社RECEPTIONIST(note、日程調整ツール導入企業の立場)は「ツール自体は失礼ではなく使い方次第」との論調。目上の人・クライアントには「他にご希望があればお知らせください」等の一言を添える配慮が必要、いきなりリンクのみ送らないことを推奨。[note.com/receptionist](https://note.com/receptionist/n/n0e1536f76063)
- @DIME、goo ニュース等の一般メディアも同ITmedia記事を転載しており、「日程調整ツールは失礼か」論争自体が2025年前後に日本のビジネスメディアで話題になったテーマであることがうかがえる。[@DIME](https://dime.jp/genre/1868461/)

### 国内ツールの普及状況
- スマートキャンプ(BOXIL編集部)が2024年2月16〜27日に実施した「SaaS利用実態調査」(日程調整ツール利用者421人)によるシェア: Microsoft Outlook 9.9%、Googleカレンダー8.3%、調整さん5.2%(Calendly・TimeRex・Spirの個別シェア数値は記事中に記載なし)。[BOXIL](https://boxil.jp/mag/a8617/)
- TimeRexは2025年に「累計利用者50万人」を突破したとベンダー自身が発表(**ベンダー自社データ**)。[各種紹介記事より、一次PRは未直接確認]
- 「日程調整ツール市場規模〇千億円」等の数値がいくつかの比較記事に登場したが、一次の調査主体・調査手法を検索結果内で確認できなかったため**未確認**として扱う(本レポートには数値を採用しない)。

**結論**: 唯一の定量データ(TimeRex/ミクステンド調査、n=309)は「9割強は失礼と感じない」だが、実例報告(ITmedia)や実務者の声(note)は「相手・関係性・伝え方次第でクレームになりうる」ことを裏付けており、**単純な多数決では判断できない**。特に「承諾前に会う前提で送る」ことへの反発が最大理由である点は、調査(1)の英語圏データ(いきなり会議依頼は返信率が下がる)と方向性が一致する。年配層・目上の相手・まだ関心表明前の相手には、一言添えるか初回では送らない設計が無難と考えられる。

---

## 調査(4): Calendly の実装詳細(公式ドキュメント確認済み)

### (a) メールごとのパーソナライズリンク(プリフィル)
公式ヘルプ記載のURLクエリパラメータでプリフィル可能な項目は下記のみ: [Calendly Help — Pre-fill invitee information](https://calendly.com/help/how-to-pre-fill-invitee-information-in-your-calendly-link)

| フィールド | パラメータ名 |
|---|---|
| フルネーム | `name` |
| 名 | `first_name` |
| 姓 | `last_name` |
| メール | `email` |
| 場所 | `location` |
| カスタム質問への回答 | `a1`, `a2`... |
| ゲスト追加 | `guests` |

形式例: `https://calendly.com/yourlink/consultation?name=John%20Doe&email=john@example.com&a1=...`

**「company(会社名)」はネイティブのプリフィル項目ではない**。会社名をプリフィルしたい場合は、イベントタイプ側で「会社名を聞くカスタム質問」を作成し、`a1`等のパラメータで回答を事前投入する必要がある。プリフィルはURLパラメータのみで実現でき、この機能自体は**無料プランでも利用可能**(APIコール不要、静的URL生成で足りる)。

### (b) Webhookによる予約通知
- POST `/webhook_subscriptions` にPersonal Access Tokenで認証してエンドポイントURLを登録。`events`配列に指定できるイベントは `invitee.created`(予約作成)・`invitee.canceled`(予約キャンセル)・`routing_form_submission.created`(ルーティングフォーム送信)。[Calendly Developer — Webhook subscriptions](https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions) / [Create Webhook Subscription](https://developer.calendly.com/api-docs/b3A6NTkxNDI1-create-webhook-subscription)
- ペイロードには招待者の全詳細は含まれず、`invitee` のURIが返るのでGet Event Inviteeエンドポイントを別途叩いて詳細を取得する2段構成。[同上]
- **Webhookの利用にはStandard/Teams/Enterprise(いずれも有料プラン)が必須。Freeプランでは不可。** [developer.calendly.com/frequently-asked-questions](https://developer.calendly.com/frequently-asked-questions)

### 認証方式
API v2はPersonal Access Token(PAT)とOAuth 2.1の2方式。**「社内の自分たちだけが使う統合」の場合は公式にPAT使用が推奨**されており、OAuthは複数外部アカウントを跨いで使うマルチテナントアプリ向け。今回のような社内2〜3名運用ならPATで十分。[developer.calendly.com — When to choose between PAT and OAuth](https://developer.calendly.com/when-to-choose-between-personal-access-tokens-and-oauth) / [Personal access tokens overview](https://developer.calendly.com/personal-access-tokens)

### APIとプランの関係(公式FAQより)
- GET/POSTによる基本API呼び出しは**Freeプランを含む全プランで可能**(アクティビティログ取得・データ削除系などEnterprise専用エンドポイントを除く)。[developer.calendly.com/frequently-asked-questions](https://developer.calendly.com/frequently-asked-questions)
- 新しい「Scheduling API」(Create Event Invitee等、リダイレクト無しで予約を作成できるAPI)は**有料プランが必須**(具体的にStandard以上かは公式文言上「a paid plan」とのみ明記で、Teams/Enterpriseとの切り分けは検索結果内で確認できず——**未確認**)。[developer.calendly.com/api-docs/p3ghrxrwbl8kqe-create-event-invitee](https://developer.calendly.com/api-docs/p3ghrxrwbl8kqe-create-event-invitee) / [Community: Scheduling API now available](https://community.calendly.com/api-webhook-help-61/scheduling-api-now-available-4825)
- Webhookは明確にStandard/Teams/Enterpriseのみ。

### 料金プラン(公式サイトより、年払い時)
Free: $0 / Standard: $10/席/月 / Teams: $16/席/月 / Enterprise: $15,000/年〜。[calendly.com/pricing](https://calendly.com/pricing)

送信者2〜3名でWebhook連携まで行う場合、最低でもStandard×人数分=概算$20〜30/月が必要。

---

## 調査(5): 代替ツールの比較

| 項目 | Calendly | TimeRex | Spir | Googleカレンダー予約スケジュール |
|---|---|---|---|---|
| プリフィル(URLパラメータ) | ○ name/email/custom(a1..)。会社名はカスタム質問経由 [公式](https://calendly.com/help/how-to-pre-fill-invitee-information-in-your-calendly-link) | ○ `guest_name`/`guest_email`+カスタム質問、最大25パラメータ [公式ヘルプ](https://help.timerex.net/ja/articles/9919346-%E6%97%A5%E7%A8%8B%E8%AA%BF%E6%95%B4%E3%82%AB%E3%83%AC%E3%83%B3%E3%83%80%E3%83%BCurl%E3%81%AB%E6%B5%81%E5%85%A5%E5%85%83%E3%82%84%E4%BC%9A%E5%93%A1id%E3%81%AA%E3%81%A9%E3%81%AE%E6%83%85%E5%A0%B1%E3%82%92%E4%BB%98%E4%B8%8E%E3%81%99%E3%82%8B) | 具体的なURLパラメータ・プリフィル仕様は検索範囲内で確認できず(**未確認**) | 公式のURLパラメータプリフィルは非サポートとみられる(Googleカレンダーコミュニティで複数のユーザー要望はあるが公式対応の記載なし)。**未確認/おそらく非対応** [Google Calendar Community](https://support.google.com/calendar/thread/200857183/can-parameter-be-passed-to-a-google-appointment-scheduler-link?hl=en) |
| Webhook | ○ ただし**有料(Standard以上)必須** [公式FAQ](https://developer.calendly.com/frequently-asked-questions) | ○ **2024年3月以降、フリープラン含む全プランで利用可能** [TimeRex公式ブログ](https://timerex.net/blog/update/240318-all-plan-support-for-webhook) | ○ **Team Planのみ**(個人プランは不可) [PR TIMES/Spir](https://prtimes.jp/main/html/rd/p/000000023.000050829.html) | 予約専用Webhookは無いが、Calendar APIの`events.watch`(push notification)でカレンダー変更全般を検知可能。予約スケジュール専用の明示的なWebhook機能としての記載は確認できず(**未確認**) [Google Calendar API Push notifications](https://developers.google.com/workspace/calendar/api/guides/push) |
| 料金(概算) | Free $0 / Standard $10・Teams $16 /席/月(年払い) [公式](https://calendly.com/pricing) | Free ¥0 / ベーシック 月額750〜900円/ユーザー / プレミアム 月額1,250円/ユーザー(年払い) [公式](https://timerex.net/plan) | Free(2名まで)¥0 / Team Plan 5名¥6,000/月〜(規模でスライド) [公式](https://www.spirinc.com/price) | 個人でも基本機能は無料。複数予約ページ・自動リマインダー・決済等はWorkspace Business Standard/Plus/Enterprise以上が必要(2024年12月時点) [Google Workspace](https://workspace.google.com/resources/appointment-scheduling/) |
| 認証方式 | PAT / OAuth 2.1 | 未調査(**未確認**) | 未調査(**未確認**) | Google OAuth2(Workspace API標準) |

**コスト面の要点**: Webhookでの自動ステータス更新を要件にすると、Calendly・Spirは有料プラン必須(Spirは特にTeam Planのみ)だが、**TimeRexはフリープランでもWebhook連携が可能**という点で今回のような小規模(送信者2〜3名)内製ツールとは相性が良い可能性がある。

---

## 「送信者ごとに複数の日程調整ツールを選べるようにする」設計への推奨

1. **技術的には可能だが、統合コストは一様ではない**。Calendly(PAT/OAuth、Standard以上でWebhook)・TimeRex(URLパラメータ+全プランWebhook)・Spir(Team PlanのみWebhook、認証方式は本調査で未確認)は認証方式・プリフィル仕様・Webhookペイロード形式がすべて異なるため、共通の「予約ステータス更新」インターフェースを自社側で抽象化(アダプタパターン)する実装コストが発生する。

2. **リンク未挿入という結論を先に固定すべき**: 調査(1)(2)(3)の結果を踏まえると、そもそも「1通目にリンクを入れるか」の設計判断の方がツール選定より優先度が高い。1通目は具体的候補日時の提示や関心喚起のみに留め、日程調整リンク(どのツールであれ)は返信/開封等の反応があった2〜3通目以降に投入する設計が、英語圏のベンダーデータでも日本のクレーム事例(承諾前提への反発)でも共通して支持される。

3. **送信者ごとの複数ツール対応は、社内2〜3名という規模を踏まえるとオーバーエンジニアリングの可能性がある**。各送信者が既に個人でCalendly/TimeRex等を使い分けているなど具体的な既存事情がなければ、まずは1ツールに統一し(コスト・Webhook可用性・国内商習慣への馴染みやすさで比較するとTimeRexが有力候補: 全プランWebhook対応・日本語UI・料金が最安)、Webhook受信エンドポイントとステータス更新ロジックを1系統だけ実装する方が保守性が高い。

4. **どうしても複数ツール対応が必要な場合**(例: 送信者が既に別々のツールに慣れている、相手の業界慣習に応じて使い分けたい等)は、(i) 各ツールのWebhookペイロードを正規化する共通スキーマ(invitee name/email/company/予約日時/ステータス)を自社DB側に定義し、(ii) ツールごとのWebhook署名検証・認証情報を`sender_id`に紐付けて管理し、(iii) プリフィル時は「name/email(共通)+company(Calendly/TimeRexはカスタム質問経由、Spirは未確認につき要個別検証)」というように最大公約数のフィールドだけ共通化し、ツール固有フィールドは無視する設計が安全。Spirについては認証方式・プリフィル仕様が本調査で確認しきれなかったため、採用する場合は着手前に公式開発者ドキュメントの追加確認が必須。

---

## 主要な未確認事項(まとめ)
- 「リンク1本のみ」と「複数リンク」の到達性への影響を直接比較した定量データ
- 日程調整ツール(カテゴリ全体)の市場規模データの一次出典
- Calendly Scheduling API がStandard/Teams/Enterpriseのどの階層から使えるかの正確な切り分け(公式文言は「a paid plan」とのみ)
- Spirの認証方式・API/プリフィル仕様の詳細
- Googleカレンダー予約スケジュールの予約確定に対する専用Webhook機能の有無(events.watchでの代替が公式に推奨されているかは未確認)
- TimeRexの認証方式(API連携の認証トークン形式)の詳細

---

# 独立検証結果

# 検証結果(独立再検証)

対象レポートの意思決定に最も影響する主張として、以下5件を選定し、レポートの引用元とは別に一次情報へ直接アクセスして再検証した。

---

### 1. 「日程調整ツールURL送付は失礼か」調査(ミクステンド/TimeRex、n=309、92.6%)

**[主張]** ミクステンド株式会社が2024年8月6〜7日、マクロミル委託のインターネットリサーチで309人を調査し、92.6%が「日程調整ツールのURL送付は失礼ではない」と回答した。

**[判定] 確認済み**

**[根拠URL]** https://prtimes.jp/main/html/rd/p/000000051.000032995.html (PR TIMES掲載のミクステンド公式プレスリリース原文に直接アクセスして確認)

一次情報を直接確認したところ、実施主体=ミクステンド株式会社、調査手法=インターネットリサーチ(委託先マクロミル)、対象者=309人(日程調整ツールでの依頼を受けたことがある全国20〜69歳就業者)、調査期間=2024年8月6日〜7日、「失礼ではない」回答率=92.6%と、レポートの記載と完全に一致した。なお「**ベンダー自社データ・独立検証不可**」というレポートの留保は妥当(調査主体が日程調整ツール事業者自身であるため)。

---

### 2. Calendly Webhookは有料プラン(Standard以上)必須、Freeプランでは不可

**[主張]** Webhookの利用にはStandard/Teams/Enterprise(いずれも有料プラン)が必須で、Freeプランでは不可。ただし通常のGET/POST API呼び出しはFreeプランを含む全プランで可能。

**[判定] 確認済み**

**[根拠URL]** https://developer.calendly.com/frequently-asked-questions (Calendly公式開発者ドキュメントを直接Fetchして原文確認)

公式ドキュメント原文に "the Calendly user account for which the webhook subscription is being made will need a paid subscription on the Standard, Teams, or Enterprise plan" との明記を確認。また "Developers can make GET and POST requests to API endpoints on behalf of a Calendly user on any subscription plan, including the Free plan" ともあり、通常API呼び出しはFree可・Webhookのみ有料必須という切り分けもレポートと一致。

---

### 3. Calendly料金(Free $0 / Standard $10/席/月 / Teams $16/席/月 / Enterprise $15,000/年〜)

**[主張]** Free: $0 / Standard: $10/席/月 / Teams: $16/席/月 / Enterprise: $15,000/年〜(年払い時)。

**[判定] 確認済み**

**[根拠URL]** 
- https://calendly.com/pricing (公式、直接Fetch)
- https://costbench.com/software/scheduling/calendly/ (第三者比較サイト、クロスチェック用に別途Fetch)

公式サイト直接確認で Standard $10/seat/mo(年払い)・Teams $16/seat/mo(年払い)・Enterprise "Starts at $15k/yr" を確認。第三者ソース(costbench.com)でも同額(Standard年払い$10/月払い$12、Teams年払い$16/月払い$20、Enterprise $15,000/年〜)と完全一致し、複数ソースでの裏取りが取れた。

---

### 4. TimeRexは2024年3月以降、フリープラン含む全プランでWebhook利用可能

**[主張]** TimeRexは2024年3月以降、フリープラン含む全プランでWebhook連携が利用可能。

**[判定] 確認済み**

**[根拠URL]** https://timerex.net/plan (公式料金ページを直接Fetchして現時点の状態を確認)

レポートは2024年3月の機能追加告知ブログを根拠にしていたが、今回は**現在の公式料金ページ**を直接確認し、フリー・ベーシック・プレミアムの全プランで「日程調整完了時のAPI連携(Webhook)」が利用可能であることを確認した。過去の一時的な施策ではなく、現時点でも継続している仕様であることまで裏取りできた点で、レポートの主張は現在も有効。

---

### 5. Gangly社調査:CTA別返信率(関心質問型11.4% > カレンダーリンク型3.1%等)

**[主張]** Gangly社が2026年Q1に自社プラットフォーム経由500通を分析し、CTAタイプ別返信率は関心質問型11.4% > 資料送付伺い型8.2% > 直接会議依頼5.0% > カレンダーリンク3.1% > 複数選択肢提示2.7%。

**[判定] 確認済み(ただし追加の留保を推奨)**

**[根拠URL]** https://getgangly.com/blog/cold-email-reply-rate-study (公式ブログ原文を直接Fetch)

数値(11.4% / 8.2% / 5.0% / 3.1% / 2.7%)は原文と完全一致し、期間(2026年1〜3月)・送信者数(50名)・買い手ペルソナ数(12)もレポート記載と一致した。方法論もGanglyプラットフォーム経由の自社送信データであり、レポートの「ベンダー自社データ・独立検証不可」という留保は妥当。

**追加確認事項**: Gangly社自体を独立に調査したところ、大手ベンダー(Instantly・Gong・Woodpecker等)と異なり、創業者1名("2×founder")が運営する小規模な新興サービスであることが判明した(https://getgangly.com/best/cold-email-tools 等の自社ブログ以外に第三者による会社概要・実績の裏付けが見つからず)。サンプルもn=500・送信者50名と小規模である。レポート本文の判定自体(「押し付けがましい派」の一根拠として提示、断定はしていない)は誤りではないが、**このデータを意思決定の主要根拠にする場合は、より確立された大規模ベンダー(Instantly 1億件超、Gong 2,800万件超等、レポートが「突き合わせ」対象として言及している側)のベンチマークを主、Ganglyの数値は補助的な一データ点として扱うことを推奨**。

---

## 総括

検証した5件はいずれも数値・出典ともに一次情報と一致し、**誤り・古い情報は検出されなかった**。強いて改善点を挙げるなら、5番目のGanglyデータについて「小規模・新興ベンダーの自社データである」という追加のコンテキストをレポートに明記すると、読み手が数値の重み付けを誤らずに済む。他4件(TimeRex/ミクステンド調査、Calendly Webhookのプラン要件、Calendly料金、TimeRexの全プランWebhook対応)は、意思決定(「1通目にリンクを入れるか」「Calendly vs TimeRexのコスト・実装難度比較」)の根拠として**そのまま採用して問題ない**。