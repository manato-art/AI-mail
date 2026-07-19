# レポート: competitors

# 調査テーマ4: 競合ツール機能比較 ― 営業メール自動化ツールの機能ギャップ分析

## 調査方法・限界(先に明記)
- 各ツールの公式サイト・公式ヘルプセンターを一次情報として優先し、機能名は可能な限り原文引用。
- 数値(件数・精度%・ユーザー数等)は**すべてベンダー自社発表であり、独立検証はできていない**。本レポートでは都度「ベンダー自社データ・独立検証不可」と付記する。
- Apollo・Instantly等は機能変更が頻繁(例: Apolloは2024年に旧ウォームアップ機能を廃止しInbox Ramp Upへ変更)。**2026年7月時点のスナップショット**として扱うこと。
- Sansanは名刺管理・営業DX(AX)サービスであり、送信ツールではなくインテリジェンス/CRM寄りのため、他ツールと機能カテゴリが異なる点に留意。

---

## (A) 各ツールの機能一覧(公式ページ根拠)

### 海外ツール

**Instantly.ai** — Email Warmup(私設ネットワーク、自社発表4.2M以上のアカウント規模)、Deliverability & Infrastructure、AI Sales Agent／AI Reply Agent(返信を自動分類)、CRM、Lead Database、Email Verification、Website Visitors(訪問者検知)、Inbox Placement診断。**LinkedIn等のネイティブ・マルチチャネルは無し**(第三者ツールLinkedNav等と連携する設計)。
[instantly.ai](https://instantly.ai/)

**Lemlist** — Email、LinkedIn(コネクト申請/プロフィール訪問/テキスト・音声メッセージ自動送信)、Phone(Aircall/Ringover連携またはネイティブ発信、通話の自動要約)、WhatsApp(ウォームアップ付き)、SMS。全チャネルをUnified Inboxで一元管理し、リード反応に応じた条件分岐(Conditional Logic)で次アクションを自動決定。Lemwarm(ウォームアップ)は全プランに無償バンドル。
[lemlist.com/multichannel-prospecting](https://www.lemlist.com/multichannel-prospecting), [help.lemlist.com](http://help.lemlist.com/en/articles/9935910-understanding-lemlist-and-lemwarm-bundles)

**Apollo.io** — 230M+コンタクトDB(自社発表)、Buying Intent(LeadSift提携、1,600以上のインテントトピック、週次更新、精度98%と自社発表)、Sequences(Email+電話+LinkedInタスクの複合)、Phone Dialer(録音・CRM自動ログ)、Messaging AI(パーソナライズ文面生成)、Workflow自動化(21以上のテンプレート、シグナル起点の自動アクション)、Email Warmup(2024年に旧機能廃止、現行はInbox Ramp Up=送信量の段階引き上げのみで評判構築機能は無い、と第三者情報)。
[apollo.io/product/buying-intent](https://www.apollo.io/product/buying-intent), [apollo.io/product/engage](https://www.apollo.io/product/engage), [apollo.io/email-deliverability](https://www.apollo.io/email-deliverability)

**Smartlead** — Ultra Premium Warmup(無制限ウォームアップ)、Unified Master Inbox、SmartDialer(AIマルチチャネル発信)、SmartProspect(リード生成)、SmartAgents("AI駆動のGTMワークフォース"と自称)、SmartAssistant(AIアシスタント)、SmartInfra/SmartSenders(専用サーバー・送信インフラ)、SmartDelivery(配信データ分析)、SPF/DKIM/DMARCチェッカー。X(Twitter)/WhatsApp/SMSでの接触にも対応と自社発表。
[smartlead.ai](https://www.smartlead.ai/)

**Outreach** — Revenue Agent(見込み度の高いアカウント特定・文面生成)、Research Agent(会話・外部情報からシグナル抽出)、Deal Agent(商談情報のAI更新提案)、Meeting Prep Agent(商談前ブリーフ自動生成)、Personalization Agent(複数チャネル文面生成)、Omni Agent(自然言語での操作)、Agent Studio(ワークフロー可視化構築)。ZoomInfo連携によるインテントシグナル(2026年2月に新規20シグナル追加)。Outreach MCP Serverで外部AIエージェント(Anthropic製品含む)との連携も提供。
[outreach.ai/ai-agents](https://www.outreach.ai/ai-agents), [Outreach Release Notes Feb 2026](https://support.outreach.io/support/solutions/articles/159000425164-outreach-product-release-notes-february-2026)

**HubSpot Sales Hub** — Deal Pipelines、Meeting Scheduler、Sales Automation(マルチチャネル自動化と表記)、Breeze Prospecting Agent(Beta、アカウント発掘+パーソナライズ文面自動生成、送信までを自動化しSequenceへ自動登録、1リードあたり$1課金)、AI Guided Selling、Smart Deal Progression(Beta)、Call Tracking(パワーダイヤラー・ボイスメール自動投下)、Conversation Intelligence(通話分析・コーチング)、Forecasting、Breeze Intelligence(Clearbit系の企業/インテントデータでCRM自動補完)。
[hubspot.com/products/sales](https://www.hubspot.com/products/sales), [hubspot.com/products/sales/ai-prospecting-agent](https://www.hubspot.com/products/sales/ai-prospecting-agent)

### 国内ツール

**Sales Marker** — インテントデータ(自社発表: 1st/2nd/3rdパーティ、520万社超の法人DB、日次50億レコード規模と自社発表)を起点に、インテントコール・インテントメール・インテントフォーム・インテント広告・インテントDM/レターという**5チャネルの自動アプローチ**を提供。AI Appointment(有望企業の自動提案)、AI Account Plan(アカウント計画自動立案)、AI Meeting(商談サマリー自動生成)を「自立型AI」と称して展開。料金は非公開(個別見積り)。
[sales-marker.jp](https://sales-marker.jp/), [sales-marker.jp/function/intent-data](https://sales-marker.jp/function/intent-data/)

**Sansan(営業DX/AXサービス)** — 名刺OCR(AI+オペレーター入力、精度99.9%と自社発表)、全社横断の名刺検索・共有、100万件以上の企業DB連携。2025-2026年にAI機能を急速拡充: AI企業リストメーカー(自然言語指示から240万社超のDBを基にターゲットリストを自動生成)、AI People Profile(商談相手情報の自動要約、モバイル版)、Visit Route Maker(訪問ルート自動作成)、AI営業ロールプレイング(Sansan Labs、対話練習)、商談録音の自動要約。**送信ツールではなくインテリジェンス/名刺基盤のCRM連携サービス**。
[jp.sansan.com/function](https://jp.sansan.com/function/meishi/), [Sansan AI企業リストメーカー PR](https://jp.corp-sansan.com/news/2026/0622.html), [Sansan Labsアプリ実装PR](https://jp.corp-sansan.com/news/2025/0718.html)

**Mazrica Sales** — SFA/CRM(顧客・案件・営業レポート管理)、Mazrica AI(AI案件予測、AIによるBANT情報・ネクストアクションの自動更新提案 ※商談内容から)、AI一括名寄せ、名刺OCR取り込み、企業データ自動収集、外部連携(pickuponとの連携で通話の自動テキスト化・活動履歴登録)。
[mazrica.com/product](https://mazrica.com/product/), [saleszine.jp Mazrica AI更新提案](https://saleszine.jp/news/detail/8334)

**HubSpot日本版** — グローバル版と同一製品(日本語UI・日本語サポート)。機能差分は未確認(公式に明記した差分情報は発見できず)。

**SATORI** — 匿名見込み顧客の行動把握("名前のわかる"リードだけでなく匿名訪問企業も対象)、セグメント/タグ、シナリオメール・ステップメール、ポップアップ/プッシュ通知、フォーム・LP作成、スコアリング、ホットアラート通知、Webhook外部連携。
[satori.marketing/function](https://satori.marketing/function/)

**List Finder** — 匿名企業でも興味関心度を測定するアクセス解析、PDF閲覧解析、優先リード通知(担当・有望顧客のサイト閲覧をメール通知)、名刺データ化代行、企業属性自動付与、Sansan連携、スコアリング、休眠顧客への一斉メール。継続率98.7%と自社発表。
[promote.list-finder.jp](https://promote.list-finder.jp/)

**ferret One** — ノーコードCMS(サイト運用)、行動検知機能、ferret MA(メール配信・リードナーチャリング自動化)、AI機能「MABOW」(記事構成・執筆・校正のAI支援＝コンテンツマーケティング向けでアウトバウンド営業向けではない)、ferret SFA/CRM(Salesforce/Zoom/Slack連携)。名刺管理機能は明記なし。
[ferret-one.com/tools](https://ferret-one.com/tools)

**Kairos3(Marketing)** — 属性+Web行動の横断セグメンテーション、名刺スマホ即時データ化、フォーム/LP作成、メール・**SMS配信**、展示会管理(参加履歴からホットリード判定)、自動追客シナリオ、Webパーソナライズ+ABテスト、自動MQL抽出、Zoom/Salesforce/Sansan/Yoom(iPaaS)連携、SFA「Kairos3 Sales」との連携。
[kairosmarketing.net/marketing-automation/features](https://www.kairosmarketing.net/marketing-automation/features)

---

## (B) 現要件に無い機能 ― 重要度順リスト

| # | 機能 | 保有ツール(代表例) | なぜ営業成果に効くか | 2-3名・50-200通/日運用への必要性評価 |
|---|------|---------------------|----------------------|----------------------------------------|
| 1 | **匿名企業のサイト来訪特定+ホットリード即時通知** | SATORI, List Finder, Kairos3, ferret One | IPリバースルックアップ等で「クリックしていないが自社サイトを見に来た企業」を検知でき、既存要件の「LP閲覧検知」(既送信リードの追跡クリックが前提)より広い一次情報。関心が高まった瞬間にアプローチでき、送信前の優先順位付けに直結。 | **必要性高**。実装難度は中(IP企業判定DBの外部連携が必要)だが、送信対象の優先順位付けという運用の核に効く。過剰機能ではない。 |
| 2 | **サードパーティ・インテントデータ(検索行動ベースのタイミング検知)** | Apollo(LeadSift), Outreach(ZoomInfo), Sales Marker(1st/2nd/3rd party) | 「今まさに検討中の企業」を先に狙え、返信率・アポ率の底上げが期待できる。 | **要検討/中〜高**。営業成果への理論的効果は大きいが、商用インテントデータは契約コストが高く(Sales Markerは個別見積り、Apolloも上位プラン)、2-3名運用のROIとして見合うかは要検証。**現段階では過剰投資になりうる**ため優先度は次点。 |
| 3 | **メールウォームアップの自動化** | Instantly, Lemlist(Lemwarm), Smartlead(Ultra Premium Warmup) | 新規/低頻度送信ドメインの評判を段階的に構築し、迷惑メール判定を回避。既存要件の「送信健全性監視」は事後モニタリングだが、ウォームアップは事前予防。 | **中**。既に運用実績のある会社のGmail/Workspaceアカウントを使う前提なら、ゼロからの評判構築を要するSaaS型冷メールツールほど切実ではない。ただし1日50→200通へ増量する過程でのリスク低減策として、既存の「送信健全性監視」を補完する軽量な段階的増量ロジックは検討余地あり。全部盛りのウォームアップネットワーク参加は過剰。 |
| 4 | **AIによるターゲット企業リストの自動発掘(ICP自動探索)** | Sansan(AI企業リストメーカー), Apollo(account tiering) | 現要件の「企業リスト取込」は手動/購入DB前提。自然言語指示から自動で新規ターゲットを発掘できれば、リスト作成のボトルネックを削減できる。 | **中**。件数を増やす方向の機能であり、現在の運用が既に50-200通/日で頭打ちの規模であれば緊急性は低いが、リスト枯渇時の拡張余地として有用。 |
| 5 | **名刺OCRデータ化・自動リード登録** | Sansan, Mazrica, List Finder, Kairos3 | 要件に「名刺由来の担当者」と明記されているのに、名刺→リード化の自動化機構が要件に無い。手入力コストの削減に直結。 | **中**。既存要件との整合性が高く、実装コストも比較的軽い(OCR API利用で足りる)。小規模チームでも投資対効果が出やすい。 |
| 6 | **Slack/Teams等への即時ホットリードアラート** | SATORI(ホットアラート), Apollo(Workflow通知), List Finder(優先リード通知) | 検知から接触までのタイムラグを縮め、鮮度の高いタイミングで動ける。 | **低〜中**。実装は軽量(通知だけ)。半自動運用の意思決定を速める効果はあるが、必須ではない。 |
| 7 | **マルチチャネル(電話・LinkedIn・SMS・DM)** | Lemlist, Smartlead, Apollo, Sales Marker, Kairos3(SMS) | 単一チャネルより到達率・返信率が上がるとされる(業界一般論、定量的な独立検証は未確認)。 | **低(現段階では過剰)**。現行設計はGmail API送信に特化しており、電話・LinkedIn自動化は運用体制(誰が架電するか)・コンプライアンス・工数の観点で2-3名チームには重い。将来拡張の選択肢として記録するに留めるべき。 |
| 8 | **属性+行動のリードスコアリング** | SATORI, List Finder, Kairos3 | 誰から先に手動フォローすべきかの優先順位付けに使える。 | **低〜中**。効果測定ダッシュボードと機能的に近く、既存要件を拡張すれば安価に実装可能。 |
| 9 | **商談パイプライン/CRM管理(SFA機能)** | Mazrica, HubSpot, Outreach | 返信→アポ→商談→受注までの追跡を一本化できる。 | **低(範囲外の可能性大)**。本ツールは送信自動化に特化した設計であり、CRM/SFAは別ツールで運用している可能性が高い。要件に無いのは意図的な役割分担と推測(未確認、要ユーザー確認)。 |
| 10 | **AIパワーダイヤラー・通話録音・自動文字起こし** | Apollo, Smartlead(SmartDialer), Mazrica(pickupon連携) | 架電チャネルを使う場合の効率化。 | **低**。電話チャネル自体を要件に含んでいないため現時点では不要。 |
| 11 | **商談後のAI要約・BANT自動更新／会話インテリジェンス(コーチング)** | Outreach(Deal/Meeting Prep Agent), HubSpot(Conversation Intelligence), Mazrica AI | 商談後の入力工数削減、営業指導への活用。 | **低**。CRM機能同様、現ツールのスコープ外の可能性が高い。 |
| 12 | **営業ロールプレイングAI(トレーニング)** | Sansan(AI営業ロールプレイング) | 新人研修・スキル底上げ。 | **低**。2-3名の少人数チームでは投資対効果が薄い。 |
| 13 | **MCPサーバー等によるAIエージェント外部連携** | Outreach MCP Server | Claude等の外部AIエージェントから直接操作可能にする先進機能。 | **低(先進的だが時期尚早)**。2026年時点でもOutreach以外はほぼ未実装の新興領域であり、自社ツールの完成度を優先すべき段階。 |

---

## (C) 重点4カテゴリの2026年時点の実装状況

### 1. インテントデータ(相手企業が今検索・閲覧しているかの検知)

| ツール | 実装状況 | データソース/粒度 | 備考 |
|---|---|---|---|
| Apollo.io | ◎ 実装済み | LeadSift提携。パブリックWeb・SNS・イベント・求人・技術導入等を横断、**アカウント(企業)レベルのみ**、週次更新、精度98%(自社発表・独立検証不可) | どの担当者が検討中かまでは特定不可という限界が公式ヘルプ含め複数情報源で指摘されている |
| Outreach | ◎ 実装済み | ZoomInfoとの提携。2026年2月に新規20シグナル追加(資金調達・人事異動・採用動向等) | Outreach自体はデータ保有せず外部提携が基盤 |
| HubSpot | ◎ 実装済み(Breeze Intelligence) | Clearbit系ファーモグラフィック+サードパーティインテント、200M+のプロファイルDB(自社発表) | Prospecting Agentの発動条件として利用 |
| Sales Marker | ◎ 実装済み(コア機能) | 自社発表: 1st(自社サイト訪問)/2nd(提携メディア)/3rd(50億レコード)パーティを統合。国内では希少な専業ポジション | データソースの具体的な内訳(提携メディア名等)は公式ページから確認できず、一部**未確認** |
| Instantly.ai | × 明確に非搭載 | ― | 公式ヘルプ自身が「リードDBに行動・インテントシグナルが無い」旨を明記(SuperSearch機能の説明内) |
| Lemlist / Smartlead | × 非搭載 | ― | 公式サイトに専用インテントデータ機能の記載なし(未確認=無いことの断定ではなく発見できなかった) |
| Sansan | △ 限定的 | 名刺接点情報+企業DBが中心で、行動ベースの「今検討中」シグナルは公式ページ上で確認できず | インテントデータ専業ではなく接点情報インテリジェンスに近い |
| Mazrica, ferret One | × 非搭載 | ― | 確認できず |
| SATORI, List Finder, Kairos3 | △ 1st-partyのみ | 自社サイトへの訪問行動(匿名含む)のみで、外部の検索行動等**3rd-partyデータは扱わない** | 「今この企業が競合を見ている」等の外部シグナルは対象外 |

**総括**: 海外はApollo/Outreach/HubSpotが第三者データ連携で「アカウントレベルの意図検知」を実装済み。国内ではSales Markerが唯一の専業インテントデータSaaSを標榜(自社発表ベース)。他の国内MAツール(SATORI/List Finder/Kairos3)は自社サイト来訪という1st-partyデータに留まり、真の意味での「今どこで何を検索しているか」の3rd-partyインテントとは範囲が異なる点に注意。

### 2. メールウォームアップ自動化

| ツール | 実装状況 | 詳細 |
|---|---|---|
| Instantly.ai | ◎ | 私設ウォームアップネットワーク(自社発表4.2M以上のアカウント規模)。全有料プランに無料付帯 |
| Lemlist | ◎ | Lemwarm(Essential)を全プランに無料バンドル。スマートな送信ロジックで評判保護 |
| Smartlead | ◎ | Ultra Premium Warmupとして無制限提供。開封/クリック/返信/スクロール等の人間らしい動作を自動模倣 |
| Apollo.io | △ 縮小 | 2024年に旧ウォームアップ機能を廃止し、"Inbox Ramp Up"(送信量の段階的引き上げのみ)へ変更。評判構築(開封/返信/迷惑メールからの回収)機能は無いと第三者情報が指摘 |
| Outreach, HubSpot | × 非搭載 | 企業向けCRM統合型セールスエンゲージメントであり、既存の確立された企業ドメインでの利用が前提。ウォームアップ機能自体を提供していない |
| 国内8ツール全て(Sales Marker/Sansan/Mazrica/HubSpot日本版/SATORI/List Finder/ferret One/Kairos3) | × 非搭載 | いずれの公式ページにもウォームアップ機能の記載なし。日本国内の営業DX/MAツールは既存の企業ドメイン・既存顧客接点を前提とした設計が主流で、新規ドメインの評判をゼロから構築する冷メール特化の発想自体が薄いと推測される(**推測であり公式に明言された設計思想ではない**) |

**総括**: ウォームアップ自動化は海外の冷メール専業3社(Instantly/Lemlist/Smartlead)が明確に強い一方、エンタープライズ型(Outreach/HubSpot)や国内ツール全般には存在しない。これは対象読者層の違い(冷メール大量送信 vs 既存関係構築型営業)を反映していると考えられる。

### 3. マルチチャネル(電話・SNS・郵送)

| ツール | 対応チャネル | 実装レベル |
|---|---|---|
| Lemlist | Email/LinkedIn/電話/WhatsApp/SMS | ◎ 自動化フル対応(コネクト申請・音声メッセージ・通話まで) |
| Smartlead | Email/SmartDialer(電話)/Twitter/WhatsApp/SMS | ◎ |
| Apollo.io | Email/電話ダイヤラー(録音・CRM自動連携)/LinkedInタスク | ◎ |
| Outreach | Email/電話(スクリプト生成)/LinkedInメッセージ生成/ボイスメール投下 | ○ (AIエージェントが文面・スクリプトを生成、実行は人手や外部ツール併用) |
| HubSpot | Email/電話(パワーダイヤラー・ボイスメール)/Meeting | ○ |
| Instantly.ai | Emailのみ。LinkedIn等は非搭載、外部ツール(LinkedNav等)との連携が必要 | × ネイティブ非対応 |
| Sales Marker | 電話(インテントコール)/メール/フォーム営業/広告/DM・レター | ◎ 国内では突出して広い(5チャネル) |
| Kairos3 | Email/SMS/Zoom(セミナー) | △ |
| Sansan, Mazrica | ネイティブのマルチチャネル送信機能自体は無し(外部ツール連携が前提) | × |
| SATORI, List Finder, ferret One | Emailと自社サイト行動のみ | × |

**総括**: 海外はLemlist/Smartlead/Apolloが電話・LinkedIn・SMS等をネイティブでフル自動化。国内はSales Markerが例外的に電話・DM・広告まで広げているが、他の国内MA/SFAツールはメール+Web行動が中心でマルチチャネル送信の自動化は薄い。

### 4. AI SDR/自律型エージェント

| ツール | エージェント名・機能 | 自律度 |
|---|---|---|
| Outreach | Revenue Agent(プロスペクティング代行)/Research Agent/Deal Agent/Meeting Prep Agent/Personalization Agent/Omni Agent(自然言語操作)/Agent Studio(ワークフロー構築) | ◎ 海外で最も広範な「名前付きエージェント群」を展開。2026年に複数回のリリースノートで機能強化継続中 |
| HubSpot | Breeze Prospecting Agent(Beta、$1/リード課金)、AI Guided Selling、Smart Deal Progression(Beta) | ○ Betaが多く発展途上 |
| Instantly.ai | AI Sales Agent、AI Reply Agent(返信の自動分類: Interested/Not Interested/Out of Office等) | ○ |
| Apollo.io | Messaging AI(パーソナライズ生成)、Account Tiering、Workflow自動化。「AIエージェント」ブランディングはOutreach程明確ではない | △ |
| Smartlead | SmartAgents("AI駆動のGTMワークフォース"と自称)、SmartAssistant | △ (詳細な自律動作の説明は限定的、自社発表ベース) |
| Lemlist | 明確な"エージェント"ブランディングは無し。シーケンス自動化が中心 | △ |
| Sales Marker | AI Appointment(有望企業自動提案)/AI Account Plan/AI Meeting。「自立型AI」を前面に打ち出す | ○ 国内では最もエージェント色が強い |
| Sansan | AI企業リストメーカー(自然言語→リスト自動生成)、AI People Profile、Visit Route Maker | △ プロスペクティングの一部自動化のみで、送信・商談化までの自律実行はしない |
| Mazrica | AI insight(案件情報のBANT自動更新提案) | △ 提案止まりで実行は人手 |
| SATORI, List Finder, ferret One, Kairos3 | ルールベースのシナリオ自動化のみ。自律型AIエージェントの搭載は確認できず | × |

**総括**: 2026年時点で「AI SDR/自律型エージェント」を最も体系的に展開しているのはOutreach(7種の名前付きエージェント)。国内ではSales Markerが唯一「自立型AI」を明確に標榜。他の国内ツールはAIをレコメンド・要約・生成補助として使う段階に留まり、送信〜商談化までを自律実行するレベルには達していない(2026年7月時点、公式サイト記載ベース)。

---

## 主要な出典URL一覧
- [Instantly.ai](https://instantly.ai/)
- [Lemlist Multichannel Prospecting](https://www.lemlist.com/multichannel-prospecting) / [Lemwarm解説](http://help.lemlist.com/en/articles/9935910-understanding-lemlist-and-lemwarm-bundles)
- [Apollo Buying Intent](https://www.apollo.io/product/buying-intent) / [Apollo Engage](https://www.apollo.io/product/engage) / [Apollo Email Deliverability](https://www.apollo.io/email-deliverability)
- [Smartlead.ai](https://www.smartlead.ai/)
- [Outreach AI Agents](https://www.outreach.ai/ai-agents) / [Outreach Release Notes Feb 2026](https://support.outreach.io/support/solutions/articles/159000425164-outreach-product-release-notes-february-2026)
- [HubSpot Sales Hub](https://www.hubspot.com/products/sales) / [HubSpot AI Prospecting Agent](https://www.hubspot.com/products/sales/ai-prospecting-agent)
- [Sales Marker公式](https://sales-marker.jp/) / [Sales Markerインテントデータ機能](https://sales-marker.jp/function/intent-data/)
- [Sansan機能ページ](https://jp.sansan.com/function/meishi/) / [Sansan AI企業リストメーカーPR](https://jp.corp-sansan.com/news/2026/0622.html) / [Sansan Labs実装PR](https://jp.corp-sansan.com/news/2025/0718.html)
- [Mazrica Sales製品ページ](https://mazrica.com/product/) / [Mazrica AI更新提案機能](https://saleszine.jp/news/detail/8334)
- [SATORI機能一覧](https://satori.marketing/function/)
- [List Finder公式](https://promote.list-finder.jp/)
- [ferret Oneツール](https://ferret-one.com/tools)
- [Kairos3 Marketing機能案内](https://www.kairosmarketing.net/marketing-automation/features)

## 未確認事項
- HubSpot日本版とグローバル版の機能差分の有無(公式に明記した資料は未発見)
- Sales Markerのインテントデータの具体的な提携メディア名・データ精度の第三者検証
- Apollo「Inbox Ramp Up」が旧ウォームアップ機能と比べどの程度評判構築効果を持つか(第三者ブログの指摘のみで公式の明確な機能比較表は未発見)
- Smartlead SmartAgentsの自律実行範囲の具体的な技術詳細(自社サイトの記述が抽象的)

---

# 独立検証結果

# 独立検証レポート: 「競合ツール機能比較」レポートの意思決定関連主張の再検証

調査方法: 各主張について公式サイト・公式ヘルプセンター・公式リリースノートに直接アクセスし、元レポートの引用に頼らず独立に確認した。数値はすべてベンダー自社発表であり独立検証はできない(以下、該当箇所に明記)。

---

## 主張1: Apollo.io Buying Intentは「1,600以上のインテントトピック、週次更新、精度98%」

**判定: 確認済み**

**根拠URL**: https://www.apollo.io/product/buying-intent (2026-07-18 公式ページ直接確認)

公式ページに「1600+ intent topics」「Refreshes weekly」「98% accuracy」「Multi-source intent with accuracy guaranteed」の記載を直接確認した。元レポートの記述と一致する。

ただし精度98%・件数はすべて**ベンダー(Apollo/LeadSift)自社発表であり独立検証不可**。元レポートもこの点を明記済みで、この注記は妥当。

---

## 主張2: Apolloのメールウォームアップは「2024年に旧機能廃止→現行のInbox Ramp Upは送信量の段階引き上げのみで評判構築機能は無い」

**判定: 誤り(2026年7月時点では古い/不完全な情報)**

**根拠URL**: https://www.apollo.io/email-deliverability (2026-07-18 公式ページ直接確認)

2024年の旧ウォームアップ機能廃止自体は複数の第三者情報で裏付けられ(mailreach.co、inboxally.com等)、また2025年にApolloがWarmbox.ai(サードパーティ)経由でウォームアップを再展開したことも複数の第三者情報(miniloop.ai等)で確認できた。

しかし**Apollo公式の現行マーケティングページ(apollo.io/email-deliverability)は「built‑in warm‑up engine that works automatically」を明記し、PROTECT段階で「Daily send/receive activity that simulates replies」「Builds credibility with inbox providers over time」という評判構築機能を謳い、「Do I need a separate warm‑up tool? No.」と明言している**。これは元レポートが引用した「評判構築機能は無い」という第三者情報の主張と直接矛盾する。

元レポート自身「第三者情報が指摘」と出典を明示しており誠実だが、2026年7月時点のスナップショットとして提示する以上、Apollo公式の現行訴求(2025年のWarmbox連携による再展開後の状態)を反映していない点は不完全であり、(C)節の評価表で Apollo を「△ 縮小」と単純化した判定は要修正。

**修正文案**: 「Apolloは2024年に旧ウォームアップ機能を廃止したが、2025年にサードパーティ(Warmbox.ai)との連携により有料プランでウォームアップを再展開した(1メールボックス無料、追加は月200クレジット)。Apollo公式サイト(apollo.io/email-deliverability)は現在、返信シミュレーション等による評判構築機能を含む「built-in warm-up engine」を謳っており、2026年7月時点で単純な「評判構築機能なし」という評価は公式の現行訴求と矛盾する。実際の効果(内製かサードパーティ依存か)は未確認。」

---

## 主張3: Instantly.aiのウォームアップネットワークは「自社発表4.2M以上のアカウント規模」

**判定: 誤り**

**根拠URL**: https://instantly.ai/email-warmup (2026-07-18 公式ページ直接確認)、https://help.instantly.ai/en/articles/5975329-how-warm-up-works-and-why-it-s-important(公式ヘルプセンター)、https://instantly.ai/(公式トップページ)

Instantly.ai公式サイトを3箇所(トップページ、/email-warmup機能ページ、公式ヘルプセンターのウォームアップ解説記事)直接確認したが、**「4.2 million」あるいは「4.2M」という数値はいずれにも存在しない**。唯一具体的な数値が記載されていた公式ページ(instantly.ai/email-warmup)には「Instantly has over 1,000,000+ real email accounts in its deliverability pool and that number is constantly growing」と明記されており、公式発表の現行数値は**100万以上(1M+)**である。

「4.2M」という数値は、mailreach.co・warmforge.ai・outreachark.com等の**第三者(比較サイト・SEOブログ)記事にのみ繰り返し登場**しており、Instantly公式の一次情報としては裏付けが取れなかった。元レポートは出典を「instantly.ai」の公式トップページとしているが、そのページ自体にこの数値の記載はない。

**修正文案**: 「Instantly.aiは公式サイト(instantly.ai/email-warmup)で「1,000,000+ real email accounts」のウォームアッププールを自社発表している(ベンダー自社データ・独立検証不可)。「4.2M以上」という数値は第三者比較サイトに広く流布しているが、Instantly公式ページ(トップページ・機能ページ・ヘルプセンター)には出典を確認できず、現行の公式発表値ではない可能性が高い。」

---

## 主張4: Outreachは「ZoomInfo連携によるインテントシグナルを2026年2月に新規20シグナル追加」

**判定: 誤り(時期の誤帰属)**

**根拠URL**: https://support.outreach.io/hc/en-us/articles/45812324566683-Outreach-Product-Release-Notes-February-2026 (2026年2月リリースノート公式ページ)、https://support.outreach.io/support/solutions/articles/159000431245-configuring-and-using-smart-data-enrichment-signals (公式サポート記事)

2026年2月のOutreach公式リリースノートを直接確認したところ、ZoomInfo連携拡張として追加されたのは「Website visit signals」(訪問強度High/Medium、訪問URL、シグナル日付)のみであり、**「20」という具体的なシグナル数の記載は無い**。

一方、「Outreach supports 20 new signals sourced from ZoomInfo Copilot(拡大イベント・幹部交代・購買意図急上昇・競合動向等)」という記載は、**別の公式サポート記事に存在し、これは2026年5月リリース(2026-05-14〜06-18ロールアウト)の内容である**。ZoomInfo Copilot契約が別途必要な機能であり、2月のWebsite visit signalsとは異なる時期・異なる仕組みの追加である。

元レポートは「2026年2月に新規20シグナル追加」としているが、正しくは「20シグナル追加」は**2026年5月**の出来事であり、2月分は件数不明の「Webサイト訪問シグナル」拡張にとどまる。日付の取り違えによる誤り。

**修正文案**: 「Outreachは2026年2月にZoomInfo連携でWebサイト訪問シグナル(強度High/Medium等)を追加。「ZoomInfo Copilotから提供される20の新規シグナル(異常な採用活動・CXO交代・購買意図急上昇・M&A・新製品発表等)」の追加は2026年5月リリース(ZoomInfo Copilot契約が別途必要)であり、2月分とは時期が異なる。」

---

## 主張5: Sales Markerのインテントデータは「520万社超の法人DB、日次50億レコード規模」

**判定: 確認済み**

**根拠URL**: https://sales-marker.jp/function/database/ (2026-07-18 公式ページ直接確認)

公式ページに「520万社以上の法人データ」「570万件の人物データ」「160万件の部署データ」「50億レコード/日のインテントデータ」の記載を直接確認した。元レポートの「520万社超」「日次50億レコード規模」という記述と一致する。

ただしこれらは**すべてSales Marker自社発表であり独立検証不可**(元レポートもこの点は概ね注記済み)。データソースの内訳(提携メディア名等)が非公開である点も元レポートの指摘通り確認できず、「未確認」のままとするのは妥当。

---

## 総括

| # | 主張 | 判定 |
|---|------|------|
| 1 | Apollo Buying Intent (1,600+/週次/98%) | 確認済み |
| 2 | Apolloウォームアップ「評判構築機能なし」 | 誤り(2025年Warmbox連携再展開後の公式現行訴求と矛盾) |
| 3 | Instantly「4.2M+アカウント」 | 誤り(公式現行値は1,000,000+) |
| 4 | Outreach「2026年2月に20シグナル追加」 | 誤り(20シグナルは2026年5月リリース、2月分は件数不明の別機能) |
| 5 | Sales Marker「520万社超・日次50億レコード」 | 確認済み |

意思決定への影響: 主張3(Instantly)と主張4(Outreach)は具体的な検証可能事実として一次情報と食い違っており、レポート内の(C)節「メールウォームアップ自動化」表および「AI SDR/自律型エージェント」節の記述根拠を弱める。主張2はレポート自身が「第三者情報」と留保していたものの、独立確認の結果Apollo公式の現行訴求と矛盾するため、Apolloのウォームアップを「劣る」と評価する判断根拠としては現時点で採用すべきでない。